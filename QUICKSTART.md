# Quick Start Guide

Get up and running with CLI-ACP in 5 minutes!

## Prerequisites Check

```bash
# 1. Check Node.js version (need v18+)
node --version

# 2. Check if Copilot CLI is installed
copilot --version

# 3. Verify Copilot authentication
copilot auth status
```

If any of these fail, see the [Prerequisites](#prerequisites-installation) section below.

## Installation

```bash
# Clone the repository
git clone https://github.com/MSBart2/cli-acp.git
cd cli-acp

# Install dependencies
npm install

# Optional: Build the project
npm run build
```

## Your First Command

### Example 1: Simple Prompt

```bash
npm run dev -- prompt "What is ACP?"
```

This will:
1. Start a Copilot CLI process with ACP enabled
2. Create a session
3. Send your prompt
4. Display the response
5. Clean up resources

### Example 2: Run Pre-Built Examples

```bash
# Simple example
npm run example:simple

# Multi-repository example
npm run example:multi-repo

# Workflow example
npm run example:workflow
```

## Working with Multiple Repositories

### Step 1: Create a Configuration File

Create `my-repos.json`:

```json
{
  "repositories": [
    {
      "name": "frontend",
      "path": "/path/to/your/frontend",
      "description": "React frontend"
    },
    {
      "name": "backend",
      "path": "/path/to/your/backend",
      "description": "Node.js API"
    }
  ]
}
```

### Step 2: Run Multi-Repo Command

```bash
npm run dev -- multi-repo "What is the main tech stack?" --config my-repos.json
```

This will execute the prompt against both repositories and show the results!

## Common Use Cases

### 1. Check Code Quality Across Repos

```bash
npm run dev -- multi-repo "Are there any obvious code quality issues?" --config my-repos.json
```

### 2. Find Specific Patterns

```bash
npm run dev -- multi-repo "Find all API endpoint definitions" --config my-repos.json
```

### 3. Documentation Review

```bash
npm run dev -- multi-repo "Summarize what this project does" --config my-repos.json
```

## Understanding the Output

When you run a command, you'll see:

```
[ACP Client] Initializing ACP client...      # Verbose logging
[ACP Client] Spawning: copilot --acp --stdio
Session started!                              # Session created
Prompt: "Your question"                       # Your prompt

Response:                                     # Copilot's response
[The answer appears here, streamed in real-time]

✓ Example completed successfully!            # Completion status
```

## Troubleshooting Quick Fixes

### Issue: "copilot: command not found"

**Fix:** Install Copilot CLI:
```bash
gh extension install github/gh-copilot
```

### Issue: Authentication error

**Fix:** Authenticate Copilot:
```bash
gh auth login
copilot auth login
```

### Issue: TypeScript errors

**Fix:** Ensure dependencies are installed:
```bash
npm install
```

## Next Steps

1. **Read the full README**: `README.md`
2. **Explore research notes**: `research.md`
3. **Study the examples**: `examples/` directory
4. **Create your own workflows**: See `CONTRIBUTING.md`

## Architecture Overview

```
You → CLI → ACP Client → Copilot CLI (ACP Server) → AI Agent
                ↓
        Multi-Repo Orchestrator
                ↓
        [Repo 1] [Repo 2] [Repo N]
```

## Key Files

- `src/cli.ts` - Command-line interface
- `src/acp-client.ts` - ACP protocol wrapper
- `src/orchestrator.ts` - Multi-repo coordination
- `examples/` - Ready-to-run examples

## Getting Help

- Check `research.md` for detailed ACP documentation
- Review examples in `examples/` directory
- Read the full `README.md`
- Open an issue on GitHub

---

## Prerequisites Installation

### Installing Node.js

**macOS/Linux (using nvm):**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows:**
Download from [nodejs.org](https://nodejs.org/)

### Installing GitHub CLI and Copilot

**macOS:**
```bash
brew install gh
gh extension install github/gh-copilot
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt install gh
gh extension install github/gh-copilot
```

**Windows:**
```bash
winget install GitHub.cli
gh extension install github/gh-copilot
```

### Authenticating

```bash
# Authenticate with GitHub
gh auth login

# Authenticate Copilot
copilot auth login

# Verify
copilot auth status
```

---

**Ready to go!** Start with `npm run example:simple` 🚀
