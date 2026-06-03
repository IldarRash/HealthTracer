# Security & Privacy

**Always applies.** This is a health product — privacy and safety floors are first-class.

- Do not commit secrets, API keys, tokens, database URLs, or private health data.
- Do not log sensitive health data, raw AI prompts containing private data, or document contents.
- Require explicit user consent before collecting health integrations or documents.
- Avoid diagnosis, treatment, or medical-certainty language.
- Do not run destructive database or filesystem operations without explicit approval.
- Keep production database MCP disabled unless security-reviewed.
- Prefer least privilege for service credentials and MCP access.
- Context budgets deny documents and sensitive health context by default; config cannot relax these code-level safety floors.
