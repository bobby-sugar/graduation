const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  const allFiles = fs.readdirSync(uploadsDir);

  // 优先使用 avatar* 命名的专用头像文件
  const dedicatedAvatarFiles = allFiles
    .filter((name) => /^avatar.*\.(jpg|jpeg|png|webp|gif)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  // 再补充时间戳命名图片（兼容历史上传）
  const timestampAvatarFiles = allFiles
    .filter((name) => /^\d+\.(jpg|jpeg|png|webp|gif)$/i.test(name))
    .sort((a, b) => {
      const na = Number((a.match(/^\d+/) || [0])[0]);
      const nb = Number((b.match(/^\d+/) || [0])[0]);
      return nb - na; // 新文件优先
    });

  const avatarFiles = [...dedicatedAvatarFiles, ...timestampAvatarFiles];

  const users = await prisma.user.findMany({
    select: { id: true, username: true, avatarUrl: true },
    orderBy: { id: "asc" },
  });

  const assignCount = Math.min(users.length, avatarFiles.length);

  for (let i = 0; i < assignCount; i += 1) {
    const user = users[i];
    const file = avatarFiles[i];
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: `/uploads/${file}` },
    });
  }

  const result = {
    totalUsers: users.length,
    dedicatedAvatarFiles: dedicatedAvatarFiles.length,
    avatarFiles: avatarFiles.length,
    updatedUsers: assignCount,
    insufficient: avatarFiles.length < users.length,
    missingCount: Math.max(0, users.length - avatarFiles.length),
    usedFiles: avatarFiles.slice(0, assignCount),
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

