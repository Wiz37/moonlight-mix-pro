import './style.css';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

const CAPACITY = 4;
const STORAGE_KEY = 'moonlight_mix_save_v3';
const VERSION = 3;

type Bottle = number[];
type Move = { from: number; to: number; amount: number; color: number };
type ThemeId = 'violet' | 'ocean' | 'rose' | 'forest';
type Screen = 'home' | 'game' | 'themes' | 'stats' | 'settings';

type SaveData = {
  version: number;
  level: number;
  coins: number;
  streak: number;
  lastPlayed: string;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  selectedTheme: ThemeId;
  unlockedThemes: ThemeId[];
  completed: number;
  moves: number;
  hints: number;
  dailyBest: Record<string, number>;
};

const COLOR_PALETTE = [
  ['#ff78b5', '#e83286'], ['#79ddff', '#3187ff'], ['#ffd86f', '#f59a2a'],
  ['#9df18d', '#38bd67'], ['#c79aff', '#794cff'], ['#ff9a83', '#f05246'],
  ['#79f0dc', '#11b79e'], ['#f0a2ff', '#b44fd4'], ['#fff08b', '#d6b31b'],
  ['#9eb6ff', '#526ad7']
];

const THEMES: Record<ThemeId, { name: string; icon: string; cost: number; className: string }> = {
  violet: { name: 'Moon Violet', icon: '🌙', cost: 0, className: 'theme-violet' },
  ocean: { name: 'Midnight Ocean', icon: '🌊', cost: 300, className: 'theme-ocean' },
  rose: { name: 'Dreamy Rose', icon: '🌸', cost: 500, className: 'theme-rose' },
  forest: { name: 'Firefly Forest', icon: '🌲', cost: 750, className: 'theme-forest' }
};

const DEFAULT_SAVE: SaveData = {
  version: VERSION, level: 1, coins: 80, streak: 1, lastPlayed: '', sound: true,
  music: true, haptics: true, selectedTheme: 'violet', unlockedThemes: ['violet'],
  completed: 0, moves: 0, hints: 0, dailyBest: {}
};

function todayKey(): string { return new Date().toISOString().slice(0, 10); }
function yesterdayKey(): string { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    return { ...structuredClone(DEFAULT_SAVE), ...JSON.parse(raw), version: VERSION };
  } catch { return structuredClone(DEFAULT_SAVE); }
}

let save = loadSave();
function persist(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); }

function updateStreak(): void {
  const today = todayKey();
  if (save.lastPlayed === today) return;
  save.streak = save.lastPlayed === yesterdayKey() ? save.streak + 1 : 1;
  save.lastPlayed = today;
  persist();
}
updateStreak();

class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicTimer: number | null = null;
  private step = 0;

  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', volume = .045, delay = 0): void {
    if (!save.sound) return;
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + .012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + duration + .03);
  }

  tap(): void { this.tone(460, .07, 'sine', .035); }
  select(): void { this.tone(580, .08, 'triangle', .045); }
  pour(): void { [330, 392, 466].forEach((f, i) => this.tone(f, .17, 'sine', .026, i * .035)); }
  invalid(): void { this.tone(145, .12, 'square', .025); }
  undo(): void { this.tone(390, .07, 'triangle', .035); this.tone(295, .1, 'triangle', .03, .06); }
  coin(): void { this.tone(820, .08, 'sine', .05); this.tone(1120, .12, 'sine', .04, .07); }
  win(): void { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .32, 'sine', .055, i * .12)); }

  startMusic(): void {
    if (!save.music || this.musicTimer !== null) return;
    this.unlock();
    const notes = [220, 277.18, 329.63, 415.3, 329.63, 277.18, 246.94, 329.63];
    const play = () => {
      if (!save.music) { this.stopMusic(); return; }
      this.tone(notes[this.step++ % notes.length], .65, 'sine', .008);
      if (this.step % 2 === 0) this.tone(110, .9, 'triangle', .004);
    };
    play();
    this.musicTimer = window.setInterval(play, 720);
  }
  stopMusic(): void { if (this.musicTimer !== null) window.clearInterval(this.musicTimer); this.musicTimer = null; }
}
const audio = new AudioEngine();

