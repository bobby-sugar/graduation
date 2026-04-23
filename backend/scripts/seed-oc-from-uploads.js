/**
 * 扫描 backend/uploads 下 OC 封面图（oc_<n>.ext 或 oc<n>.ext），为每张图创建或更新一条 category=oc 的作品，
 * 并写入完整简介 + 档案补充 + 卡片 JSON。作者按用户 id 升序轮流分配（通常为当前 12 个账号）。
 *
 * 用法（在 backend 目录）：node scripts/seed-oc-from-uploads.js
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const CARD_MARKER = "<<<OC_WEB_CARD_JSON>>>";

const TITLE_POOL = [
  "雾港巡夜人",
  "雪原使徒",
  "月庭见习魔女",
  "灰烬骑士·黯",
  "星屿记录员",
  "风铃街的猫系少年",
  "夜行列车长",
  "白塔档案员",
];

const OPENING_LINES = [
  "角色气质偏冷静克制，配色上保留了高识别度的主色与点缀色，方便延展立绘与剧情插图。",
  "以冷暖对比强化轮廓，强调眼神与手势，适合作为头像或关键剧情节点的主视觉。",
  "设定上兼顾日常感与一点点非日常要素，后续加世界观或阵营标签时也容易衔接。",
  "造型线条干净，材质层次集中在服装与配饰上，商业展示与同人二创都比较友好。",
  "整体走向偏轻奇幻，留白较多，方便你之后在详情里补全关系网与事件线。",
];

const WORLDS = ["雾冠遗庭", "灯京雨庭", "森语空庭", "绯碑王座", "苍岚天守", "—"];
const GENDERS = ["女", "男", "非二元", "保密"];
const RACES = ["人类", "半精灵", "人造体", "兽裔", "灵族", "未公开"];
const JOBS = ["档案员", "信使", "巡夜者", "学徒术士", "列车长", "自由画师", "调查员", "店主"];

function buildTitle(num) {
  const base = TITLE_POOL[(num - 1) % TITLE_POOL.length];
  return `${base} #${num}`;
}

function buildDescription(num) {
  const tagline = OPENING_LINES[(num - 1) % OPENING_LINES.length];
  const world = WORLDS[(num - 1) % WORLDS.length];
  const gender = GENDERS[(num + 1) % GENDERS.length];
  const race = RACES[(num + 2) % RACES.length];
  const job = JOBS[(num + 3) % JOBS.length];
  const age = 16 + ((num * 3) % 12);

  const prose = [
    `${tagline}`,
    "",
    "这是一份由本地脚本整理的示例档案，你可随时在详情或工作站里改成自己的设定与叙事。",
  ].join("\n");

  const meta = [
    "【档案补充】",
    `一句话简介：${tagline}`,
    `性别：${gender}`,
    `年龄：${age}`,
    `种族：${race}`,
    `职业：${job}`,
    world !== "—" ? `所属世界观：${world}` : "所属世界观：未绑定",
    "",
    "性格特点：",
    "话不多但观察细致；遇到在意的人会嘴硬心软。压力之下反而更冷静，习惯先把线索记下来再行动。",
  ].join("\n");

  const cardJson = JSON.stringify({ v: 1, kind: "oc" });
  return `${prose}\n\n${meta}\n\n${CARD_MARKER}\n${cardJson}`;
}

function listOcUploads() {
  if (!fs.existsSync(UPLOAD_DIR)) return [];
  const names = fs.readdirSync(UPLOAD_DIR);
  const out = [];
  for (const name of names) {
    const m = name.match(/^(?:oc_|oc)(\d+)\.(jpe?g|png|webp)$/i);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (!Number.isFinite(num) || num < 1) continue;
    out.push({ filename: name, num, imageUrl: `/uploads/${name}` });
  }
  out.sort((a, b) => a.num - b.num);
  return out;
}

async function main() {
  const items = listOcUploads();
  if (items.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          message: "uploads 目录下没有匹配 oc_<n> 或 ocn 的 jpg/png/webp 文件",
          hint: "请将 oc_1.jpg … 放入 src/assets/，运行 node backend/scripts/sync-oc-assets-to-uploads.js 同步到 backend/uploads/；或直接放入 uploads。",
          created: 0,
          updated: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
  if (users.length === 0) {
    throw new Error("数据库中没有任何用户，请先创建用户（例如运行 npm run seed）。");
  }

  let created = 0;
  let updated = 0;
  const summary = [];

  for (const { imageUrl, num } of items) {
    const author = users[(num - 1) % users.length];
    const title = buildTitle(num);
    const description = buildDescription(num);
    const tags = "oc,原创,角色设计";
    const likes = 30 + ((num * 17) % 420);
    const views = 200 + ((num * 131) % 8800);

    const existing = await prisma.artwork.findFirst({ where: { imageUrl } });
    if (existing) {
      await prisma.artwork.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          category: "oc",
          authorId: author.id,
          artistId: null,
          tags,
          likes,
          views,
        },
      });
      updated += 1;
      summary.push({ id: existing.id, imageUrl, action: "updated", author: author.username });
    } else {
      const row = await prisma.artwork.create({
        data: {
          title,
          description,
          category: "oc",
          imageUrl,
          authorId: author.id,
          artistId: null,
          tags,
          likes,
          views,
        },
      });
      created += 1;
      summary.push({ id: row.id, imageUrl, action: "created", author: author.username });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        updated,
        total: items.length,
        summary,
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
