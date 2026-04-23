/**
 * 从世界观工作站去「选择相关 OC」会离开 /studio，跳转前写入 sessionStorage，返回后恢复。
 */

import type { OcWorldviewLink } from "./ocWorldviewLinks";

const KEY = "oc_web_studio_worldview_restore_v1";

export type WorldviewTimelineSnap = { label: string; value: string };

export type WorldviewStudioSessionPayload = {
    v: 1;
    coverDataUrl: string | null;
    extrasDataUrls: string[];
    formData?: Record<string, unknown>;
    visibility?: "public" | "private";
    worldviewTimeline?: WorldviewTimelineSnap[];
    worldviewRegionLayers?: WorldviewTimelineSnap[];
    worldviewLinkedOcs?: OcWorldviewLink[];
};

export function saveWorldviewStudioBeforeLinkedOcPick(
    coverDataUrl: string | null,
    extrasDataUrls: string[],
    snapshot: {
        formData: Record<string, unknown>;
        visibility: "public" | "private";
        worldviewTimeline: WorldviewTimelineSnap[];
        worldviewRegionLayers: WorldviewTimelineSnap[];
        worldviewLinkedOcs: OcWorldviewLink[];
    },
) {
    try {
        const payload: WorldviewStudioSessionPayload = {
            v: 1,
            coverDataUrl: coverDataUrl && coverDataUrl.length > 0 ? coverDataUrl : null,
            extrasDataUrls: Array.isArray(extrasDataUrls) ? extrasDataUrls.filter(Boolean).slice(0, 12) : [],
            formData: { ...snapshot.formData },
            visibility: snapshot.visibility,
            worldviewTimeline: snapshot.worldviewTimeline.slice(0, 32),
            worldviewRegionLayers: snapshot.worldviewRegionLayers.slice(0, 32),
            worldviewLinkedOcs: snapshot.worldviewLinkedOcs.slice(0, 24),
        };
        sessionStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
        /* quota */
    }
}

export function readWorldviewStudioSession(): WorldviewStudioSessionPayload | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as Partial<WorldviewStudioSessionPayload>;
        if (o.v !== 1) return null;
        const links = Array.isArray(o.worldviewLinkedOcs)
            ? o.worldviewLinkedOcs
                  .map((x) => {
                      if (!x || typeof x !== "object") return null;
                      const r = x as Record<string, unknown>;
                      const artworkId = typeof r.artworkId === "number" && Number.isFinite(r.artworkId) ? r.artworkId : NaN;
                      const title = typeof r.title === "string" ? r.title.trim() : "";
                      if (!Number.isFinite(artworkId) || !title) return null;
                      const id = typeof r.id === "string" && r.id ? r.id : `oc-${artworkId}`;
                      const authorUsername =
                          typeof r.authorUsername === "string" && r.authorUsername.trim()
                              ? r.authorUsername.trim()
                              : "未知作者";
                      const authorId = typeof r.authorId === "number" ? r.authorId : undefined;
                      const imageUrl = typeof r.imageUrl === "string" ? r.imageUrl : (r.imageUrl === null ? null : undefined);
                      return {
                          id,
                          artworkId,
                          title,
                          authorUsername,
                          ...(authorId !== undefined ? { authorId } : {}),
                          ...(imageUrl !== undefined ? { imageUrl } : {}),
                      } as OcWorldviewLink;
                  })
                  .filter((x): x is OcWorldviewLink => x != null)
            : [];
        const tl = Array.isArray(o.worldviewTimeline)
            ? o.worldviewTimeline.filter(
                  (x): x is WorldviewTimelineSnap =>
                      !!x && typeof x === "object" && (typeof x.label === "string" || typeof x.value === "string"),
              )
            : [];
        const rl = Array.isArray(o.worldviewRegionLayers)
            ? o.worldviewRegionLayers.filter(
                  (x): x is WorldviewTimelineSnap =>
                      !!x && typeof x === "object" && (typeof x.label === "string" || typeof x.value === "string"),
              )
            : [];
        return {
            v: 1,
            coverDataUrl: typeof o.coverDataUrl === "string" ? o.coverDataUrl : null,
            extrasDataUrls: Array.isArray(o.extrasDataUrls) ? o.extrasDataUrls.filter((x): x is string => typeof x === "string") : [],
            ...(o.formData && typeof o.formData === "object" && !Array.isArray(o.formData) ? { formData: o.formData as Record<string, unknown> } : {}),
            ...(o.visibility === "private" || o.visibility === "public" ? { visibility: o.visibility } : {}),
            ...(tl.length ? { worldviewTimeline: tl } : {}),
            ...(rl.length ? { worldviewRegionLayers: rl } : {}),
            ...(links.length ? { worldviewLinkedOcs: links } : {}),
        };
    } catch {
        return null;
    }
}

export function clearWorldviewStudioSession() {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}

/** 从挑选页带回 OC 列表时更新快照中的关联，避免清空 session 导致 Strict / 二次挂载时无法再恢复表单与配图 */
export function mergeWorldviewStudioSessionLinkedOcs(links: OcWorldviewLink[]) {
    try {
        const wv = readWorldviewStudioSession();
        if (!wv) return;
        const next: WorldviewStudioSessionPayload = {
            ...wv,
            worldviewLinkedOcs: links.slice(0, 24),
        };
        sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        /* quota */
    }
}

/** 工作站重新挂载时：若存在未消费的世界观快照，应直接进入「世界观」分类并恢复，避免误当作 OC 并清空 session。 */
export function hasWorldviewStudioPendingRestore(): boolean {
    const wv = readWorldviewStudioSession();
    if (!wv) return false;
    return (
        Boolean(wv.coverDataUrl) ||
        wv.extrasDataUrls.length > 0 ||
        (wv.formData != null &&
            typeof wv.formData === "object" &&
            !Array.isArray(wv.formData) &&
            Object.keys(wv.formData).length > 0) ||
        (wv.worldviewTimeline != null && wv.worldviewTimeline.length > 0) ||
        (wv.worldviewRegionLayers != null && wv.worldviewRegionLayers.length > 0) ||
        (wv.worldviewLinkedOcs != null && wv.worldviewLinkedOcs.length > 0)
    );
}
