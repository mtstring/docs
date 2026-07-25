/**
 * VRM 読み込み経路の検証
 *
 * test-fixtures/minimal.vrm(仕様は正しいが見た目は箱)を使い、
 * VRoid の実物が無い状態でも「VRMを読んで表示できるか」を確かめる。
 *
 * 使い方: npm run build && node scripts/check-vrm.mjs [検査したい.vrm]
 * 引数を渡すと、そのファイルで検証する(VRoid の書き出しを試すとき用)。
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CHROMIUM_LAUNCH, startPreview } from './lib/preview-server.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.argv[2] ?? path.join(ROOT, 'test-fixtures', 'minimal.vrm');
const OUT_DIR = path.join(ROOT, 'p0-shots');
const PORT = 4175;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// dist は build 済みの想定。検証対象をそこへ置いて配信する
const servedDir = path.join(ROOT, 'dist', 'models', 'vrm');
await mkdir(servedDir, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });
const served = path.join(servedDir, path.basename(SOURCE));
await copyFile(SOURCE, served);

const preview = await startPreview(PORT, ROOT);
const browser = await chromium.launch(CHROMIUM_LAUNCH);

try {
  const page = await browser.newPage({ viewport: { width: 480, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`リクエスト失敗: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  const url = `${preview.url}?vrm=/models/vrm/${encodeURIComponent(path.basename(SOURCE))}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__KISEKAE__?.ready, { timeout: 30000 });

  const mode = await page.evaluate(() => window.__KISEKAE__.mode);
  check('?vrm= 指定で VRM モードに入る', mode === 'vrm', `mode=${mode}`);

  const summary = await page.evaluate(() => window.__KISEKAE__.vrmSummary());
  check('VRM を読み込めた', !!summary, summary ? '' : 'summary が null');
  check(
    'humanoid ボーンを認識',
    (summary?.humanoidBoneCount ?? 0) >= 13,
    `${summary?.humanoidBoneCount}本(VRM1.0の必須は13本)`,
  );
  check('メッシュを認識', (summary?.meshes.length ?? 0) > 0, `${summary?.meshes.length}個`);
  check(
    '身長を取得(カメラ合わせに使う)',
    (summary?.height ?? 0) > 0.1,
    `${summary?.height?.toFixed(2)}m`,
  );

  // 画が出ているか(背景一色でないこと)を色の種類数で見る
  await page.waitForTimeout(500);
  const shot = path.join(OUT_DIR, 'vrm-load.png');
  await page.screenshot({ path: shot });
  // WebGLキャンバスを直接 drawImage すると(preserveDrawingBuffer 無効のため)
  // 合成後に空になる。描画と読み出しを同じタスクで行う stage.capture() を使う。
  const distinct = await page.evaluate(async () => {
    const dataUrl = window.__KISEKAE__.stage.capture(160);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = dataUrl;
    });
    const off = document.createElement('canvas');
    off.width = img.width;
    off.height = img.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, off.width, off.height).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4) set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return set.size;
  });
  check('キャラが描画されている', distinct > 3, `色数=${distinct}`);
  console.log(`  📷 ${shot}`);

  check('コンソールエラーなし', errors.length === 0, errors.join(' / ') || 'OK');
} finally {
  await browser.close();
  preview.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
