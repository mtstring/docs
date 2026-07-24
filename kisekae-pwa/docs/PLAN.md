# 着せ替えPWA 実装計画書

> Claude Code への引き継ぎ用。リポジトリ直下の `docs/PLAN.md` に置くか、`CLAUDE.md` から参照させる想定。

---

## 1. 何を作るか

子ども向けの着せ替えアプリ。3Dキャラクターに服を着せ、髪型・髪色・顔を変え、**前・斜め・横・後ろ**の好きな角度から眺められる。オフラインで動くPWA。

**決定事項**

| 項目 | 決定 |
|---|---|
| 表現方式 | 3Dモジュラーキャラ(2D多方向イラスト案は不採用) |
| 服のテイスト | ファンタジー系(姫・魔女・騎士など) |
| バックエンド | なし。保存はすべて端末内 |
| 実行環境 | まずはローカル。Vercelデプロイは後回し |
| 素材 | CC0のモジュラーキャラキットを土台にする |

**なぜ3Dか**:「どの角度からも見たい」を2Dでやると、服1着ごとに4方向×全パーツを描き直すことになり、点数が増えた時点で破綻する。3Dなら1体組めば360度が無料でついてくる。

---

## 2. 技術スタック

| 用途 | 選定 | 備考 |
|---|---|---|
| ビルド | Vite + TypeScript | |
| 3D | three (0.185系) | WebGLRendererで十分。WebGPUは不要 |
| カメラ操作 | three/addons の OrbitControls | |
| PWA | vite-plugin-pwa (1.3系) | 内部はWorkbox |
| モデル最適化 | @gltf-transform/cli | ビルド前の一度きりの前処理 |
| 状態保存 | localStorage | コーデ1件はJSONで数百バイト |

外部通信は一切なし。フォントも含めて全アセットをバンドルする。

---

## 3. アセット調達

### 3.1 使うキット(いずれもCC0 / クレジット不要・改変自由)

**Universal Base Characters** — https://quaternius.com/packs/universalbasecharacters.html
- ベース体6種(Superhero/Regular/Teen × 男女)
- **髪型20種**(髪の長さ要件はこれで満たす)
- 目・眉が別メッシュに分離済み
- Humanoidリグ、平均13k三角、glTF提供

**Modular Character Outfits – Fantasy** — https://quaternius.itch.io/modular-character-outfits-fantasy
- 12衣装 / 62パーツ、1衣装につき3色テクスチャ
- 上のベースキャラと互換のリグ
- v2.0(2026-01-29)でパーツ間のクリッピングが大幅改善

### 3.2 取得手順

1. itch.ioから **Standard** zip をダウンロード(name your own price → 0円で可)
2. **glTFフォルダのみ**を取り出す。FBX/OBJ/Blendは不要
3. P0では以下だけあればよい:
   - ベースキャラ 1体
   - 髪 2種(ショート・ロング)
   - 衣装 1着分のパーツ

### 3.3 最適化

```bash
npx @gltf-transform/cli optimize in.glb out.glb \
  --compress meshopt --texture-compress webp
```

- 目標:`public/models/` 配下の合計 **10MB以下**
- オプション名はCLIの `--help` で確認すること(バージョンで変わる)
- テクスチャは512pxで十分。子どもの端末で軽く動くことが最優先

### 3.4 ライセンス表記

CC0なので表記義務はないが、`public/CREDITS.md` に出典を残しておく。素材を追加した時にどこから来たか分からなくなるのを防ぐため。

---

## 4. アーキテクチャ

### 4.1 モジュール構成の想定 ※要検証

Fantasyキットの更新履歴に「ベースキャラの**頭だけ**あれば全モデルが成立するようにした」とある。つまり衣装パーツ側に胴体が含まれている可能性が高い。だとすると構成はこうなる:

```
キャラクター
├─ 頭      … Base Characters から(顔・目・眉)
├─ 髪      … Base Characters から(20種から選択)
└─ 衣装    … Outfits キットから(胴体込み)
```

**ベースの裸体を服の下に隠す必要がない**ため、貫通(クリッピング)問題がほぼ発生しない。P0で実物を見て確認すること。もし衣装が胴体を含まない構成だった場合は、ベース体を表示したうえで服で覆う従来型に切り替える。

