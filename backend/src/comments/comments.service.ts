import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { ChatPushService } from "../realtime/chat-push.service";

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly chatPush: ChatPushService,
  ) {}

  findByArtwork(artworkId: number) {
    return this.prisma.comment.findMany({
      where: { artworkId, parentId: null },
      include: {
        user: true,
        replies: { include: { user: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** 从评论内容中解析 @用户名，返回对应用户 id 列表（去重，不含评论者本人） */
  private async parseMentionedUserIds(content: string, excludeUserId: number): Promise<number[]> {
    const match = content.matchAll(/@([a-zA-Z0-9_\u4e00-\u9fa5]+)/g);
    const usernames = [...new Set([...match].map((m) => m[1]))];
    if (usernames.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    return users.map((u) => u.id).filter((id) => id !== excludeUserId);
  }

  async create(dto: CreateCommentDto) {
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
    const mentionedIds = await this.parseMentionedUserIds(dto.content, dto.userId);
    if (mentionedIds.length > 0) {
      await this.notifications.createForMention({
        commentId: comment.id,
        artworkId: dto.artworkId,
        fromUserId: dto.userId,
        mentionedUserIds: mentionedIds,
      });
    }
    this.chatPush.notifyArtworkCommentsRefresh(dto.artworkId);
    return comment;
  }

  async like(id: number) {
    const updated = await this.prisma.comment.update({
      where: { id },
      data: { likes: { increment: 1 } },
      select: { id: true, likes: true, artworkId: true },
    });
    this.chatPush.notifyArtworkCommentsRefresh(updated.artworkId);
    return updated;
  }
}

