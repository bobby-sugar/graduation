import { normalizeArtworkKind } from "../artwork/apiCategory";
import {
    appendCardPayloadToDescription,
    firstLines,
    type ArtworkCardPayloadV1,
} from "../artwork/cardPayload";

/** 工作站中文分类 → 接口与首页筛选使用的 category 小写 slug */
export const STUDIO_UI_TO_API_CATEGORY: Record<string, string> = {
    OC: "oc",
    世界观: "worldview",
    表情包: "emoji",
};

export function studioCategoryToApi(uiCategory: string): string {
    return STUDIO_UI_TO_API_CATEGORY[uiCategory] ?? "oc";
}

/** 世界观/表情包「私有」曾仅追加到 description；现已写入 ocPrivacy，加载时去掉尾部旧标记 */
export const STUDIO_LEGACY_PRIVACY_DESCRIPTION_MARKER = "【隐私设置】私有（前端标记，后端待接入）";

export function stripLegacyStudioPrivacyDescriptionMarker(text: string): string {
    const m = STUDIO_LEGACY_PRIVACY_DESCRIPTION_MARKER;
    const idx = text.lastIndexOf(m);
    if (idx === -1) return text;
    return text.slice(0, idx).replace(/\s+$/, "");
}

function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

/** 工作站「时间线 / 区域图层」等键值行编辑值 → 写入正文 / 卡片 JSON */
function normalizeWorldviewKvRowsInput(raw: unknown): { label: string; value: string }[] {
    if (!Array.isArray(raw)) return [];
    const out: { label: string; value: string }[] = [];
    for (const x of raw) {
        if (!x || typeof x !== "object") continue;
        const o = x as Record<string, unknown>;
        const label = str(o.label);
        const value = str(o.value);
        if (!label && !value) continue;
        out.push({ label, value });
    }
    return out.slice(0, 32);
}

/** 保留作者名与封面，供卡片 JSON 与详情页展示（旧版曾只保留 id+title 导致保存后丢失） */
function normalizeWorldviewLinkedOcsFromForm(raw: unknown): Array<{
    title: string;
    artworkId: number;
    authorUsername?: string;
    imageUrl?: string | null;
}> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{
        title: string;
        artworkId: number;
        authorUsername?: string;
        imageUrl?: string | null;
    }> = [];
    for (const x of raw) {
        if (!x || typeof x !== "object") continue;
        const o = x as Record<string, unknown>;
        const id = typeof o.artworkId === "number" && Number.isFinite(o.artworkId) ? o.artworkId : Number.NaN;
        const title = str(o.title);
        if (!Number.isFinite(id) || !title) continue;
        const au = str(o.authorUsername);
        const imgRaw = o.imageUrl;
        const imageUrl =
            typeof imgRaw === "string" ? (imgRaw.trim() ? imgRaw.trim() : null) : imgRaw === null ? null : undefined;
        out.push({
            artworkId: id,
            title,
            ...(au ? { authorUsername: au } : {}),
            ...(imageUrl !== undefined ? { imageUrl } : {}),
        });
    }
    return out.slice(0, 24);
}

