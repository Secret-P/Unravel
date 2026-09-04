/* Unravel — Wordle, backwards.
   Start with the answer (5 greens). One letter per move, end on five greys.
   Unlimited moves; fewer is better. Scoring is always against the START word.
   Letters of the start word are dead. Hit a dead end and the doomed rows go
   yellow, get wiped, and you rewind to your last good word. Every move counts. */

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const VOCAB = {};                              // per word length: { dict: accepted guesses, common: "a way through" }
for (const L of Object.keys(WORDS)) VOCAB[L] = { common: new Set(WORDS[L].common), dict: new Set(WORDS[L].common.concat(WORDS[L].accepted)) };
let DICT, COMMON, L = 5;                       // bound to the current mode in newGame
const modeKey = () => (L === 5 ? '' : 'easy-');
const SITE = 'www.ribbescobb.com/unravel';
const FLIP_MS = 120, FLIP_LEN = 500;

const $ = (id) => document.getElementById(id);
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
  const days = Math.round((new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - new Date(y, m - 1, d)) / 864e5);
  return days + 1;
}
function scheduleEntry(num) {
  const sch = SCHEDULE[L];
  return sch[((num - 1) % sch.length + sch.length) % sch.length];
}
function puzzleForNumber(num) { return scheduleEntry(num)[1]; }
function pathsLabel() {
  const n = scheduleEntry(state.number)[2];
  return n >= 1000 ? '1000+ paths' : `${n} path${n === 1 ? '' : 's'}`;
}

/* ---------- rules ---------- */
function diffPositions(a, b) {
  const d = [];
  for (let i = 0; i < L; i++) if (a[i] !== b[i]) d.push(i);
  return d;
}
function validate(guess, prev, start, used, dead) {
  if (guess.length !== L) return 'Not enough letters';
  if (!DICT.has(guess)) return 'Not in word list';
  if (dead.has(guess)) return 'That line is dead';
  if (used.has(guess)) return 'Already used';
  const d = diffPositions(guess, prev);
  if (d.length === 0) return 'Change a letter';
  if (d.length > 1) return 'Change exactly one letter';
  const i = d[0];
  if (prev[i] !== start[i]) return 'That spot is already grey';
  if (start.includes(guess[i])) return `${guess[i].toUpperCase()} is a dead letter`;
  return null;
}
function moves(cur, start, used, vocab) {
  const out = [];
  for (let i = 0; i < L; i++) {
    if (cur[i] !== start[i]) continue;
    for (const c of ALPHA) {
      if (start.includes(c)) continue;
      const w = cur.slice(0, i) + c + cur.slice(i + 1);
      if (vocab.has(w) && !used.has(w)) out.push(w);
    }
  }
  return out;
}
// Can `cur` still reach five greys using only common words?
function completable(cur, start, used) {
  if (diffPositions(cur, start).length === L) return true;
  for (const w of moves(cur, start, used, COMMON)) {
    used.add(w);
    const ok = completable(w, start, used);
    used.delete(w);
    if (ok) return true;
  }
  return false;
}
// Index in `path` of the first word with no common-word way through (or -1).
function doomedIndex(path, start, dead) {
  const used = new Set([start, ...dead]);
  for (let i = 0; i < path.length; i++) {
    used.add(path[i]);
    if (!completable(path[i], start, new Set(used))) return i;
  }
  return -1;
}

