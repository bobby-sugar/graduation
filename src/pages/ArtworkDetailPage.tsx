import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { artworkKindLabel, normalizeArtworkKind, type ArtworkKind } from "../artwork/apiCategory";
import {
    buildArtworkCloseState,
    buildEditPageEntryState,
    resolveArtworkCloseTarget,
} from "../artwork/artworkDetailNavigation";
import { splitDescriptionAndCardPayload, type ArtworkCardPayloadV1 } from "../artwork/cardPayload";
import DetailPageCloseIcon from "../components/DetailPageCloseIcon";
import type { Artwork } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useAuthPrompt } from "../contexts/AuthPromptContext";
import { API_BASE_URL, getSocketBaseUrl, resolveApiUrl } from "../config/api";

const TIMELINE_SECTION_RE = /时间线|年表|历程|轨迹|纪年/;
const REGION_LAYERS_SECTION_RE = /区域图层|地图图层|地理图层|地域图层/;
const USAGE_SECTION_RE = /使用|版权|授权|收费|商用|转载|规则|须知|说明/;

/** OC：正文里曾单独出现「【世界观关联】」等区块，与「所属世界观」卡片重复，详情正文区不再展示。 */
const OC_REDUNDANT_SECTION_TITLES = new Set(["档案补充", "世界观关联", "关联世界观"]);

type ArtworkDetailLoadState = "loading" | "ready" | "missing" | "error";

const WORLDVIEW_SETTING_SECTION_RE = /设定信息|世界设定|设定资料/;
const WORLDVIEW_NARRATIVE_SECTION_RE = /叙事入口|故事入口|剧情入口/;

interface ApiArtwork {
    id: number;
    authorId?: number;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    category?: string | null;
    tags?: string | null;
    gender?: string | null;
    likes?: number | null;
    views?: number | null;
    createdAt?: string | null;
    isLiked?: boolean;
    isFavorited?: boolean;
    author?: {
        id: number;
        username: string;
        avatarUrl?: string | null;
        bio?: string | null;
    } | null;
    /** OC：世界观等可关联范围 */
    ocPrivacy?: string | null;
}

type ShareFollowingUser = {
    id: number;
    username: string;
    avatarUrl?: string | null;
};

/** 与后端 tryParseArtworkSharePayload 上限一致，避免超长字段导致 400 或超限 */
const SHARE_TITLE_MAX = 500;
const SHARE_IMAGE_URL_MAX = 2048;
const SHARE_AUTHOR_MAX = 100;
const SHARE_CATEGORY_MAX = 64;

function clampShareField(input: string | null | undefined, maxChars: number): string | null {
    if (input == null) return null;
    const t = input.trim();
    if (!t) return null;
    const arr = Array.from(t);
    if (arr.length <= maxChars) return t;
    return arr.slice(0, maxChars).join("");
}

function buildArtworkShareMessage(a: Artwork): string {
    const title = clampShareField(a.title, SHARE_TITLE_MAX) ?? "（无标题）";
    const imageRaw = a.imageUrl?.trim() ? a.imageUrl.trim() : null;
    const imageUrl = imageRaw ? clampShareField(imageRaw, SHARE_IMAGE_URL_MAX) : null;
    const authorUsername = clampShareField(a.author ?? null, SHARE_AUTHOR_MAX);
    const category =
        typeof a.category === "string" && a.category.trim()
            ? clampShareField(a.category.trim(), SHARE_CATEGORY_MAX)
            : null;
    const payload = {
        type: "artwork_share" as const,
        artworkId: a.id,
        title,
        imageUrl,
        category,
        authorUsername,
    };
    return `__ARTWORK_SHARE__${JSON.stringify(payload)}`;
}

interface CommentItem {
    id: number;
    author: string;
    authorAvatar: string | null;
    text: string;
    likes: number;
    isLiked: boolean;
    replies?: CommentItem[];
}

interface RawCommentNode {
    id: number;
    content: string;
    likes?: number | null;
    /** 当前登录用户对这条评论是否已赞（后端 findByArtwork 注入） */
    isLiked?: boolean | null;
    user?: {
        username?: string | null;
        avatarUrl?: string | null;
    } | null;
    replies?: RawCommentNode[] | null;
}

interface DescriptionSectionItem {
    type: "kv" | "text" | "bullet" | "subheading";
    label?: string;
    value: string;
}

interface DescriptionSection {
    title: string;
    items: DescriptionSectionItem[];
}

interface ParsedArtworkDescription {
    intro: string;
    introParagraphs: string[];
    sections: DescriptionSection[];
    metaMap: Record<string, string>;
}

interface DetailField {
    label: string;
    value: string;
}

interface SectionEntry {
    id: string;
    section: DescriptionSection;
}

function sanitizeWorldviewSettingSection(section: DescriptionSection): DescriptionSection {
    return {
        ...section,
        items: section.items.filter((item) => {
            if (item.type !== "kv" || !item.label) return true;
            return !["一句话设定", "关联作品/系列", "关联角色/系列"].includes(item.label);
        }),
    };
}

function resolveMediaUrl(url: string | null | undefined): string {
    return resolveApiUrl(url);
}

function mapRawCommentNode(c: RawCommentNode): CommentItem {
    return {
        id: c.id,
        author: c.user?.username ?? "游客",
        authorAvatar: resolveMediaUrl(c.user?.avatarUrl ?? null) || null,
        text: c.content,
        likes: c.likes ?? 0,
        isLiked: !!c.isLiked,
        replies: (c.replies || []).map(mapRawCommentNode),
    };
}

function countCommentSubtree(c: CommentItem): number {
    return 1 + (c.replies?.reduce((s, r) => s + countCommentSubtree(r), 0) ?? 0);
}

function countAllRepliesUnder(replies: CommentItem[] | undefined): number {
    if (!replies?.length) return 0;
    return replies.reduce((sum, r) => sum + 1 + countAllRepliesUnder(r.replies), 0);
}

function mapRawCommentsToItems(rawComments: unknown): {
    list: CommentItem[];
    count: number;
} {
    const mappedComments: CommentItem[] = (Array.isArray(rawComments) ? rawComments : []).map(mapRawCommentNode);
    const count = mappedComments.reduce((sum, c) => sum + countCommentSubtree(c), 0);
    return { list: mappedComments, count };
}

/** 点赞接口成功后，用服务端返回的计数与已赞状态更新树 */
function applyCommentLikeFromServer(
    items: CommentItem[],
    commentId: number,
    server: { likes: number; isLiked: boolean },
): CommentItem[] {
    return items.map((c) => {
        if (c.id === commentId) {
            return { ...c, likes: server.likes, isLiked: server.isLiked };
        }
        if (c.replies?.length) {
            return { ...c, replies: applyCommentLikeFromServer(c.replies, commentId, server) };
        }
        return c;
    });
}

function toParagraphs(text: string): string[] {
    return text
        .replace(/\r/g, "")
        .split(/\n\s*\n/)
        .map((block) =>
            block
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .join("\n"),
        )
        .filter(Boolean);
}

function cleanDisplayText(value: string | null | undefined): string {
    return (value ?? "").replace(/\s*\n\s*/g, " / ").replace(/\s+/g, " ").trim();
}

function pickMetaValue(metaMap: Record<string, string>, labels: string[]): string | undefined {
    return labels.map((label) => metaMap[label]).find((value) => Boolean(value?.trim()));
}

/** 详情页拉取图片：尽量走同源路径（Vite 代理 /uploads），便于 fetch 成 Blob 后触发保存 */
function fetchHrefForGalleryImage(absUrl: string): string {
    if (!absUrl) return absUrl;
    if (API_BASE_URL && absUrl.startsWith(API_BASE_URL)) {
        return absUrl.slice(API_BASE_URL.length);
    }
    try {
        const u = new URL(absUrl);
        if (u.pathname.startsWith("/uploads/")) return u.pathname + u.search;
    } catch {
        /* ignore */
    }
    return absUrl.startsWith("/") ? absUrl : `/${absUrl}`;
}

function sanitizeDownloadBaseName(title: string): string {
    const t = title.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
    return t.slice(0, 72) || "emoji";
}

function extensionFromUrlAndBlob(absUrl: string, blob: Blob): string {
    const path = absUrl.replace(/\?.*$/, "");
    const m = path.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
    const mt = blob.type;
    if (mt.includes("jpeg")) return "jpg";
    if (mt.includes("png")) return "png";
    if (mt.includes("gif")) return "gif";
    if (mt.includes("webp")) return "webp";
    return "bin";
}

async function downloadGalleryImageFile(absUrl: string, index: number, titleBase: string): Promise<void> {
    const href = fetchHrefForGalleryImage(absUrl);
    const res = await fetch(href);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    const ext = extensionFromUrlAndBlob(absUrl, blob);
    const filename = `${titleBase}-${index + 1}.${ext}`;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.setAttribute("download", filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
}

function uniqueValues(values: Array<string | null | undefined>, limit = 4): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const cleaned = cleanDisplayText(value);
        if (!cleaned) continue;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(cleaned);
        if (out.length >= limit) break;
    }
    return out;
}

function normalizeLookupText(value: string | null | undefined): string {
    return cleanDisplayText(value)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
}

function splitListText(value: string | null | undefined): string[] {
    return uniqueValues(
        (value ?? "")
            .split(/[\n,，、/|；;]+/)
            .map((item) => item.trim())
            .filter(Boolean),
        16,
    );
}

function extractMetaList(metaMap: Record<string, string>, labels: string[]): string[] {
    return uniqueValues(labels.flatMap((label) => splitListText(metaMap[label])), 16);
}

function artworkMatchesTokens(work: Artwork, tokens: string[]): boolean {
    if (tokens.length === 0) return false;
    const titleText = normalizeLookupText(work.title);
    const haystacks = [work.title, work.tags, work.description].map(normalizeLookupText).filter(Boolean);

    return tokens.some((token) => {
        const needle = normalizeLookupText(token);
        if (!needle) return false;
        return titleText.includes(needle) || needle.includes(titleText) || haystacks.some((text) => text.includes(needle));
    });
}

function findWorkByText(works: Artwork[], kind: ArtworkKind, label: string | undefined): Artwork | null {
    if (!label) return null;
    return works.find((work) => normalizeArtworkKind(work.category) === kind && artworkMatchesTokens(work, [label])) ?? null;
}

function findWorldviewByRelatedOc(works: Artwork[], currentOc: Artwork | null): Artwork | null {
    if (!currentOc) return null;

    return (
        works.find((work) => {
            if (normalizeArtworkKind(work.category) !== "worldview") return false;
            const parsed = splitDescriptionAndCardPayload(work.description ?? null);
            const description = parseArtworkDescription(parsed.prose);
            const relatedCharacters = uniqueValues(
                [
                    ...(parsed.payload?.worldview?.relatedCharacters ?? []),
                    ...extractMetaList(description.metaMap, ["关联 OC"]),
                ],
                16,
            );

            return artworkMatchesTokens(currentOc, relatedCharacters);
        }) ?? null
    );
}

