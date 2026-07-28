import './moonflow.css';
import './pour-engine.css';

const CAPACITY = 4;
const COMBO_MS = 6000;
let selected: number | null = null;
let locked = false;
let replay = false;
let combo = 0;
let lastPour = 0;
let resetTimer: number | null = null;

type Pour = {
  from: number; to: number; source: DOMRect; target: DOMRect;
  a: string; b: string; amount: number; completes: boolean; empty: boolean;
};

const allBottles = () => [...document.querySelectorAll<HTMLElement>('.game-screen [data-bottle]')];
const bottleAt = (i: number) => document.querySelector<HTMLElement>(`.game-screen [data-bottle="${i}"]`);
const indexOf = (el: Element) => Number((el as HTMLElement).dataset.bottle);
const liquids = (el: Element) => [...el.querySelectorAll<HTMLElement>('.liquid')];
const topLiquid = (el: Element) => liquids(el).at(-1) ?? null;

function colors(el: Element): { a: string; b: string } | null {
  const top = topLiquid(el);
  if (!top) return null;
  const a = top.style.getPropertyValue('--c1') || '#fff';
  return { a, b: top.style.getPropertyValue('--c2') || a };
}

function runAmount(el: Element): number {
  const list = liquids(el);
  const top = list.at(-1)?.style.getPropertyValue('--c1');
  if (!top) return 0;
  let n = 0;
  for (let i = list.length - 1; i >= 0 && list[i].style.getPropertyValue('--c1') === top; i--) n++;
  return n;
}

function legal(from: Element, to: Element): boolean {
  if (from === to || liquids(to).length >= CAPACITY) return false;
  const a = colors(from)?.a;
  const b = colors(to)?.a;
  return Boolean(a && (!b || a === b));
}

function decorate(): void {
  const board = document.querySelector<HTMLElement>('.game-screen .board');
  if (!board) return;
  allBottles().forEach((bottle, i) => {
    bottle.classList.add('moon-vial');
    bottle.style.setProperty('--vial-order', String(i));
    if (!bottle.querySelector('.vial-aura')) bottle.prepend(Object.assign(document.createElement('span'), { className: 'vial-aura' }));
    if (!bottle.querySelector('.moon-choice-badge')) bottle.append(Object.assign(document.createElement('span'), { className: 'moon-choice-badge' }));
  });
  if (!board.querySelector('.moon-flow-hud')) {
    const hud = document.createElement('div');
    hud.className = 'moon-flow-hud';
    hud.innerHTML = '<small>MOON FLOW</small><b>Ready</b><span><i></i><i></i><i></i><i></i><i></i></span>';
    board.appendChild(hud);
  }
  if (!locked) {
    const native = document.querySelector<HTMLElement>('.game-screen .bottle.selected');
    selected = native ? indexOf(native) : null;
    paintSelection();
  }
  paintHud();
}

function paintSelection(): void {
  const board = document.querySelector<HTMLElement>('.game-screen .board');
  board?.classList.toggle('has-moon-selection', selected !== null);
  allBottles().forEach(b => {
    b.classList.remove('moon-selected', 'moon-target', 'moon-blocked');
    b.style.removeProperty('--choice-a'); b.style.removeProperty('--choice-b');
    const badge = b.querySelector<HTMLElement>('.moon-choice-badge');
    if (badge) delete badge.dataset.label;
  });
  if (selected === null) return;
  const source = bottleAt(selected);
  const c = source ? colors(source) : null;
  if (!source || !c) { selected = null; return; }
  source.classList.add('moon-selected');
  source.style.setProperty('--choice-a', c.a); source.style.setProperty('--choice-b', c.b);
  const badge = source.querySelector<HTMLElement>('.moon-choice-badge');
  if (badge) badge.dataset.label = 'SELECTED';
  allBottles().forEach(target => {
    if (target === source) return;
    target.style.setProperty('--choice-a', c.a); target.style.setProperty('--choice-b', c.b);
    const targetBadge = target.querySelector<HTMLElement>('.moon-choice-badge');
    if (legal(source, target)) {
      target.classList.add('moon-target');
      if (targetBadge) targetBadge.dataset.label = liquids(target).length ? 'MATCH' : 'POUR HERE';
    } else target.classList.add('moon-blocked');
  });
}

