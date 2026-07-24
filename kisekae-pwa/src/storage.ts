import type { Coordinate } from './data/catalog';
import { DEFAULT_COORDINATE } from './data/catalog';

const KEY = 'kisekae.coordinate.v1';

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
    if (!raw) return structuredClone(DEFAULT_COORDINATE);
    const parsed = JSON.parse(raw) as Coordinate;
    if (!parsed || typeof parsed !== 'object' || !parsed.items) {
      return structuredClone(DEFAULT_COORDINATE);
    }
    return {
      ...structuredClone(DEFAULT_COORDINATE),
      ...parsed,
      items: { ...DEFAULT_COORDINATE.items, ...parsed.items },
      colors: { ...DEFAULT_COORDINATE.colors, ...parsed.colors },
    };
  } catch {
    return structuredClone(DEFAULT_COORDINATE);
  }
}
