/**
 * 清除所有 OC 与世界观作品之间的「关联」展示数据：
 * - OC：去掉正文中的「所属世界观」「世界观归属」行（含「未绑定」）
 * - 世界观：去掉「关联 OC」行，并清空卡片 JSON 里 worldview.relatedCharacters
 *
 * 不影响其他类型作品里的世界观归属字段。
 *
 * 用法（在 backend 目录）：node scripts/clear-oc-worldview-links.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const MARKER = "<<<OC_WEB_CARD_JSON>>>";

function stripLinesMatching(prose, lineTest) {
  const lines = prose.replace(/\r/g, "").split("\n");
  const out = lines.filter((line) => !lineTest(line.trim()));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function shouldStripOcMetaLine(trimmed) {
  return /^所属世界观[：:]/.test(trimmed) || /^世界观归属[：:]/.test(trimmed);
}

function shouldStripWorldviewOcLine(trimmed) {
  return /^关联 OC[：:]/.test(trimmed);
}

function transformOcDescription(description) {
  if (description == null || description === "") return { changed: false, next: description };
  const normalized = description.replace(/\r/g, "");
  const idx = normalized.lastIndexOf(MARKER);
  let head = idx >= 0 ? normalized.slice(0, idx).trimEnd() : normalized.trimEnd();
  const tail = idx >= 0 ? normalized.slice(idx) : "";

  head = stripLinesMatching(head, shouldStripOcMetaLine).trimEnd();

  if (!tail) {
    const changed = head !== normalized.trimEnd();
    return { changed, next: head };
  }

  const next = `${head}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trim();
  return { changed: next !== normalized.trim(), next };
}

function transformWorldviewDescription(description) {
  if (description == null || description === "") return { changed: false, next: description };
  const normalized = description.replace(/\r/g, "");
  const idx = normalized.lastIndexOf(MARKER);
  let head = idx >= 0 ? normalized.slice(0, idx).trimEnd() : normalized.trimEnd();
  const jsonStr = idx >= 0 ? normalized.slice(idx + MARKER.length).trim() : "";

  head = stripLinesMatching(head, shouldStripWorldviewOcLine).trimEnd();

  if (idx < 0) {
    const changed = head !== normalized.trimEnd();
    return { changed, next: head };
  }

  let payload;
  try {
    payload = JSON.parse(jsonStr);
  } catch {
    return { changed: false, next: description };
  }

  if (payload && typeof payload === "object" && payload.worldview) {
    const w = { ...payload.worldview };
    delete w.relatedCharacters;
    if (Object.keys(w).length > 0) {
      payload.worldview = w;
    } else {
      delete payload.worldview;
    }
  }

  const next = `${head}\n\n${MARKER}\n${JSON.stringify(payload)}`.replace(/\n{3,}/g, "\n\n").trim();
  return { changed: next !== normalized.trim(), next };
}

async function main() {
  const ocRows = await prisma.artwork.findMany({
    where: { category: "oc" },
    select: { id: true, description: true },
  });
  const wvRows = await prisma.artwork.findMany({
    where: { category: "worldview" },
    select: { id: true, description: true },
  });

  let ocUpdated = 0;
  for (const row of ocRows) {
    const { changed, next } = transformOcDescription(row.description ?? "");
    if (changed && next !== row.description) {
      await prisma.artwork.update({ where: { id: row.id }, data: { description: next } });
      ocUpdated += 1;
    }
  }

  let wvUpdated = 0;
  for (const row of wvRows) {
    const { changed, next } = transformWorldviewDescription(row.description ?? "");
    if (changed && next !== row.description) {
      await prisma.artwork.update({ where: { id: row.id }, data: { description: next } });
      wvUpdated += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        ocScanned: ocRows.length,
        ocUpdated,
        worldviewScanned: wvRows.length,
        worldviewUpdated: wvUpdated,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
