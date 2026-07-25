/**
 * VRM / GLB 検査ツール
 *
 * VRoid Studio から書き出した .vrm の中身を報告する。
 * 「着せ替えをどう実装できるか」は、実物のメッシュ構成を見ないと決められない。
 * このツールの出力がその判断材料になる。
 *
 * 使い方:
 *   node scripts/inspect-vrm.mjs assets-raw/mychar.vrm
 *   node scripts/inspect-vrm.mjs a.vrm b.vrm --diff   # 2体のボーン差分も出す
 *
 * WebGL 不要。glTF の JSON を直接読むだけなので速い。
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseGlb } from './lib/glb.mjs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const wantDiff = args.includes('--diff');

if (!files.length) {
  console.error('使い方: node scripts/inspect-vrm.mjs <file.vrm> [file2.vrm --diff]');
  process.exit(1);
}

const fmtMB = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;

/** VRoid のメッシュ名から着せ替えスロットを推測する */
function guessSlot(name) {
  const n = name.toLowerCase();
  if (/hair/.test(n)) return 'hair';
  if (/face|eye|brow|mouth|eyelash|eyeline|highlight/.test(n)) return 'face';
  if (/tops|shirt|jacket|outer|onepiece|dress/.test(n)) return 'tops';
  if (/bottoms|skirt|pants|trouser/.test(n)) return 'bottoms';
  if (/shoes|boots/.test(n)) return 'shoes';
  if (/accessor|hat|glass|ribbon/.test(n)) return 'accessory';
  if (/body|skin/.test(n)) return 'body';
  return '?';
}

