/**
 * 为世界观作品卡片 JSON 补全 worldview.linkedOcsPreview（根据 relatedCharacters 与同作者 OC 列表匹配）。
 * 用于已发布作品在增加该字段前的数据修复；新发布已由 buildArtworkCardPayload 写入。
 *
 * 用法（在 backend 目录）：
 *   node scripts/backfill-worldview-linked-oc-preview.js
 *   node scripts/backfill-worldview-linked-oc-preview.js --id=42
 *   node scripts/backfill-worldview-linked-oc-preview.js --dry-run
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const MARKER = "<<<OC_WEB_CARD_JSON>>>";

function parseArgs(argv) {
  const args = argv.slice(2);
  let id = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--id=")) id = Number(a.slice(5));
    else if (a === "--id" && args[i + 1] != null) {
      id = Number(args[i + 1]);
      i++;
    }
  }
  if (Number.isFinite(id)) return { id, dryRun };
  return { id: null, dryRun };
}

function splitDescription(description) {
  const full = (description ?? "").replace(/\r/g, "");
  const idx = full.lastIndexOf(MARKER);
  if (idx < 0) return { prose: full.trimEnd(), payload: null };
  const prose = full.slice(0, idx).trimEnd();
  const jsonPart = full.slice(idx + MARKER.length).trim();
  try {
    const payload = JSON.parse(jsonPart);
    return { prose, payload };
  } catch {
    return { prose: full.trimEnd(), payload: null };
  }
}

function joinDescription(prose, payload) {
  const base = (prose ?? "").trimEnd();
  const tail = `${MARKER}\n${JSON.stringify(payload)}`;
  if (!base) return tail;
  return `${base}\n\n${tail}`;
}

function expandNamesFromRelatedCharacters(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const entry of arr) {
    for (const part of String(entry ?? "").split(/[、,，]+/)) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  const seen = new Set();
  const dedup = [];
  for (const t of out) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(t);
  }
  return dedup;
}

function extractNamesFromProse(prose) {
  const m = prose.match(/^关联 OC[：:]\s*(.+)$/m);
  if (!m) return [];
  return expandNamesFromRelatedCharacters([m[1].trim()]);
}

function normTitle(t) {
  return String(t ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function matchOcByName(ocRows, name) {
  const n = normTitle(name);
  if (!n) return null;
  let hit =
    ocRows.find((r) => normTitle(r.title) === n) ||
    ocRows.find((r) => normTitle(r.title).includes(n) || n.includes(normTitle(r.title)));
  return hit ?? null;
}

function needsBackfill(payload, prose) {
  if (!payload || payload.v !== 1 || !payload.worldview) return false;
  const wv = payload.worldview;
  if (Array.isArray(wv.linkedOcsPreview) && wv.linkedOcsPreview.length > 0) return false;
  const fromPayload = expandNamesFromRelatedCharacters(wv.relatedCharacters);
  if (fromPayload.length > 0) return true;
  return extractNamesFromProse(prose ?? "").length > 0;
}

function collectNames(payload, prose) {
  const wv = payload.worldview;
  const a = expandNamesFromRelatedCharacters(wv.relatedCharacters);
  if (a.length) return a;
  return extractNamesFromProse(prose);
}

async function backfillOne(row, dryRun) {
  const { prose, payload } = splitDescription(row.description ?? "");
  if (!payload || !needsBackfill(payload, prose)) return { changed: false, reason: "skip" };

  const names = collectNames(payload, prose);
  if (!names.length) return { changed: false, reason: "no-names" };

  const ocRows = await prisma.artwork.findMany({
    where: { authorId: row.authorId, category: "oc" },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      author: { select: { username: true } },
    },
  });

  const linkedOcsPreview = [];
  const usedIds = new Set();
  for (const name of names.slice(0, 24)) {
    let oc = matchOcByName(ocRows, name);
    if (!oc) {
      const exact = name.trim();
      if (exact) {
        oc = await prisma.artwork.findFirst({
          where: { category: "oc", title: exact },
          select: {
            id: true,
            title: true,
            imageUrl: true,
            author: { select: { username: true } },
          },
        });
      }
    }
    if (!oc || usedIds.has(oc.id)) continue;
    usedIds.add(oc.id);
    linkedOcsPreview.push({
      artworkId: oc.id,
      title: oc.title.trim() || name,
      authorUsername: oc.author?.username ?? "未知作者",
      ...(oc.imageUrl ? { imageUrl: oc.imageUrl } : {}),
    });
  }

  if (!linkedOcsPreview.length) return { changed: false, reason: "no-oc-match", names };

  const nextPayload = {
    ...payload,
    worldview: {
      ...payload.worldview,
      linkedOcsPreview,
    },
  };
  const nextDesc = joinDescription(prose, nextPayload);

  if (!dryRun) {
    await prisma.artwork.update({
      where: { id: row.id },
      data: { description: nextDesc },
    });
  }

  return { changed: true, id: row.id, title: row.title, count: linkedOcsPreview.length, dryRun };
}

async function main() {
  const { id, dryRun } = parseArgs(process.argv);

  let row;
  if (id != null) {
    row = await prisma.artwork.findFirst({
      where: { id, category: "worldview" },
      select: { id: true, title: true, description: true, authorId: true },
    });
    if (!row) {
      console.error(`未找到 id=${id} 的世界观作品`);
      process.exitCode = 1;
      return;
    }
  } else {
    const rows = await prisma.artwork.findMany({
      where: { category: "worldview" },
      orderBy: { id: "desc" },
      take: 30,
      select: { id: true, title: true, description: true, authorId: true },
    });
    row = rows.find((r) => {
      const { prose, payload } = splitDescription(r.description ?? "");
      return payload && needsBackfill(payload, prose);
    });
    if (!row) {
      console.log("未找到需要补全 linkedOcsPreview 的世界观（可能均已补全或无 relatedCharacters）。");
      return;
    }
  }

  const result = await backfillOne(row, dryRun);
  if (!result.changed) {
    console.log(`id=${row.id} ${row.title}: 未更新 (${result.reason})`, result.names ?? "");
    return;
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}已更新世界观 id=${result.id}「${result.title}」linkedOcsPreview 共 ${result.count} 条`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
