import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

/** 与 `backend/uploads/avatar1.jpg` … `avatar12.jpg` 一一对应；请自行放入 12 张图（扩展名需与此一致） */
const AVATAR_COUNT = 12;
const AVATAR_EXT = ".jpg";
const DEMO_PASSWORD = "password123";

/**
 * 第 2–12 号头像：用户名与邮箱与 alice 同风格（小写英文名 + @example.com），便于本地切换账号登录。
 * 若库里仍是旧数据（avatar_02@oc-web.local 或用户名 avatar_XX），seed 会合并到同一账号并改邮箱。
 */
const SEED_USERS_FOR_AVATARS_2_TO_12: Array<{
  username: string;
  email: string;
  bio: string;
  location: string;
}> = [
  {
    username: "bob",
    email: "bob@example.com",
    bio: "演示账号 bob，对应头像 avatar2。",
    location: "演示",
  },
  {
    username: "carol",
    email: "carol@example.com",
    bio: "演示账号 carol，对应头像 avatar3。",
    location: "演示",
  },
  {
    username: "dave",
    email: "dave@example.com",
    bio: "演示账号 dave，对应头像 avatar4。",
    location: "演示",
  },
  {
    username: "erin",
    email: "erin@example.com",
    bio: "演示账号 erin，对应头像 avatar5。",
    location: "演示",
  },
  {
    username: "frank",
    email: "frank@example.com",
    bio: "演示账号 frank，对应头像 avatar6。",
    location: "演示",
  },
  {
    username: "grace",
    email: "grace@example.com",
    bio: "演示账号 grace，对应头像 avatar7。",
    location: "演示",
  },
  {
    username: "henry",
    email: "henry@example.com",
    bio: "演示账号 henry，对应头像 avatar8。",
    location: "演示",
  },
  {
    username: "iris",
    email: "iris@example.com",
    bio: "演示账号 iris，对应头像 avatar9。",
    location: "演示",
  },
  {
    username: "jack",
    email: "jack@example.com",
    bio: "演示账号 jack，对应头像 avatar10。",
    location: "演示",
  },
  {
    username: "kate",
    email: "kate@example.com",
    bio: "演示账号 kate，对应头像 avatar11。",
    location: "演示",
  },
  {
    username: "leo",
    email: "leo@example.com",
    bio: "演示账号 leo，对应头像 avatar12。",
    location: "演示",
  },
];

async function upsertAvatarSlotUser(args: {
  slotIndex: number;
  passwordHash: string;
  profile: (typeof SEED_USERS_FOR_AVATARS_2_TO_12)[number];
}) {
  const { slotIndex, passwordHash, profile } = args;
  const num = String(slotIndex).padStart(2, "0");
  const legacyEmail = `avatar_${num}@oc-web.local`;
  const legacyUsername = `avatar_${num}`;
  const avatarUrl = `/uploads/avatar${slotIndex}${AVATAR_EXT}`;

  const byNewEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  const byLegacyEmail = await prisma.user.findUnique({ where: { email: legacyEmail } });
  const byUsername = await prisma.user.findUnique({ where: { username: profile.username } });
  const byLegacyUsername = await prisma.user.findUnique({ where: { username: legacyUsername } });

  const existing =
    byNewEmail ?? byLegacyEmail ?? byUsername ?? byLegacyUsername ?? null;

  const data = {
    username: profile.username,
    email: profile.email,
    password: passwordHash,
    avatarUrl,
    bio: profile.bio,
    location: profile.location,
  };

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.user.create({ data });
  }
}

/**
 * 安全种子：不执行任何 delete，不会清空作品/约稿/用户。
 * alice → avatar1.jpg；bob…leo → avatar2…12，邮箱均为 *@example.com。
 */
async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  await prisma.user.upsert({
    where: { username: "alice" },
    create: {
      username: "alice",
      email: "alice@example.com",
      password: passwordHash,
      avatarUrl: `/uploads/avatar1${AVATAR_EXT}`,
      bio: "站长演示账号 alice，对应头像 avatar1。",
      location: "演示",
    },
    update: {
      avatarUrl: `/uploads/avatar1${AVATAR_EXT}`,
      bio: "站长演示账号 alice，对应头像 avatar1。",
    },
  });

  for (let i = 2; i <= AVATAR_COUNT; i += 1) {
    const profile = SEED_USERS_FOR_AVATARS_2_TO_12[i - 2];
    if (!profile) {
      throw new Error(`seed: 缺少头像 slot ${i} 对应的用户资料`);
    }
    await upsertAvatarSlotUser({ slotIndex: i, passwordHash, profile });
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        message: "已写入：alice + bob…leo（邮箱均为 @example.com，密码与 alice 相同）",
        alice: {
          username: "alice",
          email: "alice@example.com",
          avatarUrl: `/uploads/avatar1${AVATAR_EXT}`,
        },
        others: SEED_USERS_FOR_AVATARS_2_TO_12.map((p, j) => ({
          username: p.username,
          email: p.email,
          avatarUrl: `/uploads/avatar${j + 2}${AVATAR_EXT}`,
        })),
        password: DEMO_PASSWORD,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
