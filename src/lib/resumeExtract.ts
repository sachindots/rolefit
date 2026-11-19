import { strFromU8, Unzip, UnzipInflate, unzipSync } from "fflate";
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

export const MAX_RESUME_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 100_000;
export const MAX_DOCX_XML_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_PAGES = 15;
const MAX_DOCX_ZIP_ENTRIES = 1_000;

export const PDF_WORKER_SRC: string = new URL(
  "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).pathname;

const isNodeWithoutWebWorker =
  typeof process !== "undefined" &&
  typeof process.versions?.node === "string" &&
  typeof Worker === "undefined";

GlobalWorkerOptions.workerSrc = isNodeWithoutWebWorker
  ? "pdfjs-dist/legacy/build/pdf.worker.min.mjs"
  : PDF_WORKER_SRC;

export type ResumeFileType = "pdf" | "docx" | "txt";

export type ExtractResult =
  | {
      ok: true;
      text: string;
      fileType: ResumeFileType;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
    };

class RejectError extends Error {}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const; // PK\x03\x04
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;
const JPG_MAGIC = [0xff, 0xd8, 0xff] as const;
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38] as const;
const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46] as const;

const CONTROL_CHARS_EXCEPT_TAB_NL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const DOCX_HEADER_XML_RE = /^word\/header\d*\.xml$/i;
const DOCX_VALID_ROOT_RE = /<(?:w:)?(?:document|hdr|body|p|t)\b/i;
const DOCX_TOKEN_RE =
  /<(?:w:)?t(?=[>\s])(?![^>]*\/>)[^>]*>([\s\S]*?)<\/(?:w:)?t>|<(?:w:)?(br|cr)(?=[>\s/])[^>]*\/?>|<(?:w:)?(tab|ptab)(?=[>\s/])[^>]*\/?>|<\/?(?:w:)?(p)(?=[>\s/])[^>]*\/?>/gi;
const XML_ENTITY_RE = /&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#x([0-9a-fA-F]{1,6}));/g;

function startsWithBytes(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.byteLength < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

function detectFileType(fileName: string): ResumeFileType | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new RejectError("Could not read file bytes."));
      }
    };
    reader.onerror = () => reject(new RejectError("Could not read file bytes."));
    reader.readAsArrayBuffer(file);
  });
}

export function decodeXmlEntities(input: string): string {
  return input.replace(
    XML_ENTITY_RE,
    (full, named?: string, dec?: string, hex?: string): string => {
      if (named) {
        switch (named) {
          case "amp":
            return "&";
          case "lt":
            return "<";
          case "gt":
            return ">";
          case "quot":
            return '"';
          case "apos":
            return "'";
          default:
            return full;
        }
      }
      const codePoint = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? "", 16);
      if (
        !Number.isFinite(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return "";
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

export function sanitizeExtractedText(
  raw: string,
  warnings: string[] = [],
): { text: string; warnings: string[] } {
  let text = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_EXCEPT_TAB_NL, "");

  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    let cutIndex = MAX_EXTRACTED_TEXT_CHARS;
    const lastCode = text.charCodeAt(cutIndex - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      cutIndex -= 1;
    }
    text = text.slice(0, cutIndex);
    warnings.push(
      `Extracted text exceeded 100,000 characters (${MAX_EXTRACTED_TEXT_CHARS}) and was truncated.`,
    );
  }

  return { text, warnings };
}

export function extractWordXmlText(xml: string): string {
  if (/<!ENTITY\b/i.test(xml)) {
    throw new RejectError("DOCX XML contains forbidden XML entity declarations.");
  }
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  if (!DOCX_VALID_ROOT_RE.test(withoutComments)) {
    throw new RejectError("Invalid or corrupt DOCX XML content.");
  }

  const paragraphs: string[] = [];
  let current = "";

  const flushParagraph = (): void => {
    const cleaned = current
      .split("\n")
      .map((line) => line.replace(/ +$/g, ""))
      .join("\n")
      .trim();
    if (cleaned !== "") {
      paragraphs.push(cleaned);
    }
    current = "";
  };

  DOCX_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DOCX_TOKEN_RE.exec(withoutComments)) !== null) {
    const [, runText, lineBreak, tab, paragraph] = match;
    if (runText !== undefined) {
      const strippedTags = runText.replace(/<[^>]*>/g, "");
      current += decodeXmlEntities(strippedTags);
    } else if (lineBreak !== undefined) {
      current += "\n";
    } else if (tab !== undefined) {
      current += "\t";
    } else if (paragraph !== undefined) {
      flushParagraph();
    }
  }
  flushParagraph();

  return paragraphs.join("\n");
}

