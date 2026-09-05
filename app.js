/* Unravel — Wordle, backwards.
   You start with the answer. Change one letter at a time until no letter of the start word remains.
   Scoring is always against the START word: green = still where it started, yellow = a start letter
   that has come back somewhere else, grey = gone. All grey wins. Fewer moves is better; par is the
   shortest path through common words. */

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const VOCAB = {};                              // per word length: { dict: accepted guesses, common: par words }
for (const L of Object.keys(WORDS)) VOCAB[L] = { common: new Set(WORDS[L].common), dict: new Set(WORDS[L].common.concat(WORDS[L].accepted)) };
let DICT, COMMON, L = 5;                       // bound to the current mode in newGame
const modeKey = () => (L === 5 ? '' : L === 4 ? 'easy-' : 'warm-');
const modeName = () => (L === 5 ? 'standard' : L === 4 ? 'easy' : 'warmup');
const modeTitle = () => (L === 5 ? 'Unravel' : L === 4 ? 'Unravel Easy' : 'Unravel Warm-up');
const SITE = 'www.ribbescobb.com/unravel';
const FLIP_MS = 120, FLIP_LEN = 500;

const $ = (id) => document.getElementById(id);
let inputMode = 'keys';                        // 'keys' (on-screen keyboard) or 'reel' (beta: spin the letters)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let state = null;

/* ---------- puzzle selection (one per calendar day, device-local date) ---------- */
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayNumber() {
  const today = localISO(new Date());
  const i = SCHEDULE[L].findIndex(([d]) => d === today);
  if (i >= 0) return i + 1;
  // Off the end of the schedule: keep counting days and wrap around.
  const [y, m, d] = SCHEDULE[L][0][0].split('-').map(Number);
  const n = new Date();
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(y, m - 1, d)) / 864e5);
  return days + 1;
}
function scheduleEntry(num) {
  const sch = SCHEDULE[L];
  return sch[((num - 1) % sch.length + sch.length) % sch.length];
}
const puzzleForNumber = (num) => scheduleEntry(num)[1];
const parFor = (num) => scheduleEntry(num)[2];

/* ---------- rules ---------- */
function diffPositions(a, b) {
  const d = [];
  for (let i = 0; i < L; i++) if (a[i] !== b[i]) d.push(i);
  return d;
}
const isClean = (w, start) => ![...w].some(c => start.includes(c));
function tileClass(word, start, i) {
  if (word[i] === start[i]) return 'green';
  return start.includes(word[i]) ? 'yellow' : 'grey';
}
function validate(guess, prev, used, dead) {
  if (!DICT.has(guess)) return 'Not in word list';
  if (dead.has(guess)) return 'That line is dead';
  if (used.has(guess)) return 'Already used';
  const d = diffPositions(guess, prev);
  if (d.length === 0) return 'Change a letter';
  if (d.length > 1) return 'Change exactly one letter';
  return null;
}
function* neighbors(w, vocab) {
  for (let i = 0; i < L; i++) for (const c of ALPHA) {
    if (c === w[i]) continue;
    const x = w.slice(0, i) + c + w.slice(i + 1);
    if (vocab.has(x)) yield x;
  }
}
function hasLegalMove(cur, used) {
  for (const x of neighbors(cur, DICT)) if (!used.has(x)) return true;
  return false;
}
// Can `cur` still reach a clean word through common words, avoiding `used`? (bounded search)
function completable(cur, start, used, cap = 12) {
  const seen = new Set(used); seen.add(cur);
  let frontier = [cur];
  for (let d = 0; d < cap && frontier.length; d++) {
    const next = [];
    for (const w of frontier) for (const x of neighbors(w, COMMON)) {
      if (seen.has(x)) continue;
      if (isClean(x, start)) return true;
      seen.add(x); next.push(x);
    }
    frontier = next;
  }
  return false;
}
// Index in `path` of the first word with no common-word way through (or -1).
function doomedIndex(path, start, dead) {
  const used = new Set([start, ...dead]);
  for (let i = 0; i < path.length; i++) {
    used.add(path[i]);
    if (!completable(path[i], start, used)) return i;
  }
  return -1;
}

