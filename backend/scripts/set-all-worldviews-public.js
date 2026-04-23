/**
 * 将所有 category=worldview 的作品 ocPrivacy 设为 public。
 * Prisma 会从 backend/.env 读取 DATABASE_URL（在 backend 目录执行即可）。
 *
 * 用法（在 backend 目录）：node scripts/set-all-worldviews-public.js
 * 或：npm run worldview:set-all-public
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    const r = await prisma.artwork.updateMany({
        where: { category: "worldview" },
        data: { ocPrivacy: "public" },
    });
    // eslint-disable-next-line no-console
    console.log(`Updated ${r.count} worldview row(s) to ocPrivacy=public.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
