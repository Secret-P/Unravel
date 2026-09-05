# Unravel — punch list

Status as of 2026-09-05. Live at ribbescobb.com/unravel. Everything below is *potential* work, roughly in dependency order. Nothing here is committed to; retention numbers from TelemetryDeck decide what gets built.

Gate for everything below the line: **next-day return rate and shares-per-solve after the first week.** If nobody comes back, none of this matters.

---

## 1. Community statistics API

The one server-shaped problem. Everything else with a server hangs off it.

- **Cloudflare Worker + D1** (DNS already on Cloudflare; free tier covers this scale).
- `POST /solve` — receives the **path**, not a score. Server re-validates: today's start word for the mode, every step a real word, exactly one letter changed per step, no repeats, final word clean. Bad paths get a 400 and never touch the table.
- One row per (hashed visitor, mode, puzzle). Insert-or-ignore, so a flood from one identity is one row.
- `GET /today/{mode}` — cached distribution: under / par / +1 / +2 / +3+ counts and a "you beat N%" figure. Recomputed every few minutes.
- **Abuse posture** (build in from day one, not later): Cloudflare rate limiting per IP, Bot Fight Mode, Turnstile on the POST, cap on new visitor IDs per IP per day, hard row cap per puzzle per day (a successful flood yields a stale chart, never a bill). Rows aggregate to five numbers after a week and are deleted.
- **Local-first stays true.** The game never depends on the server; the community line on the result sheet just doesn't appear if the call fails.
- Product decisions before the schema: what "today" means across time zones for the global chart; per-device vs per-person counting until login exists.
- **Owner:** the Meta friend, if he's in. Roughly two weeks including the abuse layer.

## 2. Login / cross-device stats

