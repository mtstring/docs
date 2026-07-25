export type Slot = 'head' | 'hair' | 'outfit' | 'shoes' | 'accessory';

/** 色を適用する対象。スロット色のほか、肌と目は独立して持つ */
export type ColorTarget = Slot | 'skin' | 'eye';

export interface Item {
  id: string;
  slot: Slot;
  label: string; // 子どもに見せる名前(ひらがな)
  file: string; // /models/...
  nodeName?: string; // GLB内の対象メッシュ名
  tintable: boolean; // 実行時に色を変えられるか
  /**
   * 色を塗るマテリアル名の前方一致リスト。
   * 省略すると全マテリアルが対象になり、服の色が手や靴まで塗ってしまうため、
   * 実アセット導入時もここは必ず指定すること。
   */
  tintMaterials?: string[];
  thumb: string; // /thumbs/....webp(無ければ emoji にフォールバック)
  emoji?: string;
}

/** 顔パーツ(別メッシュの表示切替で組み合わせる。PLAN §4.5 A案) */
export type FacePart = 'eye' | 'brow' | 'mouth';

export interface FaceVariant {
  id: string; // GLB内のメッシュ名 `Eye_01.L` の "01" にあたる
  label: string;
  emoji: string;
}

/** メッシュ名の接頭辞。`${prefix}_${variant.id}` で始まるメッシュだけを表示する */
export const FACE_MESH_PREFIX: Record<FacePart, string> = {
  eye: 'Eye',
  brow: 'Brow',
  mouth: 'Mouth',
};

export const FACE_VARIANTS: Record<FacePart, FaceVariant[]> = {
  eye: [
    { id: '01', label: 'ふつう', emoji: '👁️' },
    { id: '02', label: 'にこにこ', emoji: '😊' },
    { id: '03', label: 'きらきら', emoji: '✨' },
  ],
  brow: [
    { id: '01', label: 'ふつう', emoji: '😐' },
    { id: '02', label: 'きりっ', emoji: '😠' },
    { id: '03', label: 'やさしい', emoji: '🙂' },
  ],
  mouth: [
    { id: '01', label: 'にこ', emoji: '😃' },
    { id: '02', label: 'あーん', emoji: '😮' },
    { id: '03', label: 'むー', emoji: '😑' },
  ],
};

export const CATALOG: Item[] = [
  {
    id: 'head-basic',
    slot: 'head',
    label: 'あたま',
    file: '/models/sample/base_head.glb',
    tintable: true,
    tintMaterials: ['Skin'], // 目・眉・口は別マテリアルなので塗らない
    thumb: '/thumbs/head-basic.webp',
    emoji: '🙂',
  },
  {
    id: 'hair-short',
    slot: 'hair',
    label: 'しょーと',
    file: '/models/sample/hair_short.glb',
    tintable: true,
    tintMaterials: ['Hair'],
    thumb: '/thumbs/hair-short.webp',
    emoji: '💇',
  },
  {
    id: 'hair-long',
    slot: 'hair',
    label: 'ろんぐ',
    file: '/models/sample/hair_long.glb',
    tintable: true,
    tintMaterials: ['Hair'],
    thumb: '/thumbs/hair-long.webp',
    emoji: '👱',
  },
  {
    id: 'outfit-dress',
    slot: 'outfit',
    label: 'どれす',
    file: '/models/sample/outfit_dress.glb',
    tintable: true,
    tintMaterials: ['Cloth'], // 手(Skin)・靴(Shoe)は塗らない
    thumb: '/thumbs/outfit-dress.webp',
    emoji: '👗',
  },
  {
    id: 'outfit-knight',
    slot: 'outfit',
    label: 'きし',
    file: '/models/sample/outfit_knight.glb',
    tintable: true,
    tintMaterials: ['Cloth'],
    thumb: '/thumbs/outfit-knight.webp',
    emoji: '🛡️',
  },
];

export interface Coordinate {
  items: Partial<Record<Slot, string>>; // slot -> item.id
  colors: Partial<Record<Slot, string>>; // slot -> hex
  skin: string;
  eyeColor: string;
  face: Record<FacePart, string>; // part -> variant.id
  background: string;
  savedAt: number;
}

/** 眉は髪色に、口は固定色に追従させる(子どもに選ばせる項目を増やしすぎない) */
export const MOUTH_COLOR = '#c9615f';

export const DEFAULT_COORDINATE: Coordinate = {
  items: { head: 'head-basic', hair: 'hair-short', outfit: 'outfit-dress' },
  colors: { hair: '#8d5a2b', outfit: '#e991b7' },
  skin: '#ffd9b8',
  eyeColor: '#3b2f2a',
  face: { eye: '01', brow: '01', mouth: '01' },
  background: '#fdf6f9',
  savedAt: 0,
};

export function itemById(id: string): Item | undefined {
  return CATALOG.find((i) => i.id === id);
}

export function itemsForSlot(slot: Slot): Item[] {
  return CATALOG.filter((i) => i.slot === slot);
}

export const PALETTES: Record<ColorTarget, string[]> = {
  hair: ['#8d5a2b', '#2b2b2b', '#f3d36b', '#d96a3b', '#b04a8f', '#5a7fd6', '#e8e8e8'],
  outfit: ['#e991b7', '#5a7fd6', '#7fc97f', '#f3d36b', '#b04a8f', '#e8e8e8', '#2b2b2b'],
  skin: ['#ffd9b8', '#f0b98d', '#c98a5a', '#8d5a3b', '#ffe6d1'],
  eye: ['#3b2f2a', '#5a7fd6', '#4f9e5f', '#8d5a2b', '#8f5ab0', '#c94f4f'],
  head: [],
  shoes: [],
  accessory: [],
};

export interface VrmCharacterDef {
  id: string;
  label: string; // 子どもに見せる名前(ひらがな)
  file: string; // /models/vrm/....vrm
}

/**
 * VRoid Studio で作った VRM を置いたら、ここに追加する。
 *
 * **1件でも入っていれば VRM モードで起動する**(サンプルのモジュラーGLBは使わない)。
 * 空のあいだは従来のサンプルキャラで動く。
 *
 * VRoid では「同じキャラの服違い」を複数書き出しておくと、
 * そのまま着せ替えのバリエーションになる。手順は docs/VROID.md を参照。
 */
export const VRM_CHARACTERS: VrmCharacterDef[] = [];

export const BACKGROUNDS: { hex: string; label: string }[] = [
  { hex: '#fdf6f9', label: 'ぴんく' },
  { hex: '#eaf4ff', label: 'そら' },
  { hex: '#eafaea', label: 'くさ' },
  { hex: '#fff6e0', label: 'ひなた' },
  { hex: '#f0eaff', label: 'ゆめ' },
  { hex: '#2b2f3a', label: 'よる' },
];
