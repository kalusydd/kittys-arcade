# PLANET:13 — Interdimensional Escape (source)

The playable game is the single self-contained file `public/games/planet-13/index.html` in the site repo (three.js is bundled in; works offline).
Fonts are loaded from Google Fonts when online and fall back gracefully when not.

## Layout
- `src/content.js` — the worldbuilding ingredient library (18 themed families, cultures, characters, Registry lines)
- `src/worldgen.js` — world *concepts* → plain world records. `normalizeWorldRecord()` is the hook for future
  Intergalactic Archive records: pass a partial record and it fills in everything the game needs.
- `src/levelgen.js` — seeded level *layouts* (pure data), sized from the real jump physics
- `src/level.js` — runtime: physics, enemies, hazards, and the 3D build of a level
- `src/models.js`, `src/gfx.js`, `src/env.js` — procedural models, shaders, post-processing, sky
- `src/ui.js`, `src/main.js`, `src/audio.js` — interface, game flow, synthesized sound

## Build
Run these from `games/planet-13/`. The build writes `../../public/games/planet-13/index.html`, which is the file the site serves.
```bash
npm install --no-save three@0.169.0 esbuild@0.23.1
node build.mjs
```

## Tests
- `node test/levels.test.mjs` — validates 4,000 generated levels against the physics reach limits.
- `test/bot.js` — in-browser play-test bot. With the site's dev server running (`npm run dev` at the repo root), open `http://localhost:3000/games/planet-13/index.html?test`, then in the console:
  `eval(await (await fetch('test/bot.js')).text()); P13Bot.runAll(100, 140)` (copy `test/bot.js` somewhere under `public/` first, or paste its contents into the console).
