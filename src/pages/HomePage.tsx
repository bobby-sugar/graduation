import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import type { Artwork, SortOption, DimensionOption, CategoryOption } from "../types";
import { useAuth } from "../contexts/AuthContext";

interface CardPosition {
    column: number;
    top: number;
}

const RECOMMENDED_CACHE_PREFIX = "oc_home_recommended_cache_v1";
const HOME_VIEW_STATE_KEY = "oc_home_view_state_v1";
const categoryOptions: CategoryOption[] = ['my-works', 'following', 'recommended', 'oc', 'worldview', 'nienien', 'emoji', 'novel', 'comic'];

const categoryLabels: Record<CategoryOption, string> = {
    'my-works': '我的作品',
    'following': '关注',
    'recommended': '推荐',
    'oc': 'OC',
    'worldview': '世界观',
    'nienien': '捏捏',
    'emoji': '表情包',
    'novel': '小说',
    'comic': '漫画',
};

const mapApiToArtwork = (item: any, API_BASE_URL: string): Artwork => {
    const rawUrl = item.imageUrl;
    let imageUrl = "";
    if (typeof rawUrl === "string" && rawUrl.length > 0) {
        imageUrl = rawUrl.startsWith("http") ? rawUrl : `${API_BASE_URL}${rawUrl}`;
    }
    return {
        id: item.id,
        title: item.title,
        author: item.author?.username ?? "未知作者",
        authorAvatar: item.author?.avatarUrl ?? null,
        imageUrl,
        likes: item.likes ?? 0,
        views: item.views ?? 0,
        commentCount: item.commentCount ?? 0,
        createdAt: item.createdAt ?? new Date().toISOString(),
        category: item.category,
        isLiked: item.isLiked,
        isCommented: item.isCommented,
        hasViewed: item.hasViewed,
    };
};

