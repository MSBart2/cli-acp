import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RoutingPlanPanel from "../components/RoutingPlanPanel";

const plan = {
  planId: "plan-1",
  sourceRepoName: "class-lib-a",
  originalPromptText: "add field to public schema",
  routes: [
    { repoName: "api-gateway", promptText: "Update downstream schema usage." },
    { repoName: "webapp", promptText: "Review UI impact." },
  ],
};

describe("RoutingPlanPanel", () => {
  it("renders the proposed routes", () => {
    render(<RoutingPlanPanel plan={plan} onApprove={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("@api-gateway")).toBeInTheDocument();
    expect(screen.getByText("@webapp")).toBeInTheDocument();
  });

  it("allows editing prompt text before approval", () => {
    render(<RoutingPlanPanel plan={plan} onApprove={vi.fn()} onCancel={vi.fn()} />);
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "Edited downstream prompt" } });
    expect(textareas[0].value).toBe("Edited downstream prompt");
  });

  it("passes edited routes on approval", () => {
    const onApprove = vi.fn();
    render(<RoutingPlanPanel plan={plan} onApprove={onApprove} onCancel={vi.fn()} />);
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "Edited downstream prompt" } });
    fireEvent.click(screen.getByText("Approve and Send"));
    expect(onApprove).toHaveBeenCalledWith("plan-1", [
      { repoName: "api-gateway", promptText: "Edited downstream prompt" },
      { repoName: "webapp", promptText: "Review UI impact." },
    ]);
  });

  it("calls onCancel with the plan id", () => {
    const onCancel = vi.fn();
    render(<RoutingPlanPanel plan={plan} onApprove={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledWith("plan-1");
  });
});
