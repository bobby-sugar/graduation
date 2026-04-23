import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import Card from "../components/Card";
import type { Artwork, CategoryOption } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useAuthPrompt } from "../contexts/AuthPromptContext";
import { API_BASE_URL, resolveApiUrl } from "../config/api";
import { buildArtworkCloseState } from "../artwork/artworkDetailNavigation";

const DEFAULT_BANNER = "/me-default-background.png";

interface ProfileUser {
    id: number;
    username: string;
    avatarUrl: string | null;
    avatarPositionX?: number;
    avatarPositionY?: number;
    profileBackgroundUrl?: string | null;
    backgroundPositionX?: number;
    backgroundPositionY?: number;
    bio: string | null;
    location: string | null;
}

type TabKey = "portfolio" | "likes" | "commissions";
interface ProfileCommissionCard {
    id: number;
    title: string;
    price: number;
    status: "new" | "pending" | string;
    category?: string | null;
    direction?: "commission" | "offer" | string;
    submittedAt?: string;
    previewImageUrl?: string | null;
}

interface CardPosition {
    column: number;
    top: number;
}

export default function UserProfilePage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user: currentUser, token } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [likedArtworks, setLikedArtworks] = useState<Artwork[]>([]);
    const [commissions, setCommissions] = useState<ProfileCommissionCard[]>([]);
    const [tab, setTab] = useState<TabKey>("portfolio");
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [columnCount, setColumnCount] = useState(4);
    const [masonryInnerWidth, setMasonryInnerWidth] = useState(0);
    const [cardPositions, setCardPositions] = useState<Map<number, CardPosition>>(new Map());
    const [containerHeight, setContainerHeight] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const profileUserId = id ? parseInt(id, 10) : NaN;
    const isOwnProfile = Number.isInteger(profileUserId) && currentUser?.id === profileUserId;

    useEffect(() => {
        if (!token || !Number.isInteger(profileUserId) || isOwnProfile) return;
        const check = async () => {
            try {
                const res = await fetch("/api/users/me/following", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const list: { id: number }[] = await res.json();
                setIsFollowing(list.some((u) => u.id === profileUserId));
            } catch {
                // ignore
            }
        };
        check();
    }, [token, profileUserId, isOwnProfile]);

    const handleFollowClick = useCallback(async () => {
        if (!Number.isInteger(profileUserId)) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后关注用户",
                description: "登录后可关注喜欢的作者，并在首页「关注」流中查看更新。",
            });
            return;
        }
        try {
            if (isFollowing) {
                await fetch(`/api/users/${profileUserId}/follow`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
                setIsFollowing(false);
            } else {
                await fetch(`/api/users/${profileUserId}/follow`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
                setIsFollowing(true);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }, [profileUserId, token, isFollowing, openAuthPrompt]);

    useEffect(() => {
        if (!id || !Number.isInteger(profileUserId)) {
            setLoading(false);
            return;
        }
        const fetchUser = async () => {
            try {
                const res = await fetch(`/api/users/${id}`);
                if (!res.ok) {
                    setProfileUser(null);
                    return;
                }
                const data = await res.json();
                setProfileUser(data);
            } catch (e) {
                setProfileUser(null);
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, [id, profileUserId]);

    useEffect(() => {
        if (!profileUserId || !Number.isInteger(profileUserId)) return;
        const fetchArtworks = async () => {
            try {
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(`/api/artworks?authorId=${profileUserId}`, { headers });
                if (!res.ok) return;
                const data = await res.json();
                const mapped: Artwork[] = (data || []).map((item: any) => {
                    const rawUrl = item.imageUrl;
                    let imageUrl = "";
                    if (typeof rawUrl === "string" && rawUrl.length > 0) {
                        imageUrl = resolveApiUrl(rawUrl);
                    }
                    if (!imageUrl) imageUrl = resolveApiUrl(`/uploads/oc_${item.id}.jpg`);
                    return {
                        id: item.id,
                        title: item.title,
                        author: item.author?.username ?? profileUser?.username ?? "",
                        authorAvatar: item.author?.avatarUrl ?? profileUser?.avatarUrl ?? null,
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
                // eslint-disable-next-line no-console
                console.error(e);
            }
        };
        fetchArtworks();
    }, [profileUserId, profileUser?.username, profileUser?.avatarUrl, token]);

    useEffect(() => {
        if (!profileUserId || !Number.isInteger(profileUserId)) return;
        const fetchLikedArtworks = async () => {
            try {
                const res = await fetch(`/api/users/${profileUserId}/likes-artworks`);
                if (!res.ok) {
                    setLikedArtworks([]);
                    return;
                }
                const data = await res.json();
                const mapped: Artwork[] = (data || []).map((item: any) => {
                    const rawUrl = item.imageUrl;
                    let imageUrl = "";
                    if (typeof rawUrl === "string" && rawUrl.length > 0) {
                        imageUrl = resolveApiUrl(rawUrl);
                    }
                    if (!imageUrl) imageUrl = resolveApiUrl(`/uploads/oc_${item.id}.jpg`);
                    return {
                        id: item.id,
                        title: item.title,
                        author: item.author?.username ?? "",
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
                setLikedArtworks(mapped);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
                setLikedArtworks([]);
            }
        };
        fetchLikedArtworks();
    }, [profileUserId]);

    useEffect(() => {
        if (!profileUserId || !Number.isInteger(profileUserId)) return;
        const fetchCommissions = async () => {
            try {
                const [commissionRes, offerRes] = await Promise.all([
                    fetch(`/api/commissions?clientId=${profileUserId}&direction=commission`),
                    fetch(`/api/commissions?artistId=${profileUserId}&direction=offer`),
                ]);
                const commissionData = commissionRes.ok ? await commissionRes.json() : [];
                const offerData = offerRes.ok ? await offerRes.json() : [];
                const merged: ProfileCommissionCard[] = [...commissionData, ...offerData]
                    .filter((item: any) => item?.status === "new" || item?.status === "pending")
                    .map((item: any) => ({
                        id: item.id,
                        title: item.title ?? "未命名稿件",
                        price: Number(item.price ?? 0),
                        status: item.status ?? "new",
                        category: item.category ?? null,
                        direction: item.direction ?? "commission",
                        submittedAt: item.submittedAt,
                        previewImageUrl: item.previewImageUrl ?? null,
                    }))
                    .sort((a, b) => {
                        const at = new Date(a.submittedAt ?? 0).getTime();
                        const bt = new Date(b.submittedAt ?? 0).getTime();
                        return bt - at;
                    });
                setCommissions(merged);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
                setCommissions([]);
            }
        };
        fetchCommissions();
    }, [profileUserId]);

    useEffect(() => {
        if (!["portfolio", "likes"].includes(tab)) return;
        const updateColumnCount = () => {
            if (!containerRef.current) return;
            const container = containerRef.current;
            const computedStyle = window.getComputedStyle(container);
            const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
            const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
            const containerWidth = container.offsetWidth - paddingLeft - paddingRight;
            setMasonryInnerWidth(Math.max(0, containerWidth));
            const gap = 18;
            const targetColumns = 5;
            const minColumnWidth = 140;
            let calculatedColumns = Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
            if (containerWidth >= targetColumns * minColumnWidth + (targetColumns - 1) * gap) {
                calculatedColumns = targetColumns;
            } else {
                calculatedColumns = Math.min(targetColumns, calculatedColumns);
            }
            setColumnCount(calculatedColumns);
        };
        const timer = setTimeout(updateColumnCount, 80);
        window.addEventListener("resize", updateColumnCount);
        const ro = new ResizeObserver(() => updateColumnCount());
        if (containerRef.current) ro.observe(containerRef.current);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", updateColumnCount);
            ro.disconnect();
        };
    }, [tab, loading, profileUser]);

    useEffect(() => {
        if (!["portfolio", "likes"].includes(tab) || columnCount === 0) return;
        const timer = setTimeout(() => {
            const gap = 18;
            const columnHeights = new Array(columnCount).fill(0);
            const positions = new Map<number, CardPosition>();
            const sourceList = tab === "likes" ? likedArtworks : artworks;
            sourceList.forEach((artwork) => {
                const cardElement = cardRefs.current.get(artwork.id);
                if (!cardElement) return;
                const cardHeight = cardElement.offsetHeight;
                if (cardHeight === 0) return;
                const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
                const top = columnHeights[shortestColumn];
                positions.set(artwork.id, { column: shortestColumn, top });
                columnHeights[shortestColumn] += cardHeight + gap;
            });
            setCardPositions(positions);
            setContainerHeight(Math.max(...columnHeights, 0));
        }, 30);
        return () => clearTimeout(timer);
    }, [artworks, likedArtworks, columnCount, tab]);

    useEffect(() => {
        if (!["portfolio", "likes"].includes(tab)) return;
        const observer = new ResizeObserver(() => {
            const gap = 18;
            const columnHeights = new Array(columnCount).fill(0);
            const positions = new Map<number, CardPosition>();
            const sourceList = tab === "likes" ? likedArtworks : artworks;
            sourceList.forEach((artwork) => {
                const cardElement = cardRefs.current.get(artwork.id);
                if (!cardElement) return;
                const cardHeight = cardElement.offsetHeight;
                if (cardHeight === 0) return;
                const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
                const top = columnHeights[shortestColumn];
                positions.set(artwork.id, { column: shortestColumn, top });
                columnHeights[shortestColumn] += cardHeight + gap;
            });
            setCardPositions(positions);
            setContainerHeight(Math.max(...columnHeights, 0));
        });
        cardRefs.current.forEach((element) => {
            if (element) observer.observe(element);
        });
        return () => observer.disconnect();
    }, [artworks, likedArtworks, columnCount, tab]);

    const { columnWidth, gap, paddingLeft } = useMemo(() => {
        if (!containerRef.current || columnCount === 0) {
            return { columnWidth: 240, gap: 18, paddingLeft: 0 };
        }
        const container = containerRef.current;
        const computedStyle = window.getComputedStyle(container);
        const paddingLeftValue = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
        const measured =
            masonryInnerWidth > 0 ? masonryInnerWidth : container.offsetWidth - paddingLeftValue - paddingRight;
        const gapValue = 18;
        const width = (measured - (columnCount - 1) * gapValue) / columnCount;
        return { columnWidth: Math.max(1, width), gap: gapValue, paddingLeft: paddingLeftValue };
    }, [columnCount, masonryInnerWidth]);

    const handleMessage = () => {
        if (!profileUser) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后发送私信",
                description: "登录后可向对方发起站内私信，沟通合作或约稿。",
            });
            return;
        }
        navigate("/inbox", { state: { otherUserId: profileUser.id } });
    };

    if (loading) {
        return (
            <div className="user-profile-page">
                <div className="user-profile-loading">加载中…</div>
            </div>
        );
    }
    if (!profileUser) {
        return (
            <div className="user-profile-page">
                <div className="user-profile-empty">
                    <p>用户不存在</p>
                    <button type="button" onClick={() => navigate(-1)}>返回</button>
                </div>
            </div>
        );
    }

    const currentArtworkList = tab === "likes" ? likedArtworks : artworks;
    const headTitleMap: Record<TabKey, string> = {
        portfolio: "Portfolio",
        likes: "喜欢",
        commissions: "稿件",
    };
    const headCount = tab === "commissions" ? commissions.length : currentArtworkList.length;

    return (
        <div className="user-profile-page">
            <div
                className="user-profile-banner"
                style={{
                    backgroundImage: `url(${profileUser.profileBackgroundUrl ? resolveApiUrl(profileUser.profileBackgroundUrl) : DEFAULT_BANNER})`,
                    backgroundPosition: `${profileUser.backgroundPositionX ?? 50}% ${profileUser.backgroundPositionY ?? 50}%`,
                }}
            >
                <div className="user-profile-banner-overlay" />
            </div>

            <div className="user-profile-layout">
                <div className="user-profile-main">
                    <div className="user-profile-head">
                        <h1 className="user-profile-portfolio-title">{headTitleMap[tab]}</h1>
                        <p className="user-profile-portfolio-count">{headCount} 条内容</p>
                    </div>

                    <div className="user-profile-tabs">
                        <button
                            type="button"
                            className={`user-profile-tab ${tab === "portfolio" ? "active" : ""}`}
                            onClick={() => setTab("portfolio")}
                        >
                            作品
                        </button>
                        <button
                            type="button"
                            className={`user-profile-tab ${tab === "likes" ? "active" : ""}`}
                            onClick={() => setTab("likes")}
                        >
                            喜欢
                        </button>
                        <button
                            type="button"
                            className={`user-profile-tab ${tab === "commissions" ? "active" : ""}`}
                            onClick={() => setTab("commissions")}
                        >
                            稿件
                        </button>
                    </div>

                    {(tab === "portfolio" || tab === "likes") && (
                        <div
                            ref={containerRef}
                            className="user-profile-masonry"
                            style={{
                                height: containerHeight > 0 ? `${containerHeight}px` : "auto",
                                position: "relative",
                            }}
                        >
                            {currentArtworkList.map((artwork) => {
                                const position = cardPositions.get(artwork.id);
                                return (
                                <div
                                    key={artwork.id}
                                    ref={(el) => {
                                        if (el) cardRefs.current.set(artwork.id, el);
                                        else cardRefs.current.delete(artwork.id);
                                    }}
                                    className="user-profile-masonry-item"
                                    style={{
                                        width: `${columnWidth}px`,
                                        left: position ? `${paddingLeft + position.column * (columnWidth + gap)}px` : `${paddingLeft}px`,
                                        top: position ? `${position.top}px` : "0",
                                        opacity: position ? 1 : 0,
                                        transition: "opacity 0.25s ease",
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
                            )})}
                        </div>
                    )}
                    {tab === "likes" && likedArtworks.length === 0 && (
                        <div className="user-profile-likes-empty">
                            <p>暂无喜欢的内容</p>
                        </div>
                    )}
                    {tab === "commissions" && (
                        commissions.length === 0 ? (
                            <div className="user-profile-likes-empty">
                                <p>暂无可展示稿件</p>
                            </div>
                        ) : (
                            <div className="user-profile-commissions-grid">
                                {commissions.map((commission) => {
                                    const imageUrl = commission.previewImageUrl
                                        ? resolveApiUrl(commission.previewImageUrl)
                                        : "";
                                    return (
                                        <article
                                            key={commission.id}
                                            className="user-profile-commission-card"
                                            onClick={() => navigate(`/commissions/${commission.id}`)}
                                        >
                                            <div className="user-profile-commission-cover-wrap">
                                                {imageUrl ? (
                                                    <img src={imageUrl} alt={commission.title} className="user-profile-commission-cover" />
                                                ) : (
                                                    <div className="user-profile-commission-cover-placeholder">无封面</div>
                                                )}
                                                <span className={`user-profile-commission-status ${commission.status}`}>
                                                    {commission.status === "pending" ? "待确认" : "新建"}
                                                </span>
                                            </div>
                                            <div className="user-profile-commission-body">
                                                <h3 className="user-profile-commission-title">{commission.title}</h3>
                                                <p className="user-profile-commission-meta">
                                                    金额：￥{commission.price.toLocaleString()}
                                                </p>
                                                <div className="user-profile-commission-footer">
                                                    <span>{commission.category ?? "未分类"}</span>
                                                    <span>{commission.direction === "offer" ? "接稿" : "约稿"}</span>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )
                    )}
                </div>

                <aside className="user-profile-sidebar">
                    <div className="user-profile-sidebar-avatar">
                        {profileUser.avatarUrl ? (
                            <img
                                src={profileUser.avatarUrl}
                                alt={profileUser.username}
                                style={{ objectPosition: `${profileUser.avatarPositionX ?? 50}% ${profileUser.avatarPositionY ?? 50}%` }}
                            />
                        ) : (
                            <div className="user-profile-sidebar-avatar-placeholder">
                                {profileUser.username.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <h2 className="user-profile-sidebar-name">{profileUser.username}</h2>
                    {profileUser.bio && (
                        <p className="user-profile-sidebar-bio">{profileUser.bio}</p>
                    )}
                    {profileUser.location && (
                        <p className="user-profile-sidebar-location">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                            </svg>
                            {profileUser.location}
                        </p>
                    )}
                    <div className="user-profile-sidebar-actions">
                        {isOwnProfile ? (
                            <button
                                type="button"
                                className="user-profile-action-btn primary"
                                onClick={() => navigate("/profile/edit")}
                            >
                                编辑资料
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className={`user-profile-action-btn ${isFollowing ? "following" : ""}`}
                                    onClick={handleFollowClick}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="8.5" cy="7" r="4" />
                                        <line x1="20" y1="8" x2="20" y2="14" />
                                        <line x1="23" y1="11" x2="17" y2="11" />
                                    </svg>
                                    {isFollowing ? "已关注" : "关注"}
                                </button>
                                <button
                                    type="button"
                                    className="user-profile-action-btn message"
                                    onClick={handleMessage}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                    发消息
                                </button>
                            </>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
