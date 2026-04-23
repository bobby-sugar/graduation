import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { resolveApiUrl } from "../config/api";

type CommissionStatus = "new" | "pending" | "payment-pending" | "wip" | "review-pending" | "revising" | "done";
type MyTab = "published" | "accepted";
type PublishedScope = "all" | "offer" | "commission";

interface MyCommission {
    id: number;
    title: string;
    description?: string | null;
    price: number;
    category?: string | null;
    direction?: "commission" | "offer";
    status: CommissionStatus;
    submittedAt?: string;
    updatedAt?: string;
    previewImageUrl?: string | null;
    counterpartName: string;
    counterpartAvatar?: string | null;
}

const statusLabelMap: Record<CommissionStatus, string> = {
    new: "新建",
    pending: "待确认",
    "payment-pending": "待付款",
    wip: "进行中",
    "review-pending": "待验收",
    revising: "修改中",
    done: "已完成",
};

function normalizeImage(url?: string | null) {
    if (!url) return "";
    return resolveApiUrl(url);
}

function statusClassName(status: CommissionStatus) {
    if (status === "wip" || status === "revising") return "active";
    if (status === "pending" || status === "payment-pending" || status === "review-pending") return "pending";
    if (status === "done") return "done";
    return "default";
}

function formatPriceYuan(n: number) {
    return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/** 已进入流程的稿件按状态排序（数字越小越靠前）；「新建」稿件单独按发布时间排序 */
const STATUS_SORT_ORDER: Record<Exclude<CommissionStatus, "new">, number> = {
    pending: 0,
    "payment-pending": 1,
    wip: 2,
    "review-pending": 3,
    revising: 4,
    done: 5,
};

function timeMs(iso?: string) {
    const t = iso ? new Date(iso).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
}

function compareMyCommissions(a: MyCommission, b: MyCommission): number {
    const aNew = a.status === "new";
    const bNew = b.status === "new";
    if (aNew !== bNew) {
        return aNew ? 1 : -1;
    }
    if (aNew && bNew) {
        return timeMs(b.submittedAt) - timeMs(a.submittedAt);
    }
    const orderA = STATUS_SORT_ORDER[a.status as Exclude<CommissionStatus, "new">] ?? 99;
    const orderB = STATUS_SORT_ORDER[b.status as Exclude<CommissionStatus, "new">] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const u = timeMs(b.updatedAt) - timeMs(a.updatedAt);
    if (u !== 0) return u;
    return timeMs(b.submittedAt) - timeMs(a.submittedAt);
}

const FOCUS_REFRESH_MIN_MS = 8000;

export default function MyCommissionsPage() {
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const [activeTab, setActiveTab] = useState<MyTab>("published");
    const [publishedScope, setPublishedScope] = useState<PublishedScope>("all");
    const [publishedList, setPublishedList] = useState<MyCommission[]>([]);
    const [acceptedList, setAcceptedList] = useState<MyCommission[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [manageMode, setManageMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [batchSubmitting, setBatchSubmitting] = useState(false);
    const fetchSeqRef = useRef(0);
    const lastBgFetchRef = useRef(0);

    const fetchData = useCallback(async (options?: { silent?: boolean }) => {
        if (!user || !token) {
            setLoading(false);
            return;
        }
        const seq = ++fetchSeqRef.current;
        const silent = options?.silent === true;
        if (!silent) {
            setLoading(true);
        }
        setLoadError(null);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [publishedCommissionRes, publishedOfferRes, acceptedCommissionRes, acceptedOfferRes] = await Promise.all([
                fetch(`/api/commissions?clientId=${user.id}&direction=commission`, { headers }),
                fetch(`/api/commissions?artistId=${user.id}&direction=offer`, { headers }),
                fetch(`/api/commissions?artistId=${user.id}&direction=commission`, { headers }),
                fetch(`/api/commissions?clientId=${user.id}&direction=offer`, { headers }),
            ]);
            if (seq !== fetchSeqRef.current) return;

            const publishedCommissionData = publishedCommissionRes.ok ? await publishedCommissionRes.json() : [];
            const publishedOfferData = publishedOfferRes.ok ? await publishedOfferRes.json() : [];
            const acceptedCommissionData = acceptedCommissionRes.ok ? await acceptedCommissionRes.json() : [];
            const acceptedOfferData = acceptedOfferRes.ok ? await acceptedOfferRes.json() : [];

            if (seq !== fetchSeqRef.current) return;

            const mapToMyItem = (raw: any[], type: MyTab): MyCommission[] =>
                (raw || []).map((item: any) => ({
                    id: item.id,
                    title: item.title ?? "未命名稿件",
                    description: item.description,
                    price: Number(item.price ?? 0),
                    category: item.category ?? null,
                    direction: item.direction ?? "commission",
                    status: (item.status ?? "new") as CommissionStatus,
                    submittedAt: item.submittedAt,
                    updatedAt: item.updatedAt,
                    previewImageUrl: item.previewImageUrl ?? null,
                    counterpartName:
                        type === "published"
                            ? item.direction === "offer"
                                ? (item.client?.username ?? "待匹配甲方")
                                : (item.artist?.username ?? "待匹配画师")
                            : item.direction === "offer"
                              ? (item.artist?.username ?? "待匹配乙方")
                              : (item.client?.username ?? "待匹配甲方"),
                    counterpartAvatar:
                        type === "published"
                            ? item.direction === "offer"
                                ? (item.client?.avatarUrl ?? null)
                                : (item.artist?.avatarUrl ?? null)
                            : item.direction === "offer"
                              ? (item.artist?.avatarUrl ?? null)
                              : (item.client?.avatarUrl ?? null),
                }));

            const publishedMerged = [
                ...mapToMyItem(publishedCommissionData, "published"),
                ...mapToMyItem(publishedOfferData, "published"),
            ].sort(compareMyCommissions);

            const acceptedMerged = [
                ...mapToMyItem(acceptedCommissionData, "accepted"),
                ...mapToMyItem(acceptedOfferData, "accepted"),
            ].sort(compareMyCommissions);

            if (seq !== fetchSeqRef.current) return;

            setPublishedList(publishedMerged);
            setAcceptedList(acceptedMerged);
        } catch (e) {
            if (seq !== fetchSeqRef.current) return;
            // eslint-disable-next-line no-console
            console.error(e);
            setLoadError("加载失败，请检查网络后重试");
            setPublishedList([]);
            setAcceptedList([]);
        } finally {
            if (seq === fetchSeqRef.current && !silent) {
                setLoading(false);
            }
        }
    }, [token, user]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!user || !token) return;
        const onCommissionUpdated = () => {
            void fetchData({ silent: true });
        };
        window.addEventListener("oc-commission-updated", onCommissionUpdated);
        const timer = window.setInterval(() => {
            void fetchData({ silent: true });
        }, 60000);

        const maybeRefresh = () => {
            const now = Date.now();
            if (now - lastBgFetchRef.current < FOCUS_REFRESH_MIN_MS) return;
            lastBgFetchRef.current = now;
            void fetchData({ silent: true });
        };

        window.addEventListener("focus", maybeRefresh);
        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                maybeRefresh();
            }
        };
        document.addEventListener("visibilitychange", handleVisible);
        return () => {
            window.removeEventListener("oc-commission-updated", onCommissionUpdated);
            window.clearInterval(timer);
            window.removeEventListener("focus", maybeRefresh);
            document.removeEventListener("visibilitychange", handleVisible);
        };
    }, [fetchData, token, user]);

    /** 切换主 Tab / 发布子筛选时退出批量管理，避免选中和列表不一致 */
    useEffect(() => {
        setManageMode(false);
        setSelectedIds([]);
    }, [activeTab, publishedScope]);

    const currentList = useMemo(() => {
        if (activeTab !== "published") return acceptedList;
        if (publishedScope === "all") return publishedList;
        return publishedList.filter((item) => item.direction === publishedScope);
    }, [activeTab, acceptedList, publishedScope, publishedList]);

    const activeCount = useMemo(
        () =>
            currentList.filter(
                (item) =>
                    item.status === "payment-pending" ||
                    item.status === "wip" ||
                    item.status === "review-pending" ||
                    item.status === "revising",
            ).length,
        [currentList],
    );
    const completedCount = useMemo(
        () =>
            publishedList.filter((item) => item.status === "done").length +
            acceptedList.filter((item) => item.status === "done").length,
        [publishedList, acceptedList],
    );
    const selectedCount = selectedIds.length;

    const deletableNewIds = useMemo(
        () => currentList.filter((item) => item.status === "new").map((item) => item.id),
        [currentList],
    );

    useEffect(() => {
        setSelectedIds((prev) => prev.filter((id) => currentList.some((item) => item.id === id && item.status === "new")));
    }, [currentList]);

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate("/commissions", { replace: true });
    };

    const toggleSelectCard = (id: number) => {
        const target = currentList.find((item) => item.id === id);
        if (!target || target.status !== "new") return;
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const selectAllDeletable = () => {
        setSelectedIds(deletableNewIds);
    };

    const clearSelection = () => {
        setSelectedIds([]);
    };

    const handleToggleManageMode = () => {
        setManageMode((prev) => {
            if (prev) setSelectedIds([]);
            return !prev;
        });
    };

    const runBatchDelete = async () => {
        if (!token || selectedIds.length === 0) return;
        const ok = window.confirm(`确认删除已选中的 ${selectedIds.length} 条稿件吗？该操作不可恢复。`);
        if (!ok) return;
        setBatchSubmitting(true);
        const headers = { Authorization: `Bearer ${token}` };
        const ids = [...selectedIds];
        const failed: number[] = [];
        let okCount = 0;
        try {
            for (const id of ids) {
                const res = await fetch(`/api/commissions/${id}`, {
                    method: "DELETE",
                    headers,
                });
                if (res.ok) {
                    okCount += 1;
                } else {
                    failed.push(id);
                }
            }
            setSelectedIds(failed);
            await fetchData();
            if (failed.length > 0 && okCount > 0) {
                window.alert(`已删除 ${okCount} 条；${failed.length} 条未能删除（可能状态已变更或无权操作）。`);
            } else if (failed.length > 0) {
                window.alert("删除失败，请稍后重试或刷新页面。");
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            window.alert("批量删除时网络异常，请稍后重试");
        } finally {
            setBatchSubmitting(false);
        }
    };

    const openDetail = (id: number) => {
        navigate(`/commissions/${id}`);
    };

    if (!user) {
        return (
            <div className="oc-auth-gate-page">
                <div className="oc-auth-gate-page__inner">
                    <AuthPromptPanel
                        title="登录后查看我的稿件"
                        description="登录后可查看发布与承接的约稿、接稿进度，并管理交付与验收。"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="my-commissions-page">
            <button type="button" className="my-commissions-back" onClick={handleBack}>
                返回
            </button>
            <header className="my-commissions-header">
                <div className="my-commissions-header-text">
                    <h1>我的稿件</h1>
                    <p className="my-commissions-subtitle">查看发布与承接的约稿、接稿及进度</p>
                </div>
                <div className="my-commissions-header-actions">
                    <button
                        type="button"
                        className="my-commissions-create-btn my-commissions-manage-btn"
                        onClick={handleToggleManageMode}
                    >
                        {manageMode ? "完成管理" : "批量管理"}
                    </button>
                    <button type="button" className="my-commissions-create-btn my-commissions-publish-btn" onClick={() => navigate("/commissions/new")}>
                        发布稿件
                    </button>
                </div>
            </header>

            <div className="my-commissions-overview">
                <div className="my-commissions-stat my-commissions-stat--pub">
                    <span>我发布的</span>
                    <strong>{publishedList.length}</strong>
                </div>
                <div className="my-commissions-stat my-commissions-stat--acc">
                    <span>我承接的</span>
                    <strong>{acceptedList.length}</strong>
                </div>
                <div className="my-commissions-stat my-commissions-stat--active">
                    <span>进行中</span>
                    <strong>{activeCount}</strong>
                </div>
                <div className="my-commissions-stat my-commissions-stat--done">
                    <span>已完成</span>
                    <strong>{completedCount}</strong>
                </div>
            </div>

            <div className="my-commissions-tabs" role="tablist" aria-label="稿件类型">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "published"}
                    className={`my-commissions-tab ${activeTab === "published" ? "active" : ""}`}
                    onClick={() => setActiveTab("published")}
                >
                    我发布的
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "accepted"}
                    className={`my-commissions-tab ${activeTab === "accepted" ? "active" : ""}`}
                    onClick={() => setActiveTab("accepted")}
                >
                    我承接的
                </button>
            </div>

            {activeTab === "published" && (
                <div className="my-commissions-subtabs">
                    <button
                        type="button"
                        className={`my-commissions-subtab ${publishedScope === "all" ? "active" : ""}`}
                        onClick={() => setPublishedScope("all")}
                    >
                        全部发布
                    </button>
                    <button
                        type="button"
                        className={`my-commissions-subtab ${publishedScope === "offer" ? "active" : ""}`}
                        onClick={() => setPublishedScope("offer")}
                    >
                        发布的接稿
                    </button>
                    <button
                        type="button"
                        className={`my-commissions-subtab ${publishedScope === "commission" ? "active" : ""}`}
                        onClick={() => setPublishedScope("commission")}
                    >
                        发布的约稿
                    </button>
                </div>
            )}

            {manageMode && !loading && currentList.length > 0 && (
                <div className="my-commissions-manage-bar">
                    <p className="my-commissions-manage-hint">
                        仅「新建」可删除；已选 <strong>{selectedCount}</strong> / {deletableNewIds.length} 条可删
                    </p>
                    <div className="my-commissions-manage-actions">
                        <button type="button" className="my-commissions-manage-action" onClick={selectAllDeletable} disabled={deletableNewIds.length === 0}>
                            全选可删
                        </button>
                        <button type="button" className="my-commissions-manage-action" onClick={clearSelection} disabled={selectedCount === 0}>
                            取消全选
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="my-commissions-skeleton-grid" aria-busy="true" aria-label="加载中">
                    {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="my-commissions-skeleton-card" />
                    ))}
                </div>
            ) : loadError ? (
                <div className="my-commissions-error">
                    <p>{loadError}</p>
                    <button type="button" className="my-commissions-retry-btn" onClick={() => void fetchData()}>
                        重新加载
                    </button>
                </div>
            ) : currentList.length === 0 ? (
                <div className="my-commissions-empty my-commissions-empty--stack">
                    <p className="my-commissions-empty-text">
                        {activeTab === "published"
                            ? publishedScope === "offer"
                                ? "你还没有发布接稿"
                                : publishedScope === "commission"
                                  ? "你还没有发布约稿"
                                  : "你还没有发布稿件"
                            : "你还没有承接稿件"}
                    </p>
                    {activeTab === "published" ? (
                        <button type="button" className="my-commissions-empty-btn" onClick={() => navigate("/commissions/new")}>
                            发布稿件
                        </button>
                    ) : (
                        <button type="button" className="my-commissions-empty-btn my-commissions-empty-btn--secondary" onClick={() => navigate("/commissions")}>
                            去稿件广场
                        </button>
                    )}
                </div>
            ) : (
                <div className="my-commissions-grid">
                    {currentList.map((item) => (
                        <article
                            key={item.id}
                            className={`my-commission-card ${manageMode ? "selectable" : ""} ${selectedIds.includes(item.id) ? "selected" : ""}`}
                            tabIndex={manageMode || batchSubmitting ? -1 : 0}
                            role="button"
                            aria-label={`${item.title}，${statusLabelMap[item.status]}`}
                            onClick={() => {
                                if (batchSubmitting) return;
                                if (manageMode) {
                                    toggleSelectCard(item.id);
                                    return;
                                }
                                openDetail(item.id);
                            }}
                            onKeyDown={(e) => {
                                if (manageMode || batchSubmitting) return;
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openDetail(item.id);
                                }
                            }}
                        >
                            {manageMode && (
                                <label className="my-commission-select-box" onClick={(ev) => ev.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(item.id)}
                                        disabled={item.status !== "new"}
                                        onChange={() => toggleSelectCard(item.id)}
                                        aria-label={item.status === "new" ? "选择以删除" : "非新建不可删除"}
                                    />
                                </label>
                            )}
                            <div className="my-commission-cover-wrap">
                                {item.previewImageUrl ? (
                                    <img src={normalizeImage(item.previewImageUrl)} alt="" className="my-commission-cover" />
                                ) : (
                                    <div className="my-commission-cover-placeholder">无封面</div>
                                )}
                                <span className={`my-commission-status ${statusClassName(item.status)}`}>{statusLabelMap[item.status]}</span>
                            </div>
                            <div className="my-commission-body">
                                <h3 className="my-commission-title">{item.title}</h3>
                                <p className="my-commission-meta">
                                    {activeTab === "published" ? "承接方" : "发起方"}：{item.counterpartName}
                                </p>
                                <p className="my-commission-meta my-commission-meta--price">￥{formatPriceYuan(item.price)}</p>
                                <div className="my-commission-footer">
                                    <div className="my-commission-footer-left">
                                        <span
                                            className={`my-commission-dir ${item.direction === "offer" ? "my-commission-dir--offer" : "my-commission-dir--commission"}`}
                                        >
                                            {item.direction === "offer" ? "接稿" : "约稿"}
                                        </span>
                                        <span className="my-commission-category">{item.category ?? "未分类"}</span>
                                    </div>
                                    <span className="my-commission-link">{manageMode ? (item.status === "new" ? "点选删除" : "—") : "查看详情"}</span>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
            {manageMode && (
                <button
                    type="button"
                    className="my-commissions-delete-fab"
                    onClick={() => void runBatchDelete()}
                    disabled={batchSubmitting || selectedCount === 0}
                    aria-label="批量删除已选稿件"
                    title={selectedCount === 0 ? "请选择至少一个新建稿件" : `删除已选 ${selectedCount} 条`}
                >
                    🗑
                </button>
            )}
        </div>
    );
}
