# CLAUDE.md

子ども向け 3D 着せ替え PWA。**計画書は [docs/PLAN.md](docs/PLAN.md)** — 作業前に必ず読むこと。フェーズ定義(P0〜P5)・受け入れ条件・Go/No-Go 判定はすべてそこにある。現状の進捗は README を見ること。

## コマンド

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run check:p0` — **ビルド後に**ヘッドレス Chromium で受け入れ条件を自動検証(24項目)。リグ・装着・色替え・顔・UI を触ったら必ず回す
- `npm run assets:sample` / `assets:icons` / `assets:thumbs` / `assets:optimize` / `assets:budget`

## いまの前提

- P0〜P5 は**サンプル素材で**通っている。実アセット(Quaternius, CC0)は未導入で、ネットワーク制限のある環境では DL できない
- `scripts/make-sample-assets.mjs` が実キットと同じモジュール構成・共通ボーン名のダミー GLB を生成する。導入手順と注意点は README を参照
- 実機でのオフライン確認(P4 受け入れ)は未実施

## 壊してはいけない設計

- **リバインド**(`src/rig.ts` `attachToBase`): 衣装 GLB のスケルトンは捨て、ベースのボーンへ参照し直す。`bindMode: 'attached'` のためベースと親・ローカル変換を揃えている — ここを崩すと服だけずれる/潰れる
- **色替え**(`src/tint.ts`): `material.clone()` してから `color.set()`。clone を忘れると共有マテリアルの他パーツまで染まる。さらに**マテリアル名で塗る対象を絞る**(`Item.tintMaterials`)— 省略すると服の色が手や靴まで、肌色が目や眉まで塗る
- **Workbox 設定**(`vite.config.ts`): `globPatterns` の `.glb` 明示と `maximumFileSizeToCacheInBytes` は削らない。消すと「オフラインで真っ白」になる(PLAN §5)
- **カメラ**: 「指を離したら正面に戻す」は**やらない**(子どもが決めた向きを尊重)
- **顔**(PLAN §4.5 A案): `Eye_<id>` / `Brow_<id>` / `Mouth_<id>` の接頭辞一致で表示を切り替える。メッシュ名のドットは GLTFLoader に落とされるので、名前を前提にするコードは読み込み後の名前で判断する
- **子ども向けUI**: タップ領域64px以上、ひらがな+絵文字、破壊的操作には確認ダイアログ。`check:p0` がタップ領域を検査している

## 検証用フック

`window.__KISEKAE__` に stage / character / equip / setColor / setFace / colorOf / debugMeshes / visibleFaceMeshes / compatOf / boneCount / savedOutfits / catalog / renderThumbnail を公開している。`scripts/p0-check.mjs` と `scripts/make-thumbnails.mjs` が利用するので壊さないこと。

## ハマりどころ

- `vite preview` を `npx` 経由で spawn すると孫プロセスに SIGTERM が伝わらず Node が終了しない。`scripts/lib/preview-server.mjs` はローカルバイナリを直接叩き、プロセスグループごと落としている
- `Box3.expandByObject` は `visible=false` の子も含む。サムネイルの構図計算では表示中メッシュだけを見ること(`src/thumbnail.ts`)