/* ---------- persistence ---------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const statsKey = () => 'unravel-stats' + (L === 5 ? '' : L === 4 ? '-easy' : '-warm');
const emptyStats = () => ({ played: 0, overPar: 0, atPar: 0, streak: 0, last: 0 });
// Stored stats may come from an older build with different fields; fill gaps and drop anything non-numeric.
function loadStats() {
  const s = Object.assign(emptyStats(), store.get(statsKey(), {}));
  for (const k of Object.keys(emptyStats())) if (typeof s[k] !== 'number' || Number.isNaN(s[k])) s[k] = 0;
  return s;
}

/* ---------- game state ---------- */
function newGame(number, practice) {
  DICT = VOCAB[L].dict; COMMON = VOCAB[L].common;
  const start = puzzleForNumber(number);
  state = {
    number, start, practice, status: 'playing', busy: false, edit: { pos: null, letter: '' },
    path: [], dead: [], moves: 0, deadEnds: 0, startedAt: 0, elapsed: 0,
  };
  if (!practice) {
    const s = store.get('unravel-' + modeKey() + number, null);
    if (s && s.start === start && Array.isArray(s.path)) Object.assign(state, {
      path: s.path, dead: s.dead || [], moves: s.moves || 0, deadEnds: s.deadEnds || 0,
      status: s.status, startedAt: s.startedAt || 0, elapsed: s.elapsed || 0, edit: s.edit || { pos: null, letter: '' },
    });
  }
  renderMode();
  renderClock();
  renderKeyboard();
  renderBoard();
  if (state.status === 'won') setTimeout(showResult, 400);
}
function setMode(newL) {
  if (newL === L || (state && state.busy)) return;
  L = newL;
  store.set('unravel-mode', L);
  closeAll();
  newGame(todayNumber(), false);
}
function renderMode() {
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', Number(b.dataset.mode) === L));
}
function save() {
  if (state.practice) return;
  const { start, path, dead, moves, deadEnds, status, startedAt, elapsed, edit } = state;
  store.set('unravel-' + modeKey() + state.number, { start, path, dead, moves, deadEnds, status, startedAt, elapsed, edit });
}
function recordStats() {
  if (state.practice) return;
  const s = loadStats();
  s.played++;
  s.overPar += state.moves - parFor(state.number);
  if (state.moves <= parFor(state.number)) s.atPar++;
  s.streak = (s.last === state.number - 1) ? s.streak + 1 : 1;
  s.last = state.number;
  store.set(statsKey(), s);
}

