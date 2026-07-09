// アイコン再生成用の一回限りのスクリプト。実行前に: npm install --no-save sharp
// node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const INK = "#1F2933";
const SHU = "#C73E3A";

mkdirSync("public/icons", { recursive: true });

function svg(size, { padding = 0, bg = INK, fg = SHU } = {}) {
  const glyphSize = Math.round(size * (1 - padding * 2) * 0.62);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <text x="50%" y="53%" text-anchor="middle" dominant-baseline="central"
    font-family="'Hiragino Mincho ProN','Yu Mincho',serif" font-weight="700"
    font-size="${glyphSize}" fill="${fg}">朱</text>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, opts: {} },
  { file: "icon-512.png", size: 512, opts: {} },
  { file: "icon-512-maskable.png", size: 512, opts: { padding: 0.15 } },
  { file: "apple-touch-icon.png", size: 180, opts: {} },
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t.size, t.opts)))
    .png()
    .toFile(`public/icons/${t.file}`);
  console.log("wrote", t.file);
}

// favicon
await sharp(Buffer.from(svg(64, {})))
  .png()
  .toFile("public/favicon.png");
console.log("wrote favicon.png");
