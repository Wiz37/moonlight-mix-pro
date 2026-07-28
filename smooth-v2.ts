import './moonflow.css';
import './pour-engine.css';

const CAPACITY = 4;
const COMBO_MS = 6000;
const POUR_DURATION_MS = 1240;
const POUR_WATCHDOG_MS = 1700;

let selected: number | null = null;
let locked = false;
let replay = false;
let combo = 0;
let lastPour = 0;
let resetTimer: number | null = null;
let pourSequence = 0;

type Pour = {
  from: number;
  to: number;
  source: DOMRect;
  target: DOMRect;
  a: string;
  b: string;
  amount: number;
  completes: boolean;
  empty: boolean;
};

type ActivePour = {
  id: number;
  source: HTMLElement;
  target: HTMLElement;
  ghost: HTMLElement;
  animation: Animation | null;
  timers: number[];
  effects: HTMLElement[];
  committed: boolean;
};

let activePour: ActivePour | null = null;

const allBottles = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.game-screen [data-bottle]')];
const bottleAt = (index: number): HTMLElement | null => document.querySelector<HTMLElement>(`.game-screen [data-bottle="${index}"]`);
const indexOf = (element: Element): number => Number((element as HTMLElement).dataset.bottle);
const liquids = (element: Element): HTMLElement[] => [...element.querySelectorAll<HTMLElement>('.liquid')];

function topLiquid(element: Element): HTMLElement | null {
  const list = liquids(element);
  return list.length ? list[list.length - 1] : null;
}

function colors(element: Element): { a: string; b: string } | null {
  const top = topLiquid(element);
  if (!top) return null;
  const a = top.style.getPropertyValue('--c1') || '#fff';
  return { a, b: top.style.getPropertyValue('--c2') || a };
}

function runAmount(element: Element): number {
  const list = liquids(element);
  const top = list.length ? list[list.length - 1].style.getPropertyValue('--c1') : '';
  if (!top) return 0;
  let amount = 0;
  for (let index = list.length - 1; index >= 0 && list[index].style.getPropertyValue('--c1') === top; index--) amount++;
  return amount;
}

function legal(from: Element, to: Element): boolean {
  if (from === to || liquids(to).length >= CAPACITY) return false;
  const sourceColor = colors(from)?.a;
  const targetColor = colors(to)?.a;
  return Boolean(sourceColor && (!targetColor || sourceColor === targetColor));
}

function decorate(): void {
  const board = document.querySelector<HTMLElement>('.game-screen .board');
  if (!board) return;

  allBottles().forEach((bottle, index) => {
    bottle.classList.add('moon-vial');
    bottle.style.setProperty('--vial-order', String(index));
    if (!bottle.querySelector('.vial-aura')) {
      const aura = document.createElement('span');
      aura.className = 'vial-aura';
      bottle.prepend(aura);
    }
    if (!bottle.querySelector('.moon-choice-badge')) {
      const badge = document.createElement('span');
      badge.className = 'moon-choice-badge';
      bottle.appendChild(badge);
    }
  });

  if (!board.querySelector('.moon-flow-hud')) {
    const hud = document.createElement('div');
    hud.className = 'moon-flow-hud';
    hud.innerHTML = '<small>MOON FLOW</small><b>Ready</b><span><i></i><i></i><i></i><i></i><i></i></span>';
    board.appendChild(hud);
  }

  if (!locked) {
    const nativeSelected = document.querySelector<HTMLElement>('.game-screen .bottle.selected');
    selected = nativeSelected ? indexOf(nativeSelected) : null;
    paintSelection();
  }
  paintHud();
}

function paintSelection(): void {
  const board = document.querySelector<HTMLElement>('.game-screen .board');
  board?.classList.toggle('has-moon-selection', selected !== null);

  allBottles().forEach(bottle => {
    bottle.classList.remove('moon-selected', 'moon-target', 'moon-blocked');
    bottle.style.removeProperty('--choice-a');
    bottle.style.removeProperty('--choice-b');
    const badge = bottle.querySelector<HTMLElement>('.moon-choice-badge');
    if (badge) delete badge.dataset.label;
  });

  if (selected === null) return;
  const source = bottleAt(selected);
  const color = source ? colors(source) : null;
  if (!source || !color) {
    selected = null;
    return;
  }

  source.classList.add('moon-selected');
  source.style.setProperty('--choice-a', color.a);
  source.style.setProperty('--choice-b', color.b);
  const sourceBadge = source.querySelector<HTMLElement>('.moon-choice-badge');
  if (sourceBadge) sourceBadge.dataset.label = 'SELECTED';

  allBottles().forEach(target => {
    if (target === source) return;
    target.style.setProperty('--choice-a', color.a);
    target.style.setProperty('--choice-b', color.b);
    const targetBadge = target.querySelector<HTMLElement>('.moon-choice-badge');
    if (legal(source, target)) {
      target.classList.add('moon-target');
      if (targetBadge) targetBadge.dataset.label = liquids(target).length ? 'MATCH' : 'POUR HERE';
    } else {
      target.classList.add('moon-blocked');
    }
  });
}