function paintHud(): void {
  const hud = document.querySelector<HTMLElement>('.moon-flow-hud');
  if (!hud) return;
  hud.classList.toggle('active', combo > 0); hud.classList.toggle('hot', combo >= 4);
  const label = hud.querySelector('b');
  if (label) label.textContent = combo === 0 ? 'Ready' : combo < 4 ? `Flow ×${combo}` : `Cosmic ×${combo}`;
  [...hud.querySelectorAll('i')].forEach((dot, i) => dot.classList.toggle('filled', i < Math.min(combo, 5)));
}

function pulseInvalid(el: HTMLElement): void {
  el.classList.remove('moon-invalid');
  requestAnimationFrame(() => el.classList.add('moon-invalid'));
  setTimeout(() => el.classList.remove('moon-invalid'), 430);
}

function pourData(from: HTMLElement, to: HTMLElement): Pour | null {
  const c = colors(from); if (!c) return null;
  const count = liquids(to).length;
  const amount = Math.min(runAmount(from), CAPACITY - count);
  if (!amount) return null;
  return { from: indexOf(from), to: indexOf(to), source: from.getBoundingClientRect(), target: to.getBoundingClientRect(), a: c.a, b: c.b, amount, completes: count + amount === CAPACITY, empty: count === 0 };
}

function stream(data: Pour): HTMLElement {
  const el = document.createElement('div');
  el.className = 'engine-pour-stream';
  el.style.cssText = `--pour-a:${data.a};--pour-b:${data.b};left:${data.target.left + data.target.width / 2}px;top:${data.target.top - 70}px`;
  for (let i = 0; i < data.amount + 4; i++) {
    const drop = document.createElement('i');
    drop.style.setProperty('--drop-delay', `${i * 55}ms`);
    drop.style.setProperty('--drop-x', `${(i % 2 ? 1 : -1) * (5 + i)}px`);
    el.appendChild(drop);
  }
  document.body.appendChild(el); return el;
}

function impact(data: Pour): void {
  const el = document.createElement('div');
  el.className = 'engine-pour-impact';
  el.style.cssText = `--pour-a:${data.a};--pour-b:${data.b};left:${data.target.left + data.target.width / 2}px;top:${data.target.top + 26}px`;
  el.appendChild(document.createElement('span'));
  for (let i = 0; i < 10; i++) {
    const spark = document.createElement('i'); spark.style.setProperty('--impact-angle', `${i * 36}deg`); el.appendChild(spark);
  }
  document.body.appendChild(el); setTimeout(() => el.remove(), 760);
}

function commitMove(target: number): void {
  const el = bottleAt(target); if (!el) return;
  replay = true;
  try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }
  finally { replay = false; }
}

function reward(data: Pour): void {
  const now = Date.now(); combo = now - lastPour < COMBO_MS ? Math.min(9, combo + 1) : 1; lastPour = now;
  if (resetTimer !== null) clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => { combo = 0; paintHud(); }, COMBO_MS);
  paintHud();
  const board = document.querySelector<HTMLElement>('.board'); if (!board) return;
  const label = document.createElement('div'); label.className = `moon-combo ${data.completes ? 'perfect' : ''}`;
  label.textContent = data.completes ? 'CONSTELLATION COMPLETE!' : combo >= 5 ? `COSMIC FLOW ×${combo}!` : combo >= 2 ? `FLOW ×${combo}` : data.empty ? 'NICE SETUP' : 'COLOR MATCH';
  board.appendChild(label); setTimeout(() => label.remove(), data.completes ? 1150 : 900);
  if (data.completes) setTimeout(() => celebrate(data.to), 70);
}

