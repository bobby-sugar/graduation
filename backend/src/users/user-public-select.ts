import { Prisma } from "@prisma/client";

export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;
