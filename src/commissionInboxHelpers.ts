/** 消息页稿件列表与右侧进度台共用 */

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
    new: "新建",
    pending: "待确认",
    "payment-pending": "待支付",
    wip: "进行中",
    "review-pending": "待验收",
    revising: "修改中",
    done: "已完成",
};

export type CommissionViewerRole = "publisher" | "payer";

/** 与 backend commissions.service getPublisherId / getPayerId 一致 */
export interface CommissionParties {
    direction?: string;
    clientId?: number | null;
    artistId?: number | null;
}

export function getCommissionPublisherUserId(c: CommissionParties): number | null {
    const dir = c.direction ?? "commission";
    return dir === "offer" ? (c.artistId ?? null) : (c.clientId ?? null);
}

export function getCommissionPayerUserId(c: CommissionParties): number | null {
    const dir = c.direction ?? "commission";
    return dir === "offer" ? (c.clientId ?? null) : (c.artistId ?? null);
}

/**
 * 稿约双方在进度页的展示名后缀。
 * 优先用委托上的 clientId/artistId；待确认等阶段可能只有发布方一端有 id，则相对推断；再不行则按当前查看者角色推断对侧。
 */
export function getCounterpartyPartyLabelText(
    counterpartyUserId: number,
    c: CommissionParties,
    viewerRole?: CommissionViewerRole,
): string {
    const payId = getCommissionPayerUserId(c);
    const pubId = getCommissionPublisherUserId(c);
    if (payId != null && counterpartyUserId === payId) return "约稿方";
    if (pubId != null && counterpartyUserId === pubId) return "发稿方";
    // 待确认等阶段对方可能尚未写入 artistId/clientId，只能相对已知的发布方判断
    if (pubId != null && payId == null) {
        return counterpartyUserId === pubId ? "发稿方" : "约稿方";
    }
    if (pubId == null && payId != null) {
        return counterpartyUserId === payId ? "约稿方" : "发稿方";
    }
    if (viewerRole === "publisher") return "约稿方";
    if (viewerRole === "payer") return "发稿方";
    return "约稿方";
}

export interface CommissionApplicationLike {
    kind: "incoming" | "payment" | "outgoing-pending";
    /** false 时发布方需处理（含取消支付后需重新确认） */
    handled: boolean;
    viewerRole: CommissionViewerRole;
    commission: {
        status?: string;
        paymentStatus?: string;
        clientId?: number | null;
        artistId?: number | null;
    };
    canPay?: boolean;
    canSubmit?: boolean;
    canAccept?: boolean;
}

/** 与消息页「稿件消息」侧栏红点规则一致，供底栏「消息」未读合并 */
export function countCommissionInboxUnreadForBadge(apps: CommissionApplicationLike[]): number {
    return apps.reduce((sum, app) => {
        if (app.kind === "incoming") return sum + (app.handled ? 0 : 1);
        if (app.kind === "outgoing-pending") return sum;
        return sum +
            (app.canPay || app.canSubmit || app.canAccept
                ? 1
                : app.kind === "payment" &&
                    app.viewerRole === "publisher" &&
                    app.commission.status === "pending" &&
                    !app.handled
                  ? 1
                  : 0);
    }, 0);
}

/**
 * 稿件消息里展示的 5 段进度（不含「新建」）：
 * 1 待确认 → 2 待支付 → 3 进行中 → 4 待验收 → 5 已完成
 */
export const COMMISSION_PIPELINE_STEP_LABELS = [
    "待确认",
    "待支付",
    "进行中",
    "待验收",
    "已完成",
] as const;

export type CommissionPipelineStep = 1 | 2 | 3 | 4 | 5;

export function getCommissionPipelineStep(app: CommissionApplicationLike): CommissionPipelineStep {
    const st = app.commission.status ?? "";
    if (app.kind === "outgoing-pending") return 1;
    if (app.kind === "incoming" && !app.handled) return 1;
    if (st === "pending") return 1;
    if (st === "payment-pending") return 2;
    if (st === "wip" || st === "revising") return 3;
    if (st === "review-pending") return 4;
    if (st === "done") return 5;
    return 1;
}

