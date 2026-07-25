import type { Stage } from './scene';
import { ANGLES } from './scene';
import type { VrmCharacter } from './vrmCharacter';
import { BACKGROUNDS, type VrmCharacterDef } from './data/catalog';

/**
 * VRM モードの UI(暫定)。
 *
 * いまは「キャラ(=服を着た状態のVRM)を選ぶ」「はいけい」「しゃしん」だけ。
 * 髪だけ・服だけの差し替えは、実物のメッシュ構成を確認してから足す。
 * そのため既存のモジュラーモードUI(ui.ts)とは分けてある。
 */
export function setupVrmUi(
  stage: Stage,
  character: VrmCharacter,
  onPick: (def: VrmCharacterDef) => Promise<void>,
  vrms: VrmCharacterDef[],
): void {
  setupAngleBar(stage);

  const tabsEl = document.getElementById('slot-tabs') as HTMLDivElement;
  const contentEl = document.getElementById('content-rows') as HTMLDivElement;
  const toolEl = document.getElementById('tool-row') as HTMLDivElement;

  const TABS = [
    { key: 'chara', icon: '🧒', label: 'キャラ' },
    { key: 'bg', icon: '🌈', label: 'はいけい' },
  ];
  let active = TABS[0]!.key;

  function renderTabs(): void {
    tabsEl.replaceChildren(
      ...TABS.map((tab) => {
        const b = document.createElement('button');
        b.dataset.tab = tab.key;
        b.classList.toggle('active', tab.key === active);
        b.append(el('span', 'ico', tab.icon), el('span', '', tab.label));
        b.addEventListener('click', () => {
          active = tab.key;
          renderTabs();
          renderContent();
        });
        return b;
      }),
    );
  }

  function renderContent(): void {
    const row = document.createElement('div');
    row.className = 'row';

    if (active === 'chara') {
      row.append(
        ...vrms.map((def) => {
          const b = document.createElement('button');
          b.className = 'item-btn';
          b.dataset.vrm = def.id;
          b.classList.toggle('active', character.id === def.id);
          b.append(el('span', 'ico', '🧒'), el('span', '', def.label));
          b.addEventListener('click', () => void onPick(def).then(renderContent));
          return b;
        }),
      );
    } else {
      row.append(
        ...BACKGROUNDS.map(({ hex, label }) => {
          const b = document.createElement('button');
          b.className = 'color-btn';
          b.style.background = hex;
          b.setAttribute('aria-label', label);
          b.addEventListener('click', () => stage.setBackground(hex));
          return b;
        }),
      );
    }
    contentEl.replaceChildren(row);
  }

  function renderTools(): void {
    const photo = document.createElement('button');
    photo.className = 'tool-btn';
    photo.append(el('span', 'ico', '📷'), el('span', '', 'しゃしん'));
    photo.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = stage.capture();
      a.download = 'kisekae.png';
      a.click();
    });
    toolEl.replaceChildren(photo);
  }

  renderTabs();
  renderContent();
  renderTools();
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setupAngleBar(stage: Stage): void {
  const bar = document.getElementById('angle-bar') as HTMLDivElement;
  const buttons = Object.entries(ANGLES).map(([label, theta]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.angle = label;
    b.addEventListener('click', () => {
      stage.moveToAzimuth(theta);
      buttons.forEach((x) => x.classList.toggle('active', x === b));
    });
    return b;
  });
  bar.replaceChildren(...buttons);
  buttons[0]?.classList.add('active');
  stage.controls.addEventListener('start', () =>
    buttons.forEach((b) => b.classList.remove('active')),
  );
}
