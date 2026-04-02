import { useState } from "react";

/**
 * 交付文件 URL 存库多为 /uploads/... 。开发环境下若拼成 :3000 会与页面 :5173 跨域，
 * 浏览器会忽略 download 且拦截连续 window.open，导致只能下到第一张。
 * 使用与当前页同源的路径（经 Vite / 生产反代）以便多张图可依次下载。
 */
function resolveFileHref(url: string): string {
    const t = url.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    return t.startsWith("/") ? t : `/${t}`;
}

export interface DeliveryFileRef {
    name: string;
    url: string;
    relativePath?: string | null;
}

export interface CommissionReviewPayerActionsProps {
    variant: "application" | "detail";
    files: DeliveryFileRef[];
    isRejecting?: boolean;
    isAccepting?: boolean;
    onRejectReview: () => void | Promise<void>;
    onAcceptDelivery: () => void | Promise<void>;
}

/**
 * 待验收阶段承接方：下载发布方交付、取消验收退回进行中、完成验收。
 */
export default function CommissionReviewPayerActions({
    variant,
    files,
    isRejecting,
    isAccepting,
    onRejectReview,
    onAcceptDelivery,
}: CommissionReviewPayerActionsProps) {
    const [acceptModalOpen, setAcceptModalOpen] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const hasFiles = files.length > 0;
    const busy = !!isRejecting || !!isAccepting;

    const downloadLabel = "下载交付文件";

    const onDownloadAll = () => {
        void (async () => {
            const delayMs = 450;
            for (let i = 0; i < files.length; i++) {
                if (i > 0) {
                    await new Promise((r) => setTimeout(r, delayMs));
                }
                const f = files[i];
                const href = resolveFileHref(f.url);
                const name = (f.name && f.name.trim()) || `交付文件-${i + 1}`;

                const isCrossOrigin = (() => {
                    try {
                        const u = new URL(href, window.location.origin);
                        return u.origin !== window.location.origin;
                    } catch {
                        return false;
                    }
                })();

                if (isCrossOrigin) {
                    try {
                        const res = await fetch(href, { mode: "cors" });
                        if (!res.ok) throw new Error("fetch failed");
                        const blob = await res.blob();
                        const objectUrl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = objectUrl;
                        a.setAttribute("download", name);
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(objectUrl);
                        continue;
                    } catch {
                        /* fall through to direct link */
                    }
                }

                const a = document.createElement("a");
                a.href = href;
                a.setAttribute("download", name);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        })();
    };

    const confirmReject = () => {
        setRejectModalOpen(false);
        void onRejectReview();
    };

    const confirmAccept = () => {
        setAcceptModalOpen(false);
        void onAcceptDelivery();
    };

    const leftClass =
        variant === "detail"
            ? "commission-detail-secondary-btn commission-review-payer-actions-btn"
            : "commission-application-detail-reject-btn commission-review-payer-actions-btn";
    const midClass =
        variant === "detail"
            ? "commission-detail-secondary-btn commission-review-payer-actions-btn commission-review-payer-actions-btn--danger"
            : "commission-application-detail-reject-btn commission-review-payer-actions-btn commission-review-payer-actions-btn--danger";
    const rightClass =
        variant === "detail"
            ? "commission-detail-primary-btn commission-review-payer-actions-btn"
            : "commission-application-detail-confirm-btn commission-review-payer-actions-btn";

    return (
        <>
            <div className="commission-review-payer-actions">
                <div className="commission-review-payer-actions-cell">
                    {hasFiles ? (
                        <button
                            type="button"
                            className={leftClass}
                            disabled={busy}
                            onClick={onDownloadAll}
                        >
                            {downloadLabel}
                        </button>
                    ) : (
                        <span className="commission-review-payer-no-files" role="status">
                            未收到文件
                        </span>
                    )}
                </div>
                <div className="commission-review-payer-actions-cell">
                    <button
                        type="button"
                        className={midClass}
                        disabled={busy}
                        onClick={() => setRejectModalOpen(true)}
                    >
                        {isRejecting ? "处理中..." : "取消验收"}
                    </button>
                </div>
                <div className="commission-review-payer-actions-cell">
                    <button
                        type="button"
                        className={rightClass}
                        disabled={busy}
                        onClick={() => setAcceptModalOpen(true)}
                    >
                        {isAccepting ? "处理中..." : "完成验收"}
                    </button>
                </div>
            </div>

            {rejectModalOpen && (
                <div
                    className="commission-apply-confirm-overlay"
                    role="presentation"
                    onClick={() => {
                        if (isRejecting) return;
                        setRejectModalOpen(false);
                    }}
                >
                    <div
                        className="commission-apply-confirm-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="commission-review-reject-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="commission-apply-confirm-header">
                            <h3 id="commission-review-reject-title">确认取消验收</h3>
                            <button
                                type="button"
                                className="commission-apply-confirm-close"
                                disabled={!!isRejecting}
                                aria-label="关闭"
                                onClick={() => setRejectModalOpen(false)}
                            >
                                ×
                            </button>
                        </div>
                        <p className="commission-apply-confirm-body">
                            确定取消验收吗？稿件将退回「进行中」，发布方可继续修改并重新提交交付。
                        </p>
                        <div className="commission-apply-confirm-footer">
                            <button
                                type="button"
                                className="commission-apply-confirm-cancel"
                                disabled={!!isRejecting}
                                onClick={() => setRejectModalOpen(false)}
                            >
                                返回
                            </button>
                            <button
                                type="button"
                                className="commission-apply-confirm-danger"
                                disabled={!!isRejecting}
                                onClick={() => confirmReject()}
                            >
                                {isRejecting ? "处理中..." : "确定取消验收"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {acceptModalOpen && (
                <div
                    className="commission-apply-confirm-overlay"
                    role="presentation"
                    onClick={() => {
                        if (isAccepting) return;
                        setAcceptModalOpen(false);
                    }}
                >
                    <div
                        className="commission-apply-confirm-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="commission-review-accept-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="commission-apply-confirm-header">
                            <h3 id="commission-review-accept-title">确认完成验收</h3>
                            <button
                                type="button"
                                className="commission-apply-confirm-close"
                                disabled={!!isAccepting}
                                aria-label="关闭"
                                onClick={() => setAcceptModalOpen(false)}
                            >
                                ×
                            </button>
                        </div>
                        <p className="commission-apply-confirm-body">
                            确定完成验收吗？稿件将标记为已完成。
                        </p>
                        <div className="commission-apply-confirm-footer">
                            <button
                                type="button"
                                className="commission-apply-confirm-cancel"
                                disabled={!!isAccepting}
                                onClick={() => setAcceptModalOpen(false)}
                            >
                                返回
                            </button>
                            <button
                                type="button"
                                className="commission-apply-confirm-primary"
                                disabled={!!isAccepting}
                                onClick={() => confirmAccept()}
                            >
                                {isAccepting ? "处理中..." : "确定完成验收"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
