/* Unwordle — Wordle, backwards.
   Start with the answer (5 greens). One letter per move, five moves, end on five greys.
   Scoring is always against the START word. Letters of the start word are dead. */

const EPOCH = new Date(2026, 8, 4);            // Puzzle #1 = 2026-09-04 (local)
const DICT = new Set(ANSWERS.concat(ALLOWED)); // accepted guesses
const COMMON = new Set(ANSWERS);               // used for shown solutions
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const MOVES = 5;
const SITE = 'www.ribbescobb.com/unwordle';

const $ = (id) => document.getElementById(id);
let state = null;

/* ---------- puzzle selection ---------- */
function todayNumber() {
  const n = new Date();
  const t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((t - EPOCH) / 864e5) + 1;
}
function puzzleForNumber(num) {
  const i = ((num - 1) % PUZZLES.length + PUZZLES.length) % PUZZLES.length;
  return PUZZLES[i][0];
}

/* ---------- rules ---------- */
function diffPositions(a, b) {
  const d = [];
  for (let i = 0; i < 5; i++) if (a[i] !== b[i]) d.push(i);
  return d;
}
// Returns null if legal, else an error message.
function validate(guess, prev, start, used) {
  if (guess.length !== 5) return 'Not enough letters';
  if (!DICT.has(guess)) return 'Not in word list';
  if (used.has(guess)) return 'Already used';
  const d = diffPositions(guess, prev);
  if (d.length === 0) return 'Change a letter';
  if (d.length > 1) return 'Change exactly one letter';
  const i = d[0];
  if (prev[i] !== start[i]) return 'That spot is already grey';
  if (start.includes(guess[i])) return `${guess[i].toUpperCase()} is a dead letter`;
  return null;
}
function legalMoves(cur, start, used) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    if (cur[i] !== start[i]) continue;
    for (const c of ALPHA) {
      if (start.includes(c)) continue;
      const w = cur.slice(0, i) + c + cur.slice(i + 1);
      if (DICT.has(w) && !used.has(w)) out.push(w);
    }
  }
  return out;
}
// One full solution using only common words (guaranteed to exist for every puzzle).
function solution(start) {
  const path = [];
  const dfs = (cur) => {
    if (path.length === MOVES) return true;
    for (let i = 0; i < 5; i++) {
      if (cur[i] !== start[i]) continue;
      for (const c of ALPHA) {
        if (start.includes(c)) continue;
        const w = cur.slice(0, i) + c + cur.slice(i + 1);
        if (COMMON.has(w) && !path.includes(w)) {
          path.push(w);
          if (dfs(w)) return true;
          path.pop();
        }
      }
    }
    return false;
  };
  dfs(start);
  return path;
}

/* ---------- persistence ---------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- game state ---------- */
function newGame(number, practice) {
  const start = puzzleForNumber(number);
  state = { number, start, practice, guesses: [], status: 'playing', current: '', startedAt: 0, elapsed: 0 };
  if (!practice) {
    const saved = store.get('unwordle-' + number, null);
    if (saved && saved.start === start) {
      state.guesses = saved.guesses;
      state.status = saved.status;
      state.startedAt = saved.startedAt || 0;
      state.elapsed = saved.elapsed || 0;
    }
  }
  renderClock();
  renderKeyboard();
  renderBoard();
  if (state.status !== 'playing') setTimeout(showResult, 400);
}
function save() {
  if (state.practice) return;
  store.set('unwordle-' + state.number, { start: state.start, guesses: state.guesses, status: state.status, startedAt: state.startedAt, elapsed: state.elapsed });
}
function recordStats(won) {
  if (state.practice) return;
  const s = store.get('unwordle-stats', { played: 0, won: 0, streak: 0, best: 0, last: 0 });
  s.played++;
  if (won) {
    s.streak = (s.last === state.number - 1) ? s.streak + 1 : 1;
    s.won++;
    s.best = Math.max(s.best, s.streak);
  } else {
    s.streak = 0;
  }
  s.last = state.number;
  store.set('unwordle-stats', s);
}

/* ---------- input ---------- */
function onKey(k) {
  if (state.status !== 'playing') { if (k === 'enter') showResult(); return; }
  if (k === 'enter') return submit();
  if (k === 'back') { state.current = state.current.slice(0, -1); return renderBoard(); }
  if (state.current.length < 5 && ALPHA.includes(k)) {
    if (!state.startedAt) { state.startedAt = Date.now(); save(); renderClock(); }
    state.current += k;
    renderBoard(true);
  }
}
function submit() {
  const guess = state.current;
  const prev = state.guesses.length ? state.guesses[state.guesses.length - 1] : state.start;
  const used = new Set([state.start, ...state.guesses]);
  const err = validate(guess, prev, state.start, used);
  if (err) { toast(err); shakeRow(state.guesses.length + 1); return; }

  state.guesses.push(guess);
  state.current = '';
  used.add(guess);

  if (state.guesses.length === MOVES) {
    state.status = 'won';
  } else if (legalMoves(guess, state.start, used).length === 0) {
    state.status = 'lost';
  }
  if (state.status !== 'playing') state.elapsed = Date.now() - state.startedAt;
  renderBoard(false, true);
  save();
  renderClock();
  if (state.status !== 'playing') {
    recordStats(state.status === 'won');
    setTimeout(showResult, 5 * 120 + 500);
  }
}

