# きせかえ PWA

子ども向けの 3D 着せ替えアプリ。3D キャラクターに服を着せ、髪型・髪色・顔・肌色を変え、前・斜め・横・後ろの好きな角度から眺められる。オフラインで動く PWA。

詳細な計画・設計判断は [docs/PLAN.md](docs/PLAN.md) を参照。

> **注**: このディレクトリは本来 `mtstring/kisekae-pwa`(プライベートリポジトリ)のルートになる想定。リポジトリ作成権限の都合で一時的に `docs` リポジトリに置かれている。移設時はこのディレクトリをそのまま新リポジトリのルートにコピーすればよい(自己完結構成)。

## 現在の状態

| フェーズ | 状態 |
|---|---|
| P0 技術検証 | ✅ 完了(サンプル素材) |
| P1 アセットパイプライン | ✅ スクリプト整備完了 / ⚠️ 実アセットの投入待ち |
| P2 着せ替えコア | ✅ 完了 |
| P3 子ども向けUI | ✅ 完了 |
| P4 PWA化 | ✅ 完了(実機オフライン確認は未実施) |
| P5 お楽しみ | ✅ コーデ複数保存・しゃしん・背景切替 / ポーズ切替は対象外 |

`npm run check:p0` の自動検証 **24/24 パス**(ボーン包含・装着・360度・塗り分け・顔切替・保存復元・UI・横向き)。

**実アセットは未導入**。この開発環境から quaternius.com / itch.io への通信が遮断されているため、実キットと同じ「モジュール構成(頭=ベース、衣装=胴体込み)+共通ボーン名」を持つ生成サンプル GLB で全機能を検証している。差し替え手順は後述。

### 実装済みの機能

- **着せ替え**: 衣装2種・髪型2種の差し替え、髪/服/肌/目の色変更
- **顔**(PLAN §4.5 A案): 目・眉・口を各3種から選択。眉は髪色に自動追従、口は固定色
- **カメラ**: OrbitControls(縦回転制限・パン無効・ズーム範囲制限)+ 4方位ボタンの0.3秒補間。指を離しても正面に戻さない
- **子ども向けUI**: 全タップ領域64px以上、絵文字+ひらがなのタブ、「さいしょから」は確認ダイアログ、縦横両対応
- **お楽しみ**: おきにいり3枠(サムネ付き・長押しで上書き)、しゃしん(PNG書き出し)、背景6色
- **保存**: localStorage に自動保存。リロードで顔・色・背景まで復元
- **デバッグパネル**(右上 🐞): メッシュ名・ボーン名・マテリアル名の一覧とボーン包含判定

## コマンド

```bash
npm install
npm run dev              # 開発サーバ
npm run build            # 型チェック + 本番ビルド(PWA含む)
npm run preview          # dist の確認

npm run assets:sample    # サンプルGLBの再生成
npm run assets:icons     # PWAアイコン生成
npm run assets:thumbs    # サムネイル生成(要 build)
npm run assets:optimize  # assets-raw/ を最適化して public/models/ へ + 予算チェック
npm run assets:budget    # 容量予算(10MB)チェックのみ
npm run check:p0         # ヘッドレスChromiumで受け入れ条件を自動検証(要 build)
```

`assets:thumbs` と `check:p0` は `dist` を配信して実行するため、先に `npm run build` が必要。Chromium のパスは `CHROMIUM_PATH` で上書き可能(既定 `/opt/pw-browsers/chromium`)。

## 実アセット(Quaternius)の導入手順

いずれも CC0(クレジット不要・改変自由)。

1. 以下からダウンロード
   - Universal Base Characters — https://quaternius.com/packs/universalbasecharacters.html
   - Modular Character Outfits – Fantasy — https://quaternius.itch.io/modular-character-outfits-fantasy(Standard zip、name your own price → 0円で可)
2. zip から **glTF フォルダのみ**取り出し、`assets-raw/` に置く(FBX/OBJ/Blend は不要)。まずはベースキャラ1体・髪2種・衣装1着分で十分
3. 最適化して `public/models/` へ:

   ```bash
   npm run assets:optimize
   ```

   meshopt 圧縮 + webp テクスチャ(512px)で書き出し、合計10MBの予算を検査する。アプリ側は `MeshoptDecoder` 設定済みなのでこの出力をそのまま読める。オプション名がバージョンで合わない場合は `npx gltf-transform optimize --help` で確認して `scripts/optimize-assets.mjs` を調整する
4. `src/data/catalog.ts` の `file` を差し替える。**`tintMaterials` は必ず指定すること**(省略すると服の色が手や靴まで塗る)
5. `npm run build && npm run assets:thumbs && npm run build` でサムネイル生成
6. アプリを起動し、右上 🐞 のデバッグパネルで **ボーン包含チェックが ✔ になること**を確認(P0 の Go/No-Go 判定。PLAN §6)
7. `npm run check:p0` を通す。メッシュ名を前提にした検証項目(`Head_Mesh` / `Eye_01_L` など)は実アセットの命名に合わせて調整する
8. `public/CREDITS.md` に出典を追記

### 実アセットで注意する点

- **メッシュ名のドットは GLTFLoader に落とされる**(`Eye_01.L` → `Eye_01L`)。顔パーツの判定は前方一致なので影響しないが、名前で何かを判定するコードを足すときは読み込み後の名前を見ること。ボーン名も同じ変換を受けるが、ベース・パーツ双方に等しく効くので照合には影響しない
- 顔パーツのバリエーションは `Eye_<id>` / `Brow_<id>` / `Mouth_<id>` の接頭辞で切り替える。実アセットの命名が違う場合は `FACE_MESH_PREFIX` を合わせる
- 髪テクスチャが暗いと `material.color` の乗算では染まらない。グレースケール化してから使う(PLAN §4.4)

## 構成

```
src/
├─ main.ts          エントリ。SW登録・起動・検証用フック(window.__KISEKAE__)
├─ scene.ts         レンダラ・カメラ・OrbitControls・4方位トゥイーン・撮影
├─ character.ts     キャラ本体(スロット装着/解除・色適用・顔切替)
├─ rig.ts           ボーン照合(checkBoneCompat)・リバインド(attachToBase)
├─ tint.ts          material.clone + マテリアル名で絞った color 乗算
├─ thumbnail.ts     カタログ1件をオフスクリーンレンダリング
├─ storage.ts       Coordinate と おきにいり の localStorage 保存/復元
├─ debugPanel.ts    メッシュ/ボーン/マテリアル一覧+ボーン包含判定
├─ ui.ts            タブ・アイテム・色・方位・道具・確認ダイアログ
└─ data/catalog.ts  アイテム定義・顔バリエーション・パレット・型
scripts/
├─ make-sample-assets.mjs  サンプルGLB生成(実アセット代替)
├─ make-icons.mjs          PWAアイコン生成(zlibで直接PNGを書く)
├─ make-thumbnails.mjs     サムネイル生成(ヘッドレスChromium)
├─ optimize-assets.mjs     gltf-transform 最適化 + 容量予算チェック
├─ p0-check.mjs            受け入れ条件の自動検証(24項目)+スクショ
└─ lib/preview-server.mjs  dist配信の共通処理
```

## オフライン動作の確認

Service Worker は HTTPS か localhost でしか動かない。LAN の IP 直打ち(http)では PWA として検証できないので、実機確認には Tailscale の HTTPS 配信などを使う(PLAN §5)。**機内モードでホーム画面から起動して全機能が動くこと**(P4 の受け入れ条件)はまだ実機で確認していない。
