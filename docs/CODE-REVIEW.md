# Code review: open issues

A review of the whole repository as of commit `834e949` (2026-10-12) found 13 issues that
`npm run typecheck` and the tests didn't catch. All but two were resolved on 2026-10-13 and removed
from this document; the commits of that date, and this file's history, describe them. The two left
were kept on purpose, and each section says what would change that. They keep the review's numbers,
so links to them stay valid.

| # | Severity | Area | Issue | Status |
|---|---|---|---|---|
| 2 | Low among friends | Online | Rival moves are ranked by the poster's clock | Left as is |
| 8 | Low | Engine | Activated skills are named in several places | Left as is |

One more trade-off was accepted for now and is described after them.

---

## 2. The poster's clock ranks rival moves (Low among friends)

Rival chained posts (two posts that name the same `prev`) are ranked by `at`
([`byRank`](../packages/online/src/timeline.ts#L72)), the poster's own clock, sealed inside the
encrypted body and never checked. A post that names an old post as `prev` and claims an earlier time
replaces the move that followed it, and everything after that move, for every browser.

The review rated this High together with its other half, seat ownership, which is fixed: a seat
someone has played is theirs (`owners()` in [timeline.ts](../packages/online/src/timeline.ts)).

**Status: left as is.** *Decided 2026-10-13: the game is played among friends, so only honest
mistakes matter, not cheating.* Among friends, a rival move needs a race (two browsers moving from
the same position at once: two browsers moving an AI seat) and a post that
arrives late (from a phone that was offline) or with a clock far behind. If it ever happens, the fix
is to let the rival that others have already played on win, with the clock only breaking ties. That
reverses the test "of two rival moves, the earlier wins even when it arrives later" in
[timeline.test.ts](../packages/online/test/timeline.test.ts).

## 8. Activated skills are named in several places (Low, architectural)

ARCHITECTURE.md says "rules never name a skill" and that `SKILL_RULES` defines each skill in one place.
That holds for passive skills, which are hooks. Activated skills are still spread out:

- [legal.ts:150-207](../packages/engine/src/legal.ts#L150-L207) checks `hasSkill(s, me, 'tactical')`,
  `'flexible'`, `'resourceful'`, `'nomadic'`, `'composed'`, `'ambitious'` and `'tyrannical-original'`,
  each with its own once-per-turn and cost logic. That logic repeats what the handler checks.
- [skillActions.ts](../packages/engine/src/skillActions.ts) names them again.
- Adding one means editing `Action`, `skillActions.ts`, `actionPhaseOptions`, `bruteForce` in the
  consistency test, and the UI controller. The compiler only enforces the first two.

The same duplication, availability written once for listing and once for applying, once let the
`missile` handler accept missiles that `legalActions` never offered.

**Change:** give `SkillRule` an `activated: { options(s, player): Action[]; apply(s, action) }` entry,
like `ShipHooks.action` for prototype powers, and have `legal.ts` and the handlers read it. The
prototype `power` action already shows the pattern: options computed once, and `apply` accepts only
an offered option. Related: [queries.ts](../packages/engine/src/queries.ts) has grown to about 800
lines of unrelated questions (movement, conquest, combat, cards, skills), and splitting it by topic
would make it easier to find one.

**Status: left as is.** The level-1 AI breaks ties by the order in which `legalActions` lists
actions, so a registry must list them in exactly today's order. Otherwise the golden replays for
Basic and Regolith change, which a pure refactor mustn't do. That can be
done, but it's fiddly, for a gain in maintainability only. The concrete risk, a handler and
`legalActions` disagreeing, is caught by `consistency.test.ts`, which checks that `apply` accepts
exactly what `legalActions` offers, decisions included.

---

## Accepted for now: rule changes break online games in progress

*Decided 2026-10-12: the app is still in transition, so a deploy may break online games in progress.*

An online game is a log of moves that every browser replays with its own copy of the engine, and
nothing records which rules the game was started with. Neither `PROTOCOL`
([protocol.ts:8](../packages/online/src/protocol.ts#L8)) nor `GameState.version` has ever been bumped,
and the `create` post carries no engine version. After a deploy that changes a rule, the new build
replays old moves under the new rules. The game stops at the first move that is now refused, and
anything after it disappears.

What players will see when this happens: the game shows a "rejected" desync naming another player,
which suggests that player did something wrong. If that confuses testers, a cheap step short of real
versioning is to put the build id in the `create` post and show "this game was made with an older
version of Regolith" instead.

The local saved game ([savedGame.ts](../apps/web/src/game/savedGame.ts)) has the same trade-off. It
loads any save that has `version === 1` and passes `checkInvariants`, even if an older engine wrote it.

Revisit this when online play is meant to last across deploys. At that point, add a rules version that
is recorded in each game, and refuse to replay a game this build can't play.

---

## What is in good shape

These parts are working well and are worth keeping as they are:

- The engine's core design: a pure `apply`, a seeded RNG in the state, the compiler-checked
  `Handlers` and `DECISION_CANDIDATES` registries, `checkInvariants`, and golden replays.
- `RuleSet` as the only place modes differ, and the prototype kit as a boundary that tests check.
- Defensive storage handling in the web app ([storage.ts](../apps/web/src/storage.ts)): nothing throws,
  and space is reclaimed when the quota is full.
- Test depth on the rules: a scenario per card, a citation per Basic rule, and the card audit.
