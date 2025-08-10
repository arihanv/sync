# Harmonize

Harmonize is an automated project management and task orchestration system that integrates Linear issue tracking with autonomous Claude Code agents.

## Overview

The system automatically launches Claude Code instances to work on Linear issues when they become unblocked, creating a distributed autonomous development workflow.

## Key Components

- **Linear Integration**: Webhook-based integration for real-time issue tracking
- **Claude Code Orchestration**: Automated spawning of Claude Code sessions in tmux workers
- **Dependency Management**: Smart dependency checking and task scheduling
- **Session Management**: Tmux-based worker pools for parallel task execution

## Getting Started

### Prerequisites

- Node.js/Bun runtime
- Linear API access
- Claude Code CLI installed

### Installation

```bash
bun install
```

### Configuration

Set up your Linear API token and workspace configuration in environment variables.

### Usage

Start the orchestration server:

```bash
bun taskboard/server.ts
```

The system will automatically:
1. Listen for Linear webhook events
2. Check task dependencies
3. Launch Claude Code workers for unblocked issues
4. Monitor and manage worker sessions

## Architecture

- `taskboard/server.ts` - Main webhook server and orchestration logic
- `taskboard/claude-launcher.ts` - Claude Code session management and tmux integration
- `taskboard/utils.ts` - Linear API utilities and dependency checking
- `linear-dependencies.ts` - CLI tool for managing issue dependencies

## Development

Run type checking:
```bash
bun run typecheck
```

## License

Private project