/* ---------- persistence ---------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const statsKey = () => 'unravel-stats' + (L === 5 ? '' : '-easy');
const emptyStats = () => ({ played: 0, totalMoves: 0, perfect: 0, streak: 0, last: 0 });

/* ---------- game state ---------- */
function newGame(number, practice) {
  DICT = VOCAB[L].dict; COMMON = VOCAB[L].common;
  const start = puzzleForNumber(number);
  state = {
    number, start, practice, status: 'playing', busy: false, current: '',
    path: [], dead: [], moves: 0, deadEnds: 0, startedAt: 0, elapsed: 0,
  };
  if (!practice) {
    const s = store.get('unravel-' + modeKey() + number, null);
    if (s && s.start === start && Array.isArray(s.path)) Object.assign(state, {
      path: s.path, dead: s.dead || [], moves: s.moves || 0, deadEnds: s.deadEnds || 0,
      status: s.status, startedAt: s.startedAt || 0, elapsed: s.elapsed || 0, current: s.current || '',
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
  const { start, path, dead, moves, deadEnds, status, startedAt, elapsed, current } = state;
  store.set('unravel-' + modeKey() + state.number, { start, path, dead, moves, deadEnds, status, startedAt, elapsed, current });
}
function recordStats() {
  if (state.practice) return;
  const s = store.get(statsKey(), emptyStats());
  s.played++;
  s.totalMoves += state.moves;
  if (state.moves === L) s.perfect++;
  s.streak = (s.last === state.number - 1) ? s.streak + 1 : 1;
  s.last = state.number;
  store.set(statsKey(), s);
}

/* ---------- input ---------- */
function onKey(k) {
  if (state.busy) return;
  if (state.status !== 'playing') { if (k === 'enter') showResult(); return; }
  if (k === 'enter') return submit();
  if (k === 'back') { state.current = state.current.slice(0, -1); save(); return renderBoard(); }
  if (state.current.length < L && ALPHA.includes(k)) {
    if (!state.startedAt) { state.startedAt = Date.now(); renderClock(); track('Unravel.puzzleStarted', { mode: modeName(), puzzle: state.number }); }
    state.current += k;
    save();
    renderBoard(true);
  }
}
async function submit() {
  const guess = state.current;
  const prev = state.path.length ? state.path[state.path.length - 1] : state.start;
  const used = new Set([state.start, ...state.path]);
  const err = validate(guess, prev, state.start, used, new Set(state.dead));
  if (err) { toast(err); shakeRow(state.path.length + 1); return; }

  state.path.push(guess);
  state.moves++;
  state.current = '';
  used.add(guess);
  renderBoard(false, true);
  renderUndo();

  if (state.path.length === L) {
    state.status = 'won';
    state.elapsed = Date.now() - state.startedAt;
    save();
    renderClock();
    recordStats();
    track('Unravel.puzzleSolved', { mode: modeName(), puzzle: state.number, moves: state.moves, deadEnds: state.deadEnds, seconds: Math.round(state.elapsed / 1000) });
    setTimeout(showResult, L * FLIP_MS + FLIP_LEN);
    return;
  }
  save();
  if (moves(guess, state.start, used, DICT).length === 0) await crash();
}
async function crash() {
  state.busy = true;
  await sleep(L * FLIP_MS + FLIP_LEN);
  const di = doomedIndex(state.path, state.start, state.dead);
  const from = di < 0 ? state.path.length - 1 : di;  // di is never -1 at a real dead end
  const doomedWord = state.path[from];
  const anchor = from === 0 ? state.start : state.path[from - 1];
  state.deadEnds++;

  // 1. doomed rows flip to yellow, bottom row first (the rewind starts here)
  toast(`Dead end. This line died at ${doomedWord.toUpperCase()}.`, 2600);
  const rows = [];
  for (let r = state.path.length; r >= from + 1; r--) rows.push(document.querySelector(`.row[data-row="${r}"]`));
  rows.forEach((row, k) => setTimeout(() => flipRowTo(row, 'yellow'), k * 180));
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
  state.current = '';
  state.busy = false;
  save();
  renderBoard();
  renderUndo();
  flashRow(r - 1, 'rewound');
}

/* ---------- rendering ---------- */
function tileClass(word, start, i) { return word[i] === start[i] ? 'green' : 'grey'; }
function renderBoard(pop = false, flip = false) {
  const board = $('board');
  board.innerHTML = '';
  board.style.setProperty('--cols', L);
  const rows = [state.start, ...state.path];
  const curRow = rows.length;
  for (let r = 0; r <= L; r++) {
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
      } else if (r === curRow && state.status === 'playing') {
        const c = state.current[i] || '';
        t.textContent = c;
        if (c) {
          t.classList.add('filled');
          if (pop && i === state.current.length - 1) t.classList.add('pop');
        }
      }
      row.appendChild(t);
    }
    board.appendChild(row);
  }
  renderThread();
}
function renderThread(cutFrom = -1) {
  const board = $('board');
  board.querySelectorAll('.thread, .fray, .knot').forEach(el => el.remove());
  const rows = board.querySelectorAll('.row');
  const n = state.path.length;
  const b = board.getBoundingClientRect();
  const mid = (r) => rows[r].getBoundingClientRect().top - b.top + rows[r].getBoundingClientRect().height / 2;
  const last = cutFrom >= 0 ? cutFrom : n;
  const thread = document.createElement('div');
  thread.className = 'thread';
  thread.style.top = mid(0) + 'px';
  thread.style.height = Math.max(0, mid(last) - mid(0)) + 'px';
  board.appendChild(thread);
  if (cutFrom >= 0 && n > cutFrom) {
    const fray = document.createElement('div');
    fray.className = 'fray';
    fray.style.top = mid(cutFrom) + 'px';
    fray.style.height = (mid(n) - mid(cutFrom)) + 'px';
    board.appendChild(fray);
  }
  for (let r = 0; r <= n; r++) {
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
    setTimeout(() => { t.classList.remove('green', 'grey'); t.classList.add(cls); }, i * FLIP_MS + FLIP_LEN / 2);
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
          b.className = 'key' + (state.start.includes(c) ? ' dead' : '');
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
  for (const w of words) {
    const row = document.createElement('div');
    row.className = 'row';
    for (let i = 0; i < start.length; i++) {
      const t = document.createElement('div');
      t.className = 'tile ' + tileClass(w, start, i);
      t.textContent = w[i];
      row.appendChild(t);
    }
    container.appendChild(row);
  }
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
  const label = (state.practice ? `Practice · ${state.start.toUpperCase()}` : `#${state.number}`) + ` · ${pathsLabel()}`;
  const tick = () => { $('subtitle').textContent = state.startedAt ? `${label} · ${fmt(elapsedNow())}` : label; };
  tick();
  renderUndo();
  if (state.status === 'playing' && state.startedAt) clockTimer = setInterval(tick, 500);
}

/* ---------- result / share ---------- */
function scoreLine() {
  const m = `${state.moves} move${state.moves === 1 ? '' : 's'}`;
  const d = state.moves === L ? 'perfect' : `${state.deadEnds} dead end${state.deadEnds === 1 ? '' : 's'}`;
  return `${m} · ${d} · ⏱ ${fmt(state.elapsed)}`;
}
function emojiGrid() {
  return [state.start, ...state.path]
    .map(w => [...w].map((_, i) => w[i] === state.start[i] ? '🟩' : '⬜').join('')).join('\n');
}
function shareText() {
  const name = L === 5 ? 'Unravel' : 'Unravel Easy';
  const head = (state.practice ? `${name} · ${state.start.toUpperCase()}` : `${name} #${state.number}`) + ` · ${pathsLabel()}`;
  return `${head}\n${emojiGrid()}\n${scoreLine()}\n${SITE}`;
}
function statsHtml() {
  const s = store.get(statsKey(), emptyStats());
  return [
    ['played', s.played],
    ['avg moves', s.played ? (s.totalMoves / s.played).toFixed(1) : '–'],
    ['perfect', s.perfect],
    ['streak', s.streak],
  ].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}
function showResult() {
  const perfect = state.moves === L;
  $('result-title').textContent = perfect ? 'Clean sweep. Perfect.' : 'Clean sweep.';
  const onMap = state.path.every(w => COMMON.has(w));
  const n = scheduleEntry(state.number)[2];
  const where = onMap
    ? (n === 1 ? 'The only path through, and you found it.' : `One of ${pathsLabel()} through.`)
    : `Off the map: ${pathsLabel()} in common words, and yours wasn't one of them.`;
  $('result-body').textContent = `${state.start.toUpperCase()} is gone. ${scoreLine()}. ${where}`;
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
const TD_URL = 'https://nom.telemetrydeck.com/v2/';
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
const modeName = () => (L === 5 ? 'standard' : 'easy');
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

/* ---------- modals ---------- */
function open(id) { $(id).hidden = false; }
function closeAll() { document.querySelectorAll('.modal').forEach(m => m.hidden = true); }

/* ---------- boot ---------- */
function boot() {
  miniRows($('example'), ['brace', 'trace', 'trice', 'trick', 'thick', 'think'], 'brace');

  const params = new URLSearchParams(location.search);
  const savedMode = Number(store.get('unravel-mode', 5));
  L = params.has('easy') ? 4 : (savedMode === 4 ? 4 : 5);
  const p = params.get('p');
  if (p && /^\d+$/.test(p)) newGame(parseInt(p, 10), parseInt(p, 10) !== todayNumber());
  else newGame(todayNumber(), false);

  if (!store.get('unravel-seen-help', false)) { open('modal-help'); store.set('unravel-seen-help', true); }
  track('pageView', { mode: modeName(), theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' });

  $('keyboard').addEventListener('click', e => { const k = e.target.closest('.key'); if (k) onKey(k.dataset.key); });
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!document.querySelector('.modal:not([hidden])')) {
      if (e.key === 'Enter') onKey('enter');
      else if (e.key === 'Backspace') onKey('back');
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toLowerCase());
    } else if (e.key === 'Escape' || e.key === 'Enter') closeAll();
  });
  $('btn-undo').addEventListener('click', undo);
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(Number(b.dataset.mode))));
  $('btn-help').addEventListener('click', () => open('modal-help'));
  $('btn-stats').addEventListener('click', showStats);
  $('btn-share').addEventListener('click', share);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAll));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeAll(); }));
}
boot();
