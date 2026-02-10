import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "../components/Header";

describe("Header", () => {
  it("renders the app title", () => {
    render(<Header connected={false} />);
    expect(screen.getByText("ACP Agent Orchestrator")).toBeInTheDocument();
  });

  it("shows 'Connected' when connected is true", () => {
    render(<Header connected={true} />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows 'Disconnected' when connected is false", () => {
    render(<Header connected={false} />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });
});
