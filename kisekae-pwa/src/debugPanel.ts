import type { Character } from './character';

/**
 * 読み込んだGLBのメッシュ名・ボーン名・マテリアル名を一覧するパネル。
 * P0の判定(ボーン包含チェック)もここに表示する。開発中ずっと使う。
 */
export function setupDebugPanel(character: Character): () => void {
  const toggle = document.getElementById('debug-toggle') as HTMLButtonElement;
  const panel = document.getElementById('debug-panel') as HTMLDivElement;

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) render();
  });

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function render(): void {
    const parts: string[] = [];
    const base = character.baseMesh;
    parts.push(
      `<h3>ベース</h3>ボーン数: ${base ? base.skeleton.bones.length : '未読込'}`,
    );

    for (const [slot, state] of character.allSlotStates()) {
      parts.push(`<h3>[${slot}] ${esc(state.item.id)} (${esc(state.item.file)})</h3>`);

      if (state.compat) {
        parts.push(
          state.compat.ok
            ? `<span class="ok">✔ ボーン包含OK (${state.compat.used.length}本すべてベースに存在)</span>`
            : `<span class="ng">✘ ボーン不一致: ${esc(state.compat.missing.join(', '))}</span>`,
        );
      }

      parts.push('メッシュ:');
      for (const m of state.inventory.meshes) {
        parts.push(
          `  ${m.skinned ? '⛓' : '·'} ${esc(m.name)} — mat: ${esc(m.material)}`,
        );
      }
      parts.push(`ボーン (${state.inventory.bones.length}): ${esc(state.inventory.bones.join(', '))}`);
      parts.push(`マテリアル: ${esc(state.inventory.materials.join(', ') || '(なし)')}`);
    }

    panel.innerHTML = parts.join('\n');
  }

  return render;
}
