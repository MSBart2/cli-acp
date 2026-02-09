# CLI-ACP Research and References

## Overview

This document contains research notes and references for building a CLI application that demonstrates agent orchestration over multiple repositories using the Agent Communication Protocol (ACP).

## What is ACP (Agent Communication Protocol)?

The Agent Client Protocol (ACP) is a protocol that standardizes communication between clients (such as code editors and IDEs) and coding agents (such as GitHub Copilot CLI). It enables:

- **IDE integrations:** Build Copilot support into any editor or development environment
- **CI/CD pipelines:** Orchestrate agentic coding tasks in automated workflows
- **Custom frontends:** Create specialized interfaces for specific developer workflows
- **Multi-agent systems:** Coordinate Copilot with other AI agents using a standard protocol

## Key References

### Official Documentation
- **Primary Reference:** https://docs.github.com/en/copilot/reference/acp-server
- **ACP Official Site:** https://agentclientprotocol.com/get-started/introduction
- **Protocol Overview:** https://agentclientprotocol.com/protocol/overview
- **TypeScript SDK:** https://agentclientprotocol.com/libraries/typescript

### GitHub Copilot CLI
- GitHub Copilot CLI can be started as an ACP server using the `--acp` flag
- Supports two modes: `stdio` (for IDE integration) and `TCP` (for network communication)

## ACP Server Modes

### stdio Mode (Recommended for IDE Integration)
```bash
copilot --acp --stdio
```
- Uses standard input/output for communication
- Best for local IDE integrations
- NDJSON format over stdin/stdout

### TCP Mode
```bash
copilot --acp --port 3000
```
- Network-based communication
- Useful for remote integrations
- Can be accessed over TCP sockets

## Architecture Concepts

### Communication Flow
1. **Client** spawns Copilot CLI process with ACP flags
2. **Transport Layer** uses NDJSON (Newline Delimited JSON) over stdio or TCP
3. **Protocol** follows ACP specification for request/response
4. **Sessions** are created for each interaction context
5. **Prompts** are sent to the agent with context

### Key Components

#### Client Interface
```typescript
interface Client {
  requestPermission(params): Promise<PermissionResponse>
  sessionUpdate(params): Promise<void>
}
```

#### Connection Lifecycle
1. Initialize connection with protocol version and capabilities
2. Create new session with working directory and MCP servers
3. Send prompts within the session context
4. Handle responses and agent message chunks
5. Clean up resources

## Use Cases for CLI-ACP Demo

### Multi-Repository Orchestration
- Coordinate tasks across multiple Git repositories
- Maintain context across repository boundaries
- Share knowledge between different codebases

### CI/CD Integration
- Automated code review across repositories
- Consistency checks between dependent repos
- Automated documentation generation

### Custom Workflows
- Repository-specific coding standards enforcement
- Cross-repo refactoring operations
- Dependency management across multiple projects

## Implementation Considerations

### Prerequisites
- GitHub Copilot CLI installed and authenticated
- Node.js environment (for TypeScript SDK)
- Access to target repositories

### Security
- Authentication handled by Copilot CLI
- Permission management through requestPermission callback
- Secure communication via stdio or localhost TCP

### Error Handling
- Process spawn failures
- Communication timeouts
- Session management
- Graceful cleanup on interruption

## Technical Stack

### Recommended Technologies
- **Language:** TypeScript/Node.js (best SDK support)
- **ACP SDK:** @agentclientprotocol/sdk
- **CLI Framework:** commander.js or yargs for command parsing
- **Process Management:** node:child_process for spawning Copilot
- **Streaming:** node:stream for NDJSON communication

### Project Structure
```
cli-acp/
├── src/
│   ├── cli.ts           # Main CLI entry point
│   ├── acp-client.ts    # ACP client wrapper
│   ├── orchestrator.ts  # Multi-repo orchestration logic
│   └── utils/
│       ├── config.ts    # Configuration management
│       └── logger.ts    # Logging utilities
├── examples/
│   ├── simple-prompt.ts # Basic ACP interaction
│   └── multi-repo.ts    # Multi-repository demo
├── package.json
├── tsconfig.json
├── README.md
└── research.md
```

## Example Use Cases

### 1. Cross-Repository Code Search
Query multiple repositories simultaneously for specific patterns or implementations.

### 2. Consistency Checker
Ensure coding standards and patterns are consistent across organization repositories.

### 3. Documentation Generator
Generate unified documentation from multiple repository sources.

### 4. Refactoring Assistant
Help with large-scale refactoring operations that span multiple codebases.

### 5. Dependency Analyzer
Analyze and report on dependencies across multiple projects.

## Development Roadmap

### Phase 1: Basic Setup
- [x] Research and documentation
- [ ] Project initialization
- [ ] Basic ACP client implementation
- [ ] Simple single-prompt example

### Phase 2: Multi-Repository Features
- [ ] Repository discovery and management
- [ ] Context sharing between repos
- [ ] Session management for multiple contexts

### Phase 3: Advanced Features
- [ ] CI/CD integration examples
- [ ] Custom workflow templates
- [ ] Configuration file support
- [ ] Interactive CLI interface

### Phase 4: Documentation & Examples
- [ ] Comprehensive README
- [ ] Example scripts and use cases
- [ ] Best practices documentation
- [ ] Troubleshooting guide

## Best Practices

### Communication Patterns
- Use NDJSON for streaming responses
- Handle partial messages and chunks
- Implement proper error recovery
- Clean up resources properly

### Session Management
- Create separate sessions for different contexts
- Pass appropriate working directory
- Configure MCP servers as needed
- Handle session lifecycle properly

### Tool Usage
- Implement permission callback to control tool access
- Review tool requests before allowing
- Log tool usage for debugging
- Handle tool failures gracefully

## Troubleshooting

### Common Issues
1. **Copilot CLI not found:** Ensure CLI is installed and in PATH
2. **Authentication failures:** Run `copilot auth status` to check
3. **Process spawn errors:** Check stdio pipe configuration
4. **Timeout issues:** Adjust wait times for long operations

### Debug Tips
- Enable verbose logging in ACP client
- Monitor stderr from Copilot process
- Test with simple prompts first
- Verify protocol version compatibility

## Additional Resources

### Learning Materials
- ACP Protocol Specification: https://agentclientprotocol.com/protocol/overview
- GitHub Copilot CLI Documentation: https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line
- MCP (Model Context Protocol): Related protocol for tool/resource access

### Community
- GitHub Discussions for Copilot CLI
- ACP Protocol GitHub Repository
- Examples and samples from community

### Related Technologies
- **MCP Servers:** Provide additional tools and resources to agents
- **Language Server Protocol (LSP):** Similar concept for language tooling
- **Debug Adapter Protocol (DAP):** Debugging protocol with similar architecture

## Notes

- ACP support in GitHub Copilot CLI is currently in public preview
- Protocol and features subject to change
- Keep SDK and CLI versions in sync
- Monitor official documentation for updates

## Conclusion

The Agent Communication Protocol provides a standardized way to integrate AI coding agents into various workflows. This CLI-ACP demo will showcase how to leverage ACP for multi-repository orchestration, demonstrating practical use cases and implementation patterns.

---

**Last Updated:** 2026-02-09
**Status:** Research phase complete, ready for implementation