/* ---------- input ---------- */
const prevWord = () => (state.path.length ? state.path[state.path.length - 1] : state.start);
function selectPos(i) {
  if (state.busy || state.status !== 'playing' || i < 0 || i >= L) return;
  if (state.edit.pos !== i) state.edit = { pos: i, letter: '' };
  save();
  renderBoard();
}
function onKey(k) {
  if (state.busy) return;
  if (state.status !== 'playing') { if (k === 'enter') showResult(); return; }
  if (k === 'enter') return submit();
  if (k === 'left' || k === 'right') {
    const at = state.edit.pos;
    return selectPos(at === null ? (k === 'right' ? 0 : L - 1) : (at + (k === 'right' ? 1 : L - 1)) % L);
  }
  if (k === 'up' || k === 'down') { if (inputMode === 'reel') spinFocused(k === 'down' ? 1 : -1); return; }
  if (k === 'back') { state.edit.letter = ''; save(); return renderBoard(); }
  if (!ALPHA.includes(k)) return;
  if (state.edit.pos === null) {
    if (inputMode === 'reel') state.edit = { pos: 0, letter: '' };
    else { toast('Tap a letter to change it'); return shakeRow(state.path.length + 1); }
  }
  if (!state.startedAt) { state.startedAt = Date.now(); renderClock(); track('Unravel.puzzleStarted', { mode: modeName(), puzzle: state.number, input: inputMode }); }
  state.edit.letter = k;
  save();
  renderBoard(true);
}
async function submit() {
  const prev = prevWord();
  const { pos, letter } = state.edit;
  if (pos === null) { toast('Tap a letter to change it'); return shakeRow(state.path.length + 1); }
  if (!letter) { toast('Type its replacement'); return shakeRow(state.path.length + 1); }
  const guess = prev.slice(0, pos) + letter + prev.slice(pos + 1);
  const used = new Set([state.start, ...state.path]);
  const err = validate(guess, prev, used, new Set(state.dead));
  if (err) { toast(err); shakeRow(state.path.length + 1); return; }

  state.path.push(guess);
  state.moves++;
  state.edit = { pos: null, letter: '' };
  used.add(guess);
  renderBoard(false, true);
  renderUndo();

  if (isClean(guess, state.start)) {
    state.status = 'won';
    state.elapsed = Date.now() - state.startedAt;
    save();
    renderClock();
    recordStats();
    track('Unravel.puzzleSolved', { mode: modeName(), puzzle: state.number, par: parFor(state.number), moves: state.moves, deadEnds: state.deadEnds, seconds: Math.round(state.elapsed / 1000), input: inputMode });
    setTimeout(showResult, L * FLIP_MS + FLIP_LEN);
    return;
  }
  save();
  if (!hasLegalMove(guess, new Set([...used, ...state.dead]))) await crash();
}
async function crash() {
  state.busy = true;
  await sleep(L * FLIP_MS + FLIP_LEN);
  const di = doomedIndex(state.path, state.start, state.dead);
  const from = di < 0 ? state.path.length - 1 : di;
  const doomedWord = state.path[from];
  const anchor = from === 0 ? state.start : state.path[from - 1];
  state.deadEnds++;

  // 1. dead rows go to ash, bottom row first (the rewind starts here)
  toast(`Dead end. This line died at ${doomedWord.toUpperCase()}.`, 2600);
  const rows = [];
  for (let r = state.path.length; r >= from + 1; r--) rows.push(document.querySelector(`.row[data-row="${r}"]`));
  rows.forEach((row, k) => setTimeout(() => flipRowTo(row, 'dead'), k * 180));
  setTimeout(() => renderThread(from), rows.length * 180);
  await sleep(rows.length * 180 + FLIP_LEN + 500);

  // 2. obliterate, bottom-up
  rows.forEach((row, k) => setTimeout(() => row.classList.add('obliterate'), k * 140));
  await sleep(rows.length * 140 + 520);

  // 3. rewind state
  for (let i = from; i < state.path.length; i++) if (!state.dead.includes(state.path[i])) state.dead.push(state.path[i]);
  state.path.length = from;
  state.busy = false;
  save();
  renderBoard();
  renderUndo();
  flashRow(from, 'rewound');
  toast(`Back to ${anchor.toUpperCase()}`, 1400);
}
async function undo() {
  if (state.busy || state.status !== 'playing' || state.path.length === 0) return;
  state.busy = true;
  const r = state.path.length;
  const row = document.querySelector(`.row[data-row="${r}"]`);
  row.classList.add('obliterate');
  await sleep(500);
  state.path.pop();
  state.edit = { pos: null, letter: '' };
  state.busy = false;
  save();
  renderBoard();
  renderUndo();
  flashRow(r - 1, 'rewound');
}

