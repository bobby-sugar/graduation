import { useEffect, useState } from "react";

export interface CommissionRowMeta {
    title: string;
    coverUrl?: string;
    statusLabel: string;
    directionLabel: string;
    priceText: string;
    categoryText: string;
    progressLabel: string;
}

interface Message {
    id: string;
    sender: string;
    senderAvatar?: string;
    lastMessage: string;
    timestamp: string;
    unreadCount: number;
    isPinned?: boolean;
    commissionRow?: CommissionRowMeta;
}

interface MessageListProps {
    messages: Message[];
    selectedId?: string;
    onSelect: (id: string) => void;
    onDelete?: (id: string) => void;
    onTogglePin?: (id: string) => void;
    /** notifications：多行预览；commission：稿件卡片式行 */
    variant?: "default" | "notifications" | "commission";
    title?: string;
}

export default function MessageList({
    messages,
    selectedId,
    onSelect,
    onDelete,
    onTogglePin,
    variant = "default",
    title = "消息",
}: MessageListProps) {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    useEffect(() => {
        const handleDocMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const inMenuArea = target.closest(".message-item-more-wrap");
            if (!inMenuArea) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener("mousedown", handleDocMouseDown);
        return () => {
            document.removeEventListener("mousedown", handleDocMouseDown);
        };
    }, []);

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else if (days === 1) {
            return '昨天';
        } else if (days < 7) {
            return `${days}天前`;
        } else {
            return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        }
    };

    return (
        <div
            className={`message-list${variant === "notifications" ? " message-list--notifications" : ""}${
                variant === "commission" ? " message-list--commission" : ""
            }`}
        >
            <div className="message-list-header">
                <h2 className="message-list-title">{title}</h2>
            </div>
            <div className="message-list-content">
                {messages.length === 0 ? (
                    <div className="message-list-empty">
                        <p>暂无消息</p>
                    </div>
                ) : (
                    messages.map((message) => {
                        const rowClass = `message-item ${selectedId === message.id ? "active" : ""} ${
                            message.unreadCount > 0 ? "unread" : ""
                        }`;
                        const listTime = formatTime(message.timestamp);
                        const listTimeFull = new Date(message.timestamp).toLocaleString("zh-CN");

                        if (variant === "commission") {
                            const label =
                                message.commissionRow?.title?.trim() || message.lastMessage || "稿件";
                            return (
                                <div
                                    key={message.id}
                                    className={`${rowClass} message-item--commission-row`}
                                    onClick={() => onSelect(message.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            onSelect(message.id);
                                        }
                                    }}
                                    aria-label={label}
                                >
                                    <div className="message-item-content message-item-content--commission">
                                        {message.commissionRow ? (
                                            <div className="message-item-commission-card">
                                                <div className="message-item-commission-card-body">
                                                    <div className="message-item-commission-card-cover">
                                                        {message.commissionRow.coverUrl ? (
                                                            <img src={message.commissionRow.coverUrl} alt="" />
                                                        ) : (
                                                            <span className="message-item-commission-card-cover-ph">
                                                                无封面
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="message-item-commission-card-main">
                                                        <div className="message-item-commission-card-title-row">
                                                            <div className="message-item-commission-card-title-left">
                                                                <span className="message-item-commission-card-title">
                                                                    {message.commissionRow.title}
                                                                </span>
                                                                <span className="message-item-commission-card-dir">
                                                                    {message.commissionRow.directionLabel}
                                                                </span>
                                                            </div>
                                                            <div className="message-item-commission-card-title-right">
                                                                {message.unreadCount > 0 && (
                                                                    <span className="message-item-commission-card-unread">
                                                                        {message.unreadCount > 99
                                                                            ? "99+"
                                                                            : message.unreadCount}
                                                                    </span>
                                                                )}
                                                                <time
                                                                    className="message-item-commission-card-time"
                                                                    dateTime={message.timestamp}
                                                                    title={listTimeFull}
                                                                >
                                                                    {listTime}
                                                                </time>
                                                            </div>
                                                        </div>
                                                        <p className="message-item-commission-card-hint">
                                                            {message.commissionRow.progressLabel}
                                                        </p>
                                                        <div className="message-item-commission-card-meta">
                                                            <span className="message-item-commission-card-chip message-item-commission-card-chip--status">
                                                                {message.commissionRow.statusLabel}
                                                            </span>
                                                            <span className="message-item-commission-card-chip">
                                                                {message.commissionRow.categoryText}
                                                            </span>
                                                            <span className="message-item-commission-card-price">
                                                                {message.commissionRow.priceText}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="message-item-commission-card message-item-commission-card--fallback">
                                                <div className="message-item-commission-card-fallback-head">
                                                    <p className="message-item-commission-card-fallback-text">
                                                        {message.lastMessage}
                                                    </p>
                                                    <div className="message-item-commission-card-title-right">
                                                        {message.unreadCount > 0 && (
                                                            <span className="message-item-commission-card-unread">
                                                                {message.unreadCount > 99 ? "99+" : message.unreadCount}
                                                            </span>
                                                        )}
                                                        <time
                                                            className="message-item-commission-card-time"
                                                            dateTime={message.timestamp}
                                                            title={listTimeFull}
                                                        >
                                                            {listTime}
                                                        </time>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={message.id}
                                className={rowClass}
                                onClick={() => onSelect(message.id)}
                            >
                                <div className="message-item-avatar">
                                    {message.senderAvatar ? (
                                        <img src={message.senderAvatar} alt={message.sender} />
                                    ) : (
                                        <div className="message-item-avatar-placeholder">
                                            {message.sender.charAt(0)}
                                        </div>
                                    )}
                                    {variant === "default" && message.unreadCount > 0 && (
                                        <span className="message-item-badge">
                                            {message.unreadCount > 99 ? "99+" : message.unreadCount}
                                        </span>
                                    )}
                                </div>
                                <div className="message-item-content">
                                    <div className="message-item-header">
                                        <span className="message-item-sender">{message.sender}</span>
                                        {variant === "default" && message.isPinned && (
                                            <span className="message-item-pinned-tag">
                                                <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <line x1="12" y1="19" x2="12" y2="5" />
                                                    <polyline points="5 12 12 5 19 12" />
                                                </svg>
                                                置顶
                                            </span>
                                        )}
                                        <span className="message-item-time">{listTime}</span>
                                    </div>
                                    <div className="message-item-body">
                                        <p className="message-item-text">{message.lastMessage}</p>
                                        {(onTogglePin || onDelete) && (
                                            <div className="message-item-more-wrap">
                                                <button
                                                    type="button"
                                                    className="message-item-more-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenMenuId((prev) => (prev === message.id ? null : message.id));
                                                    }}
                                                >
                                                    <span className="message-item-more-dot" />
                                                    <span className="message-item-more-dot" />
                                                    <span className="message-item-more-dot" />
                                                </button>
                                                {openMenuId === message.id && (
                                                    <div
                                                        className="message-item-menu"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {onTogglePin && (
                                                            <button
                                                                type="button"
                                                                className="message-item-menu-item"
                                                                onClick={() => {
                                                                    onTogglePin(message.id);
                                                                    setOpenMenuId(null);
                                                                }}
                                                            >
                                                                {message.isPinned ? "取消置顶" : "置顶对话"}
                                                            </button>
                                                        )}
                                                        {onDelete && (
                                                            <button
                                                                type="button"
                                                                className="message-item-menu-item message-item-menu-danger"
                                                                onClick={() => {
                                                                    onDelete(message.id);
                                                                    setOpenMenuId(null);
                                                                }}
                                                            >
                                                                删除对话
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
