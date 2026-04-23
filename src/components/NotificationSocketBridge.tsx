import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";
import { getSocketBaseUrl } from "../config/api";

/** 收件箱页挂载时为 true：私聊推送由 Inbox 内先 mark-read 再刷新，此处不再派发，避免 NavBar 竞态 */
let inboxPageHandlesChatUnreadRefresh = false;
export function setInboxPageHandlesChatUnreadRefresh(v: boolean) {
    inboxPageHandlesChatUnreadRefresh = v;
}

/** 与全局 Socket 的 `chat:message` 载荷一致；Inbox 通过 DOM 事件复用单连接 */
export const OC_CHAT_MESSAGE_EVENT = "oc-chat-message";
export type OcChatMessageDetail = {
    conversationId: number;
    message: {
        id: number;
        content: string;
        createdAt: string;
        senderId: number;
        sender: string;
        senderAvatar: string | null;
    };
};

/**
 * 全局 Socket：通知、约稿刷新、私聊新消息；派发与轮询相同的事件，供 NavBar / 收件箱等立即刷新。
 */
export default function NotificationSocketBridge() {
    const { token, isReady } = useAuth();

    useEffect(() => {
        if (!isReady || !token) return;
        const socket: Socket = io(getSocketBaseUrl(), {
            path: "/socket.io",
            auth: { token },
            transports: ["websocket", "polling"],
        });
        socket.on("notification:new", () => {
            window.dispatchEvent(new Event("oc-notifications-updated"));
        });
        socket.on("chat:message", (payload: OcChatMessageDetail) => {
            window.dispatchEvent(new CustomEvent<OcChatMessageDetail>(OC_CHAT_MESSAGE_EVENT, { detail: payload }));
            if (!inboxPageHandlesChatUnreadRefresh) {
                window.dispatchEvent(new Event("oc-conversations-updated"));
            }
        });
        socket.on(
            "commission:inbox-refresh",
            (payload: { commissionId?: number } | undefined) => {
                const commissionId =
                    payload &&
                    typeof payload === "object" &&
                    typeof payload.commissionId === "number"
                        ? payload.commissionId
                        : undefined;
                window.dispatchEvent(
                    new CustomEvent<{ commissionId?: number }>("oc-commission-updated", {
                        detail: { commissionId },
                    }),
                );
            },
        );
        return () => {
            socket.disconnect();
        };
    }, [token, isReady]);

    return null;
}
