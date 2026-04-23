/**
 * 为所有 category=oc 的作品增加点赞计数，并插入若干条评论（列表与推荐使用 likes 与 Comment 计数）。
 * 在 backend 目录执行：node scripts/bump-oc-likes-and-comments.js
 * 或：npm run bump:oc-engagement
 *
 * 说明：收件箱「点赞&评论」读的是 Notification 表。本脚本会为每条新评论写入 type=comment 的通知（与 API 发评一致）；
 * 点赞仅改 Artwork.likes 计数，不会在「点赞通知」里出现（真实点赞需走 POST /api/artworks/:id/like）。
 *
 * 可通过环境变量覆盖增量范围（均为整数）：
 *   OC_LIKE_MIN / OC_LIKE_MAX（每条 OC 增加的点赞数，默认 40～100）
 *   OC_COMMENT_MIN / OC_COMMENT_MAX（每条 OC 新增评论条数，默认 5～12）
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function envInt(name, fallback) {
    const v = process.env[name];
    if (v == null || v === "") return fallback;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

const COMMENT_TEMPLATES = [
    "设定好完整，喜欢！",
    "配色和气质都很贴角色～",
    "细节好多，已收藏",
    "这个角度太会了",
    "世界观感好强",
    "想蹲更多图",
    "线条好干净",
    "表情刻画绝了",
    "人设一眼记住",
    "光影好舒服",
    "故事感扑面而来",
    "配色好高级",
];

async function main() {
    const likeMin = envInt("OC_LIKE_MIN", 40);
    const likeMax = envInt("OC_LIKE_MAX", 100);
    const cMin = envInt("OC_COMMENT_MIN", 5);
    const cMax = envInt("OC_COMMENT_MAX", 12);

    if (likeMin > likeMax || cMin > cMax) {
        throw new Error("OC_*_MIN 不能大于 OC_*_MAX");
    }

    const users = await prisma.user.findMany({ select: { id: true } });
    if (users.length === 0) {
        throw new Error("数据库中无用户，无法插入评论");
    }

    const ocs = await prisma.artwork.findMany({
        where: { category: "oc" },
        select: { id: true, authorId: true, title: true },
    });

    let sumLikes = 0;
    let sumComments = 0;

    for (const oc of ocs) {
        const likeDelta = randInt(likeMin, likeMax);
        const nComments = randInt(cMin, cMax);

        const shuffled = [...users].sort(() => Math.random() - 0.5);
        const preferOthers = shuffled.filter((u) => u.id !== oc.authorId);
        const pool = preferOthers.length > 0 ? preferOthers : shuffled;

        const commentRows = [];
        for (let i = 0; i < nComments; i += 1) {
            const u = pool[i % pool.length];
            commentRows.push({
                content: COMMENT_TEMPLATES[i % COMMENT_TEMPLATES.length],
                userId: u.id,
                artworkId: oc.id,
            });
        }

        await prisma.$transaction(async (tx) => {
            await tx.artwork.update({
                where: { id: oc.id },
                data: { likes: { increment: likeDelta } },
            });
            for (const row of commentRows) {
                const created = await tx.comment.create({ data: row });
                if (oc.authorId !== row.userId) {
                    await tx.notification.create({
                        data: {
                            type: "comment",
                            userId: oc.authorId,
                            fromUserId: row.userId,
                            artworkId: oc.id,
                            commentId: created.id,
                        },
                    });
                }
            }
        });

        sumLikes += likeDelta;
        sumComments += nComments;
    }

    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify(
            {
                ocWorks: ocs.length,
                totalLikesAdded: sumLikes,
                totalCommentsInserted: sumComments,
                perOcLikeRange: [likeMin, likeMax],
                perOcCommentRange: [cMin, cMax],
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
