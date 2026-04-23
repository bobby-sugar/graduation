/**
 * 将 Cursor 项目 assets 中的一批参考图复制到 backend/uploads，并写入 category=oc 的作品（公开），
 * 轮流分配给当前库里的用户，附带适量评论与点赞。
 *
 * 默认源目录：%USERPROFILE%\.cursor\projects\c-Users-ROG-oc-web\assets
 * 可通过环境变量覆盖：OC_GALLERY_SOURCE_DIR
 *
 * 再次运行会先删除带标记 ocseed_g28 的同批次作品（及关联评论/点赞等）。
 *
 * 用法（在 backend 目录，需已配置 DATABASE_URL）：
 *   node scripts/seed-oc-gallery-from-cursor-assets.js
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
const SEED_TAG = "ocseed_g28";
const CARD_MARKER = "<<<OC_WEB_CARD_JSON>>>";

const DEFAULT_SOURCE_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor",
  "projects",
  "c-Users-ROG-oc-web",
  "assets",
);

/** 与对话中提供的 27 张文件名一致（位于上述 assets 目录） */
const GALLERY = [
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images__johan-untitled-main-camera-2-01-80ae33f6-da21-4c2c-8879-0fb88da48100.png",
    title: "赤绦疾影",
    gender: "男",
    tags: "OC,3D,赛博忍者,双刀,动态,数字雕刻",
    blurb:
      "义体臂与双刀的高张力姿态，用飘带强化速度感。个人世界观里的外勤特工，负责处理「越界」的走私义体。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_anastasia-fedorova--d861ef31-2e3f-4d1d-897e-9aedfdcb69d6.png",
    title: "승리的霓虹侧写",
    gender: "女",
    tags: "OC,3D,赛博朋克,肖像,韩系元素,科幻",
    blurb:
      "近未来都市里的情报掮客，配饰上的文字与冷色背景形成反差。设定上偏克制、少言，习惯用数据说话。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_aleksei-baidakov-love21-f7cd979a-d9cf-4457-b998-dae4c0f67a5d.png",
    title: "Love21 记录体",
    gender: "非二元",
    tags: "OC,3D,概念,软科幻,情绪向",
    blurb:
      "关于「记忆外包」主题的实验角色：外形柔和，内核是分布式备份节点。适合延展成短篇或动态漫分镜。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_alex-chen-zsuitx2-3a770d5c-406b-4ac5-a7ac-2fd92e7e617f.png",
    title: "Z-Suit 外骨骼试作",
    gender: "女",
    tags: "OC,3D,机甲,战术,硬表面",
    blurb:
      "轻量化外骨骼与贴身战斗服的组合，强调剪影与可读轮廓。后续可补全动力源与维护团队的设定。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_boell-oyino-boelloyino-leia-rdsgn01-art-56a60c78-0be0-4e65-9011-74d423ead506.png",
    title: "沙海信使",
    gender: "女",
    tags: "OC,插画,废土,旅行,肖像",
    blurb:
      "长途穿越荒漠的邮差型角色，装备务实、配色晒痕感强。故事线可接「遗失包裹」类悬疑任务。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_florianne-becker-1-a0e64d29-b2c0-4153-a804-4f11ec65d0ae.png",
    title: "薄暮庭院的守望",
    gender: "女",
    tags: "OC,3D,奇幻,肖像,柔光",
    blurb:
      "偏古典气质的守护型角色，光影柔和。适合作为剧情里「旧秩序」的象征或引路人。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_gang-zheng--dfe0882f-ed39-46f6-802f-9c663879f608.png",
    title: "青焰巡官",
    gender: "男",
    tags: "OC,3D,国风科幻,制服,肖像",
    blurb:
      "将传统纹样与现代职能制服结合，强调「可识别的公职身份」。性格设定可走冷面热心路线。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_florianne-becker-fly2023-02-copie2-88fb3cbf-1553-46a8-80ba-ff1f854e1878.png",
    title: "逆风信标",
    gender: "女",
    tags: "OC,3D,飞行,幻想,动态",
    blurb:
      "强调迎风姿态与布料解算的练习作延伸设定：空域测绘员，负责标记风暴走廊的安全航线。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_florianne-becker-schutzengels-53d406d8-9d9d-4521-be1a-6b3835636396.png",
    title: "守夜人偶",
    gender: "女",
    tags: "OC,3D,守护,哥特,氛围",
    blurb:
      "介于圣像与兵器之间的存在，沉默、可靠。适合作为小队里的「最后防线」型角色。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_hong-jung-woo-18-93488ccf-cfe4-430c-b15b-ca6bc9758a4f.png",
    title: "独眼锤卫",
    gender: "保密",
    tags: "OC,3D,Q版怪物,双锤,奇幻",
    blurb:
      "圆体独眼与双钉锤的反差萌战斗单位，可放在轻量关卡或搞笑支线里当精英怪。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-revel-01-c4c292c8-f086-4ef0-b536-608cf3855846.png",
    title: "街刃·青短发",
    gender: "女",
    tags: "OC,立绘,赛博,武士刀,街头",
    blurb:
      "街头武士与潮流穿搭的混搭，伤疤与配饰强化记忆点。适合做主视觉或角色立绘封面。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-revel-4-5ef29249-f737-402d-b9a8-5670be8d4c39.png",
    title: "盛夏训练记录",
    gender: "女",
    tags: "OC,3D,格斗,泳装主题,雕像感",
    blurb:
      "偏写实渲染的角色练习：强调体态与材质。设定为外勤特工的休假训练切片，与主线可弱关联。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-revel-beauty-color-12f06eba-67c2-46d3-8971-0b854c130571.png",
    title: "T 徽记少年",
    gender: "男",
    tags: "OC,3D,少年,机甲义肢,冒险",
    blurb:
      "大头身比与机械四肢形成可爱与力量的反差。腰带「T」可延展为组织代号或个人签名。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ioritz-muino-pertsonai-definitiboa0001-269fbd2f-cc2a-4799-ae64-cace647e7644.png",
    title: "莲池沉吟",
    gender: "女",
    tags: "OC,3D,奇幻,水景,情绪",
    blurb:
      "夜色、睡莲与蜷缩姿态共同烘托孤独感。适合作为章节插图或角色低谷期立绘。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_hyeonsick-choi-aruana-sick--33b97bcd-f7f1-430b-a058-fc1981445d18.png",
    title: "小鳄哈欠",
    gender: "保密",
    tags: "同人习作,3D,宝可梦,可爱,极简场景",
    blurb:
      "风格化材质与夸张表情的渲染练习。标注为同人习作，方便与原创 OC 分区展示。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_luis-donaldo-meza-07-eff6c7e2-7151-4636-9876-3c9c6932872c.png",
    title: "羽弓与鬼面",
    gender: "女",
    tags: "OC,3D,和弓,鬼面,奇幻",
    blurb:
      "传统弓道元素与妖魔狩猎叙事结合，装备细节可继续扩展符咒与箭种设定。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_jose-daniel-monsalve-1-e408be8f-118e-4507-92b7-3d4c5b50c1f6.png",
    title: "双色瞳与创可贴",
    gender: "女",
    tags: "OC,3D,异色瞳,潮酷,角色设计",
    blurb:
      "高对比配色与俏皮表情，适合偏轻松向的都市奇幻。可补全「地下偶像兼驱魔」一类人设。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_pengcheng-yang-dance3-singlesq-pathtracer-0001-4039884f-07f8-4b0e-9866-2471eedd4606.png",
    title: "墨潮赤袍",
    gender: "女",
    tags: "OC,插画,旗袍,长柄刀,水墨风",
    blurb:
      "水墨背景与红衣形成强对比，武器与身法暗示武斗派。适合作为战斗立绘或封面。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_mickael-lelievre-kaiminus-01-b1f6e971-740b-4bab-830b-2e32afe3e24f.png",
    title: "绿袖见习骑士",
    gender: "女",
    tags: "OC,立绘,奇幻,剑士,冒险",
    blurb:
      "偏写实立绘的冒险者形象：强调布料与金属材质对比，适合 RPG 队友卡。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_shafi-ahi-grandma-painting-0dbaf36e-db13-4b43-9797-da0e5d9aa0b7.png",
    title: "提灯草药婆婆",
    gender: "女",
    tags: "OC,插画,女巫,奇幻,氛围光",
    blurb:
      "暖色点光源与暗背景的经典组合，叙事感强。可接任务「深夜配方」或引导型 NPC。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_pedro-sobral-still-1-013-7311b9f8-8861-48cb-906e-0e72d4663d1e.png",
    title: "静物与侧光练习",
    gender: "保密",
    tags: "OC,3D,肖像,光影练习,写实",
    blurb:
      "以光影与材质为主的角色习作，档案里预留了后续补全姓名与阵营的空白。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_victoria-n-2-1506aaad-fbdc-4d35-a0c2-a965a5ca1396.png",
    title: "琉璃双丸",
    gender: "女",
    tags: "OC,插画,东方幻想,机关,华丽",
    blurb:
      "发饰与背负结构极具辨识度，适合作为设定集跨页或关键剧情「仪式」场角色。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ruan-zoe-asd3254345-99a8c7d7-80d9-47b7-91a6-9d0f53a6d534.png",
    title: "河边的沉默侍者",
    gender: "女",
    tags: "OC,插画,战斗女仆,反差,剧情向",
    blurb:
      "田园背景与危险细节形成反差，适合悬疑或黑色童话向短篇。可自行调整血腥表现的文字描述强度。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_xutunzi-20251215132132-70-74-a24eafe1-a17b-4390-a516-9ebbac6aabd4.png",
    title: "缄默修院战术课",
    gender: "女",
    tags: "OC,3D,修女,战术,枪械,肖像",
    blurb:
      "宗教视觉元素与现代武装的冲突感，适合作为「教团武装科」世界观下的角色样板。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_crazyred-shim-jae-woo-copy-c42d9c54-e8ef-4f90-9cc4-f4a524568c81.png",
    title: "墨环白发武者",
    gender: "女",
    tags: "OC,插画,水墨,长枪,战斗",
    blurb:
      "旋转构图与水墨笔触强化动感。设定可走「被通缉的宗门弃徒」一类长线剧情。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_demiurge-ash-kitchenmaid-3df802c3-afa6-4636-ad14-e24e1bda40df.png",
    title: "河岸余晖",
    gender: "女",
    tags: "OC,插画,女仆,风景,叙事",
    blurb:
      "偏电影感的单帧插画，强调场景与人物关系。适合作为视觉小说 CG 或章节封面。",
  },
  {
    file: "c__Users_ROG_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_-1-e3b4a23a-d97b-4848-8bce-14de421695e5.png",
    title: "未命名档案 #27",
    gender: "保密",
    tags: "OC,归档,待完善,概念",
    blurb:
      "占位型条目：图面信息较少，方便你在工作站里替换为正式标题、标签与完整设定。",
  },
];

