/**
 * 将 alice/bob 十二条广场稿的 previewImageUrl 更新为 /uploads/commission-cover-01.png … 12.png。
 * 请先运行：node scripts/sync-commission-covers.js
 *
 * 按标题精确匹配（与 seed-alice-bob-commissions.js 一致）。
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/** 顺序与 seed-alice-bob-commissions.js 中 ROWS 一致 */
const TITLE_TO_COVER = [
  ["约一张偏赛博街头风的 OC 胸像", "/uploads/commission-cover-01.png"],
  ["征集半写实胸像（暖色侧光）", "/uploads/commission-cover-02.png"],
  ["约日系动画风半身（动势+特效可简）", "/uploads/commission-cover-03.png"],
  ["可接 OC 设定与立绘（偏插画叙事）", "/uploads/commission-cover-04.png"],
  ["承接柔和光感肖像类胸像", "/uploads/commission-cover-05.png"],
  ["接 3D 渲染风角色胸像（需清晰设定）", "/uploads/commission-cover-06.png"],
  ["约黑白速写风男性头像（侧颜优先）", "/uploads/commission-cover-07.png"],
  ["征集奇幻风半身（粉发角色）", "/uploads/commission-cover-08.png"],
  ["约复古插画风半身（花卉/纹样背景）", "/uploads/commission-cover-09.png"],
  ["接日系平涂/赛璐璐风头像与胸像", "/uploads/commission-cover-10.png"],
  ["承接装饰性强的平面风肖像（适合当封面）", "/uploads/commission-cover-11.png"],
  ["接冷色奇幻氛围半身（冰晶/风雪元素可）", "/uploads/commission-cover-12.png"],
];

async function main() {
  let updated = 0;
  const notFound = [];
  for (const [title, previewImageUrl] of TITLE_TO_COVER) {
    const r = await prisma.commission.updateMany({
      where: { title },
      data: { previewImageUrl },
    });
    if (r.count === 0) notFound.push(title);
    updated += r.count;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        rowsUpdated: updated,
        titlesWithNoMatch: notFound,
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