function isTargetDocxXmlPath(name: string): boolean {
  return name === "word/document.xml" || DOCX_HEADER_XML_RE.test(name);
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function extractDocxTextFromBytes(bytes: Uint8Array): { text: string; warnings: string[] } {
  if (!startsWithBytes(bytes, ZIP_MAGIC)) {
    throw new RejectError(
      "Invalid DOCX file: missing ZIP signature (file may be corrupt or have a spoofed extension).",
    );
  }

  let hasCentralDocumentXml = false;
  let declaredXmlBytes = 0;
  let entryCount = 0;

  try {
    unzipSync(bytes, {
      filter(info) {
        entryCount += 1;
        if (entryCount > MAX_DOCX_ZIP_ENTRIES) {
          throw new RejectError("DOCX archive contains too many entries.");
        }
        if (info.name === "word/document.xml") {
          hasCentralDocumentXml = true;
        }
        if (isTargetDocxXmlPath(info.name)) {
          if (info.originalSize > MAX_DOCX_XML_BYTES) {
            throw new RejectError(
              "DOCX XML exceeds the 2 MB decompressed size limit (zip-bomb protection).",
            );
          }
          declaredXmlBytes += info.originalSize;
          if (declaredXmlBytes > MAX_DOCX_XML_BYTES) {
            throw new RejectError(
              "DOCX XML exceeds the 2 MB decompressed size limit (zip-bomb protection).",
            );
          }
        }
        return false;
      },
    });
  } catch (err) {
    if (err instanceof RejectError) throw err;
    throw new RejectError("Invalid or corrupt DOCX archive.");
  }

  if (!hasCentralDocumentXml) {
    throw new RejectError("Invalid DOCX file: archive does not contain word/document.xml.");
  }

  const collected = new Map<string, { chunks: Uint8Array[]; size: number }>();
  let totalDecompressedXmlBytes = 0;

  const unzipper = new Unzip((file) => {
    if (!isTargetDocxXmlPath(file.name)) return;
    if (file.originalSize !== undefined && file.originalSize > MAX_DOCX_XML_BYTES) {
      throw new RejectError(
        "DOCX XML exceeds the 2 MB decompressed size limit (zip-bomb protection).",
      );
    }

    const entry = { chunks: [] as Uint8Array[], size: 0 };
    collected.set(file.name, entry);

    file.ondata = (err, chunk) => {
      if (err) {
        if (err instanceof RejectError) throw err;
        throw new RejectError("Invalid or corrupt DOCX archive entry.");
      }
      if (!chunk) return;
      totalDecompressedXmlBytes += chunk.byteLength;
      if (totalDecompressedXmlBytes > MAX_DOCX_XML_BYTES) {
        throw new RejectError(
          "DOCX XML exceeds the 2 MB decompressed size limit (zip-bomb protection).",
        );
      }
      if (chunk.byteLength > 0) {
        entry.chunks.push(chunk);
        entry.size += chunk.byteLength;
      }
    };
    file.start();
  });
  unzipper.register(UnzipInflate);

  const CHUNK_SIZE = 2048;
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_SIZE) {
      const end = Math.min(offset + CHUNK_SIZE, bytes.byteLength);
      unzipper.push(bytes.subarray(offset, end), end === bytes.byteLength);
    }
  } catch (err) {
    if (err instanceof RejectError) throw err;
    throw new RejectError("Invalid or corrupt DOCX archive.");
  }

  const docEntry = collected.get("word/document.xml");
  if (!docEntry) {
    throw new RejectError("Invalid DOCX file: archive does not contain word/document.xml.");
  }

  const headerNames = [...collected.keys()]
    .filter((name) => DOCX_HEADER_XML_RE.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const sections: string[] = [];
  for (const headerName of headerNames) {
    const headerEntry = collected.get(headerName);
    if (!headerEntry || headerEntry.size === 0) continue;
    const headerXml = strFromU8(concatChunks(headerEntry.chunks, headerEntry.size));
    if (DOCX_VALID_ROOT_RE.test(headerXml)) {
      const headerText = extractWordXmlText(headerXml);
      if (headerText !== "") {
        sections.push(headerText);
      }
    }
  }

  const documentXml = strFromU8(concatChunks(docEntry.chunks, docEntry.size));
  const documentText = extractWordXmlText(documentXml);
  if (documentText !== "") {
    sections.push(documentText);
  }

  const warnings: string[] = [];
  const combined = sections.join("\n");
  return sanitizeExtractedText(combined, warnings);
}

