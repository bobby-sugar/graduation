/**
 * 追加 12 条约稿广场数据（不删除已有 commissions）：
 * - 6 条约稿 direction=commission（alice 3 + bob 3，发起人为 client）
 * - 6 条接稿 direction=offer（alice 3 + bob 3，发起人为 artist）
 *
 * 封面使用 /uploads/commission-cover-01.png … 12.png（请先 node scripts/sync-commission-covers.js）。
 *
 * 用法（backend 目录）：node scripts/seed-alice-bob-commissions.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function block({ category, price, delivery, copyright, response, body }) {
  return [
    body.trim(),
    "",
    "【筛选信息】",
    `稿件类型：${category}`,
    `预算：¥${price}`,
    `期望交付：${delivery}`,
    `版权：${copyright}`,
    `希望响应：${response}`,
  ].join("\n");
}

/** @type {Array<{ user: 'alice' | 'bob'; direction: 'commission' | 'offer'; title: string; category: string; price: number; coverSlot: number; description: string }>} */
const ROWS = [
  // Alice — 约稿
  {
    user: "alice",
    direction: "commission",
    title: "约一张偏赛博街头风的 OC 胸像",
    category: "半身",
    price: 680,
    coverSlot: 1,
    description: block({
      category: "半身",
      price: 680,
      delivery: "2 周内",
      copyright: "个人使用",
      response: "24 小时内",
      body: "角色偏都市机能风，希望保留纹身与金属配饰的层次；背景可简化，重点在神态与光影。欢迎带相似风格例图私信。",
    }),
  },
  {
    user: "alice",
    direction: "commission",
    title: "征集半写实胸像（暖色侧光）",
    category: "头像",
    price: 520,
    coverSlot: 2,
    description: block({
      category: "头像",
      price: 520,
      delivery: "10 天内",
      copyright: "个人使用",
      response: "12 小时内",
      body: "需要偏厚涂或油画质感的肖像，强调肤色与发丝细节；会提供清晰参考与性格关键词。",
    }),
  },
  {
    user: "alice",
    direction: "commission",
    title: "约日系动画风半身（动势+特效可简）",
    category: "半身",
    price: 750,
    coverSlot: 3,
    description: block({
      category: "半身",
      price: 750,
      delivery: "3 周内",
      copyright: "个人使用",
      response: "24 小时内",
      body: "希望线条干净、配色饱和；若有简单背景氛围或速度线可讨论加价。请先说明档期。",
    }),
  },
  // Alice — 接稿
  {
    user: "alice",
    direction: "offer",
    title: "可接 OC 设定与立绘（偏插画叙事）",
    category: "立绘",
    price: 1200,
    coverSlot: 4,
    description: block({
      category: "立绘",
      price: 1200,
      delivery: "按排单 3–5 周",
      copyright: "可协商（个人/商用）",
      response: "24 小时内",
      body: "擅长带一点故事感的单人插图与设定整理；不接急单。请先发参考与用途说明。",
    }),
  },
  {
    user: "alice",
    direction: "offer",
    title: "承接柔和光感肖像类胸像",
    category: "头像",
    price: 480,
    coverSlot: 5,
    description: block({
      category: "头像",
      price: 480,
      delivery: "2 周内",
      copyright: "个人使用为主",
      response: "12 小时内",
      body: "偏半写实或伪厚涂，适合 OC 展示头图；修改轮次可事先约定。",
    }),
  },
  {
    user: "alice",
    direction: "offer",
    title: "接 3D 渲染风角色胸像（需清晰设定）",
    category: "半身",
    price: 900,
    coverSlot: 6,
    description: block({
      category: "半身",
      price: 900,
      delivery: "3 周内",
      copyright: "可协商",
      response: "24 小时内",
      body: "适合需要「立体角色宣传图」的委托人；请提供三视图或清晰立绘参考。",
    }),
  },
  // Bob — 约稿
  {
    user: "bob",
    direction: "commission",
    title: "约黑白速写风男性头像（侧颜优先）",
    category: "头像",
    price: 360,
    coverSlot: 7,
    description: block({
      category: "头像",
      price: 360,
      delivery: "1 周内",
      copyright: "个人使用",
      response: "24 小时内",
      body: "想要高对比线稿与少量排线阴影；构图以头肩为主，背景可做极简几何纹理。",
    }),
  },
  {
    user: "bob",
    direction: "commission",
    title: "征集奇幻风半身（粉发角色）",
    category: "半身",
    price: 820,
    coverSlot: 8,
    description: block({
      category: "半身",
      price: 820,
      delivery: "2 周内",
      copyright: "个人使用",
      response: "12 小时内",
      body: "角色为原创西幻气质，配饰与布料层次较多；希望画师能接受小幅度设定沟通。",
    }),
  },
  {
    user: "bob",
    direction: "commission",
    title: "约复古插画风半身（花卉/纹样背景）",
    category: "半身",
    price: 640,
    coverSlot: 9,
    description: block({
      category: "半身",
      price: 640,
      delivery: "2 周内",
      copyright: "个人使用",
      response: "24 小时内",
      body: "需要暖色、略带纹理笔刷的成品，适合当社交头图；会提供服装与发色参考。",
    }),
  },
  // Bob — 接稿
  {
    user: "bob",
    direction: "offer",
    title: "接日系平涂/赛璐璐风头像与胸像",
    category: "头像",
    price: 420,
    coverSlot: 10,
    description: block({
      category: "头像",
      price: 420,
      delivery: "10 天内起",
      copyright: "个人使用",
      response: "12 小时内",
      body: "线稿清爽、上色利落；可接同人气质 OC，请先说明用途与截稿期望。",
    }),
  },
  {
    user: "bob",
    direction: "offer",
    title: "承接装饰性强的平面风肖像（适合当封面）",
    category: "半身",
    price: 560,
    coverSlot: 11,
    description: block({
      category: "半身",
      price: 560,
      delivery: "2 周内",
      copyright: "可协商",
      response: "24 小时内",
      body: "擅长高对比配色与图形化妆面；适合需要「视觉冲击力」的单张主视觉。",
    }),
  },
  {
    user: "bob",
    direction: "offer",
    title: "接冷色奇幻氛围半身（冰晶/风雪元素可）",
    category: "半身",
    price: 780,
    coverSlot: 12,
    description: block({
      category: "半身",
      price: 780,
      delivery: "3 周内",
      copyright: "个人使用",
      response: "24 小时内",
      body: "偏动画赛璐璐与特效结合；请带参考图与角色性格简述，方便对齐气质。",
    }),
  },
];