- **Sign in with Apple** first (required anyway once there's an iOS app), plus **email magic link** for the web so nobody needs a password. No passwords, ever.
- Server keeps per-user solves (mode, puzzle, moves, par, seconds). Local history is uploaded on first sign-in so nobody loses what their browser already knows.
- Stats sheet, distribution charts, and streaks read from the merged record; local remains the offline cache.
- Streak rules need a decision: today it's "played consecutive puzzle numbers on this device."
- Depends on 1 (the same Worker and table, keyed by user instead of visitor hash).

## 3. Monetization: tip jar unlocks the archive

Pay-what-you-want with a floor. "Tip the dad anything over $3 and every puzzle we've ever run is yours."

- **Web:** Stripe payment link with custom amount + minimum. On success, the Worker confirms the payment and issues a short **unlock code**; entering the code on any device opens the archive. No accounts required; sharing a code with a friend is the model working as intended.
- **iOS:** must be in-app purchase (Apple 3.1.1 — a tip that unlocks content is a purchase). Three tiers ($3 / $5 / $10), all labelled as tips, all unlocking the same thing. No external checkout links in the app.
- **What it unlocks:** every past puzzle in all three modes, forever; cross-device sync once 2 exists. **Never** paywalled: today's three puzzles, any input mode, any difficulty.
- Show the tail: "212 people have tipped" on the sheet is worth more than any button copy. The floor is the price; set it as one.
- Depends on 1 (payment confirmation endpoint). Land only after retention is real — a paywall on a game with no habit just measures how few players there were.

## 3b. "Insane" tier: a daily 6-letter puzzle, unlocked by the tip (Chris, 2026-09-05)

Feasible under the par model; it was dead under the old locked rules. Numbers (2026-09-05):

| Par path vocabulary | Solvable 6-letter starts (of 3,000 common) | Par range |
|---|---|---|
| Frequency top 6,000 real words | 339 | 6 to 16 (311 at par ≤ 12) |
| Full 15k dictionary | 1,802 | 6 to 16 (600 at par 6) |

- Compute par through the **top-6,000** list, not the full dictionary, so par is reachable with words a strong player knows. Cap scheduled par at 12 → ~310 puzzles, about ten months, mostly par 7 to 11. Long ladders are the point of the tier.
- Start words come from the top 3,000 (BETTER, MURDER, WRITER, CANYON, GUTTER, TINKER...). Needs its own blocklist pass (BUGGER etc.).
- Board already scrolls for long ladders; the share card will need the grid capped or summarised (see Smaller items).
- **Unlock UX:** a fourth tab with a padlock, visible to everyone, opens on tipping. That's the visual reward for 3, alongside the archive. Four tabs fit a 375px phone at the current tab type size, barely; check on a real device.
- Seven letters: not measured with a wide vocabulary; six is enough.

## 4. Calendar view (Chris, 2026-09-05)

A month grid. Each day shows **three dots**, one per puzzle (Warm-up · Easy · Standard), filled when that puzzle was solved. A small mark on the date when all three were cleared that day ("cleared the day").

- Free for everyone: your own history, back to the day you started. This is the natural home for the distribution charts and streak.
- Dot colour could carry the score: moss for par-or-better, flax for over. Keep it subtle; the fill/unfilled read is the point.
- Tap a past day → if the archive is unlocked (3), play it. Decisions: do archive solves count toward stats and the distribution (probably yes), toward streak (probably no).
- Works local-only before login exists; gets better with 2.
- Data already exists: every solved game is saved per device with its puzzle number, and puzzle number ↔ date is the schedule.

## 5. Story-image sharing

Instagram Stories take images, not text. Render the Loom board to a 1080×1920 image on-device (canvas), hand it to the share sheet (Web Share API with files works on iOS Safari). Self-contained; no server. Moves to the **front** of the list if the Instagram ad credits are real, because that audience lives in Stories.

## 6. iOS shell

- Thin SwiftUI app hosting the web game in WKWebView, with a JS bridge so the Dial's tick fires a real haptic, plus native share sheet.
- App Review 4.2 needs more than a wrapped site: home-screen widget (today's par + streak), local notification at midnight, iCloud/stat sync (2).
- **Name:** "Unravel" exact is taken on the App Store (journaling app). Ship as **Unravel Daily**; "(un)ravel" is a wordmark treatment, not a name. Trademark search 2026-09-05: no live US game mark on UNRAVEL; EA's US filings abandoned 2016 but EA holds a UK registration and common-law use; a steel-software company holds a live Class 9 UNRAVEL. "Ravel" is high-risk (Raveled, Word Ravel, RAVEL board game). Attorney to confirm before filing.
- Domains unravel.game and unraveldaily.com looked available; deliberately not bought yet.
- Full SwiftUI port only if the shell earns its own audience.

---

## Smaller items

- **Dial feel**: momentum and snap were tuned in an emulator. Expect a pass from a real thumb. Two numbers in `onReelUp`.
- **Reset puzzle** (parked): retries as labelled attempts; first finish counts; share card stays the first finish. Workaround: `?p=N` loads any other day as uncounted practice.
- **Wordle mentions**: page meta descriptions and the OG card image still say "Wordle, backwards." Help-sheet credit ("Born in a family Wordle thread") deliberately kept.
- **Difficulty curation**: once `Unravel.puzzleSolved` has volume, chart avg moves-over-par by puzzle number; retire strolls and walls from the schedules.
- **Share card length**: a 15-move ladder makes a very tall card. Consider capping the grid or summarising.
- **Warm-up as tutorial only**: if telemetry shows Warm-up played once and abandoned, fold it into the tutorial and go back to two tabs.
- **Combined "today's round" card**: if people play all three modes, one share card summing them.

## Not doing

- Ads. At daily-puzzle scale they pay a few hundred dollars a month at best and cost the look.
- Golf vocabulary (birdie/bogey). Par 3/4/5 is as far as the metaphor goes.
- Showing which letters make valid words in the Dial. Too easy.
- Random single daily puzzle across par levels. Breaks the ritual; the three fixed puzzles stay.
