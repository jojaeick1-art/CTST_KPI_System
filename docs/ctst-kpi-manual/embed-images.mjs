/**
 * PNG를 index.html 에 data URL 로 넣어 한 파일만 공유할 수 있는 index.html 로 출력합니다.
 * 사용: docs/ctst-kpi-manual 폴더에서 node embed-images.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "index-src.html");
const outPath = path.join(__dirname, "index.html");
const capDir = path.join(__dirname, "assets", "captures");

if (!fs.existsSync(htmlPath)) {
  console.error("먼저 index-src.html 을 작성해 두세요.");
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, "utf8");
const pngs = fs.readdirSync(capDir).filter((f) => f.endsWith(".png"));

for (const name of pngs) {
  const full = path.join(capDir, name);
  const b64 = fs.readFileSync(full).toString("base64");
  const needle = `src="assets/captures/${name}"`;
  if (!html.includes(needle)) {
    console.warn("skip (참조 없음):", name);
    continue;
  }
  html = html.split(needle).join(`src="data:image/png;base64,${b64}"`);
}

fs.writeFileSync(outPath, html, "utf8");
console.log(
  `OK: wrote ${path.relative(process.cwd(), outPath)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB)`
);
