/**
 * PWAアイコン生成(192px / 512px)。
 * 依存を増やさないため、PNGをNode標準のzlibで直接エンコードする。
 * デザイン: 白地にピンクの丸+ハート。
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'icons',
);

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
  // pixelAt(x, y) -> [r, g, b, a]
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ハートの内側判定(中心0,0・半径1程度の正規化座標) */
function inHeart(px, py) {
  const x = px * 1.25;
  const y = -py * 1.25 + 0.25;
  const v = x * x + y * y - 1;
  return v * v * v - x * x * y * y * y < 0;
}

function iconPixel(size) {
  const c = size / 2;
  const rOuter = size * 0.46;
  return (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const d = Math.hypot(dx, dy);
    if (d > rOuter) return [255, 255, 255, 255]; // 白地(maskable対応)
    if (inHeart(dx / (size * 0.30), dy / (size * 0.30))) return [255, 255, 255, 255];
    return [233, 145, 183, 255]; // #e991b7
  };
}

await mkdir(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = encodePng(size, iconPixel(size));
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  await writeFile(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
