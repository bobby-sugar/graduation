import { useCallback, useEffect, useState } from "react";
import { resolveApiUrl } from "../config/api";

export interface PublisherDeliveryItem {
    messageId: number;
    submittedAt: string;
    files: Array<{
        name: string;
        url: string;
        relativePath: string | null;
    }>;
}

export interface CommissionPublisherDeliveryListProps {
    commissionId: number;
    token: string | null;
    /** 为 false 时不请求、不展示 */
    enabled: boolean;
    /** 为 false 时仅展示文件链接，不显示「移除」（如已发起待验收） */
    allowRemove?: boolean;
    variant: "detail" | "application";
    onChanged?: () => void;
}

function fileKey(messageId: number, url: string) {
    return `${messageId}:${url}`;
}

/**
 * 出稿方：查看各批次已提交的交付文件；进行中 / 修改中可从会话记录移除单个文件。
 */
export default function CommissionPublisherDeliveryList({
    commissionId,
    token,
    enabled,
    allowRemove = true,
    variant,
    onChanged,
}: CommissionPublisherDeliveryListProps) {
    const [items, setItems] = useState<PublisherDeliveryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [removingKey, setRemovingKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token || !enabled) {
            setItems([]);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/commissions/${commissionId}/publisher-delivery-items`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setItems([]);
                return;
            }
            const data = await res.json();
            if (!Array.isArray(data)) {
                setItems([]);
                return;
            }
            const normalized = data
                .filter(
                    (b: unknown) =>
                        b != null &&
                        typeof b === "object" &&
                        typeof (b as { messageId?: unknown }).messageId === "number" &&
                        Array.isArray((b as { files?: unknown }).files),
                )
                .map((b: { messageId: number; submittedAt: unknown; files: unknown[] }) => ({
                    messageId: b.messageId,
                    submittedAt: (() => {
                        const s = b.submittedAt;
                        if (typeof s === "string" && s.length > 0) return s;
                        const d = new Date(s as string | number | Date);
                        return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
                    })(),
                    files: (b.files as unknown[])
                        .filter(
                            (f): f is { name: string; url: string; relativePath: string | null } =>
                                f != null &&
                                typeof f === "object" &&
                                typeof (f as { url?: unknown }).url === "string" &&
                                String((f as { url: string }).url).length > 0,
                        )
                        .map((f) => ({
                            name: typeof (f as { name?: unknown }).name === "string" ? (f as { name: string }).name : "文件",
                            url: (f as { url: string }).url,
                            relativePath:
                                (f as { relativePath?: string | null }).relativePath != null
                                    ? String((f as { relativePath: string | null }).relativePath)
                                    : null,
                        })),
                }))
                .filter((b) => b.files.length > 0);
            setItems(normalized);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [commissionId, token, enabled]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!enabled) return;
        const onRefresh = (ev: Event) => {
            const d = (ev as CustomEvent<{ commissionId?: number }>).detail?.commissionId;
            if (d != null && Number(d) !== commissionId) return;
            void load();
        };
        window.addEventListener("oc-commission-updated", onRefresh);
        return () => window.removeEventListener("oc-commission-updated", onRefresh);
    }, [enabled, commissionId, load]);

    const handleRemove = async (messageId: number, url: string) => {
        if (!allowRemove || !token) return;
        const ok = window.confirm(
            "确定移除此文件？将从双方会话中的该条交付记录里删除，对方刷新后也会看到更新。",
        );
        if (!ok) return;
        const key = fileKey(messageId, url);
        setRemovingKey(key);
        try {
            const res = await fetch(`/api/commissions/${commissionId}/publisher-delivery-file/remove`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ messageId, url }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail = err?.message
                    ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
                    : "删除失败";
                throw new Error(detail);
            }
            await load();
            onChanged?.();
            window.dispatchEvent(
                new CustomEvent("oc-commission-updated", { detail: { commissionId } }),
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : "删除失败，请稍后重试";
            alert(msg);
        } finally {
            setRemovingKey(null);
        }
    };

    if (!enabled) return null;

    const wrapClass =
        variant === "detail"
            ? "commission-publisher-delivery-list commission-publisher-delivery-list--detail"
            : "commission-publisher-delivery-list commission-publisher-delivery-list--application";

    if (loading && items.length === 0) {
        return (
            <div className={wrapClass} role="status">
                <p className="commission-publisher-delivery-list-loading">加载已提交文件…</p>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className={wrapClass} role="status">
                <div className="commission-publisher-delivery-list-title">我已提交的文件</div>
                <p className="commission-publisher-delivery-list-empty">暂无已同步的交付文件，可先使用「提交」上传。</p>
            </div>
        );
    }

    return (
        <div className={wrapClass}>
            <div className="commission-publisher-delivery-list-title">我已提交的文件</div>
            <ul className="commission-publisher-delivery-batches">
                {items.map((batch) => (
                    <li key={batch.messageId} className="commission-publisher-delivery-batch">
                        <div className="commission-publisher-delivery-batch-meta">
                            提交时间：
                            {new Date(batch.submittedAt).toLocaleString("zh-CN", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </div>
                        <ul className="commission-publisher-delivery-files">
                            {batch.files.map((f) => {
                                const key = fileKey(batch.messageId, f.url);
                                const busy = removingKey === key;
                                const href = resolveApiUrl(f.url);
                                return (
                                    <li key={key} className="commission-publisher-delivery-file-row">
                                        <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="commission-publisher-delivery-file-link"
                                        >
                                            {f.name}
                                        </a>
                                        {allowRemove ? (
                                            <button
                                                type="button"
                                                className="commission-publisher-delivery-file-remove"
                                                disabled={busy}
                                                onClick={() => void handleRemove(batch.messageId, f.url)}
                                            >
                                                {busy ? "移除中…" : "移除"}
                                            </button>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </li>
                ))}
            </ul>
        </div>
    );
}