function paintHud(): void {
  const hud = document.querySelector<HTMLElement>('.moon-flow-hud');
  if (!hud) return;
  hud.classList.toggle('active', combo > 0);
  hud.classList.toggle('hot', combo >= 4);
  const label = hud.querySelector<HTMLElement>('b');
  if (label) label.textContent = combo === 0 ? 'Ready' : combo < 4 ? `Flow ×${combo}` : `Cosmic ×${combo}`;
  [...hud.querySelectorAll<HTMLElement>('i')].forEach((dot, index) => dot.classList.toggle('filled', index < Math.min(combo, 5)));
}

function pulseInvalid(element: HTMLElement): void {
  element.classList.remove('moon-invalid');
  requestAnimationFrame(() => element.classList.add('moon-invalid'));
  window.setTimeout(() => element.classList.remove('moon-invalid'), 430);
}

function pourData(from: HTMLElement, to: HTMLElement): Pour | null {
  const color = colors(from);
  if (!color) return null;
  const count = liquids(to).length;
  const amount = Math.min(runAmount(from), CAPACITY - count);
  if (!amount) return null;
  return {
    from: indexOf(from),
    to: indexOf(to),
    source: from.getBoundingClientRect(),
    target: to.getBoundingClientRect(),
    a: color.a,
    b: color.b,
    amount,
    completes: count + amount === CAPACITY,
    empty: count === 0
  };
}

function createStream(data: Pour): HTMLElement {
  const element = document.createElement('div');
  element.className = 'engine-pour-stream';
  element.style.cssText = `--pour-a:${data.a};--pour-b:${data.b};left:${data.target.left + data.target.width / 2}px;top:${data.target.top - 70}px`;
  for (let index = 0; index < data.amount + 4; index++) {
    const drop = document.createElement('i');
    drop.style.setProperty('--drop-delay', `${index * 55}ms`);
    drop.style.setProperty('--drop-x', `${(index % 2 ? 1 : -1) * (5 + index)}px`);
    element.appendChild(drop);
  }
  document.body.appendChild(element);
  return element;
}

function createImpact(data: Pour): HTMLElement {
  const element = document.createElement('div');
  element.className = 'engine-pour-impact';
  element.style.cssText = `--pour-a:${data.a};--pour-b:${data.b};left:${data.target.left + data.target.width / 2}px;top:${data.target.top + 26}px`;
  element.appendChild(document.createElement('span'));
  for (let index = 0; index < 10; index++) {
    const spark = document.createElement('i');
    spark.style.setProperty('--impact-angle', `${index * 36}deg`);
    element.appendChild(spark);
  }
  document.body.appendChild(element);
  return element;
}

function commitMove(target: number): void {
  const element = bottleAt(target);
  if (!element) return;
  replay = true;
  try {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  } finally {
    replay = false;
  }
}

function reward(data: Pour): void {
  const now = Date.now();
  combo = now - lastPour < COMBO_MS ? Math.min(9, combo + 1) : 1;
  lastPour = now;
  if (resetTimer !== null) window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => {
    combo = 0;
    paintHud();
  }, COMBO_MS);
  paintHud();

  const board = document.querySelector<HTMLElement>('.board');
  if (!board) return;
  const label = document.createElement('div');
  label.className = `moon-combo ${data.completes ? 'perfect' : ''}`;
  label.textContent = data.completes
    ? 'CONSTELLATION COMPLETE!'
    : combo >= 5
      ? `COSMIC FLOW ×${combo}!`
      : combo >= 2
        ? `FLOW ×${combo}`
        : data.empty
          ? 'NICE SETUP'
          : 'COLOR MATCH';
  board.appendChild(label);
  window.setTimeout(() => label.remove(), data.completes ? 1150 : 900);
  if (data.completes) window.setTimeout(() => celebrate(data.to), 70);
}

function celebrate(index: number): void {
  const bottle = bottleAt(index);
  if (!bottle) return;
  bottle.classList.add('moon-complete-pop');
  for (let starIndex = 0; starIndex < 16; starIndex++) {
    const star = document.createElement('span');
    star.className = 'moon-burst-star';
    star.style.setProperty('--angle', `${starIndex * 22.5}deg`);
    star.style.setProperty('--distance', `${56 + (starIndex % 4) * 9}px`);
    bottle.appendChild(star);
    window.setTimeout(() => star.remove(), 980);
  }
  window.setTimeout(() => bottle.classList.remove('moon-complete-pop'), 850);
}

function scheduleActive(id: number, callback: () => void, delay: number): void {
  const timer = window.setTimeout(() => {
    if (activePour?.id === id) callback();
  }, delay);
  if (activePour?.id === id) activePour.timers.push(timer);
}

function finishActivePour(id: number): void {
  const current = activePour;
  if (!current || current.id !== id) return;
  activePour = null;

  current.timers.forEach(timer => window.clearTimeout(timer));
  try { current.animation?.cancel(); } catch { /* animation may already be finished */ }
  current.effects.forEach(effect => effect.remove());
  current.ghost.remove();
  current.source.classList.remove('engine-source-active');
  current.target.classList.remove('engine-target-active');
  locked = false;
  requestAnimationFrame(decorate);
}

