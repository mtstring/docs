export type Slot = 'head' | 'hair' | 'outfit' | 'shoes' | 'accessory';

export interface Item {
  id: string;
  slot: Slot;
  label: string; // 子どもに見せる名前(ひらがな)
  file: string; // /models/...
  nodeName?: string; // GLB内の対象メッシュ名(省略時は全SkinnedMesh)
  tintable: boolean; // 実行時に色を変えられるか
  thumb: string; // /thumbs/....webp(無ければ絵文字にフォールバック)
  emoji?: string; // サムネ画像が無いときの代替表示
}

/**
 * ベースキャラ(頭・目・眉+スケルトン)。スロット'head'は常に1つ装着。
 *
 * いまは scripts/make-sample-assets.mjs が生成するサンプル素材を指している。
 * Quaternius の実アセット(README参照)を public/models/ に置いたら
 * ここの file を差し替えるだけでよい。
 */
export const CATALOG: Item[] = [
  {
    id: 'head-basic',
    slot: 'head',
    label: 'あたま',
    file: '/models/sample/base_head.glb',
    tintable: true, // 肌色
    thumb: '/thumbs/head-basic.webp',
    emoji: '🙂',
  },
  {
    id: 'hair-short',
    slot: 'hair',
    label: 'しょーと',
    file: '/models/sample/hair_short.glb',
    tintable: true,
    thumb: '/thumbs/hair-short.webp',
    emoji: '💇',
  },
  {
    id: 'hair-long',
    slot: 'hair',
    label: 'ろんぐ',
    file: '/models/sample/hair_long.glb',
    tintable: true,
    thumb: '/thumbs/hair-long.webp',
    emoji: '👱',
  },
  {
    id: 'outfit-dress',
    slot: 'outfit',
    label: 'どれす',
    file: '/models/sample/outfit_dress.glb',
    tintable: true,
    thumb: '/thumbs/outfit-dress.webp',
    emoji: '👗',
  },
  {
    id: 'outfit-knight',
    slot: 'outfit',
    label: 'きし',
    file: '/models/sample/outfit_knight.glb',
    tintable: true,
    thumb: '/thumbs/outfit-knight.webp',
    emoji: '🛡️',
  },
];

export interface Coordinate {
  items: Partial<Record<Slot, string>>; // slot -> item.id
  colors: Partial<Record<Slot, string>>; // slot -> hex
  skin: string;
  savedAt: number;
}

export const DEFAULT_COORDINATE: Coordinate = {
  items: { head: 'head-basic', hair: 'hair-short', outfit: 'outfit-dress' },
  colors: { hair: '#8d5a2b', outfit: '#e991b7' },
  skin: '#ffd9b8',
  savedAt: 0,
};

export function itemById(id: string): Item | undefined {
  return CATALOG.find((i) => i.id === id);
}

export function itemsForSlot(slot: Slot): Item[] {
  return CATALOG.filter((i) => i.slot === slot);
}

/** 色パレット(スロットごと) */
export const PALETTES: Partial<Record<Slot, string[]>> & { skin: string[] } = {
  hair: ['#8d5a2b', '#2b2b2b', '#f3d36b', '#d96a3b', '#b04a8f', '#5a7fd6', '#e8e8e8'],
  outfit: ['#e991b7', '#5a7fd6', '#7fc97f', '#f3d36b', '#b04a8f', '#e8e8e8', '#2b2b2b'],
  skin: ['#ffd9b8', '#f0b98d', '#c98a5a', '#8d5a3b', '#ffe6d1'],
};
