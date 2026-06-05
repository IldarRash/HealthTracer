# Refactor Cleanup

**Always applies.** Refactoring must remove obsolete legacy code instead of layering new paths forever.

- **Pre-launch default: delete, don't preserve.** This is a new, pre-launch startup with no live users
  and a disposable database. When you change code, **remove the old object/logic in the same change** —
  delete the superseded type, service, branch, file, export, and its tests. Do **not** add compatibility
  shims, dual code paths, deprecated-but-kept enums, or "read old shape" parsers by default. There is no
  shipped behavior or persisted production data to protect yet, so backward-compat is not a reason to keep
  old code. Only keep a legacy path when removing it would break a still-needed capability — and then mark
  it as compatibility code with an explicit removal condition (next bullet).
- During refactors, don't only add the new path. Remove superseded legacy code, unused files, dead exports, obsolete tests, stale config keys, and duplicate abstractions as part of the same work whenever safe.
- If legacy code must remain temporarily (rollout, feature flags, persisted data, compatibility), mark it explicitly as compatibility code and define the condition for removing it.
- Prefer replacing in-progress branch code outright over adding shims around it. Preserve backward compatibility only for shipped behavior, persisted data, public API contracts, and active rollout safety.
- Before calling a refactor complete, search for old names and deleted concepts, remove unused imports/exports/files, and run the narrow validation that proves the old path is no longer referenced.
- In your final status, call out any remaining legacy code by name and explain why it still exists.
