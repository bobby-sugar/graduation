import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { ChatPushService } from "../realtime/chat-push.service";

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionsService: CommissionsService,
    private readonly chatPush: ChatPushService,
  ) {}

  private async getOrCreateConversationIdInTx(
    tx: Prisma.TransactionClient,
    userAId: number,
    userBId: number,
  ): Promise<number> {
    const [p1, p2] =
      userAId < userBId ? [userAId, userBId] : [userBId, userAId];
    const existing = await tx.conversation.findUnique({
      where: {
        participant1Id_participant2Id: {
          participant1Id: p1,
          participant2Id: p2,
        },
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await tx.conversation.create({
      data: { participant1Id: p1, participant2Id: p2 },
      select: { id: true },
    });
    return created.id;
  }

  private parseCommissionApplyPayload(content: string):
    | { commissionId: number; title?: string }
    | null {
    if (!content.startsWith("__COMMISSION_CARD__")) return null;
    try {
      const parsed = JSON.parse(content.replace("__COMMISSION_CARD__", ""));
      if (parsed?.type !== "commission_apply") return null;
      const rawId = parsed?.commissionId;
      const commissionId =
        typeof rawId === "number"
          ? rawId
          : typeof rawId === "string" && /^\d+$/.test(rawId)
            ? Number(rawId)
            : NaN;
      if (!Number.isFinite(commissionId)) return null;
      return { commissionId, title: parsed?.title as string | undefined };
    } catch {
      return null;
    }
  }

  private parseCommissionApplyResultPayload(content: string):
    | { commissionId: number; title?: string; accepted: boolean }
    | null {
    if (!content.startsWith("__COMMISSION_APPLY_RESULT__")) return null;
    try {
      const parsed = JSON.parse(content.replace("__COMMISSION_APPLY_RESULT__", ""));
      if (
        parsed?.type === "commission_apply_result" &&
        typeof parsed?.commissionId === "number" &&
        typeof parsed?.accepted === "boolean"
      ) {
        return parsed as {
          commissionId: number;
          title?: string;
          accepted: boolean;
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  private parseCommissionPaymentPayload(content: string):
    | { commissionId: number; title?: string }
    | null {
    if (!content.startsWith("__COMMISSION_PAYMENT__")) return null;
    try {
      const parsed = JSON.parse(content.replace("__COMMISSION_PAYMENT__", ""));
      if (
        parsed?.type === "commission_payment" &&
        typeof parsed?.commissionId === "number"
      ) {
        return parsed as { commissionId: number; title?: string };
      }
    } catch {
      return null;
    }
    return null;
  }

  async getCommissionApplications(myId: number) {
    const commissionSelect = {
      id: true,
      title: true,
      description: true,
      category: true,
      price: true,
      direction: true,
      status: true,
      paymentStatus: true,
      previewImageUrl: true,
      submittedAt: true,
      clientId: true,
      artistId: true,
      updatedAt: true,
    } as const;

    const baseCommissions = await this.prisma.commission.findMany({
      where: {
        OR: [{ clientId: myId }, { artistId: myId }],
        status: {
          in: [
            "pending",
            "payment-pending",
            "wip",
            "review-pending",
            "revising",
            "done",
          ],
        },
      },
      select: commissionSelect,
      orderBy: { submittedAt: "desc" },
      take: 200,
    });

    const myApplyMessages = await this.prisma.message.findMany({
      where: {
        senderId: myId,
        content: { startsWith: "__COMMISSION_CARD__" },
      },
      select: { content: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
    const applicantCommissionIdSet = new Set<number>();
    for (const m of myApplyMessages) {
      const p = this.parseCommissionApplyPayload(m.content);
      if (p?.commissionId != null) applicantCommissionIdSet.add(p.commissionId);
    }
    const baseIds = new Set(baseCommissions.map((c) => c.id));
    const extraIds = [...applicantCommissionIdSet].filter((id) => !baseIds.has(id));
    const extraCommissions =
      extraIds.length > 0
        ? await this.prisma.commission.findMany({
            where: {
              id: { in: extraIds },
              status: "pending",
              OR: [
                { direction: "commission", artistId: null },
                { direction: "offer", clientId: null },
              ],
            },
            select: commissionSelect,
          })
        : [];

    const commissionById = new Map<number, (typeof baseCommissions)[number]>();
    for (const c of baseCommissions) commissionById.set(c.id, c);
    for (const c of extraCommissions) {
      if (!commissionById.has(c.id)) commissionById.set(c.id, c);
    }
    const commissions = [...commissionById.values()].sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );

    if (commissions.length === 0) return [];

    const commissionIds = commissions.map((c) => c.id);
    const applyMessages = await this.prisma.message.findMany({
      where: { content: { startsWith: "__COMMISSION_CARD__" } },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        conversation: {
          select: { id: true, participant1Id: true, participant2Id: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1500,
    });
    const parsedApply = applyMessages
      .map((m) => {
        const payload = this.parseCommissionApplyPayload(m.content);
        if (!payload) return null;
        if (!commissionIds.includes(payload.commissionId)) return null;
        return {
          messageId: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          sender: m.sender,
          createdAt: m.createdAt,
          commissionId: payload.commissionId,
          title: payload.title ?? "",
        };
      })
      .filter(Boolean) as Array<{
      messageId: number;
      conversationId: number;
      senderId: number;
      sender: { id: number; username: string; avatarUrl: string | null };
      createdAt: Date;
      commissionId: number;
      title: string;
    }>;

    const appliesByCommissionId = new Map<number, (typeof parsedApply)[number][]>();
    for (const item of parsedApply) {
      const arr = appliesByCommissionId.get(item.commissionId) ?? [];
      arr.push(item);
      appliesByCommissionId.set(item.commissionId, arr);
    }
    for (const arr of appliesByCommissionId.values()) {
      arr.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    const participants = Array.from(
      new Set(
        [
          ...commissions.flatMap((c) => [c.clientId ?? 0, c.artistId ?? 0]),
          ...parsedApply.map((a) => a.senderId),
        ].filter((x) => x > 0),
      ),
    );
    const users = participants.length
      ? await this.prisma.user.findMany({
          where: { id: { in: participants } },
          select: { id: true, username: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const conversationList = await this.prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: myId }, { participant2Id: myId }],
      },
      select: { id: true, participant1Id: true, participant2Id: true },
      take: 500,
    });
    const convKeyMap = new Map<string, number>();
    for (const conv of conversationList) {
      const key = [conv.participant1Id, conv.participant2Id].sort((a, b) => a - b).join("-");
      convKeyMap.set(key, conv.id);
    }
    const getConvId = (a?: number | null, b?: number | null) => {
      if (!a || !b) return null;
      const key = [a, b].sort((x, y) => x - y).join("-");
      return convKeyMap.get(key) ?? null;
    };

    const rows: Array<{
      id: string;
      kind: "incoming" | "payment" | "outgoing-pending";
      viewerRole: "publisher" | "payer";
      applicationMessageId: number | null;
      conversationId: number;
      createdAt: Date;
      applicant: {
        id: number;
        username: string;
        avatarUrl: string | null;
      };
      commission: {
        id: number;
        title: string;
        description: string | null;
        category: string;
        price: number;
        direction: string;
        status: string;
        paymentStatus: string;
        previewImageUrl: string | null;
        submittedAt: Date;
        updatedAt: Date;
        clientId: number | null;
        artistId: number | null;
      };
      handled: boolean;
      canPay: boolean;
      canSubmit: boolean;
      canAccept: boolean;
      publisherDeliveryFiles: Array<{
        name: string;
        url: string;
        relativePath: string | null;
      }>;
    }> = [];

    for (const commission of commissions) {
      const publisherId =
        commission.direction === "offer" ? commission.artistId : commission.clientId;
      const payerId =
        commission.direction === "offer" ? commission.clientId : commission.artistId;
      const isPublisher = publisherId === myId;
      const isPayer = payerId === myId;

      const appliesSorted = appliesByCommissionId.get(commission.id) ?? [];
      const cycleStartMs = new Date(commission.updatedAt).getTime();
      const appliesInCycle = appliesSorted.filter(
        (a) => new Date(a.createdAt).getTime() >= cycleStartMs,
      );
      const latestApply = appliesInCycle[0] ?? null;

      const boundParties =
        publisherId != null && payerId != null;
      const canPay =
        isPayer &&
        commission.status === "payment-pending" &&
        (commission.paymentStatus === "unpaid" ||
          commission.paymentStatus === "partial");
      const canSubmit =
        isPublisher &&
        commission.paymentStatus === "paid" &&
        (commission.status === "wip" || commission.status === "revising");
      const canAccept = isPayer && commission.status === "review-pending";
      const isIncomingPending =
        isPublisher && commission.status === "pending" && !payerId;

      if (isIncomingPending) {
        const bySender = new Map<number, (typeof parsedApply)[number]>();
        for (const a of appliesInCycle) {
          if (a.senderId === publisherId) continue;
          if (!bySender.has(a.senderId)) bySender.set(a.senderId, a);
        }
        const perApplicant = [...bySender.values()].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        for (const apply of perApplicant) {
          rows.push({
            id: `commission-${commission.id}-from-${apply.senderId}`,
            kind: "incoming",
            viewerRole: "publisher",
            applicationMessageId: apply.messageId,
            conversationId: apply.conversationId,
            createdAt: apply.createdAt,
            applicant: {
              id: apply.sender.id,
              username: apply.sender.username,
              avatarUrl: apply.sender.avatarUrl,
            },
            commission: {
              id: commission.id,
              title: apply.title || commission.title,
              description: commission.description ?? null,
              category: commission.category,
              price: commission.price,
              direction: commission.direction,
              status: commission.status,
              paymentStatus: commission.paymentStatus,
              previewImageUrl: commission.previewImageUrl ?? null,
              submittedAt: commission.submittedAt,
              updatedAt: commission.updatedAt,
              clientId: commission.clientId ?? null,
              artistId: commission.artistId ?? null,
            },
            handled: false,
            canPay: false,
            canSubmit: false,
            canAccept: false,
            publisherDeliveryFiles: [],
          });
        }
        continue;
      }

      const isApplicantWaitingConfirm =
        !isPublisher &&
        commission.status === "pending" &&
        !payerId;
      if (isApplicantWaitingConfirm) {
        const myLatestApply = appliesInCycle.find((a) => a.senderId === myId);
        if (myLatestApply) {
          const pubUser = publisherId ? userMap.get(publisherId) : null;
          rows.push({
            id: `commission-${commission.id}-applicant-${myId}`,
            kind: "outgoing-pending",
            viewerRole: "payer",
            applicationMessageId: myLatestApply.messageId,
            conversationId: myLatestApply.conversationId,
            createdAt: myLatestApply.createdAt,
            applicant: {
              id: pubUser?.id ?? publisherId ?? 0,
              username: pubUser?.username ?? "对方",
              avatarUrl: pubUser?.avatarUrl ?? null,
            },
            commission: {
              id: commission.id,
              title: myLatestApply.title || commission.title,
              description: commission.description ?? null,
              category: commission.category,
              price: commission.price,
              direction: commission.direction,
              status: commission.status,
              paymentStatus: commission.paymentStatus,
              previewImageUrl: commission.previewImageUrl ?? null,
              submittedAt: commission.submittedAt,
              updatedAt: commission.updatedAt,
              clientId: commission.clientId ?? null,
              artistId: commission.artistId ?? null,
            },
            handled: true,
            canPay: false,
            canSubmit: false,
            canAccept: false,
            publisherDeliveryFiles: [],
          });
        }
        continue;
      }

      const applicantId = payerId ?? latestApply?.senderId ?? null;
      const applicant = applicantId ? userMap.get(applicantId) : null;
      const counterpartyId = isPublisher ? applicantId : publisherId;
      const counterparty = counterpartyId ? userMap.get(counterpartyId) : null;

      const conversationId =
        getConvId(publisherId, payerId) ??
        (latestApply?.conversationId ?? null);
      if (!conversationId) continue;

      let publisherDeliveryFiles: Array<{
        name: string;
        url: string;
        relativePath: string | null;
      }> = [];
      if (commission.status === "review-pending") {
        publisherDeliveryFiles =
          await this.commissionsService.listAggregatedDeliveryFiles(
            myId,
            commission.id,
          );
      }

      const unpaidBound =
        boundParties &&
        (commission.paymentStatus === "unpaid" ||
          commission.paymentStatus === "partial");
      const publisherMustReopenAfterCancelPay =
        commission.status === "pending" && unpaidBound;
      const applyFromBoundPayer =
        payerId != null
          ? appliesSorted.find((a) => a.senderId === payerId)
          : null;
      const reopenApplyMessageId =
        isPublisher &&
        publisherMustReopenAfterCancelPay &&
        applyFromBoundPayer
          ? applyFromBoundPayer.messageId
          : null;
      const handled =
        !(isPublisher && publisherMustReopenAfterCancelPay);

      rows.push({
        id: `commission-${commission.id}`,
        kind: "payment",
        viewerRole: isPublisher ? "publisher" : "payer",
        applicationMessageId: reopenApplyMessageId,
        conversationId,
        createdAt: latestApply?.createdAt ?? commission.submittedAt,
        applicant: {
          id: counterparty?.id ?? applicant?.id ?? 0,
          username: counterparty?.username ?? applicant?.username ?? "对方",
          avatarUrl: counterparty?.avatarUrl ?? applicant?.avatarUrl ?? null,
        },
        commission: {
          id: commission.id,
          title: latestApply?.title || commission.title,
          description: commission.description ?? null,
          category: commission.category,
          price: commission.price,
          direction: commission.direction,
          status: commission.status,
          paymentStatus: commission.paymentStatus,
          previewImageUrl: commission.previewImageUrl ?? null,
          submittedAt: commission.submittedAt,
          updatedAt: commission.updatedAt,
          clientId: commission.clientId ?? null,
          artistId: commission.artistId ?? null,
        },
        handled,
        canPay,
        canSubmit,
        canAccept,
        publisherDeliveryFiles,
      });
    }

    const rowActivityMs = (row: (typeof rows)[number]) =>
      Math.max(
        new Date(row.createdAt).getTime(),
        new Date(row.commission.updatedAt).getTime(),
      );
    return rows.sort((a, b) => rowActivityMs(b) - rowActivityMs(a));
  }

  async confirmCommissionApplication(myId: number, applicationMessageId: number) {
    const applicationMessage = await this.prisma.message.findUnique({
      where: { id: applicationMessageId },
      include: {
        conversation: {
          select: { id: true, participant1Id: true, participant2Id: true },
        },
      },
    });
    if (!applicationMessage) {
      throw new NotFoundException("申请消息不存在");
    }
    if (!applicationMessage.content.startsWith("__COMMISSION_CARD__")) {
      throw new ForbiddenException("该消息不是稿件申请");
    }

    let payload: { commissionId: number; title?: string } | null = null;
    try {
      const parsed = JSON.parse(
        applicationMessage.content.replace("__COMMISSION_CARD__", ""),
      );
      if (
        parsed?.type === "commission_apply" &&
        typeof parsed?.commissionId === "number"
      ) {
        payload = parsed as { commissionId: number; title?: string };
      }
    } catch {
      payload = null;
    }
    if (!payload) {
      throw new ForbiddenException("申请消息格式错误");
    }

    const commission = await this.prisma.commission.findUnique({
      where: { id: payload.commissionId },
      select: {
        id: true,
        title: true,
        direction: true,
        status: true,
        paymentStatus: true,
        clientId: true,
        artistId: true,
        updatedAt: true,
      },
    });
    if (!commission) {
      throw new NotFoundException("稿件不存在");
    }

    const publisherId =
      commission.direction === "offer" ? commission.artistId : commission.clientId;
    if (publisherId == null || publisherId !== myId) {
      throw new ForbiddenException("只有稿件发起者可以确认申请");
    }

    const conversation = applicationMessage.conversation;
    if (
      conversation.participant1Id !== myId &&
      conversation.participant2Id !== myId
    ) {
      throw new ForbiddenException("无权处理该申请");
    }
    const applicantId = applicationMessage.senderId;
    if (applicantId === myId) {
      throw new ForbiddenException("不能处理自己发送的申请");
    }
    if (
      conversation.participant1Id !== applicantId &&
      conversation.participant2Id !== applicantId
    ) {
      throw new ForbiddenException("申请人与会话不匹配");
    }

    const existingPayerId =
      commission.direction === "offer"
        ? commission.clientId
        : commission.artistId;
    if (commission.status === "pending" && existingPayerId != null) {
      if (existingPayerId !== applicantId) {
        throw new ForbiddenException(
          "稿件已有确认的承接方，请等待对方支付或让对方取消后再处理其他申请",
        );
      }
      const unpaidReopen =
        commission.paymentStatus === "unpaid" ||
        commission.paymentStatus === "partial";
      if (!unpaidReopen) {
        throw new ForbiddenException(
          "已与该用户确认承接关系，请等待对方完成支付",
        );
      }
    }

    const payerIdForOpen =
      commission.direction === "offer"
        ? commission.clientId
        : commission.artistId;
    const unpaidForStale =
      commission.paymentStatus === "unpaid" ||
      commission.paymentStatus === "partial";
    /** 待确认且无承接方，或已绑定但仍未付（含取消支付退回）：略过历史上「已接受」结果 */
    const skipStalePositiveApplyResult =
      commission.status === "pending" &&
      (payerIdForOpen == null || unpaidForStale);

    const alreadyHandledMessages = await this.prisma.message.findMany({
      where: {
        conversationId: applicationMessage.conversationId,
        senderId: myId,
        content: { startsWith: "__COMMISSION_APPLY_RESULT__" },
      },
      select: { content: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    let hasHandled = false;
    for (const item of alreadyHandledMessages) {
      try {
        const resultPayload = JSON.parse(
          item.content.replace("__COMMISSION_APPLY_RESULT__", ""),
        );
        if (
          resultPayload?.type === "commission_apply_result" &&
          resultPayload?.commissionId === commission.id
        ) {
          if (
            skipStalePositiveApplyResult &&
            resultPayload.accepted !== false
          ) {
            continue;
          }
          hasHandled = true;
          break;
        }
      } catch {
        // ignore invalid payload
      }
    }
    if (hasHandled) {
      throw new ForbiddenException("该申请已处理");
    }

    const cycleStartMs = new Date(commission.updatedAt).getTime();
    const applyBroadcast = await this.prisma.message.findMany({
      where: { content: { startsWith: "__COMMISSION_CARD__" } },
      select: { senderId: true, content: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2500,
    });
    const loserUserIds = new Set<number>();
    for (const m of applyBroadcast) {
      if (new Date(m.createdAt).getTime() < cycleStartMs) continue;
      const parsedApply = this.parseCommissionApplyPayload(m.content);
      if (!parsedApply || parsedApply.commissionId !== commission.id) continue;
      if (m.senderId === publisherId || m.senderId === applicantId) continue;
      loserUserIds.add(m.senderId);
    }

    const nextCommissionData =
      commission.direction === "offer"
        ? {
            clientId: applicantId,
            artistId: myId,
            status: "payment-pending",
            paymentStatus: "unpaid",
            confirmedAt: new Date(),
          }
        : {
            clientId: myId,
            artistId: applicantId,
            status: "payment-pending",
            paymentStatus: "unpaid",
            confirmedAt: new Date(),
          };

    const resultPayload = {
      type: "commission_apply_result",
      commissionId: commission.id,
      title: payload.title || commission.title,
      accepted: true,
    };

    const takenNoticePayload = {
      type: "commission_taken_by_other",
      commissionId: commission.id,
      title: payload.title || commission.title,
    };
    const takenNoticeContent = `__COMMISSION_TAKEN_BY_OTHER__${JSON.stringify(takenNoticePayload)}`;

    const pushMessageIds: number[] = [];
    const updatedCommission = await this.prisma.$transaction(async (tx) => {
      const row = await tx.commission.update({
        where: { id: commission.id },
        data: nextCommissionData,
      });
      const acceptMsg = await tx.message.create({
        data: {
          conversationId: applicationMessage.conversationId,
          senderId: myId,
          content: `__COMMISSION_APPLY_RESULT__${JSON.stringify(resultPayload)}`,
        },
      });
      pushMessageIds.push(acceptMsg.id);
      for (const loserId of loserUserIds) {
        const convId = await this.getOrCreateConversationIdInTx(
          tx,
          publisherId,
          loserId,
        );
        const takenMsg = await tx.message.create({
          data: {
            conversationId: convId,
            senderId: publisherId,
            content: takenNoticeContent,
          },
        });
        pushMessageIds.push(takenMsg.id);
      }
      return row;
    });

    this.chatPush.notifyFromMessageIds(pushMessageIds);
    this.chatPush.notifyCommissionInboxRefresh(
      [myId, applicantId, ...loserUserIds],
      commission.id,
    );

    return {
      success: true,
      commission: updatedCommission,
    };
  }

  async rejectCommissionApplication(myId: number, applicationMessageId: number) {
    const applicationMessage = await this.prisma.message.findUnique({
      where: { id: applicationMessageId },
      include: {
        conversation: {
          select: { id: true, participant1Id: true, participant2Id: true },
        },
      },
    });
    if (!applicationMessage) {
      throw new NotFoundException("申请消息不存在");
    }
    const payload = this.parseCommissionApplyPayload(applicationMessage.content);
    if (!payload) {
      throw new ForbiddenException("该消息不是有效稿件申请");
    }

    const commission = await this.prisma.commission.findUnique({
      where: { id: payload.commissionId },
      select: {
        id: true,
        title: true,
        direction: true,
        status: true,
        paymentStatus: true,
        clientId: true,
        artistId: true,
      },
    });
    if (!commission) {
      throw new NotFoundException("稿件不存在");
    }
    const publisherId =
      commission.direction === "offer" ? commission.artistId : commission.clientId;
    if (publisherId !== myId) {
      throw new ForbiddenException("只有稿件发起者可以拒绝申请");
    }

    const payerForRejectStale =
      commission.direction === "offer"
        ? commission.clientId
        : commission.artistId;
    const unpaidRejectStale =
      commission.paymentStatus === "unpaid" ||
      commission.paymentStatus === "partial";
    const skipStaleAcceptWhenRejecting =
      commission.status === "pending" &&
      payerForRejectStale != null &&
      unpaidRejectStale;

    const conversation = applicationMessage.conversation;
    if (
      conversation.participant1Id !== myId &&
      conversation.participant2Id !== myId
    ) {
      throw new ForbiddenException("无权处理该申请");
    }
    const applicantId = applicationMessage.senderId;
    if (applicantId === myId) {
      throw new ForbiddenException("不能处理自己发送的申请");
    }

    const alreadyHandledMessages = await this.prisma.message.findMany({
      where: {
        conversationId: applicationMessage.conversationId,
        senderId: myId,
        content: { startsWith: "__COMMISSION_APPLY_RESULT__" },
      },
      select: { content: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    let hasHandled = false;
    for (const item of alreadyHandledMessages) {
      try {
        const resultPayload = JSON.parse(
          item.content.replace("__COMMISSION_APPLY_RESULT__", ""),
        );
        if (
          resultPayload?.type === "commission_apply_result" &&
          resultPayload?.commissionId === commission.id
        ) {
          if (
            skipStaleAcceptWhenRejecting &&
            resultPayload.accepted !== false
          ) {
            continue;
          }
          hasHandled = true;
          break;
        }
      } catch {
        // ignore invalid payload
      }
    }
    if (hasHandled) {
      throw new ForbiddenException("该申请已处理");
    }

    const nextCommissionData =
      commission.direction === "offer"
        ? {
            clientId: null,
            artistId: myId,
            status: "new",
            paymentStatus: "unpaid",
            confirmedAt: null,
          }
        : {
            clientId: myId,
            artistId: null,
            status: "new",
            paymentStatus: "unpaid",
            confirmedAt: null,
          };

    const rejectResultPayload = {
      type: "commission_apply_result",
      commissionId: commission.id,
      title: payload.title || commission.title,
      accepted: false,
    };

    const [updatedCommission, rejectMsg] = await this.prisma.$transaction([
      this.prisma.commission.update({
        where: { id: commission.id },
        data: nextCommissionData,
      }),
      this.prisma.message.create({
        data: {
          conversationId: applicationMessage.conversationId,
          senderId: myId,
          content: `__COMMISSION_APPLY_RESULT__${JSON.stringify(rejectResultPayload)}`,
        },
      }),
    ]);

    void this.chatPush.notifyFromMessageId(rejectMsg.id);
    this.chatPush.notifyCommissionInboxRefresh(
      [myId, applicationMessage.senderId],
      commission.id,
    );

    return {
      success: true,
      commission: updatedCommission,
    };
  }

  /** 获取或创建与某用户的会话（participant1Id < participant2Id） */
  async getOrCreate(myId: number, dto: CreateConversationDto) {
    const otherUserId = dto.otherUserId;
    if (otherUserId === myId) {
      throw new ForbiddenException("不能与自己发起会话");
    }
    const other = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!other) {
      throw new NotFoundException("用户不存在");
    }
    const [p1, p2] = myId < otherUserId ? [myId, otherUserId] : [otherUserId, myId];
    let conv = await this.prisma.conversation.findUnique({
      where: {
        participant1Id_participant2Id: { participant1Id: p1, participant2Id: p2 },
      },
      include: {
        participant1: { select: { id: true, username: true, avatarUrl: true } },
        participant2: { select: { id: true, username: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: { id: true, username: true } } },
        },
      },
    });
    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: { participant1Id: p1, participant2Id: p2 },
        include: {
          participant1: { select: { id: true, username: true, avatarUrl: true } },
          participant2: { select: { id: true, username: true, avatarUrl: true } },
          messages: {
            include: { sender: { select: { id: true, username: true } } },
          },
        },
      });
    }
    await this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId: conv.id, userId: myId } },
      update: { lastReadAt: new Date() },
      create: { conversationId: conv.id, userId: myId, lastReadAt: new Date() },
    });
    return this.toConversationResponse(conv, myId);
  }

  /** 当前用户参与的会话列表，按最后一条消息时间倒序 */
  async findAll(myId: number) {
    const list = await this.prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: myId }, { participant2Id: myId }],
      },
      include: {
        participant1: { select: { id: true, username: true, avatarUrl: true } },
        participant2: { select: { id: true, username: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: { id: true, username: true } } },
        },
      },
    });

    const ids = list.map((c) => c.id);
    const reads = await this.prisma.conversationRead.findMany({
      where: { userId: myId, conversationId: { in: ids } },
      select: { conversationId: true, lastReadAt: true },
    });
    const readAtMap = new Map<number, Date>(
      reads.map((r) => [r.conversationId, r.lastReadAt]),
    );

    const enriched = await Promise.all(
      list.map(async (c) => {
        const last = c.messages?.[0] ?? null;
        const readAt = readAtMap.get(c.id) ?? new Date(0);
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: myId },
            createdAt: { gt: readAt },
          },
        });
        return { ...c, lastMessage: last, unreadCount };
      }),
    );

    enriched.sort((a, b) => {
      const at = a.lastMessage?.createdAt?.getTime() ?? a.createdAt.getTime();
      const bt = b.lastMessage?.createdAt?.getTime() ?? b.createdAt.getTime();
      return bt - at;
    });
    return enriched.map((c) => this.toConversationListItem(c, myId));
  }

  /** 会话详情（含对方信息），校验当前用户是否参与 */
  async findOne(conversationId: number, myId: number) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participant1: { select: { id: true, username: true, avatarUrl: true } },
        participant2: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    if (!conv) {
      throw new NotFoundException("会话不存在");
    }
    const isParticipant =
      conv.participant1Id === myId || conv.participant2Id === myId;
    if (!isParticipant) {
      throw new ForbiddenException("无权查看该会话");
    }
    return this.toConversationResponse(conv, myId);
  }

  /** 会话中的消息列表，倒序（最新在后） */
  async getMessages(conversationId: number, myId: number, limit = 100) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException("会话不存在");
    const isParticipant =
      conv.participant1Id === myId || conv.participant2Id === myId;
    if (!isParticipant) throw new ForbiddenException("无权查看该会话");

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    await this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId: myId } },
      update: { lastReadAt: new Date() },
      create: { conversationId, userId: myId, lastReadAt: new Date() },
    });

    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      senderId: m.senderId,
      sender: m.sender.username,
      senderAvatar: m.sender.avatarUrl,
    }));
  }

  /** 将当前会话标为已读（不拉取消息列表；用于正在查看该会话时收到实时推送） */
  async markAsRead(conversationId: number, myId: number) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException("会话不存在");
    const isParticipant =
      conv.participant1Id === myId || conv.participant2Id === myId;
    if (!isParticipant) throw new ForbiddenException("无权操作该会话");

    await this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId: myId } },
      update: { lastReadAt: new Date() },
      create: { conversationId, userId: myId, lastReadAt: new Date() },
    });
    return { success: true as const };
  }

  /** 发送消息 */
  async sendMessage(
    conversationId: number,
    myId: number,
    dto: SendMessageDto,
  ) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException("会话不存在");
    const isParticipant =
      conv.participant1Id === myId || conv.participant2Id === myId;
    if (!isParticipant) throw new ForbiddenException("无权在该会话发消息");

    const content = (dto.content ?? "").trim();
    if (!content) {
      throw new ForbiddenException("消息内容不能为空");
    }
    const maxLen = content.startsWith("__COMMISSION_CARD__") ? 12000 : 2000;
    if (content.length > maxLen) {
      throw new ForbiddenException(
        maxLen > 2000
          ? "申请卡片内容过长，请缩短标题或封面链接后重试"
          : "消息最多 2000 字",
      );
    }

    const applyPayload = this.parseCommissionApplyPayload(content);
    let applyCommissionId: number | null = null;
    let commissionInboxNotifyIds: number[] | null = null;
    if (applyPayload) {
      const applyCommission = await this.prisma.commission.findUnique({
        where: { id: applyPayload.commissionId },
        select: {
          id: true,
          status: true,
          direction: true,
          clientId: true,
          artistId: true,
        },
      });
      if (!applyCommission) {
        throw new NotFoundException("稿件不存在");
      }
      const publisherId =
        applyCommission.direction === "offer"
          ? applyCommission.artistId
          : applyCommission.clientId;
      if (!publisherId) {
        throw new ForbiddenException("稿件发起者无效，暂不可申请");
      }
      if (publisherId === myId) {
        throw new ForbiddenException("不能申请自己的稿件");
      }
      const targetUserId =
        conv.participant1Id === myId ? conv.participant2Id : conv.participant1Id;
      if (Number(targetUserId) !== Number(publisherId)) {
        throw new ForbiddenException("请在与发起者的会话中发送申请");
      }
      if (applyCommission.status !== "new" && applyCommission.status !== "pending") {
        throw new ForbiddenException("该稿件暂不可申请");
      }
      const applyPayerId =
        applyCommission.direction === "offer"
          ? applyCommission.clientId
          : applyCommission.artistId;
      if (
        applyCommission.status === "pending" &&
        publisherId != null &&
        applyPayerId != null
      ) {
        throw new ForbiddenException(
          "该稿件已确认承接方，请等待支付流程完成或对方取消支付后再试",
        );
      }
      applyCommissionId = applyCommission.id;
      commissionInboxNotifyIds = [publisherId, myId];
    }

    const message = await this.prisma.$transaction(async (tx) => {
      if (applyCommissionId) {
        const promoted = await tx.commission.updateMany({
          where: { id: applyCommissionId, status: "new" },
          data: { status: "pending" },
        });
        if (promoted.count === 0) {
          const row = await tx.commission.findUnique({
            where: { id: applyCommissionId },
            select: { status: true },
          });
          if (row?.status !== "pending") {
            throw new ForbiddenException("该稿件状态已变化，请刷新后重试");
          }
        }
      }

      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: myId,
          content,
        },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
        },
      });
      await tx.conversationRead.upsert({
        where: { conversationId_userId: { conversationId, userId: myId } },
        update: { lastReadAt: new Date() },
        create: { conversationId, userId: myId, lastReadAt: new Date() },
      });
      return created;
    });

    const response = {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      senderId: message.senderId,
      sender: message.sender.username,
      senderAvatar: message.sender.avatarUrl,
    };
    void this.chatPush.notifyFromMessageId(message.id);
    if (commissionInboxNotifyIds && applyCommissionId != null) {
      this.chatPush.notifyCommissionInboxRefresh(
        commissionInboxNotifyIds,
        applyCommissionId,
      );
    }
    return response;
  }

  /** 删除会话（及其消息），仅参与者可删 */
  async delete(conversationId: number, myId: number) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException("会话不存在");
    const isParticipant =
      conv.participant1Id === myId || conv.participant2Id === myId;
    if (!isParticipant) throw new ForbiddenException("无权删除该会话");

    await this.prisma.message.deleteMany({ where: { conversationId } });
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { success: true };
  }

  private toConversationResponse(conv: any, myId: number) {
    const other =
      conv.participant1Id === myId ? conv.participant2 : conv.participant1;
    const last = conv.messages?.[0];
    return {
      id: conv.id,
      otherUser: {
        id: other.id,
        username: other.username,
        avatarUrl: other?.avatarUrl ?? null,
      },
      lastMessage: last
        ? {
            content: last.content,
            createdAt: last.createdAt,
            senderId: last.sender?.id,
          }
        : null,
      createdAt: conv.createdAt,
    };
  }

  private toConversationListItem(conv: any, myId: number) {
    const other =
      conv.participant1Id === myId ? conv.participant2 : conv.participant1;
    const last = conv.lastMessage;
    return {
      id: conv.id,
      otherUser: {
        id: other.id,
        username: other.username,
        avatarUrl: other?.avatarUrl ?? null,
      },
      lastMessage: last
        ? {
            content: last.content,
            createdAt: last.createdAt,
            senderId: last.sender?.id,
          }
        : null,
      unreadCount: conv.unreadCount ?? 0,
      createdAt: conv.createdAt,
    };
  }
}