async function impact(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
  if (!save.haptics) return;
  try { await Haptics.impact({ style }); } catch { /* browser */ }
}
async function successHaptic(): Promise<void> {
  if (!save.haptics) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* browser */ }
}

function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function topRun(bottle: Bottle): { color: number; amount: number } | null {
  if (!bottle.length) return null;
  const color = bottle[bottle.length - 1];
  let amount = 1;
  for (let i = bottle.length - 2; i >= 0 && bottle[i] === color; i--) amount++;
  return { color, amount };
}

function legalMove(board: Bottle[], from: number, to: number): Move | null {
  if (from === to) return null;
  const source = board[from], destination = board[to];
  const run = topRun(source);
  if (!run || destination.length >= CAPACITY) return null;
  const destTop = destination[destination.length - 1];
  if (destination.length && destTop !== run.color) return null;
  const amount = Math.min(run.amount, CAPACITY - destination.length);
  return amount > 0 ? { from, to, amount, color: run.color } : null;
}

function solved(board: Bottle[]): boolean {
  return board.every(b => b.length === 0 || (b.length === CAPACITY && b.every(c => c === b[0])));
}

function cloneBoard(board: Bottle[]): Bottle[] { return board.map(b => [...b]); }

function generateLevel(level: number, daily = false): Bottle[] {
  const colors = Math.min(10, 3 + Math.floor((level - 1) / 4));
  const empties = level < 20 ? 2 : 3;
  const random = rng((daily ? Number(todayKey().replaceAll('-', '')) : level * 7919) + 113);
  const board: Bottle[] = Array.from({ length: colors }, (_, c) => Array(CAPACITY).fill(c));
  for (let i = 0; i < empties; i++) board.push([]);

  const reverseSteps = 24 + Math.min(90, level * 3);
  let lastFrom = -1, lastTo = -1;
  for (let step = 0; step < reverseSteps; step++) {
    const sources = board.map((b, i) => ({ b, i })).filter(x => x.b.length > 0);
    const sourceEntry = sources[Math.floor(random() * sources.length)];
    const source = sourceEntry.b;
    const run = topRun(source)!;
    const destinations = board.map((b, i) => ({ b, i })).filter(x =>
      x.i !== sourceEntry.i && x.b.length < CAPACITY && !(x.i === lastFrom && sourceEntry.i === lastTo)
    );
    if (!destinations.length) continue;
    const destEntry = destinations[Math.floor(random() * destinations.length)];
    const maxAmount = Math.min(run.amount, CAPACITY - destEntry.b.length);
    const amount = 1 + Math.floor(random() * maxAmount);
    destEntry.b.push(...source.splice(source.length - amount, amount));
    lastFrom = sourceEntry.i; lastTo = destEntry.i;
  }
  if (solved(board)) return generateLevel(level + 137, daily);
  return board;
}

class GameController {
  screen: Screen = 'home';
  board: Bottle[] = [];
  initial: Bottle[] = [];
  selected: number | null = null;
  history: { board: Bottle[]; move: Move }[] = [];
  moveCount = 0;
  daily = false;
  won = false;

  start(level = save.level, daily = false): void {
    this.daily = daily;
    this.board = generateLevel(level, daily);
    this.initial = cloneBoard(this.board);
    this.selected = null;
    this.history = [];
    this.moveCount = 0;
    this.won = false;
    this.screen = 'game';
    audio.startMusic();
    render();
  }

  selectBottle(index: number): void {
    audio.unlock();
    if (this.won) return;
    if (this.selected === null) {
      if (!this.board[index].length) { audio.invalid(); void impact(); return; }
      this.selected = index; audio.select(); void impact(); render(); return;
    }
    if (this.selected === index) { this.selected = null; audio.tap(); render(); return; }
    const move = legalMove(this.board, this.selected, index);
    if (!move) {
      if (this.board[index].length) { this.selected = index; audio.select(); }
      else audio.invalid();
      void impact(); render(); return;
    }
    this.history.push({ board: cloneBoard(this.board), move });
    const source = this.board[move.from];
    this.board[move.to].push(...source.splice(source.length - move.amount, move.amount));
    this.moveCount++; save.moves++; persist();
    this.selected = null;
    audio.pour(); void impact(ImpactStyle.Medium);
    render();
    if (solved(this.board)) window.setTimeout(() => this.complete(), 500);
  }

