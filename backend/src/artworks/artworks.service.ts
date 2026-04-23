import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PUBLIC_USER_SELECT } from "../users/user-public-select";

const CARD_JSON_MARKER = "<<<OC_WEB_CARD_JSON>>>";

type ArtworkCardPayloadV1 = {
  v?: number;
  kind?: string;
  ocLinkedWorldviews?: Array<{
    artworkId: number;
    title: string;
    authorUsername?: string;
    authorId?: number;
    imageUrl?: string | null;
  }>;
  worldview?: {
    linkedOcsPreview?: Array<{
      artworkId: number;
      title: string;
      imageUrl?: string | null;
      authorUsername?: string;
    }>;
  };
};

@Injectable()
export class ArtworksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** OC / 世界观 / 表情包：复用 ocPrivacy 列；private 时仅作者可访问 */
  private static readonly LISTING_PRIVACY_CATEGORIES = ["oc", "worldview", "emoji"] as const;

  private static categoryUsesListingPrivacy(category: string): boolean {
    return ArtworksService.LISTING_PRIVACY_CATEGORIES.includes(
      category.toLowerCase() as (typeof ArtworksService.LISTING_PRIVACY_CATEGORIES)[number],
    );
  }

  /** OC / 世界观 / 表情包且 private 时仅作者可读/可操作 */
  viewerMayAccessOc(
    art: { category: string; ocPrivacy: string | null; authorId: number },
    viewerId?: number | null,
  ): boolean {
    if (!ArtworksService.categoryUsesListingPrivacy(art.category)) return true;
    if (art.ocPrivacy !== "private") return true;
    return viewerId != null && viewerId === art.authorId;
  }

  /** 列表/搜索：他人不可见的 private 作品（赞过列表等可复用） */
  artworkReadableWhereForViewer(viewerId?: number | null): Prisma.ArtworkWhereInput {
    return this.ocReadableWhere(viewerId);
  }

  /** 列表/搜索：他人不可见的 private（OC / 世界观 / 表情包） */
  private ocReadableWhere(viewerId?: number | null): Prisma.ArtworkWhereInput {
    const cats = [...ArtworksService.LISTING_PRIVACY_CATEGORIES];
    return {
      OR: [
        { NOT: { category: { in: cats } } },
        {
          AND: [
            { category: { in: cats } },
            { OR: [{ ocPrivacy: null }, { ocPrivacy: "public" }] },
          ],
        },
        ...(viewerId != null
          ? [
              {
                AND: [
                  { category: { in: cats } },
                  { ocPrivacy: "private" },
                  { authorId: viewerId },
                ],
              },
            ]
          : []),
      ],
    };
  }

  /** 个人主页：仅本人可见自己的 private（OC / 世界观 / 表情包） */
  private ocReadableWhereForProfile(
    profileAuthorId: number,
    viewerId?: number | null,
  ): Prisma.ArtworkWhereInput {
    const isSelf = viewerId != null && viewerId === profileAuthorId;
    const cats = [...ArtworksService.LISTING_PRIVACY_CATEGORIES];
    return {
      OR: [
        { NOT: { category: { in: cats } } },
        {
          AND: [
            { category: { in: cats } },
            { OR: [{ ocPrivacy: null }, { ocPrivacy: "public" }] },
          ],
        },
        ...(isSelf ? [{ AND: [{ category: { in: cats } }, { ocPrivacy: "private" }] }] : []),
      ],
    };
  }

  async assertViewerMayAccessArtwork(artworkId: number, viewerId: number) {
    let art: { id: number; authorId: number; category: string; ocPrivacy: string | null } | null = null;
    try {
      art = await this.prisma.artwork.findUnique({
        where: { id: artworkId },
        select: { id: true, authorId: true, category: true, ocPrivacy: true },
      });
    } catch (e) {
      if (!ArtworksService.missingOcPrivacyColumn(e)) throw e;
      const row = await this.prisma.artwork.findUnique({
        where: { id: artworkId },
        select: { id: true, authorId: true, category: true },
      });
      art = row ? { ...row, ocPrivacy: null } : null;
    }
    if (!art) {
      throw new NotFoundException("作品不存在");
    }
    if (!this.viewerMayAccessOc(art, viewerId)) {
      throw new ForbiddenException("无权访问该作品");
    }
  }

  /** 公开读接口：不可见时统一 404，避免探测 private 作品是否存在 */
  async assertMayViewArtworkForPublicApi(artworkId: number, viewerId?: number | null) {
    let art: { id: number; authorId: number; category: string; ocPrivacy: string | null } | null = null;
    try {
      art = await this.prisma.artwork.findUnique({
        where: { id: artworkId },
        select: { id: true, authorId: true, category: true, ocPrivacy: true },
      });
    } catch (e) {
      if (!ArtworksService.missingOcPrivacyColumn(e)) throw e;
      const row = await this.prisma.artwork.findUnique({
        where: { id: artworkId },
        select: { id: true, authorId: true, category: true },
      });
      art = row ? { ...row, ocPrivacy: null } : null;
    }
    if (!art || !this.viewerMayAccessOc(art, viewerId)) {
      throw new NotFoundException("作品不存在");
    }
  }

  /** 数据库尚未执行 ocPrivacy 迁移时 Prisma / 驱动会报错，用于回退写入/查询 */
  private static missingOcPrivacyColumn(e: unknown): boolean {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
      const col = (e.meta as { column?: unknown } | undefined)?.column;
      if (typeof col === "object" && col !== null && "name" in col) {
        return String((col as { name?: string }).name) === "ocPrivacy";
      }
      return true;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return (
      /ocPrivacy/i.test(msg) &&
      /Unknown column|does not exist|ER_BAD_FIELD_ERROR|no such column/i.test(msg)
    );
  }

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

  private splitDescriptionAndPayload(description: string | null | undefined): {
    prose: string;
    payload: ArtworkCardPayloadV1 | null;
  } {
    const full = typeof description === "string" ? description : "";
    const idx = full.lastIndexOf(CARD_JSON_MARKER);
    if (idx < 0) return { prose: full.trim(), payload: null };
    const prose = full.slice(0, idx).trim();
    const jsonPart = full.slice(idx + CARD_JSON_MARKER.length).trim();
    try {
      const parsed = JSON.parse(jsonPart) as ArtworkCardPayloadV1;
      if (parsed && typeof parsed === "object") {
        return { prose, payload: parsed };
      }
    } catch {
      // ignore malformed payload
    }
    return { prose: full.trim(), payload: null };
  }

  private appendPayloadToDescription(
    prose: string | null | undefined,
    payload: ArtworkCardPayloadV1,
  ): string {
    const base = (prose ?? "").trimEnd();
    const tail = `${CARD_JSON_MARKER}\n${JSON.stringify(payload)}`;
    return base ? `${base}\n\n${tail}` : tail;
  }

  private async cleanupPayloadLinksOnDelete(
    tx: Prisma.TransactionClient,
    deletedArtwork: { id: number; category: string },
  ) {
    if (deletedArtwork.category === "oc") {
      const hitRows = await tx.artwork.findMany({
        where: {
          category: "worldview",
          description: { contains: `"artworkId":${deletedArtwork.id}` },
        },
        select: { id: true, description: true },
      });
      for (const row of hitRows) {
        const parsed = this.splitDescriptionAndPayload(row.description);
        if (!parsed.payload?.worldview?.linkedOcsPreview?.length) continue;
        const nextPreview = parsed.payload.worldview.linkedOcsPreview.filter(
          (x) => x.artworkId !== deletedArtwork.id,
        );
        if (nextPreview.length === parsed.payload.worldview.linkedOcsPreview.length) continue;
        const nextPayload: ArtworkCardPayloadV1 = {
          ...parsed.payload,
          worldview: {
            ...parsed.payload.worldview,
            ...(nextPreview.length ? { linkedOcsPreview: nextPreview } : {}),
          },
        };
        if (nextPreview.length === 0) {
          delete nextPayload.worldview?.linkedOcsPreview;
        }
        await tx.artwork.update({
          where: { id: row.id },
          data: { description: this.appendPayloadToDescription(parsed.prose, nextPayload) },
        });
      }
      return;
    }

    if (deletedArtwork.category === "worldview") {
      const hitRows = await tx.artwork.findMany({
        where: {
          category: "oc",
          description: { contains: `"artworkId":${deletedArtwork.id}` },
        },
        select: { id: true, description: true },
      });
      for (const row of hitRows) {
        const parsed = this.splitDescriptionAndPayload(row.description);
        if (!parsed.payload?.ocLinkedWorldviews?.length) continue;
        const nextLinks = parsed.payload.ocLinkedWorldviews.filter(
          (x) => x.artworkId !== deletedArtwork.id,
        );
        if (nextLinks.length === parsed.payload.ocLinkedWorldviews.length) continue;
        const nextPayload: ArtworkCardPayloadV1 = {
          ...parsed.payload,
          ...(nextLinks.length ? { ocLinkedWorldviews: nextLinks } : {}),
        };
        if (nextLinks.length === 0) {
          delete nextPayload.ocLinkedWorldviews;
        }
        await tx.artwork.update({
          where: { id: row.id },
          data: { description: this.appendPayloadToDescription(parsed.prose, nextPayload) },
        });
      }
    }
  }

  async findAll(authorId?: number, userId?: number) {
    const privacyWhere = authorId
      ? { AND: [{ authorId }, this.ocReadableWhereForProfile(authorId, userId)] }
      : { AND: [this.ocReadableWhere(userId)] };
    const list = await this.prisma.artwork.findMany({
      where: privacyWhere,
      include: {
        author: { select: PUBLIC_USER_SELECT },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const out = this.toListWithCommentCount(list);
    if (userId != null) return this.enrichWithInteractions(out, userId);
    return out;
  }

  /** 可被世界观等关联的 OC（排除 private；无 ocPrivacy 列时退化为全部 oc） */
  async findLinkableOcs(query: string) {
    const term = (query ?? "").trim();
    const textOr = term
      ? [
            {
              OR: [
                { title: { contains: term } },
                { description: { contains: term } },
                { tags: { contains: term } },
                { author: { username: { contains: term } } },
              ],
            },
        ]
      : [];
    try {
      const privacyOk: Prisma.ArtworkWhereInput = {
        OR: [{ ocPrivacy: null }, { ocPrivacy: "public" }],
      };
      const list = await this.prisma.artwork.findMany({
        where: {
          category: "oc",
          AND: [privacyOk, ...textOr],
        },
        include: {
          author: { select: PUBLIC_USER_SELECT },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 120,
      });
      return this.toListWithCommentCount(list);
    } catch (e) {
      if (!ArtworksService.missingOcPrivacyColumn(e)) throw e;
      const list = await this.prisma.artwork.findMany({
        where: {
          category: "oc",
          ...(textOr.length ? { AND: textOr } : {}),
        },
        include: {
          author: { select: PUBLIC_USER_SELECT },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 120,
      });
      return this.toListWithCommentCount(list);
    }
  }

  async search(query: string, userId?: number) {
    const term = (query ?? "").trim();
    if (!term) return [];
    const list = await this.prisma.artwork.findMany({
      where: {
        AND: [
          this.ocReadableWhere(userId),
          {
            OR: [
              { title: { contains: term } },
              { description: { contains: term } },
              { tags: { contains: term } },
              { author: { username: { contains: term } } },
            ],
          },
        ],
      },
      include: {
        author: { select: PUBLIC_USER_SELECT },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    });
    const out = this.toListWithCommentCount(list);
    if (userId != null) return this.enrichWithInteractions(out, userId);
    return out;
  }

  /** 查询「在描述 payload 中关联到指定世界观」的 OC（跨作者） */
  async findOcsLinkedToWorldview(worldviewId: number, userId?: number) {
    const wv = await this.prisma.artwork.findUnique({
      where: { id: worldviewId },
      select: { id: true, category: true, ocPrivacy: true, authorId: true },
    });
    if (!wv || wv.category.toLowerCase() !== "worldview" || !this.viewerMayAccessOc(wv, userId ?? null)) {
      return [];
    }
    const list = await this.prisma.artwork.findMany({
      where: {
        category: "oc",
        description: { contains: `"artworkId":${worldviewId}` },
        AND: [this.ocReadableWhere(userId)],
      },
      include: {
        author: { select: PUBLIC_USER_SELECT },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    });
    const out = this.toListWithCommentCount(list);
    if (userId != null) return this.enrichWithInteractions(out, userId);
    return out;
  }

  /** 当前用户发布的作品（我的作品） */
  async findMine(userId: number) {
    const list = await this.prisma.artwork.findMany({
      where: {
        authorId: userId,
        AND: [this.ocReadableWhereForProfile(userId, userId)],
      },
      include: {
        author: { select: PUBLIC_USER_SELECT },
        _count: { select: { comments: true } },
      },
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
      where: {
        authorId: { in: followingIds },
        AND: [this.ocReadableWhere(userId)],
      },
      include: {
        author: { select: PUBLIC_USER_SELECT },
        _count: { select: { comments: true } },
      },
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
      where: {
        id: { in: ids },
        AND: [this.ocReadableWhere(userId)],
      },
      include: {
        author: { select: PUBLIC_USER_SELECT },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const out = this.toListWithCommentCount(list);
    return this.enrichWithInteractions(out, userId);
  }

  /**
   * 同分且个性化因子全相同时，次级排序若固定按作品 id，会导致不同用户看到完全相同的推荐序。
   * 在总分上加极小、与 (userId, artworkId) 相关的稳定扰动，打破该退化（量级 1e-6，不改变正常热度差带来的先后）。
   */
  private recommendationPerUserTieNoise(userId: number | undefined, artworkId: number): number {
    if (userId == null) return 0;
    let h = Math.imul(userId + 1, 0x9e3779b1) ^ Math.imul(artworkId, 0x85ebca6b);
    h |= 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h ^= h >>> 15;
    const unit = (h >>> 0) / 0xffffffff;
    return (unit - 0.5) * 1e-6;
  }

  /**
   * 推荐算法（个性化版本）：
   * - 基础热度：点赞 / 浏览 / 时间衰减（所有用户共享的大致排序）
   * - 个性化因子（传入 userId 时）：
   *   - 已关注作者作品：加权 1.8x
   *   - 与用户互动过的作者（点赞 / 评论 / 收藏）：加权 1.4x
   *   - 与用户常看的标签重合：按重合度加 10%~40% 不等
   * - 浏览记录不参与实时重排（避免详情返回后列表抖动）；`hasViewed` 仍下发给前端展示
   * - 同分退化：见 `recommendationPerUserTieNoise`
   */
  async findRecommended(userId?: number) {
    const list = await this.prisma.artwork.findMany({
      where: this.ocReadableWhere(userId),
      include: {
        author: { select: PUBLIC_USER_SELECT },
        _count: { select: { comments: true } },
      },
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

      score += this.recommendationPerUserTieNoise(userId, art.id);

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
    await this.assertViewerMayAccessArtwork(artworkId, userId);
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
        // 详情页展示作者简介；列表接口仍用 PUBLIC_USER_SELECT 即可
        author: { select: { ...PUBLIC_USER_SELECT, bio: true } },
        comments: {
          include: { user: { select: PUBLIC_USER_SELECT } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!art) return null;
    if (!this.viewerMayAccessOc(art, userId)) {
      return null;
    }
    if (userId == null) return art;
    const [liked, favorited] = await Promise.all([
      this.prisma.artworkLike.findUnique({ where: { userId_artworkId: { userId, artworkId: id } } }).then((r) => !!r),
      this.prisma.favorite.findUnique({ where: { userId_artworkId: { userId, artworkId: id } } }).then((r) => !!r),
    ]);
    return { ...art, isLiked: liked, isFavorited: favorited };
  }

  /** 点赞：已点则取消，未点则点赞 */
  async toggleLike(userId: number, artworkId: number) {
    await this.assertViewerMayAccessArtwork(artworkId, userId);
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
    await this.assertViewerMayAccessArtwork(artworkId, userId);
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
    await this.assertViewerMayAccessArtwork(artworkId, userId);
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
    await this.assertViewerMayAccessArtwork(artworkId, userId);
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_artworkId: { userId, artworkId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
    }
    return { favorited: false };
  }

  async create(
    authorId: number,
    data: {
      title: string;
      description?: string;
      category: string;
      imageUrl?: string;
      tags?: string;
      gender?: string;
      ocPrivacy?: string;
    },
  ) {
    const cat = String(data.category ?? "").toLowerCase();
    const usesPrivacy = ArtworksService.categoryUsesListingPrivacy(cat);
    const ocPrivacy =
      usesPrivacy && data.ocPrivacy === "private" ? "private" : usesPrivacy ? "public" : null;
    const base = {
      title: data.title,
      description: data.description ?? null,
      category: data.category,
      imageUrl: data.imageUrl ?? null,
      tags: data.tags ?? null,
      gender: data.gender ?? null,
      authorId,
      artistId: null,
    };
    try {
      return await this.prisma.artwork.create({
        data: { ...base, ocPrivacy },
        include: {
          author: { select: PUBLIC_USER_SELECT },
        },
      });
    } catch (e) {
      if (!ArtworksService.missingOcPrivacyColumn(e)) throw e;
      return await this.prisma.artwork.create({
        data: base,
        include: {
          author: { select: PUBLIC_USER_SELECT },
        },
      });
    }
  }

  async updateByAuthor(
    userId: number,
    artworkId: number,
    data: {
      title?: string;
      description?: string | null;
      imageUrl?: string | null;
      tags?: string | null;
      gender?: string | null;
      ocPrivacy?: string | null;
    },
  ) {
    const current = await this.prisma.artwork.findUnique({
      where: { id: artworkId },
      select: { id: true, authorId: true, category: true },
    });
    if (!current) throw new NotFoundException("作品不存在");
    if (current.authorId !== userId) {
      throw new ForbiddenException("只能编辑自己的作品");
    }
    const usesPrivacy = ArtworksService.categoryUsesListingPrivacy(current.category);
    const nextOcPrivacy =
      data.ocPrivacy === undefined
        ? undefined
        : !usesPrivacy
          ? null
          : data.ocPrivacy === "private"
            ? "private"
            : "public";
    try {
      return await this.prisma.artwork.update({
        where: { id: artworkId },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(nextOcPrivacy !== undefined ? { ocPrivacy: nextOcPrivacy } : {}),
        },
        include: {
          author: { select: PUBLIC_USER_SELECT },
          _count: { select: { comments: true } },
        },
      });
    } catch (e) {
      if (!ArtworksService.missingOcPrivacyColumn(e)) throw e;
      return await this.prisma.artwork.update({
        where: { id: artworkId },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
        },
        include: {
          author: { select: PUBLIC_USER_SELECT },
          _count: { select: { comments: true } },
        },
      });
    }
  }

  async removeByAuthor(userId: number, artworkId: number) {
    const current = await this.prisma.artwork.findUnique({
      where: { id: artworkId },
      select: { id: true, authorId: true, category: true },
    });
    if (!current) throw new NotFoundException("作品不存在");
    if (current.authorId !== userId) {
      throw new ForbiddenException("只能删除自己的作品");
    }
    await this.prisma.$transaction(async (tx) => {
      await this.cleanupPayloadLinksOnDelete(tx, { id: artworkId, category: current.category });
      const commentRows = await tx.comment.findMany({
        where: { artworkId },
        select: { id: true },
      });
      const commentIds = commentRows.map((c) => c.id);
      if (commentIds.length > 0) {
        await tx.notification.deleteMany({ where: { commentId: { in: commentIds } } });
      }
      await tx.notification.deleteMany({ where: { artworkId } });
      if (commentIds.length > 0) {
        await tx.commentLike.deleteMany({ where: { commentId: { in: commentIds } } });
      }
      /** 评论含 parentId 自引用，单次 deleteMany 在 MySQL 上易触发外键错误；按叶子优先逐批删除（与 seed 脚本一致） */
      let guard = 0;
      let removedComments = 1;
      while (removedComments > 0 && guard < 5000) {
        guard += 1;
        const r = await tx.comment.deleteMany({
          where: { artworkId, replies: { none: {} } },
        });
        removedComments = r.count;
      }
      if (guard >= 5000) {
        throw new Error("删除评论时超过安全轮数，可能存在异常数据，已中止删除作品。");
      }
      await tx.artworkLike.deleteMany({ where: { artworkId } });
      await tx.favorite.deleteMany({ where: { artworkId } });
      await tx.view.deleteMany({ where: { artworkId } });
      await tx.artwork.delete({ where: { id: artworkId } });
    });
    return { success: true };
  }
}

