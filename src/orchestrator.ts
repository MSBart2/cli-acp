import { ACPClient, SessionOptions } from "./acp-client";

export interface Repository {
  name: string;
  path: string;
  description?: string;
}

export class MultiRepoOrchestrator {
  private client: ACPClient;
  private repositories: Repository[];
  private sessions: Map<string, string> = new Map();

  constructor(repositories: Repository[], verbose: boolean = false) {
    this.repositories = repositories;
    this.client = new ACPClient({ verbose });
  }

  async initialize(): Promise<void> {
    await this.client.initialize();

    // Create a session for each repository
    for (const repo of this.repositories) {
      const sessionId = await this.client.createSession({
        cwd: repo.path,
      });
      this.sessions.set(repo.name, sessionId);
      console.log(`✓ Session created for ${repo.name}`);
    }
  }

  async executePromptAcrossRepos(prompt: string): Promise<void> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Executing prompt across ${this.repositories.length} repositories`);
    console.log(`${"=".repeat(60)}\n`);

    for (const repo of this.repositories) {
      const sessionId = this.sessions.get(repo.name);
      if (!sessionId) {
        console.error(`No session found for ${repo.name}`);
        continue;
      }

      console.log(`\n--- Repository: ${repo.name} ---`);
      if (repo.description) {
        console.log(`Description: ${repo.description}`);
      }
      console.log(`Path: ${repo.path}`);
      console.log(`\nResponse:`);

      await this.client.sendPrompt(sessionId, prompt);
      console.log("\n");
    }
  }

  async executePromptForRepo(repoName: string, prompt: string): Promise<void> {
    const sessionId = this.sessions.get(repoName);
    if (!sessionId) {
      throw new Error(`No session found for repository: ${repoName}`);
    }

    const repo = this.repositories.find((r) => r.name === repoName);
    console.log(`\n--- Repository: ${repoName} ---`);
    if (repo?.description) {
      console.log(`Description: ${repo.description}`);
    }
    console.log(`Path: ${repo?.path}\n`);

    await this.client.sendPrompt(sessionId, prompt);
  }

  getRepositories(): Repository[] {
    return this.repositories;
  }

  async cleanup(): Promise<void> {
    await this.client.cleanup();
    this.sessions.clear();
  }
}
