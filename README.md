# Unravel

Wordle, backwards. You start with the answer (five greens) and pull it apart one letter per move until five greys. Letters from the start word are dead. Each position changes once. Unlimited moves; the score is the move count (5 is perfect) with solve time as tiebreaker. Hit a dead end (no legal word) and the game marks yellow every row back to the first move with no common-word way through, wipes them bottom-up, and rewinds you to your last good word. Dead lines can't be replayed. Undo is free; submitted guesses always count.

Pure static site: `index.html`, `style.css`, `app.js`, plus generated `words.js` (Wordle answer + allowed-guess lists) and `puzzles.js` (a dated schedule of 461 start words, one per calendar day from 2026-09-04, each with at least one all-common-word solution; #1 is BRACE). `tools/schedule.txt` is the human-readable calendar. No build step. Open `index.html` or serve the folder.

- `?p=N` loads puzzle N for QA (practice mode unless N is today's; not persisted, not counted).
- Regenerate data with `python3 tools/gen.py` (needs `answers.txt` / `allowed.txt` beside it).
