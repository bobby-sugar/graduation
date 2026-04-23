import { NavLink, useLocation } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { countCommissionInboxUnreadForBadge } from "../commissionInboxHelpers";
import { useAuth } from "../contexts/AuthContext";
import { useHomeSearch } from "../contexts/HomeSearchContext";

/** 顶栏登录 / 注册 / 退出等按钮内联图标（stroke，currentColor） */
function NavbarIconUserPlus() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
    );
}

function NavbarIconLogIn() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
    );
}

function NavbarIconLogOut() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}

function NavbarIconChevronRight() {
    return (
        <svg
            className="navbar-user-chevron"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

const getNavIcon = (path: string) => {
    switch (path) {
        case '/':
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
            );
        case '/commissions':
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
            );
        case '/studio':
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                    <path d="M16 2v5M8 2v5M4 7h16"></path>
                </svg>
            );
        case '/inbox':
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
            );
        case '/me':
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            );
        default:
            return null;
    }
};

export default function NavBar() {
    const location = useLocation();
    const containerRef = useRef<HTMLDivElement>(null);
    const compactEnterWidthRef = useRef(0);
    const [navIconsOnly, setNavIconsOnly] = useState(false);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
    const { user, token, logout, isReady } = useAuth();
    const { query, setQuery, clearQuery } = useHomeSearch();
    const homeSearchInputRef = useRef<HTMLInputElement>(null);
    const [unreadInboxCount, setUnreadInboxCount] = useState(0);
    const isHome = location.pathname === "/";
    const loginFromMe =
        location.pathname === "/login" &&
        new URLSearchParams(location.search).get("from") === "/me";
    const meNavActive =
        location.pathname === "/me" ||
        location.pathname.startsWith("/me/") ||
        loginFromMe;

    const navLinks = [
        { path: '/', label: '主页', icon: getNavIcon('/') },
        { path: '/commissions', label: '稿件', icon: getNavIcon('/commissions') },
        { path: '/studio', label: '工作站', icon: getNavIcon('/studio') },
        { path: '/inbox', label: '消息', icon: getNavIcon('/inbox') },
        { path: '/me', label: '我的', icon: getNavIcon('/me') },
    ];

    // 轮询未读状态（私聊会话 + 点赞评论通知 + 稿件消息红点），用于在「消息」导航上显示红色数字圈
    useEffect(() => {
        if (!user || !token) {
            setUnreadInboxCount(0);
            return;
        }
        let cancelled = false;

        const fetchUnreadNotifications = async (): Promise<number> => {
            const res = await fetch("/api/notifications/unread-count", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return 0;
            const data = await res.json();
            return Number(data?.count ?? 0);
        };

        const fetchUnreadConversations = async (): Promise<number> => {
            const res = await fetch("/api/conversations", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return 0;
            const data = await res.json();
            if (!Array.isArray(data)) return 0;
            return data.reduce((sum: number, item: any) => sum + Number(item?.unreadCount ?? 0), 0);
        };

        const fetchUnreadCommissionApplications = async (): Promise<number> => {
            const res = await fetch("/api/conversations/commission-applications", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return 0;
            const data = await res.json();
            if (!Array.isArray(data)) return 0;
            return countCommissionInboxUnreadForBadge(data);
        };

        const fetchUnread = async () => {
            try {
                const [notificationUnread, conversationUnread, commissionUnread] = await Promise.all([
                    fetchUnreadNotifications(),
                    fetchUnreadConversations(),
                    fetchUnreadCommissionApplications(),
                ]);
                if (!cancelled) {
                    const total = notificationUnread + conversationUnread + commissionUnread;
                    setUnreadInboxCount(Number.isFinite(total) && total > 0 ? total : 0);
                }
            } catch {
                if (!cancelled) setUnreadInboxCount(0);
            }
        };
        fetchUnread();
        const timer = setInterval(fetchUnread, 30000);

        const handleUpdated = () => {
            // 收到全局事件时立即刷新一次未读状态
            fetchUnread();
        };
        window.addEventListener("oc-notifications-updated", handleUpdated);
        window.addEventListener("oc-conversations-updated", handleUpdated);
        window.addEventListener("oc-commission-updated", handleUpdated);

        return () => {
            cancelled = true;
            clearInterval(timer);
            window.removeEventListener("oc-notifications-updated", handleUpdated);
            window.removeEventListener("oc-conversations-updated", handleUpdated);
            window.removeEventListener("oc-commission-updated", handleUpdated);
        };
    }, [user, token]);

    // 主页：⌘K / Ctrl+K 聚焦搜索（不在其它输入框内时）
    useEffect(() => {
        if (!isHome) return;
        const onDocKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "k" && e.key !== "K") return;
            if (!e.metaKey && !e.ctrlKey) return;
            const t = e.target;
            if (t instanceof HTMLElement) {
                const tag = t.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) {
                    return;
                }
            }
            e.preventDefault();
            const el = homeSearchInputRef.current;
            if (!el) return;
            el.focus({ preventScroll: true });
            el.select();
        };
        document.addEventListener("keydown", onDocKeyDown);
        return () => document.removeEventListener("keydown", onDocKeyDown);
    }, [isHome]);

    const syncNavIconsOnlyLayout = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        setNavIconsOnly((prev) => {
            if (!prev) {
                if (el.scrollWidth > el.clientWidth + 1) {
                    compactEnterWidthRef.current = window.innerWidth;
                    return true;
                }
                return false;
            }
            const w0 = compactEnterWidthRef.current;
            if (w0 > 0 && window.innerWidth >= w0 + 88) {
                return false;
            }
            return true;
        });
    }, []);

    useLayoutEffect(() => {
        syncNavIconsOnlyLayout();
    }, [
        syncNavIconsOnlyLayout,
        navIconsOnly,
        location.pathname,
        location.search,
        isHome,
        user,
        isReady,
        unreadInboxCount,
    ]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => syncNavIconsOnlyLayout());
        ro.observe(el);
        window.addEventListener("resize", syncNavIconsOnlyLayout);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", syncNavIconsOnlyLayout);
        };
    }, [syncNavIconsOnlyLayout]);

    useEffect(() => {
        const updateIndicator = () => {
            if (!containerRef.current) return;

            const activeLink = containerRef.current.querySelector(
                ".navbar-link.active",
            ) as HTMLElement | null;
            if (activeLink) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const linkRect = activeLink.getBoundingClientRect();

                setIndicatorStyle({
                    left: linkRect.left - containerRect.left,
                    width: linkRect.width,
                });
            } else {
                setIndicatorStyle({ left: 0, width: 0 });
            }
        };

        // 初始更新
        updateIndicator();

        // 延迟更新以确保DOM已渲染
        const timer = setTimeout(updateIndicator, 0);

        // 监听窗口大小变化
        window.addEventListener('resize', updateIndicator);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateIndicator);
        };
    }, [location.pathname, location.search, navIconsOnly]);

    return (
        <nav className={`navbar${navIconsOnly ? " navbar--nav-icons-only" : ""}`}>
            <div className="navbar-container">
                <div className="navbar-left">
                    <div className="navbar-brand navbar-brand--logo" aria-label="YumeCore">
                        <span className="navbar-brand-mark-wrap" aria-hidden>
                            <img
                                src="/site-logo.png"
                                alt=""
                                className="navbar-brand-mark"
                                decoding="async"
                            />
                        </span>
                        <span className="navbar-brand-text">YumeCore</span>
                    </div>

                    <div className="navbar-main" ref={containerRef}>
                        <div
                            className="navbar-indicator"
                            style={{
                                left: `${indicatorStyle.left}px`,
                                width: `${indicatorStyle.width}px`,
                                opacity: indicatorStyle.width > 0 ? 1 : 0,
                            }}
                        />

                        {navLinks.map((link) => {
                            const isMe = link.path === "/me";
                            const isInbox = link.path === "/inbox";
                            const to = link.path;
                            return (
                                <NavLink
                                    key={link.path}
                                    to={to}
                                    end={link.path === "/"}
                                    title={link.label}
                                    aria-label={navIconsOnly ? link.label : undefined}
                                    className={({ isActive }) =>
                                        `navbar-link ${isMe ? (meNavActive ? "active" : "") : isActive ? "active" : ""}`
                                    }
                                >
                                    {link.icon}
                                    <span className="navbar-link-text">{link.label}</span>
                                    {isInbox && unreadInboxCount > 0 && (
                                        <span className="navbar-notify-dot">
                                            {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
                                        </span>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>
                </div>

                <div className="navbar-grow" aria-hidden />

                {isHome ? (
                    <div
                        className="navbar-home-search"
                        role="search"
                        title="快捷键：Ctrl+K（Mac：⌘K）聚焦；Esc 清空"
                    >
                        <label className="navbar-home-search-label" htmlFor="navbar-home-search-input">
                            搜索作品
                        </label>
                        <div className="navbar-search-field">
                            <svg
                                className="navbar-search-icon"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                aria-hidden
                            >
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                            <input
                                ref={homeSearchInputRef}
                                id="navbar-home-search-input"
                                type="search"
                                className="navbar-search-input"
                                placeholder="标题、标签、作者…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape" && query) {
                                        e.preventDefault();
                                        clearQuery();
                                    }
                                }}
                                autoComplete="off"
                                spellCheck={false}
                                enterKeyHint="search"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    className="navbar-search-clear"
                                    onClick={() => {
                                        clearQuery();
                                        requestAnimationFrame(() => homeSearchInputRef.current?.focus());
                                    }}
                                    aria-label="清除搜索"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {isReady && (
                    <div className="navbar-right">
                        {user ? (
                            <>
                                <NavLink
                                    to="/me"
                                    className={({ isActive }) =>
                                        `navbar-user-wrap${isActive ? " active" : ""}`
                                    }
                                    title={`${user.username} · 我的`}
                                    aria-label={`${user.username}，前往我的`}
                                >
                                    <div className="navbar-user-avatar-ring">
                                        {user.avatarUrl ? (
                                            <img
                                                src={user.avatarUrl}
                                                alt=""
                                                className="navbar-user-avatar"
                                            />
                                        ) : (
                                            <span className="navbar-user-avatar-fallback" aria-hidden>
                                                {user.username.slice(0, 1).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <span className="navbar-user-name" title={user.username}>
                                        {user.username}
                                    </span>
                                    <NavbarIconChevronRight />
                                </NavLink>
                                <button
                                    type="button"
                                    className="navbar-logout-btn"
                                    onClick={logout}
                                    title="退出登录"
                                >
                                    <span className="navbar-inline-icon" aria-hidden>
                                        <NavbarIconLogOut />
                                    </span>
                                    <span className="navbar-logout-label">退出</span>
                                </button>
                            </>
                        ) : (
                            <div className="navbar-auth-links">
                                <NavLink to="/register" className="navbar-auth-btn navbar-auth-btn--ghost">
                                    <span className="navbar-inline-icon" aria-hidden>
                                        <NavbarIconUserPlus />
                                    </span>
                                    <span>注册</span>
                                </NavLink>
                                <NavLink to="/login" className="navbar-auth-btn navbar-auth-btn--primary">
                                    <span className="navbar-inline-icon" aria-hidden>
                                        <NavbarIconLogIn />
                                    </span>
                                    <span>登录</span>
                                </NavLink>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
}