interface PositionedPdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
  hasCoords: boolean;
  index: number;
}

export function formatPdfPageItems(rawItems: ReadonlyArray<unknown>): string {
  const items: PositionedPdfItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    if (typeof raw !== "object" || raw === null || !("str" in raw)) continue;
    const item = raw as {
      str?: unknown;
      transform?: unknown;
      width?: unknown;
      height?: unknown;
      hasEOL?: unknown;
    };
    if (typeof item.str !== "string") continue;

    const transform = Array.isArray(item.transform) ? item.transform : null;
    const hasCoords =
      transform !== null &&
      transform.length >= 6 &&
      typeof transform[4] === "number" &&
      Number.isFinite(transform[4]) &&
      typeof transform[5] === "number" &&
      Number.isFinite(transform[5]);

    const x = hasCoords ? (transform[4] as number) : 0;
    const y = hasCoords ? (transform[5] as number) : 0;
    const width =
      typeof item.width === "number" && Number.isFinite(item.width) && item.width >= 0
        ? item.width
        : 0;
    const scaleY =
      transform !== null &&
      transform.length >= 4 &&
      typeof transform[3] === "number" &&
      Number.isFinite(transform[3])
        ? Math.abs(transform[3])
        : 0;
    const height =
      typeof item.height === "number" && Number.isFinite(item.height) && item.height > 0
        ? item.height
        : scaleY;

    items.push({
      str: item.str,
      x,
      y,
      width,
      height,
      hasEOL: item.hasEOL === true,
      hasCoords,
      index: i,
    });
  }

  if (items.length === 0) return "";

  const sortedByY = [...items].sort((a, b) => {
    if (a.hasCoords && b.hasCoords && a.y !== b.y) {
      return b.y - a.y;
    }
    return a.index - b.index;
  });

  const lines: PositionedPdfItem[][] = [];
  for (const item of sortedByY) {
    if (item.str === "" && !item.hasEOL) continue;
    const lastLine = lines[lines.length - 1];
    if (!lastLine) {
      lines.push([item]);
      continue;
    }
    const anchor = lastLine[0];
    const lineHeight = Math.max(anchor.height, item.height, 6);
    const yTolerance = Math.max(2.5, lineHeight * 0.35);
    const prevInLine = lastLine[lastLine.length - 1];
    const sameLine =
      anchor.hasCoords && item.hasCoords
        ? Math.abs(anchor.y - item.y) <= yTolerance
        : !prevInLine.hasEOL;

    if (sameLine) {
      lastLine.push(item);
    } else {
      lines.push([item]);
    }
  }

  const renderedLines: string[] = [];
  for (const line of lines) {
    line.sort((a, b) => {
      if (a.hasCoords && b.hasCoords && a.x !== b.x) {
        return a.x - b.x;
      }
      return a.index - b.index;
    });

    let lineText = "";
    let prev: PositionedPdfItem | null = null;
    for (const item of line) {
      if (item.str === "") continue;
      if (prev !== null && lineText.length > 0) {
        const endsWithSpace = /\s$/.test(lineText);
        const startsWithSpace = /^\s/.test(item.str);
        if (!endsWithSpace && !startsWithSpace) {
          if (prev.hasCoords && item.hasCoords) {
            if (prev.width > 0) {
              const gap = item.x - (prev.x + prev.width);
              if (gap > 1.5) {
                lineText += " ";
              }
            } else if (item.x > prev.x) {
              lineText += " ";
            }
          } else {
            lineText += " ";
          }
        }
      }
      lineText += item.str;
      prev = item;
    }

    const trimmed = lineText.trim();
    if (trimmed !== "") {
      renderedLines.push(trimmed);
    }
  }

  return renderedLines.join("\n");
}