  undo(): void {
    const previous = this.history.pop();
    if (!previous || this.won) { audio.invalid(); return; }
    this.board = previous.board; this.moveCount = Math.max(0, this.moveCount - 1); this.selected = null;
    audio.undo(); void impact(); render();
  }

  restart(): void {
    this.board = cloneBoard(this.initial); this.history = []; this.moveCount = 0; this.selected = null;
    audio.tap(); render();
  }

  hint(): void {
    if (this.won) return;
    const candidates: Move[] = [];
    for (let i = 0; i < this.board.length; i++) for (let j = 0; j < this.board.length; j++) {
      const move = legalMove(this.board, i, j);
      if (move) candidates.push(move);
    }
    const hint = candidates.sort((a, b) => {
      const da = this.board[a.to].length ? 2 : 0;
      const db = this.board[b.to].length ? 2 : 0;
      const ca = this.board[a.to].length + a.amount === CAPACITY ? 3 : 0;
      const cb = this.board[b.to].length + b.amount === CAPACITY ? 3 : 0;
      return (db + cb) - (da + ca);
    })[0];
    if (!hint) { audio.invalid(); return; }
    save.hints++; persist();
    render();
    requestAnimationFrame(() => {
      document.querySelector(`[data-bottle="${hint.from}"]`)?.classList.add('hint-source');
      document.querySelector(`[data-bottle="${hint.to}"]`)?.classList.add('hint-target');
      window.setTimeout(() => render(), 1100);
    });
  }

  complete(): void {
    if (this.won) return;
    this.won = true;
    const base = this.daily ? 40 : 20;
    const efficiency = Math.max(0, 25 - Math.max(0, this.moveCount - this.board.length * 2));
    const reward = base + efficiency;
    save.coins += reward; save.completed++;
    if (this.daily) {
      const key = todayKey();
      const old = save.dailyBest[key] || 9999;
      save.dailyBest[key] = Math.min(old, this.moveCount);
    } else save.level++;
    persist(); audio.win(); void successHaptic(); render();
  }
}
const game = new GameController();

const app = document.querySelector<HTMLDivElement>('#app')!;

function stars(): string { return '<div class="stars"></div><div class="aurora"></div>'; }
function topBar(title = 'Moonlight Mix'): string {
  return `<header class="topbar"><button class="round" data-action="back" aria-label="Back">${game.screen === 'home' ? '☾' : '‹'}</button><div class="brand"><small>RELAX • SORT • GLOW</small><strong>${title}</strong></div><div class="coin">🌙 <b>${save.coins}</b></div></header>`;
}

function homeScreen(): string {
  const progress = ((save.level - 1) % 10) * 10;
  const dailyDone = Boolean(save.dailyBest[todayKey()]);
  return `<main class="app-shell ${THEMES[save.selectedTheme].className}">${stars()}${topBar()}
    <section class="hero">
      <div class="moon-logo"><span>✦</span><b>☾</b></div>
      <p>Your cozy nighttime puzzle</p><h1>Level ${save.level}</h1>
      <div class="level-progress"><i style="width:${progress}%"></i></div>
      <button class="play-button" data-action="play"><span>▶</span> Continue</button>
    </section>
    <section class="daily-card ${dailyDone ? 'done' : ''}" data-action="daily">
      <div class="daily-icon">${dailyDone ? '✓' : '✨'}</div><div><small>DAILY MOON</small><b>${dailyDone ? 'Challenge complete' : 'A fresh puzzle awaits'}</b><span>${dailyDone ? `Best: ${save.dailyBest[todayKey()]} moves` : '+40 moon coins'}</span></div><em>›</em>
    </section>
    <section class="home-grid">
      <button data-action="themes"><span>🎨</span><b>Themes</b><small>${save.unlockedThemes.length}/4 unlocked</small></button>
      <button data-action="stats"><span>🏆</span><b>My Progress</b><small>${save.completed} puzzles</small></button>
      <button data-action="settings"><span>⚙️</span><b>Settings</b><small>Sound & comfort</small></button>
    </section>
    <footer><span>🔥 ${save.streak} day streak</span><span>Made for calm evenings</span></footer>
  </main>`;
}

