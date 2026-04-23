const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const CARD_JSON_MARKER = "<<<OC_WEB_CARD_JSON>>>";
const IMAGE_URL = "/uploads/alice-worldview-violet-sanctuary.jpg";
const TITLE = "雾冠遗庭";
const AVATAR_URL = "/uploads/avatar2.jpg";
const RELATED_OCS = ["月庭见习魔女 #19", "星屿记录员 #29"];

function buildDescription() {
  const prose = [
    "在群山封存的雨林腹地，雾冠遗庭像一座被梦境遗忘的阶梯之城。高塔与回廊被紫雾吞没，只剩灯火和祭石在潮湿的树海里时隐时现。所有进入这里的人，都会先失去一段记忆，再换来一次看见“真相”的机会。",
    "",
    "【设定信息】",
    "一句话设定：紫雾永昼笼罩下，失落祭庭在林海深处缓慢苏醒。",
    "类型：奇幻",
    "时代/背景：后王朝断层后的第三雾潮纪",
    "地域/舞台：紫雾雨林、折光神殿、沉桥湿地",
    "阵营/势力：守庭巡礼会、采灯人、雾化兽群",
    "核心冲突：神殿深处的“雾心”正在苏醒，巡礼会想封印它，采灯人想利用它改写记忆秩序。",
    "核心主题：记忆、继承、异化",
    "世界规则：",
    "1. 紫雾会放大执念，并在长时间暴露后侵蚀记忆。",
    "2. 只有携带夜灯矿芯的人，才能在遗庭中看见真实阶梯与门扉。",
    "3. 神殿钟响时，遗庭会短暂重组路径，迷失者可能回到过去停留过的场所。",
    "关联作品/系列：雾冠巡礼",
    `关联 OC：${RELATED_OCS.join("、")}`,
    "",
    "【时间线】",
    "初筑纪元：折光神殿建立，雾冠遗庭成为林地诸部的共同祭场。",
    "坠冠之夜：王朝末代司灯官打碎雾心，整座遗庭被紫雾永久封存。",
    "巡礼复兴历 12 年：第一批采灯人重新绘出可通行的石阶图。",
    "当前阶段：各势力在遗庭外围集结，试图进入神殿最深处的回声井。",
    "",
    "【区域图层】",
    "前庭水阶：被浅雾浸没的入口地带，适合作为初次巡礼的落脚点。",
    "折光主殿：高塔状中枢区域，钟响会让回廊重新排序。",
    "林脊居所：建立在树冠上的旧巡礼者住区，仍留有灯纹与观测台。",
    "回声井：传闻能交换记忆与愿望的核心场所。",
    "",
    "【叙事入口】",
    "· 采灯人受雇进入遗庭，为失忆贵族寻找被雾吞没的名字。",
    "· 守庭巡礼会内部出现分裂，有人主张重新点燃雾心。",
    "· 某位 OC 在遗庭看见了自己从未经历过的人生残片。",
  ].join("\n");

  const payload = {
    v: 1,
    kind: "worldview",
    worldview: {
      summaryHint: "紫雾永昼笼罩下，失落祭庭在林海深处缓慢苏醒。",
      chips: ["奇幻", "第三雾潮纪", "紫雾雨林"],
      relatedCharacters: RELATED_OCS,
    },
  };

  return `${prose}\n\n${CARD_JSON_MARKER}\n${JSON.stringify(payload)}`;
}

async function ensureAlice() {
  const exact = await prisma.user.findFirst({
    where: {
      OR: [{ username: "alice" }, { username: "Alice" }, { email: "alice@example.com" }],
    },
    orderBy: { id: "asc" },
  });

  const profile = {
    username: "alice",
    email: "alice@example.com",
    avatarUrl: AVATAR_URL,
    bio: "热爱二次元与原创角色设计的插画师。",
    location: "四川 成都",
  };

  if (exact) {
    return prisma.user.update({
      where: { id: exact.id },
      data: profile,
      select: { id: true, username: true },
    });
  }

  const password = await bcrypt.hash("password123", SALT_ROUNDS);
  return prisma.user.create({
    data: { ...profile, password },
    select: { id: true, username: true },
  });
}

async function main() {
  const alice = await ensureAlice();
  const data = {
    title: TITLE,
    description: buildDescription(),
    imageUrl: IMAGE_URL,
    category: "worldview",
    authorId: alice.id,
    tags: "奇幻,世界观,紫雾,神殿遗迹,森林,群像企划",
    likes: 22,
    views: 275,
  };

  const existing = await prisma.artwork.findFirst({
    where: {
      authorId: alice.id,
      category: "worldview",
      OR: [{ title: TITLE }, { imageUrl: IMAGE_URL }],
    },
    select: { id: true },
  });

  const artwork = existing
    ? await prisma.artwork.update({ where: { id: existing.id }, data })
    : await prisma.artwork.create({ data });

  console.log(
    JSON.stringify(
      {
        action: existing ? "updated" : "created",
        artworkId: artwork.id,
        title: artwork.title,
        author: alice.username,
        imageUrl: artwork.imageUrl,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
