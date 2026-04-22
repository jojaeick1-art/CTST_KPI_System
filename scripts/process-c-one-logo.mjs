/**
 * public/c-one logo.png 처리:
 * 1) 코너 샘플 기준 배경(흰색) 연결 영역을 투명 처리
 * 2) 알파가 남은 영역의 최소 둘레 박스로 크롭 (글자 안 잘리게 소량 패딩)
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.join(__dirname, "..", "public", "c-one logo.png");

const PAD = 2;

async function main() {
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

  let sumR = 0,
    sumG = 0,
    sumB = 0,
    n = 0;
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  for (const [cx, cy] of corners) {
    const i = (cy * w + cx) * 4;
    sumR += bytes[i];
    sumG += bytes[i + 1];
    sumB += bytes[i + 2];
    n++;
  }
  const br = Math.round(sumR / n);
  const bg = Math.round(sumG / n);
  const bb = Math.round(sumB / n);

  const tol = 28;

  function matchesBg(r, g, b) {
    return (
      Math.abs(r - br) <= tol &&
      Math.abs(g - bg) <= tol &&
      Math.abs(b - bb) <= tol
    );
  }

  const visited = new Uint8Array(w * h);
  const queue = [];

  function push(x, y) {
    queue.push(x, y);
  }

  function seed(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const i = (y * w + x) * 4;
    const r = bytes[i],
      g = bytes[i + 1],
      b = bytes[i + 2];
    if (!matchesBg(r, g, b)) return;
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
      const r = bytes[j],
        g = bytes[j + 1],
        b = bytes[j + 2];
      if (matchesBg(r, g, b)) {
        visited[p] = 1;
        push(nx, ny);
      }
    }
  }

  /** 글자 구멍 등 배경과 안 닿는 흰색 제거 (거의 순백만) */
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = bytes[i],
        g = bytes[i + 1],
        b = bytes[i + 2];
      if (r >= 249 && g >= 249 && b >= 249) {
        bytes[i + 3] = 0;
      }
    }
  }

  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (bytes[i + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    console.error("내용물을 찾지 못했습니다.");
    process.exit(1);
  }

  minX = Math.max(0, minX - PAD);
  minY = Math.max(0, minY - PAD);
  maxX = Math.min(w - 1, maxX + PAD);
  maxY = Math.min(h - 1, maxY + PAD);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  await sharp(Buffer.from(bytes), {
    raw: { width: w, height: h, channels: 4 },
  })
    .extract({ left: minX, top: minY, width: cw, height: ch })
    .png({ compressionLevel: 9 })
    .toFile(logoPath + ".tmp");

  fs.renameSync(logoPath + ".tmp", logoPath);
  console.log(
    `완료: ${cw}x${ch} 로 크롭, 배경 투명 처리 → ${logoPath}`
  );
}

await main();
