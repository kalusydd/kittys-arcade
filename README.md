# Kitty's Arcade

My personal website for the browser games I make with AI. Flick through the games on a jukebox and play one with a single click.

Built with Next.js (App Router), TypeScript and Tailwind, hosted on Vercel.

## Run it

```bash
nvm use
npm install
npm run dev
```

Then open http://localhost:3000.

## Test it

```bash
npm run lint
npm run build
npx playwright install chromium   # first time only
npm run test:e2e
```

The end to end tests start the dev server themselves. To test a deployed site instead:

```bash
PLAYWRIGHT_BASE_URL=https://your-preview-url.vercel.app npm run test:e2e
```

## Add a game

1. Put the finished, self-contained game file at `public/games/<slug>/index.html`.
2. Add a cover image at `public/games/<slug>/cover.jpg` (1200 x 630 works well, it is also the link preview image).
3. Add an entry to `data/games.ts` with the slug, title, short title, description, selection code, `gamePath` and `cover`.
4. If the game has source code, keep it in `games/<slug>/` with its own README.

The game then appears on the jukebox and gets its own page at `/play/<slug>`, which is the link to share.

To list a game before it is ready, add an entry with `comingSoon: true` and a `labelHue` instead of `gamePath` and `cover`. The placeholder records in `data/games.ts` sit in their own marked block, so they are easy to delete.
