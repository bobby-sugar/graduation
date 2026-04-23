import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { resolveApiUrl } from "../config/api";
import { buildArtworkCloseState, buildEditPageEntryState } from "../artwork/artworkDetailNavigation";

interface ManageArtworkItem {
    id: number;
    title: string;
    category?: string | null;
    imageUrl?: string | null;
    createdAt?: string;
}

function categoryLabel(category?: string | null) {
    if (category === "oc") return "OC";
    if (category === "worldview") return "世界观";
    if (category === "emoji") return "表情包";
    return "其他";
}

export default function MyArtworkManagePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { token, isReady } = useAuth();
    const [items, setItems] = useState<ManageArtworkItem[]>([]);
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState<number | null>(null);

    useEffect(() => {
        if (!token) {
            setItems([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError("");
            try {
                const res = await fetch("/api/artworks/mine", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("拉取作品失败");
                const data = await res.json();
                if (cancelled) return;
                const mapped: ManageArtworkItem[] = Array.isArray(data)
                    ? data.map((item: any) => ({
                          id: item.id,
                          title: item.title ?? "未命名作品",
                          category: item.category ?? null,
                          imageUrl: item.imageUrl ?? null,
                          createdAt: item.createdAt,
                      }))
                    : [];
                setItems(mapped);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "加载失败");
                    setItems([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const filtered = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => {
            const title = item.title.toLowerCase();
            const category = String(item.category ?? "").toLowerCase();
            return title.includes(q) || category.includes(q);
        });
    }, [items, keyword]);

    const removeArtwork = async (id: number) => {
        if (!token) return;
        const target = items.find((item) => item.id === id);
        const ok = window.confirm(`确认删除「${target?.title ?? "该作品"}」吗？此操作不可撤销。`);
        if (!ok) return;
        setDeletingId(id);
        try {
            const res = await fetch(`/api/artworks/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.message ?? "删除失败");
            }
            setItems((prev) => prev.filter((item) => item.id !== id));
        } catch (e) {
            alert(e instanceof Error ? e.message : "删除失败，请稍后重试");
        } finally {
            setDeletingId(null);
        }
    };

    if (!isReady) return null;

    if (!token) {
        return (
            <div className="oc-auth-gate-page">
                <div className="oc-auth-gate-page__inner">
                    <AuthPromptPanel
                        title="登录后管理卡片"
                        description="登录后可统一管理你已发布到主页的卡片内容。"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="artwork-manage-page">
            <div className="artwork-manage-head">
                <div>
                    <p className="artwork-manage-eyebrow">作品管理</p>
                    <h1 className="artwork-manage-title">管理我的主页卡片</h1>
                    <p className="artwork-manage-subtitle">在这里统一编辑或删除已发布作品，保持展示内容最新。</p>
                </div>
                <button type="button" className="artwork-manage-back-btn" onClick={() => navigate("/")}>
                    返回主页
                </button>
            </div>

            <div className="artwork-manage-toolbar">
                <input
                    className="artwork-manage-search"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索标题或分类"
                />
                <Link className="artwork-manage-create-btn" to="/studio">
                    新建作品
                </Link>
            </div>

            {loading ? <p className="artwork-manage-status">加载中...</p> : null}
            {!loading && error ? <p className="artwork-manage-error">{error}</p> : null}
            {!loading && !error && filtered.length === 0 ? (
                <p className="artwork-manage-status">暂无匹配结果，试试更换关键词。</p>
            ) : null}

            {!loading && !error && filtered.length > 0 ? (
                <div className="artwork-manage-grid">
                    {filtered.map((item) => {
                        const cover = resolveApiUrl(item.imageUrl);
                        return (
                            <article key={item.id} className="artwork-manage-card">
                                <button
                                    type="button"
                                    className="artwork-manage-card-cover"
                                    onClick={() =>
                                        navigate(`/artwork/${item.id}`, {
                                            state: buildArtworkCloseState(`${location.pathname}${location.search}`),
                                        })
                                    }
                                >
                                    {cover ? <img src={cover} alt={item.title} /> : <span>暂无封面</span>}
                                </button>
                                <div className="artwork-manage-card-body">
                                    <div className="artwork-manage-card-meta">
                                        <span className="artwork-manage-chip">{categoryLabel(item.category)}</span>
                                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleDateString("zh-CN") : "-"}</span>
                                    </div>
                                    <h3 className="artwork-manage-card-title">{item.title}</h3>
                                    <div className="artwork-manage-card-actions">
                                        <button
                                            type="button"
                                            className="artwork-manage-action"
                                            onClick={() =>
                                                navigate(`/my-artworks/${item.id}/edit`, {
                                                    state: buildEditPageEntryState(`${location.pathname}${location.search}`),
                                                })
                                            }
                                        >
                                            编辑
                                        </button>
                                        <button
                                            type="button"
                                            className="artwork-manage-action artwork-manage-action--danger"
                                            onClick={() => void removeArtwork(item.id)}
                                            disabled={deletingId === item.id}
                                        >
                                            {deletingId === item.id ? "删除中..." : "删除"}
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
