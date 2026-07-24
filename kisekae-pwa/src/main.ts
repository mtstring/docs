import { registerSW } from 'virtual:pwa-register';
import { Character } from './character';
import { Stage, ANGLES } from './scene';
import { setupDebugPanel } from './debugPanel';
import { setupUi } from './ui';
import { loadCoordinate, saveCoordinate } from './storage';
import type { Slot } from './data/catalog';

registerSW({ immediate: true });

async function boot(): Promise<void> {
  const stage = new Stage(document.getElementById('stage')!);
  const character = new Character(stage.scene, loadCoordinate());

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
    stage,
    character,
    ANGLES,
    equip: (slot: Slot, id: string) => character.equip(slot, id),
    setColor: (slot: Slot, hex: string) => character.setColor(slot, hex),
    colorOf: (slot: Slot) => character.colorOf(slot),
    compatOf: (slot: Slot) => character.slotState(slot)?.compat ?? null,
    boneCount: () => character.baseMesh?.skeleton.bones.length ?? 0,
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
