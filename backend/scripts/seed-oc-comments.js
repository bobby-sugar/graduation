const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const commentPool = [
  "这个配色真的很稳，角色辨识度一下就出来了。",
  "服装细节很加分，尤其是配饰和领口处理。",
  "第一眼就记住了这个角色，气质很完整。",
  "光影层次做得不错，氛围感很到位。",
  "线条干净利落，整体完成度很高。",
  "角色设定很有故事感，想看更多相关内容。",
  "构图很舒服，视线会自然聚焦到角色表情。",
  "发丝和布料的表现很细腻，质感在线。",
  "这个 OC 设定挺抓人，名字和人设也很搭。",
  "颜色控制很舒服，画面看起来非常统一。",
  "表情处理很自然，情绪传达很准确。",
  "细节密度刚刚好，不会乱也不显空。",
];

const replyPool = [
  "同感，尤其是眼神这一块特别有记忆点。",
  "我也这么觉得，角色氛围很完整。",
  "这个细节我一开始都没注意到，你提得好。",
  "是的，整体完成度比很多商稿还高。",
  "这条评论说到点上了，设定真的很稳。",
  "我最喜欢这个配色方案，耐看。",
];

function pick(arr, idx) {
  return arr[idx % arr.length];
}

async function ensureComment({ artworkId, userId, content, parentId = null }) {
  const existing = await prisma.comment.findFirst({
    where: { artworkId, userId, content, parentId },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.comment.create({
    data: { artworkId, userId, content, parentId },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

async function main() {
  const [users, ocArtworks] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true },
      orderBy: { id: "asc" },
    }),
    prisma.artwork.findMany({
      where: { category: "oc" },
      select: { id: true, title: true, authorId: true },
      orderBy: { id: "asc" },
    }),
  ]);

  if (users.length < 2) {
    throw new Error("用户数量不足，至少需要 2 个用户才能生成评论。");
  }
  if (ocArtworks.length === 0) {
    throw new Error("未找到 OC 作品。");
  }

  let createdTopLevel = 0;
  let createdReplies = 0;
  const details = [];

  for (let i = 0; i < ocArtworks.length; i += 1) {
    const art = ocArtworks[i];
    const candidates = users.filter((u) => u.id !== art.authorId);
    if (candidates.length === 0) continue;

    // 每个 OC 作品补 3 条一级评论 + 1 条回复
    const c1 = pick(candidates, i);
    const c2 = pick(candidates, i + 2);
    const c3 = pick(candidates, i + 4);
    const r1 = pick(candidates, i + 1);

    const c1Text = pick(commentPool, i);
    const c2Text = pick(commentPool, i + 3);
    const c3Text = pick(commentPool, i + 6);
    const r1Text = pick(replyPool, i);

    const top1 = await ensureComment({
      artworkId: art.id,
      userId: c1.id,
      content: c1Text,
    });
    if (top1.created) createdTopLevel += 1;

    const top2 = await ensureComment({
      artworkId: art.id,
      userId: c2.id,
      content: c2Text,
    });
    if (top2.created) createdTopLevel += 1;

    const top3 = await ensureComment({
      artworkId: art.id,
      userId: c3.id,
      content: c3Text,
    });
    if (top3.created) createdTopLevel += 1;

    const reply = await ensureComment({
      artworkId: art.id,
      userId: r1.id,
      content: r1Text,
      parentId: top1.id,
    });
    if (reply.created) createdReplies += 1;

    details.push({
      artworkId: art.id,
      title: art.title,
      commenters: [c1.username, c2.username, c3.username],
      replier: r1.username,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ocArtworks: ocArtworks.length,
        createdTopLevel,
        createdReplies,
        totalCreated: createdTopLevel + createdReplies,
        sample: details.slice(0, 10),
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

