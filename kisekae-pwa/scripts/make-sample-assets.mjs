/**
 * サンプルGLB生成スクリプト
 *
 * このリモート環境では quaternius.com / itch.io への通信が遮断されており
 * 実アセットをダウンロードできないため、実アセットと同じ「モジュール構成 +
 * 共通ボーン名」を持つ低ポリのダミーGLBを生成する。
 *
 * 生成物(public/models/sample/):
 *   - base_head.glb     … 頭・目・眉(スケルトン込み)= ベースキャラ相当
 *   - hair_short.glb    … 髪ショート(自前のスケルトンを持つ = 実キットと同じ)
 *   - hair_long.glb     … 髪ロング
 *   - outfit_dress.glb  … 胴体込みドレス(4.1の「衣装側に胴体が含まれる」構成)
 *   - outfit_knight.glb … 胴体込み騎士服
 *
 * 実アセット導入後は src/data/catalog.ts の file を差し替えるだけでよい。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  ConeGeometry,
  CylinderGeometry,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter はGLB結合に FileReader を使うため、Node用に最小ポリフィル
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = `data:${blob.type};base64,${Buffer.from(ab).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
}

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'models',
  'sample',
);

/** ボーン定義: [名前, 親名, ワールド座標] — 全GLBで共通 */
const BONE_DEFS = [
  ['Root', null, [0, 0, 0]],
  ['Hips', 'Root', [0, 0.75, 0]],
  ['Spine', 'Hips', [0, 0.95, 0]],
  ['Chest', 'Spine', [0, 1.1, 0]],
  ['Neck', 'Chest', [0, 1.28, 0]],
  ['Head', 'Neck', [0, 1.38, 0]],
  ['UpperArm.L', 'Chest', [0.16, 1.2, 0]],
  ['LowerArm.L', 'UpperArm.L', [0.2, 1.2, 0]],
  ['Hand.L', 'LowerArm.L', [0.34, 1.2, 0]],
  ['UpperArm.R', 'Chest', [-0.16, 1.2, 0]],
  ['LowerArm.R', 'UpperArm.R', [-0.2, 1.2, 0]],
  ['Hand.R', 'LowerArm.R', [-0.34, 1.2, 0]],
  ['UpperLeg.L', 'Hips', [0.09, 0.72, 0]],
  ['LowerLeg.L', 'UpperLeg.L', [0.09, 0.4, 0]],
  ['Foot.L', 'LowerLeg.L', [0.09, 0.08, 0]],
  ['UpperLeg.R', 'Hips', [-0.09, 0.72, 0]],
  ['LowerLeg.R', 'UpperLeg.R', [-0.09, 0.4, 0]],
  ['Foot.R', 'LowerLeg.R', [-0.09, 0.08, 0]],
];

function buildSkeleton() {
  const bones = new Map();
  const world = new Map();
  for (const [name, parentName, pos] of BONE_DEFS) {
    const bone = new Bone();
    bone.name = name;
    world.set(name, pos);
    if (parentName) {
      const p = world.get(parentName);
      bone.position.set(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]);
      bones.get(parentName).add(bone);
    } else {
      bone.position.set(...pos);
    }
    bones.set(name, bone);
  }
  const list = BONE_DEFS.map(([name]) => bones.get(name));
  return { root: bones.get('Root'), skeleton: new Skeleton(list), byName: bones };
}

/** ジオメトリ全頂点を単一ボーンにリジッドバインドする属性を付与 */
function rigidSkin(geometry, boneIndex) {
  const count = geometry.attributes.position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = boneIndex;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  return geometry;
}

const boneIndex = (name) => BONE_DEFS.findIndex(([n]) => n === name);

/**
 * 1つのGLB(=1パーツ)を組み立てる。
 * parts: {name, geometry, bone, material} の配列。geometryはワールド座標で作る。
 */
function buildPart(rootName, parts) {
  const { root, skeleton } = buildSkeleton();
  const group = new Group();
  group.name = rootName;
  group.add(root);

  for (const p of parts) {
    const mesh = new SkinnedMesh(rigidSkin(p.geometry, boneIndex(p.bone)), p.material);
    mesh.name = p.name;
    group.add(mesh);
    group.updateMatrixWorld(true);
    mesh.bind(skeleton);
    mesh.frustumCulled = false;
  }
  return group;
}

const mat = (name, color, opts = {}) =>
  new MeshStandardMaterial({ name, color, roughness: 0.85, metalness: 0, ...opts });

// ---- 各パーツ ----------------------------------------------------------

