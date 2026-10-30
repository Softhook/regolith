<p align="center">
  <img src="apps/web/public/icon-192.png" width="96" height="96" alt="Regolith">
</p>

<h1 align="center">Regolith</h1>

<p align="center">
  <b>Mechs fight for the ice of Mars.</b><br>
  A tactical game of dice and hex tiles for 2–5 players, by Christian Nold.<br>
  Play it in the browser, against the AI or with friends online, or print it and play at a table.
</p>

<p align="center">
  <a href="https://softhook.github.io/regolith/"><b>Play now: softhook.github.io/regolith</b></a>
</p>

<p align="center">
  <a href="https://github.com/Softhook/regolith/actions/workflows/pages.yml"><img src="https://github.com/Softhook/regolith/actions/workflows/pages.yml/badge.svg" alt="Deploy"></a>
</p>

---

## The story

**Regolith**: the loose dust and broken rock that covers Mars and its moons. Everything there is built on it,
and everything gets buried in it.

> Generations ago China, America, Europe and the South each founded settlements on Mars, to send water and
> power back to Earth. Then contact with Earth was lost and the ships stopped coming. Nobody on Mars knows
> why, and nobody alive remembers Earth.
>
> What was left: five settlements that had never trusted each other, a few refineries and reactors, and
> the ice. Ice is drinking water, air and rocket fuel. There was never enough of it near the surface for
> everyone, and now no one will send more.
>
> The mechs were never meant for war. They were mining and construction walkers: they dug ice, hauled
> tanks and raised domes. The same chassis takes a drill, a crane, a sensor mast or a cannon, and in the
> first winter of the shortage every workshop on Mars learned to fit cannons.
>
> **Claim it.** Nobody can afford to destroy what they are fighting for: a cratered refinery feeds no one.
> So the war is fought for control: walk your mechs into the ground around a site, hold it, and plant your
> cubes where the others can't pull them out.

The war runs across three fronts. On **Mars** the ground is rust and the light is dusty. **Phobos** is the same
war, earlier and colder, in its dark polar craters. **Deimos**, the smaller outer moon, is the far front, its
craters drowned in dust.

Five settlements fight it, one for each seat: the **Yuropa Commune**, ice miners of the north polar cap; the
**Zhong Combine**, what is left of the Earth-chartered company; the **Merika Free Port**, traders who own the
reactors; the **Austral Collective**, farmers of the Hellas basin; and the **Bharat Concord**, dome-city clans of
the Tharsis shadow. More in [REGOLITH-WORLD.md](docs/regolith/REGOLITH-WORLD.md).

## How it plays

Your mechs are dice. A die's face is its frame: low numbers are heavy and hard to beat, high numbers are light
and quick, and each of the six has a power of its own.

| | Mech | Power |
|:-:|---|---|
| 1 | **Breacher** | Attacks an adjacent enemy without using its move |
| 2 | **Behemoth** | Carries another of your mechs as it moves |
| 3 | **Tactician** | Swaps places with any of your other mechs |
| 4 | **Chameleon** | Refits as a Tactician or a Sniper |
| 5 | **Sniper** | Shoots down a clear straight line, at any range |
| 6 | **Wisp** | Fires a permanent barrier onto the ground |

The map is laid from hex tiles. Each objective (Habitat, Refinery, Ice Mine, Reactor) carries a number from 7 to
10. To **claim** it, stand your mechs on its perimeter so their numbers add up to exactly that number, and place
one of your cubes. Each turn you have three actions: move, attack, claim, drop a destroyed mech back in, refit
(re-roll) a mech, or research.

Ground is held by standing on it. Mechs stop when they walk next to an enemy, and nobody can claim an objective
while a rival's mech stands on its perimeter. Fights are a die roll plus each mech's number: **lower wins**. Win
fights to build Power, and at 6 you **Take Over**: a cube placed anywhere there's room, contested or not.

**Place all your cubes and you win.**

Learn it in the app's animated tutorial, or read the full rules under *How to play*.

## What's in it

- **Two modes.** **Basic** is the game without cards, for learning. **Regolith** is the full game, with a deck
  of 34 Skills (kept, and always working) and 11 Tactics (played once), plus Reinforcements.
- **39 maps for 2 to 5 players** on Mars, Phobos and Deimos: compact sectors, open ground, maps where objectives
  drift off their tiles, and prepared ground with ice tunnels, wormholes and barriers already laid.
- **AI opponents at five ranks**, Cadet to General, chosen per seat. They play only legal moves, never see the
  dice to come, and think in the background so the board never freezes.
- **Online with friends, no account and no server.** Send an invite link; play live, or one move at a time over
  days. Moves travel encrypted and signed through public Nostr relays, and every browser keeps the whole game.
- **Pass-and-play** on one device, with any mix of people and AI.
- **An animated tutorial** that teaches each rule once, on a real board, then drops you into a practice game.
- **Phones, tablets and desktop.** Pinch zoom, a bottom sheet in portrait, tap anything to learn what it is.
  It installs to the home screen and plays offline.