function splitListInput(v: unknown): string[] {
    return str(v)
        .split(/[\n,，、/|；;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12);
}

/** 提交作品标题（与 CreateForm 字段名一致） */
export function getStudioArtworkTitle(uiCategory: string, formData: Record<string, unknown>): string {
    const d = formData as Record<string, unknown>;
    if (uiCategory === "OC") return str(d.name) || "未命名 OC";
    return str(d.name) || str(d.title) || "未命名作品";
}

export function getStudioArtworkTags(formData: Record<string, unknown>): string | null {
    const t = str((formData as Record<string, unknown>).tags);
    return t || null;
}

/**
 * 后端 CreateArtwork 仅有 description 长文本，扩展字段序列化进正文以便详情页展示。
 */
export function buildStudioDescription(uiCategory: string, formData: Record<string, unknown>): string | null {
    const d = formData as Record<string, unknown>;
    const meta: string[] = [];

    const push = (label: string, val: unknown) => {
        const s = str(val);
        if (s) meta.push(`${label}：${s}`);
    };

    switch (uiCategory) {
        case "OC": {
            push("性别", d.gender);
            push("年龄", d.age);
            push("种族", d.race);
            push("职业", d.occupation);
            const base = str(d.tagline);
            const extra = meta.join("\n").trim();
            if (base && extra) return `${base}\n\n【档案补充】\n${extra}`;
            if (base) return base;
            return extra || null;
        }
        case "世界观": {
            push("一句话设定", d.tagline);
            push("类型", d.type);
            push("时代/背景", d.era);
            push("地域/舞台", d.regions);
            push("阵营/势力", d.factions);
            push("核心冲突", d.coreConflict);
            push("核心主题", d.keyTheme);
            const rules = str(d.worldRules);
            if (rules) meta.push(`世界规则：\n${rules}`);
            push("关联 OC", d.relatedCharacters);
            const base = str(d.description);
            const extra = meta.join("\n").trim();
            const timeline = normalizeWorldviewKvRowsInput(d.worldviewTimeline);
            const regionLayers = normalizeWorldviewKvRowsInput(d.worldviewRegionLayers);

            let body: string | null;
            if (base && extra) body = `${base}\n\n【设定信息】\n${extra}`;
            else if (base) body = base;
            else if (extra) body = `【设定信息】\n${extra}`;
            else body = null;

            const serializeKvBlock = (rows: { label: string; value: string }[], defaultLabel: string) =>
                rows
                    .map((row) => {
                        const lb = row.label.trim() || defaultLabel;
                        const val = row.value.trim();
                        if (!val) return `${lb}：`;
                        const lines = val.split(/\n/);
                        if (lines.length === 1) return `${lb}：${val}`;
                        return `${lb}：${lines[0]}\n${lines.slice(1).join("\n")}`;
                    })
                    .join("\n\n");

            if (timeline.length > 0) {
                const tlBlock = `【时间线】\n${serializeKvBlock(timeline, "节点")}`;
                body = body ? `${body}\n\n${tlBlock}` : tlBlock;
            }
            if (regionLayers.length > 0) {
                const rlBlock = `【区域图层】\n${serializeKvBlock(regionLayers, "图层")}`;
                body = body ? `${body}\n\n${rlBlock}` : rlBlock;
            }
            return body;
        }
        case "表情包": {
            push("一句话介绍", d.tagline);
            push("允许下载", d.allowDownload);
            const base = str(d.description);
            const extra = meta.join("\n").trim();
            // usageNotes 仅写入卡片 JSON（emoji.usageNotes），不再写入正文【使用说明】，避免详情页与 JSON 各渲染一遍
            if (base && extra) return `${base}\n\n【表情包信息】\n${extra}`;
            if (base) return base;
            if (extra) return `【表情包信息】\n${extra}`;
            return null;
        }
        default:
            return str(d.description) || null;
    }
}

function yn(v: unknown): boolean | undefined {
    const s = str(v);
    if (s === "是" || s === "yes" || s === "true" || s === "1") return true;
    if (s === "否" || s === "no" || s === "false" || s === "0") return false;
    return undefined;
}

/**
 * 从表单与可选多图 URL 生成首页卡片用 payload，写入 description 尾部 JSON 块。
 */
export function buildArtworkCardPayload(
    uiCategory: string,
    formData: Record<string, unknown>,
    opts?: { extraImageUrls?: string[]; ocPrimaryImageNotInGallery?: boolean },
): ArtworkCardPayloadV1 {
    const d = formData;
    const apiSlug = studioCategoryToApi(uiCategory);
    const kind = normalizeArtworkKind(apiSlug);
    const extras = (opts?.extraImageUrls ?? []).map((u) => u.trim()).filter(Boolean);

    switch (uiCategory) {
        case "世界观": {
            const chips = [str(d.type), str(d.era), str(d.regions), str(d.factions), str(d.keyTheme)]
                .filter(Boolean)
                .slice(0, 3);
            const desc = str(d.description);
            const tag = str(d.tagline);
            const timeline = normalizeWorldviewKvRowsInput(d.worldviewTimeline).slice(0, 6);
            const regionLayers = normalizeWorldviewKvRowsInput(d.worldviewRegionLayers).slice(0, 6);
            const linkedFromPicker = normalizeWorldviewLinkedOcsFromForm(d.worldviewLinkedOcs);
            const relatedCharacters =
                linkedFromPicker.length > 0
                    ? linkedFromPicker.map((x) => x.title)
                    : splitListInput(d.relatedCharacters);
            const linkedOcsPreview =
                linkedFromPicker.length > 0
                    ? linkedFromPicker.slice(0, 8).map((x) => ({
                          artworkId: x.artworkId,
                          title: x.title,
                          ...(x.authorUsername != null && x.authorUsername !== ""
                              ? { authorUsername: x.authorUsername }
                              : {}),
                          ...(x.imageUrl != null && x.imageUrl !== ""
                              ? { imageUrl: x.imageUrl }
                              : {}),
                      }))
                    : undefined;
            return {
                v: 1,
                kind,
                extraImageUrls: extras.length ? extras : undefined,
                worldview: {
                    summaryHint: tag || undefined,
                    overviewHint: desc ? firstLines(desc, 3, 220) : undefined,
                    chips: chips.length ? chips : undefined,
                    relatedCharacters: relatedCharacters.length ? relatedCharacters : undefined,
                    ...(linkedOcsPreview?.length ? { linkedOcsPreview } : {}),
                    ...(timeline.length ? { timeline } : {}),
                    ...(regionLayers.length ? { regionLayers } : {}),
                },
            };
        }
        case "表情包":
            return {
                v: 1,
                kind,
                extraImageUrls: extras.length ? extras : undefined,
                emoji: {
                    downloadable: yn(d.allowDownload),
                    usageNotes: str(d.usageNotes),
                },
            };
        case "OC": {
            const rawLinks = d.ocWorldviewLinks as unknown;
            const ocLinkedWorldviews = Array.isArray(rawLinks)
                ? (rawLinks as {
                      artworkId?: unknown;
                      title?: unknown;
                      authorUsername?: unknown;
                      authorId?: unknown;
                      imageUrl?: unknown;
                  }[])
                      .map((x) => {
                          const img = str(x?.imageUrl);
                          return {
                              artworkId: Number(x?.artworkId),
                              title: str(x?.title),
                              authorUsername: str(x?.authorUsername) || undefined,
                              authorId: typeof x?.authorId === "number" ? x.authorId : undefined,
                              ...(img ? { imageUrl: img } : {}),
                          };
                      })
                      .filter((x) => Number.isFinite(x.artworkId) && x.title)
                      .slice(0, 8)
                : [];
            return {
                v: 1,
                kind,
                extraImageUrls: extras.length ? extras : undefined,
                ...(opts?.ocPrimaryImageNotInGallery ? { ocPrimaryImageNotInGallery: true as const } : {}),
                ...(ocLinkedWorldviews.length ? { ocLinkedWorldviews } : {}),
            };
        }
        default:
            return {
                v: 1,
                kind,
                extraImageUrls: extras.length ? extras : undefined,
            };
    }
}

/** 将卡片 payload 附加到已拼好的正文后（供 POST /api/artworks） */
export function mergeDescriptionWithCardPayload(
    proseDescription: string | null | undefined,
    uiCategory: string,
    formData: Record<string, unknown>,
    extraImageUrls?: string[],
    cardOpts?: { ocPrimaryImageNotInGallery?: boolean },
): string | null {
    const prose = (proseDescription ?? "").trim();
    const payload = buildArtworkCardPayload(uiCategory, formData, {
        extraImageUrls,
        ocPrimaryImageNotInGallery: cardOpts?.ocPrimaryImageNotInGallery,
    });
    const merged = appendCardPayloadToDescription(prose, payload);
    return merged.trim() || null;
}
