const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const categories = ["头像", "半身", "全身", "立绘", "场景", "Live2D", "UI设计"];
const deliveryTimes = ["3天内", "1周内", "2周内", "1个月内", "可协商"];
const copyrights = ["个人使用", "商用可用", "买断版权"];
const responseSpeeds = ["24小时内", "12小时内", "6小时内"];

const commissionTitles = [
  "求画 OC 角色设定图",
  "约一张直播头像",
  "征集立绘画师长期合作",
  "求节日主题插画",
  "招募 UI 插画设计",
  "约校园风双人插画",
  "求科幻风封面图",
  "约古风人物立绘",
  "约商用宣传海报",
  "求Q版角色表情包",
];

const offerTitles = [
  "可接头像稿件，排单中",
  "承接立绘与半身插画",
  "长期接商稿，支持加急",
  "接古风/国风人物稿",
  "接直播封面与频道图",
  "接OC设定图与参考表",
  "承接游戏素材美术外包",
  "接Q版头像与表情包",
  "接赛博风场景插画",
  "承接UI插画与图标设计",
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function buildDescription({ i, category, amount, username }) {
  return [
    `由 ${username} 发布，欢迎私信沟通细节。`,
    "",
    "【筛选信息】",
    `稿件类型：${category}`,
    `金额：${amount}`,
    `交付时间：${pick(deliveryTimes, i)}`,
    `版权：${pick(copyrights, i)}`,
    `响应速度：${pick(responseSpeeds, i)}`,
  ].join("\n");
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { createdAt: "desc" },
  });

  if (users.length === 0) {
    throw new Error("没有可用用户，无法生成稿件数据");
  }

  const uploadsDir = path.join(__dirname, "..", "uploads");
  const imageFiles = fs
    .readdirSync(uploadsDir)
    .filter((name) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name));

  if (imageFiles.length === 0) {
    throw new Error("uploads 目录没有图片，无法写入封面图");
  }

  await prisma.commission.deleteMany({});

  const total = 72;
  const rows = Array.from({ length: total }, (_, i) => {
    const user = users[(i * 5 + 2) % users.length];
    const direction = i % 2 === 0 ? "commission" : "offer";
    const category = pick(categories, i);
    const amount = 300 + (i % 10) * 120 + (i % 6) * 80;
    const price = amount;
    const imageFile = imageFiles[i % imageFiles.length];

    return {
      title: direction === "commission" ? pick(commissionTitles, i) : pick(offerTitles, i),
      description: buildDescription({
        i,
        category,
        amount,
        username: user.username,
      }),
      category,
      price,
      status: pick(["new", "pending", "payment-pending", "wip", "review-pending", "revising", "done"], i),
      paymentStatus: pick(["unpaid", "paid", "partial"], i),
      paymentPercent: i % 3 === 2 ? 50 : null,
      previewImageUrl: `/uploads/${imageFile}`,
      submittedAt: new Date(Date.now() - i * 6 * 60 * 60 * 1000),
      confirmedAt: i % 4 === 0 ? new Date(Date.now() - i * 5 * 60 * 60 * 1000) : null,
      startLabel: null,
      endLabel: null,
      direction,
      clientId: direction === "commission" ? user.id : null,
      artistId: direction === "offer" ? user.id : null,
    };
  });

  await prisma.commission.createMany({ data: rows });
  // eslint-disable-next-line no-console
  console.log(`seed completed: inserted ${rows.length} commissions`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