/* ---------- rendering ---------- */
function renderBoard(pop = false, flip = false) {
  const board = $('board');
  board.innerHTML = '';
  board.style.setProperty('--cols', L);
  const rows = [state.start, ...state.path];
  const curRow = rows.length;                    // index of the edit row
  const playing = state.status === 'playing';
  const total = playing ? Math.max(L + 1, curRow + 1) : rows.length;
  for (let r = 0; r < total; r++) {
    const row = document.createElement('div');
    row.className = 'row' + (r === 0 ? ' start' : '');
    row.dataset.row = r;
    const word = rows[r];
    for (let i = 0; i < L; i++) {
      const t = document.createElement('div');
      t.className = 'tile';
      if (word) {
        t.textContent = word[i];
        t.classList.add(tileClass(word, state.start, i));
        if (flip && r === curRow - 1 && r > 0) {
          t.classList.add('flip');
          t.style.animationDelay = `${i * FLIP_MS}ms`;
        }
      } else if (r === curRow && playing && inputMode === 'reel') {
        // Reel: every tile is a letter wheel. Spin one; the changed one is the move.
        const prev = rows[curRow - 1];
        const changed = state.edit.pos === i && state.edit.letter && state.edit.letter !== prev[i];
        const cur = changed ? state.edit.letter : prev[i];
        t.classList.add('reel');
        if (changed) t.classList.add('changed');
        t.dataset.pos = i;
        t.dataset.base = prev[i];
        t.setAttribute('aria-label', `Letter ${i + 1}: ${cur.toUpperCase()}. Drag to spin.`);
        t.appendChild(buildStrip(ALPHA.indexOf(cur)));
      } else if (r === curRow && playing) {
        // The next row starts as your current word. Tap any letter to change it.
        const prev = rows[curRow - 1];
        t.classList.add('ghost');
        t.dataset.pos = i;
        t.setAttribute('role', 'button');
        t.setAttribute('aria-label', `Change letter ${i + 1}`);
        const sel = state.edit.pos === i;
        if (sel) t.classList.add('selected');
        if (sel && state.edit.letter) {
          t.textContent = state.edit.letter;
          t.classList.add('filled');
          if (pop) t.classList.add('pop');
        } else {
          t.textContent = prev[i];
        }
      }
      row.appendChild(t);
    }
    if (r === curRow && playing && inputMode === 'reel') {
      const acts = document.createElement('div');
      acts.className = 'row-actions';
      const go = document.createElement('button'); go.className = 'go'; go.textContent = '✓'; go.title = 'Submit'; go.disabled = !state.edit.letter; go.addEventListener('click', submit);
      const reset = document.createElement('button'); reset.textContent = '↺'; reset.title = 'Reset letter'; reset.disabled = !state.edit.letter;
      reset.addEventListener('click', () => { state.edit = { pos: null, letter: '' }; save(); renderBoard(); });
      acts.append(go, reset);
      row.style.position = 'relative';
      row.appendChild(acts);
    }
    board.appendChild(row);
  }
  board.classList.toggle('reel-mode', playing && inputMode === 'reel');
  renderThread();
  const edit = board.querySelector(`.row[data-row="${curRow}"]`);
  if (edit && playing) edit.scrollIntoView({ block: 'nearest' });
}
/* ---------- reel input: drag to spin, momentum, snap ---------- */
const letterAt = (p) => ALPHA[((Math.round(p) % 26) + 26) % 26];
function buildStrip(p) {
  const strip = document.createElement('div');
  strip.className = 'strip';
  const base = Math.floor(p), frac = p - base;
  for (let k = -2; k <= 2; k++) {
    const span = document.createElement('span');
    const c = ALPHA[(((base + k) % 26) + 26) % 26];
    span.textContent = c;
    if (k === 0) span.classList.add('mid');
    if (state.start.includes(c)) span.classList.add('spent');
    strip.appendChild(span);
  }
  strip.style.transform = `translateY(${(-frac * 20).toFixed(3)}%)`;
  return strip;
}
function setReelPos(tile, p) {
  const old = tile.querySelector('.strip');
  const fresh = buildStrip(p);
  if (old) old.replaceWith(fresh); else tile.appendChild(fresh);
}
// Commit a reel's resting letter as the current edit; spinning a second reel snaps the first back.
function commitReel(tile, p) {
  const i = Number(tile.dataset.pos);
  const letter = letterAt(p);
  const base = tile.dataset.base;
  if (letter === base) {
    if (state.edit.pos === i) state.edit = { pos: null, letter: '' };
  } else {
    if (state.edit.pos !== null && state.edit.pos !== i) {
      const other = document.querySelector(`.tile.reel[data-pos="${state.edit.pos}"]`);
      if (other) shakeTile(other);
    }
    if (!state.startedAt) { state.startedAt = Date.now(); renderClock(); track('Unravel.puzzleStarted', { mode: modeName(), puzzle: state.number, input: inputMode }); }
    state.edit = { pos: i, letter };
  }
  save();
  renderBoard();
}
function shakeTile(t) { t.classList.add('shake'); setTimeout(() => t.classList.remove('shake'), 450); }
function tick(tile) {
  tile.classList.remove('tick'); void tile.offsetWidth; tile.classList.add('tick');
  if (navigator.vibrate) navigator.vibrate(4);
}
let drag = null;
function onReelDown(e) {
  const tile = e.target.closest('.tile.reel');
  if (!tile || state.busy || state.status !== 'playing') return;
  e.preventDefault();
  try { tile.setPointerCapture(e.pointerId); } catch {}
  const mid = tile.querySelector('.strip .mid');
  drag = { tile, id: e.pointerId, y0: e.clientY, y: e.clientY, t: performance.now(), v: 0,
           p0: ALPHA.indexOf(mid.textContent), p: ALPHA.indexOf(mid.textContent), h: tile.getBoundingClientRect().height, moved: false, last: 0 };
  drag.last = Math.round(drag.p);
}
function onReelMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const now = performance.now();
  const dy = e.clientY - drag.y;
  const dt = Math.max(1, now - drag.t);
  drag.v = 0.8 * drag.v + 0.2 * (-dy / drag.h / dt);        // letters per ms
  drag.y = e.clientY; drag.t = now;
  drag.p += -dy / drag.h;
  if (Math.abs(e.clientY - drag.y0) > 6) drag.moved = true;
  setReelPos(drag.tile, drag.p);
  const r = Math.round(drag.p);
  if (r !== drag.last) { drag.last = r; tick(drag.tile); }
}
function onReelUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  if (!d.moved) {
    // tap: top half steps back a letter, bottom half steps forward
    const rect = d.tile.getBoundingClientRect();
    const target = d.p0 + (e.clientY < rect.top + rect.height / 2 ? -1 : 1);
    tick(d.tile);
    return glideReel(d.tile, d.p0, target);
  }
  // momentum, then snap
  let p = d.p, v = Math.max(-1.2, Math.min(1.2, d.v * 16));   // letters per frame, capped so a flick covers ~10 letters
  let lastTick = performance.now();
  const step = (now) => {
    const dt = Math.min(48, now - lastTick); lastTick = now;
    p += v * dt / 16;
    v *= Math.pow(0.9, dt / 16);
    setReelPos(d.tile, p);
    const r = Math.round(p);
    if (r !== d.last) { d.last = r; tick(d.tile); }
    if (Math.abs(v) > 0.004) return requestAnimationFrame(step);
    glideReel(d.tile, p, Math.round(p));
  };
  requestAnimationFrame(step);
}
function glideReel(tile, from, to) {
  const t0 = performance.now(), dur = 140;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    setReelPos(tile, from + (to - from) * e);
    if (k < 1) return requestAnimationFrame(step);
    commitReel(tile, to);
  };
  requestAnimationFrame(step);
}
function spinFocused(delta) {
  const i = state.edit.pos !== null ? state.edit.pos : 0;
  const tile = document.querySelector(`.tile.reel[data-pos="${i}"]`);
  if (!tile) return;
  const cur = ALPHA.indexOf(tile.querySelector('.strip .mid').textContent);
  tick(tile);
  glideReel(tile, cur, cur + delta);
}
function setInputMode(m) {
  if (m === inputMode) return;
  inputMode = m;
  store.set('unravel-input', m);
  document.querySelectorAll('[data-input]').forEach(b => b.classList.toggle('on', b.dataset.input === m));
  $('keyboard').hidden = (m === 'reel');
  renderBoard();
}

