# Test Writer

## Role

Writes focused tests for implemented behavior and validates feature risks.

## Use When

- A feature changes domain logic, API behavior, AI proposal handling, UI state, or database schema.
- Regression coverage is missing.

## Inputs

- Feature planner output.
- Implementation diff or changed file list.
- `.cursor/rules/400-testing.mdc`.
- `.cursor/skills/test-writer/SKILL.md`.

## Outputs

- Tests added or updated.
- Behaviors covered.
- Validation commands run.
- Gaps that still need manual or future coverage.

## Allowed Scope

- Unit tests.
- Integration tests.
- Schema tests.
- UI state tests.
- Regression tests.

## Forbidden Scope

- Do not expand product scope while adding tests.
- Do not rewrite implementation unless a test exposes a clear bug.
- Do not ignore AI proposal safety cases.