async function main() {
  const users = await prisma.user.findMany({
    where: { username: { in: ["alice", "bob"] } },
    select: { id: true, username: true },
  });
  const byName = Object.fromEntries(users.map((u) => [u.username.toLowerCase(), u.id]));
  if (byName.alice == null || byName.bob == null) {
    throw new Error("需要存在 username 为 alice 与 bob 的用户（请先 npm run seed）");
  }

  const now = Date.now();
  const data = ROWS.map((row, i) => {
    const publisherId = byName[row.user];
    const previewImageUrl = `/uploads/commission-cover-${String(row.coverSlot).padStart(2, "0")}.png`;
    return {
      title: row.title,
      description: row.description,
      category: row.category,
      price: row.price,
      status: "new",
      paymentStatus: "unpaid",
      paymentPercent: null,
      previewImageUrl,
      submittedAt: new Date(now - (i + 1) * 37 * 60 * 1000),
      confirmedAt: null,
      startLabel: null,
      endLabel: null,
      direction: row.direction,
      clientId: row.direction === "commission" ? publisherId : null,
      artistId: row.direction === "offer" ? publisherId : null,
    };
  });

  const r = await prisma.commission.createMany({ data });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        inserted: r.count,
        alice: { commissions: 3, offers: 3 },
        bob: { commissions: 3, offers: 3 },
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