### 4.2 スロットとデータモデル

```ts
type Slot = 'head' | 'hair' | 'outfit' | 'shoes' | 'accessory';

interface Item {
  id: string;
  slot: Slot;
  label: string;        // 子どもに見せる名前(ひらがな)
  file: string;         // /models/...
  nodeName?: string;    // GLB内の対象メッシュ名
  tintable: boolean;    // 実行時に色を変えられるか
  thumb: string;        // /thumbs/....webp
}

interface Coordinate {
  items: Partial<Record<Slot, string>>;  // slot -> item.id
  colors: Partial<Record<Slot, string>>; // slot -> hex
  skin: string;
  savedAt: number;
}
```

アイテム定義は `src/data/catalog.ts` に静的配列で持つ。DBもJSONフェッチも不要。

### 4.3 服の差し替え(ここが技術的な核心)

同じリグから書き出されたパーツ同士なので、衣装GLBに入っているスケルトンは捨て、**ベースのボーンを参照し直す**だけで着せられる。

```ts
import { Bone, Skeleton, SkinnedMesh, Object3D } from 'three';

function attachToBase(outfitRoot: Object3D, base: SkinnedMesh): SkinnedMesh[] {
  const boneMap = new Map<string, Bone>();
  base.skeleton.bones.forEach(b => boneMap.set(b.name, b));

  const attached: SkinnedMesh[] = [];
  outfitRoot.traverse(obj => {
    const sm = obj as SkinnedMesh;
    if (!sm.isSkinnedMesh) return;

    const bones = sm.skeleton.bones.map(b => {
      const t = boneMap.get(b.name);
      if (!t) throw new Error(`ボーン名が一致しません: ${b.name}`);
      return t;
    });

    // boneInverses と bindMatrix は元のものをそのまま使う(レストポーズ情報)
    sm.bind(new Skeleton(bones, sm.skeleton.boneInverses), sm.bindMatrix);
    sm.frustumCulled = false;

    base.parent!.add(sm);          // ベースと同じ親に置く
    sm.position.copy(base.position);
    sm.quaternion.copy(base.quaternion);
    sm.scale.copy(base.scale);

    attached.push(sm);
  });
  return attached;
}
```

**落とし穴**:`bindMode` が既定の `'attached'` のとき、SkinnedMesh 自身のワールド変換が結果に効く。ベースと親・ローカル変換を揃えないと、服だけ位置がずれたり潰れたりする。上のコードで変換をコピーしているのはそのため。

### 4.4 色替え

```ts
mesh.material = (mesh.material as MeshStandardMaterial).clone(); // 必須
mesh.material.color.set(hex);
```

- `material.color` はテクスチャに対する**乗算**。明るいテクスチャはよく染まり、暗いテクスチャは染まらない
- **cloneを忘れると同じマテリアルを共有している他のパーツまで色が変わる**
- 髪色が思うように変わらない場合は、髪テクスチャをグレースケール化してから乗算するのが手っ取り早い
- 肌色も同じ仕組みで頭メッシュに適用

### 4.5 顔

2案。P0で実物のマテリアル構成を見てから決める。

- **A案(推奨)**:目・眉が別メッシュなので、表示切替+色変更で組み合わせる。追加素材ゼロ
- **B案**:Canvasに目・眉・口を描いて `CanvasTexture` として頭に貼る。表情の自由度は高いが、頭のUV展開に合わせ込む手間がかかる

### 4.6 カメラ

```ts
const ANGLES = {
  まえ:   0,
  ななめ: Math.PI / 4,
  よこ:   Math.PI / 2,
  うしろ: Math.PI,
};
```

- OrbitControls で自由回転。**縦回転は制限**(`minPolarAngle` / `maxPolarAngle`)して真上・真下を向かせない
- パンは無効、ズームは範囲を絞る
- 4つのボタンで方位角を補間移動(0.3秒程度)。ライブラリ不要、`lerp` で十分
- 指を離したら正面にゆっくり戻す、はやらない。子どもが自分で決めた向きを勝手に変えられるのは不快

---

## 5. PWA / オフライン

