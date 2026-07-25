import { Group, Mesh, Object3D, Scene, SkinnedMesh } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { ColorTarget, Coordinate, FacePart, Item, Slot } from './data/catalog';
import { FACE_MESH_PREFIX, MOUTH_COLOR, itemById } from './data/catalog';
import { attachToBase, checkBoneCompat, inventory, type BoneCompat, type GlbInventory } from './rig';
import { colorOfTree, tintTree } from './tint';

export interface SlotState {
  item: Item;
  /** シーンに追加済みのオブジェクト(スロット解除時に取り除く対象) */
  meshes: Object3D[];
  inventory: GlbInventory;
  compat: BoneCompat | null; // head はベース自身なので null
}

// scripts/optimize-assets.mjs は meshopt 圧縮で書き出すため、デコーダを繋いでおく。
// 非圧縮の GLB はデコーダを設定していても問題なく読める。
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltfCache = new Map<string, Promise<GLTF>>();

function loadGltf(file: string): Promise<GLTF> {
  let p = gltfCache.get(file);
  if (!p) {
    p = loader.loadAsync(file);
    gltfCache.set(file, p);
  }
  return p;
}

/**
 * キャラクター本体。
 * 構成(PLAN §4.1): 頭=ベースキャラ由来、髪/衣装=同一リグのパーツを
 * ベースのボーンに参照し直して装着する。
 */
export class Character {
  readonly root = new Group();
  private base: SkinnedMesh | null = null;
  private readonly slots = new Map<Slot, SlotState>();
  private coord: Coordinate;
  onChange: (() => void) | null = null;

  constructor(scene: Scene, initial: Coordinate) {
    this.coord = initial;
    this.root.name = 'Character';
    scene.add(this.root);
  }

  get coordinate(): Coordinate {
    return this.coord;
  }

  get baseMesh(): SkinnedMesh | null {
    return this.base;
  }

  slotState(slot: Slot): SlotState | undefined {
    return this.slots.get(slot);
  }

  allSlotStates(): [Slot, SlotState][] {
    return [...this.slots.entries()];
  }

  /** 初期コーデを一括で装着する */
  async init(): Promise<void> {
    const headId = this.coord.items.head;
    if (!headId) throw new Error('コーデに head がありません');
    await this.equipHead(headId);

    for (const slot of ['hair', 'outfit', 'shoes', 'accessory'] as Slot[]) {
      const id = this.coord.items[slot];
      if (id) await this.equip(slot, id, { silent: true });
    }
    this.applyAll();
    this.onChange?.();
  }

  /** 保存済みコーデを丸ごと適用する(コーデ呼び出し・リセット用) */
  async apply(next: Coordinate): Promise<void> {
    this.coord = structuredClone(next);

    for (const slot of ['hair', 'outfit', 'shoes', 'accessory'] as Slot[]) {
      const id = this.coord.items[slot];
      if (id) {
        await this.equip(slot, id, { silent: true });
      } else {
        this.unequip(slot);
      }
    }
    this.applyAll();
    this.onChange?.();
  }

  /** ベース(頭+スケルトン)を読み込む。スケルトンの供給元でもある */
  private async equipHead(itemId: string): Promise<void> {
    const item = itemById(itemId);
    if (!item) throw new Error(`不明なアイテム: ${itemId}`);

    const gltf = await loadGltf(item.file);
    const cloned = SkeletonUtils.clone(gltf.scene);

    let firstSkinned: SkinnedMesh | null = null;
    cloned.traverse((obj) => {
      const sm = obj as SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.frustumCulled = false;
        firstSkinned ??= sm;
      }
    });
    if (!firstSkinned) throw new Error(`${item.file} に SkinnedMesh がありません`);