function renderThread(cutFrom = -1) {
  const board = $('board');
  board.querySelectorAll('.thread, .fray, .knot').forEach(el => el.remove());
  const rows = board.querySelectorAll('.row');
  const n = state.path.length;
  const b = board.getBoundingClientRect();
  const mid = (r) => rows[r].getBoundingClientRect().top - b.top + rows[r].getBoundingClientRect().height / 2;
  const last = cutFrom >= 0 ? cutFrom : n;
  if (n === 0) return;                           // no moves yet: no thread
  const thread = document.createElement('div');
  thread.className = 'thread';
  thread.style.top = mid(1) + 'px';
  thread.style.height = Math.max(0, mid(Math.max(1, last)) - mid(1)) + 'px';
  board.appendChild(thread);
  if (cutFrom >= 0 && n > cutFrom) {
    const fray = document.createElement('div');
    fray.className = 'fray';
    fray.style.top = mid(cutFrom) + 'px';
    fray.style.height = (mid(n) - mid(cutFrom)) + 'px';
    board.appendChild(fray);
  }
  for (let r = 1; r <= n; r++) {
    const k = document.createElement('div');
    k.className = 'knot' + (cutFrom >= 0 && r > cutFrom ? ' cut' : '');
    k.style.top = mid(r) + 'px';
    board.appendChild(k);
  }
}
function flipRowTo(row, cls) {
  [...row.children].forEach((t, i) => {
    t.classList.remove('flip');
    void t.offsetWidth;
    t.style.animationDelay = `${i * FLIP_MS}ms`;
    t.classList.add('flip');
    setTimeout(() => { t.classList.remove('green', 'grey', 'yellow'); t.classList.add(cls); }, i * FLIP_MS + FLIP_LEN / 2);
  });
}
function shakeRow(r) {
  const row = document.querySelector(`.row[data-row="${r}"]`);
  if (!row) return;
  row.classList.add('shake');
  setTimeout(() => row.classList.remove('shake'), 450);
}
function flashRow(r, cls) {
  const row = document.querySelector(`.row[data-row="${r}"]`);
  if (!row) return;
  row.classList.add(cls);
  setTimeout(() => row.classList.remove(cls), 700);
}
function renderUndo() {
  const b = $('btn-undo');
  b.disabled = !(state.status === 'playing' && state.path.length > 0);
  $('moves').textContent = state.moves ? `${state.moves} move${state.moves === 1 ? '' : 's'}` : '';
}
function renderKeyboard() {
  const kb = $('keyboard');
  kb.innerHTML = '';
  for (const line of ['qwertyuiop', 'asdfghjkl', 'enter zxcvbnm back']) {
    const row = document.createElement('div');
    row.className = 'krow';
    for (const tok of line.split(' ')) {
      if (tok === 'enter' || tok === 'back') {
        const b = document.createElement('button');
        b.className = 'key wide';
        b.textContent = tok === 'enter' ? 'Enter' : '⌫';
        b.dataset.key = tok;
        row.appendChild(b);
      } else {
        for (const c of tok) {
          const b = document.createElement('button');
          b.className = 'key' + (state.start.includes(c) ? ' spent' : '');   // belongs to the start word: plays as yellow
          b.textContent = c;
          b.dataset.key = c;
          row.appendChild(b);
        }
      }
    }
    kb.appendChild(row);
  }
}
let toastTimer;
function toast(msg, ms = 1400) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function miniRows(container, words, start) {
  container.innerHTML = '';
  container.style.setProperty('--cols', start.length);
  words.forEach((w, r) => {
    const row = document.createElement('div');
    row.className = 'row' + (r === 0 ? ' start' : '');
    for (let i = 0; i < start.length; i++) {
      const t = document.createElement('div');
      t.className = 'tile ' + tileClass(w, start, i);
      t.textContent = w[i];
      row.appendChild(t);
    }
    container.appendChild(row);
  });
}

