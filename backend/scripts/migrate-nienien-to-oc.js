/**
 * 将历史 category = nienien 的作品改为 oc（与前端 normalizeArtworkKind 一致）。
 * 用法（在 backend 目录）：node scripts/migrate-nienien-to-oc.js
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    const result = await prisma.artwork.updateMany({
        where: { category: "nienien" },
        data: { category: "oc" },
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ updatedRows: result.count }, null, 2));
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
