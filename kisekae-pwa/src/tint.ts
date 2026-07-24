import { Mesh, MeshStandardMaterial, Object3D } from 'three';

const cloned = new WeakSet<Mesh>();

/**
 * メッシュに色を乗算適用する。
 * material.color はテクスチャへの乗算なので、明るいテクスチャほどよく染まる。
 * clone を忘れると同じマテリアルを共有する他パーツまで染まるため、
 * メッシュごとに一度だけ clone してから色を変える。
 */
export function tintMesh(mesh: Mesh, hex: string): void {
  const apply = (m: MeshStandardMaterial) => m.color?.set(hex);

  if (!cloned.has(mesh)) {
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => m.clone());
    } else {
      mesh.material = mesh.material.clone();
    }
    cloned.add(mesh);
  }

  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => apply(m as MeshStandardMaterial));
  } else {
    apply(mesh.material as MeshStandardMaterial);
  }
}

/** ルート配下の全メッシュに色を適用 */
export function tintTree(root: Object3D, hex: string): void {
  root.traverse((obj) => {
    if ((obj as Mesh).isMesh) tintMesh(obj as Mesh, hex);
  });
}

/** 現在の色を16進で返す(検証用) */
export function currentColorHex(mesh: Mesh): string | null {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const c = (m as MeshStandardMaterial).color;
  return c ? `#${c.getHexString()}` : null;
}
