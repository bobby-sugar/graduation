const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.commission.findMany({
    where: {
      direction: "offer",
      OR: [
        { title: { contains: "111" } },
        { artist: { username: { contains: "111" } } },
        { client: { username: { contains: "111" } } },
      ],
    },
    include: {
      artist: { select: { id: true, username: true } },
      client: { select: { id: true, username: true } },
    },
    orderBy: { id: "asc" },
  });

  const ids = targets.map((t) => t.id);
  if (ids.length === 0) {
    // eslint-disable-next-line no-console
    console.log("no matching offer commissions found");
    return;
  }

  await prisma.commission.deleteMany({
    where: { id: { in: ids } },
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        deletedCount: ids.length,
        deleted: targets.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist?.username ?? null,
          client: t.client?.username ?? null,
        })),
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

