import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface ChatMessage {
    id: string;
    sender: string;
    senderId?: number;
    senderAvatar?: string;
    content: string;
    timestamp: string;
    isOwn?: boolean;
    ocArtworkId?: number;
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
    const [showOcPicker, setShowOcPicker] = useState(false);
    const [myArtworks, setMyArtworks] = useState<any[]>([]);
    const { user } = useAuth();
    const navigate = useNavigate();
    const API_BASE_URL = "http://localhost:3000";
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [lastFailedText, setLastFailedText] = useState<string>("");
    const contentRef = useRef<HTMLDivElement | null>(null);
    const shouldAutoScrollRef = useRef(true);

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

    const extractArtworkId = (text: string): number | undefined => {
        const match = text.match(/\/artwork\/(\d+)/);
        if (!match) return undefined;
        const idNum = Number(match[1]);
        return Number.isFinite(idNum) ? idNum : undefined;
    };

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

    const openUserProfile = (userId?: number) => {
        if (!userId) return;
        navigate(`/user/${userId}`);
    };

    const handleOpenOcPicker = async () => {
        if (!user) {
            setShowOcPicker(false);
            return;
        }
        setShowOcPicker((prev) => !prev);
        if (myArtworks.length > 0) return;
        try {
            const res = await fetch(`/api/artworks?authorId=${user.id}`);
            if (!res.ok) return;
            const data = await res.json();
            setMyArtworks(data || []);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
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
                    const artworkId = msg.ocArtworkId ?? extractArtworkId(msg.content);
                    const commissionCard = parseCommissionCard(msg.content);
                    const applyResult = parseApplyResult(msg.content);
                    const paymentNotice = parsePaymentNotice(msg.content);
                    const paymentCancelledNotice = parsePaymentCancelled(msg.content);
                    const deliveryNotice = parseDelivery(msg.content);
                    const acceptedNotice = parseAccepted(msg.content);
                    const reviewRejectedNotice = parseReviewRejected(msg.content);
                    const revisedNotice = parseRevised(msg.content);
                    const deletedNotice = parseDeletedNotice(msg.content);
                    const takenByOtherNotice = parseTakenByOther(msg.content);
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
                                {formatCenterTimestamp(msg.timestamp)}
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
                                !applyResult &&
                                !paymentNotice &&
                                !paymentCancelledNotice &&
                                !deliveryNotice &&
                                !acceptedNotice &&
                                !reviewRejectedNotice &&
                                !revisedNotice &&
                                !deletedNotice &&
                                !takenByOtherNotice && (
                                <div className="message-bubble-text">
                                    {msg.content}
                                </div>
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
                            {artworkId && (
                                <div style={{ marginTop: 8, maxWidth: 260 }}>
                                    <OcPreview artworkId={artworkId} apiBaseUrl={API_BASE_URL} onClick={() => navigate(`/artwork/${artworkId}`)} />
                                </div>
                            )}
                        </div>
                    </div>
                    </div>
                )})}
            </div>
            <div className="message-detail-input">
                <div className="message-detail-input-toolbar">
                    <button className="message-detail-input-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                    </button>
                    <button className="message-detail-input-icon" onClick={handleOpenOcPicker}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <path d="M8 12h8" />
                            <path d="M12 8v8" />
                        </svg>
                    </button>
                </div>
                {showOcPicker && (
                    <div className="message-oc-picker">
                        <div className="message-oc-picker-header">选择要发送的 OC 稿件</div>
                            {myArtworks.length === 0 ? (
                            <div className="message-oc-picker-empty">
                                当前账号暂无可发送的 OC（主页还没有作品）。
                            </div>
                        ) : (
                            <div className="message-oc-picker-list">
                                {myArtworks.map((art: any) => {
                                    const rawUrl: string | null | undefined = art.imageUrl;
                                    let imageUrl = "";
                                    if (typeof rawUrl === "string" && rawUrl.length > 0) {
                                        imageUrl = rawUrl.startsWith("http") ? rawUrl : `${API_BASE_URL}${rawUrl}`;
                                    }
                                    if (!imageUrl) {
                                        imageUrl = `${API_BASE_URL}/uploads/oc_${art.id}.jpg`;
                                    }
                                    return (
                                        <button
                                            key={art.id}
                                            type="button"
                                            className="message-oc-picker-item"
                                            onClick={async () => {
                                                const text = `我分享了一个OC作品：/artwork/${art.id}`;
                                                if (onSendMessage) {
                                                    try {
                                                        await onSendMessage(text);
                                                    } catch (e) {
                                                        // eslint-disable-next-line no-console
                                                        console.error(e);
                                                        return;
                                                    }
                                                } else {
                                                    const now = new Date().toISOString();
                                                    const newMsg: ChatMessage = {
                                                        id: `${messageId}-${Date.now()}`,
                                                        sender: "我",
                                                        content: text,
                                                        timestamp: now,
                                                        isOwn: true,
                                                        ocArtworkId: art.id,
                                                    };
                                                    setLocalMessages((prev) => [...prev, newMsg]);
                                                }
                                                setShowOcPicker(false);
                                            }}
                                        >
                                            <img src={imageUrl} alt={art.title} className="message-oc-picker-thumb" />
                                            <div className="message-oc-picker-text">
                                                <div className="message-oc-picker-title">{art.title}</div>
                                                <div className="message-oc-picker-sub">点击插入链接</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                <textarea
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

interface OcPreviewProps {
    artworkId: number;
    apiBaseUrl: string;
    onClick: () => void;
}

function OcPreview({ artworkId, apiBaseUrl, onClick }: OcPreviewProps) {
    const [title, setTitle] = useState<string>("");
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        const fetchArt = async () => {
            try {
                const res = await fetch(`/api/artworks/${artworkId}`);
                if (!res.ok) return;
                const art = await res.json();
                const rawUrl: string | null | undefined = art.imageUrl;
                let url = "";
                if (typeof rawUrl === "string" && rawUrl.length > 0) {
                    url = rawUrl.startsWith("http") ? rawUrl : `${apiBaseUrl}${rawUrl}`;
                }
                if (!url) {
                    url = `${apiBaseUrl}/uploads/oc_${art.id}.jpg`;
                }
                setTitle(art.title ?? `OC #${art.id}`);
                setImageUrl(url);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
            }
        };
        fetchArt();
    }, [artworkId, apiBaseUrl]);

    if (!imageUrl && !title) return null;

    return (
        <button type="button" className="message-oc-card" onClick={onClick}>
            {imageUrl && (
                <div className="message-oc-card-image-wrap">
                    <img src={imageUrl} alt={title} className="message-oc-card-image" />
                </div>
            )}
            <div className="message-oc-card-title">{title}</div>
            <div className="message-oc-card-hint">点击查看 OC 详情</div>
        </button>
    );
}
