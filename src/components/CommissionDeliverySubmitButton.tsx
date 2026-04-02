import { useEffect, useRef, useState } from "react";

export interface CommissionDeliverySubmitButtonProps {
    disabled?: boolean;
    isSubmitting: boolean;
    /** finalize=false 为进行中同步交付（可多次）；finalize=true 且无文件为点击「完成」进入待验收 */
    onDeliver: (files: File[], finalize: boolean) => void | Promise<void>;
    variant: "application" | "detail";
}

/**
 * 「提交」+「完成」：提交展开后仅上传文件/文件夹（保持进行中）；全部交付完成后点「完成」进入待验收。
 */
export default function CommissionDeliverySubmitButton({
    disabled,
    isSubmitting,
    onDeliver,
    variant,
}: CommissionDeliverySubmitButtonProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const dirRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    const triggerClass =
        variant === "detail"
            ? "commission-detail-primary-btn"
            : "commission-application-detail-confirm-btn";

    const openPicker = (mode: "file" | "dir") => {
        setOpen(false);
        if (mode === "file") fileRef.current?.click();
        else dirRef.current?.click();
    };

    const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length === 0) return;
        await onDeliver(files, false);
    };

    const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);

    const openFinalizeModal = () => {
        setOpen(false);
        setFinalizeModalOpen(true);
    };

    const confirmFinalize = async () => {
        if (isSubmitting) return;
        setFinalizeModalOpen(false);
        await onDeliver([], true);
    };

    const busy = disabled || isSubmitting;

    return (
        <>
        <div className="commission-delivery-submit-row">
            <div className="commission-delivery-submit-wrap" ref={wrapRef}>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={onInputChange}
                />
                <input
                    ref={dirRef}
                    type="file"
                    multiple
                    {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
                    style={{ display: "none" }}
                    onChange={onInputChange}
                />
                <button
                    type="button"
                    className={triggerClass}
                    disabled={busy}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    onClick={() => setOpen((v) => !v)}
                >
                    {isSubmitting ? "提交中..." : "提交"}
                </button>
                {open && (
                    <div className="commission-delivery-submit-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => openPicker("file")}>
                            上传文件
                        </button>
                        <button type="button" role="menuitem" onClick={() => openPicker("dir")}>
                            上传文件夹
                        </button>
                    </div>
                )}
            </div>
            <button
                type="button"
                className={triggerClass}
                disabled={busy}
                onClick={openFinalizeModal}
            >
                完成
            </button>
        </div>

        {finalizeModalOpen && (
            <div
                className="commission-apply-confirm-overlay"
                role="presentation"
                onClick={() => {
                    if (isSubmitting) return;
                    setFinalizeModalOpen(false);
                }}
            >
                <div
                    className="commission-apply-confirm-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="commission-delivery-finalize-title"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="commission-apply-confirm-header">
                        <h3 id="commission-delivery-finalize-title">确认完成交付</h3>
                        <button
                            type="button"
                            className="commission-apply-confirm-close"
                            disabled={isSubmitting}
                            aria-label="关闭"
                            onClick={() => setFinalizeModalOpen(false)}
                        >
                            ×
                        </button>
                    </div>
                    <p className="commission-apply-confirm-body">
                        确定已完成交付？稿件将进入「待验收」，对方将可进行验收。
                    </p>
                    <div className="commission-apply-confirm-footer">
                        <button
                            type="button"
                            className="commission-apply-confirm-cancel"
                            disabled={isSubmitting}
                            onClick={() => setFinalizeModalOpen(false)}
                        >
                            返回
                        </button>
                        <button
                            type="button"
                            className="commission-apply-confirm-primary"
                            disabled={isSubmitting}
                            onClick={() => void confirmFinalize()}
                        >
                            {isSubmitting ? "处理中..." : "确定完成"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