    this.root.add(cloned);
    this.base = firstSkinned;
    this.slots.set('head', {
      item,
      meshes: [cloned],
      inventory: inventory(cloned),
      compat: null,
    });
    this.coord.items.head = itemId;
  }

  /** パーツを装着する(同スロットの既存パーツは外す) */
  async equip(slot: Slot, itemId: string, opts: { silent?: boolean } = {}): Promise<BoneCompat> {
    if (slot === 'head') throw new Error('head の差し替えは未対応');
    if (!this.base) throw new Error('ベース未読込');

    const item = itemById(itemId);
    if (!item || item.slot !== slot) throw new Error(`不明なアイテム: ${itemId}`);

    const gltf = await loadGltf(item.file);
    const partRoot = SkeletonUtils.clone(gltf.scene);

    const compat = checkBoneCompat(partRoot, this.base);
    if (!compat.ok) {
      // 装着せず結果だけ返す。デバッグパネルに NG として出す
      console.error(`[${item.id}] ボーン不一致:`, compat.missing);
      return compat;
    }

    const inv = inventory(partRoot);
    this.unequip(slot);
    const attached = attachToBase(partRoot, this.base);
    this.slots.set(slot, { item, meshes: attached, inventory: inv, compat });
    this.coord.items[slot] = itemId;

    const color = this.coord.colors[slot];
    if (item.tintable && color) {
      attached.forEach((m) => tintTree(m, color, item.tintMaterials));
    }

    if (!opts.silent) this.onChange?.();
    return compat;
  }

  unequip(slot: Slot): void {
    const state = this.slots.get(slot);
    if (!state) return;
    state.meshes.forEach((m) => m.parent?.remove(m));
    this.slots.delete(slot);
    delete this.coord.items[slot];
  }

  /** 色を変更する。眉は髪色に追従させる */
  setColor(target: ColorTarget, hex: string): void {
    if (target === 'skin') this.coord.skin = hex;
    else if (target === 'eye') this.coord.eyeColor = hex;
    else this.coord.colors[target] = hex;

    this.paint(target, hex);
    if (target === 'hair') this.paintFaceMaterial('Brow', hex);
    this.onChange?.();
  }

  /** 顔パーツのバリエーションを切り替える(該当メッシュだけ visible にする) */
  setFace(part: FacePart, variantId: string): void {
    this.coord.face[part] = variantId;
    this.applyFaceVisibility();
    this.onChange?.();
  }

  private applyFaceVisibility(): void {
    const head = this.slots.get('head');
    if (!head) return;

    for (const [part, prefix] of Object.entries(FACE_MESH_PREFIX) as [FacePart, string][]) {
      const selected = `${prefix}_${this.coord.face[part]}`;
      head.meshes.forEach((root) =>
        root.traverse((obj) => {
          if (!(obj as Mesh).isMesh) return;
          if (!obj.name.startsWith(`${prefix}_`)) return;
          obj.visible = obj.name.startsWith(selected);
        }),
      );
    }
  }

  /** コーデの色・顔をすべて反映する */
  private applyAll(): void {
    this.paint('skin', this.coord.skin);
    this.paint('eye', this.coord.eyeColor);
    this.paintFaceMaterial('Mouth', MOUTH_COLOR);
    for (const [slot, hex] of Object.entries(this.coord.colors) as [Slot, string][]) {
      this.paint(slot, hex);
    }
    this.paintFaceMaterial('Brow', this.coord.colors.hair ?? '#8d5a2b');
    this.applyFaceVisibility();
  }

  private paint(target: ColorTarget, hex: string): void {
    if (target === 'skin') {
      // 頭だけでなく、衣装側に含まれる肌パーツ(手など)も一緒に塗る
      this.slots.forEach((state) =>
        state.meshes.forEach((m) => tintTree(m, hex, ['Skin'])),
      );
      return;
    }
    if (target === 'eye') {
      this.paintFaceMaterial('Eye', hex);
      return;
    }
    const state = this.slots.get(target);
    if (state?.item.tintable) {
      state.meshes.forEach((m) => tintTree(m, hex, state.item.tintMaterials));
    }
  }

  private paintFaceMaterial(materialPrefix: string, hex: string): void {
    const head = this.slots.get('head');
    head?.meshes.forEach((m) => tintTree(m, hex, [materialPrefix]));
  }

  /** 検証用: 対象の現在色 */
  colorOf(target: ColorTarget): string | null {
    if (target === 'skin' || target === 'eye') {
      const head = this.slots.get('head');
      if (!head) return null;
      const prefix = target === 'skin' ? 'Skin' : 'Eye';
      for (const root of head.meshes) {
        const c = colorOfTree(root, [prefix]);
        if (c) return c;
      }
      return null;
    }
    const state = this.slots.get(target);
    if (!state) return null;
    for (const root of state.meshes) {
      const c = colorOfTree(root, state.item.tintMaterials);
      if (c) return c;
    }
    return null;
  }

  /** 検証用: 全メッシュの名前 → { マテリアル名, 色, 表示 } */
  debugMeshes(): Record<string, { material: string; color: string; visible: boolean }> {
    const out: Record<string, { material: string; color: string; visible: boolean }> = {};
    this.slots.forEach((state) =>
      state.meshes.forEach((root) =>
        root.traverse((obj) => {
          const mesh = obj as Mesh;
          if (!mesh.isMesh) return;
          const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as {
            name?: string;
            color?: { getHexString(): string };
          };
          out[obj.name] = {
            material: m?.name ?? '',
            color: m?.color ? `#${m.color.getHexString()}` : '',
            visible: obj.visible,
          };
        }),
      ),
    );
    return out;
  }

  /** 検証用: 顔パーツの表示状態 */
  visibleFaceMeshes(part: FacePart): string[] {
    const head = this.slots.get('head');
    if (!head) return [];
    const prefix = FACE_MESH_PREFIX[part];
    const names: string[] = [];
    head.meshes.forEach((root) =>
      root.traverse((obj) => {
        if ((obj as Mesh).isMesh && obj.name.startsWith(`${prefix}_`) && obj.visible) {
          names.push(obj.name);
        }
      }),
    );
    return names;
  }
}
