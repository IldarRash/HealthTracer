---
name: security-review
description: Review health data privacy, secrets, AI safety, database migrations, MCP access, auth boundaries, and destructive operations. Use before merging auth, AI, database, MCP, or health-data changes.
disable-model-invocation: true
---

# Security Review

## Checklist

- No secrets, API keys, tokens, or database URLs are committed.
- No sensitive health data or raw health documents are logged.
- Health data collection has explicit user consent.
- AI responses avoid diagnosis and treatment claims.
- AI tools cannot mutate domain state directly.
- Plan changes are validated and revision-safe.
- Database changes go through Drizzle migrations.
- MCP database access is read-only unless explicitly approved.
- Production destructive operations are not introduced.

## Output

Lead with risks and required fixes. If no issues are found, state residual risk and any tests that were not run.
