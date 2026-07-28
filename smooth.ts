import './moonflow.css';

type PendingPour = {
  source: DOMRect;
  target: DOMRect;
  color1: string;
  color2: string;
  amount: number;
};

let pending: PendingPour | null = null;
let selectedIndex: number | null = null;
let interactionLocked = false;
let combo = 0;
let lastPourAt = 0;

function bottleIndex(el: Element): number {
  return Number((el as HTMLElement).dataset.bottle);
}

function topLiquid(el: Element): HTMLElement | null {
  const liquids = el.querySelectorAll<HTMLElement>('.liquid');
  return liquids.length ? liquids[liquids.length - 1] : null;
}

function sameTopColor(source: Element, target: Element): boolean {
  const sourceLiquid = topLiquid(source);
  const targetLiquid = topLiquid(target);
  if (!sourceLiquid) return false;
  if (!targetLiquid) return true;
  return sourceLiquid.style.getPropertyValue('--c1') === targetLiquid.style.getPropertyValue('--c1');
}

function hasRoom(target: Element): boolean {
  return target.querySelectorAll('.liquid').length < 4;
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

function invalidPulse(el: Element): void {
  el.classList.remove('moon-invalid');
  requestAnimationFrame(() => el.classList.add('moon-invalid'));
  window.setTimeout(() => el.classList.remove('moon-invalid'), 430);
}

function selectionSpark(el: Element): void {
  const spark = document.createElement('span');
  spark.className = 'selection-spark';
  el.appendChild(spark);
  window.setTimeout(() => spark.remove(), 520);
}

function captureBottleClick(event: Event): void {
  const bottle = (event.target as Element | null)?.closest<HTMLElement>('[data-bottle]');
  if (!bottle || interactionLocked) return;

  const index = bottleIndex(bottle);
  const selected = document.querySelector<HTMLElement>('.bottle.selected');

  if (!selected) {
    if (!bottle.querySelector('.liquid')) invalidPulse(bottle);
    else {
      selectedIndex = index;
      selectionSpark(bottle);
    }
    return;
  }

  const sourceIndex = bottleIndex(selected);
  if (sourceIndex === index) {
    selectedIndex = null;
    return;
  }

  if (!sameTopColor(selected, bottle) || !hasRoom(bottle)) {
    invalidPulse(bottle);
    selectedIndex = bottle.querySelector('.liquid') ? index : sourceIndex;
    return;
  }

  const liquid = topLiquid(selected);
  if (!liquid) return;

  const amount = Math.min(runAmount(selected), 4 - bottle.querySelectorAll('.liquid').length);
  pending = {
    source: selected.getBoundingClientRect(),
    target: bottle.getBoundingClientRect(),
    color1: liquid.style.getPropertyValue('--c1') || '#ffffff',
    color2: liquid.style.getPropertyValue('--c2') || liquid.style.getPropertyValue('--c1') || '#ffffff',
    amount
  };
  interactionLocked = true;
  selected.classList.add('moon-pouring');
  bottle.classList.add('moon-receiving');
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
  const bend = Math.max(72, Math.min(130, Math.abs(dx) * 0.42 + 58));

  orb.animate([
    { transform: 'translate(-50%, -50%) scale(.55)', opacity: .15 },
    { transform: `translate(calc(-50% + ${dx * .48}px), calc(-50% + ${dy * .48 - bend}px)) scale(1.18)`, opacity: 1, offset: .54 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.45)`, opacity: .12 }
  ], {
    duration: 610,
    easing: 'cubic-bezier(.18,.78,.2,1)',
    fill: 'forwards'
  });

  for (let i = 0; i < Math.min(5, data.amount + 2); i++) {
    const mote = document.createElement('i');
    mote.style.setProperty('--delay', `${i * 55}ms`);
    mote.style.setProperty('--dx', `${dx}px`);
    mote.style.setProperty('--dy', `${dy}px`);
    mote.style.setProperty('--bend', `${bend}px`);
    orb.appendChild(mote);
  }

  window.setTimeout(() => {
    layer.remove();
    interactionLocked = false;
    selectedIndex = null;
    const now = Date.now();
    combo = now - lastPourAt < 4500 ? Math.min(9, combo + 1) : 1;
    lastPourAt = now;
    if (combo >= 2) showCombo(combo);
    celebrateCompletedBottles();
  }, 640);
}

function showCombo(value: number): void {
  const board = document.querySelector('.board');
  if (!board) return;
  const label = document.createElement('div');
  label.className = 'moon-combo';
  label.textContent = value >= 5 ? `MOON FLOW ×${value}!` : `FLOW ×${value}`;
  board.appendChild(label);
  window.setTimeout(() => label.remove(), 900);
}

function celebrateCompletedBottles(): void {
  document.querySelectorAll<HTMLElement>('.bottle.complete:not([data-celebrated])').forEach(bottle => {
    bottle.dataset.celebrated = 'true';
    for (let i = 0; i < 10; i++) {
      const star = document.createElement('span');
      star.className = 'moon-burst-star';
      star.style.setProperty('--angle', `${i * 36}deg`);
      bottle.appendChild(star);
      window.setTimeout(() => star.remove(), 850);
    }
  });
}

function enhanceBoard(): void {
  document.querySelectorAll<HTMLElement>('.bottle').forEach((bottle, index) => {
    bottle.classList.add('moon-vial');
    bottle.style.setProperty('--vial-order', String(index));
    if (!bottle.querySelector('.vial-aura')) {
      const aura = document.createElement('span');
      aura.className = 'vial-aura';
      bottle.prepend(aura);
    }
  });

  if (selectedIndex !== null) {
    document.querySelector<HTMLElement>(`[data-bottle="${selectedIndex}"]`)?.classList.add('selected');
  }
}

const observer = new MutationObserver(() => {
  enhanceBoard();
  if (pending) requestAnimationFrame(animatePendingPour);
});

window.addEventListener('click', captureBottleClick, true);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhanceBoard);
requestAnimationFrame(enhanceBoard);
