# きせかえ PWA

子ども向けの 3D 着せ替えアプリ。3D キャラクターに服を着せ、髪型・髪色・肌色を変え、前・斜め・横・後ろの好きな角度から眺められる。オフラインで動く PWA。

詳細な計画・設計判断は [docs/PLAN.md](docs/PLAN.md) を参照。

> **注**: このディレクトリは本来 `mtstring/kisekae-pwa`(プライベートリポジトリ)のルートになる想定。リポジトリ作成権限の都合で一時的に `docs` リポジトリのブランチに置かれている。移設時はこのディレクトリをそのまま新リポジトリのルートにコピーすればよい(自己完結構成)。

## 現在の状態

- ✅ **P0 技術検証 完了**(サンプル素材にて 8/8 チェックパス)
  - ボーン名の包含チェック → リバインド(`attachToBase`)→ 装着
  - `material.color` による髪色・肌色・服色の変更
  - OrbitControls(縦回転制限・パン無効)+ 4方位ボタン(まえ/ななめ/よこ/うしろ)
  - メッシュ名・ボーン名・マテリアル名を一覧するデバッグパネル(右上 🐞)
- ✅ **P2 着せ替えコア**: スロット管理・カタログ・色替え・localStorage 保存/復元
- ✅ **P4 PWA 化**: Workbox precache(`.glb` glob 明示 + キャッシュ上限 20MB)
- ⚠️ **実アセット未導入**: この開発環境から quaternius.com / itch.io への通信が遮断されているため、実キットと同じ「モジュール構成+共通ボーン名」を持つ生成サンプル GLB で検証している(下記手順で差し替え)

## コマンド

```bash
npm install
npm run dev            # 開発サーバ
npm run build          # 型チェック + 本番ビルド(PWA含む)
npm run preview        # dist の確認
npm run assets:sample  # サンプルGLBの再生成
npm run check:p0       # ヘッドレスChromiumでP0受け入れ条件を自動検証
```

`check:p0` は `npm run build` 後に実行する。Chromium のパスは `CHROMIUM_PATH` で上書き可能(既定 `/opt/pw-browsers/chromium`)。

## 実アセット(Quaternius)の導入手順

いずれも CC0(クレジット不要・改変自由)。

1. 以下からダウンロード
   - Universal Base Characters — https://quaternius.com/packs/universalbasecharacters.html
   - Modular Character Outfits – Fantasy — https://quaternius.itch.io/modular-character-outfits-fantasy(Standard zip、name your own price → 0円で可)
2. zip から **glTF フォルダのみ**取り出す(FBX/OBJ/Blend は不要)。P0 で必要なのはベースキャラ1体・髪2種・衣装1着分のみ
3. 最適化して `public/models/` に配置(目標: 合計 10MB 以下、テクスチャ 512px)

   ```bash
   npx @gltf-transform/cli optimize in.glb out.glb \
     --compress meshopt --texture-compress webp
   # オプション名はバージョンで変わるので --help で確認
   ```

   ※ meshopt 圧縮を使う場合、読み込み側に `MeshoptDecoder` の設定が必要
   (`GLTFLoader.setMeshoptDecoder`)。非圧縮で 10MB 以下に収まるならそれでもよい。
4. `src/data/catalog.ts` の `file` を差し替える
5. アプリを起動し、右上 🐞 のデバッグパネルで **ボーン包含チェックが ✔ になること**を確認(P0 の Go/No-Go 判定。詳細は PLAN.md §6)
6. `public/CREDITS.md` に出典を追記

## 構成

```
src/
├─ main.ts          エントリ。SW登録・起動・検証用フック(window.__KISEKAE__)
├─ scene.ts         レンダラ・カメラ・OrbitControls・4方位トゥイーン
├─ character.ts     キャラ本体(スロット装着/解除・色適用)
├─ rig.ts           ボーン照合(checkBoneCompat)・リバインド(attachToBase)
├─ tint.ts          material.clone + color 乗算
├─ storage.ts       Coordinate の localStorage 保存/復元
├─ debugPanel.ts    メッシュ/ボーン/マテリアル一覧+P0判定表示
├─ ui.ts            スロットタブ・アイテム・色パレット・方位ボタン
└─ data/catalog.ts  アイテム定義(静的配列)・型・パレット
scripts/
├─ make-sample-assets.mjs  サンプルGLB生成(実アセット代替)
├─ make-icons.mjs          PWAアイコン生成
└─ p0-check.mjs            P0受け入れ条件の自動検証+スクショ
```

## オフライン動作の確認

Service Worker は HTTPS か localhost でしか動かない。LAN の IP 直打ち(http)では PWA として検証できないので、実機確認には Tailscale の HTTPS 配信などを使う(PLAN.md §5)。
