/**
 * アセット最適化(PLAN §3.3 / §P1)
 *
 * `assets-raw/**.glb`(Quaternius の zip から取り出した生データ)を
 * gltf-transform で圧縮して `public/models/` に書き出し、容量予算を検査する。
 *
 *   npm run assets:optimize            # 最適化 + 予算チェック
 *   npm run assets:budget              # 予算チェックのみ
 *
 * 圧縮方式は meshopt + webp テクスチャ。アプリ側は MeshoptDecoder を
 * 設定済みなので、この出力をそのまま読める(src/character.ts)。
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'assets-raw');
const OUT_DIR = path.join(ROOT, 'public', 'models');

/** PLAN §3.3 の目標: public/models/ 配下の合計 10MB 以下 */
const BUDGET_BYTES = 10 * 1024 * 1024;
const TEXTURE_SIZE = 512; // 子どもの端末で軽く動くことが最優先

const budgetOnly = process.argv.includes('--budget-only');

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const fmt = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;

async function optimize() {
  const inputs = (await walk(RAW_DIR)).filter((f) => /\.(glb|gltf)$/i.test(f));
  if (!inputs.length) {
    console.log(
      `assets-raw/ に glb/gltf がありません。README の手順で Quaternius のキットを展開してから実行してください。\n` +
        `(サンプル素材のみで動かす場合はこの工程は不要です)`,
    );
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  for (const input of inputs) {
    const rel = path.relative(RAW_DIR, input);
    const output = path.join(OUT_DIR, rel.replace(/\.gltf$/i, '.glb'));
    await mkdir(path.dirname(output), { recursive: true });

    const before = (await stat(input)).size;
    // オプション名はバージョンで変わる。合わなければ `npx gltf-transform optimize --help` で確認
    const args = [
      'optimize',
      input,
      output,
      '--compress',
      'meshopt',
      '--texture-compress',
      'webp',
      '--texture-size',
      String(TEXTURE_SIZE),
    ];

    try {
      await run('npx', ['gltf-transform', ...args.slice(0)], { cwd: ROOT, maxBuffer: 1 << 26 });
      const after = (await stat(output)).size;
      console.log(`  ✔ ${rel}: ${fmt(before)} → ${fmt(after)}`);
    } catch (e) {
      console.error(`  ✘ ${rel}: 最適化に失敗\n${e.stderr ?? e.message}`);
      process.exitCode = 1;
    }
  }
}

async function checkBudget() {
  const files = await walk(OUT_DIR);
  const sizes = await Promise.all(
    files.map(async (f) => ({ f, size: (await stat(f)).size })),
  );
  const total = sizes.reduce((a, b) => a + b.size, 0);

  console.log('\npublic/models/ の内訳:');
  for (const { f, size } of sizes.sort((a, b) => b.size - a.size)) {
    console.log(`  ${fmt(size).padStart(8)}  ${path.relative(OUT_DIR, f)}`);
  }

  const ok = total <= BUDGET_BYTES;
  console.log(
    `\n合計 ${fmt(total)} / 予算 ${fmt(BUDGET_BYTES)} — ${ok ? '✔ OK' : '✘ 予算オーバー'}`,
  );
  if (!ok) {
    console.error('テクスチャ解像度を下げるか、不要なパーツを削ってください。');
    process.exitCode = 1;
  }
}

if (!budgetOnly) await optimize();
await checkBudget();
