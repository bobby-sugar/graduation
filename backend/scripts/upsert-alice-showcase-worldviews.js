const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const CARD_JSON_MARKER = "<<<OC_WEB_CARD_JSON>>>";
const AVATAR_URL = "/uploads/avatar2.jpg";

/** 演示用 likes/views 量级需与 OC 种子接近；推荐分 = (likes*2+views)/时间衰减，填成数百赞/数千浏览会长期压过 OC。 */
const WORLDVIEWS = [
  {
    title: "雾冠遗庭",
    imageUrl: "/uploads/alice-worldview-violet-sanctuary.jpg",
    tags: "奇幻,世界观,紫雾,神殿遗迹,森林,群像企划",
    likes: 24,
    views: 360,
    summaryHint: "紫雾永昼笼罩下，失落祭庭在林海深处缓慢苏醒。",
    chips: ["奇幻", "第三雾潮纪", "紫雾雨林"],
    type: "奇幻",
    era: "后王朝断层后的第三雾潮纪",
    regions: "紫雾雨林、折光神殿、沉桥湿地",
    factions: "守庭巡礼会、采灯人、雾化兽群",
    coreConflict: "神殿深处的“雾心”正在苏醒，巡礼会想封印它，采灯人想利用它改写记忆秩序。",
    keyTheme: "记忆、继承、异化",
    rules: [
      "紫雾会放大执念，并在长时间暴露后侵蚀记忆。",
      "只有携带夜灯矿芯的人，才能在遗庭中看见真实阶梯与门扉。",
      "神殿钟响时，遗庭会短暂重组路径，迷失者可能回到过去停留过的场所。",
    ],
    series: "雾冠巡礼",
    relatedOcs: ["月庭见习魔女 #19", "星屿记录员 #29"],
    intro:
      "在群山封存的雨林腹地，雾冠遗庭像一座被梦境遗忘的阶梯之城。高塔与回廊被紫雾吞没，只剩灯火和祭石在潮湿的树海里时隐时现。所有进入这里的人，都会先失去一段记忆，再换来一次看见“真相”的机会。",
    timeline: [
      "初筑纪元：折光神殿建立，雾冠遗庭成为林地诸部的共同祭场。",
      "坠冠之夜：王朝末代司灯官打碎雾心，整座遗庭被紫雾永久封存。",
      "巡礼复兴历 12 年：第一批采灯人重新绘出可通行的石阶图。",
      "当前阶段：各势力在遗庭外围集结，试图进入神殿最深处的回声井。",
    ],
    locations: [
      "前庭水阶：被浅雾浸没的入口地带，适合作为初次巡礼的落脚点。",
      "折光主殿：高塔状中枢区域，钟响会让回廊重新排序。",
      "林脊居所：建立在树冠上的旧巡礼者住区，仍留有灯纹与观测台。",
      "回声井：传闻能交换记忆与愿望的核心场所。",
    ],
    storyHooks: [
      "采灯人受雇进入遗庭，为失忆贵族寻找被雾吞没的名字。",
      "守庭巡礼会内部出现分裂，有人主张重新点燃雾心。",
      "某位 OC 在遗庭看见了自己从未经历过的人生残片。",
    ],
  },
  {
    title: "森语空庭",
    imageUrl: "/uploads/alice-worldview-verdant-hollow.jpg",
    tags: "奇幻,世界观,森林遗迹,共生,秘境,治愈悬疑",
    likes: 19,
    views: 245,
    summaryHint: "会说话的林冠遗迹在孢光中复苏，旅人必须与森林交换名字。",
    chips: ["秘境奇幻", "菌林遗迹", "共生世界"],
    type: "秘境奇幻",
    era: "枝环历 209 年的再生季",
    regions: "空桥菌林、回芽中庭、溪潮遗环",
    factions: "守芽者、拾种旅人、林声幼灵",
    coreConflict: "森林正在主动唤醒沉睡古道，但每一次复苏都会吞走旅人的一段身份记忆。",
    keyTheme: "共生、命名、归属",
    rules: [
      "进入中庭前必须向林声报上真名，否则道路会不断偏移。",
      "菌柱发出的蓝光能记录情绪，情绪失衡时会吸引幼灵围聚。",
      "被森林认可的人能借枝桥穿行，但也会逐渐带上植物化特征。",
    ],
    series: "森语拾遗",
    relatedOcs: ["星屿记录员 #13", "风铃街的猫系少年 #38"],
    intro:
      "森语空庭曾是高悬在古树林海上方的学舍与祈祷庭，如今只剩被藤桥和菌柱托起的半空遗迹。每当潮湿晨雾升起，整座遗庭会用树叶摩擦般的低语重新排列通路，引诱迷失者走向它最深处的发芽之井。",
    timeline: [
      "枝塔全盛期：空庭作为林地诸城的记名学舍，负责保存每一代居民的名字与誓约。",
      "断桥雨季：旧时代的桥群坍塌，空庭与外界失联，逐渐被孢林吞没。",
      "再生季初年：第一批拾种旅人重新发现会发光的古桥，森语开始回应来访者。",
      "当前阶段：守芽者试图封闭发芽之井，但更多旅人希望用它找回失落身份。",
    ],
    locations: [
      "蓝孢迎门：林间最低层的入境区，空气中漂浮着能记录声音的发光孢子。",
      "回芽中庭：遗迹核心庭院，断桥在夜里会自行生长为新的路网。",
      "藤桥观测室：悬挂在高处的旧学舍，据说仍保存着未被取走的名册。",
      "发芽之井：所有林声回响的汇聚点，能够交换名字、记忆与归属。",
    ],
    storyHooks: [
      "某位记录员发现名册里写着一段本不该属于自己的过去。",
      "守芽者发布禁入令，试图阻止游客继续进入会发芽的井底。",
      "旅人想带走一枚孢灯，却发现它会在离开森林后持续呼唤原主。",
    ],
  },
  {
    title: "绯碑王座",
    imageUrl: "/uploads/alice-worldview-crimson-monolith.jpg",
    tags: "暗黑奇幻,世界观,血碑,审判,王座遗址,红黑",
    likes: 31,
    views: 415,
    summaryHint: "赤色祭域中的巨碑仍在执行过时王令，所有闯入者都将被迫接受审判。",
    chips: ["暗黑奇幻", "赤碑祭域", "审判遗址"],
    type: "暗黑奇幻",
    era: "猩冠纪废朝后的第七审令",
    regions: "赤碑原、断誓甬道、空王座台",
    factions: "碑印执杖者、无冠亡民、噤声猎团",
    coreConflict: "失控的碑灵还在继续执行旧王的清洗敕令，而幸存者想利用它改写王座继承权。",
    keyTheme: "审判、权力、代价",
    rules: [
      "所有进入赤碑原的人都会被碑灵记录影子，影子越浓，越容易被追猎。",
      "王座台周围禁止说出真实誓言，违者会被视为自动应诉。",
      "只有携带残缺王印的人，才有资格接近中央碑座并发起改令。",
    ],
    series: "赤誓余烬",
    relatedOcs: ["雾港巡夜人 #1", "雪原使徒 #26"],
    intro:
      "绯碑王座坐落在被鲜红天光永恒照亮的废朝祭域。高耸黑碑像沉默的审判官围住中央王座，碑面不断浮现无名者留下的面孔与罪状。这里没有真正的白昼与夜晚，只有一条永不停歇的宣判回廊。",
    timeline: [
      "猩冠建朝：初代王以血碑立誓，用碑灵维系境内秩序与继承律。",
      "倒印之年：王印断裂，碑灵失去最终解释权，开始按照旧律无限循环审判。",
      "余烬游猎期：噤声猎团在赤碑原边缘猎取失控碑影，以换取短暂通行权。",
      "当前阶段：新的持印者即将出现，王座台重新开始召唤有资格的人进入核心祭圈。",
    ],
    locations: [
      "断誓甬道：连接祭域外围的黑石通路，行走时会听见旧誓的回声。",
      "无面碑林：碑面刻着被抹去身份者的轮廓，是最危险的追猎区。",
      "空王座台：中央高台，只有持印者与被传唤者能抵达。",
      "烬火下庭：亡民秘密交易消息与残印的地下集会点。",
    ],
    storyHooks: [
      "巡夜者追查一桩旧案，却发现自己的名字也被刻进了碑林。",
      "使徒带来的遗失圣印可能足以重写王令，但代价是替某个亡魂完成最后宣誓。",
      "一名无冠者试图推翻旧审判，却必须先证明自己拥有被抹除的继承权。",
    ],
  },
  {
    title: "苍岚天守",
    imageUrl: "/uploads/alice-worldview-azure-keep.jpg",
    tags: "东方奇幻,世界观,天守,山城,旅途,家国",
    likes: 16,
    views: 195,
    summaryHint: "高悬山巅的天守维系着四境风律，离开的骑者都要在归途中偿还誓言。",
    chips: ["东方奇幻", "山城王国", "归途传说"],
    type: "东方奇幻",
    era: "云川历 88 年的和议后期",
    regions: "苍岚天守、回川古道、鎏田缓坡",
    factions: "护岚家臣、远途驿军、山泽盟客",
    coreConflict: "天守的风律正在衰退，旧有驿路失去庇护，而各方都想争夺控制风门的权力。",
    keyTheme: "归途、责任、秩序修补",
    rules: [
      "凡在天守立誓出行者，返程时必须带回等重之物，才能穿过风门。",
      "夜间古道会沿着风灯重新改向，只有熟记驿歌的人能辨别正路。",
      "天守不会拒绝旅人，但会记录每一次违誓并在城墙上显现裂纹。",
    ],
    series: "岚川驿歌",
    relatedOcs: ["夜行列车长 #7"],
    intro:
      "苍岚天守立在群山与金色缓坡之间，像一座被风托起的旧王都。每当夕照落在城墙边缘，沿山而上的驿路会亮起细碎风灯，把远行者和迟归者一并引向同一条归路。这里的和平来之不易，因此每一次离开都伴随着更沉重的约定。",
    timeline: [
      "筑守初年：苍岚王家于高山顶端建起天守，以风门联通四境驿路。",
      "裂风战役：各境为争夺风门控制权爆发大战，古道与山桥损毁过半。",
      "和议纪 16 年：远途驿军重启回川古道，恢复大部分旅运与消息传递。",
      "当前阶段：风门再次出现失衡征兆，山泽盟客与家臣都在争夺修复主导权。",
    ],
    locations: [
      "天守外城：贸易与驻军集中区，保留着旧式风铃警报系统。",
      "回川古道：从山脚延展到王城正门的长路，是所有旅者的必经归线。",
      "鎏田缓坡：收容战后移民的谷地，也是风门余波最先吹抵的地方。",
      "岚壁观台：观察风势变化的高处哨台，常年派驻最可靠的信使。",
    ],
    storyHooks: [
      "列车长带回一节不属于任何时代的旧车厢，车上藏着失落和议的真相。",
      "某位护岚家臣发现城墙裂纹会随着旅人的违誓数量扩张。",
      "山泽盟客声称自己找到了修复风门的方法，但条件是废除旧王家的返誓制度。",
    ],
  },
  {
    title: "灯京雨庭",
    imageUrl: "/uploads/alice-worldview-lantern-capital.jpg",
    tags: "东方幻想,世界观,都城,雨夜,灵鹿,灯火",
    likes: 27,
    views: 368,
    summaryHint: "雨夜常驻的都城以灯火安抚游灵，真正的秩序却藏在每一场灯市后的静默巡查里。",
    chips: ["东方幻想", "灯火都城", "雨夜群像"],
    type: "东方幻想",
    era: "灯市历 142 年的静巡期",
    regions: "雨庭主城、鹿影长街、沉灯水巷",
    factions: "司灯府、夜巡署、游灵商会",
    coreConflict: "都城依赖灯阵维持人与游灵共处，但灯阵消耗越来越大，夜巡署与商会在续灯方案上立场对立。",
    keyTheme: "秩序、陪伴、城市呼吸",
    rules: [
      "夜雨落下后必须点亮门前一盏灯，否则游灵会默认此处无人照看。",
      "灵鹿只会在真正安全的街巷中显形，它们的停留方向常被视为城运指针。",
      "每逢大型灯市，城中巡查路线会临时封闭，违者可能被卷入游灵回流。",
    ],
    series: "灯市夜巡",
    relatedOcs: ["雾港巡夜人 #25"],
    intro:
      "灯京雨庭是一座在长雨与暖灯中维持呼吸的古城。高檐楼阁、石桥水巷与幽蓝灵鹿构成了这座都城的夜景骨架，人们早已习惯在潮湿灯影里与看不见的来客擦肩而过。真正守住秩序的人往往不在台前，而是在每一条雨巷里反复巡回。",
    timeline: [
      "初灯筑京：司灯府在旧都遗址上重建主城，并以百街灯阵安抚游灵流动。",
      "长雨之患：都城迎来持续数十年的湿季，夜巡署因此扩编，形成固定雨巡制度。",
      "三鹿结盟：游灵商会与司灯府签下互不侵扰的灯市协议，主城开始繁盛。",
      "当前阶段：灯阵的耗损速度超出预期，夜巡署怀疑有人正在暗中截走城灯之芯。",
    ],
    locations: [
      "雨庭主城：政治与灯市中心，所有主干街都在夜间保持长明。",
      "鹿影长街：最常见灵鹿显形的街区，也是旅人最容易迷路的地方。",
      "沉灯水巷：商会交易与情报交换的旧水路，白天安静，夜里最热闹。",
      "司灯大庭：掌控主城灯阵的中枢建筑，外人几乎无法进入内廷。",
    ],
    storyHooks: [
      "巡夜人在雨巷中发现一头受伤灵鹿，它的角上挂着失窃灯芯的痕迹。",
      "游灵商会准备在下次灯市公开一份旧协议，可能改写司灯府的统治正当性。",
      "有人在沉灯水巷散布谣言，说主城最亮的灯其实正用活人的愿望续燃。",
    ],
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWorldviewDescription(world) {
  const prose = [
    world.intro,
    "",
    "【设定信息】",
    `一句话设定：${world.summaryHint}`,
    `类型：${world.type}`,
    `时代/背景：${world.era}`,
    `地域/舞台：${world.regions}`,
    `阵营/势力：${world.factions}`,
    `核心冲突：${world.coreConflict}`,
    `核心主题：${world.keyTheme}`,
    "世界规则：",
    ...world.rules.map((rule, index) => `${index + 1}. ${rule}`),
    `关联作品/系列：${world.series}`,
    `关联 OC：${world.relatedOcs.join("、")}`,
    "",
    "【时间线】",
    ...world.timeline,
    "",
    "【区域图层】",
    ...world.locations,
    "",
    "【叙事入口】",
    ...world.storyHooks.map((hook) => `· ${hook}`),
  ].join("\n");

  const payload = {
    v: 1,
    kind: "worldview",
    worldview: {
      summaryHint: world.summaryHint,
      chips: world.chips,
      relatedCharacters: world.relatedOcs,
    },
  };

  return `${prose}\n\n${CARD_JSON_MARKER}\n${JSON.stringify(payload)}`;
}

function upsertSectionLine(description, sectionTitle, label, value) {
  const normalized = (description ?? "").replace(/\r/g, "").trim();
  const sectionHeader = `【${sectionTitle}】`;
  const nextLine = `${label}：${value}`;

  if (!normalized) return `${sectionHeader}\n${nextLine}`;

  const lines = normalized.split("\n");
  const labelPattern = new RegExp(`^${escapeRegExp(label)}[：:].*$`);
  const existingIndex = lines.findIndex((line) => labelPattern.test(line.trim()));
  if (existingIndex >= 0) {
    lines[existingIndex] = nextLine;
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const sectionIndex = lines.findIndex((line) => line.trim() === sectionHeader);
  if (sectionIndex >= 0) {
    lines.splice(sectionIndex + 1, 0, nextLine);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return `${normalized}\n\n${sectionHeader}\n${nextLine}`;
}

async function ensureAlice() {
  const existing = await prisma.user.findFirst({
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

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
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

async function upsertWorldview(authorId, world) {
  const data = {
    title: world.title,
    description: buildWorldviewDescription(world),
    imageUrl: world.imageUrl,
    category: "worldview",
    authorId,
    tags: world.tags,
    likes: world.likes,
    views: world.views,
  };

  const existing = await prisma.artwork.findFirst({
    where: {
      authorId,
      category: "worldview",
      OR: [{ title: world.title }, { imageUrl: world.imageUrl }],
    },
    select: { id: true },
  });

  return existing
    ? prisma.artwork.update({ where: { id: existing.id }, data })
    : prisma.artwork.create({ data });
}

async function updateOcWorldLink(authorId, ocTitle, worldTitle) {
  const oc = await prisma.artwork.findFirst({
    where: { authorId, category: "oc", title: ocTitle },
    select: { id: true, title: true, description: true },
  });

  if (!oc) {
    throw new Error(`未找到需要连接的 OC：${ocTitle}`);
  }

  const nextDescription = upsertSectionLine(oc.description, "档案补充", "所属世界观", worldTitle);

  await prisma.artwork.update({
    where: { id: oc.id },
    data: { description: nextDescription },
  });

  return oc.title;
}

async function main() {
  const alice = await ensureAlice();
  const createdWorlds = [];
  const linkedOcs = [];

  for (const world of WORLDVIEWS) {
    const artwork = await upsertWorldview(alice.id, world);
    createdWorlds.push({
      id: artwork.id,
      title: artwork.title,
      imageUrl: artwork.imageUrl,
      relatedOcs: world.relatedOcs,
    });

    for (const ocTitle of world.relatedOcs) {
      const linkedTitle = await updateOcWorldLink(alice.id, ocTitle, world.title);
      linkedOcs.push({ ocTitle: linkedTitle, worldTitle: world.title });
    }
  }

  console.log(
    JSON.stringify(
      {
        author: alice.username,
        worldviewCount: createdWorlds.length,
        worlds: createdWorlds,
        linkedOcs,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