- **Sound and music.** Synthesised effects, and an ambient score for each world.
- **Ready for print.** Every tile, card, map sheet and the player aid is drawn once and exported at physical
  size, with bleed and crop marks, on A4 or US Letter. The printable rulebook is in the app too.

## Where it stands

*October 2026.* Regolith is complete and playable end to end, in the browser and online, and every component
can be printed. It is in playtesting.

- **Rules:** settled for now, and measured over tens of thousands of AI games. Playtests with people come next.
- **Cards:** every card works. They are being renamed, redrawn and reworked one by one; the
  [benchmark](docs/card-benchmark.md) names the ones that need it.
- **Print:** files are ready; a physical proof and the choice of printers come next.
- **Licence:** not yet chosen. Until it is, all rights are reserved.

The full list is in the [roadmap](docs/ROADMAP.md).

## Inspiration and credits

Regolith began as a digital edition of [Quantum](https://boardgamegeek.com/boardgame/143519/quantum) (designed
by Eric Zimmerman, published by FunForge, 2013) and its fan-made
[Community Edition](https://github.com/stolksdorf/quantum) (stolksdorf, WaterGoesRed and contributors). It
grew into its own game: the hex board, the movement cap, zones of control, contested perimeters, the mechs'
powers, the world and its look. Its deck started as the Community cards and moves further from them with each
card reworked.

It also owes ideas to [Santorini](https://boardgamegeek.com/boardgame/194655/santorini) (Gord!) and
[Amazons](https://boardgamegeek.com/boardgame/2978/game-of-the-amazons) (Walter Zamkauskas).

## For developers

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
it first. Pushing to `main` deploys to GitHub Pages ([workflow](.github/workflows/pages.yml)) once the build,
the UI checks and the phone/tablet layout check pass.

The app's pages: the game at `/`, the printable rulebook at `#rulebook`, and the Art Lab at `#lab` (tiles),
`#lab/cards`, `#lab/aid` (player aid), `#lab/maps` (map setup sheets) and `#lab/proof` (press test).

### Repository

| Path | What |
|---|---|
| [`packages/engine`](packages/engine) | Pure TypeScript rules engine: `(state, action) → state`, seeded RNG, legal-move generator, invariant checks |
| [`packages/ai`](packages/ai) | AI players at five ranks, from one-action greedy to whole-turn search with reply checks |
| [`packages/online`](packages/online) | Online play without a server: a game as a log of signed, encrypted posts that every browser replays |
| [`packages/art`](packages/art) | Artwork as SVG, in mm and seeded: tiles, ground, cards, player aid; shared by the game and print |
| [`apps/web`](apps/web) | React + Vite PWA: SVG board, CSS 3D dice, synthesised sound and music, the tutorial, the Art Lab, print exports and the rulebook |
| [`data/`](data) | Canonical card and map data (YAML) |
| [`scripts/`](scripts) | Headless tools: AI matches, card and map benchmarks, browser checks |

### Tools

All headless.

| Command | What it does |
|---|---|
| `npm run ai:match -- 3 4 40 regolith` | AI rank against rank: win rates ([AI.md § Strength](docs/AI.md#strength)) |
| `npm run audit:cards` | AI games with every card dealt, each step checked for legality and each card's effect against its text |
| `npm run selfplay:cards` | Card win, pick and use rates over AI self-play |
| `npm run selfplay:powers` / `selfplay:stalls` | What each mech's power is worth; games that stall |
| `npm run selfplay:maps -- --maps=ice-run,canyon-relay` | Map by map: game length, fighting, first-player wins; `map:show` and `map:design` lay a map's starting tunnel and barriers |
| `npm run power:usage` | How often the AI uses each power |
| `npm run test:deep` | The legal-move cross-check over many more games (minutes) |
| `npm run hex:check` / `ground:check` | The hex board and the ground tiles in a real browser |
| `npm run ui:check` / `replay:check` | Board choices, the crash screen, and looking back over a game, in Chrome |
| `npm run mobile:shots` / `mobile:play` | Phone and tablet layouts in emulated Chrome; whole games played by tapping |
| `npm run pwa:check` | Install, offline and update behaviour of the home-screen app |
| `npm run perf:probe` / `perf:zoom` | Timings on a throttled CPU (roughly a mid-range phone) |
| `npm run relays:check` | Which public Nostr relays carry online games |

### Documentation

The full index, with who each document is for, is in [docs/README.md](docs/README.md). Start with:

| Doc | What |
|---|---|
| [RULES.md](docs/RULES.md) | Every rule stated once, precisely, with the rulings and the engine's names |
| [ROADMAP.md](docs/ROADMAP.md) | Where the project stands, and what is left |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised; how to add actions, cards and maps; the tests |
| [REGOLITH-WORLD.md](docs/regolith/REGOLITH-WORLD.md) | The story, the sides, the mechs, the objectives and the words |
