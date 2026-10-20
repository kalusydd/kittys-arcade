@AGENTS.md

# Kitty's Arcade

Personal jukebox website for Kat's AI-made browser games. Next.js App Router, TypeScript, Tailwind, hosted on Vercel (Hobby). No database, logins, analytics or environment variables.

## Commands

Use Node 24 (`nvm use`, pinned in `.nvmrc` and `package.json` engines).

- Dev server: `npm run dev` (http://localhost:3000)
- Lint: `npm run lint`
- Build: `npm run build`

## Layout

- `games/<slug>/` is a game's source and its own tooling. Not served, not linted, not type-checked.
- `public/games/<slug>/index.html` is the finished game file the site serves in an iframe.
