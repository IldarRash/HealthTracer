---
name: design-system
description: Design and implement UI primitives, tokens, cross-platform component patterns, accessibility states, and visual consistency for web and mobile. Use when building or reviewing design system foundations.
---

# Design System

## Workflow

1. Identify the product surface and user state the component supports.
2. Define shared tokens before creating many one-off styles.
3. Use shadcn-style primitives on web and NativeWind-compatible patterns on mobile.
4. Include accessibility labels, focus states, disabled states, and error states.
5. Keep components presentation-focused and free of domain business logic.
6. Document reusable component intent in code or colocated examples when useful.

## Rules

- Prefer a small set of composable primitives over large feature-specific components.
- Do not introduce visual systems that conflict between web and mobile.
- Do not implement API or domain behavior in design system components.
