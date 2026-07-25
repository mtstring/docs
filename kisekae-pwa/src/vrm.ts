import { Box3, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/**
 * VRM(VRoid Studio の書き出し)を読み込む。
 *
 * VRM は Humanoid ボーンが規格化されているため、`vrm.humanoid` から
 * 標準名でボーンを引ける。GLB のノード名総当たりより堅い。
 */
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

const cache = new Map<string, Promise<VRM>>();

export async function loadVrm(url: string): Promise<VRM> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) {
        throw new Error(
          `${url} は VRM ではありません(VRMC_vrm 拡張なし)。` +
            `VRoid Studio から .vrm で書き出してください`,
        );
      }
      // 使われないジョイントとレンダリング順の最適化(three-vrm 推奨の後処理)
      VRMUtils.combineSkeletons(vrm.scene);
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      vrm.scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh) mesh.frustumCulled = false;
      });
      return vrm;
    });
    cache.set(url, p);
  }
  return p;
}

/** VRM 標準名 → 実ノード。着せ替えでボーンを引き当てるのに使う */
export function humanoidBones(vrm: VRM): Map<string, Object3D> {
  const map = new Map<string, Object3D>();
  const humanBones = vrm.humanoid?.humanBones ?? {};
  for (const [standard, entry] of Object.entries(humanBones)) {
    const node = (entry as { node?: Object3D } | undefined)?.node;
    if (node) map.set(standard, node);
  }
  return map;
}

export interface VrmSummary {
  /** メッシュ名 → 三角数 */
  meshes: { name: string; tris: number; material: string }[];
  humanoidBoneCount: number;
  /** 身長(足元から頭頂までのメートル) */
  height: number;
  expressions: string[];
}

/** デバッグパネル用の要約 */
export function summarizeVrm(vrm: VRM): VrmSummary {
  const meshes: VrmSummary['meshes'] = [];
  vrm.scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const tris = Math.floor((index ? index.count : (pos?.count ?? 0)) / 3);
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    meshes.push({ name: obj.name || '(無名)', tris, material: mat?.name ?? '' });
  });

  const box = new Box3().setFromObject(vrm.scene);
  const size = box.getSize(new Vector3());

  return {
    meshes,
    humanoidBoneCount: humanoidBones(vrm).size,
    height: size.y,
    expressions: Object.keys(vrm.expressionManager?.expressionMap ?? {}),
  };
}

/**
 * VRM の各フレーム更新。揺れ物(springBone)と表情はこれを呼ばないと動かない。
 */
export function updateVrm(vrm: VRM, dt: number): void {
  vrm.update(dt);
}
