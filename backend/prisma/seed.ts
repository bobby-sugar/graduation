import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  // 先清空旧数据（注意顺序：先删子表再删父表）
  await prisma.comment.deleteMany();
  await prisma.artwork.deleteMany();
  await prisma.user.deleteMany();

  // 创建多个示例用户
  const userSeeds = [
    {
      username: "Alice",
      email: "alice@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
      bio: "热爱二次元与原创角色设计的插画师。",
      location: "四川 成都",
    },
    {
      username: "Bob",
      email: "bob@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
      bio: "专注角色建模和次世代游戏美术。",
      location: "上海",
    },
    {
      username: "Mika",
      email: "mika@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=mika",
      bio: "独立漫画作者，喜欢讲温暖的小故事。",
      location: "北京",
    },
    {
      username: "Yuri",
      email: "yuri@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=yuri",
      bio: "偏爱赛博朋克与奇幻题材的概念设计师。",
      location: "广州",
    },
    {
      username: "Kane",
      email: "kane@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=kane",
      bio: "动画行业从业者，负责角色表情与动作设计。",
      location: "深圳",
    },
    {
      username: "Nana",
      email: "nana@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=nana",
      bio: "喜欢用色彩讲故事的原画师。",
      location: "杭州",
    },
  ];

  const users = await Promise.all(
    userSeeds.map(async (u) => {
      const hashedPassword = await bcrypt.hash(u.password, SALT_ROUNDS);
      return prisma.user.create({
        data: { ...u, password: hashedPassword },
      });
    })
  );

  // 创建专职画师账号（用于「约稿所得原画」的创作画师展示）
  const artistSeeds = [
    {
      username: "画师阿橘",
      email: "artist-aju@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=artist-aju",
      bio: "接稿画师，擅长 OC 立绘与角色插画。",
      location: "成都",
    },
    {
      username: "画师墨白",
      email: "artist-mobai@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=artist-mobai",
      bio: "自由插画师，主接角色设计与世界观概念。",
      location: "上海",
    },
    {
      username: "画师林深",
      email: "artist-linshen@example.com",
      password: "password123",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=artist-linshen",
      bio: "常驻约稿画师，擅长二次元与厚涂风格。",
      location: "杭州",
    },
  ];

  const artists = await Promise.all(
    artistSeeds.map(async (u) => {
      const hashedPassword = await bcrypt.hash(u.password, SALT_ROUNDS);
      return prisma.user.create({
        data: { ...u, password: hashedPassword },
      });
    })
  );

  const categories = ["oc", "worldview", "nienien", "emoji", "novel", "comic"] as const;

  // 创建 24 条示例作品；前 8 条设为约稿所得，创作画师为上面专职画师账号
  for (let index = 0; index < 24; index++) {
    const num = index + 1;
    const author = users[index % users.length];
    const category = categories[index % categories.length];
    const isCommissioned = index < 8;
    const artist = isCommissioned ? artists[index % artists.length] : undefined;

    await prisma.artwork.create({
      data: {
        title: `示例作品 ${num}`,
        description: `这是第 ${num} 号示例作品，属于「${category.toUpperCase()}」类别，用于展示首页的瀑布流和详情页布局效果。`,
        imageUrl: `/uploads/oc_${num}.jpg`,
        category,
        authorId: author.id,
        artistId: artist?.id,
        likes: randomInt(10, 500),
        views: randomInt(200, 5000),
      },
    });
  }

  // 创建一些示例约稿 / 接稿数据
  await prisma.commission.createMany({
    data: [
      {
        title: "角色立绘设计",
        description: "为游戏项目设计一张全身立绘，包含武器与配色方案。",
        category: "OC",
        price: 1500,
        status: "new",
        paymentStatus: "unpaid",
        paymentPercent: null,
        previewImageUrl: "/uploads/oc_1.jpg",
        submittedAt: new Date("2024-01-15T10:30:00"),
        confirmedAt: new Date("2024-01-15T11:00:00"),
        startLabel: "Feb 2024",
        endLabel: "Feb 28, 2024",
        clientId: users[0].id,
        artistId: users[1].id,
      },
      {
        title: "场景概念设计",
        description: "黄昏城市街角的氛围插画，用于动画项目前期视觉。",
        category: "世界观",
        price: 2500,
        status: "waitlist",
        paymentStatus: "unpaid",
        paymentPercent: null,
        previewImageUrl: "/uploads/oc_2.jpg",
        submittedAt: new Date("2024-01-14T14:20:00"),
        confirmedAt: new Date("2024-01-14T15:00:00"),
        startLabel: "Mar 2024",
        endLabel: "Mar 31, 2024",
        clientId: users[2].id,
        artistId: users[0].id,
      },
      {
        title: "表情包设计",
        description: "根据现有 OC 设计一套 12 张表情包，用于聊天软件。",
        category: "表情包",
        price: 800,
        status: "pending",
        paymentStatus: "hold",
        paymentPercent: null,
        previewImageUrl: "/uploads/oc_3.jpg",
        submittedAt: new Date("2024-01-13T09:15:00"),
        confirmedAt: new Date("2024-01-13T10:00:00"),
        startLabel: "Feb 2024",
        endLabel: "Mar 15, 2024",
        clientId: users[3].id,
        artistId: users[1].id,
      },
      {
        title: "小说封面设计",
        description: "轻小说封面插画设计，包含排版与 Logo。",
        category: "小说",
        price: 1200,
        status: "ready",
        paymentStatus: "paid",
        paymentPercent: null,
        previewImageUrl: "/uploads/oc_4.jpg",
        submittedAt: new Date("2024-01-12T11:00:00"),
        confirmedAt: new Date("2024-01-12T12:00:00"),
        startLabel: "Feb 2024",
        endLabel: "Feb 28, 2024",
        clientId: users[4].id,
        artistId: users[0].id,
      },
      {
        title: "品牌 Logo 设计",
        description: "为初创品牌设计主 Logo 与简单应用。",
        category: "商业设计",
        price: 5000,
        status: "new",
        paymentStatus: "unpaid",
        paymentPercent: null,
        previewImageUrl: "/uploads/oc_6.jpg",
        submittedAt: new Date("2024-01-15T09:00:00"),
        confirmedAt: new Date("2024-01-15T10:00:00"),
        startLabel: "Feb 2024",
        endLabel: "Feb 29, 2024",
        clientId: users[1].id,
        artistId: users[5].id,
      },
      {
        title: "产品宣传图",
        description: "科技产品官网与社交媒体用宣传插画。",
        category: "商业设计",
        price: 3500,
        status: "pending",
        paymentStatus: "paid",
        paymentPercent: null,
        previewImageUrl: "/uploads/oc_7.jpg",
        submittedAt: new Date("2024-01-14T13:20:00"),
        confirmedAt: new Date("2024-01-14T14:00:00"),
        startLabel: "Feb 2024",
        endLabel: "Mar 1, 2024",
        clientId: users[5].id,
        artistId: users[2].id,
      },
    ],
  });

  // 重新查出作品（带上 id），用于创建示例评论
  const artworks = await prisma.artwork.findMany({ orderBy: { id: "asc" } });

  if (artworks.length > 0) {
    const first = artworks[0];
    const second = artworks[1] ?? artworks[0];
    const third = artworks[2] ?? artworks[0];

    // 为前三个作品创建一些示例评论和回复
    await prisma.comment.createMany({
      data: [
        {
          content: "好喜欢这个角色的设计，色彩太棒了！",
          userId: users[0].id,
          artworkId: first.id,
          likes: randomInt(1, 20),
        },
        {
          content: "构图很舒服，有杂志插画的感觉。",
          userId: users[1].id,
          artworkId: first.id,
          likes: randomInt(1, 10),
        },
        {
          content: "黄昏的氛围超级到位，光影好柔和。",
          userId: users[2].id,
          artworkId: second.id,
          likes: randomInt(1, 15),
        },
        {
          content: "这套校园日常也太可爱了吧！",
          userId: users[3].id,
          artworkId: third.id,
          likes: randomInt(1, 8),
        },
      ],
    });

    // 简单创建一条带回复的评论（先创建父评论，再创建子回复）
    const parent = await prisma.comment.create({
      data: {
        content: "想看更多这个角色的设定稿！",
        userId: users[4].id,
        artworkId: first.id,
        likes: randomInt(1, 12),
      },
    });

    await prisma.comment.create({
      data: {
        content: "同感！如果能出一套表情包就更好了～",
        userId: users[5].id,
        artworkId: first.id,
        parentId: parent.id,
        likes: randomInt(0, 8),
      },
    });
  }

  console.log(
    `Seeded users: ${users.length}, 画师: ${artists.length}, artworks: 24, with sample comments.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