/* ---------- clock ---------- */
let clockTimer;
function fmt(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function elapsedNow() {
  if (state.status !== 'playing') return state.elapsed;
  return state.startedAt ? Date.now() - state.startedAt : 0;
}
function renderClock() {
  clearInterval(clockTimer);
  const label = (state.practice ? `Practice · ${state.start.toUpperCase()}` : `#${state.number}`) + ` · par ${parFor(state.number)}`;
  const tick = () => { $('subtitle').textContent = state.startedAt ? `${label} · ${fmt(elapsedNow())}` : label; };
  tick();
  renderUndo();
  if (state.status === 'playing' && state.startedAt) clockTimer = setInterval(tick, 500);
}

/* ---------- result / share ---------- */
function vsPar() {
  const d = state.moves - parFor(state.number);
  return d === 0 ? 'par' : d > 0 ? `+${d} over par` : `${d} under par`;
}
function scoreLine() {
  return `${state.moves} move${state.moves === 1 ? '' : 's'} · ${vsPar()} · ⏱ ${fmt(state.elapsed)}`;
}
function emojiGrid() {
  const sq = { green: '🟩', yellow: '🟨', grey: '⬜' };
  return [state.start, ...state.path].map(w => [...w].map((_, i) => sq[tileClass(w, state.start, i)]).join('')).join('\n');
}
function shareText() {
  const name = modeTitle();
  const head = (state.practice ? `${name} · ${state.start.toUpperCase()}` : `${name} #${state.number}`) + ` · par ${parFor(state.number)}`;
  return `${head}\n${emojiGrid()}\n${scoreLine()}\n${SITE}`;
}
function statsHtml() {
  const s = loadStats();
  const avg = s.played ? s.overPar / s.played : 0;
  return [
    ['played', s.played],
    ['vs par', s.played ? (avg > 0 ? '+' : '') + avg.toFixed(1) : '–'],
    ['at par', s.atPar],
    ['streak', s.streak],
  ].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}
function showResult() {
  const d = state.moves - parFor(state.number);
  const onMap = state.path.every(w => COMMON.has(w));
  $('result-title').textContent = d < 0 ? 'Clean sweep. Under par.' : d === 0 ? 'Clean sweep. Par.' : 'Clean sweep.';
  const where = d < 0 ? ' Off the map: a shorter way than any in common words.' : (!onMap && d === 0 ? ' Off the map, and still par.' : '');
  $('result-body').textContent = `${state.start.toUpperCase()} is gone. ${scoreLine()}.${where}`;
  miniRows($('result-path'), [state.start, ...state.path], state.start);
  $('stats').innerHTML = state.practice ? '' : statsHtml();
  $('btn-share').hidden = false;
  open('modal-result');
}
function showStats() {
  if (state.status === 'won') return showResult();
  $('result-title').textContent = 'Stats';
  $('result-body').textContent = state.practice ? 'Practice games don\'t count.' : 'Finish today\'s puzzle to share it. New puzzle at midnight.';
  $('result-path').innerHTML = '';
  $('stats').innerHTML = statsHtml();
  $('btn-share').hidden = true;
  open('modal-result');
}
async function share() {
  const text = shareText();
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) { await navigator.share({ text }); track('Unravel.shared', { mode: modeName(), via: 'sheet' }); return; }
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
    track('Unravel.shared', { mode: modeName(), via: 'clipboard' });
  } catch { toast('Could not share'); }
}

