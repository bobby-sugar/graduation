/**
 * 将 Cursor assets 中的一批参考图复制为稿件封面，写入 Commission（约稿 / 接稿），
 * 分配给数据库中已有用户；保证每名用户至少各有一条「约稿」与「接稿」。
 *
 * 源目录默认：%USERPROFILE%\.cursor\projects\c-Users-ROG-oc-web\assets
 * 可覆盖：COMMISSION_CURSOR_SOURCE_DIR
 *
 * 再次运行会删除描述中带标记的旧批次后重新插入（不删其它稿件）。
 *
 * 用法（在 backend 目录，需 DATABASE_URL）：
 *   node scripts/seed-commissions-cursor-images.js
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
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const SEED_MARKER = "<<<COMMISSION_SEED_CURSOR_IMAGES_2026>>>";

const PREFIX =
  "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_";

const DEFAULT_SOURCE_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor",
  "projects",
  "c-Users-ROG-oc-web",
  "assets",
);

/** 与 Cursor 保存的文件名一致；每条含接稿 / 约稿两套真实文案，脚本按方向择一写入 */
const ENTRIES = [
  {
    file: `${PREFIX}alex-chen-zsuitx2-10cc8b8d-754c-4569-b7a1-51523be75732.png`,
    category: "3D 角色",
    offerTitle: "硬表面机甲角色建模与渲染",
    offerDesc: `提供影视级硬表面流程：中模拓扑、细节雕刻、材质与灯光。擅长紧身外骨骼与发光件的表现，可按你提供的设定表拆件交付 Blender / FBX。
交付周期视复杂度 4–8 周，含三版构图小稿选一。
${SEED_MARKER}`,
    requestTitle: "约一套近未来外骨骼巡逻员立绘",
    requestDesc: `需要与现有世界观统一的「城市巡逻」单元：深色哑光装甲、少量蓝色发光条，偏写实比例。希望画师熟悉金属磨损与布料内衬层次。
预算与排期可商议，优先看过往硬表面或赛博题材案例。`,
    priceOffer: 12800,
    priceRequest: 9600,
  },
  {
    file: `${PREFIX}boell-oyino-boelloyino-leia-rdsgn01-art-f236cb13-8e7e-44c9-84d4-76cc8d4954eb.png`,
    category: "全身立绘",
    offerTitle: "科幻肖像与半身像委托",
    offerDesc: `承接偏电影光的肖像与半身构图，强调肤质与织物高光层次。可提供分层 PSD 与印刷用 CMYK 导出说明。
${SEED_MARKER}`,
    requestTitle: "星际题材女性角色宣传用半身像",
    requestDesc: `为独立游戏宣发征集一张半身主视觉：要求情绪克制、背景可简化深空或舱内。需与已有人设三视图对齐配色。
截稿前需线稿与配色各确认一版。`,
    priceOffer: 5200,
    priceRequest: 4800,
  },
  {
    file: `${PREFIX}_johan-untitled-main-camera-2-01-9cf8213b-834e-4ec1-ba56-0da7497eb624.png`,
    category: "3D 角色",
    offerTitle: "动感pose 3D角色与武器渲染",
    offerDesc: `擅长横向大透视与布料飘带动态，可做赛博忍者、义体战士类题材。含简单场景石头/暗背景布光，交付 4K PNG 序列或单帧。
${SEED_MARKER}`,
    requestTitle: "约一张横向飞身斩击的3D主视觉",
    requestDesc: `需要双刀+飘带的速度线构图，角色为原创OC，可提供粗模Pose参考。希望成品能直接用作众筹头图。`,
    priceOffer: 8900,
    priceRequest: 7500,
  },
  {
    file: `${PREFIX}aleksei-baidakov-love21-7a729df6-5588-4319-854b-bbd6c222e6cc.png`,
    category: "3D 角色",
    offerTitle: "软科幻情绪向角色渲染",
    offerDesc: `专注面部微表情与冷色环境氛围，可做专辑封面、MV静帧。支持小幅后期合成与标题安全区预留。
${SEED_MARKER}`,
    requestTitle: "音乐企划封面用3D肖像",
    requestDesc: `曲风偏合成器浪潮，想要雨夜霓虹反射与轻微胶片颗粒。人物为歌手虚拟形象，会提供面部扫描与服装参考。`,
    priceOffer: 6100,
    priceRequest: 5500,
  },
  {
    file: `${PREFIX}anastasia-fedorova--e7f05538-e489-4baf-af11-cdb886e37c73.png`,
    category: "肖像",
    offerTitle: "韩系科幻肖像与发型解算展示",
    offerDesc: `可做高精度毛发与金属配饰，输出旋转展示短视频（15s）+ 静帧。适合虚拟主播或品牌数字人。
${SEED_MARKER}`,
    requestTitle: "虚拟主播升级用头像图",
    requestDesc: `需要正面偏胸像，保留现有发色与耳饰识别点，背景纯色即可。希望文件带透明通道版本。`,
    priceOffer: 4200,
    priceRequest: 3800,
  },
  {
    file: `${PREFIX}florianne-becker-1-e7a73009-9fec-4042-aae1-a110905b1cae.png`,
    category: "全身立绘",
    offerTitle: "奇幻女性角色全身立绘",
    offerDesc: `偏写实笔刷的全身立绘，擅长皮革、金属与皮肤过渡。附简单纯色或渐变背景，可加武器道具。
${SEED_MARKER}`,
    requestTitle: "西幻女战士设定立绘",
    requestDesc: `为跑团卡面约一张站姿全身：皮甲+长剑，气质冷静。需要 PSD 分层以便后期做 token。`,
    priceOffer: 3600,
    priceRequest: 3200,
  },
  {
    file: `${PREFIX}florianne-becker-schutzengels-08e213be-3f05-4611-8429-dc4b8508b26a.png`,
    category: "插画",
    offerTitle: "守护天使主题氛围插画",
    offerDesc: `可做宗教感柔光、羽翼层次与布料褶皱，适合小说内插或卡牌大画。接受按章节批量折扣。
${SEED_MARKER}`,
    requestTitle: "轻小说卷首彩插：守护者与伤者",
    requestDesc: `场景为雪夜废墟，两人互动需有故事感，避免过度血腥。截稿与印刷出血规范会随合同一并提供。`,
    priceOffer: 5800,
    priceRequest: 5200,
  },
  {
    file: `${PREFIX}gang-zheng--81686aa9-b22f-47b8-9e35-bc9b39fec6a8.png`,
    category: "场景",
    offerTitle: "宏大场景与角色剪影合成",
    offerDesc: `擅长远景城市与体积雾，人物可做剪影或小比例叙事。交付分层文件便于排版加字。
${SEED_MARKER}`,
    requestTitle: "游戏主菜单背景图",
    requestDesc: `横版 21:9，需要可循环的远景与低对比前景，方便 UI 叠字。世界观文档约八千字可共享。`,
    priceOffer: 7200,
    priceRequest: 6800,
  },
  {
    file: `${PREFIX}florianne-becker-fly2023-02-copie2-a8ce393b-8b96-4d54-8ad5-42064be43e8f.png`,
    category: "插画",
    offerTitle: "奇幻飞行/跃起动态插画",
    offerDesc: `擅长裙摆与披风的大透视动态，可做封面或海报。支持三次以内修改节点写进合同。
${SEED_MARKER}`,
    requestTitle: "约一张「跃起施法」封面",
    requestDesc: `魔法阵元素需与已有图标风格统一，会提供矢量符号库。尺寸 A4 300dpi。`,
    priceOffer: 4800,
    priceRequest: 4400,
  },
  {
    file: `${PREFIX}hyeonsick-choi-aruana-sick--7f78ec73-d13f-4cc9-bdb8-56ef35a8e75d.png`,
    category: "3D 建模",
    offerTitle: "风格化生物与武器3D全流程",
    offerDesc: `从球体起型到 PBR 贴图、简单绑定与三视图渲染。适合独立游戏小怪或吉祥物级别资产。
${SEED_MARKER}`,
    requestTitle: "寻外包：独眼角斗士型小怪",
    requestDesc: `需要双持钝器、肩甲三片式结构，面数预算与引擎为 Unity。请附作品集与报价单。`,
    priceOffer: 15000,
    priceRequest: 12000,
  },
  {
    file: `${PREFIX}image-revel-beauty-color-51ccd5d9-1d37-4c65-9841-c2bed1532011.png`,
    category: "3D 角色",
    offerTitle: "写实运动主题角色渲染",
    offerDesc: `可做布料刺绣与运动装品牌贴图区域，支持高角度镜头与球场地面反射。交付调色 LUT 说明。
${SEED_MARKER}`,
    requestTitle: "品牌联动网球主题角色一张",
    requestDesc: `需遵守甲方 VI：遮阳帽与上衣字标按规范稿替换。拍摄级真实皮肤与球鞋材质。`,
    priceOffer: 11000,
    priceRequest: 9800,
  },
  {
    file: `${PREFIX}hong-jung-woo-18-679e6f50-e418-4eb9-ba60-9008b6fb84df.png`,
    category: "全身立绘",
    offerTitle: "废土生存风角色概念",
    offerDesc: `强调皮革磨损、网布层次与狼学派风格挂坠等叙事道具。可做设定表多视图加价套餐。
${SEED_MARKER}`,
    requestTitle: "桌游角色卡原画",
    requestDesc: `单卡竖版，背面暂不需要。希望保留粗犷质感与可读的小道具细节。`,
    priceOffer: 4500,
    priceRequest: 4000,
  },
  {
    file: `${PREFIX}image-revel-4-5a363ebd-5fb1-4345-ba97-fcc297c119be.png`,
    category: "3D 角色",
    offerTitle: "高精度泳装季角色雕像渲染",
    offerDesc: `可做沙滩底座、草帽编织与皮肤次表面散射，输出宣传级静帧。不接未授权商用角色，OC 与授权同人可接。
${SEED_MARKER}`,
    requestTitle: "授权同人夏日主题渲染",
    requestDesc: `已有官方造型参考与授权邮件，需 4K 竖版用于个人展架印刷。`,
    priceOffer: 8800,
    priceRequest: 8200,
  },
  {
    file: `${PREFIX}ioritz-muino-pertsonai-definitiboa0001-1a445791-3bca-440a-82f4-c2cd94770bbf.png`,
    category: "3D 建模",
    offerTitle: "Q版与风格化角色建模",
    offerDesc: `单眼生物、圆体角色等趣味造型经验丰富，含道具与简单展台。可导出 glTF。
${SEED_MARKER}`,
    requestTitle: "吉祥物3D化项目",
    requestDesc: `平面吉祥物已有三视图，需绑定简单待机动画用于直播挂件。`,
    priceOffer: 9800,
    priceRequest: 7600,
  },
  {
    file: `${PREFIX}jose-daniel-monsalve-1-2858bb97-9b08-48ac-ae8d-02ba6e101ac5.png`,
    category: "3D 角色",
    offerTitle: "卡通机器人少年模型",
    offerDesc: `金属与布料材质分区清晰，可做表情目标体与简单灯光三件套渲染。
${SEED_MARKER}`,
    requestTitle: "儿童向动画短片主角模型",
    requestDesc: `需与分镜节奏匹配的四个口型目标，交付 Maya 源文件。`,
    priceOffer: 13500,
    priceRequest: 11000,
  },
  {
    file: `${PREFIX}image-revel-01-89a2d894-f834-4817-878b-ce638c2d7d23.png`,
    category: "3D 角色",
    offerTitle: "俯视运动场景角色渲染",
    offerDesc: `擅长非对称构图与球场线条引导视线，网球与球拍道具可单独分层。
${SEED_MARKER}`,
    requestTitle: "体育品牌社交海报单帧",
    requestDesc: `方图与竖图各一，同一套灯光。模特姿态可微调但需保持仰视镜头语言。`,
    priceOffer: 9200,
    priceRequest: 8500,
  },
  {
    file: `${PREFIX}luis-donaldo-meza-07-86b71024-e150-4a21-858c-512eee3969f0.png`,
    category: "3D 角色",
    offerTitle: "收藏级雕像风角色渲染",
    offerDesc: `沙滩底座、织物与皮肤质感分层渲染，适合打印前预览与众筹展示。
${SEED_MARKER}`,
    requestTitle: "雕像众筹用主渲染图",
    requestDesc: `需多角度三视图加价可谈，首单先做正面主视觉。`,
    priceOffer: 7600,
    priceRequest: 7000,
  },
  {
    file: `${PREFIX}shafi-ahi-grandma-painting-81f4edb6-15c9-4b78-9f6f-f8a78af48114.png`,
    category: "角色设计",
    offerTitle: "奇幻老婆婆与氛围光插画",
    offerDesc: `擅长单光源叙事：提灯、药水瓶与破旧围裙等生活细节。可做 NPC 套图。
${SEED_MARKER}`,
    requestTitle: "寻画师：草药师 NPC 立绘",
    requestDesc: `需要表情差分两张（警觉/微笑），背景透明。用于像素 RPG 对话立绘。`,
    priceOffer: 3900,
    priceRequest: 3400,
  },
  {
    file: `${PREFIX}mickael-lelievre-kaiminus-01-3c738e08-e203-4b55-812e-0ac678b88ac8.png`,
    category: "3D 建模",
    offerTitle: "软萌生物玩具感渲染",
    offerDesc: `高光滑膜、薄荷色影棚背景，适合周边众筹与表情包三维衍生。
${SEED_MARKER}`,
    requestTitle: "约一系列「搪胶玩具风」同人渲染",
    requestDesc: `首只已定造型，后续五只排期半年。需统一灯光与背景色。`,
    priceOffer: 5600,
    priceRequest: 4800,
  },
  {
    file: `${PREFIX}ruan-zoe-asd3254345-74efc244-92b2-45ef-92f8-a495880ebf2c.png`,
    category: "插画",
    offerTitle: "国风战斗立绘与水墨背景",
    offerDesc: `红衣、长枪与泼墨背景结合，可做小说封面或卡牌闪卡工艺分层建议。
${SEED_MARKER}`,
    requestTitle: "古风武侠单行本封面",
    requestDesc: `书名位置预留顶部三分之一，需与出版社出血规范一致。`,
    priceOffer: 6200,
    priceRequest: 5800,
  },
  {
    file: `${PREFIX}pengcheng-yang-dance3-singlesq-pathtracer-0001-8d29af1b-9940-40ac-ab2a-80c87bf64493.png`,
    category: "3D 角色",
    offerTitle: "水面与睡莲场景角色渲染",
    offerDesc: `可做 SSR 水面、睡莲与半透明裙摆，情绪偏静谧内敛。交付 EXR 可选。
${SEED_MARKER}`,
    requestTitle: "展览用单幅「池畔」静帧",
    requestDesc: `打印幅面 60cm 短边，需 CMYK 软打样对接。`,
    priceOffer: 10500,
    priceRequest: 9900,
  },
  {
    file: `${PREFIX}pedro-sobral-still-1-013-f6ac742c-cb73-491e-8941-bd331fa19bb2.png`,
    category: "3D 角色",
    offerTitle: "和风武装弓道角色制作",
    offerDesc: `长弓、箭羽、羽织肩甲与能面挂饰等日式元素拆解清晰，可做设定集跨页。
${SEED_MARKER}`,
    requestTitle: "项目B角色半身上线宣传图",
    requestDesc: `需与已公开角色统一渲染参数与 LUT，资产组会提供材质球。`,
    priceOffer: 8400,
    priceRequest: 7800,
  },
  {
    file: `${PREFIX}xutunzi-20251215132132-70-74-d469cf85-48b3-4b03-955b-96e99b851c70.png`,
    category: "立绘",
    offerTitle: "西幻女骑士立绘与材质刻画",
    offerDesc: `剑鞘、金属腰甲与布料笔触平衡，白底便于后期抠图合成。
${SEED_MARKER}`,
    requestTitle: "TRPG 玩家人设立绘",
    requestDesc: `需提供卡面用圆角安全区，武器可略缩小以适配格子战棋。`,
    priceOffer: 3300,
    priceRequest: 3000,
  },
  {
    file: `${PREFIX}victoria-n-2-19471685-88f6-4c86-b0e6-a44073b38664.png`,
    category: "3D 角色",
    offerTitle: "高对比潮酷风3D半身",
    offerDesc: `异色瞳、滴落材质与几何背景可打包为品牌视觉延展。不接抄袭争议设定。
${SEED_MARKER}`,
    requestTitle: "个人OC三维转二维宣传",
    requestDesc: `希望基于现有三渲二模型输出一版插画向后期，附粉色块面背景草图。`,
    priceOffer: 6800,
    priceRequest: 5200,
  },
  {
    file: `${PREFIX}-1-003ba749-ebdd-41a6-95ea-e11eabe99f69.png`,
    category: "3D 角色",
    offerTitle: "战术修女风角色与道具整合",
    offerDesc: `蕾丝、珍珠与枪械硬表面结合，可做中近景叙事镜头。
${SEED_MARKER}`,
    requestTitle: "黑暗奇幻视觉小说立绘",
    requestDesc: `需多服装差分报价，首套为战斗修女造型。`,
    priceOffer: 7400,
    priceRequest: 6900,
  },
  {
    file: `${PREFIX}crazyred-shim-jae-woo-copy-b2e42b60-2f97-4e98-a172-f40efc15bf27.png`,
    category: "插画",
    offerTitle: "东方幻想机关人偶主题插画",
    offerDesc: `水色发髻、红绳与背后木机枢结构分层细致，适合设定集拉页。
${SEED_MARKER}`,
    requestTitle: "设定集跨页：机关傀儡师",
    requestDesc: `左页线稿右页成稿或双页连续图可商议，需印刷级分辨率。`,
    priceOffer: 8600,
    priceRequest: 8000,
  },
  {
    file: `${PREFIX}demiurge-ash-kitchenmaid-2388c516-6837-44fd-9b70-3487211beb64.png`,
    category: "插画",
    offerTitle: "叙事向战斗女仆与风景",
    offerDesc: `河岸、云层与武器血迹等剧情符号可分层调整强度，适合 18+ 项目分级标注。
${SEED_MARKER}`,
    requestTitle: "黑童话集插图一张",
    requestDesc: `编辑要求可切换「血迹可见/不可见」两版导出。`,
    priceOffer: 5100,
    priceRequest: 4600,
  },
];