/**
 * ベース(頭)。実キット同様、目・眉・口を別メッシュに分離し、
 * さらにバリエーションを名前で区別できるようにする(PLAN §4.5 A案)。
 * 命名規約: `Eye_01_L` / `Brow_02_R` / `Mouth_03`
 * — アプリ側は `Eye_${選択id}` で始まるメッシュだけを visible にする。
 *
 * メッシュ名にドットは使わない。GLTFLoader が読み込み時に名前をサニタイズして
 * ドットを落とすため(`Eye_01.L` → `Eye_01L`)、書き出し時の名前と一致しなくなる。
 * ボーン名のドット(Blender 由来の `.L`/`.R`)はベース・パーツ双方が同じ変換を
 * 受けるので照合には影響しない。
 */
function baseHead() {
  const skin = mat('Skin', 0xffffff); // 実行時に肌色を乗算するため白ベース
  const eyeMat = mat('Eye', 0xffffff, { roughness: 0.35 });
  const browMat = mat('Brow', 0xffffff);
  const mouthMat = mat('Mouth', 0xffffff);

  const parts = [
    {
      name: 'Head_Mesh',
      geometry: new SphereGeometry(0.17, 24, 18).translate(0, 1.5, 0),
      bone: 'Head',
      material: skin,
    },
    {
      name: 'Neck_Mesh',
      geometry: new CylinderGeometry(0.05, 0.06, 0.14, 12).translate(0, 1.32, 0),
      bone: 'Neck',
      material: skin,
    },
  ];

  // 左右対称のパーツを2枚まとめて登録する
  const addPair = (name, material, make) => {
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      parts.push({
        name: `${name}_${side}`,
        geometry: make(sign),
        bone: 'Head',
        material: material.clone(),
      });
    }
  };

  // --- 目 3種 ---
  // 01 ふつう(まる)
  addPair('Eye_01', eyeMat, (s) =>
    new SphereGeometry(0.023, 12, 10).translate(s * 0.06, 1.52, 0.155),
  );
  // 02 にこにこ(細めたスリット)
  addPair('Eye_02', eyeMat, (s) =>
    new SphereGeometry(0.026, 12, 10).scale(1, 0.3, 1).translate(s * 0.06, 1.525, 0.157),
  );
  // 03 きらきら(おおきめ)
  addPair('Eye_03', eyeMat, (s) =>
    new SphereGeometry(0.033, 14, 12).scale(1, 1.15, 0.8).translate(s * 0.062, 1.518, 0.15),
  );

  // --- 眉 3種(髪色に追従させる) ---
  // 01 ふつう(まっすぐ)
  addPair('Brow_01', browMat, (s) =>
    new BoxGeometry(0.052, 0.012, 0.01).translate(s * 0.06, 1.577, 0.163),
  );
  // 02 きりっ(内側さがり)
  addPair('Brow_02', browMat, (s) =>
    new BoxGeometry(0.055, 0.013, 0.01)
      .rotateZ(s * -0.35)
      .translate(s * 0.06, 1.577, 0.163),
  );
  // 03 やさしい(内側あがり)
  addPair('Brow_03', browMat, (s) =>
    new BoxGeometry(0.05, 0.012, 0.01)
      .rotateZ(s * 0.3)
      .translate(s * 0.061, 1.582, 0.163),
  );

  // --- 口 3種 ---
  parts.push(
    {
      name: 'Mouth_01', // にこ
      geometry: new TorusGeometry(0.032, 0.007, 6, 14, Math.PI)
        .rotateZ(Math.PI)
        .translate(0, 1.462, 0.163),
      bone: 'Head',
      material: mouthMat.clone(),
    },
    {
      name: 'Mouth_02', // あーん
      geometry: new SphereGeometry(0.024, 12, 10)
        .scale(1, 1.25, 0.55)
        .translate(0, 1.452, 0.16),
      bone: 'Head',
      material: mouthMat.clone(),
    },
    {
      name: 'Mouth_03', // むー
      geometry: new BoxGeometry(0.034, 0.011, 0.01).translate(0, 1.455, 0.165),
      bone: 'Head',
      material: mouthMat.clone(),
    },
  );

  return buildPart('BaseHead', parts);
}

function hairShort() {
  const hair = mat('Hair', 0xffffff);
  const cap = new SphereGeometry(0.185, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42)
    .translate(0, 1.52, -0.03);
  return buildPart('HairShort', [
    { name: 'Hair_Short', geometry: cap, bone: 'Head', material: hair },
  ]);
}

