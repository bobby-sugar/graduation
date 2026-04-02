const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  const ocFiles = fs
    .readdirSync(uploadsDir)
    .filter((name) => /^oc_\d+\.(jpg|jpeg|png|webp|gif)$/i.test(name))
    .sort((a, b) => {
      const na = Number((a.match(/\d+/) || [0])[0]);
      const nb = Number((b.match(/\d+/) || [0])[0]);
      return na - nb;
    });

  if (ocFiles.length === 0) {
    throw new Error("uploads 目录没有 oc_*.图片，无法替换");
  }

  const commissions = await prisma.commission.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (let i = 0; i < commissions.length; i += 1) {
    const file = ocFiles[i % ocFiles.length];
    await prisma.commission.update({
      where: { id: commissions[i].id },
      data: { previewImageUrl: `/uploads/${file}` },
    });
  }

  const seedRefCount = await prisma.commission.count({
    where: { previewImageUrl: { contains: "/uploads/seed-" } },
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        totalCommissions: commissions.length,
        ocImagePool: ocFiles.length,
        seedReferencesAfterUpdate: seedRefCount,
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

