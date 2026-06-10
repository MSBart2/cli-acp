import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OrgRepoScanner from "../components/OrgRepoScanner";

describe("OrgRepoScanner", () => {
  const defaults = {
    onLoadRepo: vi.fn(),
    loadedRepoUrls: [],
    connected: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders collapsed by default with toggle button", () => {
    render(<OrgRepoScanner {...defaults} />);
    expect(screen.getByText("Browse GitHub Org")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("org or username")).not.toBeInTheDocument();
  });

  it("expands to show search form when clicked", () => {
    render(<OrgRepoScanner {...defaults} />);
    fireEvent.click(screen.getByText("Browse GitHub Org"));
    expect(screen.getByPlaceholderText("org or username")).toBeInTheDocument();
    expect(screen.getByText("Scan")).toBeInTheDocument();
  });

  it("disables Scan button when org input is empty", () => {
    render(<OrgRepoScanner {...defaults} />);
    fireEvent.click(screen.getByText("Browse GitHub Org"));
    const scanBtn = screen.getByText("Scan").closest("button");
    expect(scanBtn).toBeDisabled();
  });

  it("fetches repos on scan and displays results", async () => {
    const mockRepos = {
      org: "test-org",
      repos: [
        {
          name: "repo-a",
          fullName: "test-org/repo-a",
          url: "https://github.com/test-org/repo-a",
          description: "First repo",
          language: "JavaScript",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        {
          name: "repo-b",
          fullName: "test-org/repo-b",
          url: "https://github.com/test-org/repo-b",
          description: "",
          language: null,
          updatedAt: "2025-01-02T00:00:00Z",
        },
      ],
      total: 2,
      limit: 100,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRepos),
    });

    render(<OrgRepoScanner {...defaults} />);
    fireEvent.click(screen.getByText("Browse GitHub Org"));
    fireEvent.change(screen.getByPlaceholderText("org or username"), {
      target: { value: "test-org" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("test-org/repo-a")).toBeInTheDocument();
      expect(screen.getByText("test-org/repo-b")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/github/org-repos?org=test-org",
    );
  });

  it("shows error when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Org not found" }),
    });

    render(<OrgRepoScanner {...defaults} />);
    fireEvent.click(screen.getByText("Browse GitHub Org"));
    fireEvent.change(screen.getByPlaceholderText("org or username"), {
      target: { value: "bad-org" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("Org not found")).toBeInTheDocument();
    });
  });

  it("marks already-loaded repos and disables load button", async () => {
    const mockRepos = {
      org: "myorg",
      repos: [
        {
          name: "loaded-repo",
          fullName: "myorg/loaded-repo",
          url: "https://github.com/myorg/loaded-repo",
          description: "",
          language: null,
          updatedAt: "2025-01-01T00:00:00Z",
        },
      ],
      total: 1,
      limit: 100,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRepos),
    });

    render(
      <OrgRepoScanner
        {...defaults}
        loadedRepoUrls={["https://github.com/myorg/loaded-repo"]}
      />,
    );
    fireEvent.click(screen.getByText("Browse GitHub Org"));
    fireEvent.change(screen.getByPlaceholderText("org or username"), {
      target: { value: "myorg" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("Loaded")).toBeInTheDocument();
    });
    // No "Load" button for already-loaded repos
    expect(screen.queryByText("Load")).not.toBeInTheDocument();
  });

  it("calls onLoadRepo when Load button is clicked", async () => {
    const onLoadRepo = vi.fn();
    const mockRepos = {
      org: "myorg",
      repos: [
        {
          name: "new-repo",
          fullName: "myorg/new-repo",
          url: "https://github.com/myorg/new-repo",
          description: "A new repo",
          language: "TypeScript",
          updatedAt: "2025-01-01T00:00:00Z",
        },
      ],
      total: 1,
      limit: 100,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRepos),
    });

    render(<OrgRepoScanner {...defaults} onLoadRepo={onLoadRepo} />);
    fireEvent.click(screen.getByText("Browse GitHub Org"));
    fireEvent.change(screen.getByPlaceholderText("org or username"), {
      target: { value: "myorg" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("myorg/new-repo")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Load"));
    expect(onLoadRepo).toHaveBeenCalledWith("https://github.com/myorg/new-repo");
  });

  it("shows 'first N' warning when total equals limit", async () => {
    const mockRepos = {
      org: "big-org",
      repos: Array.from({ length: 100 }, (_, i) => ({
        name: `repo-${i}`,
        fullName: `big-org/repo-${i}`,
        url: `https://github.com/big-org/repo-${i}`,
        description: "",
        language: null,
        updatedAt: "2025-01-01T00:00:00Z",
      })),
      total: 100,
      limit: 100,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRepos),
    });

    render(<OrgRepoScanner {...defaults} />);
    fireEvent.click(screen.getByText("Browse GitHub Org"));
    fireEvent.change(screen.getByPlaceholderText("org or username"), {
      target: { value: "big-org" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText(/first 100/)).toBeInTheDocument();
    });
  });
});
