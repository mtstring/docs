import { Box3, Mesh, Object3D } from 'three';
import type { Character } from './character';
import type { Stage } from './scene';
import type { Item, Slot } from './data/catalog';
import { itemById } from './data/catalog';

/** サムネイルで一緒に写すスロット。髪は頭と、服は全身と一緒に見せる */
const CONTEXT: Partial<Record<Slot, Slot[]>> = {
  hair: ['head', 'hair'],
  head: ['head'],
  outfit: ['head', 'hair', 'outfit'],
  shoes: ['outfit', 'shoes'],
  accessory: ['head', 'hair', 'outfit', 'accessory'],
};

/**
 * 表示中のメッシュだけのバウンディングボックス。
 * Box3.expandByObject は visible=false の子も含めてしまうため使えない
 * (髪のサムネなのに全身ぶんの箱になり、頭が小さく写る)。
 */
function visibleBox(roots: Object3D[]): Box3 {
  const box = new Box3();
  const tmp = new Box3();

  roots.forEach((root) => {
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
      box.union(tmp);
    });
  });
  return box;
}

/**
 * カタログのアイテム1件を、実際のレンダラで正方形サムネイルとして描き出す。
 * PLAN §P1「Three.jsでオフスクリーンレンダリングして書き出すのが確実」の実装。
 * 返り値は dataURL(既定 webp)。Node 側 (scripts/make-thumbnails.mjs) が書き出す。
 */
export async function renderThumbnail(
  stage: Stage,
  character: Character,
  itemId: string,
  opts: { size?: number; type?: string; azimuth?: number } = {},
): Promise<string> {
  const item: Item | undefined = itemById(itemId);
  if (!item) throw new Error(`不明なアイテム: ${itemId}`);

  const { size = 256, type = 'image/webp', azimuth = Math.PI / 8 } = opts;

  const before = structuredClone(character.coordinate);
  const restoreCamera = stage.snapshotCamera();

  try {
    if (item.slot !== 'head') await character.equip(item.slot, item.id, { silent: true });

    // 対象スロット以外を隠す
    const shown = CONTEXT[item.slot] ?? [item.slot];
    const roots: Object3D[] = [];
    for (const [slot, state] of character.allSlotStates()) {
      const on = shown.includes(slot);
      state.meshes.forEach((m) => {
        m.visible = on;
        if (on) roots.push(m);
      });
    }

    return stage.withSquare(size, () => {
      stage.frameBox(visibleBox(roots), azimuth);
      return stage.capture(undefined, type);
    });
  } finally {
    character.allSlotStates().forEach(([, s]) => s.meshes.forEach((m) => (m.visible = true)));
    await character.apply(before);
    restoreCamera();
  }
}
