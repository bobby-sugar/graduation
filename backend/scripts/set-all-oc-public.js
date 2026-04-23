/**
 * 将所有 category=oc 的作品 ocPrivacy 设为 public（含原 private）。
 * Prisma 会从 backend/.env 读取 DATABASE_URL（在 backend 目录执行即可）。
 *
 * 用法（在 backend 目录）：node scripts/set-all-oc-public.js
 * 或：npm run oc:set-all-public
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    const r = await prisma.artwork.updateMany({
        where: { category: "oc" },
        data: { ocPrivacy: "public" },
    });
    // eslint-disable-next-line no-console
    console.log(`Updated ${r.count} OC row(s) to ocPrivacy=public.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
