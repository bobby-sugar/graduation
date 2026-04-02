import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import type { Artwork } from "../types";
import { useAuth } from "../contexts/AuthContext";

interface ApiArtwork {
    id: number;
    authorId?: number;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    category?: string | null;
    tags?: string | null;
    gender?: string | null;
    likes?: number | null;
    views?: number | null;
    createdAt?: string | null;
    isLiked?: boolean;
    isFavorited?: boolean;
    author?: {
        id: number;
        username: string;
        avatarUrl?: string | null;
        bio?: string | null;
    } | null;
    artist?: {
        id: number;
        username: string;
        avatarUrl?: string | null;
        bio?: string | null;
    } | null;
}

interface CommentItem {
    id: number;
    author: string;
    authorAvatar: string | null;
    text: string;
    likes: number;
    isLiked: boolean;
    replies?: CommentItem[];
}

function mapRawCommentsToItems(rawComments: unknown): {
    list: CommentItem[];
    count: number;
} {
    const mappedComments: CommentItem[] = (Array.isArray(rawComments) ? rawComments : []).map((c: any) => ({
        id: c.id,
        author: c.user?.username ?? "游客",
        authorAvatar: c.user?.avatarUrl ?? null,
        text: c.content,
        likes: c.likes ?? 0,
        isLiked: false,
        replies: (c.replies || []).map((r: any) => ({
            id: r.id,
            author: r.user?.username ?? "游客",
            authorAvatar: r.user?.avatarUrl ?? null,
            text: r.content,
            likes: r.likes ?? 0,
            isLiked: false,
        })),
    }));
    const count = mappedComments.reduce(
        (sum, c) => sum + 1 + (c.replies ? c.replies.length : 0),
        0,
    );
    return { list: mappedComments, count };
}

const API_BASE_URL = "http://localhost:3000";

