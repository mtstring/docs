import type { Character } from './character';
import type { Stage } from './scene';
import { ANGLES } from './scene';
import type { ColorTarget, FacePart, Slot } from './data/catalog';
import {
  BACKGROUNDS,
  DEFAULT_COORDINATE,
  FACE_VARIANTS,
  PALETTES,
  itemsForSlot,
} from './data/catalog';
import {
  SAVE_SLOT_COUNT,
  loadSavedOutfits,
  writeSavedOutfits,
  type SavedOutfit,
} from './storage';

type Row =
  | { kind: 'items'; slot: Slot; label?: string }
  | { kind: 'face'; part: FacePart; label: string }
  | { kind: 'colors'; target: ColorTarget; label?: string }
  | { kind: 'background'; label?: string };

interface TabDef {
  key: string;
  icon: string;
  label: string;
  rows: Row[];
}

/** タブは絵文字+ひらがな。文字を読めなくてもアイコンで選べるようにする */
const TABS: TabDef[] = [
  {
    key: 'outfit',
    icon: '👗',
    label: 'ふく',
    rows: [
      { kind: 'items', slot: 'outfit' },
      { kind: 'colors', target: 'outfit' },
    ],
  },
  {
    key: 'hair',
    icon: '💇',
    label: 'かみ',
    rows: [
      { kind: 'items', slot: 'hair' },
      { kind: 'colors', target: 'hair' },
    ],
  },
  {
    key: 'eye',
    icon: '👀',
    label: 'め',
    rows: [
      { kind: 'face', part: 'eye', label: 'かたち' },
      { kind: 'colors', target: 'eye', label: 'いろ' },
    ],
  },
  {
    key: 'face',
    icon: '😀',
    label: 'かお',
    rows: [
      { kind: 'face', part: 'brow', label: 'まゆ' },
      { kind: 'face', part: 'mouth', label: 'くち' },
    ],
  },
  {
    key: 'skin',
    icon: '✋',
    label: 'はだ',
    rows: [{ kind: 'colors', target: 'skin' }],
  },
  {
    key: 'bg',
    icon: '🌈',
    label: 'はいけい',
    rows: [{ kind: 'background' }],
  },
];

