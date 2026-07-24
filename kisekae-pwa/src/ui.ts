import type { Character } from './character';
import type { Stage } from './scene';
import { ANGLES } from './scene';
import type { Slot } from './data/catalog';
import { itemsForSlot, PALETTES } from './data/catalog';

const SLOT_TABS: { slot: Slot; label: string }[] = [
  { slot: 'hair', label: 'かみのけ' },
  { slot: 'outfit', label: 'おようふく' },
  { slot: 'head', label: 'はだ' }, // 色のみ
];

export function setupUi(stage: Stage, character: Character): void {
  setupAngleBar(stage);

  const tabs = document.getElementById('slot-tabs') as HTMLDivElement;
  const itemRow = document.getElementById('item-row') as HTMLDivElement;
  const colorRow = document.getElementById('color-row') as HTMLDivElement;

  let activeSlot: Slot = 'hair';

  function renderTabs(): void {
    tabs.replaceChildren(
      ...SLOT_TABS.map(({ slot, label }) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.classList.toggle('active', slot === activeSlot);
        b.addEventListener('click', () => {
          activeSlot = slot;
          renderTabs();
          renderItems();
          renderColors();
        });
        return b;
      }),
    );
  }

  function renderItems(): void {
    const items = activeSlot === 'head' ? [] : itemsForSlot(activeSlot);
    itemRow.style.display = items.length ? '' : 'none';
    itemRow.replaceChildren(
      ...items.map((item) => {
        const b = document.createElement('button');
        b.className = 'item-btn';
        b.classList.toggle('active', character.coordinate.items[activeSlot] === item.id);

        const img = document.createElement('img');
        img.src = item.thumb;
        img.alt = '';
        img.addEventListener('error', () => {
          img.replaceWith(document.createTextNode(item.emoji ?? '❔'));
        });
        const label = document.createElement('span');
        label.textContent = item.label;
        b.append(img, label);

        b.addEventListener('click', () => {
          void character.equip(activeSlot, item.id).then(renderItems);
        });
        return b;
      }),
    );
  }

  function renderColors(): void {
    const palette =
      activeSlot === 'head' ? PALETTES.skin : (PALETTES[activeSlot] ?? []);
    const current =
      activeSlot === 'head'
        ? character.coordinate.skin
        : character.coordinate.colors[activeSlot];

    colorRow.style.display = palette.length ? '' : 'none';
    colorRow.replaceChildren(
      ...palette.map((hex) => {
        const b = document.createElement('button');
        b.className = 'color-btn';
        b.style.background = hex;
        b.classList.toggle('active', current === hex);
        b.addEventListener('click', () => {
          character.setColor(activeSlot, hex);
          renderColors();
        });
        return b;
      }),
    );
  }

  renderTabs();
  renderItems();
  renderColors();
}

function setupAngleBar(stage: Stage): void {
  const bar = document.getElementById('angle-bar') as HTMLDivElement;
  bar.replaceChildren(
    ...Object.entries(ANGLES).map(([label, theta]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => stage.moveToAzimuth(theta));
      return b;
    }),
  );
}