function celebrate(i: number): void {
  const bottle = bottleAt(i); if (!bottle) return;
  bottle.classList.add('moon-complete-pop');
  for (let n = 0; n < 16; n++) {
    const star = document.createElement('span'); star.className = 'moon-burst-star';
    star.style.setProperty('--angle', `${n * 22.5}deg`); star.style.setProperty('--distance', `${56 + n % 4 * 9}px`);
    bottle.appendChild(star); setTimeout(() => star.remove(), 980);
  }
  setTimeout(() => bottle.classList.remove('moon-complete-pop'), 850);
}

async function animatePour(from: HTMLElement, to: HTMLElement, data: Pour): Promise<void> {
  locked = true; from.classList.add('engine-source-active'); to.classList.add('engine-target-active');
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-bottle'); ghost.className = 'engine-pour-ghost moon-vial';
  ghost.style.cssText += `;left:${data.source.left}px;top:${data.source.top}px;width:${data.source.width}px;height:${data.source.height}px;--pour-a:${data.a};--pour-b:${data.b}`;
  document.body.appendChild(ghost);
  const sx = data.source.left + data.source.width / 2, tx = data.target.left + data.target.width / 2;
  const dir = tx >= sx ? 1 : -1, dx = tx - sx - dir * 38, dy = data.target.top - data.source.top - Math.min(76, data.source.height * .48), tilt = dir * 67;
  const animation = ghost.animate([
    { transform:'translate3d(0,0,0) rotate(0deg)', offset:0 },
    { transform:'translate3d(0,-22px,0) rotate(0deg)', offset:.14 },
    { transform:`translate3d(${dx}px,${dy}px,0) rotate(0deg)`, offset:.4 },
    { transform:`translate3d(${dx}px,${dy}px,0) rotate(${tilt}deg)`, offset:.52 },
    { transform:`translate3d(${dx}px,${dy}px,0) rotate(${tilt}deg)`, offset:.72 },
    { transform:`translate3d(${dx}px,${dy}px,0) rotate(0deg)`, offset:.82 },
    { transform:'translate3d(0,-18px,0) rotate(0deg)', offset:.94 },
    { transform:'translate3d(0,0,0) rotate(0deg)', offset:1 }
  ], { duration:1240, easing:'cubic-bezier(.2,.76,.18,1)', fill:'forwards' });
  setTimeout(() => stream(data), 520); setTimeout(() => impact(data), 735);
  setTimeout(() => { commitMove(data.to); selected = null; reward(data); }, 820);
  try { await animation.finished; } catch { /* keep board usable */ }
  document.querySelectorAll('.engine-pour-stream').forEach(el => el.remove()); ghost.remove();
  from.classList.remove('engine-source-active'); to.classList.remove('engine-target-active'); locked = false; decorate();
}

function bottleClick(event: Event): void {
  if (replay) return;
  const target = (event.target as Element | null)?.closest<HTMLElement>('[data-bottle]'); if (!target) return;
  if (locked) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  const native = document.querySelector<HTMLElement>('.game-screen .bottle.selected');
  const source = selected === null ? native : bottleAt(selected);
  if (!source) { if (liquids(target).length) selected = indexOf(target); else pulseInvalid(target); return; }
  if (indexOf(source) === indexOf(target)) { selected = null; return; }
  if (!legal(source, target)) { pulseInvalid(target); if (liquids(target).length) selected = indexOf(target); return; }
  const data = pourData(source, target); if (!data) return;
  event.preventDefault(); event.stopImmediatePropagation(); void animatePour(source, target, data);
}

function actionClick(event: Event): void {
  const action = (event.target as Element | null)?.closest<HTMLElement>('[data-action]')?.dataset.action; if (!action) return;
  if (locked) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (['undo','restart','back','next','play','daily'].includes(action)) selected = null;
  if (['restart','next','play','daily'].includes(action)) { combo = 0; lastPour = 0; paintHud(); }
}

const observer = new MutationObserver(decorate);
window.addEventListener('click', actionClick, true);
window.addEventListener('click', bottleClick, true);
observer.observe(document.documentElement, { childList:true, subtree:true });
window.addEventListener('DOMContentLoaded', decorate);
requestAnimationFrame(decorate);
