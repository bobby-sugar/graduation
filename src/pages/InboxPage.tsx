import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import MessageSidebar from "../components/MessageSidebar";
import MessageList from "../components/MessageList";
import MessageDetail from "../components/MessageDetail";
import CommissionApplicationDetail from "../components/CommissionApplicationDetail";
import {
    OC_CHAT_MESSAGE_EVENT,
    setInboxPageHandlesChatUnreadRefresh,
    type OcChatMessageDetail,
} from "../components/NotificationSocketBridge";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import {
    COMMISSION_STATUS_LABELS,
    clearInboxCommissionRestore,
    countCommissionInboxUnreadForBadge,
    getCommissionProgressHint,
    peekInboxCommissionRestoreForInbox,
    type CommissionViewerRole,
} from "../commissionInboxHelpers";
import { resolveApiUrl } from "../config/api";

function normalizeCommissionCover(url: string | null | undefined): string | undefined {
    if (!url || typeof url !== "string") return undefined;
    return resolveApiUrl(url);
}

/** 会话列表项（与 MessageList 的 Message 一致） */
export interface ConversationItem {
    id: string;
    sender: string;
    otherUserId?: number;
    senderAvatar?: string;
    lastMessage: string;
    timestamp: string;
    unreadCount: number;
    isPinned?: boolean;
    /** 点赞/评论通知：用于右侧详情与跳转（仅通知分组使用） */
    notificationArtworkId?: number;
    notificationFromUserId?: number;
    notificationType?: "like" | "comment_like" | "comment" | "reply";
}

/** 单条聊天消息（与 MessageDetail 的 ChatMessage 一致） */
export interface ChatMessage {
    id: string;
    sender: string;
    senderId?: number;
    senderAvatar?: string;
    content: string;
    timestamp: string;
    isOwn?: boolean;
}

interface CommissionApplicationItem {
    id: string;
    kind: "incoming" | "payment" | "outgoing-pending";
    viewerRole: CommissionViewerRole;
    applicationMessageId?: number | null;
    conversationId: number;
    createdAt: string;
    applicant: {
        id: number;
        username: string;
        avatarUrl?: string | null;
    };
    commission: {
        id: number;
        title: string;
        category?: string;
        price?: number;
        direction?: "commission" | "offer" | string;
        status?: string;
        paymentStatus?: string;
        previewImageUrl?: string | null;
        description?: string | null;
        submittedAt?: string;
        /** 稿件最后更新时间，与 createdAt 取较晚者用于列表排序与展示时间 */
        updatedAt?: string;
        clientId?: number | null;
        artistId?: number | null;
    };
    handled: boolean;
    canPay?: boolean;
    canSubmit?: boolean;
    canAccept?: boolean;
    publisherDeliveryFiles?: Array<{
        name: string;
        url: string;
        relativePath?: string | null;
    }>;
}

function getAuthHeaders(token: string | null): Record<string, string> {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
}

const INBOX_SIDEBAR_WIDTH_KEY = "oc_inbox_sidebar_width";

function clampInboxSidebarWidth(widthPx: number, viewportWidth: number) {
    const minW = 176;
    const maxW = Math.max(minW + 8, Math.min(400, viewportWidth - 480));
    return Math.min(maxW, Math.max(minW, Math.round(widthPx)));
}

function readStoredInboxSidebarWidth(): number {
    if (typeof window === "undefined") return 240;
    try {
        const raw = localStorage.getItem(INBOX_SIDEBAR_WIDTH_KEY);
        const v = raw ? parseInt(raw, 10) : NaN;
        if (Number.isFinite(v)) return clampInboxSidebarWidth(v, window.innerWidth);
    } catch {
        /* ignore */
    }
    return 240;
}

function previewMessageText(content?: string) {
    const text = (content ?? "").trim();
    if (!text) return "暂无消息";
    if (text.startsWith("__CHAT_IMAGE__")) {
        return "【图片】";
    }
    if (text.startsWith("__COMMISSION_APPLY_RESULT__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_APPLY_RESULT__", ""));
            if (payload?.type === "commission_apply_result" && typeof payload?.title === "string") {
                return `【申请处理结果】${payload.title}`;
            }
        } catch {
            return "【申请处理结果】";
        }
        return "【申请处理结果】";
    }
    if (text.startsWith("__COMMISSION_PAYMENT__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_PAYMENT__", ""));
            if (payload?.type === "commission_payment" && typeof payload?.title === "string") {
                return `【已支付】${payload.title}`;
            }
        } catch {
            return "【已支付通知】";
        }
        return "【已支付通知】";
    }
    if (text.startsWith("__COMMISSION_PAYMENT_CANCELLED__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_PAYMENT_CANCELLED__", ""));
            if (payload?.type === "commission_payment_cancelled" && typeof payload?.title === "string") {
                return `【已取消支付】${payload.title}`;
            }
        } catch {
            return "【已取消支付】";
        }
        return "【已取消支付】";
    }
    if (text.startsWith("__COMMISSION_DELIVERY__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_DELIVERY__", ""));
            if (payload?.type === "commission_delivery" && typeof payload?.title === "string") {
                return `【文件提交】${payload.title}`;
            }
        } catch {
            return "【文件提交】";
        }
        return "【文件提交】";
    }
    if (text.startsWith("__COMMISSION_ACCEPTED__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_ACCEPTED__", ""));
            if (payload?.type === "commission_accepted" && typeof payload?.title === "string") {
                return `【验收通过】${payload.title}`;
            }
        } catch {
            return "【验收通过】";
        }
        return "【验收通过】";
    }
    if (text.startsWith("__COMMISSION_REVIEW_REJECTED__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_REVIEW_REJECTED__", ""));
            if (payload?.type === "commission_review_rejected" && typeof payload?.title === "string") {
                return `【取消验收】${payload.title}`;
            }
        } catch {
            return "【取消验收】";
        }
        return "【取消验收】";
    }
    if (text.startsWith("__COMMISSION_REVISED__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_REVISED__", ""));
            if (payload?.type === "commission_revised" && typeof payload?.title === "string") {
                return `【稿件已修改】${payload.title}`;
            }
        } catch {
            return "【稿件已修改】";
        }
        return "【稿件已修改】";
    }
    if (text.startsWith("__COMMISSION_DELETED__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_DELETED__", ""));
            if (payload?.type === "commission_deleted" && typeof payload?.title === "string") {
                return `【稿件已删除】${payload.title}`;
            }
        } catch {
            return "【稿件已删除】";
        }
        return "【稿件已删除】";
    }
    if (text.startsWith("__COMMISSION_TAKEN_BY_OTHER__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_TAKEN_BY_OTHER__", ""));
            if (payload?.type === "commission_taken_by_other" && typeof payload?.title === "string") {
                return `【稿件已与其他人绑定】${payload.title}`;
            }
        } catch {
            return "【稿件已与其他人绑定】";
        }
        return "【稿件已与其他人绑定】";
    }
    if (text.startsWith("__COMMISSION_CARD__")) {
        try {
            const payload = JSON.parse(text.replace("__COMMISSION_CARD__", ""));
            if (payload?.type === "commission_apply" && typeof payload?.title === "string") {
                return `【接稿申请】${payload.title}`;
            }
        } catch {
            return "【接稿申请】";
        }
        return "【接稿申请】";
    }
    if (text.startsWith("__ARTWORK_SHARE__")) {
        try {
            const payload = JSON.parse(text.replace("__ARTWORK_SHARE__", ""));
            if (payload?.type === "artwork_share" && typeof payload?.title === "string") {
                return `【分享作品】${payload.title}`;
            }
        } catch {
            return "【分享作品】";
        }
        return "【分享作品】";
    }
    return text;
}

