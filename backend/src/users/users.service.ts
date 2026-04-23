import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ArtworksService } from "../artworks/artworks.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { PatchMeDto } from "./dto/patch-me.dto";
import { PUBLIC_USER_SELECT } from "./user-public-select";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly artworks: ArtworksService,
  ) {}

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

  /** 与作品列表一致的 OC 隐私：他人不可见 private；登录者可看自己为作者的 private */
  async findLikedArtworksPublic(userId: number, viewerId?: number | null) {
    const liked = await this.prisma.artworkLike.findMany({
      where: {
        userId,
        artwork: this.artworks.artworkReadableWhereForViewer(viewerId ?? null),
      },
      orderBy: { createdAt: "desc" },
      select: {
        artwork: {
          include: {
            author: { select: PUBLIC_USER_SELECT },
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
      select: {
        id: true,
        username: true,
        email: true,
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
  }
}

