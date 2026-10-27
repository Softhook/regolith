# Card benchmark

Regolith's cards measured by AI self-play, 2026-10-25: about 50,000 two-player games at level 2. Every number
here is a measure of the cards **as the AI plays them**; see [Limits](#limits). The same skills were measured in
Quantum's Community rules as a control, while Regolith was a mode of Cubic; that column is kept for comparison.
The AI's card values ([cardValues.ts](../packages/ai/src/cardValues.ts)) come from these runs and Cubic's
earlier Community benchmark (2026-10-09, in this repo's history).

## Summary

- **Defence gets stronger** than in Community. Unstable Reactor and Entrenched lead, with Science Survey and
  Field Refit; one of these alone wins about 75–85% against no skill.
- **Blank as written:** Remodel, Engineering and Sneak.

## How it was measured

Measured 2026-10-25 with the AI as it is now, at level 2: about 50,000 two-player games. Regolith's
deck plays by the Community rules card for card (`effect` in
[cards.json](../packages/engine/src/data/cards.json)), except Science and Sabotage (2 actions). What
differs is the mode around them: hex maps, moves capped at 3, zones of control, contested orbits, the
Sniper and the Wisp. To separate the mode from the AI, every skill was also measured in Community at
the same level as a control.

**Skill value** (`npm run selfplay:skills`, [scripts/skill-ab.ts](../scripts/skill-ab.ts)): at the start of play
one side holds one skill and the other none; both then draft as usual. Seats swap every game and each pair of
games shares a map seed. Run at level 2 with sequential stopping (`margin=5`, up to 2,000
games): each skill stops once it is clear whether it is worth 5 points more than none, 5 less, or
neither. *Games* is how many it took. Strong skills stop after 40–70 games, so their percentages are
rough and lean high; read the order, not the exact figure. A *Change* under about 10 points is within
noise unless both sides played several hundred games. **Self-play picks** (`npm run selfplay:cards`, [scripts/selfplay-cards.ts](../scripts/selfplay-cards.ts)):
normal games in which every card is drafted; a card's win rate is the share of games won by the players who
held it. Cards are taken for claims, so the leading player takes more of them and almost every card wins more
than 50%: compare cards with each other, not with 50%. 2,000 games per mode at level 2
(19.0 turns a game in Regolith, 16.7 in Community). The AI drafts Regolith cards by their Community
values ([cardValues.ts](../packages/ai/src/cardValues.ts)), which is partly why Remodel and Arms Deal
are almost never taken.

### Skills

Ordered by skill value. *Community* is the same card's value in the control. *Drafted* columns are
from self-play picks.

| Skill (Community) | Value (games) | Community (games) | Change | Drafted win | Drafted pick |
|---|---|---|---|---|---|
| **Unstable Reactor** (Dangerous) | **84.1%** (44) | 74.2% (66) | +9.8 | 77.6% | 23.4% |
| **Science Survey** (Brilliant) | **81.3%** (48) | 83.3% (48) | -2.1 | 61.8% | 15.7% |
| **Entrenched** (Stubborn) | **80.8%** (52) | 69.8% (106) | +11.0 | 70.4% | 22.3% |
| **Field Refit** (Flexible) | **77.6%** (58) | 68.1% (94) | +9.5 | 51.9% | 11.6% |
| **Martial Law** (Tyrannical) | **77.6%** (58) | 93.3% (30) | -15.7 | 62.8% | 25.7% |
| **Armour Piercing** (Ferocious) | **75.8%** (66) | 80.8% (52) | -5.0 | 59.6% | 18.9% |
| **Advance** (Tactical) | **75.0%** (64) | 75.8% (66) | -0.8 | 63.8% | 41.1% |
| Close Protection (Strategic) | 72.2% (72) | 66.7% (90) | +5.6 | 52.9% | 6.0% |
| Double Time (Steadfast) | 71.6% (88) | 76.4% (72) | -4.8 | 46.4% | 16.1% |
| Infiltration (Stealthy) | 69.8% (86) | 67.8% (90) | +2.0 | 52.6% | 16.4% |
| Hacking (Intelligent) | 67.6% (108) | 84.1% (44) | -16.5 | 60.7% | 16.1% |
| Tune Up (Agile) | 66.7% (126) | 66.0% (94) | +0.7 | 55.6% | 25.8% |
| Paired Cannons (Brutal) | 65.9% (126) | 82.6% (46) | -16.7 | 58.7% | 25.4% |
| Trophy Hunters (Ravenous) | 65.0% (120) | 69.1% (94) | -4.1 | 46.8% | 11.6% |
| Recycle (Resourceful) | 64.6% (130) | 58.3% (278) | +6.3 | 47.1% | 8.5% |
| Exploit (Plundering) | 64.6% (144) | 62.5% (152) | +2.1 | 45.1% | 6.7% |
| Prospectors (Curious) | 64.0% (136) | 56.6% (350) | +7.4 | 36.2% | 2.4% |
| Breakthrough (Hostile) | 63.6% (140) | 61.8% (152) | +1.7 | 43.6% | 10.2% |
| Final Push (Ambitious) | 63.0% (138) | 60.7% (168) | +2.3 | 55.3% | 10.3% |
| Science (Pioneering) | 62.7% (162) | 58.5% (224) | +4.3 | 56.6% | 25.9% |
| Fanatics (Righteous) | 61.9% (134) | 57.0% (300) | +4.9 | 43.4% | 11.3% |
| Drill Sergeant (Rational) | 59.7% (206) | 73.0% (74) | -13.3 | 39.7% | 7.0% |
| Free Drop (Industrious) | 58.6% (256) | 64.4% (118) | -5.8 | 44.5% | 14.5% |
| Stand Down (Composed) | 54.7% (590) | 63.3% (150) | -8.6 | 40.5% | 4.0% |
| Rush Research (Precocious) | 54.4% (702) | 50.8% (738) | +3.6 | 24.0% | 1.3% |
| Boost (Cunning) | 53.6% (1292) | 58.4% (250) | -4.8 | 43.6% | 5.9% |
| Sneak (Devious) | 51.4% (1244) | 51.0% (902) | +0.4 | 39.7% | 3.1% |
| Stolen Flag (Prideful) | 51.3% (764) | 50.0% (396) | +1.3 | 65.0% | 19.4% |
| *No skill (control)* | *51.0%* (702) | *49.4%* (526) | | | |
| Strategic Plan (Patient) | 50.9% (638) | 50.2% (486) | +0.7 | 47.1% | 18.1% |
| Remodel (Calculating) | 50.0% (510) | 62.4% (170) | -12.4 | – (2 taken) | 0.1% |
| Engineering (Clever) | 49.7% (576) | 62.5% (152) | -12.8 | 41.9% | 2.1% |
| Signal Jammer (Ruthless) | 49.6% (500) | 51.1% (740) | -1.5 | 46.2% | 1.3% |
| Arms Deal (Profiteering) | 49.2% (610) | 50.0% (454) | -0.8 | 58.3% | 0.6% |
| Veteran Crew (Talented) | 48.4% (1062) | 50.8% (612) | -2.4 | 41.0% | 12.6% |

### Tactics and Reinforcements

Self-play picks only, level 2, 2,000 games per mode.

| Card (Community) | Picked | Win | Community picked | Community win |
|---|---|---|---|---|
| Contraband (Black Market) | 23.8% | 65.6% | 23.3% | 65.2% |
| Headhunter (Change of Heart) | 51.8% | 64.0% | 49.9% | 63.7% |
| Forced March (Momentum) | 28.8% | 61.1% | 28.9% | 58.9% |
| Reinforcements (Expansion) | 58.8% | 60.9% | 60.0% | 56.0% |
| Power Grab (Aggression) | 49.5% | 60.7% | 48.7% | 63.9% |
| Orbital Cannon (Show of Force) | 52.0% | 58.7% | 50.6% | 63.6% |
| Kill Zone (Plan Ahead) | 18.0% | 54.2% | 21.7% | 54.7% |
| Sabotage (2 actions; Community 1) | 19.3% | 53.4% | 8.8% | 52.2% |
| Ice Tunnel (Warp Gate) | 14.5% | 50.8% | 13.9% | 51.9% |
| Invasion (Unveil the Fleet) | 4.9% | 49.5% | 6.0% | 45.5% |

### Findings

- **Too strong: Unstable Reactor, Entrenched, Science Survey, Field Refit,** then Martial Law, Armour
  Piercing and Advance. One of these alone wins about 75–85% against no skill.
- **The mode makes defence stronger.** Unstable Reactor and Entrenched, both triggered by being
  attacked, gain about 10 points over Community and top the self-play picks (77.6% and 70.4% win
  when drafted). Zones of control and contested orbits already make attacks scarcer and costlier.
  Close Protection gains too (+5.6): a mech has more neighbours on hexes.
- **Field Refit gains about 10 points.** With moves capped at 3 and the Sniper and Wisp, which number
  a mech shows matters more than how far it moves.
- **Remodel and Engineering lose all their value** (about +12 in Community, nothing here, over 500+
  games each): the clearest change the mode makes. Choosing a mech's number on salvage or Refit pays
  less where high numbers no longer move further. Both are blank cards in Regolith as written.
- **Sneak does nothing** (51.4% over 1,244 games, picked in 3%), though ignoring zones of control
  looked like it should be worth more here than Devious is in Community.
- **Weak:** Stand Down, Rush Research and Boost, 54–55%.
- **Can't be valued this way:** Veteran Crew, Strategic Plan, Stolen Flag, Arms Deal and Signal
  Jammer, as the skill-value test can't see what they do: Veteran Crew does
  nothing until a fourth skill, Strategic Plan's Tactic isn't given at the start, an opponent can take Stolen
  Flag, the AI never takes Arms Deal's atomic, and Signal Jammer acts on the other side's skills. Stolen Flag wins 65% when drafted.
- **Martial Law, Hacking, Paired Cannons and Drill Sergeant** show drops of 13–17 points, but their
  Community runs stopped after 30–74 games; all but Drill Sergeant are still among the stronger skills.
- **Tactics move little.** Sabotage's second action doubled its pick rate without lifting its win
  rate. Invasion is still the weakest Tactic.
- **Card audit:** Science's uses were not counted in self-play (its effect was missing from the
  audit's conquer skills, [audit.ts](../packages/engine/test/audit.ts)); fixed 2026-10-25.

## Limits

- **The AI drafts Regolith's cards by their Community values**, so cards it undervalues (Remodel, Arms Deal)
  are rarely taken, and a card's self-play numbers say as much about the AI as about the card.
- **Arms Deal:** the AI never takes the atomic, because an atomic is worth 40 against 110–120 for a card.
- **Unstable Reactor:** the AI attacks into it knowingly when the search judges the trade worth it. That may
  be too generous.
- **One map, two players.** The skill value test used Alpha Sector only. Skills that depend on the map (Sneak,
  Infiltration) and games of 3 and 4 players were not measured.

## Reproduce

```sh
# Level 2; each skill list as one comma-separated argument
npm run selfplay:skills -- --mode=regolith --level=2 --skills=none,r-agile,...
npm run selfplay:cards -- --games=2000 --mode=regolith --level=2
npm run audit:cards -- --deep
```

At level 2 a game takes about 0.14 s; all 35 skills took about 50 minutes on 4 cores.