/** 列表行副标题 / 进度一句话 */
export function getCommissionProgressHint(app: CommissionApplicationLike): string {
    if (app.kind === "outgoing-pending") return "待对方确认申请";
    if (app.kind === "incoming") return app.handled ? "申请已处理" : "待您确认该申请";
    const st = app.commission.status ?? "";
    if (st === "done") return "稿件已全部完成";
    if (app.canAccept) return "待验收：可下载交付文件，不满意可取消验收退回进行中，满意则完成验收";
    if (app.canSubmit) return "进行中：可多次通过「提交」同步文件，全部完成后点击「完成」进入待验收";
    if (app.canPay && st === "payment-pending")
        return "待您完成支付；可点「取消支付」退回待确认（绑定保留，需发布方重新确认后再付）";
    if (st === "review-pending" && app.viewerRole === "publisher") return "已提交，等待对方验收";
    const partiesBound =
        app.commission.clientId != null && app.commission.artistId != null;
    if (
        app.viewerRole === "publisher" &&
        st === "pending" &&
        partiesBound &&
        app.commission.paymentStatus !== "paid" &&
        !app.handled
    )
        return "对方已取消支付：请重新确认以再次进入待支付";
    if (
        app.viewerRole === "payer" &&
        st === "pending" &&
        partiesBound &&
        app.commission.paymentStatus !== "paid" &&
        !app.canPay
    )
        return "等待发布方重新确认后即可支付";
    if (
        app.viewerRole === "publisher" &&
        app.commission.paymentStatus !== "paid" &&
        st === "payment-pending"
    )
        return "等待对方支付";
    if (st === "wip" || st === "revising") return "制作进行中";
    return "委托跟进中";
}

/** 收件箱「稿件消息」→ 稿件详情 → 返回时恢复列表与右侧选中项 */
export const OC_INBOX_COMMISSION_RESTORE_STORAGE_KEY = "oc_inbox_commission_restore";

export interface InboxCommissionRestorePayload {
    applicationId: string;
    conversationId: string;
    commissionId: number;
}

export function writeInboxCommissionRestore(payload: InboxCommissionRestorePayload) {
    try {
        sessionStorage.setItem(OC_INBOX_COMMISSION_RESTORE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        /* ignore */
    }
}

export function clearInboxCommissionRestore() {
    try {
        sessionStorage.removeItem(OC_INBOX_COMMISSION_RESTORE_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

/** 详情页返回：仅当记录与当前详情 id 一致时使用，避免误回到错误收件箱状态 */
export function readInboxCommissionRestoreForDetail(
    routerState: unknown,
    commissionDetailRouteId: string | undefined,
): InboxCommissionRestorePayload | null {
    if (!commissionDetailRouteId) return null;
    const sid = String(commissionDetailRouteId);
    const fromState = (routerState as { inboxCommissionRestore?: InboxCommissionRestorePayload })
        ?.inboxCommissionRestore;
    if (
        fromState &&
        String(fromState.commissionId) === sid &&
        fromState.applicationId &&
        fromState.conversationId
    ) {
        return fromState;
    }
    try {
        const raw = sessionStorage.getItem(OC_INBOX_COMMISSION_RESTORE_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (
            parsed &&
            typeof parsed === "object" &&
            typeof (parsed as InboxCommissionRestorePayload).applicationId === "string" &&
            typeof (parsed as InboxCommissionRestorePayload).conversationId === "string" &&
            (parsed as InboxCommissionRestorePayload).commissionId != null &&
            String((parsed as InboxCommissionRestorePayload).commissionId) === sid
        ) {
            return parsed as InboxCommissionRestorePayload;
        }
    } catch {
        /* ignore */
    }
    return null;
}

/** 进入 /inbox 时：路由 state 或 sessionStorage（支持浏览器后退） */
export function peekInboxCommissionRestoreForInbox(routerState: unknown): InboxCommissionRestorePayload | null {
    const fromState = (routerState as { inboxCommissionRestore?: InboxCommissionRestorePayload })
        ?.inboxCommissionRestore;
    if (
        fromState &&
        fromState.applicationId &&
        fromState.conversationId &&
        fromState.commissionId != null
    ) {
        return fromState;
    }
    try {
        const raw = sessionStorage.getItem(OC_INBOX_COMMISSION_RESTORE_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (
            parsed &&
            typeof parsed === "object" &&
            typeof (parsed as InboxCommissionRestorePayload).applicationId === "string" &&
            typeof (parsed as InboxCommissionRestorePayload).conversationId === "string" &&
            (parsed as InboxCommissionRestorePayload).commissionId != null
        ) {
            return parsed as InboxCommissionRestorePayload;
        }
    } catch {
        /* ignore */
    }
    return null;
}

/** 非从收件箱带 state 进入详情时，若本地记录指向其它稿件则丢弃；刷新详情页（无 state）时同 id 仍保留记忆 */
export function discardInboxCommissionRestoreIfDetailMismatch(
    routerState: unknown,
    commissionDetailRouteId: string | undefined,
) {
    if (!commissionDetailRouteId) return;
    if ((routerState as { inboxCommissionRestore?: unknown })?.inboxCommissionRestore) return;
    try {
        const raw = sessionStorage.getItem(OC_INBOX_COMMISSION_RESTORE_STORAGE_KEY);
        if (!raw) return;
        const p = JSON.parse(raw) as InboxCommissionRestorePayload;
        if (String(p.commissionId) !== String(commissionDetailRouteId)) {
            clearInboxCommissionRestore();
        }
    } catch {
        clearInboxCommissionRestore();
    }
}
