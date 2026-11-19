import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { serializeBackup } from "./lib/backup";
import { createEmptyWorkspace } from "./lib/schema";
import { STORAGE_KEY, loadWorkspaceState } from "./lib/storage";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("App", () => {
  it("renders the product title, privacy indicator, editor pane, live match badge, and preview sheet on first visit", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "RoleFit" })).toBeInTheDocument();
    expect(screen.getByText("Local-only · Zero tracking")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resume editor" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resume preview" })).toBeInTheDocument();
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-template", "classic-executive");
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-page-size", "letter");

    const tabScore = Number.parseInt(screen.getByTestId("tab-match-score").textContent ?? "0", 10);
    expect(tabScore).toBeGreaterThan(50);
  });

  it("persists edits to localStorage, updates live preview immediately, and reloads them", () => {
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Grace Hopper" } });
    fireEvent.click(screen.getByRole("button", { name: "Add skill group" }));

    const sheet = screen.getByTestId("resume-sheet");
    expect(within(sheet).getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeInTheDocument();
    expect(loadWorkspaceState().state.resume.contact.fullName).toBe("Grace Hopper");
    unmount();

    render(<App />);
    expect(screen.getByLabelText("Full name")).toHaveValue("Grace Hopper");
    expect(within(screen.getByTestId("resume-sheet")).getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeInTheDocument();
  });

  it("updates live JD match score, matched/missing chips, and ATS audit findings in real time", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: /JD Match/i }));
    const matchPane = screen.getByRole("region", { name: "JD match and ATS audit" });
    expect(matchPane.className).toContain("block");

    const jdInput = screen.getByLabelText("Job description");
    fireEvent.change(jdInput, {
      target: { value: "Hiring an engineer skilled in TypeScript, Node.js, C++, and C#." },
    });

    const matched = screen.getByTestId("matched-keywords");
    const missing = screen.getByTestId("missing-keywords");
    expect(within(matched).getByText("TypeScript")).toBeInTheDocument();
    expect(within(matched).getByText("Node.js")).toBeInTheDocument();
    expect(within(matched).getByText("C++")).toBeInTheDocument();
    expect(within(missing).getByText("C#")).toBeInTheDocument();
    expect(screen.getByTestId("jd-match-score")).toHaveTextContent("75%");
    expect(screen.getByTestId("tab-match-score")).toHaveTextContent("75%");

    fireEvent.click(screen.getByRole("tab", { name: "Editor" }));
    fireEvent.change(screen.getByLabelText(/Skills \(skill group 1\)/i), {
      target: { value: "TypeScript, JavaScript, C++, C#, SQL" },
    });

    expect(screen.getByTestId("tab-match-score")).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("tab", { name: /JD Match/i }));
    expect(screen.getByTestId("jd-match-score")).toHaveTextContent("100%");
    expect(within(screen.getByTestId("matched-keywords")).getByText("C#")).toBeInTheDocument();
  });

  it("switches across all 3 ATS-safe templates and persists template selection", () => {
    const { unmount } = render(<App />);
    const sheet = screen.getByTestId("resume-sheet");
    const templateGroup = screen.getByRole("group", { name: "Resume template" });

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Modern Minimal" }));
    expect(sheet).toHaveAttribute("data-template", "modern-minimal");
    expect(loadWorkspaceState().state.template).toBe("modern-minimal");

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Technical Compact" }));
    expect(sheet).toHaveAttribute("data-template", "technical-compact");
    expect(loadWorkspaceState().state.template).toBe("technical-compact");

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Classic Executive" }));
    expect(sheet).toHaveAttribute("data-template", "classic-executive");
    expect(loadWorkspaceState().state.template).toBe("classic-executive");

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Technical Compact" }));
    unmount();

    render(<App />);
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-template", "technical-compact");
  });

  it("toggles US Letter and A4 page size and persists pageSize in localStorage", () => {
    const { unmount } = render(<App />);
    const sheet = screen.getByTestId("resume-sheet");
    const pageSizeGroup = screen.getByRole("group", { name: "Page size" });

    expect(sheet).toHaveAttribute("data-page-size", "letter");
    fireEvent.click(within(pageSizeGroup).getByRole("button", { name: "A4" }));
    expect(sheet).toHaveAttribute("data-page-size", "a4");
    expect(loadWorkspaceState().state.pageSize).toBe("a4");

    unmount();
    render(<App />);
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-page-size", "a4");

    fireEvent.click(within(screen.getByRole("group", { name: "Page size" })).getByRole("button", { name: "Letter" }));
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-page-size", "letter");
    expect(loadWorkspaceState().state.pageSize).toBe("letter");
  });

  it("switches between Editor, JD Match, and Preview tabs for tablet/mobile view", () => {
    render(<App />);
    const editorTab = screen.getByRole("tab", { name: "Editor" });
    const matchTab = screen.getByRole("tab", { name: /JD Match/i });
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    const editorPane = screen.getByRole("region", { name: "Resume editor" });
    const matchPane = screen.getByRole("region", { name: "JD match and ATS audit" });
    const previewPane = screen.getByRole("region", { name: "Resume preview" });

    expect(editorTab).toHaveAttribute("aria-selected", "true");
    expect(previewTab).toHaveAttribute("aria-selected", "false");
    expect(editorPane.className).toContain("block");
    expect(previewPane.className).toContain("hidden");

    fireEvent.click(matchTab);
    expect(matchTab).toHaveAttribute("aria-selected", "true");
    expect(matchPane.className).toContain("block");
    expect(editorPane.className).toContain("hidden");

    fireEvent.click(previewTab);
    expect(editorTab).toHaveAttribute("aria-selected", "false");
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(editorPane.className).toContain("hidden");
    expect(previewPane.className).toContain("block");
  });

  it("toggles Studio dark and light mode, persists theme, and keeps the printable resume sheet crisp white", () => {
    const { unmount } = render(<App />);
    const root = screen.getByTestId("studio-root");
    const sheet = screen.getByTestId("resume-sheet");
    const themeToggle = screen.getByTestId("theme-toggle");

    expect(root).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(sheet.className).toContain("bg-white");
    expect(sheet.className).toContain("text-slate-900");

    fireEvent.click(themeToggle);
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(root.className).toContain("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(loadWorkspaceState().state.theme).toBe("dark");
    expect(sheet.className).toContain("bg-white");
    expect(sheet.className).toContain("text-slate-900");

    unmount();
    render(<App />);
    expect(screen.getByTestId("studio-root")).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("resume-sheet").className).toContain("bg-white");
  });

  it("guards Start blank and Load sample with ConfirmDialog and updates state on confirm", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    const blankDialog = screen.getByRole("dialog", { name: "Start blank workspace?" });
    expect(blankDialog).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");

    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start blank" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(screen.getByTestId("tab-match-score")).toHaveTextContent("0%");

    fireEvent.click(screen.getByRole("button", { name: "Load sample" }));
    const sampleDialog = screen.getByRole("dialog", { name: "Load sample workspace?" });
    fireEvent.click(within(sampleDialog).getByRole("button", { name: "Load sample" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");
    expect(Number.parseInt(screen.getByTestId("tab-match-score").textContent ?? "0", 10)).toBeGreaterThan(50);
  });

  it("exports JSON backup and imports valid, sanitized, or invalid JSON with status/error banners", async () => {
    const createObjectUrlSpy = vi.fn(() => "blob:rolefit-backup");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrlSpy, configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrlSpy, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);

    const fileInput = screen.getByTestId("import-json-input") as HTMLInputElement;

    const badFile = new File(["{corrupt json"], "bad.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    await waitFor(() => {
      expect(screen.getByTestId("studio-banner")).toHaveTextContent(/not valid JSON/i);
    });
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");

    const customState = createEmptyWorkspace();
    customState.resume.contact.fullName = "Ada <script>alert(1)</script>Lovelace";
    customState.resume.contact.website = "javascript:alert(1)";
    const rawWithXss = serializeBackup(customState);
    const xssFile = new File([rawWithXss], "xss.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [xssFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("studio-banner")).toHaveTextContent(/imported with warnings/i);
    });
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Website")).toHaveValue("");

    clickSpy.mockRestore();
  });

  it("triggers window.print() when Export PDF is clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("keeps valid stored data when a URL is partially typed", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "https://ok.dev" } });
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "htt" } });
    const stored = loadWorkspaceState();
    expect(stored.recovered).toBe(false);
    expect(stored.state.resume.contact.website).toBe("https://ok.dev");
  });

  it("recovers from corrupt stored data with a notice", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(/unreadable/);
  });
});
