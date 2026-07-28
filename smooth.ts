import './moonflow.css';

type PendingPour = {
  source: DOMRect;
  target: DOMRect;
  sourceIndex: number;
  targetIndex: number;
  color1: string;
  color2: string;
  amount: number;
  targetWillComplete: boolean;
  targetWasEmpty: boolean;
};

const CAPACITY = 4;
const COMBO_WINDOW_MS = 6000;

let pending: PendingPour | null = null;
let selectedIndex: number | null = null;
let selectionPulseIndex: number | null = null;
let interactionLocked = false;
let combo = 0;
let lastPourAt = 0;
let comboResetTimer: number | null = null;
let lastBoard: HTMLElement | null = null;

function bottleIndex(el: Element): number {
  return Number((el as HTMLElement).dataset.bottle);
}

function bottles(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.game-screen [data-bottle]')];
}

function bottleAt(index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.game-screen [data-bottle="${index}"]`);
}

function topLiquid(el: Element): HTMLElement | null {
  const liquids = el.querySelectorAll<HTMLElement>('.liquid');
  return liquids.length ? liquids[liquids.length - 1] : null;
}

function liquidColor(el: Element): { color1: string; color2: string } | null {
  const liquid = topLiquid(el);
  if (!liquid) return null;
  const color1 = liquid.style.getPropertyValue('--c1') || '#ffffff';
  const color2 = liquid.style.getPropertyValue('--c2') || color1;
  return { color1, color2 };
}

function sameTopColor(source: Element, target: Element): boolean {
  const sourceColor = liquidColor(source);
  const targetColor = liquidColor(target);
  if (!sourceColor) return false;
  if (!targetColor) return true;
  return sourceColor.color1 === targetColor.color1;
}

function hasRoom(target: Element): boolean {
  return target.querySelectorAll('.liquid').length < CAPACITY;
}

function runAmount(source: Element): number {
  const liquids = [...source.querySelectorAll<HTMLElement>('.liquid')];
  if (!liquids.length) return 0;
  const top = liquids[liquids.length - 1].style.getPropertyValue('--c1');
  let amount = 0;
  for (let i = liquids.length - 1; i >= 0; i--) {
    if (liquids[i].style.getPropertyValue('--c1') !== top) break;
    amount++;
  }
  return amount;
}

function isLegalTarget(source: Element, target: Element): boolean {
  return source !== target && hasRoom(target) && sameTopColor(source, target);
}

function invalidPulse(el: Element): void {
  el.classList.remove('moon-invalid');
  requestAnimationFrame(() => el.classList.add('moon-invalid'));
  window.setTimeout(() => el.classList.remove('moon-invalid'), 430);
}

function ensureBottleDecor(bottle: HTMLElement, index: number): void {
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
}

function ensureFlowHud(board: HTMLElement): void {
  if (board.querySelector('.moon-flow-hud')) return;
  const hud = document.createElement('div');
  hud.className = 'moon-flow-hud';
  hud.innerHTML = '<small>MOON FLOW</small><b>Ready</b><span><i></i><i></i><i></i><i></i><i></i></span>';
  board.appendChild(hud);
}

function updateFlowHud(): void {
  const hud = document.querySelector<HTMLElement>('.moon-flow-hud');
  if (!hud) return;
  const label = hud.querySelector<HTMLElement>('b');
  const dots = [...hud.querySelectorAll<HTMLElement>('i')];

  hud.classList.toggle('active', combo > 0);
  hud.classList.toggle('hot', combo >= 4);
  if (label) {
    const nextLabel = combo <= 0 ? 'Ready' : combo === 1 ? 'Flow started' : combo < 4 ? `Flow ×${combo}` : `Cosmic ×${combo}`;
    if (label.textContent !== nextLabel) label.textContent = nextLabel;
  }
  dots.forEach((dot, index) => dot.classList.toggle('filled', index < Math.min(5, combo)));
}

function clearSelectionClasses(): void {
  const board = document.querySelector<HTMLElement>('.game-screen .board');
  board?.classList.remove('has-moon-selection');

  bottles().forEach(bottle => {
    bottle.classList.remove('moon-selected', 'moon-target', 'moon-blocked', 'moon-select-pop');
    bottle.removeAttribute('aria-pressed');
    bottle.style.removeProperty('--choice-a');
    bottle.style.removeProperty('--choice-b');
    const badge = bottle.querySelector<HTMLElement>('.moon-choice-badge');
    if (badge) delete badge.dataset.label;
    bottle.querySelectorAll('.moon-top-liquid').forEach(el => el.classList.remove('moon-top-liquid'));
  });
}

function applySelectionState(): void {
  clearSelectionClasses();
  if (selectedIndex === null) return;

  const source = bottleAt(selectedIndex);
  const board = document.querySelector<HTMLElement>('.game-screen .board');
  const colors = source ? liquidColor(source) : null;
  if (!source || !colors) {
    selectedIndex = null;
    return;
  }

  board?.classList.add('has-moon-selection');
  source.classList.add('moon-selected');
  source.setAttribute('aria-pressed', 'true');
  source.style.setProperty('--choice-a', colors.color1);
  source.style.setProperty('--choice-b', colors.color2);
  const sourceBadge = source.querySelector<HTMLElement>('.moon-choice-badge');
  if (sourceBadge) sourceBadge.dataset.label = 'SELECTED';
  topLiquid(source)?.classList.add('moon-top-liquid');

  bottles().forEach(target => {
    if (target === source) return;
    target.style.setProperty('--choice-a', colors.color1);
    target.style.setProperty('--choice-b', colors.color2);
    const badge = target.querySelector<HTMLElement>('.moon-choice-badge');
    if (isLegalTarget(source, target)) {
      target.classList.add('moon-target');
      if (badge) badge.dataset.label = target.querySelector('.liquid') ? 'MATCH' : 'POUR HERE';
    } else {
      target.classList.add('moon-blocked');
    }
  });

  if (selectionPulseIndex === selectedIndex) {
    source.classList.add('moon-select-pop');
    selectionPulseIndex = null;
    window.setTimeout(() => source.classList.remove('moon-select-pop'), 520);
  }
}

function captureBottleClick(event: Event): void {
  const bottle = (event.target as Element | null)?.closest<HTMLElement>('[data-bottle]');
  if (!bottle || interactionLocked) return;

  const index = bottleIndex(bottle);
  const source = selectedIndex === null ? null : bottleAt(selectedIndex);

  if (!source) {
    if (!bottle.querySelector('.liquid')) {
      invalidPulse(bottle);
      return;
    }
    selectedIndex = index;
    selectionPulseIndex = index;
    applySelectionState();
    return;
  }

  if (selectedIndex === index) {
    selectedIndex = null;
    applySelectionState();
    return;
  }

  if (!isLegalTarget(source, bottle)) {
    invalidPulse(bottle);
    if (bottle.querySelector('.liquid')) {
      selectedIndex = index;
      selectionPulseIndex = index;
      applySelectionState();
    }
    return;
  }

  const colors = liquidColor(source);
  if (!colors) return;

  const targetCount = bottle.querySelectorAll('.liquid').length;
  const amount = Math.min(runAmount(source), CAPACITY - targetCount);
  pending = {
    source: source.getBoundingClientRect(),
    target: bottle.getBoundingClientRect(),
    sourceIndex: bottleIndex(source),
    targetIndex: index,
    color1: colors.color1,
    color2: colors.color2,
    amount,
    targetWillComplete: targetCount + amount === CAPACITY,
    targetWasEmpty: targetCount === 0
  };
  interactionLocked = true;
  source.classList.add('moon-pouring');
  bottle.classList.add('moon-receiving');
  document.querySelector('.game-screen .board')?.classList.add('pour-in-progress');
}

function captureActionClick(event: Event): void {
  const action = (event.target as Element | null)?.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (!action) return;
  if (interactionLocked) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (['undo', 'restart', 'back', 'next', 'play', 'daily'].includes(action)) {
    selectedIndex = null;
    selectionPulseIndex = null;
    pending = null;
    interactionLocked = false;
    if (action === 'restart' || action === 'play' || action === 'daily' || action === 'next') {
      combo = 0;
      lastPourAt = 0;
      if (comboResetTimer !== null) window.clearTimeout(comboResetTimer);
      comboResetTimer = null;
    }
  }
}

function createLandingBurst(data: PendingPour): void {
  const layer = document.createElement('div');
  layer.className = 'moon-impact-layer';
  layer.style.left = `${data.target.left + data.target.width / 2}px`;
  layer.style.top = `${data.target.top + 30}px`;
  layer.style.setProperty('--flow-a', data.color1);
  layer.style.setProperty('--flow-b', data.color2);

  const ring = document.createElement('span');
  ring.className = 'moon-impact-ring';
  layer.appendChild(ring);

  for (let i = 0; i < 9; i++) {
    const drop = document.createElement('i');
    drop.style.setProperty('--angle', `${i * 40}deg`);
    drop.style.setProperty('--distance', `${26 + (i % 3) * 10}px`);
    layer.appendChild(drop);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 760);
}

function animatePendingPour(): void {
  if (!pending) return;
  const data = pending;
  pending = null;

  const layer = document.createElement('div');
  layer.className = 'moon-flow-layer';
  const orb = document.createElement('div');
  orb.className = 'moon-flow-orb';
  orb.style.setProperty('--flow-a', data.color1);
  orb.style.setProperty('--flow-b', data.color2);
  orb.style.left = `${data.source.left + data.source.width / 2}px`;
  orb.style.top = `${data.source.top + 28}px`;
  layer.appendChild(orb);
  document.body.appendChild(layer);

  const dx = data.target.left + data.target.width / 2 - (data.source.left + data.source.width / 2);
  const dy = data.target.top - data.source.top;
  const bend = Math.max(76, Math.min(142, Math.abs(dx) * 0.45 + 62));

  orb.animate([
    { transform: 'translate(-50%, -50%) scale(.48)', opacity: .15 },
    { transform: `translate(calc(-50% + ${dx * .46}px), calc(-50% + ${dy * .46 - bend}px)) scale(1.25)`, opacity: 1, offset: .52 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.38)`, opacity: .08 }
  ], {
    duration: 640,
    easing: 'cubic-bezier(.16,.82,.18,1)',
    fill: 'forwards'
  });

  for (let i = 0; i < Math.min(7, data.amount + 4); i++) {
    const mote = document.createElement('i');
    mote.style.setProperty('--delay', `${i * 48}ms`);
    mote.style.setProperty('--dx', `${dx}px`);
    mote.style.setProperty('--dy', `${dy}px`);
    mote.style.setProperty('--bend', `${bend}px`);
    orb.appendChild(mote);
  }

  window.setTimeout(() => createLandingBurst(data), 470);

  window.setTimeout(() => {
    layer.remove();
    interactionLocked = false;
    selectedIndex = null;
    document.querySelector('.game-screen .board')?.classList.remove('pour-in-progress');
    applySelectionState();

    const now = Date.now();
    combo = now - lastPourAt < COMBO_WINDOW_MS ? Math.min(9, combo + 1) : 1;
    lastPourAt = now;
    if (comboResetTimer !== null) window.clearTimeout(comboResetTimer);
    comboResetTimer = window.setTimeout(() => {
      combo = 0;
      comboResetTimer = null;
      updateFlowHud();
    }, COMBO_WINDOW_MS + 150);
    updateFlowHud();
    showCombo(combo, data.targetWillComplete, data.targetWasEmpty);
    if (data.targetWillComplete) celebrateBottle(data.targetIndex);
  }, 680);
}

