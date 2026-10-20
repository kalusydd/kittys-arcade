# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Kat and Kat's friends. A friend gets a link from Kat, opens it, mostly on a laptop, and wants to play one of Kat's games with as little in the way as possible. Kat uses the site to show off each new game.

## Product Purpose

Kitty's Arcade is Kat's personal website for the browser games Kat makes with AI. Visitors flick through the games on a jukebox and play one with a single click. Success: a friend opens the link and is playing within seconds.

## Positioning

A personal arcade, not a game portal. Every game on it is Kat's, and the site presents them like records in a jukebox Kat owns.

## Operating Context

- Links are shared one to one (chat, messages). The play page link for a game opens straight into that game.
- Mostly laptops with a keyboard. Phones still open links, so the site must look intentional there even when a game is keyboard only.

## Capabilities and Constraints

- Each game is one finished, self-contained HTML file served from `public/games/<slug>/index.html` and shown full screen in an iframe.
- One registry file lists every game. Games can be playable or marked coming soon.
- Planet 13 (Interdimensional Escape) is the first real game. It is keyboard only, with no touch controls.
- No database, logins, analytics or tracking.

## Brand Commitments

- Name: Kitty's Arcade, written with the apostrophe everywhere people see it.
- Personality: Kat's own. Playful, warm, retro, a bit cheeky.
- The home page is a jukebox. Games are records; picking one is like using a jukebox selector.
- House writing rules: no em dashes, no italics, no emoji, sentence case for buttons, no gradient text, no eyebrow labels.

## Evidence on Hand

- Planet 13: the built game in `public/games/planet-13/index.html` and its source and README in `games/planet-13/`.
- `references/` is empty for now.
- No other games exist yet. Placeholder records are clearly marked "Coming soon" and must never claim to be playable.

## Product Principles

1. One click from link to game.
2. The games are the stars; the site is the jukebox that holds them.
3. Personal and playful over polished and corporate.
4. Never promise a game or a feature that does not exist.

## Accessibility & Inclusion

Everything works with the keyboard alone, the selected game is announced to screen readers, focus is always visible, and reduced motion is respected.
