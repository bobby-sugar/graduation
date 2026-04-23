import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../components/Card";
import type { Artwork, SortOption, DimensionOption, CategoryOption } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { useHomeSearch } from "../contexts/HomeSearchContext";
import { API_BASE_URL, resolveApiUrl } from "../config/api";
import { buildArtworkCloseState } from "../artwork/artworkDetailNavigation";

interface CardPosition {
    column: number;
    top: number;
}

const HOME_VIEW_STATE_KEY = "oc_home_view_state_v1";
const categoryOptions: CategoryOption[] = ['my-works', 'following', 'recommended', 'oc', 'worldview', 'emoji'];

const categoryLabels: Record<CategoryOption, string> = {
    'my-works': '我的作品',
    'following': '关注',
    'recommended': '推荐',
    'oc': 'OC',
    'worldview': '世界观',
    'emoji': '表情包',
};

const mapApiToArtwork = (item: any): Artwork => {
    const rawUrl = item.imageUrl;
    let imageUrl = "";
    if (typeof rawUrl === "string" && rawUrl.length > 0) {
        imageUrl = resolveApiUrl(rawUrl);
    }
    return {
        id: item.id,
        authorId:
            typeof item.authorId === "number"
                ? item.authorId
                : (typeof item.author?.id === "number" ? item.author.id : undefined),
        title: item.title,
        author: item.author?.username ?? "未知作者",
        authorAvatar: item.author?.avatarUrl ?? null,
        imageUrl,
        likes: item.likes ?? 0,
        views: item.views ?? 0,
        commentCount: item.commentCount ?? 0,
        createdAt: item.createdAt ?? new Date().toISOString(),
        category: item.category,
        description: item.description ?? null,
        tags: item.tags ?? null,
        isLiked: item.isLiked,
        isCommented: item.isCommented,
        hasViewed: item.hasViewed,
    };
};

