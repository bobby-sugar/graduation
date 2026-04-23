/**
 * 从 OC 工作站去「选择所属世界观」会离开 /studio 导致组件卸载，内存中的表单与图片会丢失。
 * 跳转前把封面/配图 data URL 以及当前表单快照写入 sessionStorage，回到工作站后恢复。
 */

const KEY = "oc_web_studio_oc_images_restore_v1";

export type OcStudioImageSessionPayload = {
    v: 1;
    coverDataUrl: string | null;
    extrasDataUrls: string[];
    /** 离开前去挑选页时的表单字段（返回工作站时恢复） */
    formData?: Record<string, unknown>;
    ocPrivacy?: "public" | "private";
    ocCoverInDetailGallery?: boolean;
};

export type OcStudioSessionFormSnapshot = {
    formData?: Record<string, unknown>;
    ocPrivacy?: "public" | "private";
    ocCoverInDetailGallery?: boolean;
};

export function saveOcStudioImagesBeforeWorldviewPick(
    coverDataUrl: string | null,
    extrasDataUrls: string[],
    formSnapshot?: OcStudioSessionFormSnapshot,
) {
    try {
        const payload: OcStudioImageSessionPayload = {
            v: 1,
            coverDataUrl: coverDataUrl && coverDataUrl.length > 0 ? coverDataUrl : null,
            extrasDataUrls: Array.isArray(extrasDataUrls) ? extrasDataUrls.filter(Boolean).slice(0, 12) : [],
            ...(formSnapshot?.formData && Object.keys(formSnapshot.formData).length > 0
                ? { formData: formSnapshot.formData }
                : {}),
            ...(formSnapshot?.ocPrivacy === "private" || formSnapshot?.ocPrivacy === "public"
                ? { ocPrivacy: formSnapshot.ocPrivacy }
                : {}),
            ...(typeof formSnapshot?.ocCoverInDetailGallery === "boolean"
                ? { ocCoverInDetailGallery: formSnapshot.ocCoverInDetailGallery }
                : {}),
        };
        sessionStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
        /* quota / private mode */
    }
}

export function readOcStudioImageSession(): OcStudioImageSessionPayload | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as Partial<OcStudioImageSessionPayload>;
        if (o.v !== 1) return null;
        return {
            v: 1,
            coverDataUrl: typeof o.coverDataUrl === "string" ? o.coverDataUrl : null,
            extrasDataUrls: Array.isArray(o.extrasDataUrls) ? o.extrasDataUrls.filter((x): x is string => typeof x === "string") : [],
            ...(o.formData && typeof o.formData === "object" && !Array.isArray(o.formData)
                ? { formData: o.formData as Record<string, unknown> }
                : {}),
            ...(o.ocPrivacy === "private" || o.ocPrivacy === "public" ? { ocPrivacy: o.ocPrivacy } : {}),
            ...(typeof o.ocCoverInDetailGallery === "boolean" ? { ocCoverInDetailGallery: o.ocCoverInDetailGallery } : {}),
        };
    } catch {
        return null;
    }
}

export function clearOcStudioImageSession() {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}

function guessMime(dataUrl: string): string {
    const m = /^data:([^;]+);/.exec(dataUrl);
    return m?.[1]?.trim() || "image/jpeg";
}

export async function dataUrlsToOcImageFiles(
    coverDataUrl: string | null,
    extrasDataUrls: string[],
): Promise<{ coverFile: File | null; extraFiles: File[] }> {
    let coverFile: File | null = null;
    if (coverDataUrl) {
        const blob = await fetch(coverDataUrl).then((r) => r.blob());
        const type = blob.type || guessMime(coverDataUrl);
        coverFile = new File([blob], "cover.jpg", { type });
    }
    const extraFiles = await Promise.all(
        extrasDataUrls.map(async (url, i) => {
            const blob = await fetch(url).then((r) => r.blob());
            const type = blob.type || guessMime(url);
            return new File([blob], `extra-${i}.jpg`, { type });
        }),
    );
    return { coverFile, extraFiles };
}
