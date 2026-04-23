/**
 * 为「已有评论但缺少对应 Notification」的数据补写收件箱通知（与 CommentsService 行为一致）。
 * 仅补 parentId=null → type=comment 通知作者；子评论 → type=reply 通知被回复者。
 * 幂等：已存在同 commentId + type 则跳过。
 *
 * 用法（backend 目录）：node scripts/backfill-notifications-for-seeded-comments.js
 * 或：npm run backfill:comment-notifications
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    const tops = await prisma.comment.findMany({
        where: { parentId: null },
        include: { artwork: { select: { authorId: true } } },
    });
    let topN = 0;
    for (const c of tops) {
        if (!c.artwork || c.userId === c.artwork.authorId) continue;
        const has = await prisma.notification.findFirst({
            where: { commentId: c.id, type: "comment" },
            select: { id: true },
        });
        if (has) continue;
        await prisma.notification.create({
            data: {
                type: "comment",
                userId: c.artwork.authorId,
                fromUserId: c.userId,
                artworkId: c.artworkId,
                commentId: c.id,
            },
        });
        topN += 1;
    }

    const replies = await prisma.comment.findMany({
        where: { parentId: { not: null } },
        select: { id: true, userId: true, artworkId: true, parentId: true },
    });
    let repN = 0;
    for (const c of replies) {
        if (c.parentId == null) continue;
        const parent = await prisma.comment.findUnique({
            where: { id: c.parentId },
            select: { userId: true },
        });
        if (!parent || parent.userId === c.userId) continue;
        const has = await prisma.notification.findFirst({
            where: { commentId: c.id, type: "reply" },
            select: { id: true },
        });
        if (has) continue;
        await prisma.notification.create({
            data: {
                type: "reply",
                userId: parent.userId,
                fromUserId: c.userId,
                artworkId: c.artworkId,
                commentId: c.id,
            },
        });
        repN += 1;
    }

    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify(
            {
                topLevelCommentsChecked: tops.length,
                commentNotificationsCreated: topN,
                repliesChecked: replies.length,
                replyNotificationsCreated: repN,
            },
            null,
            2,
        ),
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