/* ---------- telemetry: TelemetryDeck, no cookies, no personal data ----------
   Signals carry a random visitor id (hashed before sending), a per-load session id, and small
   string payloads. Signals from localhost are flagged as test mode; practice (?p=N) loads send nothing. */
const TD_APP = 'B45587C5-EA6B-4A7F-AD04-DC461B3662AD';
const TD_URL = 'https://nom.telemetrydeck.com/v2/namespace/com.ribbescobb/';   // org namespace from the dashboard's Setup tab
const TD_SESSION = Math.random().toString(36).slice(2);
const TD_TEST = /^localhost$|^127(\.\d+){0,2}\.\d+$/.test(location.hostname) || location.protocol === 'file:';
let tdUserHash = null;
async function tdUser() {
  if (tdUserHash) return tdUserHash;
  let id = store.get('unravel-visitor', null);
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()); store.set('unravel-visitor', id); }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id + '|unravel'));
  tdUserHash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return tdUserHash;
}
async function track(type, payload = {}) {
  try {
    if (state && state.practice) return;
    const body = { clientUser: await tdUser(), sessionID: TD_SESSION, appID: TD_APP, type, telemetryClientVersion: 'Unravel web' };
    if (TD_TEST) body.isTestMode = true;
    const p = {};
    for (const [k, v] of Object.entries(payload)) p[k] = String(v);
    if (Object.keys(p).length) body.payload = p;
    await fetch(TD_URL, { method: 'POST', mode: 'cors', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([body]) });
  } catch {}
}

/* ---------- tutorial: a real par-3 solve, played on a loop while the help sheet is open ---------- */
const TUT_START = 'car';
const TUT_STEPS = [                      // [committed rows, edit {pos, letter} or null, caption, hold ms]
  [['car'], null, 'You start with the answer.', 1500],
  [['car'], { pos: 2, letter: '' }, 'Pick a letter to change.', 1000],
  [['car'], { pos: 2, letter: 't' }, 'R becomes T.', 900],
  [['car', 'cat'], null, 'CAT. The R is gone, so it turns grey.', 1800],
  [['car', 'cat'], { pos: 0, letter: '' }, 'Again.', 800],
  [['car', 'cat'], { pos: 0, letter: 'b' }, 'C becomes B.', 900],
  [['car', 'cat', 'bat'], null, 'BAT. Two letters of CAR are gone.', 1600],
  [['car', 'cat', 'bat'], { pos: 1, letter: '' }, 'One left.', 800],
  [['car', 'cat', 'bat'], { pos: 1, letter: 'i' }, 'A becomes I.', 900],
  [['car', 'cat', 'bat', 'bit'], null, 'BIT. Nothing left of CAR. Three moves, par 3.', 2600],
];
let tutTimer = null;
function tutRender(rows, edit, caption, flipLast) {
  const board = $('tut-board');
  board.innerHTML = '';
  board.style.setProperty('--cols', 3);
  rows.forEach((w, r) => {
    const row = document.createElement('div');
    row.className = 'row' + (r === 0 ? ' start' : '');
    for (let i = 0; i < 3; i++) {
      const t = document.createElement('div');
      t.className = 'tile ' + tileClass(w, TUT_START, i);
      if (flipLast && r === rows.length - 1 && r > 0) { t.classList.add('flip'); t.style.animationDelay = `${i * FLIP_MS}ms`; }
      t.textContent = w[i];
      row.appendChild(t);
    }
    board.appendChild(row);
  });
  if (edit) {
    const prev = rows[rows.length - 1];
    const row = document.createElement('div');
    row.className = 'row';
    for (let i = 0; i < 3; i++) {
      const t = document.createElement('div');
      t.className = 'tile ghost';
      if (edit.pos === i) { t.classList.add('selected'); if (edit.letter) { t.classList.add('filled'); t.classList.add('pop'); } }
      t.textContent = edit.pos === i && edit.letter ? edit.letter : prev[i];
      row.appendChild(t);
    }
    board.appendChild(row);
  }
  $('tut-cap').textContent = caption;
}
function tutorialStart() {
  tutorialStop();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    tutRender(['car', 'cat', 'bat', 'bit'], null, 'CAR to CAT to BAT to BIT. One letter per move until nothing of CAR is left.', false);
    return;
  }
  $('tut-replay').hidden = true;
  let i = 0;
  const step = () => {
    const [rows, edit, cap, hold] = TUT_STEPS[i];
    const prevRows = i === 0 ? [] : TUT_STEPS[i - 1][0];
    tutRender(rows, edit, cap, rows.length > prevRows.length);
    i++;
    if (i < TUT_STEPS.length) tutTimer = setTimeout(step, hold);
    else { tutTimer = null; $('tut-replay').hidden = false; }   // plays through once, then offers a replay
  };
  step();
}
function tutorialStop() { clearTimeout(tutTimer); tutTimer = null; }

