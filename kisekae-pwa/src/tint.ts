import { Mesh, MeshStandardMaterial, Object3D } from 'three';

const cloned = new WeakSet<Mesh>();

/**
 * メッシュのマテリアルをこのメッシュ専用に複製する。
 * clone を忘れると同じマテリアルを共有する他パーツまで染まるため、
 * 色を触る前に必ず一度だけ通す。
 */
function ensureOwnMaterial(mesh: Mesh): void {
  if (cloned.has(mesh)) return;
  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map((m) => m.clone())
    : mesh.material.clone();
  cloned.add(mesh);
}

function materialsOf(mesh: Mesh): MeshStandardMaterial[] {
  return (
    Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  ) as MeshStandardMaterial[];
}

/**
 * ルート配下のメッシュのうち、マテリアル名が prefixes のいずれかで始まるものだけを塗る。
 * material.color はテクスチャへの乗算なので、明るいテクスチャほどよく染まる。
 *
 * prefixes を省略すると全マテリアルが対象。服の色が手や靴まで乗ってしまうので、
 * 実運用では Item.tintMaterials を必ず指定すること。
 */
export function tintTree(root: Object3D, hex: string, prefixes?: string[]): number {
  let painted = 0;
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;

    const names = materialsOf(mesh).map((m) => m.name ?? '');
    const hit = !prefixes || names.some((n) => prefixes.some((p) => n.startsWith(p)));
    if (!hit) return;

    ensureOwnMaterial(mesh);
    materialsOf(mesh).forEach((m, i) => {
      if (prefixes && !prefixes.some((p) => (names[i] ?? '').startsWith(p))) return;
      m.color?.set(hex);
      painted++;
    });
  });
  return painted;
}

/** 検証用: ルート配下で最初に見つかった該当マテリアルの現在色 */
export function colorOfTree(root: Object3D, prefixes?: string[]): string | null {
  let found: string | null = null;
  root.traverse((obj) => {
    if (found) return;
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    for (const m of materialsOf(mesh)) {
      const name = m.name ?? '';
      if (prefixes && !prefixes.some((p) => name.startsWith(p))) continue;
      if (m.color) {
        found = `#${m.color.getHexString()}`;
        return;
      }
    }
  });
  return found;
}
