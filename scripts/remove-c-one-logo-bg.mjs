/**
 * public/c-one logo.png — 연결된 검정(배경) 픽셀만 투명 처리.
 * 로고 본체(청색·은회색)는 가장자리와 끊겨 있어야 안전합니다.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.join(__dirname, "..", "public", "c-one logo.png");

if (!fs.existsSync(logoPath)) {
  console.error("파일 없음:", logoPath);
  process.exit(1);
}

const { data, info } = await sharp(logoPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const bytes = new Uint8Array(data);
const visited = new Uint8Array(w * h);

/** 배경으로 간주할 먹색·검정 (은회 글자·청색 로고와 구분) */
function isBgLike(r, g, b) {
  const sum = r + g + b;
  if (sum > 135) return false;
  if (r < 48 && g < 48 && b < 48) return true;
  if (sum < 95 && Math.max(r, g, b) < 65) return true;
  return false;
}

const queue = [];
function push(x, y) {
  queue.push(x, y);
}

function seed(x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const p = y * w + x;
  if (visited[p]) return;
  const i = (y * w + x) * 4;
  if (!isBgLike(bytes[i], bytes[i + 1], bytes[i + 2])) return;
  visited[p] = 1;
  push(x, y);
}

for (let x = 0; x < w; x++) {
  seed(x, 0);
  seed(x, h - 1);
}
for (let y = 0; y < h; y++) {
  seed(0, y);
  seed(w - 1, y);
}

while (queue.length > 0) {
  const y = queue.pop();
  const x = queue.pop();
  const i = (y * w + x) * 4;
  bytes[i + 3] = 0;

  const nbs = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];
  for (const [nx, ny] of nbs) {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const p = ny * w + nx;
    if (visited[p]) continue;
    const j = (ny * w + nx) * 4;
    if (isBgLike(bytes[j], bytes[j + 1], bytes[j + 2])) {
      visited[p] = 1;
      push(nx, ny);
    }
  }
}

await sharp(Buffer.from(bytes), {
  raw: { width: w, height: h, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toFile(logoPath + ".tmp");

fs.renameSync(logoPath + ".tmp", logoPath);
console.log("처리 완료:", logoPath);
