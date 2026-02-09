# CLI-ACP: Multi-Repository Agent Orchestration

A demonstration CLI application showcasing GitHub Copilot's Agent Communication Protocol (ACP) for multi-repository orchestration and agent-based workflows.

## Overview

CLI-ACP is a command-line tool that demonstrates how to use the Agent Communication Protocol (ACP) to orchestrate AI coding agents across multiple repositories. It provides a standardized interface for:

- 🤖 **Agent Communication**: Interact with GitHub Copilot CLI via the ACP protocol
- 🔄 **Multi-Repo Orchestration**: Execute tasks across multiple codebases simultaneously
- 🛠️ **Custom Workflows**: Build specialized developer workflows using ACP
- 📊 **Cross-Repository Analysis**: Gather insights from multiple projects at once

## Features

- **Simple Prompt Interface**: Send prompts to GitHub Copilot via ACP
- **Multi-Repository Support**: Orchestrate agents across multiple Git repositories
- **Session Management**: Maintain separate contexts for different repositories
- **TypeScript SDK Integration**: Built on the official ACP TypeScript SDK
- **Extensible Architecture**: Easy to add custom workflows and commands

## Prerequisites

Before using CLI-ACP, ensure you have:

1. **Node.js** (v18 or higher)
2. **GitHub Copilot CLI** installed and authenticated
   ```bash
   # Install Copilot CLI (if not already installed)
   gh extension install github/gh-copilot
   
   # Authenticate
   copilot auth status
   ```

## Installation

```bash
# Clone the repository
git clone https://github.com/MSBart2/cli-acp.git
cd cli-acp

# Install dependencies
npm install

# Build the project
npm run build
```

## Quick Start

### 1. Simple Prompt Example

Send a single prompt to GitHub Copilot:

```bash
# Using npm script
npm run example:simple

# Or using the CLI directly
npm run dev -- prompt "Explain what ACP is"
```

### 2. Multi-Repository Example

Execute prompts across multiple repositories:

```bash
# Run the multi-repo example
npm run example:multi-repo

# Or use the CLI with a config file
npm run dev -- multi-repo "What language is this project?" --config repos.config.json
```

## Usage

### CLI Commands

#### `prompt` - Send a single prompt

```bash
cli-acp prompt "Your question here" [options]

Options:
  -v, --verbose    Enable verbose logging
```

**Example:**
```bash
cli-acp prompt "What files are in this directory?"
```

#### `multi-repo` - Multi-repository orchestration

```bash
cli-acp multi-repo "Your prompt" [options]

Options:
  -c, --config <path>    Path to repository configuration file
  -v, --verbose          Enable verbose logging
```

**Example:**
```bash
cli-acp multi-repo "List the main technologies used" --config repos.config.json
```

### Configuration File

Create a `repos.config.json` file to define your repositories:

```json
{
  "repositories": [
    {
      "name": "my-frontend",
      "path": "/path/to/frontend",
      "description": "React frontend application"
    },
    {
      "name": "my-backend",
      "path": "/path/to/backend",
      "description": "Node.js backend API"
    }
  ]
}
```

## Examples

See the `examples/` directory for detailed examples:

- **`simple-prompt.ts`** - Basic ACP interaction with a single prompt
- **`multi-repo.ts`** - Orchestrating across multiple repositories

Run examples with:
```bash
npm run example:simple
npm run example:multi-repo
```

## Use Cases

### 1. Cross-Repository Code Search
Query multiple repositories for specific patterns or implementations:
```bash
cli-acp multi-repo "Find all API endpoint definitions" --config my-repos.json
```

### 2. Consistency Checking
Ensure coding standards across multiple projects:
```bash
cli-acp multi-repo "Check if error handling follows best practices" --config team-repos.json
```

### 3. Documentation Generation
Generate unified documentation from multiple sources:
```bash
cli-acp multi-repo "Summarize the main purpose of this project" --config docs-repos.json
```

### 4. Dependency Analysis
Analyze dependencies across projects:
```bash
cli-acp multi-repo "List all production dependencies" --config microservices.json
```

## Architecture

```
cli-acp/
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── acp-client.ts       # ACP client wrapper
│   └── orchestrator.ts     # Multi-repo orchestration logic
├── examples/
│   ├── simple-prompt.ts    # Basic example
│   └── multi-repo.ts       # Multi-repo example
├── research.md             # Detailed ACP research and references
├── repos.config.json       # Sample repository configuration
└── package.json
```

### Key Components

- **ACPClient**: Wrapper around the ACP SDK for easier interaction
- **MultiRepoOrchestrator**: Manages sessions and execution across multiple repositories
- **CLI**: Command-line interface for user interaction

## How It Works

1. **Initialization**: The client spawns a GitHub Copilot CLI process with ACP enabled
2. **Communication**: Uses NDJSON (Newline Delimited JSON) over stdio for messaging
3. **Sessions**: Creates separate sessions for each repository context
4. **Prompts**: Sends prompts within session contexts and streams responses
5. **Cleanup**: Properly terminates processes and cleans up resources

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the project
npm run build

# Clean build artifacts
npm run clean
```

## Project Structure

- **`src/`**: TypeScript source code
- **`examples/`**: Example scripts demonstrating usage
- **`dist/`**: Compiled JavaScript output (after build)
- **`research.md`**: Comprehensive ACP documentation and references

## Resources

- **ACP Official Documentation**: https://agentclientprotocol.com/
- **GitHub Copilot CLI ACP Reference**: https://docs.github.com/en/copilot/reference/acp-server
- **ACP TypeScript SDK**: https://agentclientprotocol.com/libraries/typescript
- **Research Notes**: See [research.md](./research.md) for detailed information

## Troubleshooting

### Copilot CLI Not Found
```bash
# Check if Copilot CLI is installed
gh extension list

# Install if needed
gh extension install github/gh-copilot
```

### Authentication Issues
```bash
# Check authentication status
copilot auth status

# Re-authenticate if needed
copilot auth login
```

### Process Spawn Errors
- Ensure `copilot` is in your PATH
- Try setting `COPILOT_CLI_PATH` environment variable
- Check that you have the latest version of Copilot CLI

## Contributing

This is a demonstration project. Feel free to fork and adapt for your own use cases.

## License

MIT

## Acknowledgments

- GitHub Copilot team for the ACP protocol and CLI
- Agent Client Protocol community for the SDKs and documentation

---

**Note**: ACP support in GitHub Copilot CLI is currently in public preview and subject to change.
