// cutest-picture-01 entry: copies the artwork that sits beside this script (art.png, else art.jpg) unchanged
// to entry.png in the output directory, after checking it against the contest's file rules: a PNG or JPEG
// signature, at most 1 MiB, and at most 1024 x 1024 pixels. If a check fails it writes nothing and exits 1.
//
// Output goes to $MAKEFUN_OUTPUT_DIR if set, otherwise /output. To run locally (Node 22, no dependencies):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANDIDATES = ['art.png', 'art.jpg'];
const besideScript = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const source = CANDIDATES.map(besideScript).find((p) => existsSync(p));
if (!source) {
  console.error('main.ts: no art.png or art.jpg next to this script');
  process.exit(1);
}

const MAX_BYTES = 1048576;
const MAX_SIDE = 1024;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(why: string): never {
  console.error(`main.ts: ${source} is not a valid entry: ${why}`);
  process.exit(1);
}

// Width and height from the PNG IHDR chunk, which must come first.
function pngSize(b: Buffer): [number, number] {
  if (b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') fail('PNG has no IHDR chunk');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// Width and height from the first JPEG SOFn segment (C0-CF, except DHT C4, JPG C8 and DAC CC).
function jpegSize(b: Buffer): [number, number] {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) fail(`JPEG marker expected at byte ${i}`);
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // no length
    if (marker === 0xd9 || marker === 0xda) break; // end of image or start of scan
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof && i + 9 <= b.length) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  fail('JPEG has no SOFn segment before the image data');
}

const bytes = readFileSync(source);
if (bytes.length > MAX_BYTES) fail(`${bytes.length} bytes, more than ${MAX_BYTES}`);
let size: [number, number];
if (bytes.subarray(0, 8).equals(PNG_SIG)) size = pngSize(bytes);
else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) size = jpegSize(bytes);
else fail('signature is neither PNG nor JPEG');
const [width, height] = size;
if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
  fail(`${width}x${height} pixels, outside 1..${MAX_SIDE} per side`);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
writeFileSync(join(outDir, 'entry.png'), bytes);
