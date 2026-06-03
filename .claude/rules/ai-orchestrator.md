# AI Orchestrator

Applies to `apps/api/src/modules/ai`, `apps/api/src/modules/chat`, `apps/api/src/modules/chat-attachments`, `apps/api/src/modules/coaching-context`, `packages/ai`, `packages/types`. **Read `docs/architecture/llm-pipeline.md` before changing any of these.**

- AI tools return proposals, not direct database mutations.
- Validate all AI outputs with Zod before domain services can apply them.
- Store proposal intent, reason, target domain, validation status, and applied revision id.
- Backend services decide whether a proposal is accepted, rejected, or superseded.
- Accepted workout and nutrition changes create new revisions.
- Reject unsupported intents and unsafe medical wording.
- Use Context7 or current docs before adding unfamiliar AI SDK APIs.

## Pipeline invariants (preserve in code, not config)

The pipeline is a **multi-domain fan-out + synthesis** design: one router LLM selects ≤3 domains, the selected domain LLMs run in parallel, and a decision-maker LLM synthesizes their output.

- **RouterLlm** is the only first-LLM routing stage for eligible turns; it selects up to 3 relevant domains, returns read-only hints, never replies/proposals, and is clamped to known domains/capabilities/tools. Proposal-revision and proposal-explainer turns are the explicit non-router exceptions.
- **Domain LLMs run only-selected and in parallel.** Each enforces its own read-only tool allowlist and reply safety; a failed/timed-out domain degrades to a safe empty output. The **decision-maker** LLM synthesizes the domain outputs and emits typed proposals only — only the workout domain LLM may set a workout calorie estimate.
- **SystemPlanner** is the deterministic control layer: it owns the final fan-out plan, context budget, executor modes, and tool/proposal allowlists, and caps selected domains at 3. The LLM only suggests; the capability catalog is the floor and router/YAML can only narrow it.
- **Pre-AI gates** (crisis support, proposal explainer, direct chat paths) intentionally bypass the LLM — they are safety/deterministic product boundaries, not duplicate routers. Direct paths are read-only or the narrow "mark today's workout done" write, resolve only when there is no attachment, and plan changes stay proposal-only.
- Attachments are **images only and context-only**: there is no recognition/classification machinery (the multimodal domain LLMs read the image content directly). There is **no upfront classification** (no category picker / `categorySource` declare-before-upload) and **no upfront consent gate** for images. **Temporary, intentional relaxation (for now):** image content — including a photo of a medical document — reaches the LLM before any consent, consciously removing the previous "medical content only when consent is granted" code floor. Floors that still hold: the context-budget `allowDocuments=false` floor (DB `health_documents` slices, not the uploaded image) stays, and no attachment path may auto-persist or parse a `health_document`. The LLM-recognized medical consent-gated **special save** (recognition signal → save proposal → on accept, with consent, persist a `health_document`) and PDF/text document upload are **deferred follow-ups**, not current behavior. Do not reintroduce the recognizers/classifiers, `prepare_proposal_candidates`, the pre-upload classification/consent gate, the `medical_document_save` action-variant, or any attachment proposal side-channel (see "Removed Legacy Paths" in the pipeline doc).
- Prefer editing repo config (`packages/ai-behavior/config/*.json`, `packages/ai-behavior/config/domains/*.yml`) + focused tests over hardcoding behavior in services. Per-domain YAML can only **narrow** catalog allowlists, never widen them. Config loading is fail-closed; safety floors stay in code.