/* ---------- modals ---------- */
function open(id) { $(id).hidden = false; if (id === 'modal-help') tutorialStart(); }
function closeAll() { document.querySelectorAll('.modal').forEach(m => m.hidden = true); tutorialStop(); }

/* ---------- boot ---------- */
function boot() {
  const params = new URLSearchParams(location.search);
  inputMode = store.get('unravel-input', 'keys') === 'reel' ? 'reel' : 'keys';
  document.querySelectorAll('[data-input]').forEach(b => b.classList.toggle('on', b.dataset.input === inputMode));
  $('keyboard').hidden = (inputMode === 'reel');
  const savedMode = Number(store.get('unravel-mode', 0));
  const firstVisit = !savedMode && !store.get('unravel-seen-help3', false);
  L = params.has('easy') ? 4 : params.has('warm') ? 3 : [3, 4, 5].includes(savedMode) ? savedMode : firstVisit ? 3 : 5;
  const p = params.get('p');
  if (p && /^\d+$/.test(p)) newGame(parseInt(p, 10), parseInt(p, 10) !== todayNumber());
  else newGame(todayNumber(), false);

  if (!store.get('unravel-seen-help3', false)) { open('modal-help'); store.set('unravel-seen-help3', true); }
  track('pageView', { mode: modeName(), theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' });

  $('keyboard').addEventListener('click', e => { const k = e.target.closest('.key'); if (k) onKey(k.dataset.key); });
  $('board').addEventListener('click', e => { const t = e.target.closest('.tile.ghost[data-pos]'); if (t) selectPos(Number(t.dataset.pos)); });
  $('board').addEventListener('pointerdown', onReelDown);
  $('board').addEventListener('pointermove', onReelMove);
  $('board').addEventListener('pointerup', onReelUp);
  $('board').addEventListener('pointercancel', onReelUp);
  document.querySelectorAll('[data-input]').forEach(b => b.addEventListener('click', () => setInputMode(b.dataset.input)));
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!document.querySelector('.modal:not([hidden])')) {
      if (e.key === 'Enter') onKey('enter');
      else if (e.key === 'Backspace') onKey('back');
      else if (e.key === 'ArrowLeft') onKey('left');
      else if (e.key === 'ArrowRight') onKey('right');
      else if (e.key === 'ArrowUp') { e.preventDefault(); onKey('up'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); onKey('down'); }
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toLowerCase());
    } else if (e.key === 'Escape' || e.key === 'Enter') closeAll();
  });
  $('btn-undo').addEventListener('click', undo);
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(Number(b.dataset.mode))));
  $('btn-help').addEventListener('click', () => open('modal-help'));
  $('tut-replay').addEventListener('click', tutorialStart);
  $('btn-warmup').addEventListener('click', () => { closeAll(); if (L !== 3) setMode(3); });
  $('btn-stats').addEventListener('click', showStats);
  $('btn-share').addEventListener('click', share);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAll));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeAll(); }));
}
boot();
