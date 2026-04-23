const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const titlePool = {
  oc: [
    "雾港巡夜人",
    "雪原使徒",
    "月庭见习魔女",
    "灰烬骑士·黎",
    "星屿记录员",
    "风铃街的猫系少年",
    "夜行列车长",
    "白塔档案官",
  ],
  worldview: [
    "赤潮纪元地理设定",
    "浮城联邦社会结构",
    "群星贸易航线图",
    "银砂王朝编年史",
    "深海城邦生态总览",
    "北境同盟政体设定",
    "裂隙时代大事件",
    "晨雾大陆文化志",
  ],
  emoji: [
    "通勤人崩溃日常表情包",
    "社恐小狗聊天表情",
    "摸鱼办公专用表情组",
    "恋爱碎碎念动态表情",
    "游戏开黑吐槽表情",
    "奶凶猫咪回复表情",
    "打工人周一限定表情",
    "直播互动高频表情",
  ],
  novel: [
    "《旧城余烬》人物外传",
    "《风暴回廊》第一章",
    "《白昼失真》角色独白",
    "《海上无名者》短篇节选",
    "《第七码头》设定笔记",
    "《边境观测站》序章",
    "《潮汐邮局》片段记录",
    "《山雾与灯》故事梗概",
  ],
};

const descPool = {
  oc: [
    "角色定位为近未来都市的巡查者，保留了明显的个人配色和识别配件，便于后续延展成多场景立绘。",
    "以冷色调为主，重点强化眼神和服装层次，适合做头像、立绘和剧情关键节点插图。",
    "本稿强调角色气质与故事背景统一，兼顾商业展示和同人二创使用需求。",
  ],
  worldview: [
    "整理了核心势力、地理区划与历史时间线，文本可直接用于小说大纲或跑团底稿。",
    "这一版补全了社会分层与资源流通逻辑，后续扩展角色关系会更顺滑。",
    "设定重点放在冲突来源与世界规则，保证后续剧情推进有稳定支撑。",
  ],
  emoji: [
    "围绕高频聊天语境制作，表情动作夸张但不失角色一致性，适合长期连载更新。",
    "每个表情都优先保证小尺寸可读性，兼顾日常沟通和社群互动。",
    "语义覆盖催更、夸夸、吐槽、拒绝等常用场景，可直接打包上架。",
  ],
  novel: [
    "文本以人物动机为主轴，语言风格偏克制，便于后续改编为分镜或广播剧脚本。",
    "这一篇补充了关键伏笔和转折点，适合放在连载中段拉高阅读黏性。",
    "章节节奏采用短句推进，信息密度较高，适合作为世界观切入口。",
  ],
};

function extractImageNumber(imageUrl) {
  if (typeof imageUrl !== "string") return null;
  const m = imageUrl.match(/oc_(\d+)\.(jpg|jpeg|png|webp|gif)$/i);
  if (!m) return null;
  return Number(m[1]);
}

async function main() {
  const artworks = await prisma.artwork.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      imageUrl: true,
      tags: true,
    },
  });

  let updated = 0;
  const preview = [];

  for (let i = 0; i < artworks.length; i += 1) {
    const art = artworks[i];
    const category = titlePool[art.category] ? art.category : "oc";
    const imageNo = extractImageNumber(art.imageUrl);
    const baseIdx = imageNo ? imageNo - 1 : i;
    const t = titlePool[category][baseIdx % titlePool[category].length];
    const d = descPool[category][baseIdx % descPool[category].length];
    const title = `${t}${imageNo ? ` #${imageNo}` : ""}`;
    const tags = `${category},原创,精选`;

    await prisma.artwork.update({
      where: { id: art.id },
      data: {
        title,
        description: d,
        tags,
      },
    });

    updated += 1;
    if (preview.length < 12) {
      preview.push({
        id: art.id,
        category: art.category,
        title,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        total: artworks.length,
        updated,
        preview,
      },
      null,
      2,
    ),
  );
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

