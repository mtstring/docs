# CLAUDE.md

子ども向け 3D 着せ替え PWA。**計画書は [docs/PLAN.md](docs/PLAN.md)** — 作業前に必ず読むこと。フェーズ定義(P0〜P5)・受け入れ条件・Go/No-Go 判定はすべてそこにある。

## コマンド

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run assets:sample` — サンプル GLB 再生成
- `npm run check:p0` — ビルド後にヘッドレス Chromium で P0 受け入れ条件を自動検証(8項目)。**リグ/装着/色替え周りを触ったら必ず回す**

## いまの状態と前提

- P0(技術検証)・P2(着せ替えコア)・P4(PWA化)は**サンプル素材で**完了。P1(実アセットパイプライン)と P3(子ども向けUI磨き込み)が未着手
- 実アセット(Quaternius, CC0)は未導入。ネットワーク制限のある環境では DL できないため、`scripts/make-sample-assets.mjs` が実キットと同じモジュール構成・共通ボーン名のダミー GLB を生成する。導入手順は README 参照
- 実アセット導入時は `src/data/catalog.ts` の `file` 差し替え+デバッグパネル(🐞)でボーン包含チェック ✔ を確認

## 設計の要点(詳細は PLAN.md §4)

- 衣装 GLB のスケルトンは捨て、ベースのボーンへ参照し直す(`src/rig.ts` の `attachToBase`)。`bindMode: 'attached'` のためベースと親・ローカル変換を揃えている — ここを崩すと服がずれる
- 色替えは `material.clone()` してから `color.set()`(`src/tint.ts`)。clone を忘れると共有マテリアルの他パーツまで染まる
- Workbox 設定の `globPatterns`(`.glb` 明示)と `maximumFileSizeToCacheInBytes` は削らない。消すと「オフラインで真っ白」になる(PLAN.md §5)
- カメラは「指を離したら正面に戻す」を**やらない**(子どもが決めた向きを尊重)

## 検証用フック

`window.__KISEKAE__` に stage / character / equip / setColor / colorOf / compatOf / boneCount を公開している。`scripts/p0-check.mjs` が利用。UI を変えてもこのフックは壊さないこと。
