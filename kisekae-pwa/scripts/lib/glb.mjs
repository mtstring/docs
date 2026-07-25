/**
 * GLB(および .vrm)のチャンク分解・再構築。
 * .vrm は「VRMC_vrm 拡張を持つ GLB」なので、同じコードで扱える。
 *
 * GLB の構造:
 *   ヘッダ 12B  : magic 'glTF' / version / 全長
 *   チャンク*   : length(4B) / type(4B) / data(4Bパディング)
 *     - type 'JSON' … glTF の JSON
 *     - type 'BIN\0' … バイナリバッファ
 */
const MAGIC = 0x46546c67; // 'glTF'
const JSON_TYPE = 0x4e4f534a; // 'JSON'
const BIN_TYPE = 0x004e4942; // 'BIN\0'

export function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== MAGIC) {
    throw new Error('GLB ではありません(magic 不一致)。glTF+bin 形式なら .glb に変換してください');
  }

  const total = view.getUint32(8, true);
  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === JSON_TYPE) {
      json = JSON.parse(new TextDecoder().decode(buffer.subarray(start, start + length)));
    } else if (type === BIN_TYPE) {
      bin = buffer.subarray(start, start + length);
    }
    offset = start + length;
  }

  if (!json) throw new Error('JSON チャンクが見つかりません');
  return { json, bin };
}

const pad4 = (n) => (n + 3) & ~3;

export function buildGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.alloc(pad4(jsonBytes.length), 0x20); // JSON は空白で詰める
  jsonBytes.copy(jsonPadded);

  const chunks = [chunk(JSON_TYPE, jsonPadded)];
  if (bin?.length) {
    const binPadded = Buffer.alloc(pad4(bin.length), 0); // BIN は 0 で詰める
    Buffer.from(bin).copy(binPadded);
    chunks.push(chunk(BIN_TYPE, binPadded));
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(data.length, 0);
  head.writeUInt32LE(type, 4);
  return Buffer.concat([head, data]);
}

/** ノード名 → インデックス。同名が複数ある場合は最初のものを採る */
export function nodeIndexByName(json) {
  const map = new Map();
  (json.nodes ?? []).forEach((n, i) => {
    if (n.name != null && !map.has(n.name)) map.set(n.name, i);
  });
  return map;
}