function findRelatedOcWorks(
    works: Artwork[],
    options: { referenceTitle?: string; explicitNames?: string[] },
): Artwork[] {
    const tokens = uniqueValues([options.referenceTitle, ...(options.explicitNames ?? [])], 24);
    if (tokens.length === 0) return [];
    return works.filter((work) => normalizeArtworkKind(work.category) === "oc" && artworkMatchesTokens(work, tokens));
}

/** 表情包「使用说明」标题旁：下载权限气泡文案与是否视为开放下载（用于样式） */
function buildEmojiDownloadPermissionBubble(
    downloadable: boolean | undefined,
    metaMap: Record<string, string>,
    downloadAllowedResolved: boolean,
): { text: string; allowed: boolean } | null {
    const metaRaw = (pickMetaValue(metaMap, ["允许下载"]) ?? "").trim();
    if (downloadable !== true && downloadable !== false && !metaRaw) return null;

    let text: string;
    if (downloadable === true) text = "可下载";
    else if (downloadable === false) text = "不可下载";
    else if (metaRaw === "是" || metaRaw === "允许" || /^允许/i.test(metaRaw) || metaRaw === "yes" || metaRaw === "true" || metaRaw === "1") {
        text = "可下载";
    } else if (
        metaRaw === "否" ||
        metaRaw === "不允许" ||
        /^不允许|^禁止/i.test(metaRaw) ||
        metaRaw === "no" ||
        metaRaw === "false" ||
        metaRaw === "0"
    ) {
        text = "不可下载";
    } else {
        text = metaRaw.length > 16 ? `${metaRaw.slice(0, 16)}…` : metaRaw;
    }

    const allowed =
        downloadable === true ? true : downloadable === false ? false : downloadAllowedResolved;

    return { text, allowed };
}

function createField(label: string, value: string | null | undefined): DetailField | null {
    const cleaned = (value ?? "").trim();
    if (!cleaned) return null;
    return { label, value: cleaned };
}

function parseSectionItems(lines: string[]): DescriptionSectionItem[] {
    const items: DescriptionSectionItem[] = [];
    let currentKv: DetailField | null = null;

    const flushKv = () => {
        if (!currentKv) return;
        items.push({ type: "kv", label: currentKv.label, value: currentKv.value.trim() });
        currentKv = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushKv();
            continue;
        }

        const subheadingMatch = line.match(/^【(.+?)】\s*(.*)$/);
        if (subheadingMatch) {
            flushKv();
            items.push({ type: "subheading", value: subheadingMatch[1].trim() });
            if (subheadingMatch[2].trim()) items.push({ type: "text", value: subheadingMatch[2].trim() });
            continue;
        }

        if (/^[·•●-]/.test(line)) {
            flushKv();
            items.push({ type: "bullet", value: line.replace(/^[·•●-]\s*/, "").trim() });
            continue;
        }

        const kvMatch = line.match(/^([^：:\n]{1,30})[：:]\s*(.*)$/);
        if (kvMatch) {
            flushKv();
            currentKv = { label: kvMatch[1].trim(), value: kvMatch[2].trim() };
            continue;
        }

        if (currentKv) {
            currentKv = {
                ...currentKv,
                value: currentKv.value ? `${currentKv.value}\n${line}` : line,
            };
            continue;
        }

        items.push({ type: "text", value: line });
    }

    flushKv();
    return items;
}

function parseArtworkDescription(prose: string): ParsedArtworkDescription {
    const normalized = prose.replace(/\r/g, "").trim();
    if (!normalized) {
        return { intro: "", introParagraphs: [], sections: [], metaMap: {} };
    }

    const lines = normalized.split("\n");
    const introLines: string[] = [];
    const sectionsRaw: Array<{ title: string; lines: string[] }> = [];
    let currentSectionTitle = "";
    let currentSectionLines: string[] = [];

    const flushSection = () => {
        if (!currentSectionTitle) return;
        sectionsRaw.push({ title: currentSectionTitle, lines: [...currentSectionLines] });
        currentSectionTitle = "";
        currentSectionLines = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        const sectionMatch = line.match(/^【(.+?)】$/);
        if (sectionMatch) {
            flushSection();
            currentSectionTitle = sectionMatch[1].trim();
            continue;
        }
        if (currentSectionTitle) currentSectionLines.push(line);
        else introLines.push(line);
    }

    flushSection();

    const sections = sectionsRaw
        .map(({ title, lines: sectionLines }) => ({ title, items: parseSectionItems(sectionLines) }))
        .filter((section) => section.items.length > 0);

    const metaMap: Record<string, string> = {};
    for (const section of sections) {
        for (const item of section.items) {
            if (item.type === "kv" && item.label) metaMap[item.label] = item.value;
        }
    }

    const intro = introLines.join("\n").trim();
    return { intro, introParagraphs: toParagraphs(intro), sections, metaMap };
}

function buildHeroSummary(
    kind: ArtworkKind,
    title: string,
    metaMap: Record<string, string>,
    introParagraphs: string[],
    payload: ArtworkCardPayloadV1 | null,
): string {
    const introLead = introParagraphs[0];
    switch (kind) {
        case "worldview":
            return (
                payload?.worldview?.summaryHint ||
                pickMetaValue(metaMap, ["一句话设定"]) ||
                pickMetaValue(metaMap, ["核心主题", "核心冲突"]) ||
                introLead ||
                title
            );
        case "emoji":
            return pickMetaValue(metaMap, ["一句话介绍"]) || "";
        case "oc":
        default:
            return (
                introLead ||
                pickMetaValue(metaMap, ["角色简介", "一句话简介", "职业", "一句话说明", "风格标签"]) ||
                title
            );
    }
}

function buildHighlightBadges(
    kind: ArtworkKind,
    metaMap: Record<string, string>,
    payload: ArtworkCardPayloadV1 | null,
    tags: string[],
): string[] {
    switch (kind) {
        case "worldview":
            return uniqueValues([
                ...(payload?.worldview?.chips ?? []),
                pickMetaValue(metaMap, ["类型"]),
                pickMetaValue(metaMap, ["时代/背景"]),
                pickMetaValue(metaMap, ["地域/舞台"]),
                pickMetaValue(metaMap, ["核心主题"]),
            ]);
        case "emoji":
            return uniqueValues([
                payload?.emoji?.countLabel,
                payload?.emoji?.theme,
                payload?.emoji?.scenario,
                payload?.emoji?.relatedCharacter,
                pickMetaValue(metaMap, ["张数/规格"]),
                pickMetaValue(metaMap, ["画风/主题"]),
                pickMetaValue(metaMap, ["使用场景"]),
            ]);
        case "oc":
            return [];
        default:
            return uniqueValues([
                pickMetaValue(metaMap, ["性别"]),
                pickMetaValue(metaMap, ["种族"]),
                pickMetaValue(metaMap, ["职业"]),
                pickMetaValue(metaMap, ["风格标签"]),
                pickMetaValue(metaMap, ["使用工具/模板"]),
                ...tags,
            ]);
    }
}

function buildQuickFacts(
    kind: ArtworkKind,
    metaMap: Record<string, string>,
    payload: ArtworkCardPayloadV1 | null,
    galleryImageCount: number,
): DetailField[] {
    const fields: Array<DetailField | null> = [];

    switch (kind) {
        case "worldview":
            fields.push(
                createField("类型", pickMetaValue(metaMap, ["类型"])),
                createField("时代/背景", pickMetaValue(metaMap, ["时代/背景"])),
                createField("地域/舞台", pickMetaValue(metaMap, ["地域/舞台"])),
                createField("阵营/势力", pickMetaValue(metaMap, ["阵营/势力"])),
                createField("核心冲突", pickMetaValue(metaMap, ["核心冲突"])),
                createField("世界规则", pickMetaValue(metaMap, ["世界规则"])),
                createField("核心主题", pickMetaValue(metaMap, ["核心主题"])),
                createField("关联作品/系列", pickMetaValue(metaMap, ["关联作品/系列", "关联角色/系列"])),
                createField("关联 OC", (payload?.worldview?.relatedCharacters ?? []).join("、") || pickMetaValue(metaMap, ["关联 OC"])),
            );
            break;
        case "emoji":
            /* 右侧标题下仅展示一句话介绍（见 work-summary），此处不再堆套组字段 / 允许下载 / 画廊数量 */
            break;
        case "oc":
            fields.push(
                createField("使用工具", pickMetaValue(metaMap, ["使用工具/模板"])),
                createField("角色归属", pickMetaValue(metaMap, ["角色归属"])),
                createField("开放同款", pickMetaValue(metaMap, ["开放同款"])),
                createField("开放约稿", pickMetaValue(metaMap, ["开放约稿"])),
            );
            break;
        default:
            fields.push(
                createField("性别", pickMetaValue(metaMap, ["性别"])),
                createField("年龄", pickMetaValue(metaMap, ["年龄"])),
                createField("种族", pickMetaValue(metaMap, ["种族"])),
                createField("职业", pickMetaValue(metaMap, ["职业"])),
                createField("使用工具", pickMetaValue(metaMap, ["使用工具/模板"])),
                createField("角色归属", pickMetaValue(metaMap, ["角色归属"])),
                createField("开放同款", pickMetaValue(metaMap, ["开放同款"])),
                createField("开放约稿", pickMetaValue(metaMap, ["开放约稿"])),
            );
            break;
    }

    if (galleryImageCount > 1 && kind !== "oc" && kind !== "emoji") {
        fields.push(createField("画廊数量", `${galleryImageCount} 张`));
    }

    return fields.filter((field): field is DetailField => Boolean(field)).slice(0, 8);
}

/** OC 标题下：性别 / 年龄 / 种族 / 职业（未填写时展示「未公开」） */
function buildOcIdentityMiniCards(metaMap: Record<string, string>): DetailField[] {
    const cell = (label: string, keys: string[]): DetailField => {
        const raw = (pickMetaValue(metaMap, keys) ?? "").trim();
        return { label, value: raw || "未公开" };
    };
    return [cell("性别", ["性别"]), cell("年龄", ["年龄"]), cell("种族", ["种族"]), cell("职业", ["职业"])];
}

function getBodySectionTitle(kind: ArtworkKind): string {
    switch (kind) {
        case "worldview":
            return "世界概述";
        case "emoji":
            return "内容说明";
        case "oc":
        default:
            return "角色简介";
    }
}

