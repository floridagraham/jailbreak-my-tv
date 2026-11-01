// Reads each app's icon from your own TV and turns it into a one-color shape for the app's key.
// The shapes are written only into the build folder and go onto your TV. Any icon that can't be used stays a letter key.
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const INK = [11, 8, 32]; // --ink in app.css
const MAX_BYTES = 2000000, MAX_SIDE = 1024, WAIT_MS = 8000;
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

// Plain PNGs only, which is what TVs hand out. Returns { w, h, rgba } or null.
function readPng(buf) {
  if (buf.length < 33 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], type = buf[25], laced = buf[28];
  const ch = CHANNELS[type];
  if (depth !== 8 || !ch || laced > 1 || !w || !h || w > MAX_SIDE || h > MAX_SIDE) return null;
  const parts = [];
  let palette = null, clear = null;
  for (let at = 8; at + 8 <= buf.length;) {
    const len = buf.readUInt32BE(at), name = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + len);
    if (name === 'IDAT') parts.push(body);
    if (name === 'PLTE') palette = body;
    if (name === 'tRNS') clear = body;
    if (name === 'IEND') break;
    at += 12 + len;
  }
  // an interlaced PNG sends the picture in seven passes; a plain one is a single pass
  const passes = (laced ? ADAM7 : [[0, 0, 1, 1]]).map(([x0, y0, dx, dy]) => ({ x0, y0, dx, dy, cols: Math.ceil((w - x0) / dx), rows: Math.ceil((h - y0) / dy) })).filter((p) => p.cols > 0 && p.rows > 0);
  const size = passes.reduce((sum, p) => sum + (p.cols * ch + 1) * p.rows, 0);
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(parts), { maxOutputLength: size }); } catch (e) { return null; }
  if (raw.length !== size || (type === 3 && !palette)) return null;
  const rgba = Buffer.alloc(w * h * 4);
  let start = 0;
  for (const p of passes) {
    const row = p.cols * ch;
    let prev = Buffer.alloc(row);
    for (let r = 0; r < p.rows; r++, start += row + 1) {
      const kind = raw[start], line = raw.subarray(start + 1, start + 1 + row);
      for (let i = 0; i < row; i++) {
        const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
        let add = 0;
        if (kind === 1) add = a;
        else if (kind === 2) add = b;
        else if (kind === 3) add = (a + b) >> 1;
        else if (kind === 4) { const e = a + b - c, ea = Math.abs(e - a), eb = Math.abs(e - b), ec = Math.abs(e - c); add = ea <= eb && ea <= ec ? a : eb <= ec ? b : c; }
        else if (kind !== 0) return null;
        line[i] = (line[i] + add) & 255;
      }
      for (let col = 0; col < p.cols; col++) {
        const o = ((p.y0 + r * p.dy) * w + p.x0 + col * p.dx) * 4, i = col * ch;
        if (type === 6) line.copy(rgba, o, i, i + 4);
        else if (type === 2) { line.copy(rgba, o, i, i + 3); rgba[o + 3] = 255; }
        else if (type === 3) { const n = line[i]; if (n * 3 + 2 >= palette.length) return null; palette.copy(rgba, o, n * 3, n * 3 + 3); rgba[o + 3] = clear && n < clear.length ? clear[n] : 255; }
        else { rgba[o] = rgba[o + 1] = rgba[o + 2] = line[i]; rgba[o + 3] = type === 4 ? line[i + 1] : 255; }
      }
      prev = line;
    }
  }
  return { w, h, rgba };
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function chunk(name, body) {
  const head = Buffer.alloc(4), tail = Buffer.alloc(4), named = Buffer.concat([Buffer.from(name, 'latin1'), body]);
  let c = 0xffffffff;
  for (const b of named) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  head.writeUInt32BE(body.length);
  tail.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, named, tail]);
}
function writePng(w, h, rgba) {
  const info = Buffer.alloc(13), raw = Buffer.alloc((w * 4 + 1) * h);
  info.writeUInt32BE(w, 0);
  info.writeUInt32BE(h, 4);
  info[8] = 8;
  info[9] = 6;
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', info), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Twice the size, blended, so the shape's edges come out smooth.
function doubled({ w, h, rgba }) {
  const W = w * 2, H = h * 2, out = new Float32Array(W * H * 4);
  for (let py = 0; py < H; py++) {
    const sy = Math.min(h - 1, Math.max(0, (py + 0.5) / 2 - 0.5)), y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
    for (let px = 0; px < W; px++) {
      const sx = Math.min(w - 1, Math.max(0, (px + 0.5) / 2 - 0.5)), x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
      let alpha = 0;
      const col = [0, 0, 0];
      for (const [x, y, k] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) {
        const o = (y * w + x) * 4, a = rgba[o + 3] * k;
        alpha += a;
        for (let c = 0; c < 3; c++) col[c] += rgba[o + c] * a;
      }
      const o = (py * W + px) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = alpha ? col[c] / alpha : 0;
      out[o + 3] = alpha;
    }
  }
  return { w: W, h: H, d: out };
}

// Whatever differs from the icon's own background becomes the shape. A picture with no clear shape comes back null, so it stays a letter key.
function toShape(png) {
  const src = readPng(png);
  if (!src) return null;
  const { w, h, d } = doubled(src);
  const at = (x, y, k) => d[(y * w + x) * 4 + k];
  const inset = Math.round(h * 0.08), ring = [[], [], []];
  for (let i = inset; i < w - inset; i += 2) {
    for (const [x, y] of [[i, inset], [i, h - inset], [inset, i], [w - inset, i]]) {
      if (at(x, y, 3) > 200) for (let k = 0; k < 3; k++) ring[k].push(at(x, y, k));
    }
  }
  const bg = ring.map((r) => { r.sort((a, b) => a - b); return r.length ? r[r.length >> 1] : 0; });
  const edge = Math.round(h * 0.03), out = Buffer.alloc(w * h * 4);
  let solid = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = INK[0];
      out[o + 1] = INK[1];
      out[o + 2] = INK[2];
      if (y < edge || y >= h - edge || x < edge || x >= w - edge) continue;
      const dist = Math.hypot(at(x, y, 0) - bg[0], at(x, y, 1) - bg[1], at(x, y, 2) - bg[2]) * at(x, y, 3) / 255;
      out[o + 3] = Math.round(Math.min(1, Math.max(0, (dist - 45) / 60)) * 255);
      if (out[o + 3] > 127) solid++;
    }
  }
  const share = solid / (w * h);
  if (share < 0.01 || share > 0.6) return null;
  return writePng(w, h, out);
}

