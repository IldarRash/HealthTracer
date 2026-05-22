# Wellness Dashboard Reference Patterns

Reference notes for Profile dashboard visual treatment. Inspired by WHOOP and BioCharge **layout and hierarchy patterns only** — not medical scoring models, clinical language, or proprietary visual assets.

## Patterns to Adapt

### Information density (WHOOP-like)

- One **hero metric** dominates the viewport top — large numeric or ring visualization.
- Supporting metrics in a **2–3 column grid** below, equal visual weight.
- Trend context always adjacent to hero (7-day strip, week-over-week label).
- Dark card on light page (or inverse) creates premium focal point.

### Card rhythm (BioCharge-like)

- Rounded rectangles with generous internal padding.
- Section titles small and uppercase; values large.
- Soft gradient or glow on hero card only — avoid gradient overload.
- Coaching snippet card: 1–2 sentences, link to Chat.

### Motion & state

- Ring/progress animates on first paint (respect `prefers-reduced-motion`).
- Skeleton placeholders match final card geometry during load.

## Wellness-Safe Metric Framing

| Reference app pattern | Our wellness adaptation |
|-----------------------|-------------------------|
| Recovery % ring | Weekly consistency (sessions + goal touchpoints) |
| Strain score | Training load balance (planned vs completed) |
| Sleep performance | Rest day adherence (if tracked) — optional P2 |
| Body battery | Coaching focus — qualitative, not physiological |
| Health monitor | Profile preferences summary — not vitals |

## Copy Guardrails

**Do not use:** diagnose, treat, prescribe, clinical, medical grade, risk score, symptom, condition, HRV readiness (as score), recovery score.

**Prefer:** consistency, adherence, progress, focus, habits, plan, coach, logged, weekly, goals, workouts, nutrition.

## Example Hero Card Copy

- Title: **Weekly consistency**
- Value: `72%` (example computed metric)
- Subtitle: "Based on your logged workouts and active goals this week."
- Trend label: "4 of 7 days active"

## Example Secondary Card Copy

- **Workout adherence:** "3 of 4 sessions completed"
- **Nutrition consistency:** "5 of 7 days on plan"
- **Active goals:** "2 in progress"
- **Coach updates:** "Last proposal accepted — workout plan updated"

## Visual Spec Cross-Reference

See `docs/design/chat-primary-web-visual-direction.md` for tokens, grid layout, and component class names.