function StructuredSection({ section }: { section: DescriptionSection }) {
    const blocks: ReactNode[] = [];
    let kvBuffer: DetailField[] = [];
    let bulletBuffer: string[] = [];

    const flushBuffers = () => {
        if (kvBuffer.length > 0) {
            blocks.push(
                <div className="artwork-detail-facts-grid artwork-detail-facts-grid--section" key={`kv-${blocks.length}`}>
                    {kvBuffer.map((item) => (
                        <div key={`${item.label}-${item.value}`} className="artwork-detail-fact">
                            <div className="artwork-detail-fact-label">{item.label}</div>
                            <div className="artwork-detail-fact-value artwork-detail-fact-value--multiline">{item.value}</div>
                        </div>
                    ))}
                </div>,
            );
            kvBuffer = [];
        }

        if (bulletBuffer.length > 0) {
            blocks.push(
                <ul className="artwork-detail-bullet-list" key={`bullet-${blocks.length}`}>
                    {bulletBuffer.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                    ))}
                </ul>,
            );
            bulletBuffer = [];
        }
    };

    for (const item of section.items) {
        if (item.type === "kv" && item.label) {
            kvBuffer.push({ label: item.label, value: item.value });
            continue;
        }
        if (item.type === "bullet") {
            bulletBuffer.push(item.value);
            continue;
        }

        flushBuffers();
        if (item.type === "subheading") {
            blocks.push(
                <h4 className="artwork-detail-section-subtitle" key={`sub-${blocks.length}`}>
                    {item.value}
                </h4>,
            );
            continue;
        }

        blocks.push(
            <p className="artwork-detail-work-description artwork-detail-work-description--section" key={`text-${blocks.length}`}>
                {item.value}
            </p>,
        );
    }

    flushBuffers();
    if (blocks.length === 0) return null;
    return <div className="artwork-detail-structured-section">{blocks}</div>;
}

