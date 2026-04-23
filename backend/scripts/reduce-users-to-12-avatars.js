/**
 * 将用户精简为恰好 12 个：必须保留 username 为 alice 的用户（不区分大小写），
 * 并依次为这 12 人设置 /uploads/avatar1.jpg … avatar12.jpg。
 * 其余用户及其关联数据（作品、评论、会话、约稿等）会被删除。
 *
 * 用法（在 backend 目录）：node scripts/reduce-users-to-12-avatars.js
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();
const AVATAR_EXT = ".jpg";
const SALT = 10;
const DEFAULT_PASSWORD = "password123";

/** 与 prisma/seed.ts 中 avatar2…12 一致，用于在精简用户时按槽位找回账号 */
const SEED_EMAILS_SLOTS_2_TO_12 = [
  "bob@example.com",
  "carol@example.com",
  "dave@example.com",
  "erin@example.com",
  "frank@example.com",
  "grace@example.com",
  "henry@example.com",
  "iris@example.com",
  "jack@example.com",
  "kate@example.com",
  "leo@example.com",
];

async function deleteCommentsForArtworkIds(artworkIds) {
  if (artworkIds.length === 0) return;
  let batch = 1;
  while (batch > 0) {
    const r = await prisma.comment.deleteMany({
      where: {
        artworkId: { in: artworkIds },
        replies: { none: {} },
      },
    });
    batch = r.count;
  }
}

async function deleteCommentsForUserIds(userIds) {
  if (userIds.length === 0) return;
  let batch = 1;
  while (batch > 0) {
    const r = await prisma.comment.deleteMany({
      where: {
        userId: { in: userIds },
        replies: { none: {} },
      },
    });
    batch = r.count;
  }
}

async function deleteArtworksByIds(artworkIds) {
  if (artworkIds.length === 0) return;
  await prisma.notification.deleteMany({ where: { artworkId: { in: artworkIds } } });
  await deleteCommentsForArtworkIds(artworkIds);
  await prisma.artworkLike.deleteMany({ where: { artworkId: { in: artworkIds } } });
  await prisma.favorite.deleteMany({ where: { artworkId: { in: artworkIds } } });
  await prisma.view.deleteMany({ where: { artworkId: { in: artworkIds } } });
  await prisma.artwork.deleteMany({ where: { id: { in: artworkIds } } });
}

async function purgeUsers(userIdsToDelete) {
  if (userIdsToDelete.length === 0) return;

  await prisma.notification.deleteMany({
    where: {
      OR: [{ userId: { in: userIdsToDelete } }, { fromUserId: { in: userIdsToDelete } }],
    },
  });

  const artworksTouching = await prisma.artwork.findMany({
    where: {
      OR: [{ authorId: { in: userIdsToDelete } }, { artistId: { in: userIdsToDelete } }],
    },
    select: { id: true },
  });
  await deleteArtworksByIds(artworksTouching.map((a) => a.id));

  await prisma.commission.deleteMany({
    where: {
      OR: [{ clientId: { in: userIdsToDelete } }, { artistId: { in: userIdsToDelete } }],
    },
  });

  await prisma.message.deleteMany({ where: { senderId: { in: userIdsToDelete } } });

  const convs = await prisma.conversation.findMany({
    where: {
      OR: [{ participant1Id: { in: userIdsToDelete } }, { participant2Id: { in: userIdsToDelete } }],
    },
    select: { id: true },
  });
  for (const c of convs) {
    await prisma.conversation.delete({ where: { id: c.id } });
  }

  await prisma.follow.deleteMany({
    where: {
      OR: [{ followerId: { in: userIdsToDelete } }, { followingId: { in: userIdsToDelete } }],
    },
  });

  await prisma.session.deleteMany({ where: { userId: { in: userIdsToDelete } } });
  await prisma.artworkLike.deleteMany({ where: { userId: { in: userIdsToDelete } } });
  await prisma.favorite.deleteMany({ where: { userId: { in: userIdsToDelete } } });
  await prisma.view.deleteMany({ where: { userId: { in: userIdsToDelete } } });

  await deleteCommentsForUserIds(userIdsToDelete);

  await prisma.user.deleteMany({ where: { id: { in: userIdsToDelete } } });
}

async function main() {
  const allUsers = await prisma.user.findMany({ orderBy: { id: "asc" } });
  const alice = allUsers.find((u) => u.username.toLowerCase() === "alice");
  if (!alice) {
    throw new Error("未找到用户 alice（username 不区分大小写），请先注册或改名后再执行。");
  }

  const keepOrdered = [alice.id];
  const used = new Set([alice.id]);

  for (let slot = 2; slot <= 12; slot += 1) {
    const num = String(slot).padStart(2, "0");
    const legacyEmail = `avatar_${num}@oc-web.local`;
    const legacyUsername = `avatar_${num}`;
    const canonicalEmail = SEED_EMAILS_SLOTS_2_TO_12[slot - 2];
    const canonicalUsername = canonicalEmail.split("@")[0];
    const found =
      allUsers.find((u) => u.email === canonicalEmail && !used.has(u.id)) ??
      allUsers.find((u) => u.email === legacyEmail && !used.has(u.id)) ??
      allUsers.find((u) => u.username === canonicalUsername && !used.has(u.id)) ??
      allUsers.find((u) => u.username === legacyUsername && !used.has(u.id));
    if (found) {
      keepOrdered.push(found.id);
      used.add(found.id);
    }
  }

  const rest = allUsers.filter((u) => !used.has(u.id));
  for (const u of rest) {
    if (keepOrdered.length >= 12) break;
    keepOrdered.push(u.id);
    used.add(u.id);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT);

  while (keepOrdered.length < 12) {
    const slot = keepOrdered.length + 1;
    const num = String(slot).padStart(2, "0");
    const created = await prisma.user.create({
      data: {
        username: `member_${num}`,
        email: `member_${num}@oc-web.local`,
        password: passwordHash,
        avatarUrl: `/uploads/avatar${slot}${AVATAR_EXT}`,
        bio: `演示账号 ${slot}（由 reduce-users-to-12-avatars 创建）`,
        location: "演示",
      },
    });
    keepOrdered.push(created.id);
  }

  const finalIds = keepOrdered.slice(0, 12);

  for (let i = 0; i < 12; i += 1) {
    const slot = i + 1;
    const id = finalIds[i];
    await prisma.user.update({
      where: { id },
      data: {
        avatarUrl: `/uploads/avatar${slot}${AVATAR_EXT}`,
      },
    });
  }

  const everyoneAfter = await prisma.user.findMany({ select: { id: true } });
  const toDelete = everyoneAfter.map((u) => u.id).filter((id) => !finalIds.includes(id));

  await purgeUsers(toDelete);

  const count = await prisma.user.count();
  const list = await prisma.user.findMany({
    select: { id: true, username: true, email: true, avatarUrl: true },
    orderBy: { id: "asc" },
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        remainingUsers: count,
        users: list,
        aliceKept: true,
        deletedUserCount: toDelete.length,
        newMembersPassword: DEFAULT_PASSWORD,
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
