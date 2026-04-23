/**
 * 「相关 OC」挑选页 UI 记忆（与世界观挑选页分库存储，避免共用 /studio 键互相覆盖）
 */

import { normalizePickReturnPath } from "./worldviewPickUiMemory";

const STORE_KEY = "oc_web_wv_linked_oc_pick_ui_store_v1";

export type LinkedOcPickUiRouteEntry = {
    tab: "mine" | "search";
    searchQuery: string;
    scrollY: number;
    updatedAt: number;
};

export type LinkedOcPickUiStoreV1 = {
    v: 1;
    lastReturnPath: string;
    routes: Record<string, LinkedOcPickUiRouteEntry>;
};

function emptyStore(): LinkedOcPickUiStoreV1 {
    return { v: 1, lastReturnPath: "/studio", routes: {} };
}

function readStore(): LinkedOcPickUiStoreV1 {
    if (typeof window === "undefined") return emptyStore();
    try {
        const raw = sessionStorage.getItem(STORE_KEY);
        if (!raw) return emptyStore();
        const o = JSON.parse(raw) as Partial<LinkedOcPickUiStoreV1>;
        if (o.v !== 1 || !o.routes || typeof o.routes !== "object") return emptyStore();
        return {
            v: 1,
            lastReturnPath: normalizePickReturnPath(o.lastReturnPath ?? "/studio"),
            routes: o.routes as Record<string, LinkedOcPickUiRouteEntry>,
        };
    } catch {
        return emptyStore();
    }
}

function writeStore(store: LinkedOcPickUiStoreV1) {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
        /* ignore */
    }
}

export function resolveLinkedOcPickReturnPath(stateReturnPath: string | undefined | null): string {
    const trimmed = typeof stateReturnPath === "string" ? stateReturnPath.trim() : "";
    if (trimmed) return normalizePickReturnPath(trimmed);
    return normalizePickReturnPath(readStore().lastReturnPath);
}

export function readLinkedOcPickUiRoute(pathNorm: string): LinkedOcPickUiRouteEntry | null {
    const store = readStore();
    const hit = store.routes[pathNorm];
    if (!hit) return null;
    return {
        tab: hit.tab === "search" ? "search" : "mine",
        searchQuery: typeof hit.searchQuery === "string" ? hit.searchQuery : "",
        scrollY: typeof hit.scrollY === "number" && hit.scrollY > 0 ? hit.scrollY : 0,
        updatedAt: typeof hit.updatedAt === "number" ? hit.updatedAt : 0,
    };
}

export function writeLinkedOcPickUiRoute(
    pathNorm: string,
    data: { tab: "mine" | "search"; searchQuery: string; scrollY: number },
    opts?: { keepScrollIfWindowTop?: boolean },
): void {
    const key = normalizePickReturnPath(pathNorm);
    const store = readStore();
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
    writeStore(store);
}
