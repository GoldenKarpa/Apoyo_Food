/**
 * Generates the PWA / favicon icon set from the Sobremesa palette.
 *
 * These are PLACEHOLDER ART for the Slice 1 PWA stub — a plate mark drawn from
 * architecture Part F3's own tokens (green anchor, cream plate, gold-vivid
 * food, teal freshness dot), not a brand logo. Slice 12 finalises the PWA and
 * is the natural point to swap in real artwork; re-run `npm run icons:generate`
 * after changing anything here.
 *
 * Written as a dependency-free PNG encoder on purpose: `sharp` is not a
 * dependency until Slice 4, and adding an image library early just to draw four
 * circles would pull the Slice 4 decision (and its version pin) forward for no
 * reason. Node's own zlib is all a valid 8-bit RGBA PNG needs.
 *
 * Run: npm run icons:generate
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Part F3 tokens. Kept as literals rather than parsed out of globals.css so this
// script has no build-order dependency; if the palette changes, change both.
const GREEN = [83, 109, 70]; //     --green         #536D46
const CREAM = [244, 238, 225]; //   --cream-bg      #F4EEE1
const GOLD_VIVID = [221, 162, 74]; //--gold-vivid   #DDA24A
const TEAL_VIVID = [78, 140, 134]; //--teal-vivid   #4E8C86

const SS = 4; // supersampling factor — the whole anti-aliasing strategy

/** Signed-distance helpers, evaluated per supersample in unit (0..1) space. */
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function inRoundedSquare(x, y, radius) {
  if (radius <= 0) return true;
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
}

/**
 * @param size    output edge length in px
 * @param corner  corner radius in unit space (0 = full-bleed square, for
 *                maskable icons and iOS, which apply their own masking)
 * @param scale   content scale — maskable icons must keep their content inside
 *                the 80%-diameter safe zone, so everything shrinks toward centre
 */
function drawIcon(size, corner, scale) {
  const px = size * SS;
  const rgba = Buffer.alloc(px * px * 4);

  // Geometry in unit space, then scaled about the centre.
  const s = (v) => 0.5 + (v - 0.5) * scale;
  const r = (v) => v * scale;
  const plate = { cx: s(0.5), cy: s(0.5), r: r(0.32) };
  const food = { cx: s(0.5), cy: s(0.5), r: r(0.17) };
  const fresh = { cx: s(0.71), cy: s(0.29), r: r(0.062) };

  for (let py = 0; py < px; py++) {
    for (let pxi = 0; pxi < px; pxi++) {
      const x = (pxi + 0.5) / px;
      const y = (py + 0.5) / px;
      const i = (py * px + pxi) * 4;

      if (!inRoundedSquare(x, y, corner)) {
        rgba[i + 3] = 0; // transparent outside the rounded square
        continue;
      }

      let colour = GREEN;
      if (inCircle(x, y, fresh.cx, fresh.cy, fresh.r)) colour = TEAL_VIVID;
      else if (inCircle(x, y, food.cx, food.cy, food.r)) colour = GOLD_VIVID;
      else if (inCircle(x, y, plate.cx, plate.cy, plate.r)) colour = CREAM;

      rgba[i] = colour[0];
      rgba[i + 1] = colour[1];
      rgba[i + 2] = colour[2];
      rgba[i + 3] = 255;
    }
  }

  // Box-downsample the supersampled buffer — this is what anti-aliases every
  // circle edge and the rounded corners.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * px + (x * SS + sx)) * 4;
          const a = rgba[i + 3] / 255;
          acc[0] += rgba[i] * a;
          acc[1] += rgba[i + 1] * a;
          acc[2] += rgba[i + 2] * a;
          acc[3] += a;
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      // Un-premultiply so edge pixels keep their colour instead of darkening
      // toward black as alpha falls off.
      const alpha = acc[3] / n;
      out[o] = alpha > 0 ? Math.round(acc[0] / acc[3]) : 0;
      out[o + 1] = alpha > 0 ? Math.round(acc[1] / acc[3]) : 0;
      out[o + 2] = alpha > 0 ? Math.round(acc[2] / acc[3]) : 0;
      out[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

// --- Minimal PNG encoder (8-bit RGBA, filter type 0) ---------------------

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10/11/12 = compression 0, filter 0, interlace 0 — already zeroed.

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None) for every scanline
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Outputs -------------------------------------------------------------

const targets = [
  // Manifest icons (public/) — "any" purpose keeps the rounded-square silhouette.
  { path: "public/icons/icon-192.png", size: 192, corner: 0.22, scale: 1 },
  { path: "public/icons/icon-512.png", size: 512, corner: 0.22, scale: 1 },
  // Maskable: full-bleed, content inside the 80% safe zone so Android's own
  // mask (circle, squircle, teardrop…) can never crop the mark.
  { path: "public/icons/icon-maskable-512.png", size: 512, corner: 0, scale: 0.72 },
  // File-based metadata icons Next.js picks up automatically.
  { path: "app/icon.png", size: 512, corner: 0.22, scale: 1 },
  // iOS applies its own corner mask, so this one is full-bleed too.
  { path: "app/apple-icon.png", size: 180, corner: 0, scale: 0.86 },
];

for (const t of targets) {
  const file = join(ROOT, t.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(drawIcon(t.size, t.corner, t.scale), t.size));
  console.log(`wrote ${t.path} (${t.size}x${t.size})`);
}
