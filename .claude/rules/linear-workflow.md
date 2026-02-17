# Linear Workflow Rules

## Team Configuration

- **Team**: Invoice Analyzer
- **Prefix**: INV (tickets: INV-1, INV-2, etc.)
- **Statuses**: Backlog > Todo > In Progress > In Review > Done (+ Canceled)
- **Labels**: bug, feature, improvement, chore, docs
- **Priorities**: Linear built-in (Urgent, High, Medium, Low, No Priority)

## Working on Tickets

When the user asks to work on a ticket (e.g., "work on INV-12"):

1. Use the Linear MCP to read the ticket details
2. Summarize the ticket to confirm understanding
3. Set ticket status to **In Progress** (ask user before changing)
4. Create a feature branch following the naming convention
5. When work is complete, ask user whether to set **In Review** or **Done**

Always confirm with the user before changing ticket status.

## Reading Tickets

- Use Linear MCP to list issues for the Invoice Analyzer team
- Use Linear MCP to get issue details by identifier (e.g., INV-12)
- When starting a session, check if there are any In Progress tickets to resume

## Commit Message Convention

Format: `{type}(INV-{number}): {description}`

Types:
- `feat` — New capability
- `fix` — Bug fix
- `improve` — Enhancement to existing feature
- `chore` — Maintenance, dependencies, config
- `docs` — Documentation changes
- `refactor` — Code restructuring without behavior change
- `test` — Adding or updating tests

Examples:
```
feat(INV-12): add multi-currency support to filename generator
fix(INV-7): handle PDF parse failure for scanned invoices
chore(INV-15): upgrade @google/generative-ai to v0.22
docs(INV-3): add client configuration examples
```

For work without a ticket (rare), omit the scope: `chore: update .gitignore`

## Branch Naming Convention

Format: `{type}/INV-{number}-{short-kebab-description}`

Examples:
```
feat/INV-12-multi-currency
fix/INV-7-scanned-pdf-handling
chore/INV-15-upgrade-gemini-sdk
```

## Creating New Tickets

When discovering bugs or improvements during work:
1. Suggest creating a ticket to the user
2. Use Linear MCP to create the issue in the Invoice Analyzer team
3. Apply the appropriate label (bug, feature, improvement, chore, docs)
4. Set priority based on impact
5. Add to Backlog unless the user specifies otherwise

## PR Conventions

- PR title matches the primary commit format: `{type}(INV-{number}): {description}`
- PR body includes: `Closes INV-{number}` (or `Part of INV-{number}` for partial work)
- Keep PRs focused on a single ticket when possible
