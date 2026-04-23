import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../components/Card";
import type { Artwork, CategoryOption } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { API_BASE_URL, resolveApiUrl } from "../config/api";
import { buildArtworkCloseState } from "../artwork/artworkDetailNavigation";
const DEFAULT_BACKGROUND = "/me-default-background.png";

interface CardPosition {
    column: number;
    top: number;
}

type CategoryOptionMe = "favorites" | "my-works" | "oc" | "worldview" | "emoji";

const categoryLabels: Record<CategoryOptionMe, string> = {
    favorites: "收藏",
    "my-works": "我的作品",
    oc: "OC",
    worldview: "世界观",
    emoji: "表情包",
};

interface FollowingUser {
    id: number;
    username: string;
    avatarUrl: string | null;
}

type FollowUser = FollowingUser;

export default function MePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isReady, token } = useAuth();
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [favoritedArtworks, setFavoritedArtworks] = useState<Artwork[]>([]);
    const [followingList, setFollowingList] = useState<FollowingUser[]>([]);
    const [followersList, setFollowersList] = useState<FollowUser[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<CategoryOptionMe>("my-works");
    const [columnCount, setColumnCount] = useState(5);
    const [columnWidth, setColumnWidth] = useState(200);
    const [layoutPaddingLeft, setLayoutPaddingLeft] = useState(12);
    const [cardPositions, setCardPositions] = useState<Map<string, CardPosition>>(new Map());
    const [containerHeight, setContainerHeight] = useState(0);
    const gap = 12;

    const containerRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const filteredArtworks = useMemo(() => {
        if (selectedCategory === "favorites") return favoritedArtworks.filter((a) => (a.category ?? "").toLowerCase() !== "novel");
        if (selectedCategory === "my-works") return artworks.filter((a) => (a.category ?? "").toLowerCase() !== "novel");
        return artworks.filter((a) => a.category === selectedCategory);
    }, [artworks, favoritedArtworks, selectedCategory]);

    useEffect(() => {
        // 用户还没加载好或已经退出时，不要访问 user.xxx，直接清空作品
        if (!user) {
            setArtworks([]);
            return;
        }

        const fetchArtworks = async () => {
            try {
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(`/api/artworks?authorId=${user.id}`, { headers });
                if (!res.ok) return;
                const data = await res.json();
                const mapped: Artwork[] = (data || []).map((item: any) => {
                    const rawUrl: string | null | undefined = item.imageUrl;
                    let imageUrl = "";
                    if (typeof rawUrl === "string" && rawUrl.length > 0) {
                        imageUrl = resolveApiUrl(rawUrl);
                    }
                    if (!imageUrl) imageUrl = resolveApiUrl(`/uploads/oc_${item.id}.jpg`);
                    return {
                        id: item.id,
                        title: item.title,
                        author: item.author?.username ?? user.username,
                        authorAvatar: item.author?.avatarUrl ?? user.avatarUrl ?? null,
                        imageUrl,
                        likes: item.likes ?? 0,
                        views: item.views ?? 0,
                        commentCount: item.commentCount ?? 0,
                        createdAt: item.createdAt ?? new Date().toISOString(),
                        category: (item.category as CategoryOption) ?? undefined,
                        description: item.description ?? null,
                        tags: item.tags ?? null,
                        isLiked: item.isLiked,
                        isCommented: item.isCommented,
                        hasViewed: item.hasViewed,
                    };
                });
                setArtworks(mapped);
            } catch (e) {
                console.error(e);
            }
        };
        fetchArtworks();
    }, [user, token]);

    // 收藏列表：仅在选中「收藏」时拉取
    useEffect(() => {
        if (!user || !token || selectedCategory !== "favorites") {
            if (selectedCategory !== "favorites") return;
            setFavoritedArtworks([]);
            return;
        }
        const fetchFavorites = async () => {
            try {
                const res = await fetch("/api/artworks/favorites", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                const mapped: Artwork[] = (data || []).map((item: any) => {
                    const rawUrl: string | null | undefined = item.imageUrl;
                    let imageUrl = "";
                    if (typeof rawUrl === "string" && rawUrl.length > 0) {
                        imageUrl = resolveApiUrl(rawUrl);
                    }
                    if (!imageUrl) imageUrl = resolveApiUrl(`/uploads/oc_${item.id}.jpg`);
                    return {
                        id: item.id,
                        title: item.title,
                        author: item.author?.username ?? "未知",
                        authorAvatar: item.author?.avatarUrl ?? null,
                        imageUrl,
                        likes: item.likes ?? 0,
                        views: item.views ?? 0,
                        commentCount: item.commentCount ?? 0,
                        createdAt: item.createdAt ?? new Date().toISOString(),
                        category: (item.category as CategoryOption) ?? undefined,
                        description: item.description ?? null,
                        tags: item.tags ?? null,
                        isLiked: item.isLiked,
                        isCommented: item.isCommented,
                        hasViewed: item.hasViewed,
                    };
                });
                setFavoritedArtworks(mapped);
            } catch (e) {
                console.error(e);
            }
        };
        fetchFavorites();
    }, [user, token, selectedCategory]);

    useEffect(() => {
        if (!user || !token) return;
        const fetchFollowing = async () => {
            try {
                const res = await fetch("/api/users/me/following", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                setFollowingList(Array.isArray(data) ? data : []);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
            }
        };
        fetchFollowing();
    }, [user, token]);

    useEffect(() => {
        if (!user || !token) return;
        const fetchFollowers = async () => {
            try {
                const res = await fetch("/api/users/me/followers", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                setFollowersList(Array.isArray(data) ? data : []);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
            }
        };
        fetchFollowers();
    }, [user, token]);

    const updateLayout = useCallback(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const computedStyle = window.getComputedStyle(container);
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 12;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 12;
        // 必须以容器真实布局宽度为准；刷新首帧若用 viewport 与父级 max 的混合值，会得到错误的列数并在后续「跳变」
        const clientW = container.clientWidth;
        if (clientW <= 0) return;
        const innerWidth = Math.max(280, clientW - paddingLeft - paddingRight);
        const g = 12;
        const minCardWidth = 200;
        let cols = Math.floor((innerWidth + g) / (minCardWidth + g));
        cols = Math.max(2, Math.min(cols, 5));
        setColumnCount(cols);
        const cw = (innerWidth - (cols - 1) * g) / cols;
        setColumnWidth(cw);
        setLayoutPaddingLeft(paddingLeft);
    }, []);

    // 同步测量，减少首屏错位；并在 isReady/user 就绪导致容器首次挂载时一定会重跑（仅 [updateLayout] 时首帧无 ref 会永远不再测量）
    useLayoutEffect(() => {
        if (!isReady || !user) return;
        updateLayout();
    }, [isReady, user, updateLayout]);

    useEffect(() => {
        if (!isReady || !user) return;
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => {
            updateLayout();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [isReady, user, updateLayout]);

    useEffect(() => {
        window.addEventListener("resize", updateLayout);
        const onLoad = () => updateLayout();
        window.addEventListener("load", onLoad);
        return () => {
            window.removeEventListener("resize", updateLayout);
            window.removeEventListener("load", onLoad);
        };
    }, [updateLayout]);

    const recalculateMasonry = useCallback(() => {
        if (columnCount === 0) return;
        const cardGap = 12;
        const columnHeights = new Array(columnCount).fill(0);
        const positions = new Map<string, CardPosition>();

        filteredArtworks.forEach((artwork) => {
            const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
            positions.set(String(artwork.id), {
                column: shortestColumn,
                top: columnHeights[shortestColumn],
            });
            const el = cardRefs.current.get(String(artwork.id));
            const h = el ? el.offsetHeight : columnWidth * 1.2;
            columnHeights[shortestColumn] += h + cardGap;
        });

        setCardPositions(positions);
        setContainerHeight(Math.max(...columnHeights, 0));
    }, [columnCount, columnWidth, filteredArtworks]);

    useEffect(() => {
        recalculateMasonry();
    }, [recalculateMasonry]);

    // 刷新后图片与字体异步加载会影响卡片高度，补两次延迟重算避免首屏错位
    useEffect(() => {
        if (filteredArtworks.length === 0) return;
        const raf = window.requestAnimationFrame(() => recalculateMasonry());
        const t1 = window.setTimeout(() => recalculateMasonry(), 120);
        const t2 = window.setTimeout(() => recalculateMasonry(), 420);
        return () => {
            window.cancelAnimationFrame(raf);
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [filteredArtworks, recalculateMasonry]);

    // 图片懒加载后卡片高度会变化，需要实时重算瀑布流位置
    useEffect(() => {
        if (filteredArtworks.length === 0) return;
        const observer = new ResizeObserver(() => {
            recalculateMasonry();
        });

        filteredArtworks.forEach((artwork) => {
            const el = cardRefs.current.get(String(artwork.id));
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [filteredArtworks, recalculateMasonry]);

    const categories: CategoryOptionMe[] = ["favorites", "my-works", "oc", "worldview", "emoji"];

    if (!isReady) {
        return null;
    }

    if (!user) {
        return (
            <div className="oc-auth-gate-page">
                <div className="oc-auth-gate-page__inner">
                    <AuthPromptPanel title="登录后查看个人中心" description="登录后可管理作品、收藏、资料卡与关注关系。" />
                </div>
            </div>
        );
    }

    return (
        <div className="me-page">
            <div className="profile-header">
                <div
                    className="profile-header-background"
                    style={{
                        backgroundImage: `url(${user.profileBackgroundUrl ? resolveApiUrl(user.profileBackgroundUrl) : DEFAULT_BACKGROUND})`,
                        backgroundPosition: `${user.backgroundPositionX ?? 50}% ${user.backgroundPositionY ?? 50}%`,
                    }}
                >
                    <div className="profile-header-overlay"></div>
                </div>

                <div className="profile-header-content">
                    <div className="profile-header-main">
                        <div className="profile-avatar-container">
                            <img
                                src={user.avatarUrl ?? undefined}
                                alt={user.username}
                                className="profile-avatar"
                                style={{ objectPosition: `${user.avatarPositionX ?? 50}% ${user.avatarPositionY ?? 50}%` }}
                            />
                        </div>

                        <h1 className="profile-name">{user.username}</h1>

                        <p className="profile-title">{user.bio || "暂无简介"}</p>

                        <p className="profile-location">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            {user.location || "未设置地区"}
                        </p>

                        <div className="profile-stats">
                            <button
                                type="button"
                                className="profile-stat profile-stat-clickable"
                                onClick={() => navigate("/me/follows?tab=following")}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                                <span className="profile-stat-value">{followingList.length}</span>
                                <span className="profile-stat-label">关注</span>
                            </button>
                            <button
                                type="button"
                                className="profile-stat profile-stat-clickable"
                                onClick={() => navigate("/me/follows?tab=followers")}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="8.5" cy="7" r="4"></circle>
                                    <line x1="20" y1="8" x2="20" y2="14"></line>
                                    <line x1="23" y1="11" x2="17" y2="11"></line>
                                </svg>
                                <span className="profile-stat-value">{followersList.length}</span>
                                <span className="profile-stat-label">粉丝</span>
                            </button>
                            <div className="profile-stat">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                                <span className="profile-stat-value">{artworks.reduce((s, a) => s + (a.likes ?? 0), 0)}</span>
                                <span className="profile-stat-label">点赞</span>
                            </div>
                            <div className="profile-stat">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <span className="profile-stat-value">{artworks.reduce((s, a) => s + (a.views ?? 0), 0)}</span>
                                <span className="profile-stat-label">浏览</span>
                            </div>
                        </div>

                        <div className="profile-actions">
                            <button
                                type="button"
                                className="profile-action-btn profile-action-btn-primary"
                                onClick={() => navigate("/profile/edit?from=/me")}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden
                                >
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                编辑个人资料
                            </button>
                        </div>
                    </div>
                </div>

                <div className="profile-filter-bar">
                    <div className="profile-filter-container">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                className={`profile-filter-btn ${selectedCategory === cat ? "active" : ""}`}
                                onClick={() => setSelectedCategory(cat)}
                            >
                                {categoryLabels[cat]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div
                ref={containerRef}
                className="me-masonry-container"
                style={{ height: containerHeight > 0 ? `${containerHeight}px` : "auto", position: "relative" }}
            >
                {filteredArtworks.map((artwork) => {
                    const position = cardPositions.get(String(artwork.id));
                    return (
                        <div
                            key={artwork.id}
                            ref={(el) => {
                                if (el) cardRefs.current.set(String(artwork.id), el);
                                else cardRefs.current.delete(String(artwork.id));
                            }}
                            className="me-masonry-item"
                            style={{
                                width: `${columnWidth}px`,
                                left: position
                                    ? `${layoutPaddingLeft + position.column * (columnWidth + gap)}px`
                                    : `${layoutPaddingLeft}px`,
                                top: position ? `${position.top}px` : 0,
                                opacity: position ? 1 : 0,
                                transition: "opacity 0.3s ease",
                                position: "absolute",
                            }}
                        >
                            <Card
                                artwork={artwork}
                                apiBaseUrl={API_BASE_URL}
                                onClick={() =>
                                    navigate(`/artwork/${artwork.id}`, {
                                        state: buildArtworkCloseState(`${location.pathname}${location.search}`),
                                    })
                                }
                            />
                        </div>
                    );
                })}
            </div>

            {filteredArtworks.length === 0 && (
                <div className="me-empty-gallery" role="status">
                    <p className="me-empty-gallery-title">这里还没有内容</p>
                    <p className="me-empty-gallery-hint">切换上方分类查看，或前往工作站发布作品</p>
                </div>
            )}
        </div>
    );
}
