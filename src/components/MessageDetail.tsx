import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAuthPrompt } from "../contexts/AuthPromptContext";
import { resolveApiUrl } from "../config/api";
import { buildArtworkCloseState } from "../artwork/artworkDetailNavigation";

interface ChatMessage {
    id: string;
    sender: string;
    senderId?: number;
    senderAvatar?: string;
    content: string;
    timestamp: string;
    isOwn?: boolean;
}

interface CommissionCardPayload {
    type: "commission_apply";
    commissionId: number;
    title: string;
    imageUrl?: string | null;
    requesterName?: string;
    publisherName?: string;
}
interface CommissionApplyResultPayload {
    type: "commission_apply_result";
    commissionId: number;
    title: string;
    accepted: boolean;
}
interface CommissionPaymentPayload {
    type: "commission_payment";
    commissionId: number;
    title: string;
}
interface CommissionPaymentCancelledPayload {
    type: "commission_payment_cancelled";
    commissionId: number;
    title: string;
}
interface CommissionDeliveryPayload {
    type: "commission_delivery";
    commissionId: number;
    title: string;
    fileCount?: number;
    files?: Array<{ name?: string; url?: string; relativePath?: string | null }>;
}
interface CommissionAcceptedPayload {
    type: "commission_accepted";
    commissionId: number;
    title: string;
}
interface CommissionReviewRejectedPayload {
    type: "commission_review_rejected";
    commissionId: number;
    title: string;
}
interface CommissionRevisedPayload {
    type: "commission_revised";
    commissionId: number;
    title: string;
}
interface CommissionDeletedNoticePayload {
    type: "commission_deleted";
    commissionId: number;
    title: string;
}
interface CommissionTakenByOtherPayload {
    type: "commission_taken_by_other";
    commissionId: number;
    title: string;
}

interface ChatImagePayload {
    type: "chat_image";
    url: string;
}

const CHAT_IMAGE_PREFIX = "__CHAT_IMAGE__";
const ARTWORK_SHARE_PREFIX = "__ARTWORK_SHARE__";

type ArtworkSharePayload = {
    type: "artwork_share";
    artworkId: number;
    title: string;
    imageUrl?: string | null;
    category?: string | null;
    authorUsername?: string | null;
};

const ARTWORK_SHARE_TITLE_DISPLAY_MAX = 180;

function truncateForDisplay(text: string, maxChars: number): string {
    const arr = Array.from(text);
    if (arr.length <= maxChars) return text;
    return `${arr.slice(0, maxChars).join("")}…`;
}

function MessageArtworkShareCard(props: { share: ArtworkSharePayload; onOpen: (artworkId: number) => void }) {
    const { share, onOpen } = props;
    const artworkId = share.artworkId;
    const [imgBroken, setImgBroken] = useState(false);
    const raw = share.imageUrl;
    const imgSrc =
        typeof raw === "string" && raw.trim()
            ? /^https?:\/\//i.test(raw.trim())
                ? raw.trim()
                : resolveApiUrl(raw.trim())
            : resolveApiUrl(`/uploads/oc_${artworkId}.jpg`);
    const titleShown = truncateForDisplay(share.title, ARTWORK_SHARE_TITLE_DISPLAY_MAX);
    return (
        <div className="message-commission-card-wrap">
            <button
                type="button"
                className="message-commission-card message-commission-card--artwork-share"
                onClick={() => onOpen(artworkId)}
            >
                <div className="message-commission-card-image-wrap">
                    {!imgBroken ? (
                        <img
                            src={imgSrc}
                            alt={share.title}
                            className="message-commission-card-image"
                            onError={() => setImgBroken(true)}
                        />
                    ) : (
                        <div className="message-commission-card-image-placeholder">预览不可用</div>
                    )}
                </div>
                <div className="message-commission-card-title">{titleShown}</div>
                {share.authorUsername ? (
                    <div className="message-artwork-share-author">@{share.authorUsername}</div>
                ) : null}
                <div className="message-commission-card-hint">点击查看作品详情</div>
            </button>
        </div>
    );
}

