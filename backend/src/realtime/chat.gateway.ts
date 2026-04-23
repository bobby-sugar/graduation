import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";

export type ChatMessagePushPayload = {
  id: number;
  content: string;
  createdAt: Date;
  senderId: number;
  sender: string;
  senderAvatar: string | null;
};

@WebSocketGateway({
  cors: { origin: true },
  transports: ["websocket", "polling"],
})
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async canViewArtworkRoom(
    artworkId: number,
    viewerId: number | null,
  ): Promise<boolean> {
    const art = await this.prisma.artwork.findUnique({
      where: { id: artworkId },
      select: { category: true, ocPrivacy: true, authorId: true },
    });
    if (!art) return false;
    const c = art.category.toLowerCase();
    const gated = c === "oc" || c === "worldview" || c === "emoji";
    if (!gated || art.ocPrivacy !== "private") return true;
    return viewerId != null && viewerId === art.authorId;
  }

  async handleConnection(client: Socket) {
    const data = client.data as { guest?: boolean; userId?: number };
    const raw =
      typeof client.handshake.auth?.token === "string"
        ? client.handshake.auth.token
        : typeof client.handshake.query?.token === "string"
          ? client.handshake.query.token
          : null;
    if (!raw) {
      data.guest = true;
      return;
    }
    try {
      const secret =
        this.config.get<string>("JWT_SECRET") ?? "oc-web-dev-secret";
      const payload = this.jwtService.verify<{
        sub?: number | string;
        type?: string;
        sid?: string;
      }>(raw, { secret });
      if (payload.type && payload.type !== "access") {
        client.disconnect(true);
        return;
      }
      const uid = Number(payload.sub);
      if (!Number.isFinite(uid)) {
        client.disconnect(true);
        return;
      }
      const sid = typeof payload.sid === "string" ? payload.sid.trim() : "";
      if (sid) {
        const session = await this.prisma.session.findFirst({
          where: { id: sid, userId: uid, revokedAt: null },
        });
        if (!session || session.expiresAt.getTime() <= Date.now()) {
          client.disconnect(true);
          return;
        }
      }
      data.userId = uid;
      void client.join(`user:${uid}`);
    } catch {
      client.disconnect(true);
    }
  }

  /** 通知会话参与者有新消息（由调用方指定接收方 userIds，通常为除发送方外的参与者） */
  notifyNewMessage(
    userIds: number[],
    conversationId: number,
    message: ChatMessagePushPayload,
  ) {
    if (!this.server) {
      this.logger.warn("WebSocket server not ready, skip push");
      return;
    }
    const payload = { conversationId, message };
    for (const uid of userIds) {
      this.server.to(`user:${uid}`).emit("chat:message", payload);
    }
  }

  /** 点赞/评论/回复/@ 等新通知，提示客户端刷新未读与列表 */
  emitNotificationNew(userId: number) {
    if (!this.server) {
      this.logger.warn("WebSocket server not ready, skip notification push");
      return;
    }
    this.server.to(`user:${userId}`).emit("notification:new", {});
  }

  /** 约稿相关列表/详情需刷新；可选 commissionId 供详情页精确重拉 */
  emitCommissionInboxRefresh(
    userId: number,
    body: { commissionId?: number } = {},
  ) {
    if (!this.server) {
      this.logger.warn("WebSocket server not ready, skip commission inbox push");
      return;
    }
    this.server.to(`user:${userId}`).emit("commission:inbox-refresh", body);
  }

  /** 作品详情页评论区刷新（仅推送给加入 artwork:{id} 房间的连接） */
  emitArtworkCommentsRefresh(artworkId: number) {
    if (!this.server) {
      this.logger.warn("WebSocket server not ready, skip artwork comments push");
      return;
    }
    this.server
      .to(`artwork:${artworkId}`)
      .emit("artwork:comments-refresh", { artworkId });
  }

  @SubscribeMessage("join-artwork")
  async handleJoinArtwork(
    @MessageBody() body: { artworkId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const aid = Number(body?.artworkId);
    if (!Number.isFinite(aid) || aid < 1) return { ok: false };
    const uid = (client.data as { userId?: number }).userId ?? null;
    if (!(await this.canViewArtworkRoom(aid, uid))) {
      return { ok: false };
    }
    void client.join(`artwork:${aid}`);
    return { ok: true };
  }

  @SubscribeMessage("leave-artwork")
  handleLeaveArtwork(
    @MessageBody() body: { artworkId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const aid = Number(body?.artworkId);
    if (!Number.isFinite(aid) || aid < 1) return { ok: false };
    void client.leave(`artwork:${aid}`);
    return { ok: true };
  }
}
