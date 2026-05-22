# Best Practice References

Use these references as inspiration for project rules, skills, and agent roles. Do not copy them blindly; adapt patterns to the AI Health Coach architecture.

## Cursor Rules

- `PatrickJS/awesome-cursorrules`: large community collection for Cursor rules, including Next.js, TypeScript, shadcn/ui, Tailwind, and monorepo patterns.
- `somnio-software/cursor-rules`: modular NestJS rules for DTO validation, services, controllers, repositories, testing, and error handling.

## Similar Monorepos

- `t3-oss/create-t3-turbo`: high-star Turborepo reference with Next.js, Expo, TypeScript, Drizzle, auth, shared packages, and pnpm.
- `barisgit/nextjs-nestjs-expo-template`: closer API shape with NestJS, Next.js, Expo, Clerk, pnpm workspaces, and type-safe full-stack patterns.

## Agent Role Patterns

- Official Claude Code subagents docs: role descriptions, isolated context, clear tool scope, and concise output contracts.
- `lst97/claude-code-sub-agents`: popular collection with frontend, backend, planner, tester, and language specialist agents.
- `wshobson/agents`: composable agent and plugin architecture with single-purpose roles for frontend, backend, testing, security, and orchestration.

## Local Adaptation

- Keep architecture and feature roadmap in `docs`.
- Keep AI operating instructions in `.cursor`.
- Use consolidated frontend and backend style rules instead of many duplicated micro-rules.
- Use role templates for coordination, not as a replacement for project architecture docs.
