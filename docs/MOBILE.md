# Mobile & tablet

How to make the web app play well on phones and iPads: what works today, what breaks, and a
plan sized to where the app is now.

Status: **Steps 0, 1 and 2 done; Step 3 done in emulation (layout, every popup and card pick, and whole games played by tapping with `npm run mobile:play`), its real-device checks still to do; Step 4 (zoom) brought forward and built 2026-10-07, and with it the phone-portrait bottom sheet; real-device check of both to do. Step 5 (home-screen app, offline, automatic updates) built and tested in Playwright (`npm run pwa:check`) 2026-10-07; the G55 checklist is in Step 5.** First written
2026-10-02 as a proposal. Revised 2026-10-06 after measuring the build in device emulation
(`npm run mobile:shots`: Playwright + Chrome; iPhone SE, iPhone 15, Moto G55 and iPad mini,
portrait and landscape). On the real Moto G55 so far: the default map (fine) and Asymptote
(broken, fixed since); see *Progress* below.

Everything dated before 2026-10-27 was measured while this was Cubic, on Quantum's modes and square maps
(Classic, Community, 3×3 to 7×7 tiles). Regolith plays hex maps only, in two modes, Basic and Regolith; the
findings about layout hold, the map sizes and mode names in them are Cubic's.

**Reference devices:**

| Device | CSS viewport | Notes |
|---|---|---|
| **Moto G55** (Android, Chrome) | 412×915 screen, ≈ 412×800 visible | Christian's phone: the primary real-device check |
| iPhone SE (1st gen) | 320×568 | Playwright's "iPhone SE" preset; stands in for the narrowest phones (today's SE is 375 wide) |
| iPhone 15 | 393×852, ≈ 393×659 visible | iOS Safari specifics |
| iPad mini | 768×1024 | tablet, both orientations |

The Moto G55 is 1080×2400 at a device pixel ratio of ≈ 2.625. The visible height subtracts
Chrome's address bar and Android's navigation bar, and changes as the address bar hides.

---

## Progress

**2026-10-06** (one session; commits `6262692`, `b8accec`, `9c93b91` and the popup commit after them):
- **Step 1 done.** The board always fits its box, so phones never zoom out. The phone stage
  uses the visible height (portrait: square; landscape: full height). Notch-safe, no
  double-tap zoom, no sticky hover, 44px tap areas on touch.
- **Wide-map bug found on the G55 and fixed.** Asymptote (15 cells across) made the page 504px
  wide on a 412px screen; the phone's single grid column couldn't shrink below the board
  (`1fr` → `minmax(0, 1fr)`).
- **`mobile:shots` checks more:** a wide map, and every setup popup (fleet roll, starting
  skill) must have its buttons and cards on screen without scrolling.
- **Setup popups fit phones** in both orientations (part of Step 3).
- **Result:** 28 of 28 device × map checks pass (was 2 of 21 at the start of the day).
- **Testing on the G55** is by eye through the GitHub Pages build. USB remote debugging was
  dropped (Step 0).
- **Step 2 done (same evening):** tap an opponent's ship (or any ship or planet when the tap has
  nothing else to do) for a bubble with its info; stats, tracks, cubes, action pips and scrapyard
  dice explain themselves on tap too. Checked in G55 emulation on Asymptote.
- **Refactor before Step 2:** default seats in one place (`game/seats.ts`, used by the lobby and
  the dev link), `--topbar-h` instead of a repeated 52px, and a `useMediaQuery` hook so the
  fleet-roll dice resize when the phone is turned.
- **On the real G55:** Asymptote now fits but its cells are about 26px (ships ≈ 15px). That is
  the expected limit of fit-to-screen; bigger needs zoom (Step 4). Tapping a ship for its info
  helps in the meantime.
- **Step 3 layout (late evening):** below 980px the turn panel is a compact bar stuck to the
  bottom of the screen, with your scrapyard in it whenever you can deploy; phone landscape has the
  board on the left and one scrolling column on the right; on iPad portrait the players and log
  sit side by side; the market starts collapsed on phones. A first version passed the old checks
  but, played to a real turn, covered a third of the board on the iPhone SE and left the ships to
  deploy off screen on the iPad, so `mobile:shots` now plays to your first turn and checks that
  (see Step 0). 28 of 28 pass; the matrix runs devices in parallel (≈ 2 minutes).
- **In-game popups checked (late evening):** `mobile:shots` now also opens combat, Change of Heart,
  game over and the rules on every device (dev link `&scene=combat|changeOfHeart|over|turn`). Combat
  was twice the screen's height on phones; fixed (Step 3). All 7 devices pass.

**2026-10-07:**
- Phone portrait became map + bottom sheet, the board zooms (Step 4, brought forward), and the
  selected ship's row never wraps (see Steps 3–4).