export function setupUi(stage: Stage, character: Character): void {
  const tabsEl = document.getElementById('slot-tabs') as HTMLDivElement;
  const contentEl = document.getElementById('content-rows') as HTMLDivElement;
  const toolEl = document.getElementById('tool-row') as HTMLDivElement;

  let activeTab = TABS[0]!;
  let savedOutfits = loadSavedOutfits();

  const confirmAsk = setupConfirm();
  setupAngleBar(stage);

  // ---- タブ ----
  function renderTabs(): void {
    tabsEl.replaceChildren(
      ...TABS.map((tab) => {
        const b = document.createElement('button');
        b.dataset.tab = tab.key;
        b.classList.toggle('active', tab.key === activeTab.key);
        b.append(el('span', 'ico', tab.icon), el('span', '', tab.label));
        b.addEventListener('click', () => {
          activeTab = tab;
          renderTabs();
          renderContent();
        });
        return b;
      }),
    );
  }

  // ---- タブの中身 ----
  function renderContent(): void {
    contentEl.replaceChildren(...activeTab.rows.map(renderRow));
  }

  function renderRow(row: Row): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    if (row.label) wrap.append(el('span', 'row-label', row.label));

    switch (row.kind) {
      case 'items':
        wrap.append(...itemButtons(row.slot));
        break;
      case 'face':
        wrap.append(...faceButtons(row.part));
        break;
      case 'colors':
        wrap.append(...colorButtons(row.target));
        break;
      case 'background':
        wrap.append(...backgroundButtons());
        break;
    }
    return wrap;
  }

  function itemButtons(slot: Slot): HTMLElement[] {
    return itemsForSlot(slot).map((item) => {
      const b = itemButton(item.label, item.emoji ?? '❔', item.thumb);
      b.classList.toggle('active', character.coordinate.items[slot] === item.id);
      b.addEventListener('click', () => {
        void character.equip(slot, item.id).then(renderContent);
      });
      return b;
    });
  }

  function faceButtons(part: FacePart): HTMLElement[] {
    return FACE_VARIANTS[part].map((v) => {
      const b = itemButton(v.label, v.emoji);
      b.classList.toggle('active', character.coordinate.face[part] === v.id);
      b.addEventListener('click', () => {
        character.setFace(part, v.id);
        renderContent();
      });
      return b;
    });
  }

  function colorButtons(target: ColorTarget): HTMLElement[] {
    const current =
      target === 'skin'
        ? character.coordinate.skin
        : target === 'eye'
          ? character.coordinate.eyeColor
          : character.coordinate.colors[target];

    return PALETTES[target].map((hex) => {
      const b = document.createElement('button');
      b.className = 'color-btn';
      b.style.background = hex;
      b.setAttribute('aria-label', hex);
      b.classList.toggle('active', current === hex);
      b.addEventListener('click', () => {
        character.setColor(target, hex);
        renderContent();
      });
      return b;
    });
  }

  function backgroundButtons(): HTMLElement[] {
    return BACKGROUNDS.map(({ hex, label }) => {
      const b = document.createElement('button');
      b.className = 'color-btn';
      b.style.background = hex;
      b.setAttribute('aria-label', label);
      b.classList.toggle('active', character.coordinate.background === hex);
      b.addEventListener('click', () => {
        character.coordinate.background = hex;
        stage.setBackground(hex);
        character.onChange?.();
        renderContent();
      });
      return b;
    });
  }

  // ---- 道具 ----
  function renderTools(): void {
    const photo = toolButton('📷', 'しゃしん');
    photo.addEventListener('click', () => downloadPng(stage.capture()));

    const reset = toolButton('🧹', 'さいしょから');
    reset.addEventListener('click', () => {
      // 誤操作で全部消えないように必ず確認を挟む
      confirmAsk('さいしょから やりなおす?', () => {
        void character.apply({ ...structuredClone(DEFAULT_COORDINATE) }).then(() => {
          stage.setBackground(character.coordinate.background);
          renderContent();
        });
      });
    });

    const slots = savedOutfits.map((saved, i) => {
      const b = document.createElement('button');
      b.className = `save-slot${saved ? ' filled' : ''}`;
      b.dataset.saveSlot = String(i);
      b.setAttribute('aria-label', saved ? `ほぞん ${i + 1} をよびだす` : `ここにほぞん ${i + 1}`);

      if (saved?.thumb) {
        const img = document.createElement('img');
        img.src = saved.thumb;
        img.alt = '';
        b.append(img);
      } else {
        b.textContent = saved ? '👗' : '＋';
      }

      b.addEventListener('click', () => {
        if (!saved) {
          storeOutfit(i);
          return;
        }
        // 保存済みの枠: 呼び出すか、上書きするか
        confirmAsk('この おきにいりに きせかえる?', () => {
          void character.apply(saved.coord).then(() => {
            stage.setBackground(character.coordinate.background);
            renderContent();
          });
        });
      });

      // 長押しで上書き保存(誤操作を避けるため即時には上書きしない)
      let timer: ReturnType<typeof setTimeout> | undefined;
      const start = () => {
        timer = setTimeout(() => confirmAsk('ここに ほぞんする?', () => storeOutfit(i)), 700);
      };
      const cancel = () => clearTimeout(timer);
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', cancel);
      b.addEventListener('pointerleave', cancel);
      b.addEventListener('pointercancel', cancel);

      return b;
    });

    toolEl.replaceChildren(photo, reset, el('span', 'row-label', 'おきにいり'), ...slots);
  }

  function storeOutfit(index: number): void {
    const next: (SavedOutfit | null)[] = [...savedOutfits];
    next[index] = {
      coord: structuredClone(character.coordinate),
      thumb: stage.capture(96),
    };
    savedOutfits = next.slice(0, SAVE_SLOT_COUNT);
    writeSavedOutfits(savedOutfits);
    renderTools();
  }

  renderTabs();
  renderContent();
  renderTools();

  // 検証・デバッグから UI を再描画させるためのフック
  (window as any).__KISEKAE_UI__ = {
    refresh: () => {
      renderContent();
      renderTools();
    },
    savedOutfits: () => savedOutfits,
  };
}

// ---- 小物 ----

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function itemButton(label: string, emoji: string, thumb?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'item-btn';

  const ico = el('span', 'ico', emoji);
  if (thumb) {
    const img = document.createElement('img');
    img.src = thumb;
    img.alt = '';
    // サムネが未生成でも絵文字で必ず選べるようにしておく
    img.addEventListener('error', () => img.replaceWith(ico));
    b.append(img);
  } else {
    b.append(ico);
  }
  b.append(el('span', '', label));
  return b;
}

function toolButton(icon: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tool-btn';
  b.append(el('span', 'ico', icon), el('span', '', label));
  return b;
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

  // 自分でぐりぐり回したら方位ボタンの選択表示は外す
  stage.controls.addEventListener('start', () =>
    buttons.forEach((b) => b.classList.remove('active')),
  );
}

function setupConfirm(): (message: string, onYes: () => void) => void {
  const root = document.getElementById('confirm') as HTMLDivElement;
  const msg = document.getElementById('confirm-msg') as HTMLDivElement;
  const yes = document.getElementById('confirm-yes') as HTMLButtonElement;
  const no = document.getElementById('confirm-no') as HTMLButtonElement;

  let handler: (() => void) | null = null;
  const close = () => {
    root.classList.remove('open');
    handler = null;
  };

  no.addEventListener('click', close);
  yes.addEventListener('click', () => {
    const fn = handler;
    close();
    fn?.();
  });
  root.addEventListener('click', (e) => e.target === root && close());

  return (message, onYes) => {
    msg.textContent = message;
    handler = onYes;
    root.classList.add('open');
  };
}

function downloadPng(dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `kisekae-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.png`;
  a.click();
}