async function extractPdfTextFromBytes(
  bytes: Uint8Array,
): Promise<{ text: string; warnings: string[] }> {
  if (!startsWithBytes(bytes, PDF_MAGIC)) {
    throw new RejectError(
      "Invalid PDF file: missing %PDF- header (file may be corrupt or have a spoofed extension).",
    );
  }

  const loadingTask = getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    verbosity: VerbosityLevel.ERRORS,
  });

  try {
    const doc = await loadingTask.promise;
    const warnings: string[] = [];
    const totalPages = typeof doc.numPages === "number" ? doc.numPages : 0;
    const pagesToExtract = Math.min(totalPages, MAX_PDF_PAGES);

    if (totalPages > MAX_PDF_PAGES) {
      warnings.push(
        `PDF has ${totalPages} pages; only the first ${MAX_PDF_PAGES} pages were extracted.`,
      );
    }

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pagesToExtract; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = formatPdfPageItems(textContent.items);
      if (pageText !== "") {
        pageTexts.push(pageText);
      }
    }

    const sanitized = sanitizeExtractedText(pageTexts.join("\n\n"), warnings);
    if (sanitized.text.trim() === "") {
      sanitized.warnings.push(
        "Extracted PDF text is empty — this file may be a scanned or image-only PDF.",
      );
    }
    return sanitized;
  } catch (err) {
    if (err instanceof RejectError) throw err;
    throw new RejectError("Invalid or corrupt PDF file.");
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // Ignore cleanup errors on already-failed loading tasks.
    }
  }
}

function extractTxtFromBytes(bytes: Uint8Array): { text: string; warnings: string[] } {
  for (let i = 0; i < bytes.byteLength; i++) {
    if (bytes[i] === 0x00) {
      throw new RejectError("Invalid TXT file: binary NUL bytes are not allowed.");
    }
  }

  if (
    startsWithBytes(bytes, PDF_MAGIC) ||
    startsWithBytes(bytes, ZIP_MAGIC) ||
    startsWithBytes(bytes, PNG_MAGIC) ||
    startsWithBytes(bytes, JPG_MAGIC) ||
    startsWithBytes(bytes, GIF_MAGIC) ||
    startsWithBytes(bytes, ELF_MAGIC)
  ) {
    throw new RejectError("Invalid TXT file: binary payload signature detected.");
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RejectError("Invalid TXT file: content is not valid UTF-8 text.");
  }

  return sanitizeExtractedText(decoded, []);
}

export async function extractResumeText(file: File): Promise<ExtractResult> {
  try {
    if (!file || typeof file.name !== "string") {
      throw new RejectError("No resume file provided.");
    }

    const fileType = detectFileType(file.name);
    if (!fileType) {
      throw new RejectError(
        "Unsupported file format. Please upload a .pdf, .docx, or .txt file.",
      );
    }

    if (typeof file.size === "number") {
      if (file.size === 0) {
        throw new RejectError("Resume file is empty.");
      }
      if (file.size > MAX_RESUME_FILE_BYTES) {
        throw new RejectError("Resume file exceeds the 5 MB maximum size limit.");
      }
    }

    const bytes = await readFileBytes(file);
    if (bytes.byteLength === 0) {
      throw new RejectError("Resume file is empty.");
    }
    if (bytes.byteLength > MAX_RESUME_FILE_BYTES) {
      throw new RejectError("Resume file exceeds the 5 MB maximum size limit.");
    }

    if (fileType === "pdf") {
      const { text, warnings } = await extractPdfTextFromBytes(bytes);
      return { ok: true, text, fileType: "pdf", warnings };
    }

    if (fileType === "docx") {
      const { text, warnings } = extractDocxTextFromBytes(bytes);
      return { ok: true, text, fileType: "docx", warnings };
    }

    const { text, warnings } = extractTxtFromBytes(bytes);
    return { ok: true, text, fileType: "txt", warnings };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof RejectError ? err.message : "Resume file could not be read.",
    };
  }
}
