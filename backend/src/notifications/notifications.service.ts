import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChatPushService } from "../realtime/chat-push.service";

export type NotificationType = "like" | "comment" | "reply" | "mention";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatPush: ChatPushService,
  ) {}

  async createForArtworkAuthor(params: {
    type: NotificationType;
    artworkId: number;
    fromUserId: number;
    commentId?: number;
  }) {
    const artwork = await this.prisma.artwork.findUnique({
      where: { id: params.artworkId },
      select: { authorId: true },
    });
    if (!artwork) return null;
    // 自己给自己点赞/评论不产生日志
    if (artwork.authorId === params.fromUserId) return null;
    const created = await this.prisma.notification.create({
      data: {
        type: params.type,
        userId: artwork.authorId,
        fromUserId: params.fromUserId,
        artworkId: params.artworkId,
        commentId: params.type === "comment" ? params.commentId : undefined,
      },
    });
    this.chatPush.notifyNotificationRefresh([artwork.authorId]);
    return created;
  }

  /** 有人回复了某条评论时，通知被回复评论的作者 */
  async createForCommentReply(params: {
    parentCommentId: number;
    replyCommentId: number;
    replyAuthorId: number;
    artworkId: number;
  }) {
    const parent = await this.prisma.comment.findUnique({
      where: { id: params.parentCommentId },
      select: { userId: true },
    });
    if (!parent || parent.userId === params.replyAuthorId) return null;
    const created = await this.prisma.notification.create({
      data: {
        type: "reply",
        userId: parent.userId,
        fromUserId: params.replyAuthorId,
        artworkId: params.artworkId,
        commentId: params.replyCommentId,
      },
    });
    this.chatPush.notifyNotificationRefresh([parent.userId]);
    return created;
  }

  /** 评论中 @了某人时，通知被 @ 的用户 */
  async createForMention(params: {
    commentId: number;
    artworkId: number;
    fromUserId: number;
    mentionedUserIds: number[];
  }) {
    const created = [];
    const recipients: number[] = [];
    for (const userId of params.mentionedUserIds) {
      if (userId === params.fromUserId) continue;
      const n = await this.prisma.notification.create({
        data: {
          type: "mention",
          userId,
          fromUserId: params.fromUserId,
          artworkId: params.artworkId,
          commentId: params.commentId,
        },
      });
      created.push(n);
      recipients.push(userId);
    }
    if (recipients.length > 0) {
      this.chatPush.notifyNotificationRefresh(recipients);
    }
    return created;
  }

  async findLikesAndComments(userId: number, opts?: { unreadOnly?: boolean; onlyType?: NotificationType }) {
    const list = await this.prisma.notification.findMany({
      where: {
        userId,
        type: opts?.onlyType,
        ...(opts?.unreadOnly ? { isRead: false } : {}),
      },
      include: {
        fromUser: true,
        artwork: true,
      },
      orderBy: { createdAt: "desc" },
    });
    // 评论/回复/提及类通知：按 commentId 取内容
    const commentIds = list
      .filter(
        (n) =>
          (n.type === "comment" || n.type === "reply" || n.type === "mention") && n.commentId != null,
      )
      .map((n) => n.commentId!);
    const commentMap = new Map<number, { content: string }>();
    if (commentIds.length > 0) {
      const byId = await this.prisma.comment.findMany({
        where: { id: { in: commentIds } },
        select: { id: true, content: true },
      });
      byId.forEach((c) => commentMap.set(c.id, { content: c.content }));
    }
    // 仅评论类：没有 commentId 或 id 查不到的旧数据，按「作品+评论人+时间」匹配
    const needFallback = list.filter(
      (n) =>
        n.type === "comment" &&
        n.artworkId != null &&
        n.fromUserId != null &&
        (n.commentId == null || !commentMap.has(n.commentId)),
    );
    const fallbackByNotifId = new Map<number, { content: string }>();
    if (needFallback.length > 0) {
      const pairs = Array.from(
        new Map(needFallback.map((n) => [`${n.artworkId!}_${n.fromUserId!}`, { artworkId: n.artworkId!, fromUserId: n.fromUserId! }])).values(),
      );
      const comments = await this.prisma.comment.findMany({
        where: {
          OR: pairs.map((p) => ({ artworkId: p.artworkId, userId: p.fromUserId })),
        },
        select: { artworkId: true, userId: true, content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      for (const n of needFallback) {
        const sameArtworkUser = comments.filter(
          (c) => c.artworkId === n.artworkId && c.userId === n.fromUserId && c.createdAt <= n.createdAt,
        );
        const match = sameArtworkUser[0] ?? comments.find((c) => c.artworkId === n.artworkId && c.userId === n.fromUserId);
        if (match) fallbackByNotifId.set(n.id, { content: match.content });
      }
    }
    return list.map((n) => {
      let comment: { content: string } | null = null;
      if (n.type === "comment" || n.type === "reply" || n.type === "mention") {
        if (n.commentId != null && commentMap.has(n.commentId)) {
          comment = commentMap.get(n.commentId)!;
        } else if (n.type === "comment") {
          comment = fallbackByNotifId.get(n.id) ?? null;
        }
      }
      return { ...n, comment };
    });
  }

  markRead(userId: number, id: number) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  markAllRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async unreadLikesCommentsCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }
}