function bottleHtml(bottle: Bottle, index: number): string {
  const complete = bottle.length === CAPACITY && bottle.every(c => c === bottle[0]);
  return `<button class="bottle ${game.selected === index ? 'selected' : ''} ${complete ? 'complete' : ''}" data-bottle="${index}" aria-label="Bottle ${index + 1}">
    <div class="rim"></div><div class="glass">
      ${bottle.map((color, slot) => `<div class="liquid" style="--slot:${slot};--c1:${COLOR_PALETTE[color][0]};--c2:${COLOR_PALETTE[color][1]}"><i></i></div>`).join('')}
      <div class="shine"></div>${complete ? '<div class="complete-star">✦</div>' : ''}
    </div></button>`;
}

function gameScreen(): string {
  const title = game.daily ? 'Daily Moon' : `Level ${save.level}`;
  return `<main class="app-shell game-screen ${THEMES[save.selectedTheme].className}">${stars()}${topBar(title)}
    <section class="game-meta"><span>Moves <b>${game.moveCount}</b></span><p>Group every color into its own bottle</p><span>Best <b>${game.daily ? (save.dailyBest[todayKey()] || '—') : '★'}</b></span></section>
    <section class="board" style="--count:${game.board.length}">${game.board.map(bottleHtml).join('')}</section>
    <section class="controls">
      <button data-action="undo" ${!game.history.length ? 'disabled' : ''}><span>↶</span><b>Undo</b></button>
      <button data-action="restart"><span>⟳</span><b>Restart</b></button>
      <button data-action="hint"><span>💡</span><b>Hint</b></button>
    </section>
    <p class="game-tip">Tap a bottle, then tap where you want it to pour.</p>
    ${game.won ? winOverlay() : ''}
  </main>`;
}

function winOverlay(): string {
  const reward = (game.daily ? 40 : 20) + Math.max(0, 25 - Math.max(0, game.moveCount - game.board.length * 2));
  return `<div class="overlay"><div class="win-card"><div class="win-moon">☾</div><small>BEAUTIFULLY SORTED</small><h2>${game.daily ? 'Daily complete!' : 'Level complete!'}</h2><p>You found a little calm in ${game.moveCount} moves.</p><div class="reward">🌙 +${reward} moon coins</div><button data-action="next">${game.daily ? 'Back Home' : 'Next Puzzle'} <span>›</span></button></div></div>`;
}

function themesScreen(): string {
  return `<main class="app-shell ${THEMES[save.selectedTheme].className}">${stars()}${topBar('Dream Themes')}<section class="page-heading"><h1>Set the mood</h1><p>Unlock relaxing worlds with moon coins.</p></section><section class="theme-list">
    ${(Object.keys(THEMES) as ThemeId[]).map(id => { const t = THEMES[id]; const unlocked = save.unlockedThemes.includes(id); const selected = save.selectedTheme === id; return `<button class="theme-card ${t.className} ${selected ? 'selected' : ''}" data-theme="${id}"><span class="theme-preview">${t.icon}<i>✦</i></span><span><b>${t.name}</b><small>${selected ? 'Currently selected' : unlocked ? 'Tap to select' : `🌙 ${t.cost}`}</small></span><em>${selected ? '✓' : unlocked ? '›' : '🔒'}</em></button>`; }).join('')}
  </section></main>`;
}

