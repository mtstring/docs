/**
 * P0 受け入れ条件の自動検証(ヘッドレスChromium)
 *
 *  1. 衣装/髪のボーン名集合がベースのボーン名集合に完全に含まれる
 *  2. 差し替えたパーツがベースと同じ位置・スケールで表示される(目視用スクショ)
 *  3. 360度回して破綻がない(4方位のスクリーンショットを保存)
 *  4. 髪の色が material.color で変わる
 *  5. リロード後にコーデが復元される(P2)
 *
 * 使い方: npm run build && node scripts/p0-check.mjs [出力ディレクトリ]
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT_DIR = process.argv[2] ?? 'p0-shots';
const PORT = 4173;
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await mkdir(OUT_DIR, { recursive: true });

// dist を preview サーバで配信
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes('http') && resolve());
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.on('exit', (code) => reject(new Error(`preview exited: ${code}`)));
  setTimeout(() => reject(new Error('preview起動タイムアウト')), 15000);
});

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 480, height: 800 } });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__KISEKAE__?.ready, { timeout: 20000 });
  const app = () => page.evaluate.bind(page);

  // 1) ボーン包含チェック
  const boneCount = await page.evaluate(() => window.__KISEKAE__.boneCount());
  check('ベースのスケルトン読込', boneCount > 0, `ボーン数=${boneCount}`);

  for (const slot of ['hair', 'outfit']) {
    const compat = await page.evaluate((s) => window.__KISEKAE__.compatOf(s), slot);
    check(
      `${slot} のボーン名がベースに完全に含まれる`,
      !!compat?.ok,
      compat ? `使用${compat.used.length}本 / 欠落${compat.missing.length}本` : '未装着',
    );
  }

  // 2) 装着メッシュ数(位置・スケールの目視確認はスクショで)
  const attached = await page.evaluate(() => {
    const c = window.__KISEKAE__.character;
    return c.allSlotStates().map(([slot, st]) => [slot, st.meshes.length]);
  });
  check('パーツ装着', attached.length >= 3, JSON.stringify(attached));

  // 3) 4方位スクリーンショット(360度確認)
  for (const [label, theta] of Object.entries(
    await page.evaluate(() => window.__KISEKAE__.ANGLES),
  )) {
    await page.evaluate((t) => window.__KISEKAE__.stage.moveToAzimuth(t, 100), theta);
    await page.waitForTimeout(400);
    const file = path.join(OUT_DIR, `angle-${label}.png`);
    await page.screenshot({ path: file });
    console.log(`  📷 ${file}`);
  }
  check('4方位スクリーンショット保存', true);

  // 4) 髪色変更
  await page.evaluate(() => window.__KISEKAE__.setColor('hair', '#ff0000'));
  const hairColor = await page.evaluate(() => window.__KISEKAE__.colorOf('hair'));
  check('髪色が material.color で変わる', hairColor === '#ff0000', `色=${hairColor}`);
  await page.evaluate(() => window.__KISEKAE__.stage.moveToAzimuth(0.6, 100));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'hair-red.png') });

  // 衣装差し替え(P2)
  await page.evaluate(() => window.__KISEKAE__.equip('outfit', 'outfit-knight'));
  await page.waitForTimeout(300);
  const outfitNow = await page.evaluate(
    () => window.__KISEKAE__.character.coordinate.items.outfit,
  );
  check('衣装の差し替え', outfitNow === 'outfit-knight', outfitNow);
  await page.screenshot({ path: path.join(OUT_DIR, 'outfit-knight.png') });

  // 5) リロード後の復元(localStorage)
  await page.waitForTimeout(600); // 保存デバウンス待ち
  await page.reload();
  await page.waitForFunction(() => window.__KISEKAE__?.ready, { timeout: 20000 });
  const restored = await page.evaluate(() => ({
    outfit: window.__KISEKAE__.character.coordinate.items.outfit,
    hairColor: window.__KISEKAE__.character.coordinate.colors.hair,
  }));
  check(
    'リロード後にコーデ復元',
    restored.outfit === 'outfit-knight' && restored.hairColor === '#ff0000',
    JSON.stringify(restored),
  );
  await page.screenshot({ path: path.join(OUT_DIR, 'restored.png') });

  void app;
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
