# Agent Workflow

Mandatory workflow for **larger** feature work. See `AGENTS.md` for the full version. For small scoped changes, state that it's a small change and implement directly.

- Don't implement a whole feature directly in the main chat — delegate to the subagents in `.claude/agents`.
- **feature-planner** owns user-facing planning, orchestration, subagent coordination, and final status communication, and **never writes implementation code**. If it notices a needed code change, it stops and creates the smallest corrective task for the right subagent.
- Before launching a subagent, estimate whether the task will exceed ~30% of that subagent's context window; if so, split into smaller role-specific tasks and launch additional subagents.
- The planner's goal is a fully working application feature — not only a plan, diff, or passing unit tests.
- Before implementation, launch **product-analyst** to clarify scope, acceptance criteria, risks, and the plan, and write/update the brief in `docs/product/features/<slug>.md`.
- After plan approval, explicitly ask the user to confirm which subagents to use or skip (propose a default list; name skipped roles for narrowed scope, e.g. skip Expo/mobile for web-only work).
- Invoke role subagents in order as needed: backend-implementer → frontend-implementer → visual-designer / design-system-agent / ui-polish-implementer → test-writer → implementation-reviewer → app-runner.
- Do not declare a larger feature complete until **app-runner reports the relevant flow `working`**, or the planner reports a concrete blocker preventing runtime verification.
- If runtime/review/visual/test verification fails, route the smallest corrective task to the right subagent and repeat verification.