async function purgeBatch() {
  await prisma.commission.deleteMany({
    where: { description: { contains: SEED_MARKER } },
  });
}

function pickSourceDir() {
  const fromEnv = process.env.COMMISSION_CURSOR_SOURCE_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  if (fs.existsSync(DEFAULT_SOURCE_DIR)) return DEFAULT_SOURCE_DIR;
  const repoAlt = path.join(__dirname, "..", "..", "assets", "seed-commission-covers");
  if (fs.existsSync(repoAlt)) return repoAlt;
  throw new Error(
    [
      "未找到稿件参考图源目录。任选其一：",
      `1) 使用 Cursor 默认 assets（对话里保存的图通常在此）：\n   ${DEFAULT_SOURCE_DIR}`,
      `2) 或将 27 张 PNG 放入仓库（文件名与脚本 ENTRIES 一致）：\n   ${repoAlt}`,
      "3) 或设置 COMMISSION_CURSOR_SOURCE_DIR 指向含 PNG 的文件夹",
    ].join("\n"),
  );
}

async function main() {
  const sourceDir = pickSourceDir();

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true, username: true },
  });
  if (users.length < 1) {
    throw new Error("数据库中没有用户，请先 prisma seed。");
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  for (const e of ENTRIES) {
    const src = path.join(sourceDir, e.file);
    if (!fs.existsSync(src)) {
      throw new Error(`缺少源文件: ${src}`);
    }
  }

  await purgeBatch();

  const U = users.length;
  const N = ENTRIES.length;
  const baseTs = Date.now();

  /** @type {import("@prisma/client").Prisma.CommissionCreateManyInput[]} */
  const rows = [];

  function pushRow(slotIndex, imageIndex, direction, userId) {
    const e = ENTRIES[imageIndex % N];
    const destName = `comm-cseed-${baseTs}-${String(slotIndex + 1).padStart(2, "0")}.png`;
    const src = path.join(sourceDir, e.file);
    const destAbs = path.join(UPLOAD_DIR, destName);
    fs.copyFileSync(src, destAbs);

    const isOffer = direction === "offer";
    const title = isOffer ? e.offerTitle : e.requestTitle;
    let description = isOffer ? e.offerDesc : e.requestDesc;
    if (!description.includes(SEED_MARKER)) {
      description = `${description}\n${SEED_MARKER}`;
    }

    rows.push({
      title,
      description,
      category: e.category,
      price: isOffer ? e.priceOffer : e.priceRequest,
      status: "new",
      paymentStatus: "unpaid",
      paymentPercent: null,
      previewImageUrl: `/uploads/${destName}`,
      submittedAt: new Date(baseTs - slotIndex * 37 * 60 * 1000),
      confirmedAt: null,
      startLabel: null,
      endLabel: null,
      direction,
      clientId: isOffer ? null : userId,
      artistId: isOffer ? userId : null,
    });
  }

  let slot = 0;
  let ii = 0;
  for (const u of users) {
    pushRow(slot++, ii % N, "offer", u.id);
    ii += 1;
    pushRow(slot++, ii % N, "commission", u.id);
    ii += 1;
  }
  while (ii < N) {
    const direction = ii % 2 === 0 ? "offer" : "commission";
    pushRow(slot++, ii % N, direction, users[ii % U].id);
    ii += 1;
  }

  await prisma.commission.createMany({ data: rows });
  // eslint-disable-next-line no-console
  console.log(
    `已写入 ${rows.length} 条稿件（源图 ${N} 张；每名用户各至少 1 条接稿 + 1 条约稿，其余图按序补充）。`,
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
