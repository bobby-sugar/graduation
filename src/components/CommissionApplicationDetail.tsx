import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    formatCommissionDateTime,
    parseCommissionDescription,
} from "../commissionDescriptionMeta";
import {
    COMMISSION_PIPELINE_STEP_LABELS,
    getCommissionPipelineStep,
    getCommissionProgressHint,
    getCounterpartyPartyLabelText,
    writeInboxCommissionRestore,
    type CommissionPipelineStep,
    type CommissionViewerRole,
} from "../commissionInboxHelpers";
import CommissionDeliverySubmitButton from "./CommissionDeliverySubmitButton";
import CommissionPublisherDeliveryList from "./CommissionPublisherDeliveryList";
import CommissionReviewPayerActions from "./CommissionReviewPayerActions";

const API_BASE_URL = "http://localhost:3000";

function normalizeCover(url: string | null | undefined): string | undefined {
    if (!url || typeof url !== "string") return undefined;
    return url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
}

interface CommissionApplicationItem {
    id: string;
    kind: "incoming" | "payment" | "outgoing-pending";
    viewerRole: CommissionViewerRole;
    applicationMessageId?: number | null;
    conversationId: number;
    createdAt: string;
    applicant: {
        id: number;
        username: string;
        avatarUrl?: string | null;
    };
    commission: {
        id: number;
        title: string;
        category?: string;
        price?: number;
        direction?: "commission" | "offer" | string;
        status?: string;
        paymentStatus?: string;
        previewImageUrl?: string | null;
        description?: string | null;
        submittedAt?: string;
        clientId?: number | null;
        artistId?: number | null;
    };
    handled: boolean;
    canPay?: boolean;
    canSubmit?: boolean;
    canAccept?: boolean;
    publisherDeliveryFiles?: Array<{
        name: string;
        url: string;
        relativePath?: string | null;
    }>;
}

interface CommissionApplicationDetailProps {
    application?: CommissionApplicationItem;
    token?: string | null;
    onPublisherDeliveryChanged?: () => void | Promise<void>;
    onConfirm: (applicationId: number) => Promise<void>;
    onReject: (applicationId: number) => Promise<void>;
    onPay: (commissionId: number) => Promise<void>;
    onCancelPay?: (commissionId: number) => Promise<void>;
    onSubmitDelivery: (commissionId: number, files: File[], finalize: boolean) => Promise<void>;
    onAcceptDelivery: (commissionId: number) => Promise<void>;
    onRejectReview: (commissionId: number) => Promise<void>;
    confirmingId?: number | null;
    rejectingId?: number | null;
    payingCommissionId?: number | null;
    cancelingCommissionId?: number | null;
    submittingCommissionId?: number | null;
    acceptingCommissionId?: number | null;
    rejectingReviewCommissionId?: number | null;
}

