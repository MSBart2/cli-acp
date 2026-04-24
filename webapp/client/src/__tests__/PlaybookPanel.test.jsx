import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PlaybookPanel from "../components/PlaybookPanel";

const mockPlaybooks = [
  { id: "pb-1", name: "Deploy script", text: "Run the deploy pipeline for all services", savedAt: "2024-01-01T00:00:00Z" },
  { id: "pb-2", name: "Code review", text: "Review all open PRs and provide feedback on each one", savedAt: "2024-01-02T00:00:00Z" },
];

const defaults = {
  playbooks: mockPlaybooks,
  currentText: "some prompt text",
  onLoad: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onClose: vi.fn(),
};

describe("PlaybookPanel", () => {
  it("renders the Playbooks header", () => {
    render(<PlaybookPanel {...defaults} />);
    expect(screen.getByText("Playbooks")).toBeInTheDocument();
  });

  it("shows empty state when no playbooks exist", () => {
    render(<PlaybookPanel {...defaults} playbooks={[]} />);
    expect(screen.getByText("No saved playbooks yet.")).toBeInTheDocument();
  });

  it("renders playbook names in the list", () => {
    render(<PlaybookPanel {...defaults} />);
    expect(screen.getByText("Deploy script")).toBeInTheDocument();
    expect(screen.getByText("Code review")).toBeInTheDocument();
  });

  it("truncates preview text to 60 characters with ellipsis", () => {
    const longPlaybook = [{
      id: "pb-3",
      name: "Long one",
      text: "A".repeat(80),
      savedAt: "2024-01-03T00:00:00Z",
    }];
    render(<PlaybookPanel {...defaults} playbooks={longPlaybook} />);
    expect(screen.getByText("A".repeat(60) + "…")).toBeInTheDocument();
  });

  it("calls onLoad and onClose when a playbook is clicked", () => {
    const onLoad = vi.fn();
    const onClose = vi.fn();
    render(<PlaybookPanel {...defaults} onLoad={onLoad} onClose={onClose} />);

    fireEvent.click(screen.getByText("Deploy script"));
    expect(onLoad).toHaveBeenCalledWith("Run the deploy pipeline for all services");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<PlaybookPanel {...defaults} onClose={onClose} />);

    // The close button is the first button in the header (before any playbook buttons)
    const allButtons = screen.getAllByRole("button");
    // First button is the close (X) button in the header
    fireEvent.click(allButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  // --- Save functionality ---

  it("disables Save button when name is empty", () => {
    render(<PlaybookPanel {...defaults} />);
    const saveBtn = screen.getByText("Save").closest("button");
    expect(saveBtn).toBeDisabled();
  });

  it("disables Save button when currentText is empty", () => {
    render(<PlaybookPanel {...defaults} currentText="" />);
    const input = screen.getByPlaceholderText("Playbook name…");
    fireEvent.change(input, { target: { value: "My PB" } });
    const saveBtn = screen.getByText("Save").closest("button");
    expect(saveBtn).toBeDisabled();
  });

  it("calls onSave with name and currentText on Save click", () => {
    const onSave = vi.fn();
    render(<PlaybookPanel {...defaults} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText("Playbook name…"), {
      target: { value: "New PB" },
    });
    fireEvent.click(screen.getByText("Save").closest("button"));

    expect(onSave).toHaveBeenCalledWith("New PB", "some prompt text");
  });

  it("clears the save name input after saving", () => {
    render(<PlaybookPanel {...defaults} />);
    const input = screen.getByPlaceholderText("Playbook name…");
    fireEvent.change(input, { target: { value: "Temp" } });
    fireEvent.click(screen.getByText("Save").closest("button"));
    expect(input.value).toBe("");
  });

  it("saves on Enter key in the name input", () => {
    const onSave = vi.fn();
    render(<PlaybookPanel {...defaults} onSave={onSave} />);

    const input = screen.getByPlaceholderText("Playbook name…");
    fireEvent.change(input, { target: { value: "Enter PB" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith("Enter PB", "some prompt text");
  });

  // --- Delete confirmation flow ---

  it("shows delete confirmation when trash icon is clicked", () => {
    render(<PlaybookPanel {...defaults} />);

    // Each playbook item has a trash button. The load buttons have text content,
    // the trash buttons are the remaining ones after header close and save.
    // Button order: [close, save, load-1, trash-1, load-2, trash-2]
    const allButtons = screen.getAllByRole("button");
    // First trash button is index 3 (after close=0, save=1, load-1=2)
    const trashBtn = allButtons[3];
    fireEvent.click(trashBtn);

    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onDelete when Delete confirmation is clicked", () => {
    const onDelete = vi.fn();
    render(<PlaybookPanel {...defaults} onDelete={onDelete} />);

    const allButtons = screen.getAllByRole("button");
    fireEvent.click(allButtons[3]); // trash button for pb-1
    fireEvent.click(screen.getByText("Delete"));

    expect(onDelete).toHaveBeenCalledWith("pb-1");
  });

  it("cancels delete when Cancel is clicked", () => {
    render(<PlaybookPanel {...defaults} />);

    const allButtons = screen.getAllByRole("button");
    fireEvent.click(allButtons[3]); // trash button
    fireEvent.click(screen.getByText("Cancel"));

    // Confirmation should be gone
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });
});
