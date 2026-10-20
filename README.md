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
```

## Games

Each game is one finished HTML file in `public/games/<slug>/index.html`. Its source, if any, lives in `games/<slug>/` with its own build and test instructions.
