import { Bone, Object3D, Skeleton, SkinnedMesh } from 'three';

export interface BoneCompat {
  ok: boolean;
  /** 衣装側にあってベース側に無いボーン名 */
  missing: string[];
  /** 衣装側で参照しているボーン名の集合 */
  used: string[];
}

/**
 * 衣装(などのパーツ)ルート配下の SkinnedMesh が参照するボーン名が、
 * ベースのスケルトンに完全に含まれるかを検査する。P0の最重要チェック。
 */
export function checkBoneCompat(partRoot: Object3D, base: SkinnedMesh): BoneCompat {
  const baseNames = new Set(base.skeleton.bones.map((b) => b.name));
  const used = new Set<string>();
  const missing = new Set<string>();

  partRoot.traverse((obj) => {
    const sm = obj as SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    for (const b of sm.skeleton.bones) {
      used.add(b.name);
      if (!baseNames.has(b.name)) missing.add(b.name);
    }
  });

  return { ok: missing.size === 0, missing: [...missing], used: [...used] };
}

/**
 * パーツGLB内の SkinnedMesh を、ベースのボーンを参照するように付け替える。
 * パーツ側スケルトンは捨て、boneInverses / bindMatrix は元のものを使う
 * (レストポーズ情報なので保持する)。
 *
 * 注意: bindMode が既定の 'attached' のとき SkinnedMesh 自身のワールド変換が
 * 結果に効くため、ベースと同じ親に置き、ローカル変換をベースに揃える。
 */
export function attachToBase(partRoot: Object3D, base: SkinnedMesh): SkinnedMesh[] {
  const boneMap = new Map<string, Bone>();
  base.skeleton.bones.forEach((b) => boneMap.set(b.name, b));

  const skinnedMeshes: SkinnedMesh[] = [];
  partRoot.traverse((obj) => {
    const sm = obj as SkinnedMesh;
    if (sm.isSkinnedMesh) skinnedMeshes.push(sm);
  });

  const attached: SkinnedMesh[] = [];
  for (const sm of skinnedMeshes) {
    const bones = sm.skeleton.bones.map((b) => {
      const t = boneMap.get(b.name);
      if (!t) throw new Error(`ボーン名が一致しません: ${b.name}`);
      return t;
    });

    sm.bind(new Skeleton(bones, sm.skeleton.boneInverses), sm.bindMatrix);
    sm.frustumCulled = false;

    base.parent!.add(sm);
    sm.position.copy(base.position);
    sm.quaternion.copy(base.quaternion);
    sm.scale.copy(base.scale);

    attached.push(sm);
  }
  return attached;
}

export interface GlbInventory {
  meshes: { name: string; type: string; material: string; skinned: boolean }[];
  bones: string[];
  materials: string[];
}

/** デバッグパネル用: GLBルート配下のメッシュ名・ボーン名・マテリアル名を列挙 */
export function inventory(root: Object3D): GlbInventory {
  const meshes: GlbInventory['meshes'] = [];
  const bones = new Set<string>();
  const materials = new Set<string>();

  root.traverse((obj) => {
    const anyObj = obj as any;
    if (anyObj.isBone) bones.add(obj.name);
    if (anyObj.isMesh) {
      const mats = Array.isArray(anyObj.material) ? anyObj.material : [anyObj.material];
      mats.forEach((m: { name?: string }) => m?.name && materials.add(m.name));
      meshes.push({
        name: obj.name,
        type: obj.type,
        material: mats.map((m: { name?: string }) => m?.name ?? '(無名)').join(', '),
        skinned: !!anyObj.isSkinnedMesh,
      });
    }
  });

  return { meshes, bones: [...bones], materials: [...materials] };
}
