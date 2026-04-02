import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { PatchMeDto } from "./dto/patch-me.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        avatarPositionX: true,
        avatarPositionY: true,
        profileBackgroundUrl: true,
        backgroundPositionX: true,
        backgroundPositionY: true,
        bio: true,
        location: true,
        autoReplyMessage: true,
      },
    });
    if (!user) throw new NotFoundException("用户不存在");
    return user;
  }

  async updateMe(id: number, dto: PatchMeDto) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.autoReplyMessage !== undefined && {
          autoReplyMessage: dto.autoReplyMessage === "" ? null : dto.autoReplyMessage,
        }),
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        avatarPositionX: true,
        avatarPositionY: true,
        profileBackgroundUrl: true,
        backgroundPositionX: true,
        backgroundPositionY: true,
        bio: true,
        location: true,
        autoReplyMessage: true,
      },
    });
  }

  async findOnePublic(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        avatarPositionX: true,
        avatarPositionY: true,
        profileBackgroundUrl: true,
        backgroundPositionX: true,
        backgroundPositionY: true,
        bio: true,
        location: true,
      },
    });
    if (!user) throw new NotFoundException("用户不存在");
    return user;
  }

  async search(query: string, limit = 20) {
    const q = (query ?? "").trim();
    if (!q) return [];
    return this.prisma.user.findMany({
      where: {
        username: { contains: q },
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
      },
      take: limit,
    });
  }

  async findLikedArtworksPublic(userId: number) {
    const liked = await this.prisma.artworkLike.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        artwork: {
          include: {
            author: true,
            _count: { select: { comments: true } },
          },
        },
      },
    });
    return liked.map((item) => {
      const art = item.artwork;
      const { _count, ...rest } = art as any;
      return {
        ...rest,
        commentCount: _count?.comments ?? 0,
      };
    });
  }

  update(id: number, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }
}

