const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const targets = Array.from({ length: 12 }, (_, i) => 28 + i);

function pick(arr, i) {
  return arr[i % arr.length];
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { id: "asc" },
  });
  if (users.length === 0) {
    throw new Error("没有可用用户，无法分配发布者");
  }

  const styles = ["二次元", "厚涂", "写实", "Q版", "国风", "赛博"];
  const moods = ["日常", "奇幻", "科幻", "古风", "校园", "节日"];

  const summary = {
    created: 0,
    updated: 0,
    items: [],
  };

  for (let i = 0; i < targets.length; i += 1) {
    const n = targets[i];
    const user = pick(users, i);
    const style = pick(styles, i);
    const mood = pick(moods, i + 1);
    const imageUrl = `/uploads/oc_${n}.jpg`;
    const title = `OC角色设定 ${n} · ${style}`;
    const description = `OC_${n} 作品，风格：${style}，题材：${mood}。`;

    const existing = await prisma.artwork.findFirst({
      where: { imageUrl },
      select: { id: true },
    });

    if (existing) {
      const updated = await prisma.artwork.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          category: "oc",
          authorId: user.id,
          tags: `${style},${mood}`,
          likes: 35 + i * 2,
          views: 180 + i * 15,
        },
      });
      summary.updated += 1;
      summary.items.push({
        artworkId: updated.id,
        imageUrl,
        username: user.username,
        action: "updated",
      });
    } else {
      const created = await prisma.artwork.create({
        data: {
          title,
          description,
          imageUrl,
          category: "oc",
          authorId: user.id,
          tags: `${style},${mood}`,
          likes: 35 + i * 2,
          views: 180 + i * 15,
        },
      });
      summary.created += 1;
      summary.items.push({
        artworkId: created.id,
        imageUrl,
        username: user.username,
        action: "created",
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
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

