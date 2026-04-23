import type { ArtworkKind } from "./apiCategory";
import { normalizeArtworkKind } from "./apiCategory";

/** 嵌在 description 末尾的机器可读块，供首页多模板卡片解析（待后端 metadata 字段后可迁移） */
export const CARD_JSON_MARKER = "<<<OC_WEB_CARD_JSON>>>";

export type ArtworkCardPayloadV1 = {
    v: 1;
    kind: ArtworkKind;
    /** 表情包拼贴等额外图片 URL（与主 imageUrl 同规则，可为相对路径） */
    extraImageUrls?: string[];
    /** OC：为 true 时详情页底部缩略图条不包含主封面，仅展示 extraImageUrls（须另有配图） */
    ocPrimaryImageNotInGallery?: boolean;
    /** OC：工作站「所属世界观」写入的结构化列表（与详情页「所属世界观」卡片一致） */
    ocLinkedWorldviews?: Array<{
        artworkId: number;
        title: string;
        authorUsername?: string;
        authorId?: number;
        /** 关联世界观封面（与主图同规则，可为相对路径） */
        imageUrl?: string | null;
    }>;
    worldview?: {
        /** 一句话设定，列表卡片标题下小字 */
        summaryHint?: string;
        /** 世界观概述正文摘录，列表卡片第三段 */
        overviewHint?: string;
        chips?: string[];
        relatedCharacters?: string[];
        /** 时间线节点，与正文「【时间线】」一致，供列表卡片简展 */
        timeline?: Array<{ label: string; value: string }>;
        /** 区域图层，与正文「【区域图层】」一致 */
        regionLayers?: Array<{ label: string; value: string }>;
        /** 相关 OC：供首页卡片头像条（与工作站挑选结果一致） */
        linkedOcsPreview?: Array<{
            artworkId: number;
            title: string;
            imageUrl?: string | null;
            authorUsername?: string;
        }>;
    };
    emoji?: {
        theme?: string;
        scenario?: string;
        countLabel?: string;
        downloadable?: boolean;
        relatedCharacter?: string;
        usageNotes?: string;
    };
};

export function splitDescriptionAndCardPayload(description: string | null | undefined): {
    prose: string;
    payload: ArtworkCardPayloadV1 | null;
} {
    const full = typeof description === "string" ? description : "";
    const idx = full.lastIndexOf(CARD_JSON_MARKER);
    if (idx < 0) return { prose: full.trim(), payload: null };
    const prose = full.slice(0, idx).trim();
    const jsonPart = full.slice(idx + CARD_JSON_MARKER.length).trim();
    try {
        const parsed = JSON.parse(jsonPart) as ArtworkCardPayloadV1;
        if (parsed && parsed.v === 1 && parsed.kind) {
            parsed.kind = normalizeArtworkKind(parsed.kind);
            return { prose, payload: parsed };
        }
    } catch {
        /* ignore */
    }
    return { prose: full.trim(), payload: null };
}

export function appendCardPayloadToDescription(prose: string | null | undefined, payload: ArtworkCardPayloadV1): string {
    const base = (prose ?? "").trimEnd();
    const tail = `${CARD_JSON_MARKER}\n${JSON.stringify(payload)}`;
    if (!base) return tail;
    return `${base}\n\n${tail}`;
}

/** 列表页用的轻量解析：从正文 + 标签推导展示（无 JSON 时） */
export function extractLineValue(prose: string, label: string): string | undefined {
    const re = new RegExp(`^${label}：(.+)$`, "m");
    const m = prose.match(re);
    return m?.[1]?.trim() || undefined;
}

export function firstLines(text: string, maxLines: number, maxChars: number): string {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let out = lines.slice(0, maxLines).join("\n");
    if (out.length > maxChars) out = out.slice(0, maxChars) + "…";
    return out;
}
