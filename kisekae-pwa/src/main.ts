import { registerSW } from 'virtual:pwa-register';
import { Character } from './character';
import { Stage, ANGLES } from './scene';
import { setupDebugPanel } from './debugPanel';
import { setupUi } from './ui';
import { setupVrmUi } from './vrmUi';
import { VrmCharacter } from './vrmCharacter';
import { loadCoordinate, loadSavedOutfits, saveCoordinate } from './storage';
import { renderThumbnail } from './thumbnail';
import {
  CATALOG,
  VRM_CHARACTERS,
  type ColorTarget,
  type FacePart,
  type Slot,
  type VrmCharacterDef,
} from './data/catalog';

registerSW({ immediate: true });

/**
 * `?vrm=/models/vrm/foo.vrm` で、カタログに登録していない VRM を直接開ける。
 * VRoid から書き出すたびにコードを触らず確認するための入口。複数指定可。
 */
function vrmFromQuery(): VrmCharacterDef[] {
  const params = new URLSearchParams(location.search);
  return params.getAll('vrm').map((file, i) => ({
    id: `query-${i}`,
    label: decodeURIComponent(file.split('/').pop() ?? `みほん${i + 1}`).replace(/\.vrm$/i, ''),
    file,
  }));
}

async function boot(): Promise<void> {
  const stage = new Stage(document.getElementById('stage')!);
  const vrms = [...vrmFromQuery(), ...VRM_CHARACTERS];
  // VRM が1件でもあれば VRM モード。無ければサンプルのモジュラーGLBで動く
  await (vrms.length ? bootVrm(stage, vrms) : bootModular(stage));
}

/** VRoid の VRM を丸ごとキャラとして表示するモード */
async function bootVrm(stage: Stage, vrms: VrmCharacterDef[]): Promise<void> {
  const character = new VrmCharacter(stage.scene);
  stage.onTick((dt) => character.update(dt));

  const pick = async (def: VrmCharacterDef) => {
    await character.show(def);
    stage.fitCharacter(character.boundingBox());
  };

  await pick(vrms[0]!);
  setupVrmUi(stage, character, pick, vrms);

  (window as any).__KISEKAE__ = {
    mode: 'vrm',
    stage,
    character,
    ANGLES,
    vrms,
    pickVrm: (id: string) => {
      const def = vrms.find((c) => c.id === id);
      if (!def) throw new Error(`不明なキャラ: ${id}`);
      return pick(def);
    },
    vrmSummary: () => character.summary(),
    ready: true,
  };
}

/** サンプル素材(頭+髪+衣装のGLB)を組み合わせるモード */
async function bootModular(stage: Stage): Promise<void> {
  const character = new Character(stage.scene, loadCoordinate());
  stage.setBackground(character.coordinate.background);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshDebug: () => void = () => {};
  character.onChange = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCoordinate(character.coordinate), 300);
    refreshDebug();
  };

  await character.init();

  refreshDebug = setupDebugPanel(character);
  setupUi(stage, character);

  // ヘッドレス検証・デバッグ用フック(scripts/p0-check.mjs が参照)
  (window as any).__KISEKAE__ = {
    mode: 'modular',
    stage,
    character,
    ANGLES,
    equip: (slot: Slot, id: string) => character.equip(slot, id),
    setColor: (target: ColorTarget, hex: string) => character.setColor(target, hex),
    setFace: (part: FacePart, id: string) => character.setFace(part, id),
    colorOf: (target: ColorTarget) => character.colorOf(target),
    visibleFaceMeshes: (part: FacePart) => character.visibleFaceMeshes(part),
    debugMeshes: () => character.debugMeshes(),
    applyCoordinate: (c: unknown) => character.apply(c as never),
    compatOf: (slot: Slot) => character.slotState(slot)?.compat ?? null,
    boneCount: () => character.baseMesh?.skeleton.bones.length ?? 0,
    savedOutfits: () => loadSavedOutfits(),
    catalog: () => CATALOG.map(({ id, slot, label }) => ({ id, slot, label })),
    renderThumbnail: (itemId: string, opts?: Record<string, unknown>) =>
      renderThumbnail(stage, character, itemId, opts ?? {}),
    ready: true,
  };
}

boot().catch((e) => {
  console.error(e);
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:auto 8px 8px 8px;background:#fee;color:#900;padding:12px;border-radius:8px;z-index:99;font-size:12px';
  el.textContent = `よみこみエラー: ${e?.message ?? e}`;
  document.body.appendChild(el);
});
