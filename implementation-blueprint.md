# Implementation Blueprint — Code-Aware Game Improvements
## KOD: The Beauty Contest

> This document maps every proposed game mechanic, rule change, and design improvement
> directly to the existing codebase — referencing specific files, functions, database
> tables, types, API actions, and UI components that would need to change.

---

## Codebase Reference Map

| Layer | File | Key Symbols |
| :--- | :--- | :--- |
| **Game Engine** | [`app/api/game/route.ts`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts) | [`resolveRound`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L94-L150), [`snapshot`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L152-L180), [`submitReadyBots`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L30-L48), [`POST` handler](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L193-L300) |
| **DB Schema** | [`db/schema.ts`](file:///var/home/harry/Documents/The%20balance%20scale/db/schema.ts) | `profileSchema`, `roundSchema`, `entrySchema` |
| **DB Init (inline)** | [`app/api/game/route.ts`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L50-L80) | `rooms` table, `players` table, `init()` |
| **Client App** | [`app/page.tsx`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx) | `GameState` type (L7-L11), `Home`, `Arena`, `Results`, `Finished`, `Lobby`, `Landing` |
| **Client Types** | [`app/page.tsx`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L5-L12) | `Player`, `Spectator`, `GameState`, `Session` |
| **Admin** | [`app/api/admin/route.ts`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/admin/route.ts), [`app/admin/page.tsx`](file:///var/home/harry/Documents/The%20balance%20scale/app/admin/page.tsx) | Dashboard metrics, leaderboard queries |

---

## 1. Game Mode Selection (Room Configuration)

### Current State
The host can only configure the **round timer** (`30s / 60s / 180s`) at room creation. The multiplier (`0.8`), elimination threshold (`-10`), and all progressive rules are hardcoded.

**Relevant code:**
- Room creation: [`POST` action `"create"`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L204-L216) — only `roundSeconds` is configurable.
- Target calculation: [`resolveRound` L101](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L101) — `const target = average * 0.8;` is hardcoded.
- Elimination threshold: [`resolveRound` L130](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L130) — `alive: score > -10` is hardcoded.
- Client timer picker: [`Landing` L172](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L172) — only shows timer options.

### Proposed Changes

#### A. Add `game_mode` column to the `rooms` table
```sql
-- In init() inside route.ts, add to the rooms CREATE TABLE:
ALTER TABLE rooms ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'canon';
-- Allowed values: 'canon', 'blitz', 'market', 'custom'
```

#### B. Add room-level config columns
```sql
ALTER TABLE rooms ADD COLUMN multiplier REAL NOT NULL DEFAULT 0.8;
ALTER TABLE rooms ADD COLUMN elimination_threshold INTEGER NOT NULL DEFAULT -10;
ALTER TABLE rooms ADD COLUMN range_max INTEGER NOT NULL DEFAULT 100;
```

#### C. Server changes in [`route.ts`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts)
```typescript
// L101 — Replace hardcoded 0.8:
const target = average * room.multiplier;  // was: average * 0.8

// L130 — Replace hardcoded -10:
return { ...outcome, alive: score > room.elimination_threshold };  // was: score > -10

// L209 — Accept mode config at room creation:
const mode = String(body.gameMode ?? "canon");
const multiplier = mode === "market" ? null : 0.8;  // null = dynamic per round
```

#### D. Client changes in [`page.tsx`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx)
- Extend the `GameState.room` type (L8) with `gameMode`, `multiplier`, `rangeMax`.
- Add a **Mode Picker** component inside [`Landing`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L164-L178) next to the timer picker (L172).
- Update the [`Rules` component](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L204) to show the active multiplier dynamically instead of the static `"Target ×0.8"`.

---

## 2. Ghost Spectator Betting (Eliminated Player Agency)

### Current State
Eliminated players see a static `"GAME OVER"` card in the [`Arena` component](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L210) and an `"eliminated-card"` div. They can observe but have **zero interactivity**.

Spectators (joined via `"spectate"` action) see a `"spectator-card"` with `"READ-ONLY SEAT"`. Both roles are passive.

**Relevant code:**
- Spectator token: `spectator_${token()}` — [`POST` action `"join"/"spectate"` L234](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L234).
- Dead-player check: `!state.me.alive` in [`Arena` L210](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L210).
- The personal elimination dialog: [`PersonalElimination` L341-L355](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L341-L355) offers only "SPECTATE" or "LEAVE."

### Proposed Changes

#### A. New `ghost_bets` table
```sql
CREATE TABLE IF NOT EXISTS ghost_bets (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  round INTEGER NOT NULL,
  player_id TEXT NOT NULL,        -- the eliminated player betting
  bet_type TEXT NOT NULL,         -- 'winner' | 'range'
  bet_target TEXT NOT NULL,       -- player_id or 'low'/'mid'/'high'
  wager INTEGER NOT NULL DEFAULT 10,
  payout INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(room_code) REFERENCES rooms(code) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);
```

#### B. Add phantom capital to `players` table
```sql
ALTER TABLE players ADD COLUMN phantom_capital INTEGER NOT NULL DEFAULT 0;
```

#### C. New API action `"ghostBet"` in the [`POST` handler](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L193-L300)
```typescript
} else if (action === "ghostBet") {
  if (me.alive || me.token.startsWith("spectator_")) 
    return json({ error: "Only eliminated players can place ghost bets." }, 403);
  if (room.status !== "playing") 
    return json({ error: "Bets can only be placed during active rounds." }, 409);
  const betType = String(body.betType ?? "");    // "winner" | "range"
  const betTarget = String(body.betTarget ?? ""); // player_id or "low"/"mid"/"high"
  const wager = Math.min(Math.max(1, Number(body.wager ?? 10)), me.phantom_capital || 100);
  // ... validate and INSERT into ghost_bets
}
```

#### D. Resolve bets inside [`resolveRound`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L94-L150)
After computing the winner (L132), settle all outstanding `ghost_bets` for the current round:
- "winner" bets: if `bet_target === winnerId`, payout = `wager * 2`.
- "range" bets: compare `target` against thresholds (Low < 25, Mid 25–50, High > 50), payout = `wager * 3`.

#### E. Client: Replace the static `"eliminated-card"` in [`Arena`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L210)
Create a new `<GhostBettingPanel>` component that renders when `!state.me.alive && !state.me.isSpectator`:
- Shows living players with dynamic odds based on scores.
- Shows range selector (Low / Mid / High).
- Shows phantom capital balance and wager slider.
- Add ghost capital and bet data to the `GameState.me` type (L9).

#### F. Update [`PersonalElimination`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L341-L355) dialog
Add a third option: **"HAUNT THE LIVING — PLACE BETS"** that transitions the player into ghost mode.

---

## 3. Shrinking Number Range (Progressive Domain Compression)

### Current State
The pick range is always `[0, 100]` — hardcoded in both the server validation and the client slider.

**Relevant code:**
- Server validation: [`POST` action `"pick"` L274](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L274) — `pick < 0 || pick > 100`.
- Client slider: [`Arena` L210](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L210) — `min="0" max="100"`.
- Bot pick clamping: [`legalBotPick` L28](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L28) — clamps to `0..100`.

### Proposed Changes

#### A. Compute dynamic range based on alive count in [`resolveRound`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L94)
```typescript
// After L104 (eliminatedBefore calculation):
const aliveAfterResolve = rows.filter(r => r.score + delta > room.elimination_threshold).length;
const rangeMax = aliveAfterResolve <= 2 ? 25
               : aliveAfterResolve <= 4 ? 50
               : 100;
// Store on the room for the next round
```

#### B. Add `range_max` to the `rooms` table and the room-update batch at L286
```typescript
// L286 — "next" action, advancing to next round:
db.prepare("UPDATE rooms SET ..., range_max=? WHERE code=?").bind(rangeMax, code)
```

#### C. Pass `rangeMax` in [`snapshot`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L174) return value
```typescript
room: { ...existing, rangeMax: room.range_max }
```

#### D. Client: Update `GameState.room` type (L8) and [`Arena` component](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L206-L213)
```tsx
// Replace static max="100":
<input type="range" min="0" max={state.room.rangeMax ?? 100} ... />

// Update range labels to show dynamic bounds:
<span>0</span><span>{rangeMax/4}</span><span>{rangeMax/2}</span>...
```

#### E. Update [`legalBotPick`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L28) to accept `rangeMax`
```typescript
const legalBotPick = (value: number, banned: number[], direction = 1, max = 100) => {
  let pick = Math.max(0, Math.min(max, Math.round(value)));
  // ... rest uses `max` instead of hardcoded 100
};
```

---

## 4. Win Streak Recovery Bonus

### Current State
There is no comeback mechanic. The winner always gets `+1` (L125: `const winReward = winners.length === 1 ? 1 : 0;`). A player at `-9` who wins 3 rounds in a row recovers only 3 points — the same rate regardless of desperation.

### Proposed Changes

#### A. Add `streak` column to `players` table
```sql
ALTER TABLE players ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
```

#### B. Track streaks in [`resolveRound`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L94-L150)
After computing outcomes (L126–L131):
```typescript
const outcomes = rows.map((p, i) => {
  const won = winners.some(w => w.id === p.id);
  const newStreak = won ? p.streak + 1 : 0;
  // Bonus: 2 consecutive wins = +1 extra recovery point
  const streakBonus = won && newStreak >= 2 ? 1 : 0;
  const delta = won ? (deadlockPenalty ? penalty : winReward + streakBonus) : penalty;
  const score = p.score + delta;
  return { player: p, pick: picks[i], won, delta, score, alive: score > -10, streak: newStreak };
});
```

#### C. Update the batch UPDATE at L141
```typescript
db.prepare("UPDATE players SET pick=?, submitted=1, invalid=?, round_delta=?, score=?, alive=?, streak=? WHERE id=?")
  .bind(outcome.pick, ..., outcome.streak, outcome.player.id)
```

#### D. Show streak in the client
Add `streak` to the `Player` type (L5) and show a flame/fire icon next to the player name in the [`Arena` feed](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L211) when `streak >= 2`.

---

## 5. Trimmed Mean (Anti-Griefing for Large Rooms)

### Current State
The average in [`resolveRound` L100](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L100) uses every player's pick with equal weight:
```typescript
const average = picks.reduce((a, b) => a + b, 0) / picks.length;
```
A single spite-picker can skew the target massively by choosing `100` or `0`.

### Proposed Changes

#### A. Implement trimmed mean in `resolveRound`
Replace L99-L101 with:
```typescript
const sortedPicks = [...picks].sort((a, b) => a - b);
const trimCount = picks.length >= 6 ? 1 : 0;  // Trim 1 from each end for 6+ players
const trimmedPicks = sortedPicks.slice(trimCount, sortedPicks.length - trimCount);
const average = trimmedPicks.reduce((a, b) => a + b, 0) / trimmedPicks.length;
const target = average * 0.8;
```

#### B. Store the trim metadata in the round result
Add a `trimmed INTEGER NOT NULL DEFAULT 0` column to the `round_results` table in [`db/schema.ts`](file:///var/home/harry/Documents/The%20balance%20scale/db/schema.ts#L7-L19).

#### C. Show trim indicator in the client [`Results`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L227-L339) component
When trimming was applied, visually grey out the highest and lowest picks in the calculation animation to show they were excluded from the average.

---

## 6. Round History & Personal Stats Panel

### Current State
Round results are stored in `round_results` and `round_entries` tables ([`db/schema.ts`](file:///var/home/harry/Documents/The%20balance%20scale/db/schema.ts#L7-L34)) but are **never shown to the player**. There is no history view — once a round is resolved, the data is gone from the UI.

### Proposed Changes

#### A. New API action `"history"` or GET parameter
Add to the [`GET` handler](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L182-L191):
```typescript
if (url.searchParams.get("history") === "1") {
  const rounds = await db.prepare(
    "SELECT * FROM round_results WHERE room_code = ? ORDER BY round"
  ).bind(code).all();
  const entries = await db.prepare(
    "SELECT * FROM round_entries WHERE round_result_id LIKE ? ORDER BY distance"
  ).bind(`${code}:%`).all();
  // Return { rounds, entries } alongside the snapshot
}
```

#### B. Include `roundHistory` in `snapshot` return value (L173-L179)
Add a lightweight summary array:
```typescript
roundHistory: previousRounds.map(r => ({
  round: r.round, average: r.average, target: r.target,
  winnerName: r.winner_name, exactHit: !!r.exact_hit
}))
```

#### C. Client: New `<RoundHistory>` component
Render a collapsible sidebar or overlay showing:
- Round-by-round target line graph (SVG or canvas).
- Personal pick history with distance-from-target trend.
- Win/loss record and streak visualization.

Place the trigger button in the [`game-top` header](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L133-L138) next to the room code.

---

## 7. Dynamic Multiplier Regime (Wall Street Mode)

### Current State
The multiplier is a hardcoded constant: [`resolveRound` L101](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L101):
```typescript
const target = average * 0.8;
```

### Proposed Changes

#### A. Add `current_multiplier` column to `rooms`
```sql
ALTER TABLE rooms ADD COLUMN current_multiplier REAL NOT NULL DEFAULT 0.8;
```

#### B. Roll the multiplier at round start
In the [`"next"` action](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L279-L289), when advancing to a new round:
```typescript
let nextMultiplier = 0.8;  // default canon mode
if (room.game_mode === "market") {
  // 30% chance Bull (expansionary), 70% chance Bear (contractionary)
  nextMultiplier = Math.random() < 0.3 ? 1.25 : 0.7;
}
// Store on room: UPDATE rooms SET current_multiplier=? ...
```

#### C. Use the stored multiplier in [`resolveRound`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L101)
```typescript
const target = average * room.current_multiplier;  // was: average * 0.8
```

#### D. Client: Show the active multiplier
- Update the `GameState.room` type (L8) with `currentMultiplier: number`.
- In the [`Rules` component](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L204): replace static `"Target ×0.8"` with `Target ×${state.room.currentMultiplier}`.
- In the [`Arena` component](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L209): show the multiplier prominently near the timer.
- Add a `"regime"` sound cue to [`useTone`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L33-L51) — a rising tone for Bull, a falling tone for Bear — played at round start.

---

## 8. Slow-Burn Reveal (Information Pacing)

### Current State
When the round resolves, ALL picks are revealed simultaneously and the full calculation animation plays. The client can skip it via the `skipAnimation` button ([`Results` L258](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L258)).

The `roundChoicesHidden` flag ([`snapshot` L172](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L172)) hides picks during play, then shows all at once on results.

### Proposed Changes

#### A. Server: Add a `"reveal_order"` field to the round result
In [`resolveRound`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L94-L150), compute and store the reveal order:
```typescript
// Ascending pick order for dramatic tension
const revealOrder = [...rows]
  .map((p, i) => ({ id: p.id, pick: picks[i] }))
  .sort((a, b) => a.pick - b.pick)
  .map(p => p.id);
```

#### B. Client: Use reveal order in the [`Results`](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L227) calculation animation
Instead of transferring picks in join order, transfer them in ascending pick order. As each number enters the sum, the running average updates live — creating a roulette-wheel suspense effect.

The existing animation framework (L245–L277: `transferStart`, `transferStep`, `activeTransfer`, `sourceRefs`, flying DOM elements) already supports sequential reveal — only the sort order of `participants` needs to change.

#### C. Optional: Anonymous Heatmap Mode
Add a new room config flag. When enabled, the [`snapshot`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L176) response returns picks without player IDs during the reveal phase:
```typescript
pick: roundChoicesHidden ? null : (anonymousReveal ? p.pick : p.pick),
// In anonymous mode: return picks but don't associate them with player names
```

---

## 9. Smarter Bot AI (Adaptive Personalities)

### Current State
Bot behavior in [`submitReadyBots`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L30-L48) uses 11 fixed personality formulas (L43) with deterministic noise. All bots anchor around `baseTarget` and `baseAverage` from the previous round. None consider:
- Their own score / survival urgency.
- Whether duplicates are active (they avoid banned numbers but don't avoid other bots' likely picks).
- The current player count or elimination stage.

### Proposed Changes

#### A. Score-aware desperation factor
In [`submitReadyBots` L43](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L43), add urgency scaling:
```typescript
const urgency = bot.score <= -8 ? 0.5 : bot.score <= -5 ? 0.8 : 1.0;
// Apply urgency to reduce noise and tighten picks around the predicted target
const adjustedNoise = (noise - 0.5) * urgency;
```

#### B. Duplicate awareness
Before finalizing the bot pick, check what other bots in the same room have already submitted:
```typescript
// After L44:
const alreadyPicked = (await db.prepare(
  "SELECT pick FROM players WHERE room_code = ? AND alive = 1 AND submitted = 1"
).bind(room.code).all()).results.map(r => Number(r.pick));

// If eliminatedBefore >= 1 and pick would duplicate, nudge by ±1
if (eliminatedBefore >= 1 && alreadyPicked.includes(pick)) {
  pick = legalBotPick(pick + (noise < 0.5 ? -1 : 1), banned, direction, rangeMax);
}
```

#### C. Level-k reasoning adaptation
Replace the static personality formulas with a level-k system that deepens as rounds progress:
```typescript
// Round 1: L1 thinking (target ≈ 40)
// Round 3+: L2 thinking (target ≈ 32)
// Round 6+: L3 thinking (target ≈ 26)
const levelK = Math.min(3, Math.floor(room.round / 2) + 1);
const kTarget = 50 * Math.pow(0.8, levelK);
// Mix kTarget with previous round's actual target
const botAnchor = kTarget * 0.4 + baseTarget * 0.6;
```

---

## 10. End-of-Match Statistics & Match Summary

### Current State
The [`Finished` component](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L357-L381) shows only:
- The champion's name, final score, round count, and final pick.
- Fallen player cards (names and scores).
- A "RETURN TO LOBBY" button.

No aggregate match statistics, no personal performance review, no shareable summary.

### Proposed Changes

#### A. Compute match stats in the [`"next"` action](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L279-L289) when transitioning to `"finished"`
```typescript
if (aliveCount <= 1) {
  // Query aggregate stats before finalizing
  const matchStats = await db.prepare(`
    SELECT 
      COUNT(*) as totalRounds,
      AVG(average) as avgAverage,
      AVG(target) as avgTarget,
      SUM(exact_hit) as totalExactHits,
      MIN(target) as lowestTarget,
      MAX(target) as highestTarget
    FROM round_results WHERE room_code = ?
  `).bind(code).first();
  // Store or return with the snapshot
}
```

#### B. Include match summary in snapshot when `status === "finished"`
Extend the [`snapshot`](file:///var/home/harry/Documents/The%20balance%20scale/app/api/game/route.ts#L152-L180) return value:
```typescript
matchSummary: room.status === "finished" ? {
  totalRounds: ...,
  avgTarget: ...,
  mvpId: ...,         // player with most round wins
  longestStreak: ...,
  closestEverPick: ...
} : undefined
```

#### C. Client: Enhance [`Finished` component](file:///var/home/harry/Documents/The%20balance%20scale/app/page.tsx#L357-L381)
Below the victory card, add a `<MatchSummary>` section showing:
- Total rounds played, average target across the match.
- MVP award (most round wins), Closest Call award (smallest ever distance).
- Personal stat card: your win rate, average pick, best/worst rounds.
- A **"SHARE RESULT"** button that copies a text summary to clipboard.

---

## Summary: Priority & Impact Matrix

| # | Feature | Impact | Effort | Files Changed |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Game Mode Selection | 🔴 High | Medium | `route.ts`, `page.tsx` (Lobby + Landing), `init()` |
| **2** | Ghost Spectator Betting | 🔴 High | High | `route.ts` (new action + resolve), `page.tsx` (new component), new table |
| **3** | Shrinking Number Range | 🟡 Medium | Low | `route.ts` (resolve + pick validation), `page.tsx` (Arena slider) |
| **4** | Win Streak Recovery | 🟡 Medium | Low | `route.ts` (resolveRound), `players` table, `page.tsx` (feed row) |
| **5** | Trimmed Mean | 🟡 Medium | Low | `route.ts` L99-L101 only (3 lines) |
| **6** | Round History Panel | 🟡 Medium | Medium | `route.ts` (GET/snapshot), `page.tsx` (new component) |
| **7** | Dynamic Multiplier | 🟢 Fun | Medium | `route.ts` (next action + resolve), `rooms` table, `page.tsx` (Rules + Arena) |
| **8** | Slow-Burn Reveal | 🟢 Fun | Low | `page.tsx` Results component only (sort order change) |
| **9** | Smarter Bot AI | 🟢 Polish | Medium | `route.ts` (`submitReadyBots` only) |
| **10** | Match Summary | 🟢 Polish | Low | `route.ts` (snapshot), `page.tsx` (Finished component) |

> [!TIP]
> **Quickest wins:** Items **5** (Trimmed Mean — 3 lines of server code), **4** (Streak Bonus — small schema + logic addition), and **8** (Slow-Burn Reveal — client-only sort change) can each be shipped independently in under an hour.

> [!IMPORTANT]
> **Highest impact:** Items **1** (Game Mode Selection) and **2** (Ghost Betting) are the transformative features that would differentiate KOD from every other beauty contest implementation online. They require coordinated schema, API, and UI work but unlock entirely new player experiences.
