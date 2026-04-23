import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChatPushService } from "../realtime/chat-push.service";
import { PUBLIC_USER_SELECT } from "../users/user-public-select";

/** 发布者可改稿、删稿的阶段（待支付起已锁定，避免影响已确认承接关系） */
const PUBLISHER_EDITABLE_STATUSES = new Set(["new", "pending"]);
/** PATCH body 中允许的 status 取值（防止写入进行中状态） */
const UPDATE_BODY_STATUS_WHITELIST = new Set(["new", "pending", "payment-pending"]);

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatPush: ChatPushService,
  ) {}

  private async getOrCreateConversationId(
    userAId: number,
    userBId: number,
    db: PrismaService | any = this.prisma,
  ) {
    const [p1, p2] =
      userAId < userBId ? [userAId, userBId] : [userBId, userAId];
    const existing = await db.conversation.findUnique({
      where: {
        participant1Id_participant2Id: {
          participant1Id: p1,
          participant2Id: p2,
        },
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await db.conversation.create({
      data: { participant1Id: p1, participant2Id: p2 },
      select: { id: true },
    });
    return created.id;
  }

  findAll(params: {
    artistId?: number;
    clientId?: number;
    direction?: string;
    viewerId?: number;
  }) {
    const { artistId, clientId, direction, viewerId } = params;
    const viewerCanReadPrivate =
      (artistId != null && viewerId != null && artistId === viewerId) ||
      (clientId != null && viewerId != null && clientId === viewerId);
    return this.prisma.commission.findMany({
      where: {
        ...(!viewerCanReadPrivate ? { status: { in: ["new", "pending"] } } : {}),
        ...(artistId ? { artistId } : {}),
        ...(clientId ? { clientId } : {}),
        ...(direction ? { direction } : {}),
      },
      include: {
        client: { select: PUBLIC_USER_SELECT },
        artist: { select: PUBLIC_USER_SELECT },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });
  }

  create(
    publisherId: number,
    data: {
    title: string;
    description?: string | null;
    category: string;
    price: number;
    direction?: string;
    previewImageUrl?: string | null;
  },
  ) {
    const now = new Date();
    const direction = data.direction ?? "commission";
    return this.prisma.commission.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        price: data.price,
        status: "new",
        paymentStatus: "unpaid",
        submittedAt: now,
        confirmedAt: null,
        startLabel: null,
        endLabel: null,
        previewImageUrl: data.previewImageUrl ?? null,
        direction,
        // 绑定发起人：接稿帖归 artist；约稿帖归 client
        clientId: direction === "commission" ? publisherId : null,
        artistId: direction === "offer" ? publisherId : null,
      },
      include: {
        client: { select: PUBLIC_USER_SELECT },
        artist: { select: PUBLIC_USER_SELECT },
      },
    });
  }

  private async userHasSentApplyForCommission(
    viewerId: number,
    commissionId: number,
    since: Date,
  ): Promise<boolean> {
    const uid = Number(viewerId);
    if (!Number.isFinite(uid)) return false;
    const messages = await this.prisma.message.findMany({
      where: {
        senderId: uid,
        content: { startsWith: "__COMMISSION_CARD__" },
        createdAt: { gte: since },
      },
      select: { content: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
    for (const m of messages) {
      try {
        const parsed = JSON.parse(
          String(m.content).replace("__COMMISSION_CARD__", ""),
        ) as { type?: string; commissionId?: number };
        if (
          parsed?.type === "commission_apply" &&
          Number(parsed.commissionId) === commissionId
        ) {
          return true;
        }
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  /** 该用户对指定稿件的最新一条申请卡片（不按 updatedAt 截断，避免确认后时间线导致找不到卡片） */
  private async findLatestApplyMessageIdFromSender(
    commissionId: number,
    senderId: number,
  ): Promise<number | null> {
    const sid = Number(senderId);
    if (!Number.isFinite(sid)) return null;
    const messages = await this.prisma.message.findMany({
      where: {
        senderId: sid,
        content: { startsWith: "__COMMISSION_CARD__" },
      },
      select: { id: true, content: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
    for (const m of messages) {
      try {
        const parsed = JSON.parse(
          String(m.content).replace("__COMMISSION_CARD__", ""),
        ) as { type?: string; commissionId?: number };
        if (
          parsed?.type === "commission_apply" &&
          Number(parsed.commissionId) === commissionId
        ) {
          return m.id;
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  async findOne(id: number, viewerId?: number) {
    const row = await this.prisma.commission.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, username: true, avatarUrl: true } },
        artist: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    if (!row) return null;

    const viewerNum =
      viewerId != null && Number.isFinite(Number(viewerId))
        ? Number(viewerId)
        : undefined;

    let viewerPendingApplication = false;
    if (
      viewerNum != null &&
      (row.status === "pending" || row.status === "new") &&
      this.getPayerId(row) == null
    ) {
      const publisherId = this.getPublisherId(row);
      if (
        publisherId != null &&
        Number(publisherId) !== viewerNum
      ) {
        viewerPendingApplication = await this.userHasSentApplyForCommission(
          viewerNum,
          id,
          row.updatedAt,
        );
      }
    }

    let publisherReopenPaymentMessageId: number | null = null;
    const payerForReopen = this.getPayerId(row);
    const unpaidForReopen =
      row.paymentStatus === "unpaid" || row.paymentStatus === "partial";
    if (
      row.status === "pending" &&
      payerForReopen != null &&
      unpaidForReopen
    ) {
      publisherReopenPaymentMessageId = await this.findLatestApplyMessageIdFromSender(
        id,
        payerForReopen,
      );
    }

    return { ...row, viewerPendingApplication, publisherReopenPaymentMessageId };
  }

  private getPublisherId(row: {
    direction: string;
    clientId: number | null;
    artistId: number | null;
  }) {
    return row.direction === "offer" ? row.artistId : row.clientId;
  }

  private getPayerId(row: {
    direction: string;
    clientId: number | null;
    artistId: number | null;
  }) {
    return row.direction === "offer" ? row.clientId : row.artistId;
  }

  private buildDeliveryMessagePayload(
    commission: { id: number; title: string },
    normalizedFiles: Array<{
      name: string;
      url: string;
      relativePath: string | null;
    }>,
  ) {
    return {
      type: "commission_delivery" as const,
      commissionId: commission.id,
      title: commission.title,
      fileCount: normalizedFiles.length,
      files: normalizedFiles.map((f) => ({
        name: f.name,
        url: f.url,
        relativePath: f.relativePath,
      })),
    };
  }

  private parseCommissionDeliveryPayload(content: string): {
    commissionId: number;
    files?: Array<{
      name?: string;
      url?: string;
      relativePath?: string | null;
    }>;
  } | null {
    if (!content.startsWith("__COMMISSION_DELIVERY__")) return null;
    try {
      const p = JSON.parse(
        content.replace("__COMMISSION_DELIVERY__", ""),
      ) as {
        type?: string;
        commissionId?: number;
        files?: Array<{ name?: string; url?: string; relativePath?: string | null }>;
      };
      if (
        p?.type === "commission_delivery" &&
        typeof p.commissionId === "number"
      ) {
        return {
          commissionId: p.commissionId,
          files: Array.isArray(p.files) ? p.files : undefined,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  /** 用于比对删除请求中的 url 与库内是否同一文件（忽略域名、仅路径或相对路径一致即可） */
  private normalizeDeliveryFileUrl(url: string): string {
    const s = String(url ?? "").trim();
    if (!s) return "";
    try {
      if (s.startsWith("http://") || s.startsWith("https://")) {
        const u = new URL(s);
        const path = u.pathname.startsWith("/") ? u.pathname : `/${u.pathname}`;
        return path + u.search;
      }
    } catch {
      /* keep raw */
    }
    return s;
  }

  private parseFullCommissionDelivery(content: string): {
    commissionId: number;
    title: string;
    files: Array<{
      name: string;
      url: string;
      relativePath: string | null;
    }>;
  } | null {
    if (!content.startsWith("__COMMISSION_DELIVERY__")) return null;
    try {
      const p = JSON.parse(
        content.replace("__COMMISSION_DELIVERY__", ""),
      ) as {
        type?: string;
        commissionId?: number;
        title?: string;
        files?: Array<{
          name?: string;
          url?: string;
          relativePath?: string | null;
        }>;
      };
      if (
        p?.type !== "commission_delivery" ||
        typeof p.commissionId !== "number"
      ) {
        return null;
      }
      const title =
        typeof p.title === "string" && p.title.trim() !== ""
          ? p.title.trim()
          : "";
      const files: Array<{
        name: string;
        url: string;
        relativePath: string | null;
      }> = [];
      for (const f of Array.isArray(p.files) ? p.files : []) {
        const url = String(f?.url ?? "").trim();
        const name = String(f?.name ?? "").trim();
        if (!url || !name) continue;
        files.push({
          name,
          url,
          relativePath:
            f?.relativePath != null && String(f.relativePath).trim() !== ""
              ? String(f.relativePath).trim()
              : null,
        });
      }
      return { commissionId: p.commissionId, title, files };
    } catch {
      return null;
    }
  }

  /** 出稿方可查看交付列表（进行中 / 修改中 / 待验收） */
  private assertPublisherCanManageDeliveryFiles(row: {
    paymentStatus: string;
    status: string;
  }) {
    if (row.paymentStatus !== "paid") {
      throw new ForbiddenException("对方支付后才可管理交付文件");
    }
    const ok = ["wip", "revising", "review-pending"].includes(row.status);
    if (!ok) {
      throw new ForbiddenException("当前阶段不可修改已提交的交付文件");
    }
  }

  /** 仅进行中 / 修改中可删会话内文件；已发起待验收后不可再删 */
  private assertPublisherCanRemoveDeliveryFiles(row: { paymentStatus: string; status: string }) {
    if (row.paymentStatus !== "paid") {
      throw new ForbiddenException("对方支付后才可管理交付文件");
    }
    const ok = row.status === "wip" || row.status === "revising";
    if (!ok) {
      throw new ForbiddenException("已发起验收后不可再移除已提交的交付文件");
    }
  }

  /**
   * 出稿方查看本会话内自己发出的交付消息（按批次），用于列表与删除。
   */
  async listPublisherDeliveryItems(
    userId: number,
    commissionId: number,
  ): Promise<
    Array<{
      messageId: number;
      submittedAt: Date;
      files: Array<{
        name: string;
        url: string;
        relativePath: string | null;
      }>;
    }>
  > {
    const row = await this.prisma.commission.findUnique({
      where: { id: commissionId },
      select: {
        id: true,
        direction: true,
        clientId: true,
        artistId: true,
        lastDeliveryRoundAt: true,
        paymentStatus: true,
        status: true,
      },
    });
    if (!row) throw new NotFoundException("稿件不存在");
    const publisherId = this.getPublisherId(row);
    if (publisherId !== userId) {
      throw new ForbiddenException("仅出稿方可查看此项");
    }
    this.assertPublisherCanManageDeliveryFiles(row);
    const payerId = this.getPayerId(row);
    if (payerId == null) return [];
    const conversationId = await this.getOrCreateConversationId(
      publisherId,
      payerId,
    );
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderId: userId,
        content: { startsWith: "__COMMISSION_DELIVERY__" },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, createdAt: true },
      take: 500,
    });
    const roundStart = row.lastDeliveryRoundAt;
    const out: Array<{
      messageId: number;
      submittedAt: Date;
      files: Array<{
        name: string;
        url: string;
        relativePath: string | null;
      }>;
    }> = [];
    for (const m of messages) {
      if (roundStart && m.createdAt < roundStart) continue;
      const parsed = this.parseFullCommissionDelivery(m.content);
      if (!parsed || parsed.commissionId !== commissionId) continue;
      if (parsed.files.length === 0) continue;
      out.push({
        messageId: m.id,
        submittedAt: m.createdAt,
        files: parsed.files,
      });
    }
    return out;
  }

  /**
   * 出稿方从某条交付消息中移除一个文件；若该条消息无剩余文件则删除整条消息。
   */
  async removePublisherDeliveryFile(
    userId: number,
    commissionId: number,
    messageId: number,
    fileUrl: string,
  ) {
    const targetUrl = String(fileUrl ?? "").trim();
    if (!targetUrl) {
      throw new BadRequestException("请指定要删除的文件地址");
    }
    const row = await this.prisma.commission.findUnique({
      where: { id: commissionId },
      select: {
        id: true,
        title: true,
        direction: true,
        clientId: true,
        artistId: true,
        paymentStatus: true,
        status: true,
      },
    });
    if (!row) throw new NotFoundException("稿件不存在");
    const publisherId = this.getPublisherId(row);
    if (publisherId !== userId) {
      throw new ForbiddenException("仅出稿方可删除交付文件");
    }
    this.assertPublisherCanRemoveDeliveryFiles(row);
    const payerId = this.getPayerId(row);
    if (payerId == null) {
      throw new ForbiddenException("尚未绑定承接方");
    }
    const conversationId = await this.getOrCreateConversationId(
      publisherId,
      payerId,
    );
    const msg = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        senderId: userId,
        content: { startsWith: "__COMMISSION_DELIVERY__" },
      },
    });
    if (!msg) {
      throw new NotFoundException("交付记录不存在");
    }
    const parsed = this.parseFullCommissionDelivery(msg.content);
    if (!parsed || parsed.commissionId !== commissionId) {
      throw new BadRequestException("无效的交付记录");
    }
    const normTarget = this.normalizeDeliveryFileUrl(targetUrl);
    const remaining = parsed.files.filter(
      (f) => this.normalizeDeliveryFileUrl(f.url) !== normTarget,
    );
    if (remaining.length === parsed.files.length) {
      throw new NotFoundException("未找到对应文件");
    }
    const titleForPayload =
      parsed.title.trim() !== "" ? parsed.title : row.title;
    await this.prisma.$transaction(async (tx) => {
      if (remaining.length === 0) {
        await tx.message.delete({ where: { id: messageId } });
      } else {
        const payload = {
          type: "commission_delivery" as const,
          commissionId: row.id,
          title: titleForPayload,
          fileCount: remaining.length,
          files: remaining.map((f) => ({
            name: f.name,
            url: f.url,
            relativePath: f.relativePath,
          })),
        };
        await tx.message.update({
          where: { id: messageId },
          data: {
            content: `__COMMISSION_DELIVERY__${JSON.stringify(payload)}`,
          },
        });
      }
    });
    const parties = await this.prisma.commission.findUnique({
      where: { id: commissionId },
      select: { clientId: true, artistId: true },
    });
    if (parties) {
      this.chatPush.notifyCommissionInboxForParties(parties, commissionId);
      this.chatPush.notifyCommissionInboxRefresh(
        [publisherId, payerId],
        commissionId,
      );
    }
    return { success: true };
  }

  /**
   * 合并双方会话中该稿件所有交付消息里的文件（去重 url），供承接方下载。
   */
  async listAggregatedDeliveryFiles(
    viewerId: number,
    commissionId: number,
  ): Promise<Array<{ name: string; url: string; relativePath: string | null }>> {
    const row = await this.prisma.commission.findUnique({
      where: { id: commissionId },
      select: {
        id: true,
        direction: true,
        clientId: true,
        artistId: true,
        lastDeliveryRoundAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException("稿件不存在");
    }
    const publisherId = this.getPublisherId(row);
    const payerId = this.getPayerId(row);
    if (publisherId == null || payerId == null) {
      return [];
    }
    if (viewerId !== publisherId && viewerId !== payerId) {
      throw new ForbiddenException("无权查看该稿件的交付文件");
    }
    const conversationId = await this.getOrCreateConversationId(
      publisherId,
      payerId,
    );
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        content: { startsWith: "__COMMISSION_DELIVERY__" },
      },
      orderBy: { createdAt: "asc" },
      select: { content: true, createdAt: true },
      take: 500,
    });
    const out: Array<{
      name: string;
      url: string;
      relativePath: string | null;
    }> = [];
    const seenUrl = new Set<string>();
    const roundStart = row.lastDeliveryRoundAt;
    for (const m of messages) {
      if (roundStart && m.createdAt < roundStart) continue;
      const parsed = this.parseCommissionDeliveryPayload(m.content);
      if (!parsed || parsed.commissionId !== commissionId) continue;
      const arr = parsed.files;
      if (!Array.isArray(arr)) continue;
      for (const f of arr) {
        const url = String(f?.url ?? "").trim();
        const name = String(f?.name ?? "").trim();
        if (!url || !name || seenUrl.has(url)) continue;
        seenUrl.add(url);
        out.push({
          name,
          url,
          relativePath:
            f?.relativePath != null && String(f.relativePath).trim() !== ""
              ? String(f.relativePath).trim()
              : null,
        });
      }
    }
    return out;
  }

  /** 承接方不满意交付：退回进行中，并通知发布方 */
  async rejectReviewByPayer(userId: number, id: number) {
    const row = await this.prisma.commission.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        direction: true,
        status: true,
        clientId: true,
        artistId: true,
      },
    });
    if (!row) throw new NotFoundException("稿件不存在");
    const payerId = this.getPayerId(row);
    if (payerId !== userId) {
      throw new ForbiddenException("只有承接方可以取消验收");
    }
    if (row.status !== "review-pending") {
      throw new ForbiddenException("当前稿件不在待验收阶段");
    }
    const publisherId = this.getPublisherId(row);
    if (publisherId == null) {
      throw new ForbiddenException("稿件发起者不存在");
    }

    const roundAt = new Date();
    let rejectReviewMsgId: number | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.commission.update({
        where: { id },
        data: { status: "wip", lastDeliveryRoundAt: roundAt },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });
      const conversationId = await this.getOrCreateConversationId(
        userId,
        publisherId,
        tx,
      );
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: `__COMMISSION_REVIEW_REJECTED__${JSON.stringify({
            type: "commission_review_rejected",
            commissionId: id,
            title: row.title,
          })}`,
        },
      });
      rejectReviewMsgId = msg.id;
      return row;
    });
    if (rejectReviewMsgId != null) {
      void this.chatPush.notifyFromMessageId(rejectReviewMsgId);
    }
    this.chatPush.notifyCommissionInboxForParties(updated, id);
    return updated;
  }

  private async findApplicantUserIdsForCommission(
    commissionId: number,
    publisherId: number,
    db: PrismaService | any,
  ): Promise<number[]> {
    const messages = await db.message.findMany({
      where: { content: { startsWith: "__COMMISSION_CARD__" } },
      select: { senderId: true, content: true },
      orderBy: { id: "desc" },
      take: 2500,
    });
    const ids = new Set<number>();
    for (const m of messages) {
      try {
        const parsed = JSON.parse(
          String(m.content).replace("__COMMISSION_CARD__", ""),
        ) as { type?: string; commissionId?: number };
        if (
          parsed?.type === "commission_apply" &&
          Number(parsed.commissionId) === commissionId &&
          m.senderId !== publisherId
        ) {
          ids.add(m.senderId);
        }
      } catch {
        /* ignore */
      }
    }
    return [...ids];
  }

  private async notifyCommissionApplicants(
    publisherId: number,
    commissionId: number,
    title: string,
    kind: "revised" | "deleted",
    db: PrismaService | any,
  ): Promise<number[]> {
    const applicants = await this.findApplicantUserIdsForCommission(
      commissionId,
      publisherId,
      db,
    );
    const prefix =
      kind === "revised" ? "__COMMISSION_REVISED__" : "__COMMISSION_DELETED__";
    const type =
      kind === "revised" ? "commission_revised" : "commission_deleted";
    const content = `${prefix}${JSON.stringify({
      type,
      commissionId,
      title,
    })}`;
    const messageIds: number[] = [];
    for (const applicantId of applicants) {
      const conversationId = await this.getOrCreateConversationId(
        publisherId,
        applicantId,
        db,
      );
      const created = await db.message.create({
        data: {
          conversationId,
          senderId: publisherId,
          content,
        },
      });
      messageIds.push(created.id);
    }
    return messageIds;
  }

  private async assertPublisher(userId: number, commissionId: number) {
    const row = await this.prisma.commission.findUnique({
      where: { id: commissionId },
      select: {
        id: true,
        direction: true,
        status: true,
        paymentStatus: true,
        clientId: true,
        artistId: true,
        updatedAt: true,
      },
    });
    if (!row) throw new NotFoundException("稿件不存在");
    const publisherId = this.getPublisherId(row);
    if (publisherId !== userId) {
      throw new ForbiddenException("无权限修改该稿件");
    }
    return row;
  }

  async updateByOwner(
    userId: number,
    id: number,
    data: {
      title?: string;
      description?: string | null;
      category?: string;
      price?: number;
      status?: string;
      direction?: string;
      previewImageUrl?: string | null;
    },
  ) {
    const current = await this.assertPublisher(userId, id);
    const direction = data.direction;
    const status = data.status;
    if (!PUBLISHER_EDITABLE_STATUSES.has(current.status)) {
      throw new ForbiddenException(
        current.status === "payment-pending"
          ? "待支付阶段不可修改稿件，请等待对方完成支付"
          : "稿件进入进行中后不可修改",
      );
    }
    if (
      current.status === "pending" &&
      this.getPayerId(current) != null
    ) {
      throw new ForbiddenException(
        "已确认承接方，待对方完成支付前不可修改稿件",
      );
    }
    if (status !== undefined && !UPDATE_BODY_STATUS_WHITELIST.has(status)) {
      throw new ForbiddenException("不支持的稿件状态");
    }
    if (
      direction !== undefined &&
      direction !== "commission" &&
      direction !== "offer"
    ) {
      throw new BadRequestException("稿件类型（direction）无效");
    }
    const resetPendingToNew =
      current.status === "pending" && this.getPayerId(current) == null;

    /** 仅改文案/封面等时不推进 updatedAt，避免已有申请被「本轮」时间线误判为过期 */
    const openRecruitmentNoParty =
      (current.status === "pending" || current.status === "new") &&
      this.getPayerId(current) == null;
    const preserveUpdatedAt =
      openRecruitmentNoParty &&
      !resetPendingToNew &&
      direction === undefined &&
      (status === undefined || status === current.status);

    let revisedPushIds: number[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const dir =
        direction !== undefined
          ? direction
          : (current.direction ?? "commission");
      const row = await tx.commission.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.price !== undefined ? { price: data.price } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(resetPendingToNew ? { status: "new" } : {}),
          ...(data.previewImageUrl !== undefined ? { previewImageUrl: data.previewImageUrl } : {}),
          ...(preserveUpdatedAt ? { updatedAt: current.updatedAt } : {}),
          ...(direction !== undefined
            ? {
                direction,
                clientId: dir === "commission" ? userId : null,
                artistId: dir === "offer" ? userId : null,
              }
            : {}),
        },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });

      if (resetPendingToNew) {
        revisedPushIds = await this.notifyCommissionApplicants(
          userId,
          id,
          row.title,
          "revised",
          tx,
        );
      }
      return row;
    });
    this.chatPush.notifyFromMessageIds(revisedPushIds);
    this.chatPush.notifyCommissionInboxForParties(updated, id);
    if (resetPendingToNew) {
      const applicants = await this.findApplicantUserIdsForCommission(
        id,
        userId,
        this.prisma,
      );
      this.chatPush.notifyCommissionInboxRefresh(applicants, id);
    }
    return updated;
  }

  async removeByOwner(userId: number, id: number) {
    const row = await this.prisma.commission.findUnique({
      where: { id },
      select: {
        title: true,
        status: true,
        direction: true,
        clientId: true,
        artistId: true,
      },
    });
    if (!row) {
      throw new NotFoundException("稿件不存在");
    }
    const publisherId = this.getPublisherId(row);
    if (publisherId !== userId) {
      throw new ForbiddenException("无权限删除该稿件");
    }
    if (!PUBLISHER_EDITABLE_STATUSES.has(row.status)) {
      throw new ForbiddenException(
        row.status === "payment-pending"
          ? "待支付阶段不可删除稿件，请等待对方完成支付"
          : "当前阶段不可删除",
      );
    }
    if (row.status === "pending" && this.getPayerId(row) != null) {
      throw new ForbiddenException(
        "已确认承接方且有待完成支付，当前不可删除稿件",
      );
    }

    const publisherIdForApplicants = this.getPublisherId(row)!;
    const applicantIdsBeforeDelete = await this.findApplicantUserIdsForCommission(
      id,
      publisherIdForApplicants,
      this.prisma,
    );

    let deletedPushIds: number[] = [];
    await this.prisma.$transaction(async (tx) => {
      deletedPushIds = await this.notifyCommissionApplicants(
        userId,
        id,
        row.title,
        "deleted",
        tx,
      );
      await tx.commission.delete({ where: { id } });
    });
    this.chatPush.notifyFromMessageIds(deletedPushIds);
    this.chatPush.notifyCommissionInboxRefresh(
      [row.clientId, row.artistId, ...applicantIdsBeforeDelete].filter(
        (x): x is number => typeof x === "number" && x > 0,
      ),
      id,
    );
    return { success: true };
  }

  async payByAssignee(userId: number, id: number) {
    const row = await this.prisma.commission.findUnique({
      where: { id },
      select: {
        id: true,
        direction: true,
        status: true,
        paymentStatus: true,
        clientId: true,
        artistId: true,
      },
    });
    if (!row) throw new NotFoundException("稿件不存在");
    const payerId = this.getPayerId(row);
    if (payerId !== userId) {
      throw new ForbiddenException("只有支付方可以完成支付");
    }
    if (row.paymentStatus === "paid") {
      return this.prisma.commission.findUnique({
        where: { id },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });
    }
    const publisherId = this.getPublisherId(row);
    if (!publisherId) {
      throw new ForbiddenException("稿件发起者不存在");
    }
    const awaitingPayerPayment =
      row.status === "payment-pending" &&
      (row.paymentStatus === "unpaid" || row.paymentStatus === "partial");
    if (!awaitingPayerPayment) {
      throw new ForbiddenException("当前稿件不在待支付阶段");
    }

    let paymentMsgId: number | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.commission.update({
        where: { id },
        data: {
          paymentStatus: "paid",
          status: "wip",
        },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });
      const conversationId = await this.getOrCreateConversationId(userId, publisherId, tx);
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: `__COMMISSION_PAYMENT__${JSON.stringify({
            type: "commission_payment",
            commissionId: updated.id,
            title: updated.title,
          })}`,
        },
      });
      paymentMsgId = msg.id;
      return updated;
    });
    if (paymentMsgId != null) {
      void this.chatPush.notifyFromMessageId(paymentMsgId);
    }
    this.chatPush.notifyCommissionInboxForParties(result, id);
    return result;
  }

  /**
   * 支付方取消待支付：状态退回「待确认」，保留与当前承接方的绑定，对方可再次支付。
   */
  async cancelPaymentByPayer(userId: number, id: number) {
    const row = await this.prisma.commission.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        direction: true,
        status: true,
        paymentStatus: true,
        clientId: true,
        artistId: true,
        /** 取消支付时写回，避免误判为新征集轮次 */
        updatedAt: true,
      },
    });
    if (!row) throw new NotFoundException("稿件不存在");
    const payerId = this.getPayerId(row);
    if (payerId !== userId) {
      throw new ForbiddenException("只有支付方可以取消支付");
    }
    if (row.status !== "payment-pending") {
      throw new ForbiddenException("当前不在待支付阶段");
    }
    if (row.paymentStatus === "paid") {
      throw new ForbiddenException("已支付，无法取消");
    }
    const publisherId = this.getPublisherId(row);
    if (publisherId == null) {
      throw new ForbiddenException("稿件发起者不存在");
    }

    const nextData = {
      status: "pending" as const,
      paymentStatus: "unpaid" as const,
      confirmedAt: null as Date | null,
    };

    let paymentCancelMsgId: number | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.commission.update({
        where: { id },
        data: { ...nextData, updatedAt: row.updatedAt },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });
      const conversationId = await this.getOrCreateConversationId(
        userId,
        publisherId,
        tx,
      );
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: `__COMMISSION_PAYMENT_CANCELLED__${JSON.stringify({
            type: "commission_payment_cancelled",
            commissionId: u.id,
            title: u.title,
          })}`,
        },
      });
      paymentCancelMsgId = msg.id;
      return u;
    });
    if (paymentCancelMsgId != null) {
      void this.chatPush.notifyFromMessageId(paymentCancelMsgId);
    }
    this.chatPush.notifyCommissionInboxRefresh([publisherId, payerId], id);
    this.chatPush.notifyCommissionInboxForParties(updated, id);
    return updated;
  }

  async submitDeliveryByPublisher(
    userId: number,
    id: number,
    files: Array<{ name: string; url: string; relativePath?: string | null }>,
    opts?: { finalize?: boolean },
  ) {
    const row = await this.assertPublisher(userId, id);
    if (row.paymentStatus !== "paid") {
      throw new ForbiddenException("对方支付后才可提交文件");
    }
    const payerId = this.getPayerId(row);
    if (!payerId) {
      throw new ForbiddenException("尚未绑定承接方");
    }
    const finalize = opts?.finalize === false ? false : true;

    const normalizedFiles = (Array.isArray(files) ? files : [])
      .map((f) => ({
        name: String(f?.name ?? "").trim(),
        url: String(f?.url ?? "").trim(),
        relativePath: f?.relativePath ? String(f.relativePath).trim() : null,
      }))
      .filter((f) => f.name && f.url);

    const commission = await this.prisma.commission.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!commission) throw new NotFoundException("稿件不存在");

    const conversationId = await this.getOrCreateConversationId(userId, payerId);

    if (!finalize) {
      if (row.status !== "wip" && row.status !== "revising") {
        throw new ForbiddenException("仅在进行中或修改中时可同步交付文件");
      }
      if (normalizedFiles.length === 0) {
        throw new BadRequestException("请至少提交一个文件");
      }
      const payload = this.buildDeliveryMessagePayload(commission, normalizedFiles);
      let syncDeliveryMsgId: number | null = null;
      await this.prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            conversationId,
            senderId: userId,
            content: `__COMMISSION_DELIVERY__${JSON.stringify(payload)}`,
          },
        });
        syncDeliveryMsgId = msg.id;
      });
      if (syncDeliveryMsgId != null) {
        void this.chatPush.notifyFromMessageId(syncDeliveryMsgId);
      }
      this.chatPush.notifyCommissionInboxForParties(row, id);
      return this.prisma.commission.findUnique({
        where: { id },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });
    }

    // finalize === true（默认，兼容旧客户端）
    if (normalizedFiles.length === 0) {
      if (row.status !== "wip" && row.status !== "revising") {
        throw new ForbiddenException("当前状态不可发起验收");
      }
      const onlyStatus = await this.prisma.commission.update({
        where: { id },
        data: { status: "review-pending" },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });
      this.chatPush.notifyCommissionInboxForParties(onlyStatus, id);
      return onlyStatus;
    }

    const payload = this.buildDeliveryMessagePayload(commission, normalizedFiles);

    let finalizeDeliveryMsgId: number | null = null;
    const commissionUpdated = await this.prisma.$transaction(async (tx) => {
      let updated;
      if (row.status === "review-pending") {
        updated = await tx.commission.findUnique({
          where: { id },
          include: {
            client: { select: PUBLIC_USER_SELECT },
            artist: { select: PUBLIC_USER_SELECT },
          },
        });
      } else {
        updated = await tx.commission.update({
          where: { id },
          data: { status: "review-pending" },
          include: {
            client: { select: PUBLIC_USER_SELECT },
            artist: { select: PUBLIC_USER_SELECT },
          },
        });
      }
      if (!updated) {
        throw new NotFoundException("稿件不存在");
      }
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: `__COMMISSION_DELIVERY__${JSON.stringify(payload)}`,
        },
      });
      finalizeDeliveryMsgId = msg.id;
      return updated;
    });
    if (finalizeDeliveryMsgId != null) {
      void this.chatPush.notifyFromMessageId(finalizeDeliveryMsgId);
    }
    this.chatPush.notifyCommissionInboxForParties(commissionUpdated, id);
    return commissionUpdated;
  }

  async acceptDeliveryByPayer(userId: number, id: number) {
    const row = await this.prisma.commission.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        direction: true,
        status: true,
        clientId: true,
        artistId: true,
      },
    });
    if (!row) throw new NotFoundException("稿件不存在");
    const payerId = this.getPayerId(row);
    if (payerId !== userId) {
      throw new ForbiddenException("只有承接方可以验收");
    }
    if (row.status !== "review-pending") {
      throw new ForbiddenException("当前稿件不在待验收阶段");
    }
    const publisherId = this.getPublisherId(row);
    if (!publisherId) {
      throw new ForbiddenException("稿件发起者不存在");
    }

    let acceptMsgId: number | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.commission.update({
        where: { id },
        data: { status: "done" },
        include: {
          client: { select: PUBLIC_USER_SELECT },
          artist: { select: PUBLIC_USER_SELECT },
        },
      });
      const conversationId = await this.getOrCreateConversationId(userId, publisherId, tx);
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: `__COMMISSION_ACCEPTED__${JSON.stringify({
            type: "commission_accepted",
            commissionId: row.id,
            title: row.title,
          })}`,
        },
      });
      acceptMsgId = msg.id;
      return row;
    });
    if (acceptMsgId != null) {
      void this.chatPush.notifyFromMessageId(acceptMsgId);
    }
    this.chatPush.notifyCommissionInboxForParties(updated, id);
    return updated;
  }
}

