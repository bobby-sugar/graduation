/**
 * 将聊天附带的约稿参考图（文件名含 commission_1- … commission_12-）复制到 backend/uploads，
 * 生成固定文件名 commission-cover-01.png … commission-cover-12.png。
 *
 * 默认从 Cursor 工程 assets 读取；也可设置环境变量 COMMISSION_COVER_SOURCE 指向目录，
 * 或将文件放入 backend/scripts/commission-covers-source/。
 *
 * 用法：node scripts/sync-commission-covers.js
 */
const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.join(__dirname, "..");
const UPLOAD_DIR = path.join(BACKEND_ROOT, "uploads");

const CANDIDATE_SOURCE_DIRS = [
  process.env.COMMISSION_COVER_SOURCE,
  path.join(__dirname, "commission-covers-source"),
  path.join(process.env.USERPROFILE || "", ".cursor", "projects", "c-Users-ROG-oc-web", "assets"),
].filter(Boolean);

function findSourceDir() {
  for (const dir of CANDIDATE_SOURCE_DIRS) {
    if (dir && fs.existsSync(dir)) {
      const ok = [1, 2, 3].some((n) => findFileForSlot(dir, n));
      if (ok) return dir;
    }
  }
  return null;
}

function findFileForSlot(dir, n) {
  const files = fs.readdirSync(dir);
  const prefix = `commission_${n}-`;
  const name = files.find((f) => f.includes(prefix) && /\.(png|jpe?g|webp)$/i.test(f));
  return name ? path.join(dir, name) : null;
}

function main() {
  const srcDir = findSourceDir();
  if (!srcDir) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        {
          ok: false,
          error:
            "未找到约稿封面源目录。请设置 COMMISSION_COVER_SOURCE，或将图片放入 scripts/commission-covers-source/",
          tried: CANDIDATE_SOURCE_DIRS,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const copied = [];
  const missing = [];
  for (let n = 1; n <= 12; n += 1) {
    const from = findFileForSlot(srcDir, n);
    const destName = `commission-cover-${String(n).padStart(2, "0")}.png`;
    const dest = path.join(UPLOAD_DIR, destName);
    if (!from) {
      missing.push(n);
      continue;
    }
    fs.copyFileSync(from, dest);
    copied.push({ slot: n, dest: destName });
  }

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, error: "缺少部分 commission_N 文件", missingSlots: missing, srcDir }, null, 2));
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, sourceDir: srcDir, copied: copied.length, files: copied.map((c) => c.dest) }, null, 2));
}

main();
