import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../components/StatusBadge";

describe("StatusBadge", () => {
  describe("worker variant", () => {
    it("renders Ready status", () => {
      render(<StatusBadge status="ready" variant="worker" />);
      expect(screen.getByText("Ready")).toBeInTheDocument();
    });

    it("renders Busy status", () => {
      render(<StatusBadge status="busy" variant="worker" />);
      expect(screen.getByText("Busy")).toBeInTheDocument();
    });

    it("renders Error status", () => {
      render(<StatusBadge status="error" variant="worker" />);
      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    it("renders Initializing status", () => {
      render(<StatusBadge status="initializing" variant="worker" />);
      expect(screen.getByText("Initializing")).toBeInTheDocument();
    });

    it("renders Spawning status", () => {
      render(<StatusBadge status="spawning" variant="worker" />);
      expect(screen.getByText("Spawning")).toBeInTheDocument();
    });

    it("renders Stopped status", () => {
      render(<StatusBadge status="stopped" variant="worker" />);
      expect(screen.getByText("Stopped")).toBeInTheDocument();
    });

    it("falls back to Initializing for unknown status", () => {
      render(<StatusBadge status="unknown-status" variant="worker" />);
      expect(screen.getByText("Initializing")).toBeInTheDocument();
    });
  });

  describe("orchestrator variant", () => {
    it("renders Ready status with different styling", () => {
      render(<StatusBadge status="ready" variant="orchestrator" />);
      expect(screen.getByText("Ready")).toBeInTheDocument();
    });

    it("renders Busy status as 'Synthesizing'", () => {
      render(<StatusBadge status="busy" variant="orchestrator" />);
      expect(screen.getByText("Synthesizing")).toBeInTheDocument();
    });

    it("renders Error status", () => {
      render(<StatusBadge status="error" variant="orchestrator" />);
      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    it("renders Spawning status", () => {
      render(<StatusBadge status="spawning" variant="orchestrator" />);
      expect(screen.getByText("Spawning")).toBeInTheDocument();
    });
  });

  describe("testId prop", () => {
    it("applies data-testid when provided", () => {
      render(<StatusBadge status="ready" testId="my-status" />);
      expect(screen.getByTestId("my-status")).toBeInTheDocument();
    });
  });

  describe("className prop", () => {
    it("applies additional className when provided", () => {
      const { container } = render(
        <StatusBadge status="ready" className="extra-class" />,
      );
      const badge = container.querySelector(".extra-class");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("pulse animation", () => {
    it("includes pulse animation for busy status", () => {
      const { container } = render(<StatusBadge status="busy" />);
      const pulseSpan = container.querySelector(".animate-ping");
      expect(pulseSpan).toBeInTheDocument();
    });

    it("includes pulse animation for spawning status", () => {
      const { container } = render(<StatusBadge status="spawning" />);
      const pulseSpan = container.querySelector(".animate-ping");
      expect(pulseSpan).toBeInTheDocument();
    });

    it("does not include pulse animation for ready status", () => {
      const { container } = render(<StatusBadge status="ready" />);
      const pulseSpan = container.querySelector(".animate-ping");
      expect(pulseSpan).not.toBeInTheDocument();
    });

    it("does not include pulse animation for error status", () => {
      const { container } = render(<StatusBadge status="error" />);
      const pulseSpan = container.querySelector(".animate-ping");
      expect(pulseSpan).not.toBeInTheDocument();
    });
  });
});