export default function HomePage() {
    const navigate = useNavigate();
    const { token, user } = useAuth();
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [sortBy] = useState<SortOption>("latest");
    const [dimension] = useState<DimensionOption>("all");
    const [category, setCategory] = useState<CategoryOption>(() => {
        try {
            const raw = sessionStorage.getItem(HOME_VIEW_STATE_KEY);
            if (!raw) return "recommended";
            const parsed = JSON.parse(raw) as { category?: string } | null;
            if (parsed?.category && categoryOptions.includes(parsed.category as CategoryOption)) {
                return parsed.category as CategoryOption;
            }
        } catch {
            // ignore
        }
        return "recommended";
    });
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const [columnCount, setColumnCount] = useState(4);
    const [cardPositions, setCardPositions] = useState<Map<number, CardPosition>>(new Map());
    const [containerHeight, setContainerHeight] = useState(0);
    const hasRestoredScrollRef = useRef(false);
    // 后端服务基础地址，用于拼接图片等静态资源 URL
    const API_BASE_URL = "http://localhost:3000";
    const recommendedCacheKey = `${RECOMMENDED_CACHE_PREFIX}:${user?.id ?? "guest"}`;

    const saveHomeViewState = () => {
        sessionStorage.setItem(
            HOME_VIEW_STATE_KEY,
            JSON.stringify({
                y: window.scrollY,
                category,
                savedAt: Date.now(),
            }),
        );
    };

    // 计算列数 - 目标是一排显示5个卡片
    useEffect(() => {
        const updateColumnCount = () => {
            if (containerRef.current) {
                // 获取容器的实际内容宽度（减去 padding）
                const container = containerRef.current;
                const computedStyle = window.getComputedStyle(container);
                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 12;
                const paddingRight = parseFloat(computedStyle.paddingRight) || 12;
                const containerWidth = container.offsetWidth - paddingLeft - paddingRight;
                
                // 目标：一排显示5个卡片
                const targetColumns = 5;
                const gap = 24;
                const minColumnWidth = 200; // 最小卡片宽度
                
                // 计算能放多少列
                let calculatedColumns = Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
                
                // 如果容器足够宽，优先显示5列
                if (containerWidth >= (targetColumns * minColumnWidth + (targetColumns - 1) * gap)) {
                    calculatedColumns = Math.min(targetColumns, calculatedColumns);
                }
                
                setColumnCount(calculatedColumns);
            }
        };

        // 延迟一下，确保容器已经渲染
        const timer = setTimeout(() => {
            updateColumnCount();
        }, 100);

        window.addEventListener('resize', updateColumnCount);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateColumnCount);
        };
    }, []);

    // 推荐 / 我的作品 / 关注 用专用接口，其余用全部列表
    useEffect(() => {
        const fetchArtworks = async () => {
            try {
                if (category === "my-works" || category === "following") {
                    if (!token) {
                        setArtworks([]);
                        return;
                    }
                    const url = category === "my-works" ? "/api/artworks/mine" : "/api/artworks/following";
                    const res = await fetch(url, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) {
                        throw new Error(`获取作品失败: ${res.status}`);
                    }
                    const data = await res.json();
                    const mapped: Artwork[] = (data || []).map((item: any) => mapApiToArtwork(item, API_BASE_URL));
                    setArtworks(mapped);
                    return;
                }
                const isRecommended = category === "recommended";
                let cachedOrderIds: number[] | null = null;
                if (isRecommended) {
                    try {
                        const cachedRaw = sessionStorage.getItem(recommendedCacheKey);
                        if (cachedRaw) {
                            const cached = JSON.parse(cachedRaw) as { orderIds?: number[] } | null;
                            if (Array.isArray(cached?.orderIds) && cached.orderIds.length > 0) {
                                cachedOrderIds = cached.orderIds.filter((id) => Number.isInteger(id));
                            }
                        }
                    } catch {
                        sessionStorage.removeItem(recommendedCacheKey);
                    }
                }
                const url = isRecommended ? "/api/artworks/recommended" : "/api/artworks";
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(url, { headers });
                if (!res.ok) {
                    throw new Error(`获取作品失败: ${res.status}`);
                }
                const data = await res.json();
                const mapped: Artwork[] = (data || []).map((item: any) => mapApiToArtwork(item, API_BASE_URL));
                if (isRecommended) {
                    const orderIndex = new Map<number, number>(
                        (cachedOrderIds ?? []).map((id, index) => [id, index]),
                    );
                    const ordered = cachedOrderIds && cachedOrderIds.length > 0
                        ? [...mapped].sort((a, b) => {
                            const ia = orderIndex.get(a.id);
                            const ib = orderIndex.get(b.id);
                            if (ia != null && ib != null) return ia - ib;
                            if (ia != null) return -1;
                            if (ib != null) return 1;
                            return b.id - a.id;
                        })
                        : mapped;
                    setArtworks(ordered);
                    sessionStorage.setItem(
                        recommendedCacheKey,
                        JSON.stringify({
                            savedAt: Date.now(),
                            orderIds: ordered.map((item) => item.id),
                        }),
                    );
                    return;
                }
                setArtworks(mapped);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error(error);
            }
        };

        fetchArtworks();
    }, [category, token, recommendedCacheKey]);

    // 排序和筛选逻辑：推荐 tab 使用后端返回的推荐顺序，其他 tab 做分类筛选 + 前端排序
    const filteredAndSortedArtworks = useMemo(() => {
        let filtered = [...artworks];

        if (category === "recommended") {
            return filtered;
        }

        if (category === "my-works" || category === "following") {
            // 我的作品 / 关注：后续可接用户数据筛选，此处暂不筛
        } else {
            filtered = filtered.filter((art) => art.category === category);
        }

        switch (sortBy) {
            case "latest":
                filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                break;
            case "popular":
                filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
                break;
            case "trending":
                filtered.sort((a, b) => {
                    const scoreA = (a.likes || 0) * 2 + (a.views || 0);
                    const scoreB = (b.likes || 0) * 2 + (b.views || 0);
                    return scoreB - scoreA;
                });
                break;
        }

        return filtered;
    }, [sortBy, dimension, category, artworks]);

    // 计算瀑布流布局
    useEffect(() => {
        if (columnCount === 0) return;

        // 延迟一下，确保 DOM 已经渲染
        const timer = setTimeout(() => {
            const gap = 24;
            const columnHeights = new Array(columnCount).fill(0);
            const positions = new Map<number, CardPosition>();

            filteredAndSortedArtworks.forEach((artwork) => {
                const cardElement = cardRefs.current.get(artwork.id);
                if (!cardElement) return;

                const cardHeight = cardElement.offsetHeight;
                if (cardHeight === 0) return; // 图片还未加载完成

                // 找到最短的列
                const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
                const top = columnHeights[shortestColumn];
                
                positions.set(artwork.id, {
                    column: shortestColumn,
                    top,
                });

                columnHeights[shortestColumn] += cardHeight + gap;
            });

            setCardPositions(positions);
            setContainerHeight(Math.max(...columnHeights));
        }, 50);

        return () => clearTimeout(timer);
    }, [filteredAndSortedArtworks, columnCount]);

    // 监听图片加载完成
    useEffect(() => {
        const observer = new ResizeObserver(() => {
            // 重新计算布局
            const gap = 24;
            const columnHeights = new Array(columnCount).fill(0);
            const positions = new Map<number, CardPosition>();

            filteredAndSortedArtworks.forEach((artwork) => {
                const cardElement = cardRefs.current.get(artwork.id);
                if (!cardElement) return;

                const cardHeight = cardElement.offsetHeight;
                if (cardHeight === 0) return;

                const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
                const top = columnHeights[shortestColumn];
                
                positions.set(artwork.id, {
                    column: shortestColumn,
                    top,
                });

                columnHeights[shortestColumn] += cardHeight + gap;
            });

            setCardPositions(positions);
            setContainerHeight(Math.max(...columnHeights));
        });

        cardRefs.current.forEach((element) => {
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, [filteredAndSortedArtworks, columnCount]);

    // 从详情返回后恢复列表所在位置
    useEffect(() => {
        if (hasRestoredScrollRef.current) return;
        if (containerHeight <= 0) return;
        try {
            const raw = sessionStorage.getItem(HOME_VIEW_STATE_KEY);
            if (!raw) {
                hasRestoredScrollRef.current = true;
                return;
            }
            const parsed = JSON.parse(raw) as { y?: number } | null;
            const targetY = typeof parsed?.y === "number" ? parsed.y : 0;
            requestAnimationFrame(() => {
                window.scrollTo({ top: Math.max(0, targetY), behavior: "auto" });
                hasRestoredScrollRef.current = true;
                sessionStorage.removeItem(HOME_VIEW_STATE_KEY);
            });
        } catch {
            hasRestoredScrollRef.current = true;
            sessionStorage.removeItem(HOME_VIEW_STATE_KEY);
        }
    }, [containerHeight, filteredAndSortedArtworks.length]);

    // 计算列宽和间距，需要考虑容器的 padding
    const { columnWidth, gap, paddingLeft } = useMemo(() => {
        if (!containerRef.current || columnCount === 0) {
            return { columnWidth: 280, gap: 24, paddingLeft: 12 };
        }
        const container = containerRef.current;
        const computedStyle = window.getComputedStyle(container);
        const paddingLeftValue = parseFloat(computedStyle.paddingLeft) || 12;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 12;
        const containerWidth = container.offsetWidth - paddingLeftValue - paddingRight;
        const gapValue = 24;
        const width = (containerWidth - (columnCount - 1) * gapValue) / columnCount;
        return { columnWidth: width, gap: gapValue, paddingLeft: paddingLeftValue };
    }, [columnCount]);

    return (
        <div className="homepage">
            {/* 筛选栏区域 */}
            <div className="homepage-filter-bar">
                <div className="filter-bar-container">
                    {categoryOptions.map((cat) => (
                        <button
                            key={cat}
                            className={`filter-bar-button ${category === cat ? 'active' : ''}`}
                            onClick={() => setCategory(cat)}
                        >
                            {categoryLabels[cat]}
                        </button>
                    ))}
                </div>
            </div>

            {/* 未登录时「我的作品」「关注」提示 */}
            {(category === "my-works" || category === "following") && !token && (
                <div className="homepage-auth-hint">
                    {category === "my-works" ? "请登录后查看我的作品" : "请登录后查看关注作者的作品"}
                </div>
            )}

            {/* 卡片区域 */}
            <div 
                ref={containerRef} 
                className="artwork-masonry-container"
                style={{ 
                    height: containerHeight > 0 ? `${containerHeight}px` : 'auto'
                }}
            >
                {filteredAndSortedArtworks.map((artwork) => {
                    const position = cardPositions.get(artwork.id);
                    return (
                        <div
                            key={artwork.id}
                            ref={(el) => {
                                if (el) {
                                    cardRefs.current.set(artwork.id, el);
                                } else {
                                    cardRefs.current.delete(artwork.id);
                                }
                            }}
                            className="artwork-masonry-item"
                            style={{
                                width: `${columnWidth}px`,
                                left: position
                                    ? `${paddingLeft + position.column * (columnWidth + gap)}px`
                                    : `${paddingLeft}px`,
                                top: position ? `${position.top}px` : '0',
                                opacity: position ? 1 : 0,
                                transition: 'opacity 0.3s ease',
                            }}
                        >
                            <Card
                                artwork={artwork}
                                onClick={() => {
                                    saveHomeViewState();
                                    navigate(`/artwork/${artwork.id}`);
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
