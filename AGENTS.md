<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project summary

ChargeGuard is an AI merchant-support teammate for payment disputes (chargebacks), built for Paytm Build Track 3. It uses synthetic data only. A submitted response is not a won dispute; never describe or label it as one.

## Folder layout and dependency rule

- `contracts/` — shared types and Zod schemas. Imports nothing.
- `agent-core/` — dispute logic, rules, model orchestration. Imports `contracts/` only.
- `lib/db/` — database access (Prisma repositories and mappers). Imports `contracts/` and its own generated client (`lib/db/generated/`) only.
- `app/` — Next.js UI and Server Actions. Imports `lib/db/`, `contracts/` and `agent-core/`.
- Never import in the reverse direction (`contracts/` must not import `agent-core/`, `lib/db/` or `app/`; `agent-core/` must not import `lib/db/` or `app/`; `lib/db/` must not import `agent-core/` or `app/`).
- The generated Prisma client is git-ignored. After pulling, run `npx prisma generate`.

## Next.js rules

- Server Components by default; Client Components only for interaction.
- Zod-validate input on every Server Action.
- Dynamic data goes inside `Suspense`, with a `loading.tsx`.
- Never cache dispute status.
- Agent code lives in `server-only` modules.

## Engineering rules

- Separation of concerns; keep modules small, typed, and testable.
- One interface per outside dependency. All Sarvam calls go through a single function.
- Validate every boundary with Zod.
- Use timeouts and limited retries, with an escalation fallback when they run out.
- Idempotent submission: persistent idempotency key plus a database unique constraint; check existing status before retrying.
- Write an audit trail entry for every decision.
- Secrets only in env vars.
- Always cap `max_tokens`.
- Deterministic rules decide the final action; the model only recommends.
- Write tests for decision logic.
- Check current Prisma docs before writing Prisma code.
- Only `lib/db/` may import the Prisma client; the ActionLog repository stays append and list only.
- Keep it simple.

## Secrets

- Never commit keys.
- `.env.local` is git-ignored.
- `.env.example` holds placeholders only.

## How to work

- Explain tradeoffs before writing code.
- Keep changes small.