function showCombo(value: number, completed: boolean, targetWasEmpty: boolean): void {
  const board = document.querySelector<HTMLElement>('.board');
  if (!board) return;
  const label = document.createElement('div');
  label.className = `moon-combo ${completed ? 'perfect' : ''}`;
  if (completed) label.textContent = 'CONSTELLATION COMPLETE!';
  else if (value >= 5) label.textContent = `COSMIC FLOW ×${value}!`;
  else if (value >= 2) label.textContent = `FLOW ×${value}`;
  else label.textContent = targetWasEmpty ? 'NICE SETUP' : 'COLOR MATCH';
  board.appendChild(label);
  board.classList.toggle('flow-hot', value >= 4);
  window.setTimeout(() => {
    label.remove();
    board.classList.remove('flow-hot');
  }, completed ? 1150 : 900);
}

function celebrateBottle(index: number): void {
  const bottle = bottleAt(index);
  if (!bottle) return;
  bottle.classList.add('moon-complete-pop');

  for (let i = 0; i < 16; i++) {
    const star = document.createElement('span');
    star.className = 'moon-burst-star';
    star.style.setProperty('--angle', `${i * 22.5}deg`);
    star.style.setProperty('--distance', `${56 + (i % 4) * 9}px`);
    bottle.appendChild(star);
    window.setTimeout(() => star.remove(), 980);
  }
  window.setTimeout(() => bottle.classList.remove('moon-complete-pop'), 850);
}

function syncSelectionFromGameDom(): void {
  if (interactionLocked) return;
  const nativeSelected = document.querySelector<HTMLElement>('.game-screen .bottle.selected');
  selectedIndex = nativeSelected ? bottleIndex(nativeSelected) : null;
}

function enhanceBoard(): void {
  const board = document.querySelector<HTMLElement>('.game-screen .board');
  if (!board) {
    lastBoard = null;
    return;
  }

  if (lastBoard !== board) {
    lastBoard = board;
    board.classList.add('moon-board-ready');
  }

  bottles().forEach(ensureBottleDecor);
  ensureFlowHud(board);
  syncSelectionFromGameDom();
  applySelectionState();
  updateFlowHud();
}

const observer = new MutationObserver(() => {
  enhanceBoard();
  if (pending) requestAnimationFrame(animatePendingPour);
});

window.addEventListener('click', captureActionClick, true);
window.addEventListener('click', captureBottleClick, true);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhanceBoard);
requestAnimationFrame(enhanceBoard);
