# Refactor Cleanup

**Always applies.** Refactoring must remove obsolete legacy code instead of layering new paths forever.

- During refactors, don't only add the new path. Remove superseded legacy code, unused files, dead exports, obsolete tests, stale config keys, and duplicate abstractions as part of the same work whenever safe.
- If legacy code must remain temporarily (rollout, feature flags, persisted data, compatibility), mark it explicitly as compatibility code and define the condition for removing it.
- Prefer replacing in-progress branch code outright over adding shims around it. Preserve backward compatibility only for shipped behavior, persisted data, public API contracts, and active rollout safety.
- Before calling a refactor complete, search for old names and deleted concepts, remove unused imports/exports/files, and run the narrow validation that proves the old path is no longer referenced.
- In your final status, call out any remaining legacy code by name and explain why it still exists.