function statsScreen(): string {
  return `<main class="app-shell ${THEMES[save.selectedTheme].className}">${stars()}${topBar('My Progress')}<section class="page-heading"><h1>Your quiet wins</h1><p>Every sorted bottle counts.</p></section><section class="stats-grid">
    <div><span>🏆</span><b>${save.completed}</b><small>Puzzles completed</small></div><div><span>🔥</span><b>${save.streak}</b><small>Day streak</small></div><div><span>🌙</span><b>${save.coins}</b><small>Moon coins</small></div><div><span>↗</span><b>${save.moves}</b><small>Total moves</small></div><div><span>💡</span><b>${save.hints}</b><small>Hints used</small></div><div><span>🎨</span><b>${save.unlockedThemes.length}</b><small>Themes unlocked</small></div>
  </section><button class="danger-link" data-action="reset-save">Reset all progress</button></main>`;
}

function settingsScreen(): string {
  const row = (label: string, icon: string, key: 'sound'|'music'|'haptics', description: string) => `<button class="setting-row" data-toggle="${key}"><span>${icon}</span><div><b>${label}</b><small>${description}</small></div><i class="switch ${save[key] ? 'on' : ''}"><em></em></i></button>`;
  return `<main class="app-shell ${THEMES[save.selectedTheme].className}">${stars()}${topBar('Settings')}<section class="page-heading"><h1>Comfort controls</h1><p>Make Moonlight Mix feel right for you.</p></section><section class="settings-list">${row('Sound effects','🔊','sound','Pours, taps and rewards')}${row('Calm music','🎵','music','Soft procedural nighttime loop')}${row('Haptics','📳','haptics','Gentle touch feedback')}</section><section class="info-card"><b>Moonlight Mix v1.0</b><p>Original cozy sorting puzzle. Progress is stored privately on this device.</p><a href="privacy.html">Privacy policy</a></section></main>`;
}

function render(): void {
  app.innerHTML = game.screen === 'home' ? homeScreen() : game.screen === 'game' ? gameScreen() : game.screen === 'themes' ? themesScreen() : game.screen === 'stats' ? statsScreen() : settingsScreen();
  bindEvents();
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.addEventListener('click', () => {
    const action = el.dataset.action;
    audio.tap(); void impact();
    if (action === 'play') game.start(save.level);
    if (action === 'daily') game.start(save.level, true);
    if (action === 'themes') { game.screen = 'themes'; render(); }
    if (action === 'stats') { game.screen = 'stats'; render(); }
    if (action === 'settings') { game.screen = 'settings'; render(); }
    if (action === 'back') { game.screen = 'home'; render(); }
    if (action === 'undo') game.undo();
    if (action === 'restart') game.restart();
    if (action === 'hint') game.hint();
    if (action === 'next') { game.won = false; game.daily ? (game.screen = 'home', render()) : game.start(save.level); }
    if (action === 'reset-save' && confirm('Reset all Moonlight Mix progress?')) { save = structuredClone(DEFAULT_SAVE); persist(); game.screen = 'home'; render(); }
  }));
  document.querySelectorAll<HTMLElement>('[data-bottle]').forEach(el => el.addEventListener('click', () => game.selectBottle(Number(el.dataset.bottle))));
  document.querySelectorAll<HTMLElement>('[data-theme]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.theme as ThemeId; const theme = THEMES[id];
    if (!save.unlockedThemes.includes(id)) {
      if (save.coins < theme.cost) { audio.invalid(); alert(`You need ${theme.cost - save.coins} more moon coins.`); return; }
      save.coins -= theme.cost; save.unlockedThemes.push(id); audio.coin();
    }
    save.selectedTheme = id; persist(); render();
  }));
  document.querySelectorAll<HTMLElement>('[data-toggle]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.toggle as 'sound'|'music'|'haptics'; save[key] = !save[key]; persist();
    if (key === 'music') save.music ? audio.startMusic() : audio.stopMusic(); render();
  }));
}

void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
void App.addListener('appStateChange', ({ isActive }) => { if (!isActive) audio.stopMusic(); else if (game.screen === 'game') audio.startMusic(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stopMusic(); else if (game.screen === 'game') audio.startMusic(); });
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
render();
