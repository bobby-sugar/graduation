const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  const allFiles = fs.readdirSync(uploadsDir);

  const avatarFiles = allFiles
    .filter((name) => {
      const m = name.match(/^oc_(\d+)\.(jpg|jpeg|png|webp|gif)$/i);
      if (!m) return false;
      const num = Number(m[1]);
      return num >= 28 && num <= 39;
    })
    .sort((a, b) => {
      const na = Number((a.match(/\d+/) || [0])[0]);
      const nb = Number((b.match(/\d+/) || [0])[0]);
      return na - nb;
    });

  const users = await prisma.user.findMany({
    select: { id: true, username: true, avatarUrl: true },
    orderBy: { id: "asc" },
  });

  const assignCount = Math.min(users.length, avatarFiles.length);
  const assignments = [];

  for (let i = 0; i < assignCount; i += 1) {
    const user = users[i];
    const file = avatarFiles[i];
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: `/uploads/${file}` },
    });
    assignments.push({
      userId: user.id,
      username: user.username,
      avatar: file,
    });
  }

  const result = {
    totalUsers: users.length,
    availableOc28To39Files: avatarFiles.length,
    updatedUsers: assignCount,
    insufficient: avatarFiles.length < users.length,
    missingCount: Math.max(0, users.length - avatarFiles.length),
    assignments,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
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

