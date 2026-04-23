/** 作品详情页「取消」：用 replace 回到进入前路由，不依赖 history.back */

export const OC_ARTWORK_CLOSE_TO_KEY = "ocArtworkCloseTo" as const;

export type ArtworkDetailCloseState = {
    [OC_ARTWORK_CLOSE_TO_KEY]: string;
};

export function buildArtworkCloseState(closeToPathWithSearch: string): ArtworkDetailCloseState {
    return { [OC_ARTWORK_CLOSE_TO_KEY]: closeToPathWithSearch };
}

/** 仅允许站内相对路径，防止开放重定向 */
export function resolveArtworkCloseTarget(routerState: unknown, fallback = "/"): string {
    if (routerState == null || typeof routerState !== "object") return fallback;
    const raw = (routerState as Record<string, unknown>)[OC_ARTWORK_CLOSE_TO_KEY];
    if (typeof raw !== "string") return fallback;
    const t = raw.trim();
    if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
    return t;
}

/**
 * 进入「编辑页」时在路由 state 里带上：从编辑里打开作品详情（预览）后，点「取消」应回到哪里。
 * 切勿把当前编辑页 URL 当作作品详情的 ocArtworkCloseTo，否则取消会回到编辑页。
 */
export const OC_RETURN_AFTER_DETAIL_CLOSE_KEY = "ocReturnAfterDetailClose" as const;

export type EditPageEntryState = {
    [OC_RETURN_AFTER_DETAIL_CLOSE_KEY]: string;
};

export function buildEditPageEntryState(returnAfterLeavingDetailPreview: string): EditPageEntryState {
    return { [OC_RETURN_AFTER_DETAIL_CLOSE_KEY]: returnAfterLeavingDetailPreview };
}

/** 编辑页 → 作品详情预览时，作为 buildArtworkCloseState 的目标路径 */
export function resolveReturnAfterDetailPreview(routerState: unknown, fallback = "/me"): string {
    if (routerState == null || typeof routerState !== "object") return fallback;
    const raw = (routerState as Record<string, unknown>)[OC_RETURN_AFTER_DETAIL_CLOSE_KEY];
    if (typeof raw !== "string") return fallback;
    const t = raw.trim();
    if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
    return t;
}
