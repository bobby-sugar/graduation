import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChatGateway } from "./chat.gateway";

/**
 * 在数据库事务提交后调用：按消息 id 拉取完整记录并推送给会话中的另一方（及除发送方外的参与者）。
 */
@Injectable()
export class ChatPushService {
  private readonly logger = new Logger(ChatPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async notifyFromMessageId(messageId: number): Promise<void> {
    try {
      const msg = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
          conversation: {
            select: { participant1Id: true, participant2Id: true },
          },
        },
      });
      if (!msg?.conversation) return;
      const { participant1Id, participant2Id } = msg.conversation;
      const recipients = [participant1Id, participant2Id].filter(
        (id) => id !== msg.senderId,
      );
      if (recipients.length === 0) return;
      this.chatGateway.notifyNewMessage(recipients, msg.conversationId, {
        id: msg.id,
        content: msg.content,
        createdAt: msg.createdAt,
        senderId: msg.senderId,
        sender: msg.sender.username,
        senderAvatar: msg.sender.avatarUrl,
      });
    } catch (e) {
      this.logger.warn(`chat push failed for message ${messageId}: ${String(e)}`);
    }
  }

  notifyFromMessageIds(messageIds: number[]): void {
    for (const id of messageIds) {
      void this.notifyFromMessageId(id);
    }
  }

  /** 通知某用户刷新点赞&评论类未读（可传多人，自动去重） */
  notifyNotificationRefresh(userIds: number[]): void {
    const seen = new Set<number>();
    for (const uid of userIds) {
      if (!Number.isFinite(uid) || uid < 1 || seen.has(uid)) continue;
      seen.add(uid);
      this.chatGateway.emitNotificationNew(uid);
    }
  }

  /** 约稿收件箱 / 我的约稿等：通知多个用户刷新（去重）；commissionId 可选 */
  notifyCommissionInboxRefresh(
    userIds: number[],
    commissionId?: number,
  ): void {
    const body =
      commissionId != null &&
      Number.isFinite(commissionId) &&
      commissionId > 0
        ? { commissionId }
        : {};
    const seen = new Set<number>();
    for (const uid of userIds) {
      if (!Number.isFinite(uid) || uid < 1 || seen.has(uid)) continue;
      seen.add(uid);
      this.chatGateway.emitCommissionInboxRefresh(uid, body);
    }
  }

  /** 按稿件上的 clientId / artistId 通知双方（忽略 null） */
  notifyCommissionInboxForParties(
    parties: {
      clientId?: number | null;
      artistId?: number | null;
    },
    commissionId?: number,
  ): void {
    const ids: number[] = [];
    if (parties.clientId != null && parties.clientId > 0) {
      ids.push(parties.clientId);
    }
    if (parties.artistId != null && parties.artistId > 0) {
      ids.push(parties.artistId);
    }
    this.notifyCommissionInboxRefresh(ids, commissionId);
  }

  /** 作品详情页：评论/回复/评论点赞后刷新列表 */
  notifyArtworkCommentsRefresh(artworkId: number): void {
    if (!Number.isFinite(artworkId) || artworkId < 1) return;
    this.chatGateway.emitArtworkCommentsRefresh(artworkId);
  }
}
