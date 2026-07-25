/**
 * 受け入れ条件の自動検証(ヘッドレスChromium)
 *
 * P0: ボーン包含 / 装着 / 360度 / 色替え
 * P2: 差し替え・localStorage 復元
 * §4.4: マテリアル単位の塗り分け(肌色が目を塗らない、服色が手・靴を塗らない)
 * §4.5: 顔パーツのバリエーション切替
 * P5: 背景切替・コーデ保存
 *
 * 使い方: npm run build && node scripts/p0-check.mjs [出力ディレクトリ]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { CHROMIUM_LAUNCH, startPreview } from './lib/preview-server.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv[2] ?? path.join(ROOT, 'p0-shots');
const PORT = 4173;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await mkdir(OUT_DIR, { recursive: true });
const preview = await startPreview(PORT, ROOT);
const browser = await chromium.launch(CHROMIUM_LAUNCH);

try {
  const page = await browser.newPage({ viewport: { width: 480, height: 800 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(preview.url);
  await page.waitForFunction(() => window.__KISEKAE__?.ready, { timeout: 30000 });

  // ---- P0: ボーン包含 ----
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

  const attached = await page.evaluate(() =>
    window.__KISEKAE__.character.allSlotStates().map(([slot, st]) => [slot, st.meshes.length]),
  );
  check('パーツ装着', attached.length >= 3, JSON.stringify(attached));

  // ---- P0: 360度 ----
  for (const [label, theta] of Object.entries(
    await page.evaluate(() => window.__KISEKAE__.ANGLES),
  )) {
    await page.evaluate((t) => window.__KISEKAE__.stage.moveToAzimuth(t, 100), theta);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, `angle-${label}.png`) });
  }
  check('4方位スクリーンショット保存', true);

  // ---- §4.4: 塗り分け ----
  await page.evaluate(() => {
    const k = window.__KISEKAE__;
    k.setColor('hair', '#ff0000');
    k.setColor('skin', '#00ff00');
    k.setColor('outfit', '#0000ff');
    k.setColor('eye', '#ffff00');
  });
  await page.waitForTimeout(200);
  const meshes = await page.evaluate(() => window.__KISEKAE__.debugMeshes());

  check('髪色が material.color で変わる', meshes['Hair_Short']?.color === '#ff0000',
    `Hair_Short=${meshes['Hair_Short']?.color}`);
  check('肌色が目を塗らない', meshes['Eye_01_L']?.color === '#ffff00',
    `Eye_01_L=${meshes['Eye_01_L']?.color}(期待 #ffff00)`);
  check('眉が髪色に追従する', meshes['Brow_01_L']?.color === '#ff0000',
    `Brow_01_L=${meshes['Brow_01_L']?.color}`);
  check('服色が手(肌)を塗らない', meshes['Hand_L']?.color === '#00ff00',
    `Hand_L=${meshes['Hand_L']?.color}(期待 #00ff00)`);
  check('服色が靴を塗らない', meshes['Shoe_L']?.color !== '#0000ff',
    `Shoe_L=${meshes['Shoe_L']?.color}`);
  check('服の生地は服色になる', meshes['Torso']?.color === '#0000ff',
    `Torso=${meshes['Torso']?.color}`);
  check('頭は肌色になる', meshes['Head_Mesh']?.color === '#00ff00', `Head_Mesh=${meshes['Head_Mesh']?.color}`);

  // ---- §4.5: 顔パーツ切替 ----
  await page.evaluate(() => {
    window.__KISEKAE__.setFace('eye', '03');
    window.__KISEKAE__.setFace('mouth', '02');
  });
  await page.waitForTimeout(150);
  const eyes = await page.evaluate(() => window.__KISEKAE__.visibleFaceMeshes('eye'));
  const mouths = await page.evaluate(() => window.__KISEKAE__.visibleFaceMeshes('mouth'));
  check('目のバリエーション切替', eyes.length === 2 && eyes.every((n) => n.startsWith('Eye_03')),
    eyes.join(', '));
  check('口のバリエーション切替', mouths.length === 1 && mouths[0] === 'Mouth_02',
    mouths.join(', '));

  await page.evaluate(() => {
    window.__KISEKAE__.setColor('hair', '#8d5a2b');
    window.__KISEKAE__.setColor('skin', '#ffd9b8');
    window.__KISEKAE__.setColor('outfit', '#e991b7');
    window.__KISEKAE__.setColor('eye', '#3b2f2a');
  });
  await page.evaluate(() => window.__KISEKAE__.stage.moveToAzimuth(0.5, 100));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT_DIR, 'face-variants.png') });

  // ---- P2: 差し替えと復元 ----
  await page.evaluate(() => window.__KISEKAE__.equip('outfit', 'outfit-knight'));
  await page.waitForTimeout(300);
  const outfitNow = await page.evaluate(
    () => window.__KISEKAE__.character.coordinate.items.outfit,
  );
  check('衣装の差し替え', outfitNow === 'outfit-knight', outfitNow);
  await page.screenshot({ path: path.join(OUT_DIR, 'outfit-knight.png') });

  await page.waitForTimeout(600); // 保存デバウンス待ち
  await page.reload();
  await page.waitForFunction(() => window.__KISEKAE__?.ready, { timeout: 30000 });
  const restored = await page.evaluate(() => ({
    outfit: window.__KISEKAE__.character.coordinate.items.outfit,
    eye: window.__KISEKAE__.character.coordinate.face.eye,
    mouth: window.__KISEKAE__.character.coordinate.face.mouth,
  }));
  check(
    'リロード後にコーデ復元(顔もふくむ)',
    restored.outfit === 'outfit-knight' && restored.eye === '03' && restored.mouth === '02',
    JSON.stringify(restored),
  );

  // ---- P3: UI ----
  const tapTooSmall = await page.evaluate(() => {
    const sel = '#slot-tabs button, #angle-bar button, .item-btn, .color-btn, .tool-btn, .save-slot';
    return [...document.querySelectorAll(sel)]
      .map((e) => ({ c: e.className || e.id, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 64 || r.height < 64)
      .map(({ c, r }) => `${c}:${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  check('タップ領域がすべて64px以上', tapTooSmall.length === 0, tapTooSmall.join(', ') || 'OK');

  const tabCount = await page.evaluate(
    () => document.querySelectorAll('#slot-tabs button').length,
  );
  check('スロットタブが並ぶ', tabCount >= 5, `${tabCount}個`);

  // 「さいしょから」は確認を挟む
  await page.click('#tool-row .tool-btn:nth-of-type(2)');
  await page.waitForTimeout(150);
  const confirmOpen = await page.evaluate(() =>
    document.getElementById('confirm').classList.contains('open'),
  );
  check('「さいしょから」で確認ダイアログが出る', confirmOpen);
  await page.screenshot({ path: path.join(OUT_DIR, 'confirm.png') });

  await page.click('#confirm-no');
  await page.waitForTimeout(150);
  const stillKnight = await page.evaluate(
    () => window.__KISEKAE__.character.coordinate.items.outfit,
  );
  check('「やめる」でコーデが消えない', stillKnight === 'outfit-knight', stillKnight);

  await page.click('#tool-row .tool-btn:nth-of-type(2)');
  await page.waitForTimeout(150);
  await page.click('#confirm-yes');
  await page.waitForTimeout(600);
  const afterReset = await page.evaluate(
    () => window.__KISEKAE__.character.coordinate.items.outfit,
  );
  check('「いいよ」でさいしょに戻る', afterReset === 'outfit-dress', afterReset);

  // ---- P5: 背景・コーデ保存 ----
  await page.evaluate(() => window.__KISEKAE__.equip('outfit', 'outfit-knight'));
  await page.waitForTimeout(300);
  await page.click('#slot-tabs button[data-tab="bg"]');
  await page.waitForTimeout(150);
  await page.click('#content-rows .color-btn:nth-of-type(2)');
  await page.waitForTimeout(200);
  const bg = await page.evaluate(() => window.__KISEKAE__.character.coordinate.background);
  check('背景切替', bg === '#eaf4ff', bg);

  await page.click('.save-slot[data-save-slot="0"]');
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => window.__KISEKAE__.savedOutfits());
  check(
    'コーデ保存(サムネ付き)',
    !!saved[0]?.coord && saved[0].thumb.startsWith('data:image/png'),
    saved[0] ? `outfit=${saved[0].coord.items.outfit}, thumb=${saved[0].thumb.length}B` : '空',
  );

  await page.screenshot({ path: path.join(OUT_DIR, 'saved-outfit.png') });

  // 横向き
  await page.setViewportSize({ width: 900, height: 480 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT_DIR, 'landscape.png') });
  const panelOnRight = await page.evaluate(() => {
    const p = document.getElementById('panel').getBoundingClientRect();
    return p.left > window.innerWidth * 0.4 && p.height > window.innerHeight * 0.8;
  });
  check('横向きでパネルが右に寄る', panelOnRight);
} finally {
  await browser.close();
  preview.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
