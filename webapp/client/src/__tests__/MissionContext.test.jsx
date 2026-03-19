import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MissionContext from "../components/MissionContext";

describe("MissionContext", () => {
  // ---------------------------------------------------------------------------
  // Collapsed / empty state
  // ---------------------------------------------------------------------------

  it("renders collapsed when value is empty", () => {
    render(<MissionContext value="" onChange={vi.fn()} />);
    expect(screen.getByText("Add session brief…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the expand (+) button when collapsed", () => {
    render(<MissionContext value="" onChange={vi.fn()} />);
    expect(screen.getByText("+")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Expanded / non-empty state
  // ---------------------------------------------------------------------------

  it("renders expanded with textarea when value is non-empty", () => {
    render(<MissionContext value="Migrate auth to Clerk" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("Migrate auth to Clerk");
  });

  it("shows the 'Session Brief' label when expanded", () => {
    render(<MissionContext value="some context" onChange={vi.fn()} />);
    expect(screen.getByText("Session Brief")).toBeInTheDocument();
    expect(screen.getByText("All agents · Persistent")).toBeInTheDocument();
  });

  it("shows char count when value is non-empty and expanded", () => {
    render(<MissionContext value="hello" onChange={vi.fn()} />);
    expect(screen.getByText("5 chars")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // onChange callback
  // ---------------------------------------------------------------------------

  it("calls onChange with new value when user types in the textarea", () => {
    const onChange = vi.fn();
    render(<MissionContext value="existing" onChange={onChange} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "updated context" } });
    expect(onChange).toHaveBeenCalledWith("updated context");
  });

  // ---------------------------------------------------------------------------
  // Clear button
  // ---------------------------------------------------------------------------

  it("calls onChange('') when clear button is clicked", () => {
    const onChange = vi.fn();
    render(<MissionContext value="some context" onChange={onChange} />);
    const clearBtn = screen.getByLabelText("Clear session brief");
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("collapses the panel after clear button is clicked", () => {
    // The component controls its own `expanded` state; after clearing it sets
    // expanded=false, so the textarea should disappear without a prop change.
    const onChange = vi.fn();
    render(<MissionContext value="some context" onChange={onChange} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Clear session brief"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Expand / collapse toggle
  // ---------------------------------------------------------------------------

  it("expands when the collapsed bar is clicked", () => {
    render(<MissionContext value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Add session brief…"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("collapses and resets when clear is clicked after manual expand", () => {
    const onChange = vi.fn();
    render(<MissionContext value="" onChange={onChange} />);

    // Expand manually (value is still "")
    fireEvent.click(screen.getByText("Add session brief…"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    // Clear collapses and fires onChange("")
    fireEvent.click(screen.getByLabelText("Clear session brief"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith("");
  });
});