- Zoomed in, the map follows opponent and AI moves that land off screen (Step 4).
- Step 1's last emulated item (market re-fit at ≥ 980px) checked: works.
- **Step 5 built:** service worker (offline vs AI) with updates that never interrupt a game.
- **Step 5 made testable:** the lobby shows the build (commit and time) with *Check for updates*;
  `npm run pwa:check` tests offline play and every update path on real builds; a reload during a
  game on this device (an update, pull to refresh) now brings the game back instead of the lobby.

- **Whole games played in emulation:** `npm run mobile:play` (Step 0) taps through 2p Basic and 3p Regolith
  games (until 2026-10-27, Cubic's 2p Basic, 3p Classic and 4p Community), setup to game over, on the G55 (both orientations) and the iPhone SE. It found:
  - **A card pick hid cards on phones:** the open market was one sideways-scrolling strip, so the third card
    of a row was off screen. Now each deck is a row of three cards sharing the width (Step 3). It was the same
    on the iPad (Community's seven cards): while you pick, a row that doesn't fit wraps. `mobile:shots` now
    opens a pick on every device (`-pick`, `-pickClassic`).
  - **The AI took minutes over Unveil the Fleet** (4p Community, all its ships destroyed), "thinking…" all
    the while: about 4½ minutes with five ships to place, and 3½ for one step with a skill that deploys to
    any isolated space (a hundred spaces per ship). Looking ahead, it tried every re-roll, ship and space at
    every step; now it looks ahead with the remaining ships on their first space (where each goes is still
    chosen, one per decision). Also, states share the board's cells instead of copying them, which was most
    of the AI's time. Now about 10 s for five ships on the Mac, no step over about 2 s; every AI decision
    is faster, which matters more on a phone.
  - **A die could take a tap meant for something else:** a 3D die turned to show some faces has one face
    edge-on, which Chrome hit-tests as a thin invisible line reaching well beyond the die. On the iPhone SE
    such a line crossed the planet above a selected ship, so *Conquer* did nothing, by touch or mouse. The
    cube no longer takes taps (its box and the ship's space still do). `mobile:play` now requires a tap on the
    map to reach the ship, space or planet itself.
  - **Phone landscape: after taking a card lower in the column, the turn panel stayed scrolled out of view.**
    It now scrolls back into view when the pick ends.
- **Next:** play Step 3 on the G55 (2p Basic and 3p Regolith, setup to game over), then Step 4. Still to check from
  Step 1: the board re-fit when the market opens/closes on screens ≥ 980px.

---

## 1. What changed since the first draft

Online play (shared links, async turns) makes the phone much more important. The likeliest way
someone joins a game now is by tapping an invite link in a chat app on their phone.

Already done, mostly as side effects of other work:

| Item | Where |
|---|---|
| Dev server reachable on the LAN (`host: true`, LAN address used in invites) | [vite.config.ts](../apps/web/vite.config.ts) |
| Market is collapsible, remembers the choice, opens itself during a card pick | [Market.tsx](../apps/web/src/components/Market.tsx) |
| Cards (skills, tech, decks) open a large `CardViewer` on tap, so card text works on touch | [PlayerList.tsx](../apps/web/src/components/PlayerList.tsx), [CardViewer.tsx](../apps/web/src/components/CardViewer.tsx) |
| Ships and highlights take the whole cell as their tap area (option G for ships) | [Board.tsx](../apps/web/src/components/Board.tsx) |
| Full screen on Android and on the app installed on a computer: from the opening's click to start, back after the phone drops it; a button to leave or return. Not on iPhone (no API) or iPad (Safari's misbehaves) | [fullscreen.ts](../apps/web/src/fullscreen.ts), [FullscreenButton.tsx](../apps/web/src/components/FullscreenButton.tsx) |
| Lobby and dialogs (fleet roll etc.) fit a 320px phone, *as long as the board doesn't widen the page* (§2, point 1) | |
| Invite uses the native share sheet on touch devices | [OnlineScreen.tsx](../apps/web/src/online/OnlineScreen.tsx) |

Not started: everything else in the old Phase 1 (`100vh`, safe areas, `touch-action`, hover
effects, 44px targets, tooltips), plus the layouts and zoom.

---

## 2. Where we are (measured)

Below 980px the layout is a single scrolling column (board, market, sidebar). The stage is
`min(100vw, 70vh)` tall, and cells are fitted to it with a **34px minimum**
([Board.tsx](../apps/web/src/components/Board.tsx) `useCellSize`). Ships are drawn at 56% of a
cell (about 19px at the minimum), but they are tapped on the whole cell.

Cell size as rendered today. **"floor"** means the fit wanted less than 34px, so the board is
bigger than its box:

| Device (CSS px) | 3×3 Basic 2p | 5×5 Classic 4p | 7×7 4p |
|---|---|---|---|
| iPhone SE portrait (320×568) | 34 (floor) | floor, board 510px wide | floor, 714px |
| iPhone 15 portrait (393×659) | 42 | floor, board 510px wide | floor, 714px |
| iPhone 15 landscape (734×343) | floor (fit ≈ 26) | floor | floor |
| **Moto G55** portrait (412×800) | 44 | floor, board 510px wide | floor, 714px |
| **Moto G55** landscape (867×340) | floor (fit ≈ 26) | floor | floor |
| iPad mini portrait (768×1024) | 78 | 47 | floor (fit ≈ 33) |
| iPad mini landscape (1024×768) | 72 | **floor**, because the market takes ≈ 185px | floor (fit ≈ 24) |

What this means in practice:

1. **Phones, maps of 5×5 and up: the page zooms out.** A 510px board on a 393px (iPhone) or
   412px (Moto G55) screen widens the layout viewport to 518px, so the mobile browser shrinks
   the *whole page*, or leaves it wider than the screen. The board also overflows its stage and
   the market cards draw over its bottom row, and dialogs centre on the wider page, so the fleet
   roll's *Keep fleet* button is half off the screen on the G55. This is the worst bug and the
   cheapest to fix.
2. **Phone landscape breaks even 2-player maps** (the stage is only 240px tall).
3. **iPad landscape with cards (Classic/Community) on 5×5** reaches the 34px floor because of
   the market. Collapsing the market helps, but the board doesn't get bigger until the next
   resize.
4. **You scroll away from the board to act.** On an iPhone 15 the turn panel starts about 60px
   above the bottom of the screen. *End turn* and the ship actions are below the fold, and the
   page is 1,000–1,500px tall.
5. **Ship and planet info is hover-only.** Ability text and planet capacity live in `title=`
   (≈ 70 `title=` attributes across the components). Tapping an opponent's ship does nothing,
   so on touch there is no way to read what it does. Your own ships show their ability in
   ShipPanel when selected.
6. **Touch basics still missing:** `100vh` in `.modal`; no `viewport-fit=cover` or safe-area
   padding; no `touch-action` (double-tap zooms the page); 22 `:hover` rules that stick after a
   tap; `.icon-btn` 32px, `.mini-btn` ≈ 18px, and 13–18 buttons under 44px on a game screen.

Map sizes per player count (from `data/maps.yaml`), which decide how much zoom matters:

| Players | Common sizes |
|---|---|
| 2 | 3×3, 3×5 (most); a few 4×4, 4×5 |
| 3 | 3×3 to 5×5, spread evenly |
| 4 | **5×5 (10 maps)**; 3×3, 3×5, 4×4; a few 6×6, 5×7, 7×7 |
| 5 | 3×3, 5×5; one 10×1 |

Basic's default maps (3×3) already play OK on a portrait phone (44px cells on the Moto G55,
42px on an iPhone 15). Most 4-player games don't.

---

## 3. Target

The previous draft aimed straight at "one-handed 4p on an iPhone SE". That is still the end
goal, but a realistic order is:

1. **Nothing broken on any device.** No page zoom-out, no overlap, no sticky hover, every piece
   of information reachable by touch.
2. **iPad great, phone good for 2–3 player maps**, which covers the "join a friend's online
   game from a link" case.
3. **Phone good for 4–5 player maps.** This needs board zoom and is the expensive part.

---

## 4. Plan

Each step can ship on its own and leaves desktop as it is or better. Sizes are rough. The
tools and libraries named here are compared in §5.

| Step | Size | Gets us | Checked by |
|---|---|---|---|
| 0 Test setup ✅ | ½ day | One command shows every device; HTTPS on the phone | — |
| 1 Stop the breakage | ½ day | Nothing broken anywhere (target 1) | `mobile:shots` passes; G55 by hand |
| 2 Info on touch | 1 day | Ship and planet info by tap | iPad-size emulation; G55 |
| 3 Phone layout | 1–2 days | No scrolling to act; landscape works (target 2) | `mobile:shots` + G55 + one BrowserStack iOS pass |
| 4 Board zoom | 3–4 days, 1-day spike first | 4–5 player maps on phones (target 3) | G55 + one BrowserStack iOS pass |
| 5 Home-screen app | ½–1 day | Fullscreen on iPhone, offline vs AI | Pages deploy on the G55 |

Steps 1–3 come first; Step 4 is the big one and can wait until they are in.

### Step 0: Test setup ✅ (2026-10-06)
- [x] **`npm run mobile:shots`** ([scripts/mobile-shots.ts](../scripts/mobile-shots.ts)): starts
      its own dev server, opens a 2p 3×3, a 2p wide map (Asymptote, 15 cells across), a 4p 5×5
      and a 4p 7×7 game on the 7 device sizes from §2, screenshots each setup popup (fleet roll,
      starting skill) and the game to `test-results/mobile/` (git-ignored), and prints the cell
      size and page size for each. It **exits with 1 when a layout is broken**: page wider than
      the screen, board bigger than its stage, or a setup popup with buttons or cards off screen
      (you'd have to scroll inside it). 2026-10-06 after Step 1: board and page pass everywhere;
      16 of 28 failed on popups, fixed the same day (Step 3's setup popups): 28 of 28 pass.
      `--url` checks a running dev server instead, `--webkit` uses WebKit (needs
      `npx playwright install webkit`). It then plays on to your first turn: while you place
      your ships, the scrapyard must be on screen and not covered; with a ship selected, so must
      *End turn* and the ship's buttons, and the turn bar must not cover the board (screenshot
      `-turn`). Devices run in parallel: about 2 minutes.
- [x] **`npm run mobile:play`** ([scripts/mobile-play.ts](../scripts/mobile-play.ts), 2026-10-07): plays
      whole games by tapping, on the G55 (both orientations) and the iPhone SE: 2p Basic and 3p Regolith
      (Cubic's 2p Basic, 3p Classic and 4p Community when it was written). On your turn the level-1 AI chooses (so you conquer, research and take cards) and the script
      taps it out; every decision, popup and card pick is taken by a tap. Reports every tap on something off
      screen or covered, a game that stops moving (saving its state as `-stuck.json`), page errors, and a game
      that doesn't end. Screenshots of the first of each kind of decision in `test-results/mobile-play/`.
      `--device`, `--game`, `--seed`, `--random` (random taps only). Takes 5–10 minutes, so it isn't in CI.
- [x] **Dev link straight into a game** ([devStart.ts](../apps/web/src/game/devStart.ts), dev
      server only): `?play=classic&players=4&map=tesseract&seed=1`. `play` takes a mode's id or
      name; `map` defaults to the basic map; `seed` repeats the same dice. One human
      (Commander) against AI. Reloading starts it again; it replaces the saved game, like any new
      game. Not in production builds.
- [x] **`npm run dev:https`**: the dev server with a self-signed certificate
      (`@vitejs/plugin-basic-ssl` v1; v2 needs Vite 6). On the phone open
      `https://<Mac's LAN address>:5173/`, accept the warning once, and the share sheet and
      clipboard work.
- ~~**Moto G55 remote debugging** over USB (`chrome://inspect`)~~ dropped 2026-10-06: the phone
      stayed at "Pending authentication" (no *Allow USB debugging?* prompt), and installing
      `adb` hit Gatekeeper. Real-device checks are by eye instead: the dev server over Wi-Fi
      (phone and Mac on the same network, no client isolation) or the GitHub Pages build.

**Done when:** one command produces the device matrix ✅.

### Step 1: Stop the breakage (small, ½ day)
- [x] **Board never wider than its box.** In `useCellSize`
      ([Board.tsx](../apps/web/src/components/Board.tsx)) drop the 34px floor: always fit (8px floor, only against zero). Tap
      areas are already full cells, so 25px cells on a 5×5 are tight but usable, and far better
      than a zoomed-out page; 7×7 on a phone (≈ 17px) stays poor until Step 4.
- [x] Stage height on phones: give the board the space it needs, e.g.
      `height: min(100vw, calc(100dvh - topbar - turn bar))`, and in landscape let the board
      use the full height.
- [x] Re-fit the board when the market collapses or expands. Checked 2026-10-07 (Classic 4p 5×5,
      Playwright): the stage really resizes, e.g. 34 → 43px cells at 1024×768 when the market
      collapses and back when it opens, never overflowing; same at 1280 and 1440.
- [x] `viewport-fit=cover` + `env(safe-area-inset-*)` padding; `100vh` → `100dvh` (`.modal`,
      and anywhere else that is sized by the viewport).
- [x] `touch-action: manipulation` on the app; `user-select: none` and
      `-webkit-touch-callout: none` on the board and the dice.
- [x] Wrap the 22 `:hover` rules in `@media (hover: hover)`.
- [x] `@media (pointer: coarse)`: 44px minimum for `.icon-btn`, `.mini-btn`, segmented
      buttons, topbar buttons (padding or a larger hit area via `::after`, so things don't look
      bloated).

Done 2026-10-06: `npm run mobile:shots` passes 21 of 21 (G55 cells: 3×3 44px, 5×5 26px,
7×7 19px portrait; 31 / 18 / 13px landscape). The stage is
`min(100vw, 100dvh − topbar − safe areas)`; the hit areas are a centred `::after`, so the
buttons look the same. The market re-fit checked 2026-10-07 (see above). Not yet checked: everything on the real G55.

**Done when:** `npm run mobile:shots` reports no problems (it checks the first two points
on every device), and on the G55 a double-tap never zooms the page and nothing sticks after a
tap.

### Step 2: Info on touch ✅ (2026-10-06)
- [x] **Tap any ship to see its info.** `onDie` / `onPlanet` in
      [controller.ts](../apps/web/src/game/controller.ts) now return whether the tap did
      anything; when it didn't (an opponent's ship, your own outside your action phase, a planet
      that isn't highlighted), the board shows a bubble: owner, ship, value and ability, or the
      planet's free cube spaces and whose cubes are on it. Tapping it again or anywhere else
      closes it. Ships and planets keep `title=` for mouse users.
- [x] **`Tip` / `InfoPop`** ([InfoPop.tsx](../apps/web/src/components/InfoPop.tsx)): one bubble
      for things that aren't controls, on hover with a mouse and on tap with a finger. Built on
      the **Popover API** (top layer, light dismiss) and **CSS anchor positioning** (above the
      thing, flips below, kept on screen); without anchor positioning it sits at the bottom of
      the screen. Replaces `title=` on the dominance and research tracks, cubes, player stats,
      action pips and their badges, and scrapyard dice (a deployable die still deploys on tap).
- Left as `title=`: buttons (their label says what they do; the title is a desktop extra), the
      lobby, market chips and decks (a tap opens the card viewer), the ✦ badge (now in the ship
      bubble).
- [ ] Long-press for info on actionable things (own ships during your turn, highlighted
      planets): skip unless real-device testing shows it's needed. Your selected ship's ability
      is already in ShipPanel.

**Done when:** on an iPad you can find every piece of information without a mouse. ✅ in
emulation; G55 by eye still to do.

### Step 3: Phone layout, minimal version (medium, 1–2 days)
Keep the scrolling column, but pin what matters:
- [x] **Sticky bottom turn bar** below 980px: the TurnPanel (with ShipPanel) itself in a compact
      form, `position: sticky; bottom: 0`. Compact: "Turn 4" beside the name, the hint at most 3
      lines (2 below 400px), the selected ship one row (ability text hidden, a tap on its name
      shows it; below 400px no die and Undo is just its icon). Your scrapyard is in the bar
      whenever you can deploy (setup placement, your action phase, Unveil). During a card pick
      the bar lets go (`:has(.market.picking)`), so it can't cover the cards. The sidebar becomes
      `display: contents` so its panels join one flex column (board, market, online panel,
      players, log, turn panel). The turn panel goes **last**: pinned to the bottom of the screen
      while you're higher up, in its own place at the end, so it never hides the log. Flex, not
      grid, because a sticky grid item can't leave its grid area.
- [x] Board first and fully visible on load; market (collapsed by default on phones unless the
      player chose otherwise), players and log below it. In portrait the stage leaves 160px
      below it for the turn bar (only matters on short, wide screens).
- [x] Phone landscape (below 980 × 500, landscape): board on the left at full height (sticky,
      spanning the rows), one scrolling column on the right: turn panel, market, players, log.
      G55 cells: 31 / 23 / 18 / 13px.
- [x] Overlays at 320–393px ✅ (2026-10-06), checked by `mobile:shots` on every device (`-combat`,
      `-changeOfHeart`, `-over`, `-rules` screenshots), opened through the dev link's `scene`.
      Setup popups: below 600px wide or 500px high, popups have less padding, two-card choices
      (starting skill, Peek, market) sit side by side and shrink, with text scaled by container
      units; on short screens (phone landscape) the fleet roll is compact with 54px dice.
      **Combat was broken on every phone:** below 980px the two sides stacked, making the battle
      ≈ 850px tall with *Resolve battle* off screen and no way to scroll to it. Now the sides stay
      side by side with 40px dice and tighter spacing; in phone landscape each side's roll and
      ship share a row and the rule sits beside the verdict; the battle box scrolls as a last
      resort. Change of Heart and the rules scroll their content with the heading (and ×) in view;
      game over fits as it was.
- [x] iPad portrait: the player list and log side by side (the turn panel is the sticky bar),
      log capped at 420px. The page is still ≈ 1,700px on a 4p map; the bar means you don't
      need to scroll it to act. The open market sits under the bar until you scroll (not during a
      pick, see above).

- [x] **Phone portrait: map + bottom sheet** (2026-10-07, replacing the scrolling column, which
      itself had replaced the sticky bar). Below 700px wide, upright, nothing scrolls but the sheet:
      the map fills the screen above the sheet's resting height, and the sheet
      ([BottomSheet.tsx](../apps/web/src/components/BottomSheet.tsx), hand-rolled, no Vaul) shows the
      turn panel at rest; drag or tap its handle for the online panel, market, players and log (the
      sheet opens by itself while you pick a card, scrolled to the market, which stays first). A tap on the dimmed map
      or Esc shuts it. Its resting height only grows during a game, so the map doesn't jump when
      the turn panel gains the ship row. With no page scroll, every touch on the map is the zoom's
      (Step 4). Landscape, tablets and desktop are unchanged.
- [x] **The selected ship's row is always one line** (2026-10-07): its name and every action button. In a narrow
      turn panel (container query, ≤ 540px: phone portrait and the landscape column) the die is left out (the
      ship glows on the board), buttons are tighter and long labels get short ones (*→ 3*, *Switch*, *Carry*,
      *Tactical*, *Sacrifice*; the full text stays as `aria-label`). The name is cut short before the buttons
      shrink; only if they still don't fit (rare skill combinations) do they scroll sideways. `mobile:shots`
      selects each of your ships and fails if a row wraps or its buttons scroll.
- [x] **Zoom feel** (2026-10-07): the zoom buttons, "whole map", the edge arrows and mouse-wheel
      notches glide (eased, ~250ms) instead of jumping; a flung map carries on and slows down;
      pulled past an edge or the zoom limits it rubber-bands and springs back. Still to try on the G55.

- [x] **Card picks on phones** (2026-10-07): the open market was one strip that scrolled sideways, so the
      third card of a row was off screen. Below 600px wide and in phone landscape, each deck is a row: its name
      and count on a line, then three cards sharing the width (taller rather than narrower). Community's
      seventh card (Expansion) is below the fold of the sheet, which scrolls. Wider screens wrap a row that
      doesn't fit onto a line of its own while you pick (the iPad's Community market), and keep one strip
      otherwise.
- [x] **Whole games in emulation** (2026-10-07): `mobile:play` plays 2p Basic, 3p Classic and 4p Community
      to game over on the G55 (both orientations) and the iPhone SE, with nothing off screen or covered.
- [ ] Check one full turn on the G55 for smoothness (no remote profiling, see Step 0): 3D dice,
      four `backdrop-filter` blur layers, explosions. Its Dimensity 7025 is mid-range and the screen runs at 120 Hz.
      Only optimise what the profile shows.

**Done when:** a 2p Basic game and a 3p Regolith game, setup to game over, can be played on
the Moto G55 (and on an iPhone, through BrowserStack) without scrolling to act; a full 4p
Regolith game is comfortable on an iPad in both orientations. `mobile:shots` checks that *End
turn* (or, on another player's turn, the turn panel's head) is on screen ✅.

### Step 4: Board zoom (brought forward 2026-10-07; built, real-device check to do)
Brought forward because the phone layout's spacing can't be settled until the map can zoom (the
map + bottom sheet layout depends on it).

**Own Pointer Events, not `react-zoom-pan-pinch`** (decided 2026-10-07). The library keeps the board
under a CSS `transform: scale()`, so 3D dice (`preserve-3d`) and text are rasterised at the fitted
size and go soft when zoomed, and `onBoardClick`'s cell maths would have to undo the scale. Ours
commits the zoom as `cell`, so everything redraws crisp. The gestures are one hook
([useBoardZoom.ts](../apps/web/src/components/board/useBoardZoom.ts)), its geometry pure functions
([zoomGeometry.ts](../apps/web/src/components/board/zoomGeometry.ts), unit-tested), and the buttons,
edge arrows and demo [ZoomUi.tsx](../apps/web/src/components/board/ZoomUi.tsx). Revisit only if
the G55 shows gesture problems we can't fix.

- [x] Pinch (touch), drag to pan once zoomed (touch or mouse), wheel zoom (Ctrl / trackpad pinch,
      or any wheel when nothing around the board scrolls). Bounds: the fitted size to 80px spaces;
      no zoom where that's less than 15% bigger.
- [x] During a gesture a CSS `transform` on `.board` (the wrap clips); when it ends (the wheel:
      150 ms still), commit by changing `cell` and drop the transform.
- [x] Tap vs drag: under 8px of movement is a tap; a drag swallows the click that follows it
      (within 400 ms). A mouse released outside the map ends its drag.
- [x] `touch-action: none` on the board while zoomed; `pan-x pan-y` at the fitted size, so the
      page still scrolls over it.
- [x] Buttons: zoom in / out / whole map with a mouse; on touch only *Whole map*, while zoomed (so
      they don't cover the corner space).
- [x] Zoomed in: an arrow at each edge beyond which something is highlighted (spaces, planets,
      ships you can pick), with a count; a tap pans to the nearest.
- [x] A map of another size starts at the whole map.
- [ ] **On the G55:** a pinch at the fitted size while the portrait page can scroll. If the
      fingers drift, Chrome may take it as a page scroll and cancel it part-way. The map + bottom
      sheet layout (no page scroll, the board takes every touch) is the real fix.
- [x] **Follow opponent and AI moves** (2026-10-07): zoomed in, a ship this screen doesn't play for that
      moves or arrives off screen glides the map to it at the same zoom (`useFollowMoves` in
      [ZoomUi.tsx](../apps/web/src/components/board/ZoomUi.tsx), `reveal` in useBoardZoom). Never at the whole
      map, never while a finger is on the map, never for your own moves. Checked in G55 emulation on Event
      Horizon against three AIs (one-off script): off-screen moves bring the map, on-screen ones don't.
- [ ] Optional: double-tap to zoom, a mini-map.
- [x] Pinch test in `mobile:shots` (2026-10-07): on every touch device, on your turn, a synthesised
      pinch (`Input.synthesizePinchGesture`), a one-finger pan and *Whole map*. Checks the spaces grow,
      the pan moves the map without moving a ship or scrolling the page, and *Whole map* fits it again.
      Chrome only. All 30 touch device × map cases pass (iPad Alpha Sector doesn't zoom: spaces big already).

**Done when:** a 5×5 4-player map is playable on the Moto G55 and an iPhone with ships
≥ 44px when zoomed in, and panning never makes a move.

### Step 5: Home-screen app (built 2026-10-07; G55 check to do)
More useful now that online games are async: people come back to a game over days.
- [x] Manifest, icons (any + maskable) and `apple-mobile-web-app-capable` (done earlier with the
      fullscreen work: [manifest.webmanifest](../apps/web/public/manifest.webmanifest), hand-made icons,
      so no `@vite-pwa/assets-generator`). This is also the only way to get fullscreen on an iPhone.
- [x] **Service worker** for offline play against the AI: `vite-plugin-pwa` v2 (`generateSW`, our own
      manifest kept) in [vite.config.ts](../apps/web/vite.config.ts), registered in
      [pwa.ts](../apps/web/src/pwa.ts), production builds only (the dev server and `mobile:shots` don't
      get one). Precaches the whole build (12 files, ≈ 740 KB, the AI worker included); Google Fonts
      are cached on use, so from the second online visit on they work offline too (before that,
      offline falls back to system fonts).
- [x] **Automatic updates, never mid-game.** Not the plugin's `autoUpdate`, which reloads whenever a
      new version arrives, possibly mid-combat. Instead a new version goes live straight away if it is
      found within 10 s of opening, otherwise the next time the app goes to the background (the
      reload is unseen). The app checks for a new version every time it comes back to the
      foreground and hourly while it stays there (a desktop tab), so it is never more than one
      resume behind. This also keeps old clients out of online games.
- [x] **The game comes back after the reload** (fixed 2026-10-07; before, the app reopened on the
      lobby). While a game on this device is on screen, a per-tab flag in `sessionStorage` says so,
      and a reload resumes the saved game (it is saved on every change). Also covers pull to
      refresh. Online games were already fine: their link is in the address.
- [x] **Which version is this?** The lobby's last line: `Version <commit> · <build time>` (a `+`
      after the commit: built from uncommitted changes; `dev` on the dev server) and
      *Check for updates*, which switches to a new version at once (*Up to date*, *Offline* or
      *Couldn't check* otherwise).
- [x] **`npm run pwa:check`** ([scripts/pwa-check.ts](../scripts/pwa-check.ts), ≈ 45 s): builds four
      versions, serves them one at a time under `/app/` with Pages' 10-minute HTTP cache, and in
      Chrome at G55 size checks: every file is precached; offline (server down too) the app opens
      and a game against the AI starts; a new version found on return to the app waits while you
      play, takes over when the app goes to the background, and the game is back on screen; an app
      just opened switches at once; *Check for updates* switches, then says *Up to date*. Run it
      after touching [pwa.ts](../apps/web/src/pwa.ts), the PWA config or saved-game loading.
- [x] Scope and start URL with the `./` base: served under `/app/` like Pages, the scope is
      `/app/`. Checked in Playwright: offline reload shows the lobby and a game against the AI
      starts; a new `sw.js` waits while you play, goes live when the page is hidden, and applies at
      once on a page just opened.
- [ ] **On the G55** after the Pages deploy (check the deploy finished: the repo's *Actions* tab,
      or `gh run list -L 1`):
      1. Open the Pages URL in Chrome; the lobby's version is the commit just pushed
         (`git log -1 --format=%h`). Chrome's menu → *Install app* / *Add to Home screen*.
      2. Open it from the icon: no address bar. Start a game against the AI, play a turn.
      3. Flight mode, swipe the app away, open it from the icon: the lobby opens, the game resumes,
         the AI moves.
      4. Push any change. Once deployed, open the app: within ~10 s it reloads by itself and the
         lobby shows the new commit. Or, mid-game, switch to another app and back: the game is
         still there, and back in the lobby the version line shows the new commit.
      5. If it ever seems stuck on an old version: *Check for updates* in the lobby.
- [ ] Screen Wake Lock during a game, if it turns out to matter.
- Turn notifications would need a push server, which goes against the no-server rule. Out of
  scope.

### Later / ideas
- Pass-and-play on iPad: a "hand over" screen between human players.
- Haptics on combat results (Android only; iOS Safari has no `navigator.vibrate`).

---

## 5. Tools, libraries and services

Researched 2026-10-06. Free options come first; nothing here needs a server of our own.

### Testing

| Tool | Cost | What it gives us | Use it for |
|---|---|---|---|
| **Moto G55 + Chrome remote debugging** (USB, `chrome://inspect` on the Mac) | free | Real Android Chrome with full DevTools on the phone's page: console, element picker, performance profiles on real hardware | Every step's real-device check; profiling |
| **Playwright** device emulation (the installed Chrome via `channel: 'chrome'`) | free | Layout matrix in seconds; screenshots; `toHaveScreenshot` for visual regression | Step 0 script; catching layout regressions |
| **Safari Responsive Design Mode** (Develop menu, already on the Mac) | free | Real WebKit at phone sizes. Closer to iOS than Chrome emulation, but still desktop Safari | Quick WebKit sanity checks |
| ~~iOS Simulator~~ | free, but needs full Xcode | Real Mobile Safari | **Not used**: decided 2026-10-06 not to install Xcode |
| **Android Emulator** (Android Studio) | free | Other Android sizes and Chrome versions | Only if a bug looks device-specific; the G55 covers Android |
| **BrowserStack open-source programme** | free for public repos (this one is public), needs an application | Real iPhones and iPads in the cloud, manual (Live) and automated (Playwright) | Final pass of Steps 3–4 on real iOS hardware, if no iPhone is at hand |
| **Eruda** (on-page console, loaded only with `?debug`) | free | Console and network on a phone without a cable | Friends testing online games on iPhones |

**iOS without an iPhone or Xcode (decided 2026-10-06):** routine checks use Playwright's
WebKit build and Safari's Responsive Design Mode on the Mac (both real WebKit, but desktop).
Before calling Steps 1, 3 and 4 done, do one pass on real iPhones and iPads through
BrowserStack's open-source programme. A friend's iPhone during an online game is a bonus
check. The iOS-only details (safe areas, the collapsing toolbar, the long-press callout) are
the least-tested area. Write them defensively, following the standard patterns in Step 1.

What emulation can't show: real touch and pinch feel, scroll momentum, iOS toolbar resizing,
real performance (it runs on the Mac's CPU and GPU). Hence the G55 and BrowserStack.

### Secure context on the LAN

The dev server on `http://192.168.x.x` is **not a secure context** on the phone. The share
sheet, clipboard, service worker and Wake Lock are all missing there. Inviting from the phone
currently falls back to a `prompt()`, so it looks broken in dev when it isn't. Options:

- **`@vitejs/plugin-basic-ssl`**: a self-signed certificate, so you click through a warning
  once per device. Recommended: one dev dependency behind a `dev:https` script.
- **mkcert**: a trusted local certificate, no warning, but the root certificate has to be
  installed on each phone. More setup than it's worth here.
- **The GitHub Pages deploy** is already HTTPS on every push to `main`, so it's the real test
  for share, clipboard and PWA behaviour.
- **A tunnel** (Cloudflare quick tunnel, ngrok): HTTPS plus access off the LAN, but it puts the
  dev server on the public internet. Only for a short session with a remote friend.

### Libraries

| Need | Choice | Why | Rejected |
|---|---|---|---|
| Board zoom (Step 4) | ~~`react-zoom-pan-pinch`~~ own Pointer Events (decided 2026-10-07, see Step 4) | The library's CSS scale blurs the 3D dice and text | `@use-gesture/react`: no release in 3 years |
| Info popovers (Step 2) | **Native Popover API + CSS anchor positioning** | Baseline in every major browser since Jan 2026 (Safari 26, Firefox 147): positioning and light-dismiss with no dependency | Floating UI: excellent, but only needed for older browsers. Tippy.js: legacy |
| Bottom sheet (only if Step 3 needs one) | Hand-rolled, or Base UI's drawer | Small; no gestures needed if it only opens by tap | **Vaul: unmaintained** (its author says so); shadcn/ui moved its drawer off it |
| Home-screen app (Step 5) | **`vite-plugin-pwa`** v2 + `@vite-pwa/assets-generator` | The standard for Vite; Workbox underneath; icons generated from one SVG | Hand-written service worker: more risk around update handling |

Not worth it: hosted visual-testing services (Percy, Chromatic). Playwright's own screenshots
are enough at this size. Paid device clouds beyond the free open-source programme: also not
needed.

### Playwright details

- No Moto G55 preset: use
  `{ viewport: { width: 412, height: 800 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }`
  (landscape ≈ 867×340).
- Games start from the `?play=` dev link. *Keep fleet* is disabled for 1.35 s while the dice
  land; wait for it to be enabled, then click it from inside the page (on a too-wide page it
  can be partly off screen). Event Horizon (7×7) is offered under Community, not Classic.
- Launch Chrome with `--no-proxy-server`. Otherwise its proxy auto-detection adds **12 s to
  every page load** on this Mac (the whole matrix took 5 minutes instead of 45 s).
- Playwright's own `webkit` is desktop WebKit, not iOS Safari. Treat it as a hint, not a
  verdict.

---

## 6. Open decisions

1. **Order:** Steps 0–3 first (phone good for 2–3p, iPad great), with zoom later? Or is 4p on
   a phone important enough to do Step 4 early?
2. **Stopgap for big maps on phones before zoom:** fit at small cells (recommended above), or
   a horizontally scrolling board at 34px (simpler, but swipes compete with the page)?
3. **Dependencies:** `playwright`, `@vitejs/plugin-basic-ssl` and `vite-plugin-pwa` are in (dev
   only). `react-zoom-pan-pinch` was not needed (own zoom, Step 4).
4. **Home-screen app (Step 5):** now, given async online play, or later?
5. ~~Run `mobile:shots` in CI?~~ Done 2026-10-07: the Pages workflow's `layout` job runs it in the
   runner's Chrome next to the build, and `deploy` waits for both, so a broken layout doesn't deploy.
   The screenshots are a run artifact (*mobile-screenshots*, kept 7 days).
