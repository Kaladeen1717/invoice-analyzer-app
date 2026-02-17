# Linear Workflow — Invoice Analyzer App

## Overview

This project uses [Linear](https://linear.app) for development task management. All planned work is tracked as Linear issues, referenced in commits and branches.

## Team Setup

| Setting | Value |
|---------|-------|
| Team | Invoice Analyzer |
| Prefix | INV |
| Tickets | INV-1, INV-2, etc. |

## Workflow Statuses

| Status | When to use |
|--------|-------------|
| **Backlog** | Captured ideas, not yet prioritized |
| **Todo** | Prioritized and ready to pick up |
| **In Progress** | Actively being worked on |
| **In Review** | Code complete, needs testing/verification |
| **Done** | Shipped and verified |
| **Canceled** | Decided not to do |

## Labels

| Label | Use for |
|-------|---------|
| `bug` | Something broken that needs fixing |
| `feature` | New capability or functionality |
| `improvement` | Enhancement to an existing feature |
| `chore` | Maintenance, dependencies, config updates |
| `docs` | Documentation changes |

## Priorities

Use Linear's built-in priority levels: Urgent, High, Medium, Low, No Priority.

## Writing Good Tickets

**Title**: Use imperative mood, be concise.
- Good: "Add batch retry logic for failed invoices"
- Bad: "Retry logic" or "The batch processor sometimes fails"

**Description template**:

```
## Problem
What's wrong or what's missing?

## Solution
How should this be solved?

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## AI Assistant Integration

### Claude Code (direct Linear access)

Claude Code has access to Linear via the MCP plugin and can:
- Read ticket details by identifier (e.g., INV-12)
- List team issues and filter by status
- Update ticket status (with user confirmation)
- Create new issues

Workflow rules are defined in `.claude/rules/linear-workflow.md`.

### Cursor (convention-based)

Cursor does not have direct Linear access. When working in Cursor:
- Provide ticket context manually (e.g., "Working on INV-12: add retry logic")
- Cursor follows commit/branch conventions from `.cursorrules`

## Git Conventions

### Commit Messages

Format: `{type}(INV-{number}): {description}`

| Type | Meaning |
|------|---------|
| `feat` | New capability |
| `fix` | Bug fix |
| `improve` | Enhancement to existing feature |
| `chore` | Maintenance, dependencies, config |
| `docs` | Documentation changes |
| `refactor` | Code restructuring, no behavior change |
| `test` | Adding or updating tests |

Examples:
```
feat(INV-12): add multi-currency support to filename generator
fix(INV-7): handle PDF parse failure for scanned invoices
chore(INV-15): upgrade @google/generative-ai to v0.22
```

### Branch Names

Format: `{type}/INV-{number}-{short-kebab-description}`

Examples:
```
feat/INV-12-multi-currency
fix/INV-7-scanned-pdf-handling
```

### Pull Requests

- Title: Same format as commit message
- Body: Include `Closes INV-{number}` to auto-close the ticket

## Example Workflow

1. Pick a ticket from **Todo** in Linear
2. Move it to **In Progress**
3. Create a branch: `feat/INV-5-batch-retry`
4. Implement the change
5. Commit: `feat(INV-5): add batch retry logic for failed invoices`
6. Move ticket to **In Review** or **Done**