function cancelActivePour(): void {
  const current = activePour;
  if (!current) {
    locked = false;
    return;
  }
  finishActivePour(current.id);
}

function commitActivePour(id: number, data: Pour): void {
  const current = activePour;
  if (!current || current.id !== id || current.committed) return;
  current.committed = true;
  commitMove(data.to);
  selected = null;
  reward(data);
}

function animatePour(from: HTMLElement, to: HTMLElement, data: Pour): void {
  cancelActivePour();
  locked = true;
  from.classList.add('engine-source-active');
  to.classList.add('engine-target-active');

  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-bottle');
  ghost.className = 'engine-pour-ghost moon-vial';
  ghost.style.cssText += `;left:${data.source.left}px;top:${data.source.top}px;width:${data.source.width}px;height:${data.source.height}px;--pour-a:${data.a};--pour-b:${data.b}`;
  document.body.appendChild(ghost);

  const id = ++pourSequence;
  activePour = {
    id,
    source: from,
    target: to,
    ghost,
    animation: null,
    timers: [],
    effects: [],
    committed: false
  };

  const sourceX = data.source.left + data.source.width / 2;
  const targetX = data.target.left + data.target.width / 2;
  const direction = targetX >= sourceX ? 1 : -1;
  const deltaX = targetX - sourceX - direction * 38;
  const deltaY = data.target.top - data.source.top - Math.min(76, data.source.height * 0.48);
  const tilt = direction * 67;

  try {
    const animation = ghost.animate([
      { transform: 'translate3d(0,0,0) rotate(0deg)', offset: 0 },
      { transform: 'translate3d(0,-22px,0) rotate(0deg)', offset: 0.14 },
      { transform: `translate3d(${deltaX}px,${deltaY}px,0) rotate(0deg)`, offset: 0.4 },
      { transform: `translate3d(${deltaX}px,${deltaY}px,0) rotate(${tilt}deg)`, offset: 0.52 },
      { transform: `translate3d(${deltaX}px,${deltaY}px,0) rotate(${tilt}deg)`, offset: 0.72 },
      { transform: `translate3d(${deltaX}px,${deltaY}px,0) rotate(0deg)`, offset: 0.82 },
      { transform: 'translate3d(0,-18px,0) rotate(0deg)', offset: 0.94 },
      { transform: 'translate3d(0,0,0) rotate(0deg)', offset: 1 }
    ], {
      duration: POUR_DURATION_MS,
      easing: 'cubic-bezier(.2,.76,.18,1)',
      fill: 'forwards'
    });
    if (activePour?.id === id) activePour.animation = animation;
    void animation.finished.then(() => finishActivePour(id), () => finishActivePour(id));
  } catch {
    commitActivePour(id, data);
    finishActivePour(id);
    return;
  }

  scheduleActive(id, () => {
    const effect = createStream(data);
    if (activePour?.id === id) activePour.effects.push(effect);
  }, 520);
  scheduleActive(id, () => {
    const effect = createImpact(data);
    if (activePour?.id === id) activePour.effects.push(effect);
  }, 735);
  scheduleActive(id, () => commitActivePour(id, data), 820);
  scheduleActive(id, () => finishActivePour(id), POUR_WATCHDOG_MS);
}

function bottleClick(event: Event): void {
  if (replay) return;
  const target = (event.target as Element | null)?.closest<HTMLElement>('[data-bottle]');
  if (!target) return;
  if (locked) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  const nativeSelected = document.querySelector<HTMLElement>('.game-screen .bottle.selected');
  const source = selected === null ? nativeSelected : bottleAt(selected);
  if (!source) {
    if (liquids(target).length) selected = indexOf(target);
    else pulseInvalid(target);
    return;
  }
  if (indexOf(source) === indexOf(target)) {
    selected = null;
    return;
  }
  if (!legal(source, target)) {
    pulseInvalid(target);
    if (liquids(target).length) selected = indexOf(target);
    return;
  }

  const data = pourData(source, target);
  if (!data) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  animatePour(source, target, data);
}

function actionClick(event: Event): void {
  const action = (event.target as Element | null)?.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (!action) return;

  // Controls always win. Cancel any unfinished visual pour, release the lock,
  // and allow the game's original button handler to receive this same click.
  if (locked) cancelActivePour();

  if (['undo', 'restart', 'back', 'next', 'play', 'daily', 'themes', 'stats', 'settings', 'reset-save'].includes(action)) {
    selected = null;
  }
  if (['restart', 'next', 'play', 'daily', 'reset-save'].includes(action)) {
    combo = 0;
    lastPour = 0;
    if (resetTimer !== null) window.clearTimeout(resetTimer);
    resetTimer = null;
    paintHud();
  }
}

const observer = new MutationObserver(decorate);
window.addEventListener('click', actionClick, true);
window.addEventListener('click', bottleClick, true);
window.addEventListener('pagehide', cancelActivePour);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelActivePour();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', decorate);
requestAnimationFrame(decorate);
