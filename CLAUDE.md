@AGENTS.md

# Kitty's Arcade

Personal jukebox website for Kat's AI-made browser games. Next.js 16 App Router, TypeScript, Tailwind, hosted on Vercel (Hobby). No database, logins, analytics or environment variables.

## Commands

Use Node 24 (`nvm use`, pinned in `.nvmrc` and `package.json` engines). Tool shells start on Node 16, so run `source ~/.nvm/nvm.sh && nvm use` first.

- Dev server: `npm run dev` (http://localhost:3000)
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit` (run `npm run dev` or `npm run build` once first so Next generates the route types)
- Build: `npm run build`
- End to end tests: `npm run test:e2e` (Playwright, tests in `e2e/`, starts the dev server itself; set `PLAYWRIGHT_BASE_URL` to test a deployed URL)
- Planet 13 level test: `cd games/planet-13 && npm install --no-save three@0.169.0 esbuild@0.23.1 && node test/levels.test.mjs`

## Layout

- `data/games.ts` is the only place a game is registered (see README for how to add one).
- `app/page.tsx` renders the jukebox from `components/jukebox/`.
- `app/play/[slug]/page.tsx` shows a playable game full screen in an iframe (`components/game-frame/`).
- `games/<slug>/` is a game's source and its own tooling. Not served, not linted, not type-checked.
- `public/games/<slug>/index.html` is the finished game file the site serves.
- `PRODUCT.md`, `DESIGN.md` and `.impeccable/` are the design notes Impeccable reads.

## Gotchas

- The original Planet 13 files in `/Users/katsydd/code/Games/Planet13 escape/` are Kat's and must never be moved, edited or deleted. Copy from there, never move.
- `next.config.ts` runs Tailwind as a Turbopack loader on `*.css`. CSS modules must stay excluded from that rule, or their class names stop working.
- Cache Components is on, so `dynamicParams` is not available. The play page uses `generateStaticParams` plus `notFound()`, and `instant = false` to stop a dev-only validation warning on unknown slugs.
- Arc's `foundation.css` and shadcn both define `--background`, `--accent` and friends. `app/globals.css` is imported after Arc and maps them onto the arcade palette.
- The GitHub repo's default branch is `master`.
- `.claude/launch.json` here is ignored by the desktop preview tool, which reads `/Users/katsydd/code/Games/.claude/launch.json` (leave that file alone). Run the dev server in the background instead.
