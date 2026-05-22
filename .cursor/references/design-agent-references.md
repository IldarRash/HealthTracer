# Design Agent References

Use these patterns when assigning visual design or UI polish work to agents.

## Visual Context

- Prefer screenshots, reference images, browser state, or route/component paths over vague design requests.
- Ask the agent to inspect existing UI patterns before proposing changes.
- For design-to-code work, compare the rendered result against the reference and report the visual verification step.

## Design System Discipline

- Reuse existing components, tokens, spacing, typography, icons, and layout primitives.
- Keep visual decisions consistent across web and mobile unless the platform needs a specific interaction pattern.
- Do not introduce a new visual language when a local design system primitive or token can solve the problem.

## Granular UI Changes

- Make small, focused visual changes over already implemented behavior.
- Preserve routing, data flow, API calls, domain logic, and persistence unless the user explicitly approves a broader change.
- If the requested polish requires behavior or architecture changes, stop and return an implementation plan instead.

## Structured UX Audit

- Classify findings as:
  - `Critical`: accessibility failures, broken flows, misleading states, unsafe health wording, or touch/click targets that block use.
  - `Warning`: confusing hierarchy, inconsistent affordances, weak empty/loading/error/success states, or unnecessary cognitive load.
  - `Opportunity`: polish, motion, clarity, delight, or brand improvements that are useful but not required to ship.
- Output a prioritized action list that Feature Planner can route to Visual Designer, UI Polish Implementer, Frontend Implementer, or Design System Agent.