async function inspect(file) {
  const buf = await readFile(file);
  const size = (await stat(file)).size;
  const { json } = parseGlb(buf);

  const vrm1 = json.extensions?.VRMC_vrm;
  const vrm0 = json.extensions?.VRM;
  const vrm = vrm1 ?? vrm0;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${path.basename(file)}  —  ${fmtMB(size)}`);
  console.log('='.repeat(70));

  // ---- VRM 情報 ----
  if (!vrm) {
    console.log('⚠️  VRM 拡張なし(ただの glTF/GLB です)');
  } else {
    const version = vrm1 ? `1.0 (specVersion=${vrm1.specVersion})` : '0.x (旧仕様)';
    console.log(`VRM バージョン : ${version}`);
    const meta = vrm1?.meta ?? vrm0?.meta ?? {};
    console.log(`タイトル       : ${meta.name ?? meta.title ?? '(なし)'}`);
    if (vrm0) {
      console.log('  ※ 0.x は three-vrm が読み込み時に 1.0 相当へ変換します(前後の向きも補正)');
    }
  }

  // ---- humanoid ボーン ----
  const humanBones = vrm1?.humanoid?.humanBones;
  const humanBones0 = vrm0?.humanoid?.humanBones;
  const nodes = json.nodes ?? [];

  let boneNames = new Map(); // 標準名 -> 実ノード名
  if (humanBones) {
    for (const [std, v] of Object.entries(humanBones)) {
      boneNames.set(std, nodes[v.node]?.name ?? `#${v.node}`);
    }
  } else if (humanBones0) {
    for (const b of humanBones0) {
      boneNames.set(b.bone, nodes[b.node]?.name ?? `#${b.node}`);
    }
  }
  console.log(`\nhumanoid ボーン : ${boneNames.size}本`);
  if (boneNames.size) {
    const sample = [...boneNames.entries()].slice(0, 6);
    sample.forEach(([std, real]) => console.log(`  ${std.padEnd(16)} → ${real}`));
    if (boneNames.size > 6) console.log(`  … 他 ${boneNames.size - 6}本`);
  }

  // ---- ノード全体(揺れ物などの非humanoidボーン) ----
  const humanNodeNames = new Set(boneNames.values());
  const springNodes = new Set();
  const spring = vrm1?.extensions?.VRMC_springBone ?? json.extensions?.VRMC_springBone;
  const springColliders = spring?.springs?.length ?? vrm0?.secondaryAnimation?.boneGroups?.length ?? 0;
  console.log(`揺れ物グループ  : ${springColliders}個`);

  // ---- メッシュ ----
  console.log(`\nメッシュ (${(json.meshes ?? []).length}個):`);
  const bySlot = new Map();
  let totalTris = 0;

  // 名前はメッシュ側ではなくノード側に付くことがあるので、両方から拾う
  const meshNodeName = new Map();
  nodes.forEach((n) => {
    if (n.mesh != null && n.name && !meshNodeName.has(n.mesh)) meshNodeName.set(n.mesh, n.name);
  });
  const nameOf = (mesh, i) => mesh.name ?? meshNodeName.get(i) ?? '(無名)';

  for (const [i, mesh] of (json.meshes ?? []).entries()) {
    const prims = mesh.primitives ?? [];
    const tris = prims.reduce((a, p) => {
      const idx = p.indices != null ? json.accessors?.[p.indices]?.count ?? 0 : 0;
      return a + Math.floor(idx / 3);
    }, 0);
    totalTris += tris;

    const mats = prims
      .map((p) => (p.material != null ? json.materials?.[p.material]?.name : null))
      .filter(Boolean);
    const label = nameOf(mesh, i);
    const slot = guessSlot(label);
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + 1);

    console.log(
      `  [${slot.padEnd(9)}] ${label.padEnd(28)} ` +
        `${String(tris).padStart(7)}tri  mat: ${[...new Set(mats)].join(', ') || '(なし)'}`,
    );
  }
  console.log(`  合計 ${totalTris.toLocaleString()} 三角`);

  // ---- マテリアル ----
  const mtoon = (json.materials ?? []).filter(
    (m) => m.extensions?.VRMC_materials_mtoon || m.extensions?.VRM_materials_mtoon,
  ).length;
  console.log(`\nマテリアル      : ${(json.materials ?? []).length}個(うち MToon ${mtoon}個)`);

  // ---- テクスチャ ----
  const images = json.images ?? [];
  const imgBytes = images.reduce(
    (a, im) => a + (im.bufferView != null ? json.bufferViews?.[im.bufferView]?.byteLength ?? 0 : 0),
    0,
  );
  console.log(`テクスチャ      : ${images.length}枚 / 約 ${fmtMB(imgBytes)}(全体の${Math.round((imgBytes / size) * 100)}%)`);

  // ---- 表情 ----
  const expr = vrm1?.expressions?.preset ?? {};
  const blendShapes = vrm0?.blendShapeMaster?.blendShapeGroups ?? [];
  const exprCount = Object.keys(expr).length || blendShapes.length;
  console.log(`表情            : ${exprCount}個`);

  // ---- 着せ替え方針の所見 ----
  console.log('\n所見:');
  const hairMeshes = bySlot.get('hair') ?? 0;
  const clothMeshes = (bySlot.get('tops') ?? 0) + (bySlot.get('bottoms') ?? 0) + (bySlot.get('shoes') ?? 0);

  if (clothMeshes > 0) {
    console.log(`  ✔ 衣装が独立メッシュ(${clothMeshes}個)。表示切替やメッシュ移植での着せ替えが狙える`);
  } else {
    console.log('  ⚠️ 衣装が独立メッシュとして分かれていない。VRM丸ごと差し替え方式が無難');
  }
  if (hairMeshes > 0) console.log(`  ✔ 髪が独立メッシュ(${hairMeshes}個)。髪型の差し替えが狙える`);
  if (imgBytes / size > 0.7) {
    console.log('  ⚠️ 容量の大半がテクスチャ。gltf-transform で 1024px 前後に落とすと大幅に縮む');
  }
  if (size > 10 * 1024 * 1024) {
    console.log(`  ⚠️ ${fmtMB(size)} は PLAN の10MB予算を超過。複数体を同梱するなら予算の見直しが必要`);
  }

  return {
    file,
    boneNames,
    meshes: (json.meshes ?? []).map((m, i) => nameOf(m, i)),
  };
}

const reports = [];
for (const f of files) reports.push(await inspect(f));

// ---- 2体以上あるときの差分 ----
if (wantDiff && reports.length >= 2) {
  const [a, b] = reports;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`差分: ${path.basename(a.file)} vs ${path.basename(b.file)}`);
  console.log('='.repeat(70));

  const aNames = new Set(a.boneNames.values());
  const bNames = new Set(b.boneNames.values());
  const onlyB = [...bNames].filter((n) => !aNames.has(n));

  console.log(
    onlyB.length === 0
      ? '✔ humanoid ボーンの実名が完全一致。メッシュ移植による着せ替えが可能'
      : `⚠️ ${path.basename(b.file)} だけにあるボーン: ${onlyB.join(', ')}`,
  );

  const aMesh = new Set(a.meshes);
  const diffMesh = b.meshes.filter((m) => !aMesh.has(m));
  console.log(`${path.basename(b.file)} だけにあるメッシュ: ${diffMesh.join(', ') || '(なし)'}`);
}