export default function ArtworkDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const [artwork, setArtwork] = useState<Artwork | null>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [replyingTo, setReplyingTo] = useState<number | null>(null);
    const [replyText, setReplyText] = useState<Record<number, string>>({});
    const [collapsedComments, setCollapsedComments] = useState<Set<number>>(new Set());
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [description, setDescription] = useState<string>("");
    const [authorBio, setAuthorBio] = useState<string>("");
    const [commentsCount, setCommentsCount] = useState<number>(0);
    const [tags, setTags] = useState<string[]>([]);
    const [authorOtherWorks, setAuthorOtherWorks] = useState<Artwork[]>([]);
    const [commissionArtist, setCommissionArtist] = useState<{ id: number; username: string; avatarUrl: string | null } | null>(null);
    const [authorId, setAuthorId] = useState<number | null>(null);

    const loadComments = useCallback(async () => {
        if (!id) return;
        try {
            const res = await fetch(`/api/artworks/${id}/comments`);
            if (!res.ok) return;
            const raw = await res.json();
            const { list, count } = mapRawCommentsToItems(raw);
            setComments(list);
            setCommentsCount(count);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }, [id]);

    // 加载作品详情和评论（带 token 时可获取 isLiked / isFavorited）
    useEffect(() => {
        const load = async () => {
            if (!id) return;
            try {
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const [artRes, commentsRes] = await Promise.all([
                    fetch(`/api/artworks/${id}`, { headers }),
                    fetch(`/api/artworks/${id}/comments`),
                ]);

                if (!artRes.ok) throw new Error("获取作品详情失败");
                const art: ApiArtwork | null = await artRes.json();
                if (!art) {
                    setArtwork(null);
                    return;
                }
                setIsLiked(!!art.isLiked);
                setIsSaved(!!art.isFavorited);

                const rawUrl: string | null | undefined = art.imageUrl;
                let imageUrl = "";
                if (typeof rawUrl === "string" && rawUrl.length > 0) {
                    imageUrl = rawUrl.startsWith("http") ? rawUrl : `${API_BASE_URL}${rawUrl}`;
                }
                // 兜底：如果后端没有返回 imageUrl，就按照 seed 规则用 /uploads/oc_{id}.jpg
                if (!imageUrl) {
                    imageUrl = `${API_BASE_URL}/uploads/oc_${art.id}.jpg`;
                }
                const mappedArtwork: Artwork = {
                    id: art.id,
                    title: art.title,
                    author: art.author?.username ?? "未知作者",
                    authorAvatar: art.author?.avatarUrl ?? null,
                    imageUrl,
                    likes: art.likes ?? 0,
                    views: art.views ?? 0,
                    createdAt: art.createdAt ?? new Date().toISOString(),
                    category: (art.category as any) ?? undefined,
                };
                setArtwork(mappedArtwork);
                setDescription(art.description ?? "");
                setAuthorBio(art.author?.bio ?? "");
                setAuthorId(art.author?.id ?? null);
                setCommissionArtist(art.artist ? { id: art.artist.id, username: art.artist.username, avatarUrl: art.artist.avatarUrl ?? null } : null);

                // 加载该作者的其他作品（不包含当前这条）
                if (art.author?.id) {
                    const otherRes = await fetch(`/api/artworks?authorId=${art.author.id}`);
                    if (otherRes.ok) {
                        const otherData: ApiArtwork[] = await otherRes.json();
                        const mappedOthers: Artwork[] = (otherData || [])
                            .filter((item) => item.id !== art.id)
                            .slice(0, 9)
                            .map((item) => {
                                const raw: string | null | undefined = item.imageUrl;
                                let imgUrl = "";
                                if (typeof raw === "string" && raw.length > 0) {
                                    imgUrl = raw.startsWith("http") ? raw : `${API_BASE_URL}${raw}`;
                                }
                                if (!imgUrl) {
                                    imgUrl = `${API_BASE_URL}/uploads/oc_${item.id}.jpg`;
                                }
                                return {
                                    id: item.id,
                                    title: item.title,
                                    author: item.author?.username ?? "未知作者",
                                    authorAvatar: item.author?.avatarUrl ?? null,
                                    imageUrl: imgUrl,
                                    likes: item.likes ?? 0,
                                    views: item.views ?? 0,
                                    createdAt: item.createdAt ?? new Date().toISOString(),
                                    category: (item.category as any) ?? undefined,
                                };
                            });
                        setAuthorOtherWorks(mappedOthers);
                    } else {
                        setAuthorOtherWorks([]);
                    }
                } else {
                    setAuthorOtherWorks([]);
                }

                if (commentsRes.ok) {
                    const rawComments = await commentsRes.json();
                    const { list, count } = mapRawCommentsToItems(rawComments);
                    setComments(list);
                    setCommentsCount(count);
                }

                setTags(
                    art.tags
                        ? art.tags.split(",").map((s) => s.trim()).filter(Boolean)
                        : art.category
                            ? [art.category]
                            : []
                );

                // 登录用户记录「已查看」，用于主页卡片高亮
                if (token) {
                    fetch(`/api/artworks/${id}/view`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                    }).catch(() => {});
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
            }
        };

        load();
    }, [id, token]);

    useEffect(() => {
        if (!id) return;
        const numId = parseInt(id, 10);
        if (!Number.isInteger(numId) || numId < 1) return;
        const socket: Socket = io({
            path: "/socket.io",
            ...(token ? { auth: { token } } : {}),
            transports: ["websocket", "polling"],
        });
        const doJoin = () => {
            socket.emit("join-artwork", { artworkId: numId });
        };
        socket.on("connect", doJoin);
        if (socket.connected) doJoin();
        const onRefresh = (p: { artworkId?: number }) => {
            if (Number(p?.artworkId) !== numId) return;
            void loadComments();
        };
        socket.on("artwork:comments-refresh", onRefresh);
        return () => {
            socket.emit("leave-artwork", { artworkId: numId });
            socket.off("connect", doJoin);
            socket.off("artwork:comments-refresh", onRefresh);
            socket.disconnect();
        };
    }, [id, token, loadComments]);

    const isOwnAuthor = user != null && authorId != null && user.id === authorId;

    useEffect(() => {
        if (!token || authorId == null || isOwnAuthor) return;
        const check = async () => {
            try {
                const res = await fetch("/api/users/me/following", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const list: { id: number }[] = await res.json();
                setIsFollowing(list.some((u) => u.id === authorId));
            } catch {
                // ignore
            }
        };
        check();
    }, [token, authorId, isOwnAuthor]);

    const handleFollowClick = useCallback(async () => {
        if (authorId == null || !token) return;
        try {
            if (isFollowing) {
                await fetch(`/api/users/${authorId}/follow`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
                setIsFollowing(false);
            } else {
                await fetch(`/api/users/${authorId}/follow`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
                setIsFollowing(true);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }, [authorId, token, isFollowing]);

    const handleLikeClick = useCallback(async () => {
        if (!artwork || !token) return;
        try {
            const method = isLiked ? "DELETE" : "POST";
            const res = await fetch(`/api/artworks/${artwork.id}/like`, {
                method,
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const nextLiked = data.liked ?? !isLiked;
                setIsLiked(nextLiked);
                setArtwork((prev) =>
                    prev
                        ? {
                              ...prev,
                              likes: Math.max(0, (prev.likes ?? 0) + (nextLiked ? 1 : -1)),
                          }
                        : null,
                );
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }, [artwork, token, isLiked]);

    const handleFavoriteClick = useCallback(async () => {
        if (!artwork || !token) return;
        try {
            const method = isSaved ? "DELETE" : "POST";
            const res = await fetch(`/api/artworks/${artwork.id}/favorite`, {
                method,
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                setIsSaved(data.favorited ?? !isSaved);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }, [artwork, token, isSaved]);

    // 统一处理左侧大图的加载状态，避免 onLoad 不触发导致一直转圈
    useEffect(() => {
        if (!artwork || !artwork.imageUrl) {
            setImageLoaded(true);
            return;
        }

        setImageLoaded(false);
        const img = new Image();
        img.src = artwork.imageUrl;
        img.onload = () => {
            setImageLoaded(true);
        };
        img.onerror = () => {
            setImageLoaded(true);
        };

        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [artwork?.imageUrl]);
    
    const handleSendComment = async () => {
        if (!commentText.trim() || !artwork) return;
        if (!token) return;
        try {
            const res = await fetch(`/api/artworks/${artwork.id}/comments`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ content: commentText.trim() }),
            });
            if (res.ok) {
                setCommentText("");
                await loadComments();
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    };
    
    const handleLikeComment = async (commentId: number, isReply: boolean = false, parentId?: number) => {
        try {
            await fetch(`/api/comments/${commentId}/like`, { method: "POST" });
        } catch (e) {
            // 忽略错误，先乐观更新
        }

        setComments(prev =>
            prev.map(comment => {
                if (isReply && parentId && comment.id === parentId && comment.replies) {
                    return {
                        ...comment,
                        replies: comment.replies.map(reply =>
                            reply.id === commentId
                                ? {
                                      ...reply,
                                      isLiked: !reply.isLiked,
                                      likes: reply.isLiked ? reply.likes - 1 : reply.likes + 1,
                                  }
                                : reply,
                        ),
                    };
                }
                if (!isReply && comment.id === commentId) {
                    return {
                        ...comment,
                        isLiked: !comment.isLiked,
                        likes: comment.isLiked ? comment.likes - 1 : comment.likes + 1,
                    };
                }
                return comment;
            }),
        );
    };
    
    const handleReply = (commentId: number) => {
        setReplyingTo(replyingTo === commentId ? null : commentId);
        if (replyingTo === commentId) {
            setReplyText({ ...replyText, [commentId]: '' });
        }
    };
    
    const handleSendReply = async (commentId: number) => {
        const reply = replyText[commentId];
        if (!reply || !reply.trim() || !artwork || !token) return;
        try {
            const res = await fetch(`/api/artworks/${artwork.id}/comments`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ content: reply.trim(), parentId: commentId }),
            });
            if (res.ok) {
                setReplyText({ ...replyText, [commentId]: '' });
                setReplyingTo(null);
                await loadComments();
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    };
    
    const toggleCommentCollapse = (commentId: number) => {
        setCollapsedComments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(commentId)) {
                newSet.delete(commentId);
            } else {
                newSet.add(commentId);
            }
            return newSet;
        });
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    if (!artwork) {
        return (
            <div className="artwork-detail-page">
                <div className="artwork-detail-not-found">
                    <p>作品未找到</p>
                    <button onClick={() => navigate(-1)}>返回</button>
                </div>
            </div>
        );
    }

    return (
        <div className="artwork-detail-page">
            <div className="artwork-detail-container">
                {/* 左侧图片区域 - 独立滚动容器 */}
                <div className="artwork-detail-image-section">
                    <div className="artwork-detail-image-scroll">
                        <div className="artwork-detail-image-wrapper">
                            {!imageLoaded && (
                                <div className="artwork-detail-image-placeholder" />
                            )}
                            <img
                                src={artwork.imageUrl}
                                alt={artwork.title}
                                className="artwork-detail-image"
                                style={{ opacity: imageLoaded ? 1 : 0 }}
                            />
                        </div>
                    </div>
                </div>

                {/* 右侧作者信息区域 - 独立滚动容器 */}
                <div className="artwork-detail-info-section">
                    <div className="artwork-detail-info-scroll">
                        {/* 返回按钮 */}
                        <button
                            className="artwork-detail-back-btn"
                            onClick={() => navigate(-1)}
                            aria-label="返回"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                            <span>返回</span>
                        </button>

                        {/* 作者信息和作品信息合并为一个卡片 */}
                        <div className="artwork-detail-card">
                            {/* 作者信息区域 */}
                            <div className="artwork-detail-author-section">
                                <div className="artwork-detail-author-header">
                                    {artwork.authorAvatar && (
                                        <img
                                            src={artwork.authorAvatar}
                                            alt={artwork.author}
                                            className="artwork-detail-author-avatar"
                                        />
                                    )}
                                    <div className="artwork-detail-author-info">
                                        <div className="artwork-detail-author-name-row">
                                            {authorId != null ? (
                                                <Link to={`/user/${authorId}`} className="artwork-detail-author-name artwork-detail-author-link">{artwork.author}</Link>
                                            ) : (
                                                <div className="artwork-detail-author-name">{artwork.author}</div>
                                            )}
                                            {!isOwnAuthor && (
                                                <button
                                                    className={`artwork-detail-follow-btn ${isFollowing ? "following" : ""}`}
                                                    onClick={handleFollowClick}
                                                >
                                                    {isFollowing ? "已关注" : "关注"}
                                                </button>
                                            )}
                                        </div>
                                        <div className="artwork-detail-author-bio">{authorBio}</div>
                                    </div>
                                </div>

                                {/* 点赞和收藏按钮（需登录） */}
                                <div className="artwork-detail-action-buttons">
                                    <button
                                        className={`artwork-detail-action-btn artwork-detail-like-btn ${isLiked ? 'liked' : ''}`}
                                        onClick={handleLikeClick}
                                        title={token ? (isLiked ? "取消点赞" : "点赞") : "登录后可点赞"}
                                        disabled={!token}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                        </svg>
                                        <span>点赞</span>
                                    </button>
                                    <button
                                        className={`artwork-detail-action-btn artwork-detail-save-btn ${isSaved ? 'saved' : ''}`}
                                        onClick={handleFavoriteClick}
                                        title={token ? (isSaved ? "取消收藏" : "收藏") : "登录后可收藏"}
                                        disabled={!token}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        <span>收藏</span>
                                    </button>
                                </div>
                            </div>

                            {/* 创作画师区域（约稿所得原画时显示，可点击进入画师主页） */}
                            {commissionArtist && (
                                <div className="artwork-detail-artist-section">
                                    <div className="artwork-detail-artist-label">原画创作画师</div>
                                    <Link
                                        to={`/user/${commissionArtist.id}`}
                                        className="artwork-detail-artist-header artwork-detail-artist-link"
                                    >
                                        {commissionArtist.avatarUrl && (
                                            <img
                                                src={commissionArtist.avatarUrl}
                                                alt={commissionArtist.username}
                                                className="artwork-detail-artist-avatar"
                                            />
                                        )}
                                        <span className="artwork-detail-artist-name">{commissionArtist.username}</span>
                                    </Link>
                                </div>
                            )}

                            {/* 作品信息区域 */}
                            <div className="artwork-detail-work-section">
                                <h1 className="artwork-detail-work-title">{artwork.title}</h1>
                                <p className="artwork-detail-work-description">{description}</p>
                                <p className="artwork-detail-work-date">{formatDate(artwork.createdAt)}</p>
                                
                                {/* 统计数据 */}
                                <div className="artwork-detail-work-stats">
                                    <div className="artwork-detail-work-stat">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                        </svg>
                                        <span>{artwork.likes || 0}</span>
                                    </div>
                                    <div className="artwork-detail-work-stat">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                        <span>{artwork.views || 0}</span>
                                    </div>
                                    <div className="artwork-detail-work-stat">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        <span>{commentsCount}</span>
                                    </div>
                                    <button className="artwork-detail-share-btn" title="分享">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="18" cy="5" r="3"></circle>
                                            <circle cx="6" cy="12" r="3"></circle>
                                            <circle cx="18" cy="19" r="3"></circle>
                                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 评论栏 */}
                        <div className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">评论</h3>
                            
                            {/* 评论列表 */}
                            <div className="artwork-detail-comments-list">
                                {comments.map((comment) => {
                                    const hasReplies = comment.replies && comment.replies.length > 0;
                                    const isCollapsed = collapsedComments.has(comment.id);
                                    
                                    return (
                                        <div key={comment.id} className="artwork-detail-comment-item">
                                            <div className="artwork-detail-comment-avatar">
                                                <img src={comment.authorAvatar || ""} alt={comment.author} />
                                            </div>
                                            <div className="artwork-detail-comment-content">
                                                <div className="artwork-detail-comment-header">
                                                    <div className="artwork-detail-comment-author">{comment.author}</div>
                                                    <div className="artwork-detail-comment-actions">
                                                        <button
                                                            className={`artwork-detail-comment-like ${comment.isLiked ? 'liked' : ''}`}
                                                            onClick={() => handleLikeComment(comment.id)}
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill={comment.isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                                            </svg>
                                                            <span>{comment.likes}</span>
                                                        </button>
                                                        <button
                                                            className="artwork-detail-comment-reply-btn"
                                                            onClick={() => handleReply(comment.id)}
                                                        >
                                                            回复
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="artwork-detail-comment-text">{comment.text}</div>
                                                
                                                {/* 展开/折叠按钮移到评论内容下方 */}
                                                {hasReplies && (
                                                    <button
                                                        className="artwork-detail-load-replies-btn"
                                                        onClick={() => toggleCommentCollapse(comment.id)}
                                                    >
                                                        {isCollapsed ? '展开回复' : '折叠回复'}
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            {isCollapsed ? (
                                                                <polyline points="6 9 12 15 18 9"></polyline>
                                                            ) : (
                                                                <polyline points="18 15 12 9 6 15"></polyline>
                                                            )}
                                                        </svg>
                                                    </button>
                                                )}
                                                
                                                {/* 回复输入框 */}
                                                {replyingTo === comment.id && (
                                                    <div className="artwork-detail-reply-input">
                                                        <input
                                                            type="text"
                                                            placeholder="写下你的回复..."
                                                            value={replyText[comment.id] || ''}
                                                            onChange={(e) => setReplyText({ ...replyText, [comment.id]: e.target.value })}
                                                            onKeyPress={(e) => {
                                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                                    e.preventDefault();
                                                                    handleSendReply(comment.id);
                                                                }
                                                            }}
                                                        />
                                                        <button onClick={() => handleSendReply(comment.id)} disabled={!replyText[comment.id]?.trim()}>
                                                            发送
                                                        </button>
                                                    </div>
                                                )}
                                                
                                                {/* 回复列表 */}
                                                {hasReplies && !isCollapsed && (
                                                    <div className="artwork-detail-replies-list">
                                                        {comment.replies!.map((reply) => (
                                                            <div key={reply.id} className="artwork-detail-reply-item">
                                                                <div className="artwork-detail-comment-avatar">
                                                                    <img src={reply.authorAvatar || ""} alt={reply.author} />
                                                                </div>
                                                                <div className="artwork-detail-comment-content">
                                                                    <div className="artwork-detail-comment-header">
                                                                        <div className="artwork-detail-comment-author">{reply.author}</div>
                                                                        <button
                                                                            className={`artwork-detail-comment-like ${reply.isLiked ? 'liked' : ''}`}
                                                                            onClick={() => handleLikeComment(reply.id, true, comment.id)}
                                                                        >
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill={reply.isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                                                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                                                            </svg>
                                                                            <span>{reply.likes}</span>
                                                                        </button>
                                                                    </div>
                                                                    <div className="artwork-detail-comment-text">{reply.text}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {hasReplies && isCollapsed && (
                                                    <div className="artwork-detail-replies-collapsed">
                                                        已折叠 {comment.replies!.length} 条回复
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {/* 发送评论输入框 - 需登录 */}
                            <div className="artwork-detail-comment-input">
                                <input
                                    type="text"
                                    placeholder={token ? "写下你的评论..." : "请登录后评论"}
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendComment();
                                        }
                                    }}
                                    disabled={!token}
                                />
                                <button onClick={handleSendComment} disabled={!token || !commentText.trim()}>
                                    发送
                                </button>
                            </div>
                        </div>

                        {/* 标签栏 */}
                        <div className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">标签</h3>
                            <div className="artwork-detail-tags-list">
                                {tags.map((tag, index) => (
                                    <span key={index} className="artwork-detail-tag">{tag}</span>
                                ))}
                            </div>
                        </div>

                        {/* 作者其他作品 */}
                        <div className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">该作者的其他作品</h3>
                            <div className="artwork-detail-other-works-grid">
                                {authorOtherWorks.map((work) => (
                                    <div
                                        key={work.id}
                                        className="artwork-detail-other-work-item"
                                        onClick={() => navigate(`/artwork/${work.id}`)}
                                    >
                                        <img src={work.imageUrl} alt={work.title} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
