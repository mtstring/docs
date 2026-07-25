import type { Coordinate } from './data/catalog';
import { DEFAULT_COORDINATE } from './data/catalog';

const KEY = 'kisekae.coordinate.v1';
const SLOTS_KEY = 'kisekae.saved.v1';

/** 保存できるコーデの枠数。子どもが迷わない程度に絞る */
export const SAVE_SLOT_COUNT = 3;

export interface SavedOutfit {
  coord: Coordinate;
  thumb: string; // dataURL(小さいPNG)
}

function normalize(parsed: Partial<Coordinate> | null): Coordinate {
  const base = structuredClone(DEFAULT_COORDINATE);
  if (!parsed || typeof parsed !== 'object' || !parsed.items) return base;
  return {
    ...base,
    ...parsed,
    items: { ...base.items, ...parsed.items },
    colors: { ...base.colors, ...parsed.colors },
    face: { ...base.face, ...parsed.face },
  };
}

export function saveCoordinate(coord: Coordinate): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...coord, savedAt: Date.now() }));
  } catch {
    // プライベートモード等で失敗しても着せ替え自体は続行できる
  }
}

export function loadCoordinate(): Coordinate {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? (JSON.parse(raw) as Coordinate) : null);
  } catch {
    return structuredClone(DEFAULT_COORDINATE);
  }
}

export function loadSavedOutfits(): (SavedOutfit | null)[] {
  const empty = Array.from({ length: SAVE_SLOT_COUNT }, () => null);
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as (SavedOutfit | null)[];
    if (!Array.isArray(parsed)) return empty;
    return empty.map((_, i) => {
      const s = parsed[i];
      return s?.coord ? { coord: normalize(s.coord), thumb: s.thumb ?? '' } : null;
    });
  } catch {
    return empty;
  }
}

export function writeSavedOutfits(slots: (SavedOutfit | null)[]): void {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  } catch {
    // 容量超過(サムネのdataURLが大きい場合など)は黙って諦める
  }
}
