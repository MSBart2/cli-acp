import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OutputLog from "../components/OutputLog";

describe("OutputLog", () => {
  describe("text entries", () => {
    it("renders text entry content", () => {
      const entries = [{ type: "text", content: "Hello, world!" }];
      render(<OutputLog entries={entries} />);
      expect(screen.getByText("Hello, world!")).toBeInTheDocument();
    });

    it("preserves whitespace in text content", () => {
      const entries = [
        { type: "text", content: "Line 1\nLine 2\n  Indented" },
      ];
      const { container } = render(<OutputLog entries={entries} />);
      const textDiv = container.querySelector(".whitespace-pre-wrap");
      // The CSS class preserves whitespace, but textContent reads it as a single line
      expect(textDiv).toBeInTheDocument();
      expect(textDiv.textContent).toBe("Line 1\nLine 2\n  Indented");
    });

    it("renders multiple text entries", () => {
      const entries = [
        { type: "text", content: "First" },
        { type: "text", content: "Second" },
        { type: "text", content: "Third" },
      ];
      render(<OutputLog entries={entries} />);
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
      expect(screen.getByText("Third")).toBeInTheDocument();
    });
  });

  describe("tool_call entries", () => {
    it("renders tool name for worker variant", () => {
      const entries = [{ type: "tool_call", name: "readFile" }];
      render(<OutputLog entries={entries} variant="worker" />);
      expect(screen.getByText("readFile")).toBeInTheDocument();
    });

    it("renders tool name with wrench emoji for worker", () => {
      const entries = [{ type: "tool_call", name: "grep" }];
      const { container } = render(
        <OutputLog entries={entries} variant="worker" />,
      );
      expect(container.textContent).toContain("🔧");
      expect(screen.getByText("grep")).toBeInTheDocument();
    });

    it("renders tool args as string for worker variant", () => {
      const entries = [{ type: "tool_call", name: "search", args: "*.js" }];
      render(<OutputLog entries={entries} variant="worker" />);
      expect(screen.getByText(/\(.*\*\.js.*\)/)).toBeInTheDocument();
    });

    it("renders tool args as JSON for worker variant when not a string", () => {
      const entries = [
        { type: "tool_call", name: "api", args: { url: "/test", method: "GET" } },
      ];
      const { container } = render(
        <OutputLog entries={entries} variant="worker" />,
      );
      expect(container.textContent).toContain('{"url":"/test","method":"GET"}');
    });

    it("renders tool name for orchestrator variant", () => {
      const entries = [{ type: "tool_call", name: "analyzeResults" }];
      render(<OutputLog entries={entries} variant="orchestrator" />);
      expect(screen.getByText("analyzeResults")).toBeInTheDocument();
    });

    it("renders tool name with lightning emoji for orchestrator", () => {
      const entries = [{ type: "tool_call", name: "synthesize" }];
      const { container } = render(
        <OutputLog entries={entries} variant="orchestrator" />,
      );
      expect(container.textContent).toContain("⚡");
      expect(screen.getByText("synthesize")).toBeInTheDocument();
    });

    it("omits args when not provided", () => {
      const entries = [{ type: "tool_call", name: "list" }];
      const { container } = render(<OutputLog entries={entries} />);
      expect(container.textContent).not.toContain("(");
    });
  });

  describe("error entries", () => {
    it("renders error content for worker variant", () => {
      const entries = [{ type: "error", content: "Something went wrong" }];
      render(<OutputLog entries={entries} variant="worker" />);
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("renders error with warning emoji for worker", () => {
      const entries = [{ type: "error", content: "Failed" }];
      const { container } = render(
        <OutputLog entries={entries} variant="worker" />,
      );
      expect(container.textContent).toContain("⚠");
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("renders error for orchestrator variant without emoji", () => {
      const entries = [{ type: "error", content: "Orchestrator error" }];
      const { container } = render(
        <OutputLog entries={entries} variant="orchestrator" />,
      );
      expect(container.textContent).not.toContain("⚠");
      expect(screen.getByText("Orchestrator error")).toBeInTheDocument();
    });
  });

  describe("mixed entries", () => {
    it("renders entries of different types in order", () => {
      const entries = [
        { type: "text", content: "Starting..." },
        { type: "tool_call", name: "readFile", args: "config.json" },
        { type: "text", content: "File read successfully" },
        { type: "error", content: "Parse error" },
      ];
      const { container } = render(<OutputLog entries={entries} />);
      const allText = container.textContent;

      // Check presence and rough ordering
      expect(allText).toContain("Starting...");
      expect(allText).toContain("readFile");
      expect(allText).toContain("File read successfully");
      expect(allText).toContain("Parse error");

      // Verify ordering by index
      const startIdx = allText.indexOf("Starting...");
      const toolIdx = allText.indexOf("readFile");
      const successIdx = allText.indexOf("File read successfully");
      const errorIdx = allText.indexOf("Parse error");

      expect(startIdx).toBeLessThan(toolIdx);
      expect(toolIdx).toBeLessThan(successIdx);
      expect(successIdx).toBeLessThan(errorIdx);
    });
  });

  describe("unknown entry types", () => {
    it("does not render entries with unknown type", () => {
      const entries = [
        { type: "unknown_type", content: "Should not appear" },
        { type: "text", content: "Should appear" },
      ];
      const { container } = render(<OutputLog entries={entries} />);
      expect(container.textContent).not.toContain("Should not appear");
      expect(container.textContent).toContain("Should appear");
    });
  });

  describe("empty entries", () => {
    it("renders nothing when entries array is empty", () => {
      const { container } = render(<OutputLog entries={[]} />);
      // React fragment returns no DOM node when empty
      expect(container.textContent).toBe("");
    });
  });

  describe("styling differences", () => {
    it("applies orchestrator-specific styles for text entries", () => {
      const entries = [{ type: "text", content: "Test" }];
      const { container } = render(
        <OutputLog entries={entries} variant="orchestrator" />,
      );
      const textDiv = container.querySelector(".font-mono");
      expect(textDiv).toBeInTheDocument();
      expect(textDiv).toHaveClass("leading-relaxed");
    });

    it("applies worker-specific styles for text entries", () => {
      const entries = [{ type: "text", content: "Test" }];
      const { container } = render(
        <OutputLog entries={entries} variant="worker" />,
      );
      const textDiv = container.querySelector(".text-gray-200");
      expect(textDiv).toBeInTheDocument();
      expect(textDiv).toHaveClass("break-words");
    });
  });
});
