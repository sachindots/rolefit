import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { STORAGE_KEY, loadWorkspaceState } from "./lib/storage";

beforeEach(() => localStorage.clear());

describe("App", () => {
  it("renders the product title, privacy indicator, editor pane, and live preview sheet", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "RoleFit" })).toBeInTheDocument();
    expect(screen.getByText("Local-only · Zero tracking")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resume editor" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resume preview" })).toBeInTheDocument();
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-template", "classic-executive");
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-page-size", "letter");
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

  it("switches between Editor and Preview tabs for tablet/mobile view", () => {
    render(<App />);
    const editorTab = screen.getByRole("tab", { name: "Editor" });
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    const editorPane = screen.getByRole("region", { name: "Resume editor" });
    const previewPane = screen.getByRole("region", { name: "Resume preview" });

    expect(editorTab).toHaveAttribute("aria-selected", "true");
    expect(previewTab).toHaveAttribute("aria-selected", "false");
    expect(editorPane.className).toContain("block");
    expect(previewPane.className).toContain("hidden");

    fireEvent.click(previewTab);
    expect(editorTab).toHaveAttribute("aria-selected", "false");
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(editorPane.className).toContain("hidden");
    expect(previewPane.className).toContain("block");
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