// Only ever asks your TV's own address. Answers null if it can't get the picture.
function fetchFromTv(address, host) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(address); } catch (e) { return resolve(null); }
    if (u.hostname !== host || (u.protocol !== 'https:' && u.protocol !== 'http:')) return resolve(null);
    // the TV's certificate is its own, so it can't be checked against a public authority; the address check above keeps this to your TV
    const req = (u.protocol === 'https:' ? https : http).get(u, { rejectUnauthorized: false, agent: false, timeout: WAIT_MS }, (res) => {
      if (res.statusCode !== 200) { req.destroy(); return resolve(null); }
      const parts = [];
      let size = 0;
      res.on('data', (b) => { size += b.length; if (size > MAX_BYTES) { req.destroy(); resolve(null); } else parts.push(b); });
      res.on('end', () => resolve(Buffer.concat(parts)));
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// Fills in app.icon for each app it could make a shape for, and returns how many.
async function addIcons(apps, launchPoints, host, appDir) {
  const byKey = new Map(launchPoints.filter(Boolean).map((p) => [p.launchPointId || p.id, p]));
  const dir = path.join(appDir, 'data', 'icons-ink'), used = new Set();
  let made = 0;
  for (const app of apps) {
    const key = app.launchPointId || app.id, p = byKey.get(key), address = p && (p.largeIcon || p.icon);
    if (!address) continue;
    const png = await fetchFromTv(address, host);
    const shape = png && toShape(png);
    if (!shape) continue;
    const base = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = base + '_' + n;
    used.add(name.toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.png'), shape);
    app.icon = 'data/icons/' + name + '.png'; // the app reads this as data/icons-ink/
    made++;
  }
  return made;
}

module.exports = { addIcons, toShape, fetchFromTv, readPng };