/** 私信工具栏表情面板（常用） */
const CHAT_TOOLBAR_EMOJIS: string[] = (
    "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😊 😍 🥰 😘 😎 🤔 🙄 😢 😭 😤 😡 🥳 🤝 👍 👎 👏 🙏 💪 🔥 ✨ 💯 ❤️ 🧡 💛 💚 💙 💜 🤍 🖤 💔 💕 ⭐ 🌟 ✔️ ❌ ❓ 💬 🎉 🎁 🍀 ☕ 🍰 🌸 🌙 ☀️ 🌈 🐱 🐶"
)
    .split(/\s+/)
    .filter(Boolean);

function parseChatImage(text: string): ChatImagePayload | null {
    if (!text.startsWith(CHAT_IMAGE_PREFIX)) return null;
    const raw = text.slice(CHAT_IMAGE_PREFIX.length);
    try {
        const payload = JSON.parse(raw) as ChatImagePayload;
        if (
            payload &&
            payload.type === "chat_image" &&
            typeof payload.url === "string" &&
            payload.url.length > 0
        ) {
            return payload;
        }
    } catch {
        return null;
    }
    return null;
}

interface MessageDetailProps {
    messageId: string;
    sender: string;
    otherUserId?: number;
    senderAvatar?: string;
    content?: string;
    timestamp: string;
    chatMessages?: ChatMessage[];
    /** 发送消息到服务器后父组件会 refetch，传入则使用真实接口 */
    onSendMessage?: (content: string) => Promise<void>;
    draft?: string;
    onDraftChange?: (value: string) => void;
    onSent?: () => void;
}