```ts
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,glb,gltf,bin,png,webp,svg,json}'],
    maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
  },
  manifest: {
    name: '着せ替え',
    short_name: '着せ替え',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
  },
})
```

**必ず踏む落とし穴が2つ**:

1. Workboxの既定のglobパターンに `.glb` は含まれない → 明示指定が必要
2. Workboxの既定のキャッシュ上限は約2MB → モデルが弾かれるので引き上げが必要

どちらも「開発中は動くのにオフラインにすると真っ白」という形で出る。

**実機確認**:Service WorkerはHTTPSかlocalhostでしか動かない。LANのIP直打ち(http)ではPWAとして検証できない。Tailscale の HTTPS 配信を使うのが手軽。

---

## 6. フェーズと受け入れ条件

### P0 — 技術検証(最重要 / 目安 半日)

**やること**:ベースキャラ1体を読み込み、衣装パーツ1つを差し替えて、マウスで回す。

**受け入れ条件**
- [ ] 衣装のボーン名の集合が、ベースのボーン名の集合に**完全に含まれる**
- [ ] 差し替えた服がベースと同じ位置・スケールで表示される
- [ ] 360度回して破綻がない
- [ ] 髪の色が `material.color` で変わる

**Go / No-Go 判定**

| 結果 | 次のアクション |
|---|---|
| ボーン名が一致 | そのままP1へ |
| ボーン名が不一致 | Blenderでリグを揃える工程をP1に追加(工数+1〜2日) |
| 衣装に胴体が含まれない | ベース体を表示する構成に変更。貫通対策が必要 |

**P0を通すまで他のフェーズに着手しないこと。** ここが崩れると設計全体が変わる。

デバッグを楽にするため、読み込んだGLBのメッシュ名・ボーン名・マテリアル名を一覧表示するパネルを最初に作る。以降のフェーズでもずっと使う。

### P1 — アセットパイプライン(1日)
- 必要パーツのみ抽出、gltf-transformで圧縮
- サムネイル生成(Three.jsでオフスクリーンレンダリングして書き出すのが確実)
- **受け入れ**:`public/models/` 合計10MB以下、全パーツが読み込めてエラーゼロ

### P2 — 着せ替えコア(2日)
- スロット管理、カタログ、色替え、localStorage保存/復元
- **受け入れ**:全パーツの任意の組み合わせが破綻なく表示され、リロード後も復元される

### P3 — 子ども向けUI(2日)
- タップ領域は最低64px。指が太くても押せること
- 文字は最小限、ひらがな、アイコン主体
- 誤操作で全部消えない。「ぜんぶけす」は確認を挟む
- 横向き/縦向き両対応。タブレットでの利用を想定
- **受け入れ**:大人が説明せずに使い始められる

### P4 — PWA化(半日)
- **受け入れ**:機内モードでホーム画面から起動し、全機能が動く

### P5 — お楽しみ
- コーデを複数保存、スクリーンショット、背景切替、ポーズ切替
- ここはお子さんに要望を聞いてから決める

---

## 7. 未確定事項

| 項目 | 状態 |
|---|---|
| 無料のStandard版に全パーツが入るか | 未確認。サイトに「60〜70%が無料」との記述あり。実際にDLして確認 |
| 衣装パーツに胴体が含まれるか | 更新履歴からの推測。P0で確認 |
| ベースキャラと衣装のボーン名の一致 | P0の最重要確認項目 |
| 髪テクスチャが色替えに向くか | 暗い色のテクスチャだと乗算では染まらない |

現代風の普段着は、このキットには含まれない。必要になったら Blender で同じリグに追加するか、テクスチャの色替えでバリエーションを増やす。

---

## 8. 参考

- Universal Base Characters — https://quaternius.com/packs/universalbasecharacters.html
- Modular Character Outfits – Fantasy — https://quaternius.com/packs/modularcharacteroutfitsfantasy.html
- itch.io(ダウンロード元) — https://quaternius.itch.io/modular-character-outfits-fantasy
- three.js — https://threejs.org/docs/
- Vite PWA — https://vite-pwa-org.netlify.app/
- glTF Transform — https://gltf-transform.dev/
