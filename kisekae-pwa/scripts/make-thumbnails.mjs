/**
 * サムネイル生成(PLAN §P1)
 *
 * 実際のレンダラでオフスクリーンレンダリングして `public/thumbs/<id>.webp` に書き出す。
 * アプリ本体のマテリアル・ライティングをそのまま使うので、
 * 一覧のサムネと3D表示の見た目がズレない。
 *
 * 使い方: npm run build && node scripts/make-thumbnails.mjs
 * ※ サムネを更新したら、それを取り込むためにもう一度 build すること。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CHROMIUM_LAUNCH, startPreview } from './lib/preview-server.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'thumbs');
const PORT = 4174;
const SIZE = 256;

await mkdir(OUT_DIR, { recursive: true });
const preview = await startPreview(PORT, ROOT);
const browser = await chromium.launch(CHROMIUM_LAUNCH);

try {
  const page = await browser.newPage({ viewport: { width: 480, height: 800 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(preview.url);
  await page.waitForFunction(() => window.__KISEKAE__?.ready, { timeout: 30000 });

  const catalog = await page.evaluate(() => window.__KISEKAE__.catalog());
  console.log(`${catalog.length} 件のサムネイルを生成します`);

  for (const item of catalog) {
    const dataUrl = await page.evaluate(
      ([id, size]) => window.__KISEKAE__.renderThumbnail(id, { size, type: 'image/webp' }),
      [item.id, SIZE],
    );

    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error(`${item.id}: dataURL の生成に失敗`);

    const buf = Buffer.from(base64, 'base64');
    const file = path.join(OUT_DIR, `${item.id}.webp`);
    await writeFile(file, buf);
    console.log(`  ✔ ${item.id}.webp (${buf.length} bytes)`);
  }
} finally {
  await browser.close();
  preview.stop();
}

console.log('done');
