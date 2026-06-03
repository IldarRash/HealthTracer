---
name: test-writer
description: Write focused vitest tests for domain services, API integration, Zod schemas, AI proposals, frontend states, and regression cases. Use when adding tests or validating feature implementation.
---

# Test Writer

## Workflow

1. Identify the behavior and risk introduced by the feature.
2. Add the narrowest test that proves the behavior.
3. Cover domain rules in service tests.
4. Cover API boundaries with integration tests when layers interact.
5. Cover Zod schemas for user input and AI structured output.
6. Cover frontend loading, error, empty, and success states when UI behavior changes.
7. Run the narrowest useful validation command (see CLAUDE.md for single-file / `-t` vitest usage).

## Required AI Cases

- Valid proposal accepted.
- Invalid proposal rejected.
- Unsafe or unsupported intent rejected.
- Accepted plan proposal creates a new revision.