export default function MessageDetail({ 
    messageId, 
    sender, 
    otherUserId,
    senderAvatar,
    content = "",
    timestamp,
    chatMessages,
    onSendMessage,
    draft = "",
    onDraftChange,
    onSent,
}: MessageDetailProps) {
    const [inputValue, setInputValue] = useState('');
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const { user, token } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const navigate = useNavigate();
    const location = useLocation();
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [lastFailedText, setLastFailedText] = useState<string>("");
    const contentRef = useRef<HTMLDivElement | null>(null);
    const shouldAutoScrollRef = useRef(true);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const toolbarAreaRef = useRef<HTMLDivElement | null>(null);

    const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatCenterTimestamp = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString("zh-CN", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const handleSend = async () => {
        const text = inputValue.trim();
        if (!text || isSending) return;
        setIsSending(true);
        setSendError(null);
        if (onSendMessage) {
            try {
                await onSendMessage(text);
                setInputValue("");
                onDraftChange?.("");
                onSent?.();
                setLastFailedText("");
            } catch (e) {
                const msg = e instanceof Error ? e.message : "发送失败，请稍后重试";
                setSendError(msg);
                setLastFailedText(text);
            } finally {
                setIsSending(false);
            }
            return;
        }
        const now = new Date().toISOString();
        const newMsg: ChatMessage = {
            id: `${messageId}-${Date.now()}`,
            sender: "我",
            content: text,
            timestamp: now,
            isOwn: true,
        };
        setLocalMessages((prev) => [...prev, newMsg]);
        setInputValue("");
        onDraftChange?.("");
        onSent?.();
        setLastFailedText("");
        setIsSending(false);
    };

    // 如果是新会话且没有任何消息，不渲染占位消息，避免只显示头像的空气泡。
    const fallbackContent = content.trim();
    const messages = chatMessages?.length
        ? chatMessages
        : (fallbackContent
            ? [{ id: messageId, sender, senderAvatar, content: fallbackContent, timestamp, isOwn: false }]
            : []);

    useEffect(() => {
        setLocalMessages(messages);
    }, [messageId, sender, senderAvatar, content, timestamp, chatMessages]);

    useEffect(() => {
        setInputValue(draft);
    }, [messageId, draft]);

    useEffect(() => {
        shouldAutoScrollRef.current = true;
        requestAnimationFrame(() => {
            const el = contentRef.current;
            if (!el) return;
            el.scrollTop = el.scrollHeight;
        });
    }, [messageId]);

    useEffect(() => {
        if (!shouldAutoScrollRef.current) return;
        requestAnimationFrame(() => {
            const el = contentRef.current;
            if (!el) return;
            el.scrollTop = el.scrollHeight;
        });
    }, [localMessages]);

    useEffect(() => {
        if (!showEmojiPicker) return;
        const onDocMouseDown = (e: MouseEvent) => {
            const root = toolbarAreaRef.current;
            if (!root || root.contains(e.target as Node)) return;
            setShowEmojiPicker(false);
        };
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, [showEmojiPicker]);

    /** 视口或底部输入区高度变化时，若仍在「贴底」模式则保持滚到底，避免气泡被裁切 */
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const syncScroll = () => {
            if (!shouldAutoScrollRef.current) return;
            el.scrollTop = el.scrollHeight;
        };
        const ro = new ResizeObserver(() => {
            requestAnimationFrame(syncScroll);
        });
        ro.observe(el);
        window.addEventListener("resize", syncScroll);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", syncScroll);
        };
    }, [messageId]);

    const parseCommissionCard = (text: string): CommissionCardPayload | null => {
        if (!text.startsWith("__COMMISSION_CARD__")) return null;
        const raw = text.replace("__COMMISSION_CARD__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_apply" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionCardPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseApplyResult = (text: string): CommissionApplyResultPayload | null => {
        if (!text.startsWith("__COMMISSION_APPLY_RESULT__")) return null;
        const raw = text.replace("__COMMISSION_APPLY_RESULT__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_apply_result" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string" &&
                typeof payload.accepted === "boolean"
            ) {
                return payload as CommissionApplyResultPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parsePaymentNotice = (text: string): CommissionPaymentPayload | null => {
        if (!text.startsWith("__COMMISSION_PAYMENT__")) return null;
        const raw = text.replace("__COMMISSION_PAYMENT__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_payment" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionPaymentPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parsePaymentCancelled = (text: string): CommissionPaymentCancelledPayload | null => {
        if (!text.startsWith("__COMMISSION_PAYMENT_CANCELLED__")) return null;
        const raw = text.replace("__COMMISSION_PAYMENT_CANCELLED__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_payment_cancelled" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionPaymentCancelledPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseDelivery = (text: string): CommissionDeliveryPayload | null => {
        if (!text.startsWith("__COMMISSION_DELIVERY__")) return null;
        const raw = text.replace("__COMMISSION_DELIVERY__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_delivery" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionDeliveryPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseReviewRejected = (text: string): CommissionReviewRejectedPayload | null => {
        if (!text.startsWith("__COMMISSION_REVIEW_REJECTED__")) return null;
        const raw = text.replace("__COMMISSION_REVIEW_REJECTED__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_review_rejected" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionReviewRejectedPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseAccepted = (text: string): CommissionAcceptedPayload | null => {
        if (!text.startsWith("__COMMISSION_ACCEPTED__")) return null;
        const raw = text.replace("__COMMISSION_ACCEPTED__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_accepted" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionAcceptedPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseRevised = (text: string): CommissionRevisedPayload | null => {
        if (!text.startsWith("__COMMISSION_REVISED__")) return null;
        const raw = text.replace("__COMMISSION_REVISED__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_revised" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionRevisedPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseDeletedNotice = (text: string): CommissionDeletedNoticePayload | null => {
        if (!text.startsWith("__COMMISSION_DELETED__")) return null;
        const raw = text.replace("__COMMISSION_DELETED__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_deleted" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionDeletedNoticePayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseTakenByOther = (text: string): CommissionTakenByOtherPayload | null => {
        if (!text.startsWith("__COMMISSION_TAKEN_BY_OTHER__")) return null;
        const raw = text.replace("__COMMISSION_TAKEN_BY_OTHER__", "");
        try {
            const payload = JSON.parse(raw);
            if (
                payload &&
                payload.type === "commission_taken_by_other" &&
                typeof payload.commissionId === "number" &&
                typeof payload.title === "string"
            ) {
                return payload as CommissionTakenByOtherPayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const parseArtworkShare = (text: string): ArtworkSharePayload | null => {
        if (!text.startsWith(ARTWORK_SHARE_PREFIX)) return null;
        const raw = text.slice(ARTWORK_SHARE_PREFIX.length);
        try {
            const payload = JSON.parse(raw);
            if (payload && payload.type === "artwork_share" && typeof payload.title === "string") {
                const rawId = payload.artworkId;
                const artworkId =
                    typeof rawId === "number"
                        ? rawId
                        : typeof rawId === "string" && /^\d+$/.test(rawId)
                          ? Number(rawId)
                          : NaN;
                if (!Number.isFinite(artworkId)) return null;
                return { ...payload, artworkId } as ArtworkSharePayload;
            }
        } catch {
            return null;
        }
        return null;
    };

    const openUserProfile = (userId?: number) => {
        if (!userId) return;
        navigate(`/user/${userId}`);
    };

    const openImageFilePicker = () => {
        if (!token) {
            openAuthPrompt({
                title: "登录后发送图片",
                description: "登录后可在私信中发送图片与文件。",
            });
            return;
        }
        setShowEmojiPicker(false);
        fileInputRef.current?.click();
    };

    const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !file.type.startsWith("image/")) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后发送图片",
                description: "登录后可在私信中发送图片与文件。",
            });
            return;
        }
        setUploadingImage(true);
        setSendError(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const detail = errBody?.message
                    ? Array.isArray(errBody.message)
                        ? errBody.message.join("，")
                        : String(errBody.message)
                    : "图片上传失败";
                throw new Error(detail);
            }
            const data = (await res.json()) as { url?: string };
            const rel = typeof data.url === "string" ? data.url : "";
            if (!rel) throw new Error("上传未返回图片地址");
            const fullUrl = resolveApiUrl(rel);
            const payload = `${CHAT_IMAGE_PREFIX}${JSON.stringify({
                type: "chat_image",
                url: fullUrl,
            } satisfies ChatImagePayload)}`;
            if (onSendMessage) {
                setIsSending(true);
                try {
                    await onSendMessage(payload);
                    onSent?.();
                } catch (err) {
                    const msg = err instanceof Error ? err.message : "发送失败，请稍后重试";
                    setSendError(msg);
                } finally {
                    setIsSending(false);
                }
            } else {
                const now = new Date().toISOString();
                const newMsg: ChatMessage = {
                    id: `${messageId}-${Date.now()}`,
                    sender: "我",
                    content: payload,
                    timestamp: now,
                    isOwn: true,
                };
                setLocalMessages((prev) => [...prev, newMsg]);
                onSent?.();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "图片上传失败";
            setSendError(msg);
        } finally {
            setUploadingImage(false);
        }
    };

    const toggleEmojiPicker = () => {
        setShowEmojiPicker((prev) => !prev);
    };

    const insertEmoji = (emoji: string) => {
        const ta = textareaRef.current;
        if (ta) {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const next = inputValue.slice(0, start) + emoji + inputValue.slice(end);
            setInputValue(next);
            onDraftChange?.(next);
            requestAnimationFrame(() => {
                ta.focus();
                const pos = start + emoji.length;
                ta.setSelectionRange(pos, pos);
            });
        } else {
            const next = inputValue + emoji;
            setInputValue(next);
            onDraftChange?.(next);
        }
    };

    return (
        <div className="message-detail">
            <div className="message-detail-header">
                <div className="message-detail-header-info">
                    {senderAvatar ? (
                        <img
                            src={senderAvatar}
                            alt={sender}
                            className={`message-detail-header-avatar ${otherUserId ? "clickable" : ""}`}
                            onClick={() => openUserProfile(otherUserId)}
                        />
                    ) : (
                        <div
                            className={`message-detail-header-avatar-placeholder ${otherUserId ? "clickable" : ""}`}
                            onClick={() => openUserProfile(otherUserId)}
                        >
                            {sender.charAt(0)}
                        </div>
                    )}
                    <div className="message-detail-header-text">
                        <h3
                            className={`message-detail-header-name ${otherUserId ? "clickable" : ""}`}
                            onClick={() => openUserProfile(otherUserId)}
                        >
                            {sender}
                        </h3>
                        <p className="message-detail-header-time">{formatDateTime(timestamp)}</p>
                    </div>
                </div>
            </div>
            <div
                ref={contentRef}
                className="message-detail-content"
                onScroll={(e) => {
                    const el = e.currentTarget;
                    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    shouldAutoScrollRef.current = distanceToBottom < 40;
                }}
            >
                {localMessages.map((msg, index) => {
                    const commissionCard = parseCommissionCard(msg.content);
                    const artworkShare = parseArtworkShare(msg.content);
                    const applyResult = parseApplyResult(msg.content);
                    const paymentNotice = parsePaymentNotice(msg.content);
                    const paymentCancelledNotice = parsePaymentCancelled(msg.content);
                    const deliveryNotice = parseDelivery(msg.content);
                    const acceptedNotice = parseAccepted(msg.content);
                    const reviewRejectedNotice = parseReviewRejected(msg.content);
                    const revisedNotice = parseRevised(msg.content);
                    const deletedNotice = parseDeletedNotice(msg.content);
                    const takenByOtherNotice = parseTakenByOther(msg.content);
                    const chatImage = parseChatImage(msg.content);
                    const bubbleAvatar = msg.isOwn ? user?.avatarUrl ?? null : msg.senderAvatar ?? null;
                    const bubbleAvatarName = msg.isOwn ? (user?.username ?? "我") : msg.sender;
                    const prev = index > 0 ? localMessages[index - 1] : null;
                    const needTimeDivider =
                        !prev ||
                        Math.abs(new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime()) > 5 * 60 * 1000;
                    return (
                        <div key={msg.id}>
                        {needTimeDivider && (
                            <div className="message-time-divider">
                                <span className="message-time-divider-label">
                                    {formatCenterTimestamp(msg.timestamp)}
                                </span>
                            </div>
                        )}
                        <div className={`message-bubble ${msg.isOwn ? 'own' : ''}`}>
                        {bubbleAvatar ? (
                            <img
                                src={bubbleAvatar}
                                alt={bubbleAvatarName}
                                className={`message-bubble-avatar ${!msg.isOwn && msg.senderId ? "clickable" : ""}`}
                                onClick={() => {
                                    if (!msg.isOwn) openUserProfile(msg.senderId);
                                }}
                            />
                        ) : (
                            <div
                                className={`message-bubble-avatar-placeholder ${!msg.isOwn && msg.senderId ? "clickable" : ""}`}
                                onClick={() => {
                                    if (!msg.isOwn) openUserProfile(msg.senderId);
                                }}
                            >
                                {bubbleAvatarName.charAt(0)}
                            </div>
                        )}
                        <div className="message-bubble-content">
                            {msg.content &&
                                !commissionCard &&
                                !artworkShare &&
                                !applyResult &&
                                !paymentNotice &&
                                !paymentCancelledNotice &&
                                !deliveryNotice &&
                                !acceptedNotice &&
                                !reviewRejectedNotice &&
                                !revisedNotice &&
                                !deletedNotice &&
                                !takenByOtherNotice &&
                                !chatImage && (
                                <div className="message-bubble-text">
                                    {msg.content}
                                </div>
                            )}
                            {chatImage && (
                                <a
                                    href={chatImage.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="message-bubble-chat-image-link"
                                >
                                    <img
                                        src={chatImage.url}
                                        alt="聊天图片"
                                        className="message-bubble-chat-image"
                                        loading="lazy"
                                    />
                                </a>
                            )}
                            {paymentNotice && (
                                <div className="message-bubble-text">
                                    {`【已支付通知】\n稿件：${paymentNotice.title}\n对方已完成支付，可进入交付阶段。`}
                                </div>
                            )}
                            {paymentCancelledNotice && (
                                <div className="message-bubble-text">
                                    {`【已取消支付】\n稿件：${paymentCancelledNotice.title}\n支付方已取消支付，稿件已退回「待确认」，绑定保留；发布方需重新确认后，支付方可再次付款。`}
                                </div>
                            )}
                            {applyResult && (
                                <div className="message-bubble-text">
                                    {`【申请处理结果】\n稿件：${applyResult.title}\n${
                                        applyResult.accepted ? "✅ 我接受这份申请，欢迎继续沟通细节。" : "❌ 暂不接受这份申请，感谢你的联系。"
                                    }`}
                                </div>
                            )}
                            {acceptedNotice && (
                                <div className="message-bubble-text">
                                    {`【验收通过】\n稿件：${acceptedNotice.title}\n承接方已验收，稿件已完成。`}
                                </div>
                            )}
                            {reviewRejectedNotice && (
                                <div className="message-bubble-text">
                                    {`【取消验收】\n稿件：${reviewRejectedNotice.title}\n承接方未通过本次验收，稿件已退回「进行中」，你可继续修改并重新提交交付。`}
                                </div>
                            )}
                            {revisedNotice && (
                                <div className="message-bubble-text">
                                    {`【稿件已修改】\n稿件：${revisedNotice.title}\n发起方已更新稿件内容，该稿已退回「新建」状态；此前的申请不再有效，如需请重新申请。`}
                                </div>
                            )}
                            {deletedNotice && (
                                <div className="message-bubble-text">
                                    {`【稿件已删除】\n稿件：${deletedNotice.title}\n发起方已删除该稿件，当前委托已终止。`}
                                </div>
                            )}
                            {takenByOtherNotice && (
                                <div className="message-bubble-text">
                                    {`【稿件已与其他人绑定】\n稿件：${takenByOtherNotice.title}\n发起方已与他人确认该稿件，你的申请不再有效。`}
                                </div>
                            )}
                            {deliveryNotice && (
                                <div className="message-bubble-text">
                                    <div>{`【文件提交】\n稿件：${deliveryNotice.title}`}</div>
                                    {typeof deliveryNotice.fileCount === "number" && (
                                        <div>{`已提交文件数：${deliveryNotice.fileCount}`}</div>
                                    )}
                                    {(deliveryNotice.files ?? []).slice(0, 8).map((file, idx) => (
                                        <div key={`${msg.id}-delivery-${idx}`}>
                                            {file?.url ? (
                                                <a href={file.url} target="_blank" rel="noreferrer">
                                                    {file.relativePath || file.name || `文件${idx + 1}`}
                                                </a>
                                            ) : (
                                                <span>{file.relativePath || file.name || `文件${idx + 1}`}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {commissionCard && (
                                <div className="message-commission-card-wrap">
                                    <button
                                        type="button"
                                        className="message-commission-card"
                                        onClick={() => navigate(`/commissions/${commissionCard.commissionId}`)}
                                    >
                                        <div className="message-commission-card-image-wrap">
                                            {commissionCard.imageUrl ? (
                                                <img
                                                    src={commissionCard.imageUrl}
                                                    alt={commissionCard.title}
                                                    className="message-commission-card-image"
                                                />
                                            ) : (
                                                <div className="message-commission-card-image-placeholder">无封面</div>
                                            )}
                                        </div>
                                        <div className="message-commission-card-title">{commissionCard.title}</div>
                                        <div className="message-commission-card-hint">点击查看稿件详情</div>
                                    </button>
                                </div>
                            )}
                            {artworkShare ? (
                                <MessageArtworkShareCard
                                    share={artworkShare}
                                    onOpen={(artworkId) =>
                                        navigate(`/artwork/${artworkId}`, {
                                            state: buildArtworkCloseState(`${location.pathname}${location.search}`),
                                        })
                                    }
                                />
                            ) : null}
                        </div>
                        </div>
                    </div>
                );
            })}
            </div>
            <div className="message-detail-input">
                <div className="message-detail-toolbar-area" ref={toolbarAreaRef}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="message-detail-file-input-hidden"
                        aria-hidden
                        tabIndex={-1}
                        onChange={handleImageFileChange}
                    />
                    <div className="message-detail-input-toolbar">
                        <button
                            type="button"
                            className="message-detail-input-icon"
                            title="发送图片"
                            aria-label="发送图片"
                            disabled={uploadingImage || isSending}
                            onClick={openImageFilePicker}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="message-detail-input-icon message-detail-input-icon--emoji"
                            title="表情"
                            aria-label="插入表情"
                            aria-expanded={showEmojiPicker}
                            onClick={toggleEmojiPicker}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                            </svg>
                        </button>
                    </div>
                    {showEmojiPicker && (
                        <div className="message-detail-emoji-picker" role="listbox" aria-label="表情">
                            <div className="message-detail-emoji-picker-grid">
                                {CHAT_TOOLBAR_EMOJIS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        className="message-detail-emoji-cell"
                                        onClick={() => insertEmoji(emoji)}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <textarea
                    ref={textareaRef}
                    placeholder="请输入消息内容"
                    className="message-detail-input-field"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        onDraftChange?.(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    rows={2}
                    maxLength={500}
                />
                <div className="message-detail-input-footer">
                    {sendError && (
                        <span className="message-detail-send-error">
                            {sendError}
                            {lastFailedText && (
                                <button
                                    type="button"
                                    className="message-detail-retry-btn"
                                    onClick={() => {
                                        setInputValue(lastFailedText);
                                        onDraftChange?.(lastFailedText);
                                    }}
                                >
                                    重试
                                </button>
                            )}
                        </span>
                    )}
                    <span className="message-detail-input-count">{inputValue.length}/500</span>
                    <button 
                        className="message-detail-input-send"
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isSending}
                    >
                        {isSending ? "发送中..." : "发送"}
                    </button>
                </div>
            </div>
        </div>
    );
}
