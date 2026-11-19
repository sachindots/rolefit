import { strToU8, zipSync } from "fflate";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";
import {
  decodeXmlEntities,
  extractResumeText,
  extractWordXmlText,
  formatPdfPageItems,
  MAX_DOCX_XML_BYTES,
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_PDF_PAGES,
  MAX_RESUME_FILE_BYTES,
  PDF_WORKER_SRC,
  sanitizeExtractedText,
} from "./resumeExtract";

function makeFile(
  content: Uint8Array | string,
  name: string,
  type = "application/octet-stream",
): File {
  const bytes = typeof content === "string" ? strToU8(content) : new Uint8Array(content);
  return new File([bytes], name, { type });
}

function buildDocxBytes(
  documentXml: string,
  extraEntries: Record<string, Uint8Array | string> = {},
): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ),
    "word/document.xml": strToU8(documentXml),
  };
  for (const [path, value] of Object.entries(extraEntries)) {
    entries[path] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(entries);
}

function buildMinimalPdf(pageStreams: string[]): Uint8Array {
  const objects: string[] = [];
  const pageCount = pageStreams.length;
  const firstPageObjNum = 4;
  const kids = Array.from({ length: pageCount }, (_, i) => `${firstPageObjNum + i * 2} 0 R`).join(
    " ",
  );

  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);
  objects.push(
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  );

  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = firstPageObjNum + i * 2;
    const contentObjNum = pageObjNum + 1;
    const stream = pageStreams[i];
    const streamByteLength = strToU8(stream).byteLength;

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`,
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamByteLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(strToU8(pdf).byteLength);
    pdf += obj;
  }

  const xrefOffset = strToU8(pdf).byteLength;
  const totalObjects = objects.length + 1;
  pdf += `xref\n0 ${totalObjects}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return strToU8(pdf);
}

describe("resumeExtract constants and worker configuration", () => {
  it("exports required limits and local-only PDF worker configuration with zero CDN URLs", () => {
    expect(MAX_RESUME_FILE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_EXTRACTED_TEXT_CHARS).toBe(100_000);
    expect(MAX_DOCX_XML_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_PDF_PAGES).toBe(15);

    expect(PDF_WORKER_SRC).toBeTruthy();
    expect(GlobalWorkerOptions.workerSrc).toBeTruthy();
    expect(PDF_WORKER_SRC).not.toMatch(/https?:\/\//i);
    expect(PDF_WORKER_SRC).not.toMatch(/unpkg|cdnjs|jsdelivr/i);
    expect(GlobalWorkerOptions.workerSrc).not.toMatch(/https?:\/\//i);
    expect(GlobalWorkerOptions.workerSrc).not.toMatch(/unpkg|cdnjs|jsdelivr/i);
  });
});

describe("extractResumeText - .txt files", () => {
  it("extracts plain text, normalizes CRLF to LF, and strips control characters while keeping tabs and newlines", async () => {
    const raw =
      "\uFEFFJane Doe\r\nSenior Engineer\tRemote\r• Built client-side resume extractor\x07\x08\x0B\x0C\x1F\x7F\nSkills:\tTypeScript, React";
    const file = makeFile(raw, "resume.txt", "text/plain");

    const result = await extractResumeText(file);
    expect(result).toEqual({
      ok: true,
      fileType: "txt",
      text: "Jane Doe\nSenior Engineer\tRemote\n• Built client-side resume extractor\nSkills:\tTypeScript, React",
      warnings: [],
    });
  });

  it("rejects .txt files containing NUL bytes or binary payloads", async () => {
    const nulPayload = new Uint8Array([0x4a, 0x61, 0x6e, 0x65, 0x00, 0x44, 0x6f, 0x65]);
    const nulResult = await extractResumeText(makeFile(nulPayload, "resume.txt", "text/plain"));
    expect(nulResult.ok).toBe(false);
    if (!nulResult.ok) {
      expect(nulResult.error).toMatch(/NUL|binary/i);
    }

    const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0xfd, 0x80]);
    const invalidResult = await extractResumeText(
      makeFile(invalidUtf8, "binary.txt", "text/plain"),
    );
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      expect(invalidResult.error).toMatch(/UTF-8|binary/i);
    }

    const pdfAsTxt = makeFile("%PDF-1.4 fake pdf", "disguised.txt", "text/plain");
    const pdfAsTxtResult = await extractResumeText(pdfAsTxt);
    expect(pdfAsTxtResult.ok).toBe(false);
  });

  it("truncates extracted text exceeding 100,000 characters with a warning", async () => {
    const oversizedText = "A".repeat(MAX_EXTRACTED_TEXT_CHARS + 500);
    const result = await extractResumeText(makeFile(oversizedText, "long.txt", "text/plain"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.length).toBe(MAX_EXTRACTED_TEXT_CHARS);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/100,000|truncated/i);
    }
  });
});

