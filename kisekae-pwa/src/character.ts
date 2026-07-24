import { Group, Mesh, Object3D, Scene, SkinnedMesh } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { Coordinate, Item, Slot } from './data/catalog';
import { itemById } from './data/catalog';
import { attachToBase, checkBoneCompat, inventory, type BoneCompat, type GlbInventory } from './rig';
import { tintMesh, tintTree, currentColorHex } from './tint';

export interface SlotState {
  item: Item;
  /** シーンに追加済みのメッシュ(スロット解除時に取り除く対象) */
  meshes: Object3D[];
  inventory: GlbInventory;
  compat: BoneCompat | null; // headはベース自身なのでnull
}

const loader = new GLTFLoader();
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
 * 構成(4.1参照): 頭=ベースキャラ由来、髪/衣装=同一リグのパーツを
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
      if (id) await this.equip(slot, id);
    }
    this.applyAllColors();
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
  async equip(slot: Slot, itemId: string): Promise<BoneCompat> {
    if (slot === 'head') throw new Error('head の差し替えは未対応(P5)');
    if (!this.base) throw new Error('ベース未読込');

    const item = itemById(itemId);
    if (!item || item.slot !== slot) throw new Error(`不明なアイテム: ${itemId}`);

    const gltf = await loadGltf(item.file);
    const partRoot = SkeletonUtils.clone(gltf.scene);

    const compat = checkBoneCompat(partRoot, this.base);
    if (!compat.ok) {
      // 装着せず結果だけ返す。デバッグパネルにNGとして出す
      console.error(`[${item.id}] ボーン不一致:`, compat.missing);
      return compat;
    }

    const inv = inventory(partRoot);
    this.unequip(slot);
    const attached = attachToBase(partRoot, this.base);
    this.slots.set(slot, { item, meshes: attached, inventory: inv, compat });
    this.coord.items[slot] = itemId;

    const color = this.coord.colors[slot];
    if (item.tintable && color) attached.forEach((m) => tintMesh(m as Mesh, color));

    this.onChange?.();
    return compat;
  }

  unequip(slot: Slot): void {
    const state = this.slots.get(slot);
    if (!state) return;
    state.meshes.forEach((m) => m.parent?.remove(m));
    this.slots.delete(slot);
    delete this.coord.items[slot];
  }

  /** スロットの色を変更(head の場合は肌色として扱う) */
  setColor(slot: Slot, hex: string): void {
    if (slot === 'head') {
      this.coord.skin = hex;
    } else {
      this.coord.colors[slot] = hex;
    }
    const state = this.slots.get(slot);
    if (state?.item.tintable) {
      state.meshes.forEach((m) => tintTree(m, hex));
    }
    this.onChange?.();
  }

  private applyAllColors(): void {
    if (this.coord.skin) this.setColorSilent('head', this.coord.skin);
    for (const [slot, hex] of Object.entries(this.coord.colors) as [Slot, string][]) {
      this.setColorSilent(slot, hex);
    }
  }

  private setColorSilent(slot: Slot, hex: string): void {
    const state = this.slots.get(slot);
    if (state?.item.tintable) state.meshes.forEach((m) => tintTree(m, hex));
  }

  /** 検証用: スロット先頭メッシュの現在色 */
  colorOf(slot: Slot): string | null {
    const state = this.slots.get(slot);
    if (!state) return null;
    let found: string | null = null;
    for (const root of state.meshes) {
      root.traverse((obj) => {
        if (!found && (obj as Mesh).isMesh) found = currentColorHex(obj as Mesh);
      });
      if (found) break;
    }
    return found;
  }
}
