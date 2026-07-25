/**
 * テスト用の最小VRM生成
 *
 * VRoid から書き出した実物が手元に無い状態でも、アプリのVRM読み込み経路を
 * 検証できるようにするための「見た目は問わないが仕様は正しい」VRM。
 * VRM 1.0 が必須とする humanoid ボーン13本 + 箱メッシュ1つ。
 *
 * 出力: test-fixtures/minimal.vrm(アプリには同梱しない)
 * 使い方: node scripts/make-test-vrm.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildGlb, nodeIndexByName, parseGlb } from './lib/glb.mjs';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        this.onloadend?.();
      });
    }
  };
}

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test-fixtures',
);

/**
 * VRM 1.0 の必須 humanoid ボーン。
 * neck / chest / shoulder などは任意なので、最小構成では省く。
 * [VRM標準名, 実ノード名, 親, ワールド座標]
 */
const BONES = [
  ['hips', 'J_Bip_C_Hips', null, [0, 0.75, 0]],
  ['spine', 'J_Bip_C_Spine', 'J_Bip_C_Hips', [0, 0.95, 0]],
  ['chest', 'J_Bip_C_Chest', 'J_Bip_C_Spine', [0, 1.1, 0]],
  ['neck', 'J_Bip_C_Neck', 'J_Bip_C_Chest', [0, 1.28, 0]],
  ['head', 'J_Bip_C_Head', 'J_Bip_C_Neck', [0, 1.38, 0]],
  ['leftUpperArm', 'J_Bip_L_UpperArm', 'J_Bip_C_Chest', [0.16, 1.2, 0]],
  ['leftLowerArm', 'J_Bip_L_LowerArm', 'J_Bip_L_UpperArm', [0.2, 1.2, 0]],
  ['leftHand', 'J_Bip_L_Hand', 'J_Bip_L_LowerArm', [0.34, 1.2, 0]],
  ['rightUpperArm', 'J_Bip_R_UpperArm', 'J_Bip_C_Chest', [-0.16, 1.2, 0]],
  ['rightLowerArm', 'J_Bip_R_LowerArm', 'J_Bip_R_UpperArm', [-0.2, 1.2, 0]],
  ['rightHand', 'J_Bip_R_Hand', 'J_Bip_R_LowerArm', [-0.34, 1.2, 0]],
  ['leftUpperLeg', 'J_Bip_L_UpperLeg', 'J_Bip_C_Hips', [0.09, 0.72, 0]],
  ['leftLowerLeg', 'J_Bip_L_LowerLeg', 'J_Bip_L_UpperLeg', [0.09, 0.4, 0]],
  ['leftFoot', 'J_Bip_L_Foot', 'J_Bip_L_LowerLeg', [0.09, 0.08, 0]],
  ['rightUpperLeg', 'J_Bip_R_UpperLeg', 'J_Bip_C_Hips', [-0.09, 0.72, 0]],
  ['rightLowerLeg', 'J_Bip_R_LowerLeg', 'J_Bip_R_UpperLeg', [-0.09, 0.4, 0]],
  ['rightFoot', 'J_Bip_R_Foot', 'J_Bip_R_LowerLeg', [-0.09, 0.08, 0]],
];

function buildScene() {
  const nodes = new Map();
  const world = new Map();

  for (const [, name, parent, pos] of BONES) {
    const bone = new Bone();
    bone.name = name;
    world.set(name, pos);
    if (parent) {
      const p = world.get(parent);
      bone.position.set(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]);
      nodes.get(parent).add(bone);
    } else {
      bone.position.set(...pos);
    }
    nodes.set(name, bone);
  }

  const boneList = BONES.map(([, name]) => nodes.get(name));
  const skeleton = new Skeleton(boneList);

  const geometry = new BoxGeometry(0.3, 0.6, 0.2).translate(0, 1.05, 0);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));

  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial({ name: 'Body' }));
  mesh.name = 'Body';

  const root = new Group();
  root.name = 'Root';
  root.add(nodes.get('J_Bip_C_Hips'), mesh);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);
  return root;
}

/** VRM 1.0 の meta。三人称利用を一切許さない最も保守的な設定にしておく */
const META = {
  name: 'kisekae-test-fixture',
  version: '1.0',
  authors: ['kisekae-pwa'],
  licenseUrl: 'https://vrm.dev/licenses/1.0/',
  avatarPermission: 'onlyAuthor',
  commercialUsage: 'personalNonProfit',
  creditNotation: 'required',
  allowExcessivelyViolentUsage: false,
  allowExcessivelySexualUsage: false,
  allowPoliticalOrReligiousUsage: false,
  allowAntisocialOrHateUsage: false,
  allowRedistribution: false,
  modification: 'prohibited',
};

const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) =>
  exporter.parse(buildScene(), resolve, reject, { binary: true }),
);

const { json, bin } = parseGlb(Buffer.from(glb));
const index = nodeIndexByName(json);

const humanBones = {};
for (const [standard, nodeName] of BONES) {
  const node = index.get(nodeName);
  if (node == null) throw new Error(`ノードが見つかりません: ${nodeName}`);
  humanBones[standard] = { node };
}

json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_vrm'])];
json.extensions = {
  ...(json.extensions ?? {}),
  VRMC_vrm: { specVersion: '1.0', meta: META, humanoid: { humanBones } },
};

await mkdir(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'minimal.vrm');
const bytes = buildGlb(json, bin);
await writeFile(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes, humanoid ${Object.keys(humanBones).length}本)`);
