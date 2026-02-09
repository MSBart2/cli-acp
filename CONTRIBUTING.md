# Contributing to CLI-ACP

Thank you for your interest in contributing to CLI-ACP! This document provides guidelines and information for contributors.

## Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cli-acp.git
   cd cli-acp
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Verify Setup**
   ```bash
   # Ensure Copilot CLI is installed
   copilot --version
   
   # Check authentication
   copilot auth status
   ```

## Project Structure

```
cli-acp/
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── acp-client.ts       # ACP client wrapper
│   ├── orchestrator.ts     # Multi-repo orchestration
│   ├── index.ts            # Public API exports
│   └── utils/
│       ├── config.ts       # Configuration management
│       └── logger.ts       # Logging utilities
├── examples/
│   ├── simple-prompt.ts    # Basic example
│   └── multi-repo.ts       # Multi-repo example
├── research.md             # ACP research and references
└── README.md
```

## Development Workflow

### Running in Development

```bash
# Run the CLI in development mode
npm run dev -- prompt "Your prompt here"

# Run examples
npm run example:simple
npm run example:multi-repo
```

### Building

```bash
# Build TypeScript to JavaScript
npm run build

# Clean build artifacts
npm run clean
```

### Testing Your Changes

1. Test with simple prompts first
2. Test multi-repo functionality with a config file
3. Verify error handling
4. Check verbose output for debugging

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Export types alongside implementations

## Making Changes

### Adding New Features

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the code style

3. Test your changes thoroughly

4. Update documentation:
   - Update README.md if adding user-facing features
   - Update research.md if adding ACP-related information
   - Add examples if appropriate

5. Commit your changes:
   ```bash
   git commit -m "Add feature: description"
   ```

### Bug Fixes

1. Create a bug fix branch:
   ```bash
   git checkout -b fix/bug-description
   ```

2. Fix the bug and add a test case if possible

3. Commit with a clear description:
   ```bash
   git commit -m "Fix: description of the fix"
   ```

## Pull Requests

1. Push your branch to your fork
2. Create a Pull Request with:
   - Clear title describing the change
   - Description of what changed and why
   - Any relevant issue numbers
   - Test results or examples

## Adding New Examples

Examples are a great way to contribute! To add a new example:

1. Create a new file in `examples/` directory
2. Follow the pattern of existing examples
3. Add clear comments explaining each step
4. Add a corresponding npm script in package.json
5. Update README.md to reference the new example

Example template:

```typescript
import { ACPClient } from "../src/acp-client";

/**
 * Description of what this example demonstrates
 */

async function main() {
  console.log("=== Your Example Title ===\n");
  
  const client = new ACPClient({ verbose: true });
  
  try {
    // Your example code here
    
    console.log("\n✓ Example completed successfully!");
  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exitCode = 1;
  } finally {
    await client.cleanup();
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exitCode = 1;
});
```

## Documentation

Good documentation is crucial! When contributing:

- Keep README.md up to date
- Update research.md with new ACP findings
- Add code comments for complex logic
- Provide examples for new features

## Questions?

- Open an issue for questions
- Check existing issues for common problems
- Refer to research.md for ACP documentation

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on the code, not the person
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
