"use strict";
// Minimal PNG reader for the brand-asset tests. Hand-rolled (node:zlib only) to keep the
// repo dependency-free, same reasoning as the hand-rolled ZIP writer in scripts/build.mjs.
// Handles what our icons actually are: 8-bit, non-interlaced, grey/RGB/RGBA. Anything
// else throws loudly rather than being silently mis-decoded.
const zlib = require("node:zlib");

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }; // colorType -> samples per pixel

// -> { width, height, channels, data } with `data` as tightly packed 8-bit samples.
function decodePng(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth} (expected 8)`);
  if (interlace !== 0) throw new Error("unsupported interlaced PNG");
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const idat = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len; // length + type + data + CRC
  }
  if (!idat.length) throw new Error("PNG has no IDAT data");

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error("truncated PNG scanlines");

  // Undo the per-scanline filters (PNG spec §9). Each output row depends on the row above,
  // so this has to run top-to-bottom.
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0; // left
      const b = prev[x];                               // up
      const c = x >= channels ? prev[x - channels] : 0; // up-left
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`);
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  return { width, height, channels, data: out };
}

// Share of the icon's opaque pixels within `tolerance` (Euclidean RGB distance) of `rgb`.
// Opaque-only so a transparent-cornered toolbar icon and an opaque store icon — which is
// the only difference the store forces on us — still measure the same.
function colorShare(img, rgb, tolerance = 48) {
  const { width, height, channels, data } = img;
  let opaque = 0;
  let near = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    let r, g, b, a = 255;
    if (channels >= 3) {
      r = data[o]; g = data[o + 1]; b = data[o + 2];
      if (channels === 4) a = data[o + 3];
    } else {
      r = g = b = data[o];
      if (channels === 2) a = data[o + 1];
    }
    if (a < 250) continue;
    opaque++;
    if (Math.hypot(r - rgb[0], g - rgb[1], b - rgb[2]) <= tolerance) near++;
  }
  return opaque ? near / opaque : 0;
}

module.exports = { decodePng, colorShare };
