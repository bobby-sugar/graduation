/**
 * 将 Artwork.artistId 全部置为 null（移除「关联画师」遗留数据）。
 * 用法（backend 目录）：node scripts/clear-artwork-artist-ids.js
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  try {
    const p = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}
loadEnvFile();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const r = await prisma.artwork.updateMany({
    where: { artistId: { not: null } },
    data: { artistId: null },
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, updated: r.count }, null, 2));
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