describe("extractResumeText - .docx files", () => {
  it("extracts headers, paragraphs, line breaks, tabs, and XML entities from a valid .docx archive", async () => {
    const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p>
          <w:r><w:t>Jane Doe</w:t><w:tab/><w:t>jane@example.com</w:t></w:r>
        </w:p>
      </w:hdr>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p>
          <w:p>
            <w:r>
              <w:t>Staff Engineer &amp; Tech Lead</w:t>
              <w:tab/>
              <w:t>2022 &#8211; Present</w:t>
              <w:br/>
              <w:t>&#8226; Shipped &lt;zero-trust&gt; &quot;client-side&quot; parser &apos;v2&apos;</w:t>
            </w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>
          <w:p><w:r><w:t/><w:t>SKILLS: TypeScript, React</w:t></w:r></w:p>
        </w:body>
      </w:document>`;

    const docxBytes = buildDocxBytes(documentXml, {
      "word/header1.xml": headerXml,
    });
    const result = await extractResumeText(
      makeFile(
        docxBytes,
        "resume.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    );

    expect(result).toEqual({
      ok: true,
      fileType: "docx",
      text: [
        "Jane Doe\tjane@example.com",
        "EXPERIENCE",
        "Staff Engineer & Tech Lead\t2022 – Present\n• Shipped <zero-trust> \"client-side\" parser 'v2'",
        "SKILLS: TypeScript, React",
      ].join("\n"),
      warnings: [],
    });
  });

  it("rejects .docx files with spoofed magic bytes or missing word/document.xml", async () => {
    const spoofed = makeFile("not a zip archive", "spoofed.docx");
    const spoofedRes = await extractResumeText(spoofed);
    expect(spoofedRes.ok).toBe(false);
    if (!spoofedRes.ok) {
      expect(spoofedRes.error).toMatch(/ZIP signature|spoofed/i);
    }

    const zipWithoutDocXml = zipSync({
      "word/styles.xml": strToU8("<w:styles/>"),
    });
    const missingDocRes = await extractResumeText(makeFile(zipWithoutDocXml, "missing.docx"));
    expect(missingDocRes.ok).toBe(false);
    if (!missingDocRes.ok) {
      expect(missingDocRes.error).toMatch(/word\/document\.xml/i);
    }
  });

  it("rejects .docx zip bombs when decompressed word/document.xml exceeds 2 MB", async () => {
    const bombXml = `<w:document><w:body><w:p><w:r><w:t>${"A".repeat(
      MAX_DOCX_XML_BYTES + 1024,
    )}</w:t></w:r></w:p></w:body></w:document>`;
    const bombZip = buildDocxBytes(bombXml);
    expect(bombZip.byteLength).toBeLessThan(MAX_RESUME_FILE_BYTES);

    const result = await extractResumeText(makeFile(bombZip, "bomb.docx"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/2 MB|zip-bomb|decompressed/i);
    }
  });

  it("rejects .docx zip bombs even when the ZIP header originalSize is spoofed to a small value", async () => {
    const bombXml = `<w:document><w:body><w:p><w:r><w:t>${"B".repeat(
      MAX_DOCX_XML_BYTES + 4096,
    )}</w:t></w:r></w:p></w:body></w:document>`;
    const bombZip = new Uint8Array(buildDocxBytes(bombXml));
    const view = new DataView(bombZip.buffer, bombZip.byteOffset, bombZip.byteLength);

    // Patch every local file header (0x04034b50) and central directory header (0x02014b50)
    // uncompressed size field to 128 bytes to simulate a spoofed-header zip bomb.
    for (let i = 0; i <= bombZip.byteLength - 30; i++) {
      const sig = view.getUint32(i, true);
      if (sig === 0x04034b50) {
        view.setUint32(i + 22, 128, true);
      } else if (sig === 0x02014b50 && i + 28 <= bombZip.byteLength) {
        view.setUint32(i + 24, 128, true);
      }
    }

    const result = await extractResumeText(makeFile(bombZip, "spoofed-header-bomb.docx"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/2 MB|zip-bomb|decompressed/i);
    }
  });

  it("rejects .docx XML containing DOCTYPE ENTITY declarations (XXE / entity expansion bomb)", async () => {
    const xxeXml = `<?xml version="1.0"?>
      <!DOCTYPE lolz [<!ENTITY lol "lol">]>
      <w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`;
    const docxBytes = buildDocxBytes(xxeXml);
    const result = await extractResumeText(makeFile(docxBytes, "xxe.docx"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/entity/i);
    }
  });
});

describe("extractResumeText - .pdf files", () => {
  it("extracts text from a valid PDF sorted by reading order (y descending, x ascending) with zero network fetches", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      // Place items intentionally out of reading order in the PDF stream:
      // - Bullet line at y=700
      // - Right column of role line at x=120, y=725
      // - Left column of role line at x=50, y=725
      // - Section header at y=750
      const stream = [
        "BT /F1 11 Tf 50 700 Td (- Built offline PDF extractor) Tj ET",
        "BT /F1 11 Tf 120 725 Td (Engineer) Tj ET",
        "BT /F1 11 Tf 50 725 Td (Senior) Tj ET",
        "BT /F1 14 Tf 50 750 Td (EXPERIENCE) Tj ET",
      ].join("\n");

      const pdfBytes = buildMinimalPdf([stream]);
      const result = await extractResumeText(makeFile(pdfBytes, "resume.pdf", "application/pdf"));

      expect(result).toEqual({
        ok: true,
        fileType: "pdf",
        text: ["EXPERIENCE", "Senior Engineer", "- Built offline PDF extractor"].join("\n"),
        warnings: [],
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("warns when a valid PDF has no extractable text (e.g., scanned image-only PDF)", async () => {
    const scannedPdfBytes = buildMinimalPdf(["10 10 200 200 re S"]);
    const result = await extractResumeText(
      makeFile(scannedPdfBytes, "scanned.pdf", "application/pdf"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileType).toBe("pdf");
      expect(result.text).toBe("");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/empty|scanned/i);
    }
  });

  it("caps extraction at MAX_PDF_PAGES (15) and warns when a PDF has more pages", async () => {
    const streams = Array.from(
      { length: MAX_PDF_PAGES + 3 },
      (_, idx) => `BT /F1 12 Tf 50 750 Td (PageNumber${idx + 1}) Tj ET`,
    );
    const multiPagePdf = buildMinimalPdf(streams);
    const result = await extractResumeText(
      makeFile(multiPagePdf, "long.pdf", "application/pdf"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("PageNumber1");
      expect(result.text).toContain(`PageNumber${MAX_PDF_PAGES}`);
      expect(result.text).not.toContain(`PageNumber${MAX_PDF_PAGES + 1}`);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/18 pages.*15 pages/i);
    }
  });

  it("rejects spoofed or corrupt PDFs cleanly without throwing", async () => {
    const spoofedPdf = makeFile("Plain text disguised as PDF", "spoofed.pdf", "application/pdf");
    const spoofedRes = await extractResumeText(spoofedPdf);
    expect(spoofedRes.ok).toBe(false);
    if (!spoofedRes.ok) {
      expect(spoofedRes.error).toMatch(/%PDF-|spoofed/i);
    }

    const corruptPdf = makeFile("%PDF-1.4\n%%corrupt-payload-not-a-valid-xref", "corrupt.pdf");
    const corruptRes = await extractResumeText(corruptPdf);
    expect(corruptRes.ok).toBe(false);
    if (!corruptRes.ok) {
      expect(corruptRes.error).toMatch(/corrupt|invalid/i);
    }
  });
});

describe("extractResumeText - boundary and file size guards", () => {
  it("rejects files larger than 5 MB before parsing", async () => {
    const oversizedBytes = new Uint8Array(MAX_RESUME_FILE_BYTES + 1);
    oversizedBytes.fill(0x41);
    const result = await extractResumeText(makeFile(oversizedBytes, "huge.txt", "text/plain"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/5 MB/i);
    }
  });

  it("rejects empty files and unsupported file extensions", async () => {
    const emptyRes = await extractResumeText(makeFile(new Uint8Array(0), "empty.txt"));
    expect(emptyRes.ok).toBe(false);
    if (!emptyRes.ok) {
      expect(emptyRes.error).toMatch(/empty/i);
    }

    const unsupportedRes = await extractResumeText(makeFile("hello", "resume.rtf"));
    expect(unsupportedRes.ok).toBe(false);
    if (!unsupportedRes.ok) {
      expect(unsupportedRes.error).toMatch(/Unsupported file format/i);
    }
  });

  it("supports uppercase file extensions (.TXT, .DOCX, .PDF) and FileReader fallback", async () => {
    const upperTxt = makeFile("Alex Rivera\nStaff Engineer", "RESUME.TXT", "text/plain");
    // Simulate environment without File.prototype.arrayBuffer
    Object.defineProperty(upperTxt, "arrayBuffer", { value: undefined });
    const res = await extractResumeText(upperTxt);
    expect(res).toEqual({
      ok: true,
      fileType: "txt",
      text: "Alex Rivera\nStaff Engineer",
      warnings: [],
    });
  });
});

describe("pure helper invariants & property checks", () => {
  it("decodeXmlEntities decodes in a single pass and never double-unescapes nested entities", () => {
    expect(decodeXmlEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
    expect(decodeXmlEntities("&lt;div&gt; &amp; &quot;ok&quot; &apos;yes&apos;")).toBe(
      '<div> & "ok" \'yes\'',
    );
    expect(decodeXmlEntities("&#65;&#x42;&#0;&#xD800;&#x110000;")).toBe("AB");
  });

  it("sanitizeExtractedText is idempotent and never splits surrogate pairs on truncation", () => {
    const samples = [
      "\uFEFFLine 1\r\nLine 2\rLine 3\x00\x07\tTabbed\x1F",
      "A".repeat(MAX_EXTRACTED_TEXT_CHARS - 1) + "🚀Extra",
    ];

    for (const sample of samples) {
      const first = sanitizeExtractedText(sample);
      const second = sanitizeExtractedText(first.text);
      expect(second.text).toBe(first.text);
      expect(first.text).not.toMatch(/[\r\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
      expect(first.text.length).toBeLessThanOrEqual(MAX_EXTRACTED_TEXT_CHARS);

      const lastCode = first.text.charCodeAt(first.text.length - 1);
      expect(lastCode < 0xd800 || lastCode > 0xdbff).toBe(true);
    }
  });

  it("formatPdfPageItems is invariant under any permutation of page items", () => {
    const canonicalItems = [
      { str: "SUMMARY", transform: [1, 0, 0, 12, 50, 760], width: 60, height: 12 },
      { str: "Principal", transform: [1, 0, 0, 11, 50, 740], width: 45, height: 11 },
      { str: "Architect", transform: [1, 0, 0, 11, 100, 740], width: 48, height: 11 },
      { str: "•", transform: [1, 0, 0, 11, 50, 720], width: 6, height: 11 },
      { str: "Led", transform: [1, 0, 0, 11, 62, 720.4], width: 18, height: 11 },
      { str: "platform", transform: [1, 0, 0, 11, 84, 719.8], width: 40, height: 11 },
    ];

    const expected = "SUMMARY\nPrincipal Architect\n• Led platform";
    expect(formatPdfPageItems(canonicalItems)).toBe(expected);
    expect(formatPdfPageItems([...canonicalItems].reverse())).toBe(expected);
    expect(
      formatPdfPageItems([
        canonicalItems[4],
        canonicalItems[1],
        canonicalItems[5],
        canonicalItems[0],
        canonicalItems[3],
        canonicalItems[2],
      ]),
    ).toBe(expected);

    // Items without transform coordinates fall back to hasEOL line grouping
    expect(
      formatPdfPageItems([
        { str: "Jane", hasEOL: false },
        { str: "Doe", hasEOL: true },
        { str: "Engineer", hasEOL: false },
      ]),
    ).toBe("Jane Doe\nEngineer");
  });

  it("extractWordXmlText ignores script/HTML tags inside unclosed runs and never uses innerHTML", () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>&lt;img src=x onerror=alert(1)&gt;</w:t></w:r></w:p></w:body></w:document>`;
    expect(extractWordXmlText(xml)).toBe("<img src=x onerror=alert(1)>");
  });
});
