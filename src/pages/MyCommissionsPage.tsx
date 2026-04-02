import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

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

const API_BASE_URL = "http://localhost:3000";

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
    if (url.startsWith("http")) return url;
    return `${API_BASE_URL}${url}`;
}

function statusClassName(status: CommissionStatus) {
    if (status === "wip" || status === "revising") return "active";
    if (status === "pending" || status === "payment-pending" || status === "review-pending") return "pending";
    if (status === "done") return "done";
    return "default";
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

export default function MyCommissionsPage() {
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const [activeTab, setActiveTab] = useState<MyTab>("published");
    const [publishedScope, setPublishedScope] = useState<PublishedScope>("all");
    const [publishedList, setPublishedList] = useState<MyCommission[]>([]);
    const [acceptedList, setAcceptedList] = useState<MyCommission[]>([]);
    const [loading, setLoading] = useState(true);
    const [manageMode, setManageMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [batchSubmitting, setBatchSubmitting] = useState(false);

    const fetchData = useCallback(async () => {
        if (!user || !token) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [publishedCommissionRes, publishedOfferRes, acceptedCommissionRes, acceptedOfferRes] = await Promise.all([
                fetch(`/api/commissions?clientId=${user.id}&direction=commission`, { headers }),
                fetch(`/api/commissions?artistId=${user.id}&direction=offer`, { headers }),
                fetch(`/api/commissions?artistId=${user.id}&direction=commission`, { headers }),
                fetch(`/api/commissions?clientId=${user.id}&direction=offer`, { headers }),
            ]);
            const publishedCommissionData = publishedCommissionRes.ok ? await publishedCommissionRes.json() : [];
            const publishedOfferData = publishedOfferRes.ok ? await publishedOfferRes.json() : [];
            const acceptedCommissionData = acceptedCommissionRes.ok ? await acceptedCommissionRes.json() : [];
            const acceptedOfferData = acceptedOfferRes.ok ? await acceptedOfferRes.json() : [];

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
                    counterpartName: type === "published"
                        ? (item.direction === "offer"
                            ? (item.client?.username ?? "待匹配甲方")
                            : (item.artist?.username ?? "待匹配画师"))
                        : (item.direction === "offer"
                            ? (item.artist?.username ?? "待匹配乙方")
                            : (item.client?.username ?? "待匹配甲方")),
                    counterpartAvatar: type === "published"
                        ? (item.direction === "offer"
                            ? (item.client?.avatarUrl ?? null)
                            : (item.artist?.avatarUrl ?? null))
                        : (item.direction === "offer"
                            ? (item.artist?.avatarUrl ?? null)
                            : (item.client?.avatarUrl ?? null)),
                }));

            const publishedMerged = [
                ...mapToMyItem(publishedCommissionData, "published"),
                ...mapToMyItem(publishedOfferData, "published"),
            ].sort(compareMyCommissions);

            setPublishedList(publishedMerged);
            const acceptedMerged = [
                ...mapToMyItem(acceptedCommissionData, "accepted"),
                ...mapToMyItem(acceptedOfferData, "accepted"),
            ].sort(compareMyCommissions);
            setAcceptedList(acceptedMerged);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            setPublishedList([]);
            setAcceptedList([]);
        } finally {
            setLoading(false);
        }
    }, [token, user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!user || !token) return;
        const onCommissionUpdated = () => {
            void fetchData();
        };
        window.addEventListener("oc-commission-updated", onCommissionUpdated);
        const timer = window.setInterval(() => {
            fetchData();
        }, 60000);
        const handleFocus = () => {
            fetchData();
        };
        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                fetchData();
            }
        };
        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisible);
        return () => {
            window.removeEventListener("oc-commission-updated", onCommissionUpdated);
            window.clearInterval(timer);
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener("visibilitychange", handleVisible);
        };
    }, [fetchData, token, user]);

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
        try {
            const headers = { Authorization: `Bearer ${token}` };
            await Promise.all(
                selectedIds.map(async (id) => {
                    const res = await fetch(`/api/commissions/${id}`, {
                        method: "DELETE",
                        headers,
                    });
                    if (!res.ok) throw new Error("删除失败");
                }),
            );
            setSelectedIds([]);
            await fetchData();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            alert("批量删除失败，请稍后重试");
        } finally {
            setBatchSubmitting(false);
        }
    };

    if (!user) {
        return (
            <div className="my-commissions-page">
                <button type="button" className="my-commissions-back" onClick={handleBack}>
                    返回
                </button>
                <div className="my-commissions-login">
                    <p>登录后查看你的稿件进度与阶段</p>
                    <Link to="/login" className="my-commissions-login-btn">去登录</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="my-commissions-page">
            <button type="button" className="my-commissions-back" onClick={handleBack}>
                返回
            </button>
            <div className="my-commissions-header">
                <div>
                    <h1>我的稿件</h1>
                </div>
                <div className="my-commissions-header-actions">
                    <button
                        type="button"
                        className="my-commissions-create-btn"
                        onClick={handleToggleManageMode}
                    >
                        {manageMode ? "完成管理" : "批量管理"}
                    </button>
                    <button
                        type="button"
                        className="my-commissions-create-btn"
                        onClick={() => navigate("/commissions/new")}
                    >
                        发布稿件
                    </button>
                </div>
            </div>

            <div className="my-commissions-overview">
                <div className="my-commissions-stat">
                    <span>我发布的</span>
                    <strong>{publishedList.length}</strong>
                </div>
                <div className="my-commissions-stat">
                    <span>我承接的</span>
                    <strong>{acceptedList.length}</strong>
                </div>
                <div className="my-commissions-stat">
                    <span>进行中</span>
                    <strong>{activeCount}</strong>
                </div>
                <div className="my-commissions-stat">
                    <span>已完成</span>
                    <strong>{completedCount}</strong>
                </div>
            </div>

            <div className="my-commissions-tabs">
                <button
                    type="button"
                    className={`my-commissions-tab ${activeTab === "published" ? "active" : ""}`}
                    onClick={() => {
                        setActiveTab("published");
                    }}
                >
                    我发布的
                </button>
                <button
                    type="button"
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

            {loading ? (
                <div className="my-commissions-empty">加载中…</div>
            ) : currentList.length === 0 ? (
                <div className="my-commissions-empty">
                    {activeTab === "published"
                        ? (publishedScope === "offer"
                            ? "你还没有发布接稿"
                            : publishedScope === "commission"
                                ? "你还没有发布约稿"
                                : "你还没有发布稿件")
                        : "你还没有承接稿件"}
                </div>
            ) : (
                <div className="my-commissions-grid">
                    {currentList.map((item) => (
                        <article
                            key={item.id}
                            className={`my-commission-card ${manageMode ? "selectable" : ""} ${selectedIds.includes(item.id) ? "selected" : ""}`}
                            onClick={() => {
                                if (manageMode) {
                                    toggleSelectCard(item.id);
                                    return;
                                }
                                navigate(`/commissions/${item.id}`);
                            }}
                        >
                            {manageMode && (
                                <label
                                    className="my-commission-select-box"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(item.id)}
                                        disabled={item.status !== "new"}
                                        onChange={() => toggleSelectCard(item.id)}
                                    />
                                </label>
                            )}
                            <div className="my-commission-cover-wrap">
                                {item.previewImageUrl ? (
                                    <img
                                        src={normalizeImage(item.previewImageUrl)}
                                        alt={item.title}
                                        className="my-commission-cover"
                                    />
                                ) : (
                                    <div className="my-commission-cover-placeholder">无封面</div>
                                )}
                                <span className={`my-commission-status ${statusClassName(item.status)}`}>
                                    {statusLabelMap[item.status]}
                                </span>
                            </div>
                            <div className="my-commission-body">
                                <h3 className="my-commission-title">{item.title}</h3>
                                <p className="my-commission-meta">
                                    {activeTab === "published" ? "承接方" : "发起方"}：{item.counterpartName}
                                </p>
                                <p className="my-commission-meta">
                                    金额：￥{item.price}
                                </p>
                                <div className="my-commission-footer">
                                    <span className="my-commission-category">{item.category ?? "未分类"}</span>
                                    <span className="my-commission-link">查看详情</span>
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
                    onClick={runBatchDelete}
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
