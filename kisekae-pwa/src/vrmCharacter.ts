import { Box3, Group, Scene, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { loadVrm, summarizeVrm, type VrmSummary } from './vrm';
import type { VrmCharacterDef } from './data/catalog';

/**
 * VRM を丸ごと1体のキャラとして扱うモード。
 *
 * VRoid Studio は「服を着た状態のキャラ」を1ファイルで書き出すため、
 * まずは VRM 単位の切り替えとして動かす。
 * メッシュ単位の着せ替え(髪だけ/服だけ差し替え)は、実物の
 * メッシュ構成を `npm run inspect:vrm` で確認してから設計する。
 */
export class VrmCharacter {
  readonly root = new Group();
  private current: VRM | null = null;
  private currentId: string | null = null;
  onChange: (() => void) | null = null;

  constructor(scene: Scene) {
    this.root.name = 'VrmCharacter';
    scene.add(this.root);
  }

  get vrm(): VRM | null {
    return this.current;
  }

  get id(): string | null {
    return this.currentId;
  }

  async show(def: VrmCharacterDef): Promise<VRM> {
    const vrm = await loadVrm(def.file);

    if (this.current) this.root.remove(this.current.scene);
    this.root.add(vrm.scene);
    this.current = vrm;
    this.currentId = def.id;

    this.onChange?.();
    return vrm;
  }

  /** 揺れ物・表情の更新。毎フレーム呼ぶ */
  update(dt: number): void {
    this.current?.update(dt);
  }

  /** 足元から頭頂までを含む箱。カメラ合わせに使う */
  boundingBox(): Box3 {
    const box = new Box3();
    if (this.current) box.setFromObject(this.current.scene);
    else box.set(new Vector3(-0.3, 0, -0.3), new Vector3(0.3, 1.5, 0.3));
    return box;
  }

  summary(): VrmSummary | null {
    return this.current ? summarizeVrm(this.current) : null;
  }
}
