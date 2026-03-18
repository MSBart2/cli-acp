import { describe, expect, it } from "vitest";
import {
  buildOrchestratorUnloadedDeps,
  suggestRepoUrl,
} from "../dependencySuggestions";

describe("dependencySuggestions", () => {
  it("derives a sibling repo URL from a loaded repo URL", () => {
    expect(
      suggestRepoUrl("https://github.com/myorg/api-gateway.git", "webapp"),
    ).toBe("https://github.com/myorg/webapp.git");
  });

  it("aggregates unloaded dependencies across workers", () => {
    const aggregated = buildOrchestratorUnloadedDeps([
      {
        repoName: "api-gateway",
        repoUrl: "https://github.com/myorg/api-gateway",
        unloadedDeps: [
          { repoName: "webapp", direction: "downstream" },
          { repoName: "auth-service", direction: "upstream" },
        ],
      },
      {
        repoName: "billing",
        repoUrl: "https://github.com/myorg/billing",
        unloadedDeps: [
          { repoName: "webapp", direction: "upstream" },
        ],
      },
    ]);

    expect(aggregated).toEqual([
      {
        repoName: "auth-service",
        suggestedUrl: "https://github.com/myorg/auth-service",
        referencedBy: ["api-gateway"],
        directions: ["upstream"],
      },
      {
        repoName: "webapp",
        suggestedUrl: "https://github.com/myorg/webapp",
        referencedBy: ["api-gateway", "billing"],
        directions: ["downstream", "upstream"],
      },
    ]);
  });
});
