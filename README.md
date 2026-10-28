# Regolith

**Regolith, a game by Christian Nold.** Mechs fight over the ice of Mars and its moons, Phobos and Deimos:
walk your mechs into the ground around a refinery or reactor, hold it, and plant your cubes where the others
can't pull them out. It is played with dice as mechs on hex tiles, in the browser or printed at a table.

Regolith is inspired by [Quantum](https://boardgamegeek.com/boardgame/143519/quantum) (Eric Zimmerman,
FunForge 2013) and its fan-made [Community Edition](https://github.com/stolksdorf/quantum), by
[Santorini](https://boardgamegeek.com/boardgame/194655/santorini) (Gord!) and by
[Amazons](https://boardgamegeek.com/boardgame/2978/game-of-the-amazons) (Walter Zamkauskas).

**Play it:** [softhook.github.io/regolith](https://softhook.github.io/regolith/). It runs in the browser,
installs to a phone or tablet home screen and plays offline.

## What's in the game

- **Two modes**, picked in the lobby: **Basic**, Regolith without cards, for learning, and **Regolith**,
  the full game with its deck.
- **Six mechs**, one for each die face, each with its own power; zones of control and contested orbits.
- **Hex maps** on Phobos, Deimos and Mars.
- **AI opponents in five levels**, picked per seat and run in a Web Worker ([AI.md](docs/AI.md)).
- **Hot-seat or online with friends**, live or one move at a time over days, with no server: the lobby makes
  an invite link, and moves travel through public Nostr relays while every browser keeps the whole game
  ([MULTIPLAYER.md](docs/MULTIPLAYER.md)).
- **Phones and tablets**: pinch zoom, a bottom sheet in phone portrait, tap anything for its info
  ([MOBILE.md](docs/MOBILE.md)).
- **The rules in the app**: *How to play* in game, and the printable manual at `#rulebook`.
- **Print**: the Art Lab (`#lab` tiles, `#lab/cards` cards, `#lab/aid` player aid) exports PNG, SVG and ZIP
  sets with or without bleed, and A4/US Letter sheets with crop marks ([GRAPHICS.md](docs/GRAPHICS.md)).

## Develop

Needs Node 22.

```bash
npm install
npm run dev        # http://localhost:5173
npm run dev:https  # the same over HTTPS, to test on a phone on your network
npm test           # every package's and the web app's tests, including full AI-vs-AI games
npm run check      # typecheck everything (tests included), then test
npm run build      # typecheck + production build in apps/web/dist
```

Cards and maps are edited in `data/*.yaml`; `npm run data` compiles them to JSON, and every script above runs
it first. Pushing to `main` deploys to GitHub Pages ([workflow](.github/workflows/pages.yml)) once the build
and the phone/tablet layout check pass.

More tools, all headless:

| Command | What it does |
|---|---|
| `npm run ai:match -- 3 4 40 regolith` | AI level vs level win rates ([AI.md § Strength](docs/AI.md#strength)) |
| `npm run audit:cards` | AI games with every card dealt, each step checked for legality and each card's effect against its text |
| `npm run selfplay:cards` | Card win, pick and use rates over AI self-play |
| `npm run selfplay:powers` / `selfplay:stalls` | What each mech's power is worth; games that stall |
| `npm run selfplay:maps -- --maps=ice-run,canyon-relay` | Map by map: game length, fighting, first-player wins; `map:show` and `map:design` lay a map's starting tunnel and barriers |
| `npm run power:usage` | How often the AI uses each power |
| `npm run test:deep` | The legal-move cross-check over many more games (minutes) |
| `npm run hex:check` / `ground:check` | The hex board and the ground tiles in a real browser |
| `npm run mobile:shots` / `mobile:play` | Phone and tablet layouts in emulated Chrome; whole games played by tapping |
| `npm run pwa:check` | Install, offline and update behaviour of the home-screen app |
| `npm run perf:probe` / `perf:zoom` | Timings on a throttled CPU (roughly a mid-range phone) |
| `npm run relays:check` | Which public Nostr relays carry online games |

## Repository

| Path | What |
|---|---|
| [`packages/engine`](packages/engine) | Pure TypeScript rules engine: `(state, action) → state`, seeded RNG, legal-move generator, invariant checks |
| [`packages/ai`](packages/ai) | AI players in five levels, from one-action greedy to whole-turn search with reply checks |
| [`packages/online`](packages/online) | Online play without a server: a game as a log of signed, encrypted posts that every browser replays |
| [`packages/art`](packages/art) | Artwork as SVG, in mm and seeded: tiles, ground, cards, player aid; shared by the game and print |
| [`apps/web`](apps/web) | React + Vite PWA: SVG board, CSS 3D dice, synthesised sound, the Art Lab, print exports and the rulebook |
| [`data/`](data) | Canonical card and map data (YAML) |
| [`scripts/`](scripts) | The headless tools above |

## Documentation

| Doc | What |
|---|---|
| [PROTOTYPING.md](docs/regolith/PROTOTYPING.md) | Regolith's rules: the design log, playtests and experiments |
| [REGOLITH.md](docs/regolith/REGOLITH.md) | How Regolith is built: its structure, cards, look and order of work |
| [REGOLITH-WORLD.md](docs/regolith/REGOLITH-WORLD.md) | Regolith's names, words and story |
| [SPLIT.md](docs/regolith/SPLIT.md) | How Regolith left Cubic for its own repository |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised; how to add actions, cards and maps; the tests |
| [AI.md](docs/AI.md) | How each AI level chooses, measured strength, next steps |
| [MULTIPLAYER.md](docs/MULTIPLAYER.md) | How serverless online play works, its limits, and the server options |
| [MOBILE.md](docs/MOBILE.md) | Phone and tablet support |
| [GRAPHICS.md](docs/GRAPHICS.md) | The art package, Art Lab and print pipeline |
| [Mood board](docs/moodboards/regolith/README.md) | The look: ground, mechs, cards and objectives |

## Inspiration

- **Quantum** — designed by Eric Zimmerman, published by FunForge.
- **Community Edition** — [stolksdorf/quantum](https://github.com/stolksdorf/quantum) and contributors.
- **Santorini** — designed by Gord!.
- **Amazons** — designed by Walter Zamkauskas.
