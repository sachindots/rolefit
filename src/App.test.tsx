import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { STORAGE_KEY, loadWorkspaceState } from "./lib/storage";

beforeEach(() => localStorage.clear());

describe("App", () => {
  it("renders the product title and privacy indicator", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "RoleFit" })).toBeInTheDocument();
    expect(screen.getByText("Local-only · Zero tracking")).toBeInTheDocument();
  });

  it("persists edits to localStorage and reloads them", () => {
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Grace Hopper" } });
    fireEvent.click(screen.getByRole("button", { name: "Add skill group" }));
    expect(loadWorkspaceState().state.resume.contact.fullName).toBe("Grace Hopper");
    unmount();

    render(<App />);
    expect(screen.getByLabelText("Full name")).toHaveValue("Grace Hopper");
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
