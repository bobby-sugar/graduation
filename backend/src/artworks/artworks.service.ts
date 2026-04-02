import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ArtworksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async enrichWithInteractions(
    list: Array<{ id: number; [k: string]: unknown }>,
    userId: number,
  ) {
    const ids = list.map((a) => a.id);
    const [likedIds, commentedIds, viewedIds] = await Promise.all([
      this.prisma.artworkLike.findMany({ where: { userId, artworkId: { in: ids } }, select: { artworkId: true } }).then((r) => new Set(r.map((x) => x.artworkId))),
      this.prisma.comment.findMany({ where: { userId, artworkId: { in: ids } }, select: { artworkId: true } }).then((r) => new Set(r.map((x) => x.artworkId))),
      this.prisma.view.findMany({ where: { userId, artworkId: { in: ids } }, select: { artworkId: true } }).then((r) => new Set(r.map((x) => x.artworkId))),
    ]);
    return list.map((art) => ({
      ...art,
      isLiked: likedIds.has(art.id),
      isCommented: commentedIds.has(art.id),
      hasViewed: viewedIds.has(art.id),
    }));
  }

  private toListWithCommentCount<T extends { _count?: { comments?: number } }>(list: T[]) {
    return list.map((art) => {
      const { _count, ...rest } = art as T & { _count?: { comments?: number } };
      return { ...rest, commentCount: _count?.comments ?? 0 };
    });
  }

  async findAll(authorId?: number, userId?: number) {
    const list = await this.prisma.artwork.findMany({
      where: authorId ? { authorId } : undefined,
      include: { author: true, _count: { select: { comments: true } } },
      orderBy: { createdAt: "desc" },
    });
    const out = this.toListWithCommentCount(list);
    if (userId != null) return this.enrichWithInteractions(out, userId);
    return out;
  }

  /** 当前用户发布的作品（我的作品） */
  async findMine(userId: number) {
    const list = await this.prisma.artwork.findMany({
      where: { authorId: userId },
      include: { author: true, _count: { select: { comments: true } } },
      orderBy: { createdAt: "desc" },
    });
    const out = this.toListWithCommentCount(list);
    return this.enrichWithInteractions(out, userId);
  }

  /** 当前用户关注的作者发布的作品 */
  async findFromFollowing(userId: number) {
    const followings = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = followings.map((f) => f.followingId);
    if (followingIds.length === 0) return [];
    const list = await this.prisma.artwork.findMany({
      where: { authorId: { in: followingIds } },
      include: { author: true, _count: { select: { comments: true } } },
      orderBy: { createdAt: "desc" },
    });
    const out = this.toListWithCommentCount(list);
    return this.enrichWithInteractions(out, userId);
  }

  /** 当前用户收藏的作品 */
  async findFavorites(userId: number) {
    const favs = await this.prisma.favorite.findMany({
      where: { userId },
      select: { artworkId: true },
      orderBy: { createdAt: "desc" },
    });
    const ids = favs.map((f) => f.artworkId);
    if (ids.length === 0) return [];
    const list = await this.prisma.artwork.findMany({
      where: { id: { in: ids } },
      include: { author: true, _count: { select: { comments: true } } },
      orderBy: { createdAt: "desc" },
    });
    const out = this.toListWithCommentCount(list);
    return this.enrichWithInteractions(out, userId);
  }

  /**
   * 推荐算法（个性化版本）：
   * - 基础热度：点赞 / 浏览 / 时间衰减（所有用户共享的大致排序）
   * - 个性化因子（传入 userId 时）：
   *   - 已关注作者作品：加权 1.8x
   *   - 与用户互动过的作者（点赞 / 评论 / 收藏）：加权 1.4x
   *   - 与用户常看的标签重合：按重合度加 10%~40% 不等
   *   - 已浏览过的作品整体略微降权，未看过的作品略微升权
   * 这样不同账号因为关注 / 点赞 / 浏览 / 标签偏好不同，排序会明显不一样。
   */
  async findRecommended(userId?: number) {
    const list = await this.prisma.artwork.findMany({
      include: { author: true, _count: { select: { comments: true } } },
    });

    let followingIds = new Set<number>();
    let interactedAuthorIds = new Set<number>();
    let userInterestTags = new Set<string>();
    if (userId) {
      const [followings, likes, comments, favorites] = await Promise.all([
        this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        }),
        this.prisma.artworkLike.findMany({
          where: { userId },
          select: { artworkId: true, artwork: { select: { authorId: true, tags: true } } },
        }),
        this.prisma.comment.findMany({
          where: { userId },
          select: { artworkId: true, artwork: { select: { authorId: true, tags: true } } },
        }),
        this.prisma.favorite.findMany({
          where: { userId },
          select: { artworkId: true, artwork: { select: { authorId: true, tags: true } } },
        }),
      ]);

      // 关注作者
      followingIds = new Set(followings.map((f) => f.followingId));

      // 与用户有互动的作者 & 标签偏好
      const collectFrom = [...likes, ...comments, ...favorites];
      for (const item of collectFrom) {
        if (item.artwork?.authorId != null) {
          interactedAuthorIds.add(item.artwork.authorId);
        }
        const tags = item.artwork?.tags;
        if (tags) {
          tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((t) => userInterestTags.add(t));
        }
      }

    }

    const now = Date.now();
    const scored = list.map((art) => {
      const likes = art.likes ?? 0;
      const views = art.views ?? 0;
      const createdAt = art.createdAt.getTime();
      const daysSinceCreated = (now - createdAt) / (24 * 60 * 60 * 1000);

      // 基础热度 + 时间衰减（所有人共享）
      const popularity = likes * 2 + views + 1;
      const timeDecay = Math.pow(daysSinceCreated + 2, 1.2);
      let score = popularity / timeDecay;

      if (userId) {
        // 关注作者强加权
        if (followingIds.has(art.authorId)) score *= 1.8;

        // 与用户有互动的作者中度加权
        if (interactedAuthorIds.has(art.authorId) && !followingIds.has(art.authorId)) {
          score *= 1.4;
        }

        // 标签相似度：和用户偏好标签重合越多权重越高（最多 +40%）
        if (art.tags && userInterestTags.size > 0) {
          const tags = art.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const overlapCount = tags.filter((t) => userInterestTags.has(t)).length;
          if (overlapCount > 0) {
            const tagBoost = Math.min(0.4, overlapCount * 0.1); // 每个标签 +10%，最多 +40%
            score *= 1 + tagBoost;
          }
        }

        // 不对「已浏览/未浏览」做即时降权或升权：
        // 否则用户点进详情再返回，会因为一次浏览立刻触发列表重排，体验割裂。
        // 已浏览信息仍通过 hasViewed 返回给前端用于展示状态。
      }

      return { ...art, _score: score };
    });

    // 加稳定次排序，避免分数接近时列表抖动
    scored.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return b.id - a.id;
    });
    const out = this.toListWithCommentCount(scored.map(({ _score, ...art }) => art));
    if (userId != null) return this.enrichWithInteractions(out, userId);
    return out;
  }

  /** 记录用户查看作品（幂等），并增加作品浏览数 */
  async recordView(userId: number, artworkId: number) {
    // 使用 skipDuplicates 避免并发下唯一键冲突（P2002）
    const created = await this.prisma.view.createMany({
      data: [{ userId, artworkId }],
      skipDuplicates: true,
    });
    if (created.count > 0) {
      await this.prisma.artwork.update({
        where: { id: artworkId },
        data: { views: { increment: 1 } },
      });
    }
    return { viewed: true };
  }

  async findOne(id: number, userId?: number) {
    const art = await this.prisma.artwork.findUnique({
      where: { id },
      include: {
        author: true,
        artist: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!art) return null;
    if (userId == null) return art;
    const [liked, favorited] = await Promise.all([
      this.prisma.artworkLike.findUnique({ where: { userId_artworkId: { userId, artworkId: id } } }).then((r) => !!r),
      this.prisma.favorite.findUnique({ where: { userId_artworkId: { userId, artworkId: id } } }).then((r) => !!r),
    ]);
    return { ...art, isLiked: liked, isFavorited: favorited };
  }

  /** 点赞：已点则取消，未点则点赞 */
  async toggleLike(userId: number, artworkId: number) {
    const existing = await this.prisma.artworkLike.findUnique({
      where: { userId_artworkId: { userId, artworkId } },
    });
    if (existing) {
      await this.prisma.artworkLike.delete({ where: { id: existing.id } });
      await this.prisma.artwork.update({
        where: { id: artworkId },
        data: { likes: { decrement: 1 } },
      });
      return { liked: false };
    }
    await this.prisma.artworkLike.create({
      data: { userId, artworkId },
    });
    await this.prisma.artwork.update({
      where: { id: artworkId },
      data: { likes: { increment: 1 } },
    });
    // 点赞通知作品作者
    await this.notifications.createForArtworkAuthor({
      type: "like",
      artworkId,
      fromUserId: userId,
    });
    return { liked: true };
  }

  /** 取消点赞（DELETE 时调用） */
  async removeLike(userId: number, artworkId: number) {
    const existing = await this.prisma.artworkLike.findUnique({
      where: { userId_artworkId: { userId, artworkId } },
    });
    if (existing) {
      await this.prisma.artworkLike.delete({ where: { id: existing.id } });
      await this.prisma.artwork.update({
        where: { id: artworkId },
        data: { likes: { decrement: 1 } },
      });
    }
    return { liked: false };
  }

  /** 收藏：已收藏则取消，未收藏则收藏 */
  async toggleFavorite(userId: number, artworkId: number) {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_artworkId: { userId, artworkId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.favorite.create({
      data: { userId, artworkId },
    });
    return { favorited: true };
  }

  /** 取消收藏（DELETE 时调用） */
  async removeFavorite(userId: number, artworkId: number) {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_artworkId: { userId, artworkId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
    }
    return { favorited: false };
  }

  create(
    authorId: number,
    data: {
      title: string;
      description?: string;
      category: string;
      imageUrl?: string;
      tags?: string;
      gender?: string;
      artistId?: number;
    },
  ) {
    return this.prisma.artwork.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        imageUrl: data.imageUrl ?? null,
        tags: data.tags ?? null,
        gender: data.gender ?? null,
        authorId,
        artistId: data.artistId ?? null,
      },
      include: { author: true, artist: true },
    });
  }
}

