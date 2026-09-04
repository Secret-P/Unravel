# Unravel

Wordle, backwards. You start with the answer (five greens) and pull it apart one letter per move until five greys. Letters from the start word are dead. Each position changes once. Unlimited moves; the score is the move count (5 is perfect) with solve time as tiebreaker. Hit a dead end (no legal word) and the game marks yellow every row back to the first move with no common-word way through, wipes them bottom-up, and rewinds you to your last good word. Dead lines can't be replayed. Undo is free; submitted guesses always count.

Pure static site: `index.html`, `style.css`, `app.js`, plus generated `words.js` and `puzzles.js`. Two modes, each with its own dated daily schedule from 2026-09-04 and its own stats: **Unravel** (5 letters, Wordle answer/allowed lists, 461 days, #1 BRACE) and **Easy** (4 letters, frequency-ranked common words filtered against first names and a blocklist, macOS dictionary for accepted guesses, 500 days, #1 TAIL). Every scheduled word has at least one all-common-word solution. `tools/schedule.txt` is the human-readable calendar. No build step. Open `index.html` or serve the folder.

- `?p=N` loads puzzle N for QA (practice mode unless N is today's; not persisted, not counted). `?easy` opens Easy mode.
- Regenerate data with `python3 tools/gen.py` (downloads its source word lists into `tools/` on first run).
