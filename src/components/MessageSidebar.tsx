interface MessageSidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    onAutoReplyClick?: () => void;
    badgeCountMap?: Record<string, number>;
}

interface MenuSection {
    id: string;
    title: string;
    items: MenuItem[];
    showTitle?: boolean;
}

interface MenuItem {
    id: string;
    label: string;
    icon?: boolean;
}

export default function MessageSidebar({
    activeTab,
    onTabChange,
    onAutoReplyClick,
    badgeCountMap,
}: MessageSidebarProps) {
    const menuSections: MenuSection[] = [
        {
            id: 'messages',
            title: '消息',
            showTitle: true,
            items: [
                { id: 'all-messages', label: '全部' },
                { id: 'pinned-messages', label: '置顶' },
                { id: 'commission-messages', label: '稿件' },
            ],
        },
        {
            id: 'likes-comments',
            title: '点赞&评论',
            showTitle: true,
            items: [
                { id: 'all-likes-comments', label: '全部' },
                { id: 'likes', label: '点赞' },
                { id: 'comments', label: '评论' },
                { id: 'replies', label: '回复我的' },
                { id: 'mentions', label: '@我' },
            ],
        },
        {
            id: 'auto-reply',
            title: '自动回复',
            showTitle: false,
            items: [],
        },
    ];

    const getItemIcon = (itemId: string) => {
        switch (itemId) {
            // 消息分组
            case 'all-messages':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="9" y1="9" x2="15" y2="9"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                );
            case 'pinned-messages':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="19" x2="12" y2="5"/>
                        <polyline points="5 12 12 5 19 12"/>
                    </svg>
                );
            case 'commission-messages':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                );
            // 点赞&评论分组
            case 'all-likes-comments':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="9" y1="9" x2="15" y2="9"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                );
            case 'likes':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                );
            case 'comments':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                );
            case 'replies':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                    </svg>
                );
            case 'mentions':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12h8"/>
                        <path d="M12 8v8"/>
                        <circle cx="12" cy="12" r="2"/>
                    </svg>
                );
            default:
                return null;
        }
    };

    const getSectionIcon = (sectionId: string) => {
        switch (sectionId) {
            case 'auto-reply':
                return (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 15h.01"/>
                        <path d="M11 15h.01"/>
                        <path d="M15 15h.01"/>
                        <path d="M7 19h.01"/>
                        <path d="M11 19h.01"/>
                        <path d="M15 19h.01"/>
                        <path d="M12 3a3 3 0 0 0-3 3v2a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/>
                        <path d="M12 1v2"/>
                    </svg>
                );
            default:
                return null;
        }
    };

    const getBadgeText = (count?: number) => {
        const value = Number(count ?? 0);
        if (!Number.isFinite(value) || value <= 0) return null;
        return value > 99 ? "99+" : String(value);
    };

    return (
        <div className="message-sidebar">
            <div className="message-sidebar-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="message-sidebar-title-icon">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                </svg>
                <span>收件箱</span>
            </div>
            <div className="message-sidebar-content">
                {menuSections.map((section, index) => (
                    <div key={section.id} className="message-sidebar-section">
                        {index > 0 && <div className="message-sidebar-divider"></div>}
                        {section.showTitle && (
                            <div className="message-sidebar-section-title">
                                <span>{section.title}</span>
                            </div>
                        )}
                        {section.items.length > 0 ? (
                            <div className="message-sidebar-section-items">
                                {section.items.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`message-sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                                        onClick={() => onTabChange(item.id)}
                                    >
                                        {activeTab === item.id && <div className="message-sidebar-dot"></div>}
                                        <div className="message-sidebar-item-icon">
                                            {getItemIcon(item.id)}
                                        </div>
                                        <span className="message-sidebar-label">{item.label}</span>
                                        {getBadgeText(badgeCountMap?.[item.id]) && (
                                            <span className="message-sidebar-badge">
                                                {getBadgeText(badgeCountMap?.[item.id])}
                                            </span>
                                        )}
                                        {item.icon && (
                                            <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                className="message-sidebar-icon"
                                            >
                                                <circle cx="12" cy="12" r="3" />
                                                <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
                                            </svg>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div
                                className={`message-sidebar-item ${activeTab === section.id ? 'active' : ''}`}
                                onClick={() => {
                                    if (section.id === "auto-reply" && onAutoReplyClick) {
                                        onAutoReplyClick();
                                        return;
                                    }
                                    onTabChange(section.id);
                                }}
                            >
                                {activeTab === section.id && <div className="message-sidebar-dot"></div>}
                                <div className="message-sidebar-item-icon">
                                    {getSectionIcon(section.id)}
                                </div>
                                <span className="message-sidebar-label">{section.title}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
