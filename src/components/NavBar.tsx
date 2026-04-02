import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { countCommissionInboxUnreadForBadge } from "../commissionInboxHelpers";
import { useAuth } from "../contexts/AuthContext";

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
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
    const { user, token, logout, isReady } = useAuth();
    const [unreadInboxCount, setUnreadInboxCount] = useState(0);

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

    useEffect(() => {
        const updateIndicator = () => {
            if (!containerRef.current) return;

            const activeLink = containerRef.current.querySelector('.navbar-link.active') as HTMLElement;
            if (activeLink) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const linkRect = activeLink.getBoundingClientRect();
                
                setIndicatorStyle({
                    left: linkRect.left - containerRect.left,
                    width: linkRect.width
                });
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
    }, [location.pathname]);

    return (
        <nav className="navbar">
            <div className="navbar-container" ref={containerRef}>
                {/* 滑动背景指示器 */}
                <div 
                    className="navbar-indicator"
                    style={{
                        left: `${indicatorStyle.left}px`,
                        width: `${indicatorStyle.width}px`
                    }}
                />
                
                {navLinks.map((link) => {
                    const isMe = link.path === "/me";
                    const isInbox = link.path === "/inbox";
                    const to = isMe && !user ? { pathname: "/login", search: "?from=/me" } : link.path;
                    return (
                        <NavLink
                            key={link.path}
                            to={to}
                            end={link.path === "/"}
                            className={({ isActive }) =>
                                `navbar-link ${isMe && !user ? "" : isActive ? "active" : ""}`
                            }
                            >
                            {link.icon}
                            <span>{link.label}</span>
                            {isInbox && unreadInboxCount > 0 && (
                                <span className="navbar-notify-dot">
                                    {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
                                </span>
                            )}
                        </NavLink>
                    );
                })}
                {isReady && (
                    <div className="navbar-right">
                        {user ? (
                            <>
                                <div className="navbar-user-wrap">
                                    {user.avatarUrl && (
                                        <img src={user.avatarUrl} alt={user.username} className="navbar-user-avatar" />
                                    )}
                                    <span className="navbar-user-name">{user.username}</span>
                                </div>
                                <button type="button" className="navbar-logout-btn" onClick={logout}>
                                    退出
                                </button>
                            </>
                        ) : (
                            <div className="navbar-auth-links">
                                <NavLink
                                    to="/register"
                                    className={({ isActive }) => `navbar-link ${isActive ? "active" : ""}`}
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                        <line x1="12" y1="3" x2="12" y2="9"></line>
                                        <line x1="9" y1="6" x2="15" y2="6"></line>
                                    </svg>
                                    <span>注册</span>
                                </NavLink>
                                <NavLink
                                    to="/login"
                                    className={({ isActive }) => `navbar-link ${isActive ? "active" : ""}`}
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                                        <polyline points="10 17 15 12 10 7"></polyline>
                                        <line x1="15" y1="12" x2="3" y2="12"></line>
                                    </svg>
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
