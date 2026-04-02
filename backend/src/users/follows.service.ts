import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChatPushService } from "../realtime/chat-push.service";

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatPush: ChatPushService,
  ) {}

  async getFollowingList(myId: number) {
    const list = await this.prisma.follow.findMany({
      where: { followerId: myId },
      include: {
        following: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return list.map((f) => f.following);
  }

  async getFollowersList(myId: number) {
    const list = await this.prisma.follow.findMany({
      where: { followingId: myId },
      include: {
        follower: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return list.map((f) => f.follower);
  }

  async isFollowing(myId: number, targetUserId: number): Promise<boolean> {
    const one = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: myId, followingId: targetUserId },
      },
    });
    return !!one;
  }

  async follow(myId: number, targetUserId: number) {
    if (targetUserId === myId) {
      throw new BadRequestException("不能关注自己");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, autoReplyMessage: true },
    });
    if (!target) throw new NotFoundException("用户不存在");

    const alreadyFollowing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: myId, followingId: targetUserId },
      },
    });
    if (alreadyFollowing) {
      return { ok: true };
    }

    await this.prisma.follow.create({
      data: { followerId: myId, followingId: targetUserId },
    });

    // 首次关注：被关注者向关注者发送自动回复（默认「感谢关注」）
    const [p1, p2] =
      myId < targetUserId ? [myId, targetUserId] : [targetUserId, myId];
    let conv = await this.prisma.conversation.findUnique({
      where: {
        participant1Id_participant2Id: { participant1Id: p1, participant2Id: p2 },
      },
    });
    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: { participant1Id: p1, participant2Id: p2 },
      });
    }
    const autoReplyContent = target.autoReplyMessage?.trim() || "感谢关注";
    const autoMsg = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: targetUserId,
        content: autoReplyContent,
      },
    });
    void this.chatPush.notifyFromMessageId(autoMsg.id);

    return { ok: true };
  }

  async unfollow(myId: number, targetUserId: number) {
    await this.prisma.follow.deleteMany({
      where: {
        followerId: myId,
        followingId: targetUserId,
      },
    });
    return { ok: true };
  }
}
