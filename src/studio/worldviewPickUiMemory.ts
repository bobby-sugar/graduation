/**
 * 世界观挑选页 UI 记忆（Tab / 搜索词 / 滚动位置），按「返回路径」分条存储。
 * 解决：pathname 与硬编码不一致、防抖保存用 scrollY=0 覆盖、单 key 互相覆盖等问题。
 */

import { WORLDVIEW_PICK_UI_KEY } from "./ocWorldviewLinks";

export const WORLDVIEW_PICK_UI_STORE_KEY = "oc_web_wv_pick_ui_store_v2";

export type PickUiRouteEntry = {
    tab: "mine" | "search";
    searchQuery: string;
    scrollY: number;
    updatedAt: number;
};

export type PickUiStoreV2 = {
    v: 2;
    /** 最近一次进入挑选页时使用的返回路径（无 navigation.state 时用于回落） */
    lastReturnPath: string;
    routes: Record<string, PickUiRouteEntry>;
};

function emptyStore(): PickUiStoreV2 {
    return { v: 2, lastReturnPath: "/studio", routes: {} };
}

/** 与路由 pathname 对齐：去首尾空白、保证前导 /、去掉末尾多余 /（根路径保留为 /） */
export function normalizePickReturnPath(raw: string | undefined | null): string {
    let s = (raw ?? "").trim();
    if (!s) return "/studio";
    if (!s.startsWith("/")) s = `/${s}`;
    if (s.length > 1) s = s.replace(/\/+$/, "");
    return s;
}

function migrateV1IfNeeded(): PickUiStoreV2 | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(WORLDVIEW_PICK_UI_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as {
            v?: number;
            returnPath?: string;
            tab?: string;
            searchQuery?: string;
            scrollY?: number;
        };
        if (o.v !== 1 || typeof o.returnPath !== "string") return null;
        const path = normalizePickReturnPath(o.returnPath);
        const store = emptyStore();
        store.lastReturnPath = path;
        store.routes[path] = {
            tab: o.tab === "search" ? "search" : "mine",
            searchQuery: typeof o.searchQuery === "string" ? o.searchQuery : "",
            scrollY: typeof o.scrollY === "number" && o.scrollY > 0 ? o.scrollY : 0,
            updatedAt: Date.now(),
        };
        sessionStorage.setItem(WORLDVIEW_PICK_UI_STORE_KEY, JSON.stringify(store));
        sessionStorage.removeItem(WORLDVIEW_PICK_UI_KEY);
        return store;
    } catch {
        return null;
    }
}

export function readPickUiStore(): PickUiStoreV2 {
    if (typeof window === "undefined") return emptyStore();
    try {
        const migrated = migrateV1IfNeeded();
        if (migrated) return migrated;
        const raw = sessionStorage.getItem(WORLDVIEW_PICK_UI_STORE_KEY);
        if (!raw) return emptyStore();
        const o = JSON.parse(raw) as Partial<PickUiStoreV2>;
        if (o.v !== 2 || !o.routes || typeof o.routes !== "object") return emptyStore();
        return {
            v: 2,
            lastReturnPath: normalizePickReturnPath(o.lastReturnPath ?? "/studio"),
            routes: o.routes as Record<string, PickUiRouteEntry>,
        };
    } catch {
        return emptyStore();
    }
}

function writePickUiStore(store: PickUiStoreV2) {
    try {
        sessionStorage.setItem(WORLDVIEW_PICK_UI_STORE_KEY, JSON.stringify(store));
    } catch {
        /* ignore */
    }
}

/** 从 navigation.state 或上次记录解析「返回 / 记忆」用的路径 */
export function resolvePickReturnPath(stateReturnPath: string | undefined | null): string {
    const trimmed = typeof stateReturnPath === "string" ? stateReturnPath.trim() : "";
    if (trimmed) return normalizePickReturnPath(trimmed);
    const store = readPickUiStore();
    return normalizePickReturnPath(store.lastReturnPath);
}

export function readPickUiRoute(pathNorm: string): PickUiRouteEntry | null {
    const store = readPickUiStore();
    const hit = store.routes[pathNorm];
    if (!hit) return null;
    return {
        tab: hit.tab === "search" ? "search" : "mine",
        searchQuery: typeof hit.searchQuery === "string" ? hit.searchQuery : "",
        scrollY: typeof hit.scrollY === "number" && hit.scrollY > 0 ? hit.scrollY : 0,
        updatedAt: typeof hit.updatedAt === "number" ? hit.updatedAt : 0,
    };
}

/**
 * @param keepScrollIfWindowTop 为 true 时：若当前窗口几乎在顶部，则保留该路径下已存的 scrollY（避免防抖保存把滚动记忆冲掉）
 */
export function writePickUiRoute(
    pathNorm: string,
    data: { tab: "mine" | "search"; searchQuery: string; scrollY: number },
    opts?: { keepScrollIfWindowTop?: boolean },
): void {
    const key = normalizePickReturnPath(pathNorm);
    const store = readPickUiStore();
    const prev = store.routes[key];
    let scrollY = Math.max(0, data.scrollY);
    if (opts?.keepScrollIfWindowTop && scrollY < 8 && prev && typeof prev.scrollY === "number" && prev.scrollY >= 8) {
        scrollY = prev.scrollY;
    }
    store.routes[key] = {
        tab: data.tab,
        searchQuery: data.searchQuery,
        scrollY,
        updatedAt: Date.now(),
    };
    store.lastReturnPath = key;
    writePickUiStore(store);
}
