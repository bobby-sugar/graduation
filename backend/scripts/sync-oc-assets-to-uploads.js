/**
 * 以仓库内 `src/assets/oc_1.jpg` … `oc_24.jpg` 为准，覆盖复制到 `backend/uploads/`，
 * 供后端静态 `/uploads/...` 与 seed 脚本使用。
 *
 * 用法（在仓库根目录或 backend 目录均可）：
 *   node backend/scripts/sync-oc-assets-to-uploads.js
 * 若 src/assets 里还没有图，可先从当前 uploads 拷一份到 src（只做缺失项）：
 *   node backend/scripts/sync-oc-assets-to-uploads.js --init-from-uploads
 */
const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(BACKEND_ROOT, "..");
const ASSETS_DIR = path.join(REPO_ROOT, "src", "assets");
const UPLOAD_DIR = path.join(BACKEND_ROOT, "uploads");
const COUNT = 24;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function initFromUploads() {
  ensureDir(ASSETS_DIR);
  let copied = 0;
  for (let n = 1; n <= COUNT; n += 1) {
    const base = `oc_${n}`;
    const destAsset = path.join(ASSETS_DIR, `${base}.jpg`);
    if (fs.existsSync(destAsset)) continue;
    const pick = [".jpg", ".jpeg", ".png", ".webp"]
      .map((ext) => ({ ext, p: path.join(UPLOAD_DIR, `${base}${ext}`) }))
      .find((x) => fs.existsSync(x.p));
    if (!pick) continue;
    fs.copyFileSync(pick.p, destAsset);
    copied += 1;
  }
  return copied;
}

function syncToUploads() {
  ensureDir(UPLOAD_DIR);
  let ok = 0;
  const missing = [];
  for (let n = 1; n <= COUNT; n += 1) {
    const name = `oc_${n}.jpg`;
    const src = path.join(ASSETS_DIR, name);
    if (!fs.existsSync(src)) {
      missing.push(n);
      continue;
    }
    fs.copyFileSync(src, path.join(UPLOAD_DIR, name));
    ok += 1;
  }
  return { ok, missing };
}

function main() {
  const init = process.argv.includes("--init-from-uploads");
  if (init) {
    const copied = initFromUploads();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ step: "init-from-uploads", copiedToSrcAssets: copied }, null, 2));
  }

  if (!fs.existsSync(ASSETS_DIR)) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: `缺少目录 ${path.relative(REPO_ROOT, ASSETS_DIR)}，请先创建并放入 oc_1.jpg … oc_${COUNT}.jpg`,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const { ok, missing } = syncToUploads();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        step: "sync-to-uploads",
        copied: ok,
        missingInSrcAssets: missing,
        assetsDir: path.relative(REPO_ROOT, ASSETS_DIR),
        uploadDir: path.relative(REPO_ROOT, UPLOAD_DIR),
      },
      null,
      2,
    ),
  );

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `警告：src/assets 中缺少 oc_${missing.join(", oc_")}.jpg，对应 uploads 未更新（仍为旧文件或不存在）。`,
    );
  }
}

main();