function CommissionProgressChain({ app }: { app: CommissionApplicationItem }) {
    const st = app.commission.status ?? "";
    const allDone = st === "done";
    const current = getCommissionPipelineStep(app);

    const nodeClass = (step: CommissionPipelineStep) => {
        if (allDone) return "commission-chain-node commission-chain-node--done";
        if (step < current) return "commission-chain-node commission-chain-node--done";
        if (step === current) return "commission-chain-node commission-chain-node--active";
        return "commission-chain-node commission-chain-node--todo";
    };

    const nodeInner = (step: CommissionPipelineStep) => {
        if (allDone || step < current) {
            return (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            );
        }
        return String(step);
    };

    /** 与原先整根进度条等价的每段填充（0–1），段 k 位于步骤 k 与 k+1 之间 */
    const segmentFillRatio = (segmentIndex: number) => {
        if (allDone) return 1;
        const F = Math.max(0, Math.min(1, (current - 1) / 4));
        return Math.max(0, Math.min(1, 4 * F - segmentIndex));
    };

    return (
        <div className="commission-chain" aria-label="委托进度">
            <div className="commission-chain-track">
                {/* 9 列：28px 圆 + 1fr 缝 ×4，横线只在缝里，不进入圆点列 */}
                <div className="commission-chain-pipeline-grid">
                    {COMMISSION_PIPELINE_STEP_LABELS.map((_label, idx) => {
                        const step = (idx + 1) as CommissionPipelineStep;
                        const segAfter = idx < COMMISSION_PIPELINE_STEP_LABELS.length - 1;
                        const r = segAfter ? segmentFillRatio(idx) : 0;
                        const pct = r * 100;
                        return (
                            <Fragment key={step}>
                                <div
                                    className="commission-chain-node-cell"
                                    style={{ gridColumn: idx * 2 + 1, gridRow: 1 }}
                                >
                                    <div
                                        className={nodeClass(step)}
                                        aria-current={!allDone && current === step ? "step" : undefined}
                                    >
                                        {nodeInner(step)}
                                    </div>
                                </div>
                                {segAfter && (
                                    <div
                                        className="commission-chain-seg-cell"
                                        style={{ gridColumn: idx * 2 + 2, gridRow: 1 }}
                                        aria-hidden="true"
                                    >
                                        <div className="commission-chain-seg-track">
                                            <div className="commission-chain-line-bg" />
                                            <div
                                                className={`commission-chain-line-fill${pct >= 100 ? " commission-chain-line-fill--full" : ""}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </Fragment>
                        );
                    })}
                    {COMMISSION_PIPELINE_STEP_LABELS.map((label, idx) => (
                        <span
                            key={`cap-${idx}`}
                            className="commission-chain-caption commission-chain-caption--pipeline"
                            style={{ gridColumn: idx * 2 + 1, gridRow: 2 }}
                        >
                            {label}
                        </span>
                    ))}
                </div>
            </div>
            <p className="commission-chain-hint">{getCommissionProgressHint(app)}</p>
        </div>
    );
}

export default function CommissionApplicationDetail({
    application,
    token,
    onPublisherDeliveryChanged,
    onConfirm,
    onReject,
    onPay,
    onCancelPay,
    onSubmitDelivery,
    onAcceptDelivery,
    onRejectReview,
    confirmingId,
    rejectingId,
    payingCommissionId,
    cancelingCommissionId,
    submittingCommissionId,
    acceptingCommissionId,
    rejectingReviewCommissionId,
}: CommissionApplicationDetailProps) {
    const navigate = useNavigate();
    const [applyDecisionModal, setApplyDecisionModal] = useState<null | "reject" | "accept">(null);
    const [payDecisionModal, setPayDecisionModal] = useState<null | "pay" | "cancel-pay">(null);

    useEffect(() => {
        setApplyDecisionModal(null);
        setPayDecisionModal(null);
    }, [application?.id]);

    const coverSrc = useMemo(
        () => normalizeCover(application?.commission.previewImageUrl),
        [application?.commission.previewImageUrl],
    );

    const parsedDesc = useMemo(
        () => parseCommissionDescription(application?.commission.description),
        [application?.commission.description],
    );

    if (!application) {
        return (
            <div className="commission-application-detail-empty">
                <p>请选择一条稿件申请</p>
                <span>确认前请先核对申请人、稿件和委托信息。</span>
            </div>
        );
    }

    const isIncoming = application.kind === "incoming";
    const isOutgoingPending = application.kind === "outgoing-pending";
    const applyMessageId = application.applicationMessageId ?? null;
    const isConfirming = !!applyMessageId && confirmingId === applyMessageId;
    const isRejecting = !!applyMessageId && rejectingId === applyMessageId;
    const isPaying = payingCommissionId === application.commission.id;
    const isCancelingPay = cancelingCommissionId === application.commission.id;
    const isSubmitting = submittingCommissionId === application.commission.id;
    const isAccepting = acceptingCommissionId === application.commission.id;
    const isRejectingReview =
        rejectingReviewCommissionId === application.commission.id;
    const canConfirm = !application.handled && !isConfirming && !isRejecting;
    const canReject = !application.handled && !isConfirming && !isRejecting;
    const canPay = !!application.canPay && !isPaying && !isCancelingPay;
    const canCancelPayWhilePending =
        canPay &&
        !!onCancelPay &&
        application.commission.status === "payment-pending";
    const commissionPartiesBound =
        application.commission.clientId != null &&
        application.commission.artistId != null;
    const publisherAwaitingPayerUnpaid =
        application.viewerRole === "publisher" &&
        application.commission.paymentStatus !== "paid" &&
        application.commission.status === "payment-pending";
    const payerAwaitingPublisherReopen =
        application.viewerRole === "payer" &&
        application.commission.status === "pending" &&
        commissionPartiesBound &&
        application.commission.paymentStatus !== "paid" &&
        !application.canPay;
    const busyPay = isPaying || isCancelingPay;
    const canSubmit = !!application.canSubmit && !isSubmitting;
    const directionLabel = application.commission.direction === "offer" ? "接稿单" : "约稿单";
    const showPublisherAcceptReject =
        application.viewerRole === "publisher" &&
        application.commission.status === "pending" &&
        !application.handled &&
        applyMessageId != null &&
        (isIncoming || application.kind === "payment");
    const isReopenAfterCancelPay =
        application.kind === "payment" && showPublisherAcceptReject;
    const useApplyDecisionModal = showPublisherAcceptReject;
    const busyIncoming = isConfirming || isRejecting;
    const showPublisherDeliveryManage =
        !!token &&
        application.viewerRole === "publisher" &&
        application.commission.paymentStatus === "paid" &&
        (application.canSubmit === true ||
            application.commission.status === "review-pending");

    const counterpartyPartyTag = getCounterpartyPartyLabelText(
        application.applicant.id,
        application.commission,
        application.viewerRole,
    );

    const priceText =
        typeof application.commission.price === "number"
            ? `¥${application.commission.price.toLocaleString("zh-CN")}`
            : null;

    const meta = (key: string) => parsedDesc.map[key];
    const amountDisplay = meta("金额")
        ? `¥${meta("金额")}`
        : priceText ?? "—";
    const typeDisplay = meta("稿件类型") || application.commission.category?.trim() || "—";
    const submittedDisplay = formatCommissionDateTime(
        application.commission.submittedAt ?? application.createdAt,
    );
    const deliveryDisplay = meta("交付时间") || "—";
    const copyrightDisplay = meta("版权") || "—";

    return (
        <div className="commission-application-detail">
            <div className="commission-application-detail-header">
                <h3>进度与操作</h3>
            </div>
            <CommissionProgressChain app={application} />
            <div className="commission-application-detail-card">
                <div className="commission-application-detail-applicant">
                    {application.applicant.avatarUrl ? (
                        <img src={application.applicant.avatarUrl} alt={application.applicant.username} />
                    ) : (
                        <div className="commission-application-detail-avatar-placeholder">
                            {application.applicant.username.slice(0, 1)}
                        </div>
                    )}
                    <div>
                        <div className="commission-application-detail-name-row">
                            <span className="commission-application-detail-name">
                                {application.applicant.username}
                            </span>
                            <span className="commission-application-detail-party-tag">
                                {counterpartyPartyTag}
                            </span>
                        </div>
                        <div className="commission-application-detail-meta">
                            {isIncoming || isOutgoingPending ? "申请时间" : "确认时间"}：
                            {new Date(application.createdAt).toLocaleString("zh-CN")}
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    className="commission-application-detail-commission"
                    onClick={() => {
                        const payload = {
                            applicationId: application.id,
                            conversationId: String(application.conversationId),
                            commissionId: application.commission.id,
                        };
                        writeInboxCommissionRestore(payload);
                        navigate(`/commissions/${application.commission.id}`, {
                            state: { inboxCommissionRestore: payload },
                        });
                    }}
                >
                    <div className="commission-application-detail-cover-wrap">
                        {coverSrc ? (
                            <img src={coverSrc} alt={application.commission.title} />
                        ) : (
                            <div className="commission-application-detail-cover-placeholder">无封面</div>
                        )}
                    </div>
                    <div className="commission-application-detail-commission-info">
                        <div className="commission-application-detail-title">{application.commission.title}</div>
                        <div className="commission-application-detail-direction-text">{directionLabel}</div>
                        <div className="commission-detail-info-grid commission-detail-info-grid-extended commission-application-detail-info-grid">
                            <div className="commission-detail-info-block">
                                <div className="commission-detail-info-label">金额</div>
                                <div className="commission-detail-info-value">{amountDisplay}</div>
                            </div>
                            <div className="commission-detail-info-block">
                                <div className="commission-detail-info-label">发布时间</div>
                                <div className="commission-detail-info-value">{submittedDisplay}</div>
                            </div>
                            <div className="commission-detail-info-block">
                                <div className="commission-detail-info-label">稿件类型</div>
                                <div className="commission-detail-info-value">{typeDisplay}</div>
                            </div>
                            <div className="commission-detail-info-block">
                                <div className="commission-detail-info-label">交付时间</div>
                                <div className="commission-detail-info-value">{deliveryDisplay}</div>
                            </div>
                            <div className="commission-detail-info-block">
                                <div className="commission-detail-info-label">版权</div>
                                <div className="commission-detail-info-value">{copyrightDisplay}</div>
                            </div>
                        </div>
                    </div>
                </button>
            </div>

            <div
                className={`commission-application-detail-actions${
                    application.canAccept ? " commission-application-detail-actions--review" : ""
                }`}
            >
                {isOutgoingPending ? (
                    <p className="commission-application-detail-wait-publisher">待对方确认申请</p>
                ) : showPublisherAcceptReject ? (
                    <>
                        <button
                            type="button"
                            className="commission-application-detail-reject-btn"
                            disabled={!canReject || !applyMessageId || busyIncoming}
                            onClick={() => {
                                if (!applyMessageId) return;
                                if (useApplyDecisionModal) {
                                    setApplyDecisionModal("reject");
                                    return;
                                }
                                onReject(applyMessageId);
                            }}
                        >
                            {application.handled
                                ? "已处理"
                                : isReopenAfterCancelPay
                                  ? (isRejecting ? "拒绝中..." : "拒绝并回退新建")
                                  : (isRejecting ? "拒绝中..." : "拒绝申请")}
                        </button>
                        <button
                            type="button"
                            className="commission-application-detail-confirm-btn"
                            disabled={!canConfirm || !applyMessageId || busyIncoming}
                            onClick={() => {
                                if (!applyMessageId) return;
                                if (useApplyDecisionModal) {
                                    setApplyDecisionModal("accept");
                                    return;
                                }
                                onConfirm(applyMessageId);
                            }}
                        >
                            {application.handled
                                ? "已确认"
                                : isReopenAfterCancelPay
                                  ? (isConfirming ? "确认中..." : "重新确认并进入待支付")
                                  : (isConfirming ? "接受中..." : "接受申请")}
                        </button>
                    </>
                ) : (
                    <>
                        {showPublisherDeliveryManage ? (
                            <CommissionPublisherDeliveryList
                                commissionId={application.commission.id}
                                token={token ?? null}
                                enabled={showPublisherDeliveryManage}
                                allowRemove={application.commission.status !== "review-pending"}
                                variant="application"
                                onChanged={onPublisherDeliveryChanged}
                            />
                        ) : null}
                        {application.canAccept ? (
                            <CommissionReviewPayerActions
                                variant="application"
                                files={application.publisherDeliveryFiles ?? []}
                                isRejecting={isRejectingReview}
                                isAccepting={isAccepting}
                                onRejectReview={() =>
                                    onRejectReview(application.commission.id)
                                }
                                onAcceptDelivery={() =>
                                    onAcceptDelivery(application.commission.id)
                                }
                            />
                        ) : application.canSubmit ? (
                            <CommissionDeliverySubmitButton
                                variant="application"
                                disabled={!canSubmit}
                                isSubmitting={isSubmitting}
                                onDeliver={(files, finalize) =>
                                    onSubmitDelivery(application.commission.id, files, finalize)
                                }
                            />
                        ) : payerAwaitingPublisherReopen ? (
                            <p className="commission-application-detail-wait-publisher" role="status">
                                等待发布方重新确认后，您可再次支付
                            </p>
                        ) : publisherAwaitingPayerUnpaid ? (
                            <p className="commission-application-detail-wait-publisher" role="status">
                                等待对方支付
                            </p>
                        ) : application.viewerRole === "publisher" &&
                          application.commission.status === "review-pending" ? (
                            <p className="commission-application-detail-wait-publisher" role="status">
                                已发起验收，等待承接方处理
                            </p>
                        ) : canCancelPayWhilePending ? (
                            <div className="commission-pay-cancel-row">
                                <button
                                    type="button"
                                    className="commission-detail-secondary-btn commission-pay-cancel-row__btn"
                                    disabled={busyPay || application.commission.status === "done"}
                                    onClick={() => setPayDecisionModal("cancel-pay")}
                                >
                                    取消支付
                                </button>
                                <button
                                    type="button"
                                    className="commission-application-detail-confirm-btn commission-pay-cancel-row__btn"
                                    disabled={!canPay || busyPay || application.commission.status === "done"}
                                    onClick={() => setPayDecisionModal("pay")}
                                >
                                    立即支付
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="commission-application-detail-confirm-btn"
                                disabled={!canPay || application.commission.status === "done"}
                                onClick={() =>
                                    application.commission.status !== "done" && application.canPay
                                        ? setPayDecisionModal("pay")
                                        : undefined
                                }
                            >
                                {application.commission.status === "done"
                                    ? "已完成"
                                    : isPaying
                                      ? "支付中..."
                                      : isCancelingPay
                                        ? "处理中..."
                                        : application.canPay
                                          ? "立即支付"
                                          : "已支付"}
                            </button>
                        )}
                    </>
                )}
            </div>

            {payDecisionModal && (
                <div
                    className="commission-apply-confirm-overlay"
                    role="presentation"
                    onClick={() => {
                        if (busyPay) return;
                        setPayDecisionModal(null);
                    }}
                >
                    <div
                        className="commission-apply-confirm-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="commission-pay-confirm-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="commission-apply-confirm-header">
                            <h3 id="commission-pay-confirm-title">
                                {payDecisionModal === "cancel-pay" ? "取消支付" : "确认支付"}
                            </h3>
                            <button
                                type="button"
                                className="commission-apply-confirm-close"
                                disabled={busyPay}
                                aria-label="关闭"
                                onClick={() => setPayDecisionModal(null)}
                            >
                                ×
                            </button>
                        </div>
                        <p className="commission-apply-confirm-body">
                            {payDecisionModal === "cancel-pay"
                                ? "确定取消支付？稿件将退回「待确认」，绑定保留；需由发布方重新确认后，您才可再次支付。"
                                : "确定完成支付？支付成功后稿件将进入「进行中」，发布方可开始交付；请确认金额与约定无误。"}
                        </p>
                        <div className="commission-apply-confirm-footer">
                            <button
                                type="button"
                                className="commission-apply-confirm-cancel"
                                disabled={busyPay}
                                onClick={() => setPayDecisionModal(null)}
                            >
                                返回
                            </button>
                            {payDecisionModal === "cancel-pay" ? (
                                <button
                                    type="button"
                                    className="commission-apply-confirm-danger"
                                    disabled={busyPay || !onCancelPay}
                                    onClick={() => {
                                        if (!onCancelPay) return;
                                        setPayDecisionModal(null);
                                        void onCancelPay(application.commission.id);
                                    }}
                                >
                                    {isCancelingPay ? "处理中..." : "确定取消"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="commission-apply-confirm-primary"
                                    disabled={busyPay}
                                    onClick={() => {
                                        setPayDecisionModal(null);
                                        void onPay(application.commission.id);
                                    }}
                                >
                                    {isPaying ? "处理中..." : "确定支付"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {applyDecisionModal && showPublisherAcceptReject && (
                <div
                    className="commission-apply-confirm-overlay"
                    role="presentation"
                    onClick={() => {
                        if (busyIncoming) return;
                        setApplyDecisionModal(null);
                    }}
                >
                    <div
                        className="commission-apply-confirm-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="commission-apply-confirm-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="commission-apply-confirm-header">
                            <h3 id="commission-apply-confirm-title">
                                {applyDecisionModal === "reject"
                                    ? isReopenAfterCancelPay
                                        ? "拒绝承接"
                                        : "拒绝申请"
                                    : isReopenAfterCancelPay
                                      ? "重新进入待支付"
                                      : "接受申请"}
                            </h3>
                            <button
                                type="button"
                                className="commission-apply-confirm-close"
                                disabled={busyIncoming}
                                aria-label="关闭"
                                onClick={() => setApplyDecisionModal(null)}
                            >
                                ×
                            </button>
                        </div>
                        <p className="commission-apply-confirm-body">
                            {applyDecisionModal === "reject"
                                ? isReopenAfterCancelPay
                                    ? "确定拒绝吗？稿件将恢复为新建状态，与当前承接方的绑定将解除。"
                                    : "确定要拒绝该申请吗？稿件将恢复为新建状态，其他用户仍可重新申请。"
                                : isReopenAfterCancelPay
                                  ? "确定后稿件将再次进入「待支付」，对方可完成支付；承接关系不变。"
                                  : "确定要接受该申请吗？将与该申请人进入待支付阶段，其他进行中的申请将不再有效。"}
                        </p>
                        <div className="commission-apply-confirm-footer">
                            <button
                                type="button"
                                className="commission-apply-confirm-cancel"
                                disabled={busyIncoming}
                                onClick={() => setApplyDecisionModal(null)}
                            >
                                取消
                            </button>
                            {applyDecisionModal === "reject" ? (
                                <button
                                    type="button"
                                    className="commission-apply-confirm-danger"
                                    disabled={!applyMessageId || busyIncoming}
                                    onClick={() => {
                                        if (!applyMessageId) return;
                                        setApplyDecisionModal(null);
                                        void onReject(applyMessageId);
                                    }}
                                >
                                    {isRejecting ? "处理中..." : "确定拒绝"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="commission-apply-confirm-primary"
                                    disabled={!applyMessageId || busyIncoming}
                                    onClick={() => {
                                        if (!applyMessageId) return;
                                        setApplyDecisionModal(null);
                                        void onConfirm(applyMessageId);
                                    }}
                                >
                                    {isConfirming
                                        ? "处理中..."
                                        : isReopenAfterCancelPay
                                          ? "确定重新确认"
                                          : "确定接受"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
