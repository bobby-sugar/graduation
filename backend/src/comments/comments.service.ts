import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { ChatPushService } from "../realtime/chat-push.service";
import { ArtworksService } from "../artworks/artworks.service";
import { PUBLIC_USER_SELECT } from "../users/user-public-select";

function isMissingCommentLikeTable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
    return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /CommentLike|comment_like/i.test(msg) &&
    /doesn't exist|不存在|Unknown table|Base table or view not found|no such table|1146/i.test(msg)
  );
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly chatPush: ChatPushService,
    private readonly artworks: ArtworksService,
  ) {}

  /** 拉取作品下全部评论并在内存中组树，支持任意层级的回复 */
  async findByArtwork(artworkId: number, viewerId?: number | null) {
    await this.artworks.assertMayViewArtworkForPublicApi(artworkId, viewerId);
    const rows = await this.prisma.comment.findMany({
      where: { artworkId },
      include: { user: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: "asc" },
    });
    const ids = rows.map((r) => r.id);
    const likedIds = new Set<number>();
    if (viewerId != null && ids.length > 0) {
      try {
        const mine = await this.prisma.commentLike.findMany({
          where: { userId: viewerId, commentId: { in: ids } },
          select: { commentId: true },
        });
        mine.forEach((l) => likedIds.add(l.commentId));
      } catch (e) {
        // 未执行 CommentLike 迁移、或 DB 异常时仍返回评论树，避免整页 500
        // eslint-disable-next-line no-console
        console.warn("commentLike batch lookup skipped", e);
      }
    }
    const byParent = new Map<number | null, typeof rows>();
    for (const row of rows) {
      const p = row.parentId ?? null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(row);
    }
    type Row = (typeof rows)[number];
    type CommentTreeDto = {
      id: number;
      content: string;
      likes: number;
      userId: number;
      artworkId: number;
      parentId: number | null;
      /** ISO 字符串，避免嵌套 Date 在部分运行环境下 JSON 序列化异常 */
      createdAt: string;
      user: { id: number; username: string; avatarUrl: string | null };
      isLiked: boolean;
      replies: CommentTreeDto[];
    };
    /** 只序列化安全字段，避免展开 Prisma 行带入不可 JSON 序列化的内容导致接口 500、前端列表为空 */
    const attach = (parentId: null | number): CommentTreeDto[] => {
      const children = byParent.get(parentId) ?? [];
      return children.map((c: Row) => {
        const u = c.user;
        const userDto =
          u != null
            ? { id: u.id, username: u.username, avatarUrl: u.avatarUrl }
            : { id: c.userId, username: "用户", avatarUrl: null as string | null };
        return {
          id: c.id,
          content: c.content,
          likes: c.likes,
          userId: c.userId,
          artworkId: c.artworkId,
          parentId: c.parentId,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
          user: userDto,
          isLiked: likedIds.has(c.id),
          replies: attach(c.id),
        };
      });
    };
    return attach(null);
  }

  async create(dto: CreateCommentDto) {
    await this.artworks.assertViewerMayAccessArtwork(dto.artworkId, dto.userId);
    const comment = await this.prisma.comment.create({ data: dto });
    if (dto.parentId) {
      await this.notifications.createForCommentReply({
        parentCommentId: dto.parentId,
        replyCommentId: comment.id,
        replyAuthorId: dto.userId,
        artworkId: dto.artworkId,
      });
    } else {
      await this.notifications.createForArtworkAuthor({
        type: "comment",
        artworkId: dto.artworkId,
        fromUserId: dto.userId,
        commentId: comment.id,
      });
    }
    this.chatPush.notifyArtworkCommentsRefresh(dto.artworkId);
    return comment;
  }

  /** 每个用户对每条评论仅计一次赞（幂等） */
  async like(commentId: number, userId: number) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, artworkId: true, likes: true },
    });
    if (!comment) {
      throw new NotFoundException("评论不存在");
    }
    await this.artworks.assertViewerMayAccessArtwork(comment.artworkId, userId);

    let existing: { userId: number; commentId: number } | null = null;
    try {
      existing = await this.prisma.commentLike.findUnique({
        where: {
          userId_commentId: { userId, commentId },
        },
      });
    } catch (e) {
      if (isMissingCommentLikeTable(e)) {
        throw new BadRequestException(
          "数据库缺少评论点赞表 CommentLike。请在 backend 目录执行：npx prisma migrate deploy",
        );
      }
      throw e;
    }
    if (existing) {
      return { id: comment.id, likes: comment.likes, artworkId: comment.artworkId, alreadyLiked: true };
    }

    const trx = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.commentLike.create({
          data: { userId, commentId },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const row = await tx.comment.findUnique({
            where: { id: commentId },
            select: { id: true, likes: true, artworkId: true },
          });
          if (!row) throw new NotFoundException("评论不存在");
          return { row, alreadyLiked: true as const };
        }
        if (isMissingCommentLikeTable(e)) {
          throw new BadRequestException(
            "数据库缺少评论点赞表 CommentLike。请在 backend 目录执行：npx prisma migrate deploy",
          );
        }
        throw e;
      }
      const row = await tx.comment.update({
        where: { id: commentId },
        data: { likes: { increment: 1 } },
        select: { id: true, likes: true, artworkId: true },
      });
      return { row, alreadyLiked: false as const };
    });

    if (trx.alreadyLiked) {
      return { ...trx.row, alreadyLiked: true };
    }

    try {
      await this.notifications.createForCommentLiked({ commentId, fromUserId: userId });
    } catch (e) {
      // 点赞已落库，通知失败不应让接口 500
      // eslint-disable-next-line no-console
      console.error("createForCommentLiked failed", e);
    }
    try {
      this.chatPush.notifyArtworkCommentsRefresh(trx.row.artworkId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("notifyArtworkCommentsRefresh failed", e);
    }
    return { ...trx.row, alreadyLiked: false };
  }
}
