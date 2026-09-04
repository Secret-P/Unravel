# Unwordle

Wordle, backwards. You start with the answer (five greens) and erase it one letter per move. Five moves, five greys. Letters from the start word are dead. Each position changes once. No legal move left is a dead end.

Pure static site: `index.html`, `style.css`, `app.js`, plus generated `words.js` (Wordle answer + allowed-guess lists) and `puzzles.js` (the 461 start words that have at least one all-common-word solution; #1 is BRACE). No build step. Open `index.html` or serve the folder.

- `?p=N` loads puzzle N (practice unless N is today's).
- `?p=random` loads a random practice puzzle.
- Regenerate data with `python3 tools/gen.py` (needs `answers.txt` / `allowed.txt` beside it).