function hairLong() {
  const hair = mat('Hair', 0xffffff);
  const cap = new SphereGeometry(0.185, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.46)
    .translate(0, 1.52, -0.03);
  const back = new BoxGeometry(0.24, 0.42, 0.08).translate(0, 1.28, -0.14);
  const sideL = new BoxGeometry(0.06, 0.3, 0.08).translate(0.14, 1.35, 0.02);
  const sideR = new BoxGeometry(0.06, 0.3, 0.08).translate(-0.14, 1.35, 0.02);
  return buildPart('HairLong', [
    { name: 'Hair_Long_Cap', geometry: cap, bone: 'Head', material: hair },
    { name: 'Hair_Long_Back', geometry: back, bone: 'Head', material: hair },
    { name: 'Hair_Long_Side_L', geometry: sideL, bone: 'Head', material: hair },
    { name: 'Hair_Long_Side_R', geometry: sideR, bone: 'Head', material: hair },
  ]);
}

/** 胴体込みの衣装(4.1の想定構成)。腕・脚も衣装側に含める */
function outfitCommon(clothMat, skirt) {
  const skin = mat('Skin', 0xffffff);
  const parts = [
    { name: 'Torso', geometry: new BoxGeometry(0.3, 0.34, 0.18).translate(0, 1.12, 0), bone: 'Chest', material: clothMat },
    { name: 'Waist', geometry: new BoxGeometry(0.26, 0.2, 0.17).translate(0, 0.88, 0), bone: 'Spine', material: clothMat },
    { name: 'Sleeve_L', geometry: new CylinderGeometry(0.05, 0.045, 0.2, 10).rotateZ(Math.PI / 2).translate(0.24, 1.2, 0), bone: 'UpperArm.L', material: clothMat },
    { name: 'Sleeve_R', geometry: new CylinderGeometry(0.045, 0.05, 0.2, 10).rotateZ(Math.PI / 2).translate(-0.24, 1.2, 0), bone: 'UpperArm.R', material: clothMat },
    { name: 'Hand_L', geometry: new SphereGeometry(0.045, 10, 8).translate(0.37, 1.2, 0), bone: 'Hand.L', material: skin },
    { name: 'Hand_R', geometry: new SphereGeometry(0.045, 10, 8).translate(-0.37, 1.2, 0), bone: 'Hand.R', material: skin },
  ];
  if (skirt) {
    parts.push(
      { name: 'Skirt', geometry: new ConeGeometry(0.28, 0.5, 18, 1, true).translate(0, 0.55, 0), bone: 'Hips', material: clothMat },
      { name: 'Leg_L', geometry: new CylinderGeometry(0.05, 0.045, 0.35, 10).translate(0.09, 0.28, 0), bone: 'LowerLeg.L', material: skin },
      { name: 'Leg_R', geometry: new CylinderGeometry(0.045, 0.05, 0.35, 10).translate(-0.09, 0.28, 0), bone: 'LowerLeg.R', material: skin },
    );
  } else {
    parts.push(
      { name: 'Pants_L', geometry: new CylinderGeometry(0.06, 0.055, 0.6, 10).translate(0.09, 0.42, 0), bone: 'UpperLeg.L', material: clothMat },
      { name: 'Pants_R', geometry: new CylinderGeometry(0.055, 0.06, 0.6, 10).translate(-0.09, 0.42, 0), bone: 'UpperLeg.R', material: clothMat },
    );
  }
  parts.push(
    { name: 'Shoe_L', geometry: new BoxGeometry(0.1, 0.08, 0.18).translate(0.09, 0.05, 0.02), bone: 'Foot.L', material: mat('Shoe', 0xf0f0f0) },
    { name: 'Shoe_R', geometry: new BoxGeometry(0.1, 0.08, 0.18).translate(-0.09, 0.05, 0.02), bone: 'Foot.R', material: mat('Shoe', 0xf0f0f0) },
  );
  return parts;
}

const outfitDress = () =>
  buildPart('OutfitDress', outfitCommon(mat('Cloth_Dress', 0xffffff), true));
const outfitKnight = () =>
  buildPart('OutfitKnight', outfitCommon(mat('Cloth_Knight', 0xffffff, { metalness: 0.3, roughness: 0.5 }), false));

// ---- 書き出し ----------------------------------------------------------

async function exportGlb(object, file) {
  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(object, resolve, reject, { binary: true });
  });
  await writeFile(file, Buffer.from(glb));
  console.log(`wrote ${file} (${glb.byteLength} bytes)`);
}

await mkdir(OUT_DIR, { recursive: true });
await exportGlb(baseHead(), path.join(OUT_DIR, 'base_head.glb'));
await exportGlb(hairShort(), path.join(OUT_DIR, 'hair_short.glb'));
await exportGlb(hairLong(), path.join(OUT_DIR, 'hair_long.glb'));
await exportGlb(outfitDress(), path.join(OUT_DIR, 'outfit_dress.glb'));
await exportGlb(outfitKnight(), path.join(OUT_DIR, 'outfit_knight.glb'));
console.log('done');
