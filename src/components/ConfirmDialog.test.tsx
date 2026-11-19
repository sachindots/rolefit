import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

function DialogHarness({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open confirmation
      </button>
      <button type="button">Outside action</button>
      <ConfirmDialog
        open={open}
        title="Reset current workspace?"
        description="Your current resume and job description will be replaced."
        confirmLabel="Confirm reset"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

describe("ConfirmDialog", () => {
  it("does not render when closed and opens with accessible dialog attributes", () => {
    render(<DialogHarness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Reset current workspace?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Your current resume and job description will be replaced.");
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });

  it("traps Tab and Shift+Tab focus inside the modal", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancelButton = screen.getByRole("button", { name: "Keep editing" });
    const confirmButton = screen.getByRole("button", { name: "Confirm reset" });

    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    expect(cancelButton).toHaveFocus();
  });

  it("closes on Escape and restores focus to the triggering element", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on backdrop click but not when clicking inside the dialog card", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("invokes onConfirm when confirm button is clicked and restores focus", () => {
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