export default function InboxPage() {
    const { user, token } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const openedFromProfileRef = useRef(false);

    const [activeTab, setActiveTab] = useState("all-messages");
    const activeTabRef = useRef(activeTab);
    const prevActiveTabRef = useRef<string | null>(null);
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    /** 已移除「@我」侧栏项：旧状态或书签若仍为 mentions，切回全部通知 */
    useEffect(() => {
        if (activeTab === "mentions") {
            setActiveTab("all-likes-comments");
        }
    }, [activeTab]);
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [notifications, setNotifications] = useState<ConversationItem[]>([]);
    /** 中间列表当前高亮项（会话 id 或通知 id） */
    const [selectedId, setSelectedId] = useState<string | undefined>();
    /** 右侧聊天面板显示的会话 id，切到点赞&评论时保持不变 */
    const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>();
    /** 供 fetchConversations 等回调读取当前选中会话，避免因依赖 selectedId 导致切换会话时整表重拉 */
    const selectedConversationIdRef = useRef<string | undefined>(undefined);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [commissionApplications, setCommissionApplications] = useState<CommissionApplicationItem[]>([]);
    const [confirmingCommissionAppId, setConfirmingCommissionAppId] = useState<number | null>(null);
    const [rejectingCommissionAppId, setRejectingCommissionAppId] = useState<number | null>(null);
    const [payingCommissionId, setPayingCommissionId] = useState<number | null>(null);
    const [cancelingCommissionId, setCancelingCommissionId] = useState<number | null>(null);
    const [submittingCommissionId, setSubmittingCommissionId] = useState<number | null>(null);
    const [acceptingCommissionId, setAcceptingCommissionId] = useState<number | null>(null);
    const [rejectingReviewCommissionId, setRejectingReviewCommissionId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem("oc_inbox_pinned_ids");
            if (!raw) return new Set();
            const parsed = JSON.parse(raw) as string[];
            return new Set(Array.isArray(parsed) ? parsed : []);
        } catch {
            return new Set();
        }
    });
    const [drafts, setDrafts] = useState<Record<string, string>>(() => {
        try {
            const raw = localStorage.getItem("oc_inbox_drafts");
            if (!raw) return {};
            const parsed = JSON.parse(raw) as Record<string, string>;
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    });
    const [showAutoReplyModal, setShowAutoReplyModal] = useState(false);
    const [autoReplyText, setAutoReplyText] = useState("感谢关注");
    const [autoReplyLoading, setAutoReplyLoading] = useState(false);
    const [autoReplySaving, setAutoReplySaving] = useState(false);
    const [autoReplyError, setAutoReplyError] = useState<string | null>(null);
    const [notificationBadgeCountMap, setNotificationBadgeCountMap] = useState<Record<string, number>>({
        "all-likes-comments": 0,
        likes: 0,
        comments: 0,
        replies: 0,
    });
    const selectionStorageKey = user?.id ? `oc_inbox_selected_conversation_${user.id}` : null;

    const sidebarWidthRef = useRef(240);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const w = readStoredInboxSidebarWidth();
        sidebarWidthRef.current = w;
        return w;
    });

    useEffect(() => {
        sidebarWidthRef.current = sidebarWidth;
    }, [sidebarWidth]);

    useEffect(() => {
        const onWin = () => {
            setSidebarWidth((w) => clampInboxSidebarWidth(w, window.innerWidth));
        };
        window.addEventListener("resize", onWin);
        return () => window.removeEventListener("resize", onWin);
    }, []);

    const inboxPageStyle = useMemo((): CSSProperties => {
        return { ["--inbox-sidebar-width" as string]: `${sidebarWidth}px` };
    }, [sidebarWidth]);

    const onInboxSidebarResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = sidebarWidthRef.current;
        let latest = startW;
        const onMove = (ev: PointerEvent) => {
            latest = clampInboxSidebarWidth(startW + (ev.clientX - startX), window.innerWidth);
            sidebarWidthRef.current = latest;
            setSidebarWidth(latest);
        };
        const end = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            try {
                localStorage.setItem(INBOX_SIDEBAR_WIDTH_KEY, String(latest));
            } catch {
                /* ignore */
            }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, []);

    useEffect(() => {
        localStorage.setItem("oc_inbox_pinned_ids", JSON.stringify(Array.from(pinnedIds)));
    }, [pinnedIds]);

    useEffect(() => {
        localStorage.setItem("oc_inbox_drafts", JSON.stringify(drafts));
    }, [drafts]);

    useEffect(() => {
        if (!selectionStorageKey) {
            setSelectedId(undefined);
            setSelectedConversationId(undefined);
            return;
        }
        const savedConversationId = sessionStorage.getItem(selectionStorageKey);
        if (savedConversationId) {
            setSelectedConversationId(savedConversationId);
            setSelectedId(savedConversationId);
        } else {
            setSelectedConversationId(undefined);
            setSelectedId(undefined);
        }
    }, [selectionStorageKey]);

    useEffect(() => {
        if (!selectionStorageKey) return;
        if (selectedConversationId) {
            sessionStorage.setItem(selectionStorageKey, selectedConversationId);
        } else {
            sessionStorage.removeItem(selectionStorageKey);
        }
    }, [selectionStorageKey, selectedConversationId]);

    useEffect(() => {
        selectedConversationIdRef.current = selectedConversationId;
    }, [selectedConversationId]);

    // 从稿件详情返回（或浏览器后退）：恢复「稿件消息」与选中行、右侧会话
    useEffect(() => {
        if (!user) return;
        const raw = peekInboxCommissionRestoreForInbox(location.state);
        if (!raw) return;

        setActiveTab("commission-messages");
        setSelectedId(raw.applicationId);
        setSelectedConversationId(raw.conversationId);
        clearInboxCommissionRestore();

        if ((location.state as { inboxCommissionRestore?: unknown })?.inboxCommissionRestore) {
            navigate("/inbox", { replace: true, state: {} });
        }
    }, [user, location.state, location.key, navigate]);

    const fetchConversations = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch("/api/conversations", {
                headers: getAuthHeaders(token),
            });
            if (!res.ok) {
                if (res.status === 401) return;
                throw new Error("获取会话列表失败");
            }
            const data = await res.json();
            const list: ConversationItem[] = (data || []).map((c: any) => ({
                id: String(c.id),
                sender: c.otherUser?.username ?? "未知",
                otherUserId: c.otherUser?.id,
                senderAvatar: c.otherUser?.avatarUrl ?? undefined,
                lastMessage: previewMessageText(c.lastMessage?.content),
                timestamp: c.lastMessage?.createdAt ?? c.createdAt ?? new Date().toISOString(),
                unreadCount: c.unreadCount ?? 0,
                isPinned: pinnedIds.has(String(c.id)),
            }));
            setConversations(list);
            window.dispatchEvent(new Event("oc-conversations-updated"));
            const openCid = selectedConversationIdRef.current;
            if (openCid && !list.some((c) => c.id === openCid)) {
                setSelectedConversationId(undefined);
                setSelectedId(undefined);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [token, pinnedIds]);

    const fetchNotificationBadgeCounts = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/notifications?unreadOnly=true", {
                headers: getAuthHeaders(token),
            });
            if (!res.ok) throw new Error("获取未读通知统计失败");
            const data = await res.json();
            const unreadList = Array.isArray(data) ? data : [];
            const counts = unreadList.reduce(
                (acc: Record<string, number>, n: any) => {
                    if (n?.type === "mention") return acc;
                    acc["all-likes-comments"] += 1;
                    if (n?.type === "like" || n?.type === "comment_like") acc.likes += 1;
                    else if (n?.type === "reply") acc.replies += 1;
                    else acc.comments += 1;
                    return acc;
                },
                {
                    "all-likes-comments": 0,
                    likes: 0,
                    comments: 0,
                    replies: 0,
                },
            );
            setNotificationBadgeCountMap(counts);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }, [token]);

    const fetchCommissionApplications = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/conversations/commission-applications", {
                headers: getAuthHeaders(token),
            });
            if (!res.ok) throw new Error("获取稿件申请失败");
            const data = await res.json();
            const rawList = Array.isArray(data) ? data : [];
            const list: CommissionApplicationItem[] = rawList.map((row: any) => ({
                ...row,
                viewerRole:
                    row.viewerRole === "publisher" || row.viewerRole === "payer"
                        ? row.viewerRole
                        : row.kind === "incoming"
                          ? "publisher"
                          : "payer",
            }));
            setCommissionApplications(list);
            if (activeTab === "commission-messages") {
                const currentIds = new Set(list.map((item) => item.id));
                if (list.length > 0 && (!selectedId || !currentIds.has(selectedId))) {
                    const firstItem = list[0];
                    setSelectedId(firstItem.id);
                    setSelectedConversationId(String(firstItem.conversationId));
                } else if (selectedId && !currentIds.has(selectedId)) {
                    setSelectedId(undefined);
                    setSelectedConversationId(undefined);
                }
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            setCommissionApplications([]);
        }
    }, [activeTab, selectedId, token]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState !== "visible") return;
            if (!token || activeTab !== "commission-messages") return;
            fetchCommissionApplications();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [token, activeTab, fetchCommissionApplications]);

    const openAutoReplyModal = useCallback(async () => {
        if (!token) return;
        setShowAutoReplyModal(true);
        setAutoReplyLoading(true);
        setAutoReplyError(null);
        try {
            const res = await fetch("/api/users/me", {
                headers: getAuthHeaders(token),
            });
            if (!res.ok) throw new Error("读取自动回复失败");
            const data = await res.json();
            const text = (data?.autoReplyMessage ?? "").trim() || "感谢关注";
            setAutoReplyText(text);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            setAutoReplyError("读取自动回复失败，请稍后重试");
            setAutoReplyText("感谢关注");
        } finally {
            setAutoReplyLoading(false);
        }
    }, [token]);

    const saveAutoReply = useCallback(async () => {
        if (!token) return;
        setAutoReplySaving(true);
        setAutoReplyError(null);
        try {
            const payload = autoReplyText.trim() || "感谢关注";
            const res = await fetch("/api/users/me", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeaders(token),
                },
                body: JSON.stringify({ autoReplyMessage: payload }),
            });
            if (!res.ok) throw new Error("保存自动回复失败");
            setShowAutoReplyModal(false);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            setAutoReplyError("保存失败，请稍后重试");
        } finally {
            setAutoReplySaving(false);
        }
    }, [autoReplyText, token]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    useEffect(() => {
        fetchNotificationBadgeCounts();
    }, [fetchNotificationBadgeCounts]);

    useEffect(() => {
        fetchCommissionApplications();
    }, [fetchCommissionApplications]);

    useEffect(() => {
        if (!token) return;
        const timer = window.setInterval(() => {
            fetchCommissionApplications();
        }, 10000);
        const handleFocus = () => {
            fetchCommissionApplications();
        };
        window.addEventListener("focus", handleFocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", handleFocus);
        };
    }, [fetchCommissionApplications, token]);

    // 加载点赞&评论通知列表
    const fetchNotifications = useCallback(
        async (tab: string) => {
            if (!token) return;
            // 仅在 点赞&评论 分组的 tab 下请求通知
            if (!["all-likes-comments", "likes", "comments", "replies"].includes(tab)) {
                setNotifications([]);
                return;
            }
            const params = new URLSearchParams();
            if (tab === "likes") {
                params.set("type", "like");
            } else if (tab === "comments") {
                params.set("type", "comment");
            } else if (tab === "replies") {
                params.set("type", "reply");
            }
            const url = `/api/notifications${params.toString() ? `?${params.toString()}` : ""}`;
            try {
                const res = await fetch(url, {
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) throw new Error("获取通知失败");
                const data = await res.json();
                const list: ConversationItem[] = (data || []).map((n: any) => {
                    const isArtworkLike = n.type === "like";
                    const isCommentLike = n.type === "comment_like";
                    const isReply = n.type === "reply";
                    const fromName = n.fromUser?.username ?? "有人";
                    const artworkTitle = n.artwork?.title ?? "你的作品";
                    const commentContent = n.comment?.content as string | undefined;
                    const commentSnippet =
                        commentContent && commentContent.length > 100
                            ? `${commentContent.slice(0, 100)}…`
                            : commentContent;
                    const lastMessage = isArtworkLike
                        ? `${fromName} 点赞了你的作品「${artworkTitle}」`
                        : isCommentLike
                          ? commentSnippet
                              ? `${fromName} 赞了你在「${artworkTitle}」下的评论：${commentSnippet}`
                              : `${fromName} 赞了你在「${artworkTitle}」下的评论`
                          : isReply
                            ? commentContent
                                ? `${fromName} 在「${artworkTitle}」下回复你：${commentContent}`
                                : `${fromName} 在「${artworkTitle}」下回复了你`
                            : commentContent
                              ? `${fromName} 在「${artworkTitle}」下评论：${commentContent}`
                              : `${fromName} 评论了你的作品「${artworkTitle}」`;
                    const artworkId =
                        typeof n.artwork?.id === "number"
                            ? n.artwork.id
                            : typeof n.artworkId === "number"
                              ? n.artworkId
                              : undefined;
                    const fromUid =
                        typeof n.fromUser?.id === "number"
                            ? n.fromUser.id
                            : typeof n.fromUserId === "number"
                              ? n.fromUserId
                              : undefined;
                    const nt =
                        n.type === "like" || n.type === "comment_like" || n.type === "comment" || n.type === "reply"
                            ? n.type
                            : undefined;
                    return {
                        id: String(n.id),
                        sender: fromName,
                        otherUserId: fromUid,
                        senderAvatar: n.fromUser?.avatarUrl ?? undefined,
                        lastMessage,
                        timestamp: n.createdAt ?? new Date().toISOString(),
                        unreadCount: n.isRead ? 0 : 1,
                        notificationArtworkId: artworkId,
                        notificationFromUserId: fromUid,
                        notificationType: nt,
                    };
                });
                setNotifications(list);
                // 仅将「当前 tab 拉到的这批」未读标为已读，避免在「点赞」里误把评论/回复也全局 read-all 清掉
                const unreadIds: number[] = (data || [])
                    .filter((n: any) => n && !n.isRead && typeof n.id === "number")
                    .map((n: any) => n.id as number);
                if (unreadIds.length > 0) {
                    try {
                        const headers = getAuthHeaders(token);
                        await Promise.all(
                            unreadIds.map((id) =>
                                fetch(`/api/notifications/${id}/read`, {
                                    method: "PATCH",
                                    headers,
                                }),
                            ),
                        );
                        window.dispatchEvent(new Event("oc-notifications-updated"));
                        await fetchNotificationBadgeCounts();
                    } catch {
                        // 忽略标记已读失败
                    }
                }
                // 中间列表高亮：仅在无选中或当前选中已不在列表中时默认第一条；避免每次刷新/标记已读后把用户选中打回第一项
                setSelectedId((prev) => {
                    const ids = new Set(list.map((item) => item.id));
                    if (list.length === 0) return undefined;
                    if (prev && ids.has(prev)) return prev;
                    return list[0].id;
                });
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
                setNotifications([]);
            }
        },
        [token, fetchNotificationBadgeCounts],
    );

    useEffect(() => {
        const handleNotificationsUpdated = () => {
            void fetchNotificationBadgeCounts();
            const tab = activeTabRef.current;
            if (
                ["all-likes-comments", "likes", "comments", "replies"].includes(tab)
            ) {
                void fetchNotifications(tab);
            }
        };
        window.addEventListener("oc-notifications-updated", handleNotificationsUpdated);
        return () => {
            window.removeEventListener("oc-notifications-updated", handleNotificationsUpdated);
        };
    }, [fetchNotificationBadgeCounts, fetchNotifications]);

    useEffect(() => {
        const handleCommissionUpdated = () => {
            if (activeTabRef.current !== "commission-messages") return;
            void fetchCommissionApplications();
        };
        window.addEventListener("oc-commission-updated", handleCommissionUpdated);
        return () => {
            window.removeEventListener("oc-commission-updated", handleCommissionUpdated);
        };
    }, [fetchCommissionApplications]);

    // 切换 tab 时，根据类型拉取对应数据
    useEffect(() => {
        const prev = prevActiveTabRef.current;
        prevActiveTabRef.current = activeTab;

        if (activeTab === "commission-messages") {
            fetchCommissionApplications();
            fetchConversations();
            setNotifications([]);
            return;
        }
        if (activeTab.startsWith("all-messages") || activeTab.startsWith("pinned-messages")) {
            // 从「稿件」且仍选中某私聊时：由拉消息 effect 先 GET messages 标已读再拉列表；无选中会话时仍要在此处拉列表
            if (prev !== "commission-messages" || !selectedConversationId) {
                fetchConversations();
            }
            setNotifications([]);
            return;
        }
        // 点赞&评论分组
        if (["all-likes-comments", "likes", "comments", "replies"].includes(activeTab)) {
            fetchNotifications(activeTab);
        }
    }, [activeTab, fetchCommissionApplications, fetchConversations, fetchNotifications, selectedConversationId]);

    const otherUserIdFromRoute =
        (location.state as { otherUserId?: number })?.otherUserId ??
        (() => {
            const q = searchParams.get("otherUserId");
            if (!q || !/^\d+$/.test(q.trim())) return undefined;
            return parseInt(q.trim(), 10);
        })();

    useEffect(() => {
        if (!token) return;
        if (!otherUserIdFromRoute) {
            openedFromProfileRef.current = false;
            return;
        }
        if (openedFromProfileRef.current) return;
        const num = Number(otherUserIdFromRoute);
        if (!Number.isInteger(num) || num < 1) return;

        openedFromProfileRef.current = true;
        (async () => {
            try {
                const res = await fetch("/api/conversations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
                    body: JSON.stringify({ otherUserId: num }),
                });
                if (!res.ok) {
                    openedFromProfileRef.current = false;
                    return;
                }
                const data = await res.json();
                const newId = String(data.id);
                setSelectedId(newId);
                setSelectedConversationId(newId);
                await fetchConversations();
                navigate("/inbox", { replace: true });
            } catch (e) {
                openedFromProfileRef.current = false;
                // eslint-disable-next-line no-console
                console.error(e);
            }
        })();
    }, [token, otherUserIdFromRoute, navigate, fetchConversations]);

    const fetchMessages = useCallback(
        async (conversationId: string) => {
            if (!token || !conversationId) return;
            try {
                const res = await fetch(`/api/conversations/${conversationId}/messages`, {
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) throw new Error("获取消息失败");
                const data = await res.json();
                const myId = user?.id;
                const list: ChatMessage[] = (data || []).map((m: any) => ({
                    id: String(m.id),
                    sender: m.senderId === myId ? "我" : (m.sender ?? "未知"),
                    senderId: typeof m.senderId === "number" ? m.senderId : undefined,
                    senderAvatar: m.senderAvatar ?? undefined,
                    content: m.content ?? "",
                    timestamp: m.createdAt ?? new Date().toISOString(),
                    isOwn: m.senderId === myId,
                }));
                setMessages(list);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
                setMessages([]);
            }
        },
        [token, user?.id],
    );

    // 右侧聊天：选中会话变化时拉消息；从「稿件」等 tab 切回「全部/置顶」时也要重拉——否则 selectedId 未变不会触发 effect，服务端已读不会更新，红点会卡住
    useEffect(() => {
        if (!selectedConversationId) {
            setMessages([]);
            return;
        }
        if (activeTab === "commission-messages") {
            return;
        }
        void (async () => {
            await fetchMessages(selectedConversationId);
            await fetchConversations();
        })();
    }, [selectedConversationId, fetchMessages, fetchConversations, activeTab]);

    const fetchConversationsRef = useRef(fetchConversations);
    useEffect(() => {
        fetchConversationsRef.current = fetchConversations;
    }, [fetchConversations]);

    const userIdRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        userIdRef.current = user?.id;
    }, [user?.id]);

    useEffect(() => {
        setInboxPageHandlesChatUnreadRefresh(true);
        return () => setInboxPageHandlesChatUnreadRefresh(false);
    }, []);

    useEffect(() => {
        if (!token) return;
        const onChatMessage = (ev: Event) => {
            const ce = ev as CustomEvent<OcChatMessageDetail>;
            const payload = ce.detail;
            if (!payload || typeof payload.conversationId !== "number" || !payload.message) return;
            const cid = String(payload.conversationId);
            const openCid = selectedConversationIdRef.current;
            const markOpenConvReadThenRefresh = async () => {
                const showingDmChat = activeTabRef.current !== "commission-messages";
                if (openCid === cid && showingDmChat) {
                    try {
                        const res = await fetch(`/api/conversations/${cid}/read`, {
                            method: "POST",
                            headers: getAuthHeaders(token),
                        });
                        if (!res.ok) {
                            // eslint-disable-next-line no-console
                            console.warn("标记会话已读失败", res.status);
                        }
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.warn("标记会话已读失败", e);
                    }
                }
                await fetchConversationsRef.current();
            };
            void markOpenConvReadThenRefresh();
            if (openCid !== cid) return;
            if (activeTabRef.current === "commission-messages") return;
            const myId = userIdRef.current;
            if (myId == null) return;
            const m = payload.message;
            setMessages((prev) => {
                const id = String(m.id);
                if (prev.some((x) => x.id === id)) return prev;
                const row: ChatMessage = {
                    id,
                    sender: m.senderId === myId ? "我" : m.sender,
                    senderId: m.senderId,
                    senderAvatar: m.senderAvatar ?? undefined,
                    content: m.content ?? "",
                    timestamp: m.createdAt ?? new Date().toISOString(),
                    isOwn: m.senderId === myId,
                };
                return [...prev, row];
            });
        };
        window.addEventListener(OC_CHAT_MESSAGE_EVENT, onChatMessage as EventListener);
        return () => {
            window.removeEventListener(OC_CHAT_MESSAGE_EVENT, onChatMessage as EventListener);
        };
    }, [token]);

    const handleSendMessage = useCallback(
        async (content: string) => {
            if (!token || !selectedConversationId) return;
            const res = await fetch(`/api/conversations/${selectedConversationId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message ?? "发送失败");
            }
            await fetchMessages(selectedConversationId);
            await fetchConversations();
        },
        [token, selectedConversationId, fetchMessages, fetchConversations],
    );

    const confirmCommissionApplication = useCallback(
        async (applicationId: number) => {
            if (!token) return;
            setConfirmingCommissionAppId(applicationId);
            try {
                const res = await fetch(`/api/conversations/commission-applications/${applicationId}/confirm`, {
                    method: "POST",
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.message ?? "确认失败");
                }
                await fetchCommissionApplications();
                await fetchConversations();
                if (selectedConversationId) {
                    await fetchMessages(selectedConversationId);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "确认失败，请稍后重试";
                alert(msg);
            } finally {
                setConfirmingCommissionAppId(null);
            }
        },
        [token, fetchCommissionApplications, fetchConversations, fetchMessages, selectedConversationId],
    );

    const rejectCommissionApplication = useCallback(
        async (applicationId: number) => {
            if (!token) return;
            setRejectingCommissionAppId(applicationId);
            try {
                const res = await fetch(`/api/conversations/commission-applications/${applicationId}/reject`, {
                    method: "POST",
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.message ?? "拒绝失败");
                }
                await fetchCommissionApplications();
                await fetchConversations();
                if (selectedConversationId) {
                    await fetchMessages(selectedConversationId);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "拒绝失败，请稍后重试";
                alert(msg);
            } finally {
                setRejectingCommissionAppId(null);
            }
        },
        [token, fetchCommissionApplications, fetchConversations, fetchMessages, selectedConversationId],
    );

    const payCommission = useCallback(
        async (commissionId: number) => {
            if (!token) return;
            setPayingCommissionId(commissionId);
            try {
                const res = await fetch(`/api/commissions/${commissionId}/pay`, {
                    method: "POST",
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.message ?? "支付失败");
                }
                await fetchCommissionApplications();
                await fetchConversations();
            } catch (e) {
                const msg = e instanceof Error ? e.message : "支付失败，请稍后重试";
                alert(msg);
            } finally {
                setPayingCommissionId(null);
            }
        },
        [token, fetchCommissionApplications, fetchConversations],
    );

    const cancelCommissionPayment = useCallback(
        async (commissionId: number) => {
            if (!token) return;
            setCancelingCommissionId(commissionId);
            try {
                const res = await fetch(`/api/commissions/${commissionId}/cancel-payment`, {
                    method: "POST",
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.message ?? "取消失败");
                }
                await fetchCommissionApplications();
                await fetchConversations();
                if (selectedConversationId) {
                    await fetchMessages(selectedConversationId);
                }
                window.dispatchEvent(new Event("oc-commission-updated"));
            } catch (e) {
                const msg = e instanceof Error ? e.message : "取消失败，请稍后重试";
                alert(msg);
            } finally {
                setCancelingCommissionId(null);
            }
        },
        [
            token,
            fetchCommissionApplications,
            fetchConversations,
            fetchMessages,
            selectedConversationId,
        ],
    );

    const submitCommissionDelivery = useCallback(
        async (commissionId: number, files: File[], finalize: boolean) => {
            if (!token) return;
            if ((!Array.isArray(files) || files.length === 0) && !finalize) return;
            setSubmittingCommissionId(commissionId);
            try {
                const uploaded: Array<{ name: string; url: string; relativePath?: string }> = [];
                for (const file of files) {
                    const fd = new FormData();
                    fd.append("file", file);
                    const res = await fetch("/api/upload", {
                        method: "POST",
                        headers: getAuthHeaders(token),
                        body: fd,
                    });
                    if (!res.ok) {
                        const uploadErr = await res.json().catch(() => ({}));
                        const detail = uploadErr?.message
                            ? (Array.isArray(uploadErr.message) ? uploadErr.message.join("，") : String(uploadErr.message))
                            : "未知错误";
                        throw new Error(`文件上传失败：${file.name}（${detail}）`);
                    }
                    const data = await res.json();
                    uploaded.push({
                        name: file.name,
                        url: data?.url,
                        relativePath: (file as any).webkitRelativePath || undefined,
                    });
                }

                const deliverRes = await fetch(`/api/commissions/${commissionId}/deliver`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeaders(token),
                    },
                    body: JSON.stringify({ files: uploaded, finalize }),
                });
                if (!deliverRes.ok) {
                    const err = await deliverRes.json().catch(() => ({}));
                    const detail = err?.message
                        ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
                        : "提交文件失败";
                    throw new Error(detail);
                }
                await fetchCommissionApplications();
                await fetchConversations();
                if (selectedConversationId) {
                    await fetchMessages(selectedConversationId);
                }
                window.dispatchEvent(
                    new CustomEvent("oc-commission-updated", { detail: { commissionId } }),
                );
            } catch (e) {
                const msg = e instanceof Error ? e.message : "提交失败，请稍后重试";
                alert(msg);
            } finally {
                setSubmittingCommissionId(null);
            }
        },
        [token, fetchCommissionApplications, fetchConversations, fetchMessages, selectedConversationId],
    );

    const acceptCommissionDelivery = useCallback(
        async (commissionId: number) => {
            if (!token) return;
            setAcceptingCommissionId(commissionId);
            try {
                const res = await fetch(`/api/commissions/${commissionId}/accept`, {
                    method: "POST",
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const detail = err?.message
                        ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
                        : "验收失败";
                    throw new Error(detail);
                }
                await fetchCommissionApplications();
                await fetchConversations();
            } catch (e) {
                const msg = e instanceof Error ? e.message : "验收失败，请稍后重试";
                alert(msg);
            } finally {
                setAcceptingCommissionId(null);
            }
        },
        [token, fetchCommissionApplications, fetchConversations],
    );

    const rejectCommissionReview = useCallback(
        async (commissionId: number) => {
            if (!token) return;
            setRejectingReviewCommissionId(commissionId);
            try {
                const res = await fetch(`/api/commissions/${commissionId}/reject-review`, {
                    method: "POST",
                    headers: getAuthHeaders(token),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const detail = err?.message
                        ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
                        : "操作失败";
                    throw new Error(detail);
                }
                await fetchCommissionApplications();
                await fetchConversations();
            } catch (e) {
                const msg = e instanceof Error ? e.message : "操作失败，请稍后重试";
                alert(msg);
            } finally {
                setRejectingReviewCommissionId(null);
            }
        },
        [token, fetchCommissionApplications, fetchConversations],
    );

    const isLikesTab = ["all-likes-comments", "likes", "comments", "replies"].includes(activeTab);

    const commissionMessageList = commissionApplications.map((item) => {
        const createdMs = new Date(item.createdAt).getTime();
        const updatedMs = item.commission.updatedAt
            ? new Date(item.commission.updatedAt).getTime()
            : createdMs;
        const listActivityMs = Number.isFinite(createdMs) && Number.isFinite(updatedMs)
            ? Math.max(createdMs, updatedMs)
            : (Number.isFinite(createdMs) ? createdMs : Date.now());
        const st = item.commission.status ?? "";
        const statusLabel = COMMISSION_STATUS_LABELS[st] ?? (st || "跟进中");
        const directionLabel = item.commission.direction === "offer" ? "接稿" : "约稿";
        const price = item.commission.price;
        const priceText = typeof price === "number" ? `¥${price.toLocaleString("zh-CN")}` : "—";
        const categoryText = item.commission.category?.trim() || "未分类";
        const partiesBound =
            item.commission.clientId != null && item.commission.artistId != null;
        const unpaid = item.commission.paymentStatus !== "paid";
        return {
            id: item.id,
            sender: item.applicant.username,
            senderAvatar: item.applicant.avatarUrl ?? undefined,
            lastMessage:
                item.kind === "outgoing-pending"
                    ? `待对方确认申请：${item.commission.title}`
                    : item.kind === "incoming"
                    ? `申请稿件：${item.commission.title}${item.handled ? "（已处理）" : "（待处理）"}`
                    : (st === "done"
                        ? `稿件已完成：${item.commission.title}`
                        : item.canAccept
                            ? `待验收：${item.commission.title}（下载交付 / 取消或完成验收）`
                            : item.canSubmit
                                ? `进行中：${item.commission.title}（提交交付 / 完成后点「完成」）`
                            : item.viewerRole === "publisher" &&
                                  st === "pending" &&
                                  partiesBound &&
                                  unpaid &&
                                  !item.handled
                              ? `请重新确认以恢复待支付：${item.commission.title}`
                              : item.viewerRole === "payer" &&
                                  st === "pending" &&
                                  partiesBound &&
                                  unpaid &&
                                  !item.canPay
                                ? `等待发布方重新确认：${item.commission.title}`
                                : item.viewerRole === "publisher" &&
                                    unpaid &&
                                    st === "payment-pending"
                                  ? `等待对方支付：${item.commission.title}`
                                  : `申请通过：${item.commission.title}${item.canPay ? "（待支付）" : "（已支付）"}`),
            timestamp: new Date(listActivityMs).toISOString(),
            unreadCount:
                item.kind === "outgoing-pending"
                    ? 0
                    : item.kind === "incoming"
                      ? (item.handled ? 0 : 1)
                      : ((item.canPay || item.canSubmit || item.canAccept ||
                          (item.kind === "payment" &&
                              item.viewerRole === "publisher" &&
                              st === "pending" &&
                              !item.handled))
                          ? 1
                          : 0),
            commissionRow: {
                title: item.commission.title,
                coverUrl: normalizeCommissionCover(item.commission.previewImageUrl),
                statusLabel,
                directionLabel,
                priceText,
                categoryText,
                progressLabel: getCommissionProgressHint(item),
            },
        };
    });
    const applicationConversationIdMap = new Map(
        commissionApplications.map((item) => [item.id, String(item.conversationId)]),
    );
    const baseList = isLikesTab ? notifications : (activeTab === "commission-messages" ? commissionMessageList : conversations);

    const listTimeMs = (m: { timestamp: string }) => {
        const t = new Date(m.timestamp).getTime();
        return Number.isFinite(t) ? t : 0;
    };
    const byTimeDesc = (a: { timestamp: string }, b: { timestamp: string }) =>
        listTimeMs(b) - listTimeMs(a);

    const currentList = (() => {
        let list = [...baseList];
        if (!isLikesTab && activeTab === "pinned-messages") {
            list = list.filter((m) => pinnedIds.has(m.id));
        }
        if (isLikesTab || activeTab === "commission-messages") {
            return list.sort(byTimeDesc);
        }
        return list.sort((a, b) => {
            const aPinned = pinnedIds.has(a.id);
            const bPinned = pinnedIds.has(b.id);
            if (aPinned !== bPinned) return aPinned ? -1 : 1;
            return byTimeDesc(a, b);
        });
    })();
    const sidebarTabLabelMap: Record<string, string> = {
        "all-messages": "全部消息",
        "pinned-messages": "置顶消息",
        "commission-messages": "稿件消息",
        "all-likes-comments": "全部通知",
        likes: "点赞通知",
        comments: "评论通知",
        replies: "回复我的",
    };
    /** 「全部」列表为全部会话，红点 = 所有私聊会话未读之和（与底栏会话未读一致） */
    const allMessagesUnread = conversations.reduce(
        (sum, conv) => sum + (conv.unreadCount ?? 0),
        0,
    );
    const pinnedUnreadMessages = conversations.reduce((sum, conv) => {
        if (!pinnedIds.has(conv.id)) return sum;
        return sum + (conv.unreadCount ?? 0);
    }, 0);
    const commissionUnreadMessages = countCommissionInboxUnreadForBadge(commissionApplications);
    const messageBadgeCountMap: Record<string, number> = {
        "all-messages": allMessagesUnread,
        "pinned-messages": pinnedUnreadMessages,
        "commission-messages": commissionUnreadMessages,
    };
    /** 含 all-likes-comments，「点赞&评论 → 全部」才显示未读红点 */
    const sidebarBadgeCountMap: Record<string, number> = {
        ...messageBadgeCountMap,
        ...notificationBadgeCountMap,
    };
    const listTitle = sidebarTabLabelMap[activeTab] ?? "消息";
    // 右侧聊天用的会话（始终从 conversations 取）
    const selectedConvForChat = selectedConversationId
        ? conversations.find((c) => c.id === selectedConversationId)
        : undefined;
    const selectedCommissionApplication =
        activeTab === "commission-messages" && !!selectedId
            ? commissionApplications.find((item) => item.id === selectedId)
            : undefined;
    const lastTimestamp = messages.length > 0
        ? messages[messages.length - 1].timestamp
        : selectedConvForChat?.timestamp ?? new Date().toISOString();

    if (!user) {
        return (
            <div className="oc-auth-gate-page">
                <div className="oc-auth-gate-page__inner">
                    <AuthPromptPanel
                        title="登录后查看消息"
                        description="登录后可查看私信、约稿申请与系统通知，与其他用户实时沟通。"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="inbox-page" style={inboxPageStyle}>
            <div className="inbox-page-layout">
                <MessageSidebar
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onAutoReplyClick={openAutoReplyModal}
                    badgeCountMap={sidebarBadgeCountMap}
                />
                <div
                    className="inbox-sidebar-resizer"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="拖拽调整左侧收件箱栏宽度"
                    tabIndex={0}
                    onPointerDown={onInboxSidebarResizeStart}
                />
                <MessageList
                    messages={currentList}
                    selectedId={isLikesTab || activeTab === "commission-messages" ? selectedId : selectedConversationId}
                    variant={isLikesTab ? "notifications" : activeTab === "commission-messages" ? "commission" : "default"}
                    title={listTitle}
                    onSelect={(id) => {
                        setSelectedId(id);
                        // 只在「消息」分组下选中项才是会话，才更新右侧聊天
                        if (!isLikesTab) {
                            if (activeTab === "commission-messages") {
                                const conversationId = applicationConversationIdMap.get(id);
                                if (conversationId) {
                                    setSelectedConversationId(conversationId);
                                }
                                return;
                            }
                            setSelectedConversationId(id);
                        }
                    }}
                    onDelete={isLikesTab || activeTab === "commission-messages" ? undefined : async (id) => {
                        if (!token) return;
                        const ok = window.confirm("确定要删除当前会话吗？此操作不可恢复。");
                        if (!ok) return;
                        try {
                            const res = await fetch(`/api/conversations/${id}`, {
                                method: "DELETE",
                                headers: getAuthHeaders(token),
                            });
                            if (!res.ok) {
                                // eslint-disable-next-line no-console
                                console.error("删除会话失败", await res.text());
                                return;
                            }
                            // 从列表中移除并清空右侧
                            setConversations((prev) => prev.filter((c) => c.id !== id));
                            setPinnedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                            });
                            if (selectedId === id) setSelectedId(undefined);
                            if (selectedConversationId === id) {
                                setSelectedConversationId(undefined);
                                setMessages([]);
                            }
                        } catch (e) {
                            // eslint-disable-next-line no-console
                            console.error(e);
                        }
                    }}
                    onTogglePin={isLikesTab || activeTab === "commission-messages" ? undefined : (id) => {
                        setPinnedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(id)) {
                                next.delete(id);
                            } else {
                                next.add(id);
                            }
                            return next;
                        });
                        setConversations((prev) =>
                            prev.map((c) => (c.id === id ? { ...c, isPinned: !pinnedIds.has(id) } : c)),
                        );
                    }}
                />
                {activeTab === "commission-messages" ? (
                    <CommissionApplicationDetail
                        application={selectedCommissionApplication}
                        token={token}
                        onPublisherDeliveryChanged={async () => {
                            await fetchCommissionApplications();
                            if (selectedConversationId) {
                                await fetchMessages(selectedConversationId);
                            }
                        }}
                        onConfirm={confirmCommissionApplication}
                        onReject={rejectCommissionApplication}
                        onPay={payCommission}
                        onCancelPay={cancelCommissionPayment}
                        onSubmitDelivery={submitCommissionDelivery}
                        onAcceptDelivery={acceptCommissionDelivery}
                        onRejectReview={rejectCommissionReview}
                        confirmingId={confirmingCommissionAppId}
                        rejectingId={rejectingCommissionAppId}
                        payingCommissionId={payingCommissionId}
                        cancelingCommissionId={cancelingCommissionId}
                        submittingCommissionId={submittingCommissionId}
                        acceptingCommissionId={acceptingCommissionId}
                        rejectingReviewCommissionId={rejectingReviewCommissionId}
                    />
                ) : selectedConvForChat && selectedConversationId ? (
                    <MessageDetail
                        messageId={selectedConversationId}
                        sender={selectedConvForChat.sender}
                        otherUserId={selectedConvForChat.otherUserId}
                        senderAvatar={selectedConvForChat.senderAvatar}
                        timestamp={lastTimestamp}
                        chatMessages={messages}
                        draft={drafts[selectedConversationId] ?? ""}
                        onDraftChange={(next) => {
                            setDrafts((prev) => ({
                                ...prev,
                                [selectedConversationId]: next,
                            }));
                        }}
                        onSendMessage={handleSendMessage}
                        onSent={() => {
                            setDrafts((prev) => {
                                const next = { ...prev };
                                delete next[selectedConversationId];
                                return next;
                            });
                        }}
                    />
                ) : isLikesTab ? null : (
                    <div className="message-detail-empty">
                        {loading ? (
                            <p>加载中…</p>
                        ) : (
                            <>
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <p>暂无会话，选择左侧开始聊天</p>
                            </>
                        )}
                    </div>
                )}
            </div>
            {showAutoReplyModal && (
                <div
                    className="auto-reply-modal-overlay"
                    onClick={() => {
                        if (autoReplySaving) return;
                        setShowAutoReplyModal(false);
                        setAutoReplyError(null);
                    }}
                >
                    <div className="auto-reply-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="auto-reply-modal-header">
                            <h3>自动回复</h3>
                            <button
                                type="button"
                                className="auto-reply-modal-close"
                                onClick={() => {
                                    if (autoReplySaving) return;
                                    setShowAutoReplyModal(false);
                                    setAutoReplyError(null);
                                }}
                                aria-label="关闭"
                            >
                                ×
                            </button>
                        </div>
                        <p className="auto-reply-modal-tip">当其他用户第一次关注你时，将自动发送这条消息。</p>
                        {autoReplyLoading ? (
                            <p className="auto-reply-modal-loading">加载中…</p>
                        ) : (
                            <textarea
                                className="auto-reply-modal-textarea"
                                value={autoReplyText}
                                maxLength={120}
                                onChange={(e) => setAutoReplyText(e.target.value)}
                                placeholder="感谢关注"
                            />
                        )}
                        <div className="auto-reply-modal-footer">
                            <span className="auto-reply-modal-count">{autoReplyText.length}/120</span>
                            <button
                                type="button"
                                className="auto-reply-modal-save"
                                disabled={autoReplyLoading || autoReplySaving}
                                onClick={saveAutoReply}
                            >
                                {autoReplySaving ? "保存中..." : "保存"}
                            </button>
                        </div>
                        {autoReplyError && <p className="auto-reply-modal-error">{autoReplyError}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}