/* ---------- rendering ---------- */
function tileClasses(word, start, i) {
  if (word[i] === start[i]) return 'green';
  return start.includes(word[i]) ? 'yellow' : 'grey';
}
function renderBoard(pop = false, flip = false) {
  const board = $('board');
  board.innerHTML = '';
  const rows = [state.start, ...state.guesses];
  const curRow = rows.length;
  for (let r = 0; r <= MOVES; r++) {
    const row = document.createElement('div');
    row.className = 'row' + (r === 0 ? ' start' : '');
    row.dataset.row = r;
    const word = rows[r];
    for (let i = 0; i < 5; i++) {
      const t = document.createElement('div');
      t.className = 'tile';
      if (word) {
        t.textContent = word[i];
        t.classList.add(tileClasses(word, state.start, i));
        if (flip && r === curRow - 1 && r > 0) {
          t.classList.add('flip');
          t.style.animationDelay = `${i * 120}ms`;
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
}
function shakeRow(r) {
  const row = document.querySelector(`.row[data-row="${r}"]`);
  if (!row) return;
  row.classList.add('shake');
  setTimeout(() => row.classList.remove('shake'), 450);
}
function renderKeyboard() {
  const kb = $('keyboard');
  kb.innerHTML = '';
  const layout = ['qwertyuiop', 'asdfghjkl', 'enter zxcvbnm back'];
  for (const line of layout) {
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
function miniRows(container, words, start, fadeFrom = -1) {
  container.innerHTML = '';
  words.forEach((w, r) => {
    const row = document.createElement('div');
    row.className = 'row' + (fadeFrom >= 0 && r >= fadeFrom ? ' faded' : '');
    for (let i = 0; i < 5; i++) {
      const t = document.createElement('div');
      t.className = 'tile ' + tileClasses(w, start, i);
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
  const label = state.practice ? `Practice · ${state.start.toUpperCase()}` : `#${state.number}`;
  const tick = () => { $('subtitle').textContent = state.startedAt ? `${label} · ${fmt(elapsedNow())}` : label; };
  tick();
  if (state.status === 'playing' && state.startedAt) clockTimer = setInterval(tick, 500);
}

/* ---------- result / share ---------- */
function emojiGrid() {
  const rows = [state.start, ...state.guesses];
  return rows.map(w => [...w].map((_, i) => w[i] === state.start[i] ? '🟩' : '⬜').join('')).join('\n');
}
function shareText() {
  const head = state.practice ? `Unwordle · ${state.start.toUpperCase()}` : `Unwordle #${state.number}`;
  const time = fmt(state.elapsed);
  const tail = state.status === 'won' ? `⏱ ${time}` : `💀 dead end after ${state.guesses.length} · ${time}`;
  return `${head}\n${emojiGrid()}\n${tail}\n${SITE}`;
}
function showResult() {
  const won = state.status === 'won';
  $('result-title').textContent = won ? 'Clean sweep.' : 'Dead end.';
  $('result-body').textContent = won
    ? `${state.start.toUpperCase()} is gone in ${fmt(state.elapsed)}. Nothing left of it.`
    : `No legal word from ${state.guesses[state.guesses.length - 1].toUpperCase()} after ${fmt(state.elapsed)}. One way through:`;
  miniRows($('result-path'), won ? [state.start, ...state.guesses] : [state.start, ...solution(state.start)], state.start);
  const s = store.get('unwordle-stats', { played: 0, won: 0, streak: 0, best: 0 });
  $('stats').innerHTML = state.practice ? '' : [
    ['played', s.played], ['won %', s.played ? Math.round(100 * s.won / s.played) : 0],
    ['streak', s.streak], ['best', s.best],
  ].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  open('modal-result');
}
async function share() {
  const text = shareText();
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Could not share');
  }
}

/* ---------- modals ---------- */
function open(id) { $(id).hidden = false; }
function closeAll() { document.querySelectorAll('.modal').forEach(m => m.hidden = true); }

/* ---------- boot ---------- */
function boot() {
  // Help example: BRACE -> TRACE -> TRICK ... (the real #1 solution)
  const ex = solution('brace');
  miniRows($('example'), ['brace', ...ex], 'brace');

  const params = new URLSearchParams(location.search);
  const p = params.get('p');
  if (p === 'random') newGame(1 + Math.floor(Math.random() * PUZZLES.length), true);
  else if (p && /^\d+$/.test(p)) newGame(parseInt(p, 10), parseInt(p, 10) !== todayNumber());
  else newGame(todayNumber(), false);

  if (!store.get('unwordle-seen-help', false)) {
    open('modal-help');
    store.set('unwordle-seen-help', true);
  }

  $('keyboard').addEventListener('click', e => {
    const k = e.target.closest('.key');
    if (k) onKey(k.dataset.key);
  });
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!document.querySelector('.modal:not([hidden])')) {
      if (e.key === 'Enter') onKey('enter');
      else if (e.key === 'Backspace') onKey('back');
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toLowerCase());
    } else if (e.key === 'Escape' || e.key === 'Enter') closeAll();
  });
  $('btn-help').addEventListener('click', () => open('modal-help'));
  $('btn-stats').addEventListener('click', showResultOrStats);
  $('btn-share').addEventListener('click', share);
  $('btn-random').addEventListener('click', () => {
    closeAll();
    newGame(1 + Math.floor(Math.random() * PUZZLES.length), true);
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAll));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeAll(); }));
}
function showResultOrStats() {
  if (state.status !== 'playing') return showResult();
  const s = store.get('unwordle-stats', { played: 0, won: 0, streak: 0, best: 0 });
  $('result-title').textContent = 'Stats';
  $('result-body').textContent = state.practice ? 'Practice games don\'t count.' : 'Finish today\'s puzzle to share it.';
  $('result-path').innerHTML = '';
  $('stats').innerHTML = [
    ['played', s.played], ['won %', s.played ? Math.round(100 * s.won / s.played) : 0],
    ['streak', s.streak], ['best', s.best],
  ].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  open('modal-result');
}
boot();