export default function HomePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { token } = useAuth();
    const { debouncedQuery } = useHomeSearch();
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [sortBy] = useState<SortOption>("latest");
    const [dimension] = useState<DimensionOption>("all");
    const [category, setCategory] = useState<CategoryOption>(() => {
        try {
            const raw = sessionStorage.getItem(HOME_VIEW_STATE_KEY);
            if (!raw) return "recommended";
            const parsed = JSON.parse(raw) as { category?: string } | null;
            const saved = parsed?.category;
            if (saved === "nienien") return "oc";
            if (saved === "novel") return "recommended";
            if (saved === "comic") return "oc";
            if (saved && categoryOptions.includes(saved as CategoryOption)) {
                return saved as CategoryOption;
            }
        } catch {
            // ignore
        }
        return "recommended";
    });
    const containerRef = useRef<HTMLDivElement>(null);
    const homeSubnavRef = useRef<HTMLDivElement>(null);
    const [homeSubnavIndicator, setHomeSubnavIndicator] = useState({ left: 0, width: 0 });
    const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const [columnCount, setColumnCount] = useState(4);
    const [cardPositions, setCardPositions] = useState<Map<number, CardPosition>>(new Map());
    const [containerHeight, setContainerHeight] = useState(0);
    const hasRestoredScrollRef = useRef(false);

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

    useLayoutEffect(() => {
        const updateIndicator = () => {
            const container = homeSubnavRef.current;
            if (!container) return;
            const activeLink = container.querySelector(".navbar-link.active") as HTMLElement | null;
            if (activeLink) {
                const containerRect = container.getBoundingClientRect();
                const linkRect = activeLink.getBoundingClientRect();
                setHomeSubnavIndicator({
                    left: linkRect.left - containerRect.left,
                    width: linkRect.width,
                });
            } else {
                setHomeSubnavIndicator({ left: 0, width: 0 });
            }
        };
        updateIndicator();
        const timer = setTimeout(updateIndicator, 0);
        window.addEventListener("resize", updateIndicator);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", updateIndicator);
        };
    }, [category]);

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

    // 推荐 / 我的作品 / 关注 / 顶栏全站搜索 分路请求
    useEffect(() => {
        let cancelled = false;
        const q = debouncedQuery;

        const fetchArtworks = async () => {
            try {
                if (category === "my-works" || category === "following") {
                    if (!token) {
                        if (!cancelled) setArtworks([]);
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
                    if (cancelled) return;
                    const mapped: Artwork[] = (data || []).map((item: any) => mapApiToArtwork(item));
                    setArtworks(mapped);
                    return;
                }

                if (q) {
                    const headers: HeadersInit = {};
                    if (token) headers.Authorization = `Bearer ${token}`;
                    const res = await fetch(`/api/artworks/search?q=${encodeURIComponent(q)}`, { headers });
                    if (!res.ok) {
                        throw new Error(`搜索失败: ${res.status}`);
                    }
                    const data = await res.json();
                    if (cancelled) return;
                    const mapped: Artwork[] = (data || []).map((item: any) => mapApiToArtwork(item));
                    setArtworks(mapped);
                    return;
                }

                const isRecommended = category === "recommended";
                const url = isRecommended ? "/api/artworks/recommended" : "/api/artworks";
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(url, { headers });
                if (!res.ok) {
                    throw new Error(`获取作品失败: ${res.status}`);
                }
                const data = await res.json();
                if (cancelled) return;
                const mapped: Artwork[] = (data || []).map((item: any) => mapApiToArtwork(item));
                /** 推荐顺序完全以接口为准。旧逻辑曾用 sessionStorage 缓存 orderIds 并重排，导致新作品 ID 不在缓存中时被一律排到队尾。 */
                setArtworks(mapped);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error(error);
                if (!cancelled) setArtworks([]);
            }
        };

        fetchArtworks();
        return () => {
            cancelled = true;
        };
    }, [category, token, debouncedQuery]);

    // 排序和筛选：推荐无搜索时保持接口顺序；有搜索时按时间。我的/关注在本地按关键字再筛。
    const filteredAndSortedArtworks = useMemo(() => {
        let filtered = [...artworks].filter((art) => (art.category ?? "").toLowerCase() !== "novel");
        const qLower = debouncedQuery.trim().toLowerCase();

        if (category === "recommended") {
            if (!qLower) {
                return filtered;
            }
            filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return filtered;
        }

        if (category === "my-works" || category === "following") {
            if (qLower) {
                filtered = filtered.filter(
                    (art) =>
                        art.title.toLowerCase().includes(qLower) ||
                        art.author.toLowerCase().includes(qLower) ||
                        (art.category && String(art.category).toLowerCase().includes(qLower)),
                );
            }
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
    }, [sortBy, dimension, category, artworks, debouncedQuery]);

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

    const showSearchEmpty =
        debouncedQuery.trim().length > 0 &&
        filteredAndSortedArtworks.length === 0 &&
        !((category === "my-works" || category === "following") && !token);

    const guestNeedsHomeAuth = (category === "my-works" || category === "following") && !token;

    return (
        <div className={`homepage${guestNeedsHomeAuth ? " homepage--guest-auth" : ""}`}>
            <header className="home-subnav" aria-label="作品分类">
                <div className="navbar-container home-subnav-container">
                    <div className="navbar-main home-subnav-main" ref={homeSubnavRef}>
                        <div
                            className="navbar-indicator"
                            style={{
                                left: `${homeSubnavIndicator.left}px`,
                                width: `${homeSubnavIndicator.width}px`,
                                opacity: homeSubnavIndicator.width > 0 ? 1 : 0,
                            }}
                        />
                        {categoryOptions.map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                className={`navbar-link home-subnav-link ${category === cat ? "active" : ""}`}
                                onClick={() => setCategory(cat)}
                            >
                                {categoryLabels[cat]}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {guestNeedsHomeAuth ? (
                <div className="homepage-guest-auth-region">
                    <div className="oc-auth-gate-page__inner">
                        <AuthPromptPanel
                            compact
                            title={category === "my-works" ? "登录后查看我的作品" : "登录后查看关注动态"}
                            description={
                                category === "my-works"
                                    ? "登录后即可在首页浏览你发布的全部作品。"
                                    : "登录后可查看已关注作者的最新作品更新。"
                            }
                        />
                    </div>
                </div>
            ) : null}

            {!guestNeedsHomeAuth && showSearchEmpty ? (
                <div className="homepage-search-empty" role="status">
                    没有找到与「{debouncedQuery.trim()}」相关的作品，试试其它关键词或切换分类。
                </div>
            ) : null}

            {/* 卡片区域 */}
            {!guestNeedsHomeAuth ? (
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
                                apiBaseUrl={API_BASE_URL}
                                onClick={() => {
                                    saveHomeViewState();
                                    navigate(`/artwork/${artwork.id}`, {
                                        state: buildArtworkCloseState(`${location.pathname}${location.search}`),
                                    });
                                }}
                            />
                        </div>
                    );
                })}
            </div>
            ) : null}

        </div>
    );
}