function TimelineSection({ section }: { section: DescriptionSection }) {
    const items = section.items
        .filter((item) => item.type !== "subheading")
        .map((item, index) => ({
            id: `${section.title}-${index}`,
            label: item.type === "kv" ? item.label : undefined,
            value: item.value,
        }))
        .filter((item) => Boolean(item.value?.trim()));

    if (items.length === 0) return null;

    return (
        <div className="artwork-detail-timeline">
            {items.map((item) => (
                <div key={item.id} className="artwork-detail-timeline-item">
                    <div className="artwork-detail-timeline-dot" aria-hidden />
                    <div className="artwork-detail-timeline-content">
                        {item.label ? <div className="artwork-detail-timeline-label">{item.label}</div> : null}
                        <div className="artwork-detail-timeline-value">{item.value}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function summarizeArtwork(work: Artwork | null | undefined): string {
    if (!work?.description) return "";
    const parsed = splitDescriptionAndCardPayload(work.description ?? null);
    const description = parseArtworkDescription(parsed.prose);
    return buildHeroSummary(
        normalizeArtworkKind(parsed.payload?.kind ?? work.category),
        work.title,
        description.metaMap,
        description.introParagraphs,
        parsed.payload,
    );
}

function ReferenceCard({
    title,
    summary,
    imageUrl,
    caption,
    to,
    linkState,
}: {
    title: string;
    summary?: string;
    imageUrl?: string | null;
    caption: string;
    to?: string;
    linkState?: Record<string, unknown>;
}) {
    const content = (
        <>
            <div className="artwork-detail-reference-visual">
                {imageUrl ? (
                    <img src={imageUrl} alt={title} className="artwork-detail-reference-image" />
                ) : (
                    <div className="artwork-detail-reference-fallback">{title.slice(0, 1)}</div>
                )}
            </div>
            <div className="artwork-detail-reference-copy">
                <div className="artwork-detail-reference-caption">{caption}</div>
                <div className="artwork-detail-reference-title">{title}</div>
                {summary ? <p className="artwork-detail-reference-summary">{summary}</p> : null}
            </div>
        </>
    );

    if (to) {
        return (
            <Link to={to} state={linkState} className="artwork-detail-reference-card artwork-detail-reference-card--link">
                {content}
            </Link>
        );
    }

    return <div className="artwork-detail-reference-card">{content}</div>;
}

interface ReplyTreeNodeProps {
    reply: CommentItem;
    parentAuthorName: string;
    replyingTo: number | null;
    replyText: Record<number, string>;
    onReply: (id: number) => void;
    onLike: (id: number) => void;
    onSend: (id: number) => void;
    setReplyTextFor: (commentId: number, text: string) => void;
    hasToken: boolean;
}

function ReplyTreeNode({
    reply,
    parentAuthorName,
    replyingTo,
    replyText,
    onReply,
    onLike,
    onSend,
    setReplyTextFor,
    hasToken,
}: ReplyTreeNodeProps) {
    const childReplies = reply.replies && reply.replies.length > 0;
    return (
        <div className="artwork-detail-reply-tree-node">
            <div className="artwork-detail-reply-item">
                <div className="artwork-detail-comment-avatar artwork-detail-comment-avatar--reply">
                    {reply.authorAvatar ? (
                        <img src={reply.authorAvatar} alt={reply.author} />
                    ) : (
                        <div className="artwork-detail-comment-avatar-fallback">{(reply.author || "?").slice(0, 1)}</div>
                    )}
                </div>
                <div className="artwork-detail-comment-main">
                    <div className="artwork-detail-comment-userline">
                        <span className="artwork-detail-comment-author">{reply.author}</span>
                    </div>
                    <p className="artwork-detail-comment-text">
                        <span className="artwork-detail-reply-prefix">回复 @{parentAuthorName}：</span>
                        {reply.text}
                    </p>
                    <div className="artwork-detail-comment-toolbar">
                        <button type="button" className={`artwork-detail-comment-like ${reply.isLiked ? "liked" : ""}`} onClick={() => onLike(reply.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={reply.isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            <span>{reply.likes || 0}</span>
                        </button>
                        <button type="button" className="artwork-detail-comment-reply-btn" onClick={() => onReply(reply.id)}>
                            回复
                        </button>
                    </div>
                </div>
            </div>
            {replyingTo === reply.id ? (
                <div className="artwork-detail-reply-input artwork-detail-reply-input--under-reply">
                    <input
                        type="text"
                        placeholder={`回复 @${reply.author}：`}
                        value={replyText[reply.id] || ""}
                        onChange={(e) => setReplyTextFor(reply.id, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                onSend(reply.id);
                            }
                        }}
                    />
                    <button type="button" onClick={() => onSend(reply.id)} disabled={hasToken && !replyText[reply.id]?.trim()}>
                        发送
                    </button>
                </div>
            ) : null}
            {childReplies ? (
                <div className="artwork-detail-replies-nested">
                    {reply.replies!.map((child) => (
                        <ReplyTreeNode
                            key={child.id}
                            reply={child}
                            parentAuthorName={reply.author}
                            replyingTo={replyingTo}
                            replyText={replyText}
                            onReply={onReply}
                            onLike={onLike}
                            onSend={onSend}
                            setReplyTextFor={setReplyTextFor}
                            hasToken={hasToken}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function ArtworkDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, token } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const hasToken = !!token;
    const [artwork, setArtwork] = useState<Artwork | null>(null);
    const [loadState, setLoadState] = useState<ArtworkDetailLoadState>("loading");
    const succeededIdRef = useRef<string | undefined>(undefined);
    const [cardPayload, setCardPayload] = useState<ArtworkCardPayloadV1 | null>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [shareFollowingList, setShareFollowingList] = useState<ShareFollowingUser[]>([]);
    const [shareFollowingLoading, setShareFollowingLoading] = useState(false);
    const [shareFollowingFilter, setShareFollowingFilter] = useState("");
    const [shareSendingUserId, setShareSendingUserId] = useState<number | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);
    const [emojiDownloadBusy, setEmojiDownloadBusy] = useState(false);
    const [commentText, setCommentText] = useState("");
    const [replyingTo, setReplyingTo] = useState<number | null>(null);
    const [replyText, setReplyText] = useState<Record<number, string>>({});
    const [expandedReplyThreads, setExpandedReplyThreads] = useState<Set<number>>(new Set());
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [description, setDescription] = useState("");
    const [authorBio, setAuthorBio] = useState("");
    const [commentsCount, setCommentsCount] = useState(0);
    const [tags, setTags] = useState<string[]>([]);
    const [authorOtherWorks, setAuthorOtherWorks] = useState<Artwork[]>([]);
    const [reverseLinkedOcs, setReverseLinkedOcs] = useState<Artwork[]>([]);
    const [authorId, setAuthorId] = useState<number | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const loadComments = useCallback(async () => {
        if (!id) return;
        try {
            const headers: HeadersInit = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            const res = await fetch(`/api/artworks/${id}/comments`, { headers });
            if (!res.ok) return;
            const raw = await res.json();
            const { list, count } = mapRawCommentsToItems(raw);
            setComments(list);
            setCommentsCount(count);
        } catch (e) {
            console.error(e);
        }
    }, [id, token]);

    /** 从路由 state 继承「关闭后应停留的页面」，站内切换作品时沿用同一目标 */
    const persistCloseTo = useMemo(() => resolveArtworkCloseTarget(location.state), [location.state]);
    const artworkLinkState = useMemo(() => buildArtworkCloseState(persistCloseTo), [persistCloseTo]);

    /** 关闭详情：replace 到进入作品前页面，不使用 history.back */
    const handleClosePage = useCallback(() => {
        navigate(persistCloseTo, { replace: true });
    }, [navigate, persistCloseTo]);

    useEffect(() => {
        if (!id) {
            succeededIdRef.current = undefined;
            setArtwork(null);
            setLoadState("missing");
            return;
        }

        const isNewArtwork = succeededIdRef.current !== id;
        if (isNewArtwork) {
            setLoadState("loading");
            setArtwork(null);
        }

        let cancelled = false;

        const load = async () => {
            try {
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const [artRes, commentsRes] = await Promise.all([
                    fetch(`/api/artworks/${id}`, { headers }),
                    fetch(`/api/artworks/${id}/comments`, { headers }),
                ]);

                if (cancelled) return;

                if (!artRes.ok) {
                    setArtwork(null);
                    if (artRes.status === 404) {
                        succeededIdRef.current = undefined;
                        setLoadState("missing");
                    } else {
                        setLoadState("error");
                    }
                    return;
                }

                const art: ApiArtwork | null = await artRes.json();
                if (cancelled) return;

                if (!art) {
                    succeededIdRef.current = undefined;
                    setArtwork(null);
                    setLoadState("missing");
                    return;
                }

                setIsLiked(!!art.isLiked);
                setIsSaved(!!art.isFavorited);

                const mainImageUrl = resolveMediaUrl(art.imageUrl) || resolveApiUrl(`/uploads/oc_${art.id}.jpg`);
                const parsed = splitDescriptionAndCardPayload(art.description ?? null);

                setArtwork({
                    id: art.id,
                    title: art.title,
                    author: art.author?.username ?? "未知作者",
                    authorAvatar: resolveMediaUrl(art.author?.avatarUrl ?? null) || null,
                    imageUrl: mainImageUrl,
                    likes: art.likes ?? 0,
                    views: art.views ?? 0,
                    createdAt: art.createdAt ?? new Date().toISOString(),
                    category: normalizeArtworkKind(art.category) as Artwork["category"],
                    ocPrivacy: art.ocPrivacy ?? null,
                });
                setCardPayload(parsed.payload);
                setDescription(parsed.prose);
                setAuthorBio(art.author?.bio ?? "");
                setAuthorId(art.author?.id ?? null);

                if (art.author?.id) {
                    const otherRes = await fetch(`/api/artworks?authorId=${art.author.id}`);
                    if (otherRes.ok) {
                        const otherData: ApiArtwork[] = await otherRes.json();
                        setAuthorOtherWorks(
                            (otherData || [])
                                .filter((item) => item.id !== art.id)
                                .map((item) => ({
                                    id: item.id,
                                    title: item.title,
                                    author: item.author?.username ?? "未知作者",
                                    authorAvatar: resolveMediaUrl(item.author?.avatarUrl ?? null) || null,
                                    imageUrl: resolveMediaUrl(item.imageUrl) || resolveApiUrl(`/uploads/oc_${item.id}.jpg`),
                                    likes: item.likes ?? 0,
                                    views: item.views ?? 0,
                                    createdAt: item.createdAt ?? new Date().toISOString(),
                                    category: normalizeArtworkKind(item.category) as Artwork["category"],
                                    description: item.description ?? null,
                                    tags: item.tags ?? null,
                                })),
                        );
                    } else {
                        setAuthorOtherWorks([]);
                    }
                } else {
                    setAuthorOtherWorks([]);
                }

                if (normalizeArtworkKind(art.category) === "worldview") {
                    const linkedRes = await fetch(`/api/artworks/linked-worldview/${art.id}/ocs`, { headers });
                    if (linkedRes.ok) {
                        const linkedData: ApiArtwork[] = await linkedRes.json();
                        setReverseLinkedOcs(
                            (linkedData || [])
                                .filter((row) => row.id !== art.id)
                                .map((row) => ({
                                    id: row.id,
                                    title: row.title,
                                    author: row.author?.username ?? "未知作者",
                                    authorAvatar: resolveMediaUrl(row.author?.avatarUrl ?? null) || null,
                                    imageUrl: resolveMediaUrl(row.imageUrl) || resolveApiUrl(`/uploads/oc_${row.id}.jpg`),
                                    likes: row.likes ?? 0,
                                    views: row.views ?? 0,
                                    createdAt: row.createdAt ?? new Date().toISOString(),
                                    category: normalizeArtworkKind(row.category) as Artwork["category"],
                                    description: row.description ?? null,
                                    tags: row.tags ?? null,
                                })),
                        );
                    } else {
                        setReverseLinkedOcs([]);
                    }
                } else {
                    setReverseLinkedOcs([]);
                }

                if (commentsRes.ok) {
                    const rawComments = await commentsRes.json();
                    const { list, count } = mapRawCommentsToItems(rawComments);
                    setComments(list);
                    setCommentsCount(count);
                }

                setTags(
                    art.tags
                        ? art.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
                        : art.category
                          ? [artworkKindLabel(normalizeArtworkKind(art.category))]
                          : [],
                );

                if (token) {
                    fetch(`/api/artworks/${id}/view`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                    }).catch(() => {});
                }

                succeededIdRef.current = id;
                setLoadState("ready");
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setArtwork(null);
                    setLoadState("error");
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [id, token]);

    useEffect(() => {
        if (!id) return;
        const numId = parseInt(id, 10);
        if (!Number.isInteger(numId) || numId < 1) return;

        const socket: Socket = io(getSocketBaseUrl(), {
            path: "/socket.io",
            ...(token ? { auth: { token } } : {}),
            transports: ["websocket", "polling"],
        });

        const doJoin = () => {
            socket.emit("join-artwork", { artworkId: numId });
        };

        socket.on("connect", doJoin);
        if (socket.connected) doJoin();

        const onRefresh = (payload: { artworkId?: number }) => {
            if (Number(payload?.artworkId) !== numId) return;
            void loadComments();
        };

        socket.on("artwork:comments-refresh", onRefresh);
        return () => {
            socket.emit("leave-artwork", { artworkId: numId });
            socket.off("connect", doJoin);
            socket.off("artwork:comments-refresh", onRefresh);
            socket.disconnect();
        };
    }, [id, token, loadComments]);

    const isOwnAuthor = user != null && authorId != null && user.id === authorId;

    useEffect(() => {
        if (!token || authorId == null || isOwnAuthor) return;
        const check = async () => {
            try {
                const res = await fetch("/api/users/me/following", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const list: { id: number }[] = await res.json();
                setIsFollowing(list.some((item) => item.id === authorId));
            } catch {
                // ignore
            }
        };
        void check();
    }, [token, authorId, isOwnAuthor]);

    const kind = useMemo(
        () => normalizeArtworkKind(cardPayload?.kind ?? artwork?.category),
        [artwork?.category, cardPayload?.kind],
    );
    const parsedDescription = useMemo(() => parseArtworkDescription(description), [description]);
    const galleryImages = useMemo(() => {
        const values = [
            artwork?.imageUrl,
            ...(cardPayload?.extraImageUrls ?? []).map((item) => resolveMediaUrl(item)),
        ];
        return uniqueValues(values, 24);
    }, [artwork?.imageUrl, cardPayload]);

    const emojiDownloadAllowed = useMemo(() => {
        if (kind !== "emoji") return false;
        const v = cardPayload?.emoji?.downloadable;
        if (v === true) return true;
        if (v === false) return false;
        const m = (pickMetaValue(parsedDescription.metaMap, ["允许下载"]) ?? "").trim();
        return m === "是" || m === "允许" || /^允许/i.test(m);
    }, [kind, cardPayload?.emoji?.downloadable, parsedDescription.metaMap]);

    const handleEmojiDownloadAll = useCallback(async () => {
        if (!emojiDownloadAllowed || galleryImages.length === 0 || emojiDownloadBusy) return;
        setEmojiDownloadBusy(true);
        try {
            const base = sanitizeDownloadBaseName(artwork?.title ?? "emoji");
            const delayMs = 450;
            for (let i = 0; i < galleryImages.length; i++) {
                if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
                await downloadGalleryImageFile(galleryImages[i], i, base);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setEmojiDownloadBusy(false);
        }
    }, [emojiDownloadAllowed, galleryImages, artwork?.title, emojiDownloadBusy]);

    const handleEmojiDownloadOne = useCallback(
        async (absUrl: string, index: number) => {
            if (!emojiDownloadAllowed || !absUrl) return;
            try {
                const base = sanitizeDownloadBaseName(artwork?.title ?? "emoji");
                await downloadGalleryImageFile(absUrl, index, base);
            } catch (e) {
                console.error(e);
            }
        },
        [emojiDownloadAllowed, artwork?.title],
    );

    const selectedImageSrc = galleryImages[0] ?? artwork?.imageUrl ?? "";
    const summary = useMemo(
        () => buildHeroSummary(kind, artwork?.title ?? "", parsedDescription.metaMap, parsedDescription.introParagraphs, cardPayload),
        [artwork?.title, cardPayload, kind, parsedDescription],
    );
    const highlightBadges = useMemo(
        () => buildHighlightBadges(kind, parsedDescription.metaMap, cardPayload, tags),
        [cardPayload, kind, parsedDescription.metaMap, tags],
    );
    const quickFacts = useMemo(
        () => buildQuickFacts(kind, parsedDescription.metaMap, cardPayload, galleryImages.length),
        [cardPayload, galleryImages.length, kind, parsedDescription.metaMap],
    );
    const ocIdentityMiniCards = useMemo(
        () => (kind === "oc" ? buildOcIdentityMiniCards(parsedDescription.metaMap) : ([] as DetailField[])),
        [kind, parsedDescription.metaMap],
    );
    const detailSections = parsedDescription.sections;
    const introParagraphs = parsedDescription.introParagraphs;
    const displaySummary = summary.trim() && introParagraphs[0]?.trim() !== summary.trim() ? summary.trim() : "";
    const sectionEntries = useMemo<SectionEntry[]>(
        () =>
            detailSections.map((section, index) => ({
                id: `artwork-detail-${kind}-${index}`,
                section,
            })),
        [detailSections, kind],
    );
    const worldviewSettingEntry = useMemo<SectionEntry | null>(() => {
        if (kind !== "worldview") return null;
        const found = sectionEntries.find((entry) => WORLDVIEW_SETTING_SECTION_RE.test(entry.section.title));
        if (!found) return null;
        const section = sanitizeWorldviewSettingSection(found.section);
        return section.items.length > 0 ? { ...found, section } : null;
    }, [kind, sectionEntries]);
    const timelineEntry = useMemo(
        () => sectionEntries.find((entry) => TIMELINE_SECTION_RE.test(entry.section.title)),
        [sectionEntries],
    );
    const regionLayerEntry = useMemo(
        () => sectionEntries.find((entry) => REGION_LAYERS_SECTION_RE.test(entry.section.title)),
        [sectionEntries],
    );
    const contentEntries = useMemo(
        () => sectionEntries.filter((entry) => entry.id !== timelineEntry?.id),
        [sectionEntries, timelineEntry?.id],
    );
    const ocDetailSectionEntries = useMemo(() => {
        if (kind !== "oc") return contentEntries;
        return contentEntries.filter((entry) => !OC_REDUNDANT_SECTION_TITLES.has(entry.section.title.trim()));
    }, [contentEntries, kind]);
    const worldviewContentEntries = useMemo(
        () =>
            kind !== "worldview"
                ? []
                : sectionEntries.filter(
                      (entry) =>
                          entry.id !== timelineEntry?.id &&
                          entry.id !== regionLayerEntry?.id &&
                          entry.id !== worldviewSettingEntry?.id &&
                          !WORLDVIEW_NARRATIVE_SECTION_RE.test(entry.section.title),
                  ),
        [kind, sectionEntries, timelineEntry?.id, regionLayerEntry?.id, worldviewSettingEntry?.id],
    );
    const emojiUsageEntries = useMemo(
        () => contentEntries.filter((entry) => USAGE_SECTION_RE.test(entry.section.title)),
        [contentEntries],
    );
    const linkedWorldName = useMemo(() => {
        if (kind === "oc") {
            const fromMeta = pickMetaValue(parsedDescription.metaMap, ["所属世界观", "世界观归属"]) || "";
            if (fromMeta) return fromMeta;
            const t = cardPayload?.ocLinkedWorldviews?.[0]?.title?.trim();
            return t || "";
        }
        return "";
    }, [cardPayload?.ocLinkedWorldviews, kind, parsedDescription.metaMap]);
    const linkedWorldArtwork = useMemo(() => {
        if (kind === "oc") {
            const wv0 = cardPayload?.ocLinkedWorldviews?.[0];
            if (wv0 && Number.isFinite(wv0.artworkId)) {
                const hit = authorOtherWorks.find((row) => row.id === wv0.artworkId);
                if (hit && normalizeArtworkKind(hit.category ?? "") === "worldview") return hit;
            }
        }
        return findWorkByText(authorOtherWorks, "worldview", linkedWorldName);
    }, [authorOtherWorks, cardPayload?.ocLinkedWorldviews, kind, linkedWorldName]);
    const inferredOcWorldviewArtwork = useMemo(
        () => (kind === "oc" ? findWorldviewByRelatedOc(authorOtherWorks, artwork ?? null) : null),
        [authorOtherWorks, artwork, kind],
    );
    const resolvedLinkedWorldArtwork = kind === "oc" ? linkedWorldArtwork ?? inferredOcWorldviewArtwork : linkedWorldArtwork;
    const resolvedLinkedWorldName = kind === "oc" ? linkedWorldName || inferredOcWorldviewArtwork?.title || "" : linkedWorldName;
    const linkedWorldSummary = useMemo(
        () => summarizeArtwork(resolvedLinkedWorldArtwork),
        [resolvedLinkedWorldArtwork],
    );
    const explicitCharacterNames = useMemo(() => {
        if (kind === "worldview") {
            return uniqueValues(
                [
                    ...(cardPayload?.worldview?.relatedCharacters ?? []),
                    ...extractMetaList(parsedDescription.metaMap, ["关联 OC"]),
                ],
                16,
            );
        }
        return extractMetaList(parsedDescription.metaMap, ["关联角色"]);
    }, [cardPayload, kind, parsedDescription.metaMap]);
    const relatedLookupTokens = useMemo(() => {
        if (kind === "worldview") {
            return uniqueValues(
                [
                    ...explicitCharacterNames,
                    ...extractMetaList(parsedDescription.metaMap, ["关联作品/系列", "关联角色/系列"]),
                ],
                16,
            );
        }
        return explicitCharacterNames;
    }, [explicitCharacterNames, kind, parsedDescription.metaMap]);
    const relatedOcWorks = useMemo(
        () =>
            findRelatedOcWorks(authorOtherWorks, {
                referenceTitle: kind === "worldview" ? artwork?.title : linkedWorldArtwork?.title || linkedWorldName,
                explicitNames: relatedLookupTokens,
            }),
        [authorOtherWorks, artwork?.title, kind, linkedWorldArtwork?.title, linkedWorldName, relatedLookupTokens],
    );
    /** 世界观详情「相关 OC」：与 OC 详情「所属世界观」一致，使用 ReferenceCard 纵向堆叠（优先卡片 JSON linkedOcsPreview） */
    const worldviewRelatedOcReferenceItems = useMemo(() => {
        if (kind !== "worldview") return [];
        const preview = cardPayload?.worldview?.linkedOcsPreview;
        const previewRows =
            preview?.map((p) => {
                const work = authorOtherWorks.find((w) => w.id === p.artworkId);
                const img =
                    (p.imageUrl ? resolveMediaUrl(p.imageUrl) : null) ||
                    (work?.imageUrl ? String(work.imageUrl) : null);
                const fromWork = work ? summarizeArtwork(work).trim() : "";
                const summary =
                    (fromWork || (p.authorUsername ? `创作者 @${p.authorUsername}` : "")).trim() || undefined;
                const to = Number.isFinite(p.artworkId) ? `/artwork/${p.artworkId}` : undefined;
                return {
                    key: `wv-oc-${p.artworkId}-${p.title}`,
                    title: (p.title ?? "").trim() || work?.title || "未命名 OC",
                    summary,
                    imageUrl: img,
                    to,
                    artworkId: Number.isFinite(p.artworkId) ? p.artworkId : undefined,
                };
            }) ?? [];
        const reverseRows = reverseLinkedOcs.map((work) => ({
            key: `wv-oc-r-${work.id}`,
            title: work.title,
            summary: summarizeArtwork(work).trim() || undefined,
            imageUrl: work.imageUrl ?? null,
            to: `/artwork/${work.id}`,
            artworkId: work.id,
        }));
        const workRows = relatedOcWorks.map((work) => ({
            key: `wv-oc-w-${work.id}`,
            title: work.title,
            summary: summarizeArtwork(work).trim() || undefined,
            imageUrl: work.imageUrl ?? null,
            to: `/artwork/${work.id}`,
            artworkId: work.id,
        }));
        const merged = [...previewRows, ...reverseRows, ...workRows];
        const seen = new Set<number>();
        const deduped: typeof merged = [];
        for (const row of merged) {
            if (typeof row.artworkId === "number") {
                if (seen.has(row.artworkId)) continue;
                seen.add(row.artworkId);
            }
            deduped.push(row);
        }
        const stripped = deduped.map(({ artworkId: _ignored, ...row }) => row);
        /** 仅展示可进入 OC 详情页的联动；仅有文本人名、无站内作品时不占位，由下方空态文案说明 */
        return stripped.filter((row) => typeof row.to === "string" && /^\/artwork\/\d+/.test(row.to));
    }, [kind, cardPayload?.worldview?.linkedOcsPreview, authorOtherWorks, relatedOcWorks, reverseLinkedOcs]);
    const emojiDownloadPermissionBubble = useMemo(
        () =>
            kind === "emoji"
                ? buildEmojiDownloadPermissionBubble(
                      cardPayload?.emoji?.downloadable,
                      parsedDescription.metaMap,
                      emojiDownloadAllowed,
                  )
                : null,
        [cardPayload?.emoji?.downloadable, emojiDownloadAllowed, kind, parsedDescription.metaMap],
    );
    const emojiUsageNotes = useMemo(() => {
        const payloadNotes = cleanDisplayText(cardPayload?.emoji?.usageNotes);
        if (payloadNotes) return [payloadNotes];
        return [];
    }, [cardPayload?.emoji?.usageNotes]);
    /** 正文【使用说明】与卡片 JSON 同源；有 JSON 时跳过同名区块，避免与 emojiUsageNotes 重复展示 */
    const emojiUsageSectionEntries = useMemo(() => {
        if (kind !== "emoji") return emojiUsageEntries;
        if (emojiUsageNotes.length === 0) return emojiUsageEntries;
        return emojiUsageEntries.filter((entry) => entry.section.title.trim() !== "使用说明");
    }, [emojiUsageEntries, emojiUsageNotes, kind]);
    /** 底部「其他作品」仅展示与当前页相同的卡片类型；完整列表仍用于关联世界观 / 关联角色解析 */
    const displayedAuthorOtherWorks = useMemo(
        () =>
            authorOtherWorks
                .filter((work) => normalizeArtworkKind(work.category) === kind)
                .slice(0, 9),
        [authorOtherWorks, kind],
    );
    const commentMeta = useMemo(() => {
        switch (kind) {
            case "emoji":
                return {
                    title: "表情包评论区",
                    placeholder: token ? "说说你最常用的是哪一张" : "请登录后交流表情包",
                };
            case "worldview":
                return {
                    title: "设定讨论",
                    placeholder: token ? "补充你的理解或设定灵感" : "请登录后参与设定讨论",
                };
            case "oc":
            default:
                return {
                    title: "评论",
                    placeholder: token ? "发条友善的评论吧" : "请登录后评论",
                };
        }
    }, [kind, token]);

    useEffect(() => {
        if (!selectedImageSrc) {
            setImageLoaded(true);
            return;
        }
        setImageLoaded(false);
        const img = new Image();
        img.src = selectedImageSrc;
        img.onload = () => setImageLoaded(true);
        img.onerror = () => setImageLoaded(true);
        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [selectedImageSrc]);

    useEffect(() => {
        if (!shareModalOpen || !token) return;
        let cancelled = false;
        setShareFollowingLoading(true);
        setShareError(null);
        void (async () => {
            try {
                const res = await fetch("/api/users/me/following", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json().catch(() => []);
                if (!cancelled) {
                    const raw = Array.isArray(data) ? data : [];
                    const me = user?.id;
                    setShareFollowingList(me != null ? raw.filter((u: ShareFollowingUser) => u.id !== me) : raw);
                }
            } catch {
                if (!cancelled) setShareError("关注列表加载失败");
            } finally {
                if (!cancelled) setShareFollowingLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [shareModalOpen, token, user?.id]);

    const handleFollowClick = useCallback(async () => {
        if (authorId == null) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后关注作者",
                description: "登录后可关注喜欢的创作者，并在首页「关注」中查看他们的新作。",
            });
            return;
        }
        try {
            if (isFollowing) {
                await fetch(`/api/users/${authorId}/follow`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                setIsFollowing(false);
            } else {
                await fetch(`/api/users/${authorId}/follow`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                setIsFollowing(true);
            }
        } catch (e) {
            console.error(e);
        }
    }, [authorId, token, isFollowing, openAuthPrompt]);

    const handleLikeClick = useCallback(async () => {
        if (!artwork) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后点赞",
                description: "登录后即可为作品点赞，向作者表达支持。",
            });
            return;
        }
        try {
            const method = isLiked ? "DELETE" : "POST";
            const res = await fetch(`/api/artworks/${artwork.id}/like`, { method, headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const nextLiked = data.liked ?? !isLiked;
            setIsLiked(nextLiked);
            setArtwork((prev) => (prev ? { ...prev, likes: Math.max(0, (prev.likes ?? 0) + (nextLiked ? 1 : -1)) } : null));
        } catch (e) {
            console.error(e);
        }
    }, [artwork, token, isLiked, openAuthPrompt]);

    const handleFavoriteClick = useCallback(async () => {
        if (!artwork) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后收藏",
                description: "登录后可将作品加入收藏，在个人主页随时回看。",
            });
            return;
        }
        try {
            const method = isSaved ? "DELETE" : "POST";
            const res = await fetch(`/api/artworks/${artwork.id}/favorite`, { method, headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            setIsSaved(data.favorited ?? !isSaved);
        } catch (e) {
            console.error(e);
        }
    }, [artwork, token, isSaved, openAuthPrompt]);

    const handleShareClick = useCallback(() => {
        if (!artwork) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后分享给好友",
                description: "登录后可将作品以卡片形式发送给你关注的用户。",
            });
            return;
        }
        setShareFollowingFilter("");
        setShareError(null);
        setShareModalOpen(true);
    }, [artwork, token, openAuthPrompt]);

    const sendShareToFollowingUser = useCallback(
        async (targetUserId: number) => {
            if (!artwork || !token) return;
            if (user?.id != null && targetUserId === user.id) return;
            setShareSendingUserId(targetUserId);
            setShareError(null);
            try {
                const convRes = await fetch("/api/conversations", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ otherUserId: targetUserId }),
                });
                if (!convRes.ok) {
                    const err = await convRes.json().catch(() => ({}));
                    const msg = Array.isArray(err?.message) ? err.message.join("，") : err?.message;
                    throw new Error(typeof msg === "string" && msg.trim() ? msg : "无法打开与该用户的会话");
                }
                const conv = (await convRes.json()) as { id?: number };
                const cid = typeof conv?.id === "number" ? conv.id : NaN;
                if (!Number.isFinite(cid)) throw new Error("会话创建失败");

                const content = buildArtworkShareMessage(artwork);
                const msgRes = await fetch(`/api/conversations/${cid}/messages`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ content }),
                });
                if (!msgRes.ok) {
                    const err = await msgRes.json().catch(() => ({}));
                    const msg = Array.isArray(err?.message) ? err.message.join("，") : err?.message;
                    throw new Error(typeof msg === "string" && msg.trim() ? msg : "发送失败");
                }
                setShareModalOpen(false);
                navigate("/inbox", { state: { otherUserId: targetUserId } });
            } catch (e) {
                setShareError(e instanceof Error ? e.message : "分享失败");
            } finally {
                setShareSendingUserId(null);
            }
        },
        [artwork, token, navigate, user?.id],
    );

    const closeShareModal = useCallback(() => {
        if (shareSendingUserId !== null) return;
        setShareModalOpen(false);
        setShareError(null);
    }, [shareSendingUserId]);

    const shareFollowingFiltered = useMemo(() => {
        const q = shareFollowingFilter.trim().toLowerCase();
        if (!q) return shareFollowingList;
        return shareFollowingList.filter((u) => u.username.toLowerCase().includes(q));
    }, [shareFollowingList, shareFollowingFilter]);

    const handleGoEdit = useCallback(() => {
        if (!artwork) return;
        navigate(`/my-artworks/${artwork.id}/edit`, {
            state: buildEditPageEntryState(persistCloseTo),
        });
    }, [artwork, navigate, persistCloseTo]);

    const openDeleteDialog = useCallback(() => {
        setDeleteError("");
        setDeleteDialogOpen(true);
    }, []);

    const closeDeleteDialog = useCallback(() => {
        if (deleteBusy) return;
        setDeleteDialogOpen(false);
        setDeleteError("");
    }, [deleteBusy]);

    const confirmDeleteArtwork = useCallback(async () => {
        if (!artwork || !token) return;
        setDeleteBusy(true);
        setDeleteError("");
        try {
            const res = await fetch(`/api/artworks/${artwork.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.message ?? "删除失败");
            }
            setDeleteDialogOpen(false);
            navigate("/", { replace: true });
        } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "删除失败，请稍后重试");
        } finally {
            setDeleteBusy(false);
        }
    }, [artwork, navigate, token]);

    const handleSendComment = async () => {
        if (!artwork) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后发表评论",
                description: "登录后可参与讨论、回复他人，与作者互动。",
            });
            return;
        }
        if (!commentText.trim()) return;
        try {
            const res = await fetch(`/api/artworks/${artwork.id}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ content: commentText.trim() }),
            });
            if (res.ok) {
                setCommentText("");
                await loadComments();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleLikeComment = async (commentId: number) => {
        if (!token) {
            openAuthPrompt({
                title: "登录后点赞评论",
                description: "登录后可对评论点赞。",
            });
            return;
        }
        try {
            const res = await fetch(`/api/comments/${commentId}/like`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = (await res.json().catch(() => ({}))) as {
                likes?: number;
                alreadyLiked?: boolean;
            };
            const likes = typeof data.likes === "number" ? data.likes : undefined;
            if (likes == null) return;
            // 接口仅「点赞」：成功即当前用户已赞该评论（含幂等重复请求）
            setComments((prev) =>
                applyCommentLikeFromServer(prev, commentId, { likes, isLiked: true }),
            );
        } catch {
            /* 网络错误：不改动本地状态 */
        }
    };

    const handleReply = (commentId: number) => {
        const isClosing = replyingTo === commentId;
        setReplyingTo(isClosing ? null : commentId);
        if (isClosing) setReplyText((prev) => ({ ...prev, [commentId]: "" }));
    };

    const handleSendReply = async (commentId: number) => {
        const reply = replyText[commentId];
        if (!artwork) return;
        if (!token) {
            openAuthPrompt({
                title: "登录后回复评论",
                description: "登录后可回复他人的评论。",
            });
            return;
        }
        if (!reply?.trim()) return;
        try {
            const res = await fetch(`/api/artworks/${artwork.id}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ content: reply.trim(), parentId: commentId }),
            });
            if (res.ok) {
                setReplyText((prev) => ({ ...prev, [commentId]: "" }));
                setReplyingTo(null);
                await loadComments();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const toggleReplyThreadExpand = (commentId: number) => {
        setExpandedReplyThreads((prev) => {
            const next = new Set(prev);
            if (next.has(commentId)) next.delete(commentId);
            else next.add(commentId);
            return next;
        });
    };

    const renderMediaArea = () => {
        const currentArtwork = artwork;
        if (!currentArtwork) return null;
        const ownerTools = isOwnAuthor ? (
            <div className="artwork-detail-owner-inline-tools">
                <button type="button" className="artwork-detail-owner-btn" onClick={handleGoEdit}>
                    编辑
                </button>
                <button
                    type="button"
                    className="artwork-detail-owner-btn artwork-detail-owner-btn--danger"
                    onClick={openDeleteDialog}
                >
                    删除
                </button>
            </div>
        ) : null;

        if (kind === "emoji") {
            return (
                <div className="artwork-detail-image-stack artwork-detail-image-stack--emoji">
                    <div className="artwork-detail-gallery-head artwork-detail-gallery-head--emoji">
                        <div className="artwork-detail-gallery-topline">
                            <div className="artwork-detail-gallery-meta">
                                <span className="artwork-detail-kind-pill">表情包</span>
                                <span
                                    className={`artwork-detail-gallery-count artwork-detail-oc-privacy ${
                                        currentArtwork.ocPrivacy === "private" ? "artwork-detail-oc-privacy--private" : ""
                                    }`}
                                >
                                    {currentArtwork.ocPrivacy === "private" ? "私有" : "公共"}
                                </span>
                            </div>
                            {ownerTools}
                        </div>
                        <h2 className="artwork-detail-gallery-title">{currentArtwork.title}</h2>
                        <div className="artwork-detail-emoji-download-bar">
                            {emojiDownloadAllowed ? (
                                <button
                                    type="button"
                                    className="artwork-detail-emoji-download-btn"
                                    onClick={() => void handleEmojiDownloadAll()}
                                    disabled={emojiDownloadBusy || galleryImages.length === 0}
                                >
                                    {emojiDownloadBusy ? "正在逐个保存…" : `下载全部（${galleryImages.length} 张）`}
                                </button>
                            ) : (
                                <span className="artwork-detail-emoji-download-hint">作者未开放套图下载；保存图片请联系作者。</span>
                            )}
                        </div>
                    </div>
                    <div className={`artwork-detail-emoji-board artwork-detail-emoji-board--${galleryImages.length >= 9 ? 3 : 2}`}>
                        {galleryImages.map((src, index) => (
                            <div key={`${src}-${index}`} className="artwork-detail-emoji-cell">
                                <img src={src} alt={`${currentArtwork.title}-${index + 1}`} />
                                {emojiDownloadAllowed ? (
                                    <button
                                        type="button"
                                        className="artwork-detail-emoji-cell-dl"
                                        onClick={() => void handleEmojiDownloadOne(src, index)}
                                        aria-label={`下载第 ${index + 1} 张`}
                                    >
                                        下载
                                    </button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (kind === "worldview") {
            return (
                <div className="artwork-detail-image-stack artwork-detail-image-stack--worldview">
                    <div className="artwork-detail-gallery-head artwork-detail-gallery-head--worldview">
                        <div className="artwork-detail-gallery-topline">
                            <div className="artwork-detail-gallery-meta">
                                <span className="artwork-detail-kind-pill">世界观</span>
                                <span
                                    className={`artwork-detail-gallery-count artwork-detail-oc-privacy ${
                                        currentArtwork.ocPrivacy === "private" ? "artwork-detail-oc-privacy--private" : ""
                                    }`}
                                >
                                    {currentArtwork.ocPrivacy === "private" ? "私有" : "公共"}
                                </span>
                            </div>
                            {ownerTools}
                        </div>
                        <h2 className="artwork-detail-gallery-title">{currentArtwork.title}</h2>
                        {summary ? <p className="artwork-detail-gallery-summary">{summary}</p> : null}
                    </div>
                    <div className="artwork-detail-world-stage">
                        <div className="artwork-detail-image-wrapper artwork-detail-image-wrapper--worldview">
                            {!imageLoaded ? <div className="artwork-detail-image-placeholder" /> : null}
                            <img src={selectedImageSrc} alt={currentArtwork.title} className="artwork-detail-image artwork-detail-image--worldview" style={{ opacity: imageLoaded ? 1 : 0 }} />
                        </div>
                        {timelineEntry ? (
                            <div className="artwork-detail-world-preview-card">
                                <div className="artwork-detail-world-preview-title">{timelineEntry.section.title}</div>
                                <TimelineSection section={timelineEntry.section} />
                            </div>
                        ) : null}
                        {regionLayerEntry ? (
                            <div className="artwork-detail-world-preview-card">
                                <div className="artwork-detail-world-preview-title">{regionLayerEntry.section.title}</div>
                                <TimelineSection section={regionLayerEntry.section} />
                            </div>
                        ) : null}
                    </div>
                </div>
            );
        }

        const multiImageVertical = galleryImages.length > 1;

        return (
            <div className="artwork-detail-image-stack">
                <div className="artwork-detail-gallery-head">
                    <div className="artwork-detail-gallery-topline">
                        <div className="artwork-detail-gallery-meta">
                            <span className="artwork-detail-kind-pill">{artworkKindLabel(kind)}</span>
                            {kind === "oc" ? (
                                <span
                                    className={`artwork-detail-gallery-count artwork-detail-oc-privacy ${
                                        artwork.ocPrivacy === "private" ? "artwork-detail-oc-privacy--private" : ""
                                    }`}
                                >
                                    {artwork.ocPrivacy === "private" ? "私有" : "公共"}
                                </span>
                            ) : null}
                        </div>
                        {ownerTools}
                    </div>
                    <h2 className="artwork-detail-gallery-title">{currentArtwork.title}</h2>
                    {summary ? <p className="artwork-detail-gallery-summary">{summary}</p> : null}
                </div>
                {multiImageVertical ? (
                    <div className="artwork-detail-image-stack-vertical" aria-label="作品图集">
                        {galleryImages.map((src, index) => (
                            <div
                                key={`${src}-${index}`}
                                className="artwork-detail-image-wrapper artwork-detail-image-wrapper--stack"
                            >
                                <img
                                    src={src}
                                    alt={`${currentArtwork.title} · 第 ${index + 1} 张`}
                                    className="artwork-detail-image artwork-detail-image--stacked"
                                    loading={index > 0 ? "lazy" : undefined}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="artwork-detail-image-wrapper">
                        {!imageLoaded ? <div className="artwork-detail-image-placeholder" /> : null}
                        <img
                            src={selectedImageSrc}
                            alt={currentArtwork.title}
                            className="artwork-detail-image"
                            style={{ opacity: imageLoaded ? 1 : 0 }}
                        />
                    </div>
                )}
            </div>
        );
    };

    const renderTypeSpecificBlocks = () => {
        if (kind === "worldview") {
            return (
                <>
                    {introParagraphs.length > 0 ? (
                        <div className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">世界观概述</h3>
                            <div className="artwork-detail-prose">
                                {introParagraphs.map((paragraph, index) => (
                                    <p key={`${paragraph}-${index}`} className="artwork-detail-work-description artwork-detail-work-description--paragraph">{paragraph}</p>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {worldviewSettingEntry ? (
                        <div id={worldviewSettingEntry.id} className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">{worldviewSettingEntry.section.title}</h3>
                            <StructuredSection section={worldviewSettingEntry.section} />
                        </div>
                    ) : null}
                    {timelineEntry ? (
                        <div id={timelineEntry!.id} className="artwork-detail-card artwork-detail-card--timeline">
                            <h3 className="artwork-detail-section-title">{timelineEntry!.section.title}</h3>
                            <TimelineSection section={timelineEntry!.section} />
                        </div>
                    ) : null}
                    <div className="artwork-detail-card artwork-detail-card--reference">
                        <h3 className="artwork-detail-section-title">相关 OC</h3>
                        {worldviewRelatedOcReferenceItems.length === 0 ? (
                            <p>这个世界观下还没有展示中的关联 OC。</p>
                        ) : (
                            <div className="artwork-detail-linked-wv-stack">
                                {worldviewRelatedOcReferenceItems.map((item) => (
                                    <ReferenceCard
                                        key={item.key}
                                        title={item.title}
                                        summary={item.summary}
                                        imageUrl={item.imageUrl}
                                        caption="OC"
                                        to={item.to}
                                        linkState={item.to?.startsWith("/artwork/") ? artworkLinkState : undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    {regionLayerEntry ? (
                        <div id={regionLayerEntry.id} className="artwork-detail-card artwork-detail-card--timeline">
                            <h3 className="artwork-detail-section-title">{regionLayerEntry.section.title}</h3>
                            <TimelineSection section={regionLayerEntry.section} />
                        </div>
                    ) : null}
                    {worldviewContentEntries.map((entry) => (
                        <div id={entry.id} key={entry.id} className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">{entry.section.title}</h3>
                            <StructuredSection section={entry.section} />
                        </div>
                    ))}
                </>
            );
        }

        if (kind === "emoji") {
            return (
                <>
                    {introParagraphs.length > 0 ? (
                        <div className="artwork-detail-card artwork-detail-card--pack">
                            <h3 className="artwork-detail-section-title">套组介绍</h3>
                            <div className="artwork-detail-prose">
                                {introParagraphs.map((paragraph, index) => (
                                    <p key={`${paragraph}-${index}`} className="artwork-detail-work-description artwork-detail-work-description--paragraph">{paragraph}</p>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {(emojiDownloadPermissionBubble != null || emojiUsageSectionEntries.length > 0 || emojiUsageNotes.length > 0) ? (
                        <div className="artwork-detail-card artwork-detail-card--usage">
                            <div className="artwork-detail-usage-head">
                                <h3 className="artwork-detail-section-title">使用说明</h3>
                                {emojiDownloadPermissionBubble ? (
                                    <span
                                        className={`artwork-detail-emoji-dl-permission-badge${
                                            emojiDownloadPermissionBubble.allowed
                                                ? " artwork-detail-emoji-dl-permission-badge--allow"
                                                : " artwork-detail-emoji-dl-permission-badge--deny"
                                        }`}
                                    >
                                        {emojiDownloadPermissionBubble.text}
                                    </span>
                                ) : null}
                            </div>
                            {emojiUsageNotes.length > 0 ? (
                                <div className="artwork-detail-prose">
                                    {emojiUsageNotes.map((note) => (
                                        <p key={note} className="artwork-detail-work-description artwork-detail-work-description--paragraph">
                                            {note}
                                        </p>
                                    ))}
                                </div>
                            ) : null}
                            {emojiUsageSectionEntries.map((entry) => (
                                <div id={entry.id} key={entry.id} className="artwork-detail-pack-module">
                                    <h4 className="artwork-detail-section-subtitle">{entry.section.title}</h4>
                                    <StructuredSection section={entry.section} />
                                </div>
                            ))}
                        </div>
                    ) : null}
                </>
            );
        }

        if (kind === "oc") {
            return (
                <>
                    <div className="artwork-detail-card artwork-detail-card--reference">
                        <h3 className="artwork-detail-section-title">所属世界观</h3>
                        {resolvedLinkedWorldName ? (
                            (() => {
                                const ocWv0 = cardPayload?.ocLinkedWorldviews?.[0];
                                const refTo =
                                    resolvedLinkedWorldArtwork != null
                                        ? `/artwork/${resolvedLinkedWorldArtwork.id}`
                                        : ocWv0 && Number.isFinite(ocWv0.artworkId)
                                          ? `/artwork/${ocWv0.artworkId}`
                                          : undefined;
                                const refImg =
                                    resolvedLinkedWorldArtwork?.imageUrl ??
                                    (ocWv0 ? resolveMediaUrl(ocWv0.imageUrl ?? null) || null : null);
                                const refSummary =
                                    linkedWorldSummary ||
                                    (ocWv0?.authorUsername
                                        ? `创作者 @${ocWv0.authorUsername}`
                                        : resolvedLinkedWorldArtwork
                                          ? ""
                                          : "这个角色当前挂靠在该世界观下。");
                                return (
                                    <ReferenceCard
                                        title={resolvedLinkedWorldArtwork?.title || resolvedLinkedWorldName}
                                        summary={refSummary}
                                        imageUrl={refImg}
                                        caption="世界观"
                                        to={refTo}
                                        linkState={refTo?.startsWith("/artwork/") ? artworkLinkState : undefined}
                                    />
                                );
                            })()
                        ) : (
                            <p className="artwork-detail-empty-note">暂未填写所属世界观。</p>
                        )}
                    </div>
                    {introParagraphs.length > 0 ? (
                        <div className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">{getBodySectionTitle(kind)}</h3>
                            <div className="artwork-detail-prose">
                                {introParagraphs.map((paragraph, index) => (
                                    <p key={`${paragraph}-${index}`} className="artwork-detail-work-description artwork-detail-work-description--paragraph">{paragraph}</p>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {ocDetailSectionEntries.map((entry) => (
                        <div id={entry.id} key={entry.id} className="artwork-detail-card">
                            <h3 className="artwork-detail-section-title">{entry.section.title}</h3>
                            <StructuredSection section={entry.section} />
                        </div>
                    ))}
                </>
            );
        }

        return (
            <>
                {introParagraphs.length > 0 ? (
                    <div className="artwork-detail-card">
                        <h3 className="artwork-detail-section-title">{getBodySectionTitle(kind)}</h3>
                        <div className="artwork-detail-prose">
                            {introParagraphs.map((paragraph, index) => (
                                <p key={`${paragraph}-${index}`} className="artwork-detail-work-description artwork-detail-work-description--paragraph">{paragraph}</p>
                            ))}
                        </div>
                    </div>
                ) : null}
                {contentEntries.map((entry) => (
                    <div id={entry.id} key={entry.id} className="artwork-detail-card">
                        <h3 className="artwork-detail-section-title">{entry.section.title}</h3>
                        <StructuredSection section={entry.section} />
                    </div>
                ))}
            </>
        );
    };

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });

    if (loadState === "loading") {
        return (
            <div className="artwork-detail-page">
                <div className="artwork-detail-loading">
                    <p>加载中…</p>
                </div>
            </div>
        );
    }

    if (loadState === "error") {
        return (
            <div className="artwork-detail-page">
                <div className="artwork-detail-not-found">
                    <p>加载失败，请稍后重试</p>
                    <button type="button" onClick={() => navigate(0)}>
                        刷新
                    </button>
                    <button
                        type="button"
                        className="commission-detail-back commission-detail-back--close"
                        onClick={handleClosePage}
                        title="取消"
                        aria-label="取消"
                    >
                        <DetailPageCloseIcon />
                    </button>
                </div>
            </div>
        );
    }

    if (loadState === "missing" || !artwork) {
        return (
            <div className="artwork-detail-page">
                <div className="artwork-detail-not-found">
                    <p>作品未找到</p>
                    <button
                        type="button"
                        className="commission-detail-back commission-detail-back--close"
                        onClick={handleClosePage}
                        title="取消"
                        aria-label="取消"
                    >
                        <DetailPageCloseIcon />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`artwork-detail-page artwork-detail-page--${kind}`}>
            <div className="artwork-detail-container">
                <div className="artwork-detail-image-section">
                    <div className="artwork-detail-image-scroll">{renderMediaArea()}</div>
                </div>

                <div className="artwork-detail-info-section">
                    <div className="artwork-detail-info-scroll">
                        <button
                            type="button"
                            className="commission-detail-back commission-detail-back--close"
                            onClick={handleClosePage}
                            title="取消"
                            aria-label="取消"
                        >
                            <DetailPageCloseIcon />
                        </button>

                        <div className="artwork-detail-card">
                            <div className="artwork-detail-author-section">
                                <div className="artwork-detail-author-header">
                                    {artwork.authorAvatar ? (
                                        <img src={artwork.authorAvatar} alt={artwork.author} className="artwork-detail-author-avatar" />
                                    ) : (
                                        <div className="artwork-detail-author-avatar artwork-detail-author-avatar--fallback">{artwork.author.slice(0, 1)}</div>
                                    )}
                                    <div className="artwork-detail-author-info">
                                        <div className="artwork-detail-author-name-row">
                                            {authorId != null ? (
                                                <Link to={`/user/${authorId}`} className="artwork-detail-author-name artwork-detail-author-link">
                                                    {artwork.author}
                                                </Link>
                                            ) : (
                                                <div className="artwork-detail-author-name">{artwork.author}</div>
                                            )}
                                            {!isOwnAuthor ? (
                                                <button className={`artwork-detail-follow-btn ${isFollowing ? "following" : ""}`} onClick={handleFollowClick}>
                                                    {isFollowing ? "已关注" : "关注"}
                                                </button>
                                            ) : null}
                                        </div>
                                        <div className="artwork-detail-author-bio">{authorBio || "暂未填写简介"}</div>
                                    </div>
                                </div>

                                <div className="artwork-detail-action-buttons">
                                    <button className={`artwork-detail-action-btn artwork-detail-like-btn ${isLiked ? "liked" : ""}`} onClick={handleLikeClick} title={token ? (isLiked ? "取消点赞" : "点赞") : "登录后可点赞"} type="button">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                        </svg>
                                        <span>点赞</span>
                                    </button>
                                    <button className={`artwork-detail-action-btn artwork-detail-save-btn ${isSaved ? "saved" : ""}`} onClick={handleFavoriteClick} title={token ? (isSaved ? "取消收藏" : "收藏") : "登录后可收藏"} type="button">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        <span>收藏</span>
                                    </button>
                                </div>
                            </div>

                            <div className="artwork-detail-work-section">
                                <div className="artwork-detail-work-meta-row">
                                    <span className="artwork-detail-kind-pill">{artworkKindLabel(kind)}</span>
                                    <span className="artwork-detail-work-date">{formatDate(artwork.createdAt)}</span>
                                </div>
                                <h1 className="artwork-detail-work-title">{artwork.title}</h1>
                                {kind === "emoji" ? (
                                    summary.trim() ? <p className="artwork-detail-work-summary">{summary.trim()}</p> : null
                                ) : displaySummary ? (
                                    <p className="artwork-detail-work-summary">{displaySummary}</p>
                                ) : null}
                                {kind === "oc" ? (
                                    <div
                                        className="artwork-detail-facts-grid artwork-detail-facts-grid--oc-identity"
                                        aria-label="角色档案要点"
                                    >
                                        {ocIdentityMiniCards.map((field) => (
                                            <div key={field.label} className="artwork-detail-fact">
                                                <div className="artwork-detail-fact-label">{field.label}</div>
                                                <div
                                                    className={`artwork-detail-fact-value${field.value === "未公开" ? " artwork-detail-fact-value--muted" : ""}`}
                                                >
                                                    {field.value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                {kind !== "worldview" && kind !== "oc" && highlightBadges.length > 0 ? (
                                    <div className="artwork-detail-badges">
                                        {highlightBadges.map((item) => (
                                            <span key={item} className="artwork-detail-badge">{item}</span>
                                        ))}
                                    </div>
                                ) : null}
                                {kind !== "worldview" && kind !== "emoji" && quickFacts.length > 0 ? (
                                    <div className="artwork-detail-facts-grid">
                                        {quickFacts.map((field) => (
                                            <div key={`${field.label}-${field.value}`} className="artwork-detail-fact">
                                                <div className="artwork-detail-fact-label">{field.label}</div>
                                                <div className="artwork-detail-fact-value">{field.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="artwork-detail-work-stats">
                                    <div className="artwork-detail-work-stat">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                        </svg>
                                        <span>{artwork.likes || 0}</span>
                                    </div>
                                    <div className="artwork-detail-work-stat">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                        <span>{artwork.views || 0}</span>
                                    </div>
                                    <div className="artwork-detail-work-stat">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        <span>{commentsCount}</span>
                                    </div>
                                    <button type="button" className="artwork-detail-share-btn" title="分享给关注的用户" onClick={handleShareClick}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="18" cy="5" r="3"></circle>
                                            <circle cx="6" cy="12" r="3"></circle>
                                            <circle cx="18" cy="19" r="3"></circle>
                                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                        </svg>
                                        <span>分享</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {renderTypeSpecificBlocks()}

                        <div className="artwork-detail-card artwork-detail-comments-card">
                            <div className="artwork-detail-comments-head">
                                <h3 className="artwork-detail-comments-title">{commentMeta.title}</h3>
                                <span className="artwork-detail-comments-count">{commentsCount} 条评论</span>
                            </div>
                            <div className="artwork-detail-comment-composer">
                                <div className="artwork-detail-comment-composer-field">
                                    <input
                                        type="text"
                                        placeholder={commentMeta.placeholder}
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                void handleSendComment();
                                            }
                                        }}
                                    />
                                </div>
                                <button type="button" className="artwork-detail-comment-composer-send" onClick={() => void handleSendComment()} disabled={!!token && !commentText.trim()}>
                                    发布
                                </button>
                            </div>
                            <div className="artwork-detail-comments-list">
                                {comments.map((comment) => {
                                    const hasReplies = comment.replies && comment.replies.length > 0;
                                    const repliesExpanded = expandedReplyThreads.has(comment.id);
                                    const replyCount = countAllRepliesUnder(comment.replies);

                                    return (
                                        <div key={comment.id} className="artwork-detail-comment-item">
                                            <div className="artwork-detail-comment-avatar artwork-detail-comment-avatar--root">
                                                {comment.authorAvatar ? <img src={comment.authorAvatar} alt={comment.author} /> : <div className="artwork-detail-comment-avatar-fallback">{(comment.author || "?").slice(0, 1)}</div>}
                                            </div>
                                            <div className="artwork-detail-comment-main">
                                                <div className="artwork-detail-comment-userline">
                                                    <span className="artwork-detail-comment-author">{comment.author}</span>
                                                </div>
                                                <p className="artwork-detail-comment-text">{comment.text}</p>
                                                <div className="artwork-detail-comment-toolbar">
                                                    <button type="button" className={`artwork-detail-comment-like ${comment.isLiked ? "liked" : ""}`} onClick={() => void handleLikeComment(comment.id)}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill={comment.isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                                        </svg>
                                                        <span>{comment.likes || 0}</span>
                                                    </button>
                                                    <button type="button" className="artwork-detail-comment-reply-btn" onClick={() => handleReply(comment.id)}>回复</button>
                                                </div>
                                                {hasReplies ? (
                                                    <button type="button" className="artwork-detail-replies-toggle" onClick={() => toggleReplyThreadExpand(comment.id)}>
                                                        {repliesExpanded ? "收起" : `共 ${replyCount} 条回复`}
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            {repliesExpanded ? <polyline points="18 15 12 9 6 15"></polyline> : <polyline points="6 9 12 15 18 9"></polyline>}
                                                        </svg>
                                                    </button>
                                                ) : null}
                                                {replyingTo === comment.id ? (
                                                    <div className="artwork-detail-reply-input">
                                                        <input type="text" placeholder={`回复 @${comment.author}：`} value={replyText[comment.id] || ""} onChange={(e) => setReplyText((prev) => ({ ...prev, [comment.id]: e.target.value }))} onKeyDown={(e) => {
                                                            if (e.key === "Enter" && !e.shiftKey) {
                                                                e.preventDefault();
                                                                void handleSendReply(comment.id);
                                                            }
                                                        }} />
                                                        <button type="button" onClick={() => void handleSendReply(comment.id)} disabled={hasToken && !replyText[comment.id]?.trim()}>发送</button>
                                                    </div>
                                                ) : null}
                                                {hasReplies && repliesExpanded ? (
                                                    <div className="artwork-detail-replies-box">
                                                        <div className="artwork-detail-replies-list">
                                                            {comment.replies!.map((reply) => (
                                                                <ReplyTreeNode key={reply.id} reply={reply} parentAuthorName={comment.author} replyingTo={replyingTo} replyText={replyText} onReply={handleReply} onLike={handleLikeComment} onSend={handleSendReply} setReplyTextFor={(commentId, text) => setReplyText((prev) => ({ ...prev, [commentId]: text }))} hasToken={hasToken} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {tags.length > 0 ? (
                            <div className="artwork-detail-card">
                                <h3 className="artwork-detail-section-title">标签</h3>
                                <div className="artwork-detail-tags-list">
                                    {tags.map((tag) => (
                                        <span key={tag} className="artwork-detail-tag">{tag}</span>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {displayedAuthorOtherWorks.length > 0 ? (
                            <div className="artwork-detail-card">
                                <h3 className="artwork-detail-section-title">该作者的其他{artworkKindLabel(kind)}</h3>
                                <div className="artwork-detail-other-works-grid">
                                    {displayedAuthorOtherWorks.map((work) => (
                                        <div key={work.id} className="artwork-detail-other-work-item" onClick={() => navigate(`/artwork/${work.id}`, { state: artworkLinkState })} role="button" tabIndex={0} onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                navigate(`/artwork/${work.id}`, { state: artworkLinkState });
                                            }
                                        }}>
                                            <img src={work.imageUrl} alt={work.title} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            {shareModalOpen && artwork ? (
                <div
                    className="artwork-detail-share-modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="artwork-share-modal-title"
                    onClick={closeShareModal}
                >
                    <div className="artwork-detail-share-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="artwork-detail-share-modal-head">
                            <h2 id="artwork-share-modal-title" className="artwork-detail-share-modal-title">
                                分享给关注的用户
                            </h2>
                            <button
                                type="button"
                                className="artwork-detail-share-modal-close"
                                onClick={closeShareModal}
                                disabled={shareSendingUserId !== null}
                                aria-label="关闭"
                            >
                                ×
                            </button>
                        </div>
                        <p className="artwork-detail-share-modal-desc">仅可向「我关注的用户」发送；对方会在私信里看到作品卡片。</p>
                        <input
                            type="search"
                            className="artwork-detail-share-modal-filter"
                            placeholder="按用户名筛选"
                            value={shareFollowingFilter}
                            onChange={(e) => setShareFollowingFilter(e.target.value)}
                            disabled={shareFollowingLoading || shareSendingUserId !== null}
                        />
                        {shareError ? <p className="artwork-detail-delete-modal-error">{shareError}</p> : null}
                        <div className="artwork-detail-share-modal-list" role="list">
                            {shareFollowingLoading ? (
                                <p className="artwork-detail-share-modal-empty">加载中…</p>
                            ) : shareFollowingFiltered.length === 0 ? (
                                <div className="artwork-detail-share-modal-empty">
                                    {shareFollowingList.length === 0 && !shareFollowingFilter.trim() ? (
                                        <>
                                            <p>你还没有关注任何用户。</p>
                                            <button
                                                type="button"
                                                className="artwork-detail-share-modal-cta"
                                                onClick={() => {
                                                    setShareModalOpen(false);
                                                    navigate("/me/follows?tab=following");
                                                }}
                                            >
                                                去管理关注
                                            </button>
                                        </>
                                    ) : (
                                        <p>没有匹配的用户。</p>
                                    )}
                                </div>
                            ) : (
                                shareFollowingFiltered.map((u) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        className="artwork-detail-share-modal-row"
                                        onClick={() => void sendShareToFollowingUser(u.id)}
                                        disabled={shareSendingUserId !== null}
                                    >
                                        <span className="artwork-detail-share-modal-avatar">
                                            {u.avatarUrl ? (
                                                <img src={resolveMediaUrl(u.avatarUrl) || u.avatarUrl} alt="" />
                                            ) : (
                                                <span aria-hidden="true">{(u.username || "?").slice(0, 1)}</span>
                                            )}
                                        </span>
                                        <span className="artwork-detail-share-modal-username">{u.username}</span>
                                        <span className="artwork-detail-share-modal-send">
                                            {shareSendingUserId === u.id ? "发送中…" : "发送"}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                        <div className="artwork-detail-share-modal-foot">
                            <button
                                type="button"
                                className="artwork-detail-delete-modal-btn"
                                onClick={closeShareModal}
                                disabled={shareSendingUserId !== null}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
            {deleteDialogOpen ? (
                <div className="artwork-detail-delete-modal-overlay" role="dialog" aria-modal="true" onClick={closeDeleteDialog}>
                    <div className="artwork-detail-delete-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="artwork-detail-delete-modal-title">确认删除这个作品吗？</div>
                        <p className="artwork-detail-delete-modal-desc">删除后将从主页、详情和相关列表中移除，且不可恢复。</p>
                        {deleteError ? <p className="artwork-detail-delete-modal-error">{deleteError}</p> : null}
                        <div className="artwork-detail-delete-modal-actions">
                            <button
                                type="button"
                                className="artwork-detail-delete-modal-btn"
                                onClick={closeDeleteDialog}
                                disabled={deleteBusy}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                className="artwork-detail-delete-modal-btn artwork-detail-delete-modal-btn--danger"
                                onClick={() => void confirmDeleteArtwork()}
                                disabled={deleteBusy}
                            >
                                {deleteBusy ? "删除中..." : "确认删除"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