const COMMENT_POOL = [
  "构图和光影都很稳，想多看几张同系列的！",
  "材质细节好耐看，已收藏等更新。",
  "人设一眼能记住，后续会补世界观吗？",
  "配色太舒服了，求过程或参考思路。",
  "这张当封面绝对吸睛。",
  "表情特别有戏，喜欢这种克制的感觉。",
  "武器/道具设计很完整，期待侧视图。",
  "氛围拉满，已转发给同好。",
];

function buildDescription(entry) {
  const meta = [
    "【档案补充】",
    `性别：${entry.gender}`,
    `标签摘要：${entry.tags}`,
    "",
    "互动说明：本页数据为本地演示批量导入，可在编辑页改为你的原创设定与版权声明。",
  ].join("\n");
  const cardJson = JSON.stringify({ v: 1, kind: "oc" });
  return `${entry.blurb}\n\n${meta}\n\n${CARD_MARKER}\n${cardJson}`;
}

async function purgePreviousBatch() {
  const prev = await prisma.artwork.findMany({
    where: { tags: { contains: SEED_TAG } },
    select: { id: true },
  });
  const ids = prev.map((r) => r.id);
  if (ids.length === 0) return;

  const comments = await prisma.comment.findMany({
    where: { artworkId: { in: ids } },
    select: { id: true },
  });
  const commentIds = comments.map((c) => c.id);
  if (commentIds.length) {
    await prisma.commentLike.deleteMany({ where: { commentId: { in: commentIds } } });
  }

  let guard = 0;
  while ((await prisma.comment.count({ where: { artworkId: { in: ids } } })) > 0 && guard < 80) {
    guard += 1;
    await prisma.comment.deleteMany({
      where: { artworkId: { in: ids }, replies: { none: {} } },
    });
  }

  await prisma.artworkLike.deleteMany({ where: { artworkId: { in: ids } } });
  await prisma.favorite.deleteMany({ where: { artworkId: { in: ids } } });
  await prisma.view.deleteMany({ where: { artworkId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { artworkId: { in: ids } } });
  await prisma.artwork.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const sourceDir = process.env.OC_GALLERY_SOURCE_DIR || DEFAULT_SOURCE_DIR;
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`源目录不存在: ${sourceDir}\n请设置 OC_GALLERY_SOURCE_DIR 指向包含 PNG 的文件夹。`);
  }

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true, username: true },
  });
  if (users.length < 2) {
    throw new Error("数据库中至少需要 2 个用户。请先运行 prisma seed 创建演示账号。");
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  await purgePreviousBatch();

  const baseTs = Date.now();
  let created = 0;

  for (let i = 0; i < GALLERY.length; i += 1) {
    const entry = GALLERY[i];
    const src = path.join(sourceDir, entry.file);
    if (!fs.existsSync(src)) {
      throw new Error(`缺少源文件: ${src}`);
    }

    const destName = `oc-g28-${baseTs}-${String(i + 1).padStart(2, "0")}.png`;
    const destAbs = path.join(UPLOAD_DIR, destName);
    fs.copyFileSync(src, destAbs);

    const author = users[i % users.length];
    const tagsWithMarker = `${entry.tags},${SEED_TAG}`;
    const imageUrl = `/uploads/${destName}`;

    const likeTarget = Math.min(11 + (i % 19), Math.max(1, users.length - 1));
    const views = 80 + ((i * 37) % 900);

    const artwork = await prisma.artwork.create({
      data: {
        title: entry.title,
        description: buildDescription(entry),
        imageUrl,
        category: "oc",
        ocPrivacy: "public",
        authorId: author.id,
        artistId: author.id,
        tags: tagsWithMarker,
        gender: entry.gender,
        likes: likeTarget,
        views,
      },
    });

    const likers = users.filter((u) => u.id !== author.id).slice(0, likeTarget);
    for (const u of likers) {
      await prisma.artworkLike.create({
        data: { userId: u.id, artworkId: artwork.id },
      });
    }

    const commenters = users.filter((u) => u.id !== author.id).slice(0, 3);
    for (let c = 0; c < commenters.length; c += 1) {
      const text = COMMENT_POOL[(i + c) % COMMENT_POOL.length];
      const com = await prisma.comment.create({
        data: {
          userId: commenters[c].id,
          artworkId: artwork.id,
          content: text,
        },
      });
      await prisma.notification.create({
        data: {
          type: "comment",
          userId: author.id,
          fromUserId: commenters[c].id,
          artworkId: artwork.id,
          commentId: com.id,
        },
      });
    }

    created += 1;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        sourceDir,
        users: users.length,
        message: `已写入 ${created} 条 OC（标记 ${SEED_TAG}），图片已复制到 uploads/oc-g28-*`,
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
  .finally(async () => {
    await prisma.$disconnect();
  });
