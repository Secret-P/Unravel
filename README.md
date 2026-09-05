# Unravel

Wordle, backwards. You start with the answer (all green) and change one letter per move, real words only, no repeats, until no letter of the start word remains (all grey). Tiles score against the start word: green = still where it started, yellow = a start letter that has come back somewhere, grey = gone. Unlimited moves; the score is moves against par, where par is the shortest common-word path. A true dead end (no legal word) marks the dead rows, wipes them, and rewinds to the last good word. Undo is free; submitted guesses always count.

Pure static site: `index.html`, `style.css`, `app.js`, plus generated `words.js` and `puzzles.js`. Two modes, each with its own dated daily schedule from 2026-09-04 and its own stats: **Unravel** (5 letters, Wordle answer/allowed lists, 461 days, #1 BRACE) and **Easy** (4 letters, frequency-ranked common words filtered against first names and a blocklist, macOS dictionary for accepted guesses, 500 days, #1 TAIL). Standard schedules words with par 5 to 9 (1,094 days); Easy par 4 to 8 (575 days). `tools/schedule.txt` is the human-readable calendar. No build step. Open `index.html` or serve the folder.

- Input: Keyboard (default) or Reel (beta, toggle above the board, remembered per device). Reel makes every tile in the play row a spinnable letter wheel; spinning a second reel snaps the first back. Telemetry tags starts/solves with `input`.
- `?p=N` loads puzzle N for QA (practice mode unless N is today's; not persisted, not counted). `?easy` opens Easy mode.
- Link preview: `og.png` is rendered from `tools/og.html` with headless Chrome (see git log for the command); rerender if the look changes.
- Analytics: TelemetryDeck (app id and org namespace `com.ribbescobb` in `app.js`; signals must go to the namespaced ingest URL or they vanish silently), signals `pageView`, `Unravel.puzzleStarted`, `Unravel.puzzleSolved`, `Unravel.shared`; random hashed visitor id, no cookies; localhost sends test-mode signals; `?p=N` practice sends nothing.
- Deploy with `tools/deploy.sh` (copies into the ribbescobb.github.io clone, cache-busts assets with the commit SHA, pushes).
- Regenerate data with `python3 tools/gen.py` (downloads its source word lists into `tools/` on first run).
