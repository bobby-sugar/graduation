import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAuthPrompt } from "../contexts/AuthPromptContext";
import {
    buildStudioDescription,
    getStudioArtworkTags,
    getStudioArtworkTitle,
    mergeDescriptionWithCardPayload,
    STUDIO_LEGACY_PRIVACY_DESCRIPTION_MARKER,
    stripLegacyStudioPrivacyDescriptionMarker,
    studioCategoryToApi,
} from "../utils/studioArtwork";
import { splitDescriptionAndCardPayload } from "../artwork/cardPayload";
import { resolveApiUrl, toStorageUrl } from "../config/api";
import { WorldviewTimelineEditor, type WorldviewTimelineRow } from "./WorldviewTimelineEditor";
import { CategoryFieldsRenderer } from "./CategoryFieldsRenderer";
import { StudioCategoryPreviewBody } from "./CategoryPreviewBody";
import { resolveArtworkUrl } from "../components/artwork/resolveArtworkUrl";
import { getStudioFormFields, partitionStudioFields, studioFieldPlaceholder, type FormFieldDef } from "./studioFormFields";
import type { OcWorldviewLink } from "./ocWorldviewLinks";
import { normalizePickReturnPath } from "./worldviewPickUiMemory";
import {
    clearWorldviewStudioSession,
    hasWorldviewStudioPendingRestore,
    mergeWorldviewStudioSessionLinkedOcs,
    readWorldviewStudioSession,
    saveWorldviewStudioBeforeLinkedOcPick,
} from "./studioWorldviewSession";
import { OcTagsPanel } from "./OcTagsPanel";
import { normalizeEmojiTagsField, normalizeOcTagsField, normalizeWorldviewTagsField } from "./ocStudioTags";
import {
    clearOcStudioImageSession,
    dataUrlsToOcImageFiles,
    readOcStudioImageSession,
    saveOcStudioImagesBeforeWorldviewPick,
} from "./studioOcImageSession";

type OcLinkPrivacy = "public" | "private";

const CATEGORIES: { name: string; icon: string }[] = [
    { name: "OC", icon: "👤" },
    { name: "世界观", icon: "🌍" },
    { name: "表情包", icon: "😂" },
];

/** 新建表情包时写入「使用说明 / 版权规则」的默认正文，发布前可按套组自行修改 */
const DEFAULT_EMOJI_USAGE_NOTES =
    "【许可范围】本套表情仅供个人聊天、同好交流等非商业场景使用。\n\n" +
    "【禁止事项】请勿用于商业广告、实物印刷、二次售卖或冒充原作者；请勿用于训练生成式 AI 模型。\n\n" +
    "【转载与二创】转发、切片或改图再发布时请注明原作者及本作品页；若不接受以上约定，请勿下载或使用。\n\n" +
    "【商业与合作】商用、印刷、周边或品牌合作等，请联系作者另行取得书面授权（请把本段改为你的联系方式或说明）。";

interface StudioWorkstationProps {
    onPublished: (id: number) => void;
    mode?: "create" | "edit";
    editingArtworkId?: number;
}

type EditableArtworkDetail = {
    id: number;
    title: string;
    description?: string | null;
    category?: string | null;
    imageUrl?: string | null;
    tags?: string | null;
    gender?: string | null;
    ocPrivacy?: "public" | "private" | null;
    authorId?: number;
    author?: { id?: number };
};

function parseDescriptionSections(prose: string): { intro: string; sectionMap: Record<string, string[]>; metaMap: Record<string, string> } {
    const normalized = (prose ?? "").replace(/\r/g, "").trim();
    if (!normalized) return { intro: "", sectionMap: {}, metaMap: {} };
    const lines = normalized.split("\n");
    const intro: string[] = [];
    const sectionMap: Record<string, string[]> = {};
    let current = "";
    for (const raw of lines) {
        const line = raw.trim();
        const m = line.match(/^【(.+?)】$/);
        if (m) {
            current = m[1].trim();
            if (!sectionMap[current]) sectionMap[current] = [];
            continue;
        }
        if (current) sectionMap[current].push(line);
        else intro.push(line);
    }
    const metaMap: Record<string, string> = {};
    Object.values(sectionMap).forEach((rows) => {
        rows.forEach((line) => {
            const kv = line.match(/^([^：:\n]{1,30})[：:]\s*(.*)$/);
            if (kv) metaMap[kv[1].trim()] = kv[2].trim();
        });
    });
    return { intro: intro.join("\n").trim(), sectionMap, metaMap };
}

export default function StudioWorkstation({ onPublished, mode = "create", editingArtworkId }: StudioWorkstationProps) {
    const { token, user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const isEditMode = mode === "edit" && Number.isFinite(editingArtworkId);
    const navigate = useNavigate();
    const location = useLocation();
    const [category, setCategory] = useState(() => (hasWorldviewStudioPendingRestore() ? "世界观" : "OC"));
    /** 仅在从「世界观」切到其他分类时清空世界观 session，避免 /studio 默认 OC 误清跳转前保存的快照 */
    const prevCategoryRef = useRef<string | null>(null);
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [ocWorldviewLink, setOcWorldviewLink] = useState<OcWorldviewLink | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    /** 表情包套图等，不含主封面 */
    const [extraImageFiles, setExtraImageFiles] = useState<File[]>([]);
    const [extraImagePreviews, setExtraImagePreviews] = useState<string[]>([]);
    const [visibility, setVisibility] = useState<"public" | "private">("public");
    /** OC：世界观等侧可关联范围（后端 ocPrivacy；私有 OC 不会出现在 /api/artworks/linkable-ocs） */
    const [ocPrivacy, setOcPrivacy] = useState<OcLinkPrivacy>("public");
    /** OC：主封面是否出现在详情页底部图集；关闭时仅展示「更多配图」，且须至少 1 张配图 */
    const [ocCoverInDetailGallery, setOcCoverInDetailGallery] = useState(true);
    /** 世界观：时间线节点（写入正文【时间线】与卡片 JSON） */
    const [worldviewTimeline, setWorldviewTimeline] = useState<WorldviewTimelineRow[]>([]);
    /** 世界观：区域图层（写入正文【区域图层】与卡片 JSON） */
    const [worldviewRegionLayers, setWorldviewRegionLayers] = useState<WorldviewTimelineRow[]>([]);
    /** 世界观：相关 OC（挑选页写入，与卡片 / 正文「关联 OC」一致） */
    const [worldviewLinkedOcs, setWorldviewLinkedOcs] = useState<OcWorldviewLink[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [forbiddenEdit, setForbiddenEdit] = useState(false);
    const [existingExtraImageUrls, setExistingExtraImageUrls] = useState<string[]>([]);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const extraInputRef = useRef<HTMLInputElement>(null);
    const allExtraPreviews = useMemo(
        () => [...existingExtraImageUrls.map((x) => resolveApiUrl(x)), ...extraImagePreviews],
        [existingExtraImageUrls, extraImagePreviews],
    );

    const fields = useMemo(() => getStudioFormFields(category), [category]);
    const { titleField, taglineField, descField, section3Fields: s3raw } = useMemo(
        () => partitionStudioFields(category, fields),
        [category, fields],
    );
    const section3Fields = useMemo(() => s3raw.filter((f) => f.name !== "tags"), [s3raw]);

    const resetOcExtras = () => {
        setOcWorldviewLink(null);
    };

    useEffect(() => {
        if (isEditMode) return;
        const prevCat = prevCategoryRef.current;
        prevCategoryRef.current = category;
        if (prevCat === "世界观" && category !== "世界观") {
            clearWorldviewStudioSession();
        }

        const ocImgSnap = category === "OC" ? readOcStudioImageSession() : null;
        const wvSnap = category === "世界观" ? readWorldviewStudioSession() : null;

        const sessionHasImages =
            category === "OC" &&
            ocImgSnap != null &&
            (Boolean(ocImgSnap.coverDataUrl) || ocImgSnap.extrasDataUrls.length > 0);
        const sessionHasForm =
            category === "OC" &&
            ocImgSnap?.formData != null &&
            typeof ocImgSnap.formData === "object" &&
            !Array.isArray(ocImgSnap.formData) &&
            Object.keys(ocImgSnap.formData).length > 0;

        const sessionRestore = category === "OC" && (sessionHasImages || sessionHasForm);

        const wvHasSnap =
            wvSnap != null &&
            (Boolean(wvSnap.coverDataUrl) ||
                wvSnap.extrasDataUrls.length > 0 ||
                (wvSnap.formData != null &&
                    typeof wvSnap.formData === "object" &&
                    !Array.isArray(wvSnap.formData) &&
                    Object.keys(wvSnap.formData).length > 0) ||
                (wvSnap.worldviewTimeline != null && wvSnap.worldviewTimeline.length > 0) ||
                (wvSnap.worldviewRegionLayers != null && wvSnap.worldviewRegionLayers.length > 0) ||
                (wvSnap.worldviewLinkedOcs != null && wvSnap.worldviewLinkedOcs.length > 0));
        const wvSessionRestore = category === "世界观" && wvHasSnap;

        if (!sessionRestore && !wvSessionRestore) {
            setFormData(
                category === "OC"
                    ? { tags: "oc" }
                    : category === "世界观"
                      ? { tags: "worldview" }
                      : category === "表情包"
                        ? { tags: "emoji", usageNotes: DEFAULT_EMOJI_USAGE_NOTES }
                        : {},
            );
            if (category === "世界观") {
                setWorldviewTimeline([]);
                setWorldviewRegionLayers([]);
                setWorldviewLinkedOcs([]);
            }
        }
        resetOcExtras();
        if (category !== "OC") {
            clearOcStudioImageSession();
        }
        if (!sessionRestore && !wvSessionRestore) {
            setCoverFile(null);
            setCoverPreview(null);
            setExtraImageFiles([]);
            setExtraImagePreviews([]);
            setOcCoverInDetailGallery(true);
            setOcPrivacy("public");
        }

        if (sessionRestore && ocImgSnap) {
            if (sessionHasForm && ocImgSnap.formData) {
                setFormData({
                    ...ocImgSnap.formData,
                    tags: normalizeOcTagsField(ocImgSnap.formData.tags),
                });
            } else if (category === "OC") {
                setFormData({ tags: "oc" });
            }
            if (ocImgSnap.ocPrivacy === "private" || ocImgSnap.ocPrivacy === "public") {
                setOcPrivacy(ocImgSnap.ocPrivacy);
            }
            if (typeof ocImgSnap.ocCoverInDetailGallery === "boolean") {
                setOcCoverInDetailGallery(ocImgSnap.ocCoverInDetailGallery);
            }
            if (sessionHasImages) {
                setCoverPreview(ocImgSnap.coverDataUrl);
                setExtraImagePreviews([...ocImgSnap.extrasDataUrls]);
                void dataUrlsToOcImageFiles(ocImgSnap.coverDataUrl, ocImgSnap.extrasDataUrls).then(({ coverFile, extraFiles }) => {
                    setCoverFile(coverFile);
                    setExtraImageFiles(extraFiles);
                });
            }
            window.setTimeout(() => {
                clearOcStudioImageSession();
            }, 0);
        }

        if (wvSessionRestore && wvSnap) {
            if (wvSnap.formData && typeof wvSnap.formData === "object" && !Array.isArray(wvSnap.formData)) {
                setFormData({ ...wvSnap.formData });
            } else {
                setFormData({ tags: "worldview" });
            }
            if (wvSnap.visibility === "private" || wvSnap.visibility === "public") {
                setVisibility(wvSnap.visibility);
            }
            if (wvSnap.worldviewTimeline?.length) {
                setWorldviewTimeline(
                    wvSnap.worldviewTimeline.map((t, i) => ({
                        id: `tl-${Date.now()}-${i}`,
                        label: typeof t.label === "string" ? t.label : "",
                        value: typeof t.value === "string" ? t.value : "",
                    })),
                );
            } else {
                setWorldviewTimeline([]);
            }
            if (wvSnap.worldviewRegionLayers?.length) {
                setWorldviewRegionLayers(
                    wvSnap.worldviewRegionLayers.map((t, i) => ({
                        id: `rl-${Date.now()}-${i}`,
                        label: typeof t.label === "string" ? t.label : "",
                        value: typeof t.value === "string" ? t.value : "",
                    })),
                );
            } else {
                setWorldviewRegionLayers([]);
            }
            if (wvSnap.worldviewLinkedOcs != null && wvSnap.worldviewLinkedOcs.length > 0) {
                setWorldviewLinkedOcs(wvSnap.worldviewLinkedOcs);
            } else {
                setWorldviewLinkedOcs([]);
            }
            if (Boolean(wvSnap.coverDataUrl) || wvSnap.extrasDataUrls.length > 0) {
                setCoverPreview(wvSnap.coverDataUrl);
                setExtraImagePreviews([...wvSnap.extrasDataUrls]);
                void dataUrlsToOcImageFiles(wvSnap.coverDataUrl, wvSnap.extrasDataUrls).then(({ coverFile, extraFiles }) => {
                    setCoverFile(coverFile);
                    setExtraImageFiles(extraFiles);
                });
            }
            /* 不在此处清空 session：否则 React Strict 二次 effect 时读不到快照会走「重置」分支并清空表单与配图。
             * 清空时机：切到其他作品类型、发布成功、或从挑选页带回 OC 时仅 merge 关联列表（见下方 effect）。 */
        }

        setError("");
    }, [category]);

    useEffect(() => {
        if (category !== "OC") return;
        if (!ocCoverInDetailGallery && allExtraPreviews.length === 0) {
            setOcCoverInDetailGallery(true);
        }
    }, [allExtraPreviews.length, category, ocCoverInDetailGallery]);

    useEffect(() => {
        const s = location.state as { ocWorldviewPicked?: OcWorldviewLink | OcWorldviewLink[] | null } | null | undefined;
        if (!s || typeof s !== "object" || !("ocWorldviewPicked" in s)) return;
        const raw = s.ocWorldviewPicked;
        const next: OcWorldviewLink | null = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
        setOcWorldviewLink(next);
        navigate(location.pathname, { replace: true, state: {} });
    }, [location.state, location.pathname, navigate]);

    useEffect(() => {
        const s = location.state as { worldviewLinkedOcsPicked?: OcWorldviewLink[] } | null | undefined;
        if (!s || typeof s !== "object" || !Array.isArray(s.worldviewLinkedOcsPicked)) return;
        const picked = s.worldviewLinkedOcsPicked;
        setWorldviewLinkedOcs(picked);
        mergeWorldviewStudioSessionLinkedOcs(picked);
        navigate(location.pathname, { replace: true, state: {} });
    }, [location.state, location.pathname, navigate]);

    useEffect(() => {
        if (!isEditMode || !token || !editingArtworkId) return;
        let cancelled = false;
        const run = async () => {
            setLoadingEdit(true);
            setForbiddenEdit(false);
            setError("");
            try {
                const res = await fetch(`/api/artworks/${editingArtworkId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("作品加载失败");
                const data = (await res.json()) as EditableArtworkDetail | null;
                if (!data) throw new Error("作品不存在");
                const authorId = typeof data.authorId === "number" ? data.authorId : data.author?.id;
                if (!authorId || !user || authorId !== user.id) {
                    if (!cancelled) setForbiddenEdit(true);
                    return;
                }
                const kind = String(data.category ?? "").toLowerCase();
                const uiCategory = kind === "worldview" ? "世界观" : kind === "emoji" ? "表情包" : "OC";
                const rawDescription = data.description ?? "";
                const hadLegacyPrivateMarker = rawDescription.includes(STUDIO_LEGACY_PRIVACY_DESCRIPTION_MARKER);
                const parsed = splitDescriptionAndCardPayload(stripLegacyStudioPrivacyDescriptionMarker(rawDescription));
                const sections = parseDescriptionSections(parsed.prose ?? "");
                const p = parsed.payload;
                const baseForm: Record<string, unknown> = {
                    name: (data.title ?? "").trim(),
                    tags: (data.tags ?? "").trim() || (uiCategory === "世界观" ? "worldview" : uiCategory === "表情包" ? "emoji" : "oc"),
                };
                if (uiCategory === "OC") {
                    baseForm.gender = (data.gender ?? "").trim();
                    baseForm.tagline = sections.metaMap["角色简介"] ?? sections.intro ?? "";
                    setOcPrivacy(data.ocPrivacy === "private" ? "private" : "public");
                    setOcWorldviewLink(
                        p?.ocLinkedWorldviews?.[0]
                            ? {
                                  id: `wv-${p.ocLinkedWorldviews[0].artworkId}`,
                                  artworkId: p.ocLinkedWorldviews[0].artworkId,
                                  title: p.ocLinkedWorldviews[0].title,
                                  authorUsername: p.ocLinkedWorldviews[0].authorUsername ?? "",
                                  authorId: p.ocLinkedWorldviews[0].authorId,
                                  imageUrl: p.ocLinkedWorldviews[0].imageUrl ?? null,
                              }
                            : null,
                    );
                } else if (uiCategory === "世界观") {
                    baseForm.tagline = p?.worldview?.summaryHint ?? sections.metaMap["一句话设定"] ?? "";
                    baseForm.description = sections.intro ?? "";
                    baseForm.type = sections.metaMap["类型"] ?? "";
                    baseForm.era = sections.metaMap["时代/背景"] ?? "";
                    baseForm.regions = sections.metaMap["地域/舞台"] ?? "";
                    baseForm.factions = sections.metaMap["阵营/势力"] ?? "";
                    baseForm.coreConflict = sections.metaMap["核心冲突"] ?? "";
                    baseForm.worldRules = sections.metaMap["世界规则"] ?? "";
                    baseForm.keyTheme = sections.metaMap["核心主题"] ?? "";
                    baseForm.relatedCharacters =
                        p?.worldview?.relatedCharacters?.join("、") ?? sections.metaMap["关联 OC"] ?? "";
                    setVisibility(
                        data.ocPrivacy === "private"
                            ? "private"
                            : hadLegacyPrivateMarker
                              ? "private"
                              : "public",
                    );
                    setWorldviewTimeline(
                        (p?.worldview?.timeline ?? []).map((row, i) => ({
                            id: `tl-${Date.now()}-${i}`,
                            label: (row.label ?? "").trim(),
                            value: (row.value ?? "").trim(),
                        })),
                    );
                    setWorldviewRegionLayers(
                        (p?.worldview?.regionLayers ?? []).map((row, i) => ({
                            id: `rl-${Date.now()}-${i}`,
                            label: (row.label ?? "").trim(),
                            value: (row.value ?? "").trim(),
                        })),
                    );
                    setWorldviewLinkedOcs(
                        (p?.worldview?.linkedOcsPreview ?? []).map((x) => ({
                            id: `oc-${x.artworkId}`,
                            artworkId: x.artworkId,
                            title: x.title,
                            imageUrl: x.imageUrl ?? null,
                            authorUsername: x.authorUsername ?? "",
                        })),
                    );
                } else {
                    baseForm.tagline = sections.metaMap["一句话介绍"] ?? "";
                    baseForm.description = sections.intro ?? "";
                    baseForm.allowDownload =
                        p?.emoji?.downloadable === true ? "是" : p?.emoji?.downloadable === false ? "否" : sections.metaMap["允许下载"] ?? "";
                    baseForm.usageNotes = p?.emoji?.usageNotes ?? "";
                    setVisibility(
                        data.ocPrivacy === "private"
                            ? "private"
                            : hadLegacyPrivateMarker
                              ? "private"
                              : "public",
                    );
                }
                if (cancelled) return;
                setCategory(uiCategory);
                setFormData(baseForm);
                setCoverPreview(resolveApiUrl(data.imageUrl));
                setCoverFile(null);
                setExistingExtraImageUrls((p?.extraImageUrls ?? []).filter(Boolean));
                setExtraImageFiles([]);
                setExtraImagePreviews([]);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
            } finally {
                if (!cancelled) setLoadingEdit(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [editingArtworkId, isEditMode, token, user]);

    const handleChange = useCallback((name: string, value: unknown) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    }, []);

    const goPickWorldview = useCallback(
        (initial: OcWorldviewLink | null) => {
            saveOcStudioImagesBeforeWorldviewPick(coverPreview, allExtraPreviews, {
                formData,
                ocPrivacy,
                ocCoverInDetailGallery,
            });
            navigate("/studio/pick-worldview", {
                state: {
                    returnPath: normalizePickReturnPath(location.pathname),
                    initial,
                    resultChannel: "router",
                },
            });
        },
        [allExtraPreviews, coverPreview, formData, ocCoverInDetailGallery, ocPrivacy, navigate, location.pathname],
    );

    const goPickLinkedOcs = useCallback(() => {
        if (!token) {
            openAuthPrompt({
                title: "登录后选择相关 OC",
                description: "登录后即可在「我的」中选择全部 OC（含私有），在全站列表中选择公共 OC。",
            });
            return;
        }
        saveWorldviewStudioBeforeLinkedOcPick(coverPreview, allExtraPreviews, {
            formData,
            visibility,
            worldviewTimeline: worldviewTimeline.map(({ label, value }) => ({ label, value })),
            worldviewRegionLayers: worldviewRegionLayers.map(({ label, value }) => ({ label, value })),
            worldviewLinkedOcs,
        });
        navigate("/studio/pick-linked-oc", {
            state: {
                returnPath: normalizePickReturnPath(location.pathname),
                initial: worldviewLinkedOcs,
                resultChannel: "router",
            },
        });
    }, [
        token,
        openAuthPrompt,
        coverPreview,
        allExtraPreviews,
        formData,
        visibility,
        worldviewTimeline,
        worldviewRegionLayers,
        worldviewLinkedOcs,
        navigate,
        location.pathname,
    ]);

    const buildSubmitPayload = (): Record<string, unknown> => {
        const base: Record<string, unknown> = {
            ...formData,
            ocWorldviewLinks: ocWorldviewLink ? [ocWorldviewLink] : [],
        };
        if (category === "OC") {
            base.tags = normalizeOcTagsField(formData.tags);
        }
        if (category === "表情包") {
            base.tags = normalizeEmojiTagsField(formData.tags);
        }
        if (category === "世界观") {
            base.tags = normalizeWorldviewTagsField(formData.tags);
            base.worldviewTimeline = worldviewTimeline
                .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
                .filter((row) => row.label || row.value);
            base.worldviewRegionLayers = worldviewRegionLayers
                .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
                .filter((row) => row.label || row.value);
            base.worldviewLinkedOcs = worldviewLinkedOcs;
            base.relatedCharacters = worldviewLinkedOcs.map((x) => x.title).join("、");
        }
        return base;
    };

    const handleCover = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setCoverPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleExtraImages = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (!files.length) return;
        const remain = Math.max(0, 12 - existingExtraImageUrls.length - extraImageFiles.length);
        const accepted = files.slice(0, remain);
        if (!accepted.length) return;
        setExtraImageFiles((prev) => [...prev, ...accepted].slice(0, Math.max(0, 12 - existingExtraImageUrls.length)));
        accepted.forEach((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setExtraImagePreviews((p) =>
                    [...p, reader.result as string].slice(0, Math.max(0, 12 - existingExtraImageUrls.length)),
                );
            };
            reader.readAsDataURL(file);
        });
    };

    const removeExtraAt = (index: number) => {
        const existingCount = existingExtraImageUrls.length;
        if (index < existingCount) {
            setExistingExtraImageUrls((prev) => prev.filter((_, i) => i !== index));
            return;
        }
        const localIdx = index - existingCount;
        setExtraImageFiles((prev) => prev.filter((_, i) => i !== localIdx));
        setExtraImagePreviews((prev) => prev.filter((_, i) => i !== localIdx));
    };

    const handlePublish = async () => {
        if (!token) {
            openAuthPrompt({
                title: isEditMode ? "登录后编辑作品" : "登录后发布作品",
                description: isEditMode ? "登录后即可在工作站保存作品修改。" : "登录后即可从工作站发布作品到首页与个人主页。",
            });
            return;
        }
        setError("");
        setSubmitting(true);
        try {
            const uploadFile = async (file: File): Promise<string> => {
                const fd = new FormData();
                fd.append("file", file);
                const uploadRes = await fetch("/api/upload", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd,
                });
                if (!uploadRes.ok) {
                    const err = await uploadRes.json().catch(() => ({}));
                    throw new Error(err.message ?? "图片上传失败");
                }
                const u = await uploadRes.json();
                return u.url as string;
            };

            let uploadedCoverUrl: string | undefined;
            if (coverFile) uploadedCoverUrl = await uploadFile(coverFile);
            const uploadedExtraUrls: string[] = [];
            for (const f of extraImageFiles) {
                uploadedExtraUrls.push(await uploadFile(f));
            }
            const extraForCard = [...existingExtraImageUrls, ...uploadedExtraUrls].filter(Boolean);

            const payload = buildSubmitPayload();
            const isOC = category === "OC";
            const title = getStudioArtworkTitle(category, payload);
            const description = buildStudioDescription(category, payload);
            const tags = getStudioArtworkTags(payload);
            const ocOmitPrimaryInCard =
                category === "OC" && !ocCoverInDetailGallery && extraForCard.length > 0;
            const descriptionForApi = mergeDescriptionWithCardPayload(
                description,
                category,
                payload,
                extraForCard.length ? extraForCard : undefined,
                category === "OC" ? { ocPrimaryImageNotInGallery: ocOmitPrimaryInCard } : undefined,
            );

            const requestRes = await fetch(isEditMode ? `/api/artworks/${editingArtworkId}` : "/api/artworks", {
                method: isEditMode ? "PATCH" : "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title,
                    description: descriptionForApi ?? description ?? null,
                    category: isEditMode ? undefined : studioCategoryToApi(category),
                    imageUrl: uploadedCoverUrl ?? (coverPreview ? toStorageUrl(coverPreview) : null),
                    tags,
                    gender: isOC && formData.gender ? String(formData.gender).trim() || null : null,
                    ...(isOC
                        ? { ocPrivacy }
                        : category === "世界观" || category === "表情包"
                          ? { ocPrivacy: visibility }
                          : {}),
                }),
            });
            if (!requestRes.ok) {
                const err = await requestRes.json().catch(() => ({}));
                throw new Error(err.message ?? (isEditMode ? "保存失败" : "发布失败"));
            }
            const created = await requestRes.json();
            clearOcStudioImageSession();
            clearWorldviewStudioSession();
            onPublished(created.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : isEditMode ? "保存失败" : "发布失败");
        } finally {
            setSubmitting(false);
        }
    };

    const fieldPlaceholder = (field: FormFieldDef) =>
        field.placeholder?.trim() ? field.placeholder : studioFieldPlaceholder(field);

    const renderField = (field: FormFieldDef, compact?: boolean) => (
        <div key={field.name} className={`studio-ws-field ${compact ? "studio-ws-field--compact" : ""}`}>
            <label className="studio-ws-label">
                {field.label}
                {field.required ? <span className="studio-ws-req">*</span> : null}
            </label>
            {field.type === "textarea" ? (
                <textarea
                    className="studio-ws-input studio-ws-textarea"
                    value={String(formData[field.name] ?? "")}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    rows={field.rows ?? 4}
                    required={field.required}
                    placeholder={fieldPlaceholder(field)}
                />
            ) : field.type === "select" ? (
                <select
                    className="studio-ws-input"
                    value={String(formData[field.name] ?? "")}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    required={field.required}
                >
                    <option value="">可选</option>
                    {field.options?.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    className="studio-ws-input"
                    type={field.type === "number" ? "number" : "text"}
                    value={String(formData[field.name] ?? "")}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    required={field.required}
                    placeholder={fieldPlaceholder(field)}
                />
            )}
        </div>
    );

    const submitPayload = buildSubmitPayload();
    const previewTitle = getStudioArtworkTitle(category, submitPayload) || "未命名作品";
    const taglineStr = String(formData.tagline ?? "").trim();
    const taglinePreview = taglineStr.length > 120 ? `${taglineStr.slice(0, 120)}…` : taglineStr;
    const previewBlurb =
        category === "世界观"
            ? taglinePreview || "填写一句话设定，将显示在标题下方。"
            : category === "表情包"
              ? taglinePreview || "填写一句话介绍，将显示在列表卡片与详情摘要。"
              : taglinePreview || "填写左侧表单后，这里会实时显示简介与设定文案。";
    const tagChips = String(formData.tags ?? "")
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
    const previewKvs = section3Fields
        .filter((f) => f.type !== "textarea" && f.name !== "tags")
        .slice(0, 8)
        .map((f) => ({
            label: f.label.replace(/（[^）]*）/, ""),
            value: String(formData[f.name] ?? "").trim() || "—",
        }));

    const isOC = category === "OC";
    const isWorldview = category === "世界观";
    const isEmoji = category === "表情包";
    const emojiPackExcerptRaw = String(formData.description ?? "").trim();
    const emojiPackExcerpt =
        isEmoji && emojiPackExcerptRaw
            ? emojiPackExcerptRaw.length > 260
                ? `${emojiPackExcerptRaw.slice(0, 260)}…`
                : emojiPackExcerptRaw
            : undefined;
    const ocMetaFields = section3Fields.filter((f) => f.type !== "textarea");
    const ocRoleIntroField = section3Fields.find((f) => f.name === "tagline");
    /** 世界观：「设定信息」内仅类型—世界规则—核心主题等（相关 OC 单独一栏） */
    const wvSettingExclude = new Set(["tags"]);
    const wvMetaFields = section3Fields.filter((f) => f.type !== "textarea" && !wvSettingExclude.has(f.name));
    const wvLongFields = section3Fields.filter((f) => f.type === "textarea");
    const emojiAllowDownloadField = section3Fields.find((f) => f.name === "allowDownload");
    const emojiLongFields = section3Fields.filter((f) => f.type === "textarea");
    const soloPreview = ["世界观", "表情包"].includes(category);

    if (loadingEdit) {
        return (
            <div className="studio-ws">
                <div className="studio-ws-inner">
                    <div className="studio-ws-banner">加载作品中...</div>
                </div>
            </div>
        );
    }

    if (forbiddenEdit) {
        return (
            <div className="studio-ws">
                <div className="studio-ws-inner">
                    <div className="studio-ws-banner studio-ws-banner--err">你没有权限编辑该作品。</div>
                    <button type="button" className="studio-ws-btn studio-ws-btn--ghost" onClick={() => navigate(-1)}>
                        返回
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="studio-ws">
            <div className="studio-ws-inner">
                <header className="studio-ws-header">
                    <div className="studio-ws-header-main">
                        <div className="studio-ws-eyebrow">Studio / 工作站</div>
                        <h1 className="studio-ws-title">{isEditMode ? "编辑工作站" : "工作站"}</h1>
                        <p className="studio-ws-sub">
                            {isOC
                                ? "左侧上传主视觉，右侧填写档案；预览区可切换详情 / 列表 / 手机幅面，发布即同步到首页与个人主页。"
                                : isWorldview
                                  ? "左侧主视觉与设定配图，右侧填写世界观档案；右侧预览与 OC 一致，仅展示标题、一句话设定、标签与设定信息摘要。"
                                  : isEmoji
                                    ? "左侧主封面与套内表情图，右侧填写套组档案；右侧预览接近发布后详情：列表同款缩略格、套组介绍摘、使用说明旁的下载权限气泡。"
                                    : "创建 OC、世界观或表情包作品；右侧可预览大致展示效果，发布后将出现在首页对应分类中。"}
                        </p>
                    </div>
                    <div className="studio-ws-header-actions">
                        <button
                            type="button"
                            className="studio-ws-btn studio-ws-btn--primary"
                            onClick={() => void handlePublish()}
                            disabled={submitting}
                        >
                            {submitting ? (isEditMode ? "保存中…" : "发布中…") : isEditMode ? "保存修改" : "发布作品"}
                        </button>
                    </div>
                </header>

                <section className="studio-ws-cats" aria-label="作品类型">
                    <div className="studio-ws-cats-row">
                        {CATEGORIES.map((c) => (
                            <button
                                key={c.name}
                                type="button"
                                className={`studio-ws-cat ${category === c.name ? "active" : ""}`}
                                onClick={() => {
                                    if (isEditMode) return;
                                    setCategory(c.name);
                                }}
                                disabled={isEditMode}
                            >
                                <span className="studio-ws-cat-icon" aria-hidden>
                                    {c.icon}
                                </span>
                                <span className="studio-ws-cat-name">{c.name}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {error ? <div className="studio-ws-banner studio-ws-banner--err">{error}</div> : null}

                <div className="studio-ws-grid">
                    <main className="studio-ws-main">
                        {isOC ? (
                            <div className="studio-ws-oc-shell">
                                <div className="studio-ws-oc-detail">
                                    <div className="studio-ws-oc-detail-left" aria-label="OC 主图">
                                        <header className="studio-ws-oc-aside-head">
                                            <span className="studio-ws-oc-aside-kicker">视觉主区</span>
                                            <h2 className="studio-ws-oc-aside-title">作品封面</h2>
                                        </header>
                                        <div className="studio-ws-oc-cover-ring">
                                            <div className="studio-ws-oc-image-panel">
                                                <button
                                                    type="button"
                                                    className="studio-ws-cover-frame studio-ws-oc-cover-tap"
                                                    onClick={() => coverInputRef.current?.click()}
                                                >
                                                    {coverPreview ? (
                                                        <img src={coverPreview} alt="" className="studio-ws-cover-img" />
                                                    ) : (
                                                        <div className="studio-ws-cover-ph studio-ws-cover-ph--oc">
                                                            <span className="studio-ws-cover-ph-label">点击上传</span>
                                                            <span className="studio-ws-cover-ph-sub">支持 JPG / PNG · 建议竖图或半身立绘</span>
                                                        </div>
                                                    )}
                                                </button>
                                                <input
                                                    ref={coverInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="studio-ws-sr"
                                                    onChange={handleCover}
                                                />
                                            </div>
                                        </div>
                                        <div className="studio-ws-oc-gallery">
                                            <p className="studio-ws-oc-gallery-label">更多 OC 配图</p>
                                            <p className="studio-ws-oc-gallery-desc">
                                                可选，最多 12 张；将写入作品卡片并在详情页以图集展示，首页仍使用上方主封面。
                                            </p>
                                            {allExtraPreviews.length > 0 ? (
                                                <div className="studio-ws-oc-gallery-thumbs">
                                                    {allExtraPreviews.map((src, i) => (
                                                        <div key={`${src}-${i}`} className="studio-ws-oc-gallery-thumb">
                                                            <img src={src} alt="" />
                                                            <button
                                                                type="button"
                                                                className="studio-ws-oc-gallery-thumb-x"
                                                                onClick={() => removeExtraAt(i)}
                                                                aria-label="移除配图"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <button
                                                type="button"
                                                className="studio-ws-btn studio-ws-btn--ghost studio-ws-oc-gallery-add"
                                                onClick={() => extraInputRef.current?.click()}
                                                disabled={allExtraPreviews.length >= 12}
                                            >
                                                {allExtraPreviews.length >= 12
                                                    ? "已达 12 张上限"
                                                    : allExtraPreviews.length > 0
                                                      ? `继续添加（${allExtraPreviews.length}/12）`
                                                      : "添加配图"}
                                            </button>
                                            <input
                                                ref={extraInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="studio-ws-sr"
                                                onChange={handleExtraImages}
                                            />
                                        </div>
                                    </div>
                                    <div className="studio-ws-oc-detail-right">
                                        <div className="studio-ws-oc-info-scroll">
                                            <div className="artwork-detail-card studio-ws-oc-detail-card studio-ws-oc-panel">
                                                <div className="studio-ws-oc-panel-intro">
                                                    <span className="studio-ws-oc-aside-kicker">档案</span>
                                                    <h3 className="studio-ws-oc-panel-lead">角色信息</h3>
                                                    <p className="studio-ws-oc-panel-lead-desc">姓名、角色简介与基础信息会展示在详情页右侧信息区。</p>
                                                </div>

                                            <div className="artwork-detail-work-section">
                                                {titleField ? (
                                                    <div className="studio-ws-oc-title-field">
                                                        <label className="studio-ws-label" htmlFor="ws-oc-name">
                                                            {titleField.label}
                                                            {titleField.required ? <span className="studio-ws-req">*</span> : null}
                                                        </label>
                                                        <input
                                                            id="ws-oc-name"
                                                            className="studio-ws-input"
                                                            type="text"
                                                            value={String(formData[titleField.name] ?? "")}
                                                            onChange={(e) => handleChange(titleField.name, e.target.value)}
                                                            required={titleField.required}
                                                            placeholder={studioFieldPlaceholder(titleField)}
                                                        />
                                                    </div>
                                                ) : null}
                                                {ocMetaFields.length > 0 ? (
                                                    <div className="studio-ws-oc-meta-grid">{ocMetaFields.map((f) => renderField(f, true))}</div>
                                                ) : null}
                                                {ocRoleIntroField ? renderField(ocRoleIntroField) : null}
                                            </div>
                                            </div>

                                        <div className="artwork-detail-card studio-ws-oc-panel">
                                            <h3 className="artwork-detail-section-title">所属世界观</h3>
                                            {ocWorldviewLink ? (
                                                <div className="studio-ws-wv-pick-card">
                                                    <div className="studio-ws-wv-pick-card-cover" aria-hidden>
                                                        {(() => {
                                                            const cover = resolveArtworkUrl(ocWorldviewLink.imageUrl, "");
                                                            return cover ? (
                                                                <img src={cover} alt="" />
                                                            ) : (
                                                                <span className="studio-ws-wv-pick-card-fallback">
                                                                    {ocWorldviewLink.title.slice(0, 1)}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="studio-ws-wv-pick-card-main">
                                                        <div className="studio-ws-wv-pick-card-title">{ocWorldviewLink.title}</div>
                                                        <div className="studio-ws-wv-pick-card-author">@{ocWorldviewLink.authorUsername}</div>
                                                        <div className="studio-ws-wv-pick-card-actions">
                                                            <button
                                                                type="button"
                                                                className="studio-ws-btn studio-ws-btn--ghost"
                                                                onClick={() => setOcWorldviewLink(null)}
                                                            >
                                                                移除
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="studio-ws-btn studio-ws-btn--primary"
                                                                onClick={() => goPickWorldview(ocWorldviewLink)}
                                                            >
                                                                更换
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="studio-ws-wv-pick-add"
                                                    onClick={() => goPickWorldview(null)}
                                                >
                                                    <span className="studio-ws-wv-pick-add-icon" aria-hidden>
                                                        +
                                                    </span>
                                                    <span className="studio-ws-wv-pick-add-text">选择所属世界观</span>
                                                    <span className="studio-ws-wv-pick-add-sub">我的或全站搜索</span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="artwork-detail-card studio-ws-oc-panel">
                                            <h3 className="artwork-detail-section-title">标签</h3>
                                            <OcTagsPanel
                                                value={String(formData.tags ?? "")}
                                                onChange={(v) => handleChange("tags", v)}
                                            />
                                        </div>

                                        <div className="artwork-detail-card studio-ws-oc-panel studio-ws-oc-panel--privacy">
                                            <h3 className="artwork-detail-section-title">隐私设置</h3>
                                            <div className="studio-ws-vis">
                                                <button
                                                    type="button"
                                                    className={`studio-ws-vis-btn ${ocPrivacy === "public" ? "on" : ""}`}
                                                    onClick={() => setOcPrivacy("public")}
                                                >
                                                    公共
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`studio-ws-vis-btn ${ocPrivacy === "private" ? "on" : ""}`}
                                                    onClick={() => setOcPrivacy("private")}
                                                >
                                                    私有
                                                </button>
                                            </div>
                                        </div>

                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : isWorldview ? (
                            <div className="studio-ws-oc-shell studio-ws-oc-shell--worldview">
                                <div className="studio-ws-oc-detail">
                                    <div className="studio-ws-oc-detail-left" aria-label="世界观主视觉">
                                        <header className="studio-ws-oc-aside-head">
                                            <span className="studio-ws-oc-aside-kicker">视觉主区</span>
                                            <h2 className="studio-ws-oc-aside-title">主视觉封面</h2>
                                        </header>
                                        <div className="studio-ws-oc-cover-ring">
                                            <div className="studio-ws-oc-image-panel">
                                                <button
                                                    type="button"
                                                    className="studio-ws-cover-frame studio-ws-oc-cover-tap"
                                                    onClick={() => coverInputRef.current?.click()}
                                                >
                                                    {coverPreview ? (
                                                        <img src={coverPreview} alt="" className="studio-ws-cover-img" />
                                                    ) : (
                                                        <div className="studio-ws-cover-ph studio-ws-cover-ph--oc">
                                                            <span className="studio-ws-cover-ph-label">点击上传</span>
                                                            <span className="studio-ws-cover-ph-sub">
                                                                地图、场景或象征主图 · JPG / PNG · 建议偏竖幅
                                                            </span>
                                                        </div>
                                                    )}
                                                </button>
                                                <input
                                                    ref={coverInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="studio-ws-sr"
                                                    onChange={handleCover}
                                                />
                                            </div>
                                        </div>
                                        <div className="studio-ws-oc-gallery">
                                            <p className="studio-ws-oc-gallery-label">设定配图</p>
                                            <p className="studio-ws-oc-gallery-desc">
                                                可选，最多 12 张；写入作品卡片与详情图集，列表主图仍使用上方封面。
                                            </p>
                                            {allExtraPreviews.length > 0 ? (
                                                <div className="studio-ws-oc-gallery-thumbs">
                                                    {allExtraPreviews.map((src, i) => (
                                                        <div key={`${src}-${i}`} className="studio-ws-oc-gallery-thumb">
                                                            <img src={src} alt="" />
                                                            <button
                                                                type="button"
                                                                className="studio-ws-oc-gallery-thumb-x"
                                                                onClick={() => removeExtraAt(i)}
                                                                aria-label="移除配图"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <button
                                                type="button"
                                                className="studio-ws-btn studio-ws-btn--ghost studio-ws-oc-gallery-add"
                                                onClick={() => extraInputRef.current?.click()}
                                                disabled={allExtraPreviews.length >= 12}
                                            >
                                                {allExtraPreviews.length >= 12
                                                    ? "已达 12 张上限"
                                                    : allExtraPreviews.length > 0
                                                      ? `继续添加（${allExtraPreviews.length}/12）`
                                                      : "添加配图"}
                                            </button>
                                            <input
                                                ref={extraInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="studio-ws-sr"
                                                onChange={handleExtraImages}
                                            />
                                        </div>
                                    </div>
                                    <div className="studio-ws-oc-detail-right">
                                        <div className="studio-ws-oc-info-scroll">
                                            <div className="artwork-detail-card studio-ws-oc-detail-card studio-ws-oc-panel">
                                                <div className="studio-ws-oc-panel-intro">
                                                    <span className="studio-ws-oc-aside-kicker">档案</span>
                                                    <h3 className="studio-ws-oc-panel-lead">世界观基础</h3>
                                                    <p className="studio-ws-oc-panel-lead-desc">
                                                        世界观名称对应卡片标题，一句话设定在标题下小字，世界观概述为正文摘要。
                                                    </p>
                                                </div>
                                                <div className="artwork-detail-work-section">
                                                    {titleField ? (
                                                        <div className="studio-ws-oc-title-field">
                                                            <label className="studio-ws-label" htmlFor="ws-wv-name">
                                                                {titleField.label}
                                                                {titleField.required ? <span className="studio-ws-req">*</span> : null}
                                                            </label>
                                                            <input
                                                                id="ws-wv-name"
                                                                className="studio-ws-input"
                                                                type="text"
                                                                value={String(formData[titleField.name] ?? "")}
                                                                onChange={(e) => handleChange(titleField.name, e.target.value)}
                                                                required={titleField.required}
                                                                placeholder={studioFieldPlaceholder(titleField)}
                                                            />
                                                        </div>
                                                    ) : null}
                                                    {taglineField ? renderField(taglineField) : null}
                                                    {descField ? renderField(descField) : null}
                                                </div>
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">设定信息</h3>
                                                {wvMetaFields.length > 0 ? (
                                                    <div className="studio-ws-oc-meta-grid">{wvMetaFields.map((f) => renderField(f, true))}</div>
                                                ) : null}
                                                {wvLongFields.map((f) => (
                                                    <div key={f.name} className="studio-ws-wv-long-field">
                                                        {renderField(f)}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">时间线</h3>
                                                <WorldviewTimelineEditor rows={worldviewTimeline} onChange={setWorldviewTimeline} />
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">相关 OC</h3>
                                                {worldviewLinkedOcs.length > 0 ? (
                                                    <div className="studio-ws-wv-linked-list">
                                                        {worldviewLinkedOcs.map((oc) => (
                                                            <div key={oc.artworkId} className="studio-ws-wv-pick-card">
                                                                <div className="studio-ws-wv-pick-card-cover" aria-hidden>
                                                                    {(() => {
                                                                        const cover = resolveArtworkUrl(oc.imageUrl, "");
                                                                        return cover ? (
                                                                            <img src={cover} alt="" />
                                                                        ) : (
                                                                            <span className="studio-ws-wv-pick-card-fallback">{oc.title.slice(0, 1)}</span>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="studio-ws-wv-pick-card-main">
                                                                    <div className="studio-ws-wv-pick-card-title">{oc.title}</div>
                                                                    <div className="studio-ws-wv-pick-card-author">@{oc.authorUsername}</div>
                                                                    <div className="studio-ws-wv-pick-card-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="studio-ws-btn studio-ws-btn--ghost"
                                                                            onClick={() =>
                                                                                setWorldviewLinkedOcs((prev) => prev.filter((x) => x.artworkId !== oc.artworkId))
                                                                            }
                                                                        >
                                                                            移除
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="studio-ws-btn studio-ws-btn--primary"
                                                                            onClick={() => goPickLinkedOcs()}
                                                                        >
                                                                            更换
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <button type="button" className="studio-ws-wv-pick-add" onClick={() => goPickLinkedOcs()}>
                                                        <span className="studio-ws-wv-pick-add-icon" aria-hidden>
                                                            +
                                                        </span>
                                                        <span className="studio-ws-wv-pick-add-text">选择相关 OC</span>
                                                    </button>
                                                )}
                                                {worldviewLinkedOcs.length > 0 ? (
                                                    <div className="studio-ws-wv-linked-actions studio-ws-wv-linked-actions--solo">
                                                        <button type="button" className="studio-ws-btn studio-ws-btn--ghost" onClick={() => setWorldviewLinkedOcs([])}>
                                                            全部移除
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">区域图层</h3>
                                                <WorldviewTimelineEditor
                                                    rows={worldviewRegionLayers}
                                                    onChange={setWorldviewRegionLayers}
                                                    labelFieldCaption="图层名称"
                                                    valueFieldCaption="图层说明"
                                                    labelPlaceholder="例：中央城邦 / 边境荒原"
                                                    valuePlaceholder="该区域在故事中的定位、气候、势力范围等"
                                                    addButtonLabel="添加图层"
                                                    removeAriaLabel="删除此图层"
                                                />
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">标签</h3>
                                                <OcTagsPanel
                                                    variant="worldview"
                                                    value={String(formData.tags ?? "")}
                                                    onChange={(v) => handleChange("tags", v)}
                                                />
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel studio-ws-oc-panel--privacy">
                                                <h3 className="artwork-detail-section-title">隐私设置</h3>
                                                <div className="studio-ws-vis">
                                                    <button
                                                        type="button"
                                                        className={`studio-ws-vis-btn ${visibility === "public" ? "on" : ""}`}
                                                        onClick={() => setVisibility("public")}
                                                    >
                                                        公共
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`studio-ws-vis-btn ${visibility === "private" ? "on" : ""}`}
                                                        onClick={() => setVisibility("private")}
                                                    >
                                                        私有
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : isEmoji ? (
                            <div className="studio-ws-oc-shell studio-ws-oc-shell--emoji">
                                <div className="studio-ws-oc-detail">
                                    <div className="studio-ws-oc-detail-left" aria-label="表情包主图与套图">
                                        <header className="studio-ws-oc-aside-head">
                                            <span className="studio-ws-oc-aside-kicker">视觉主区</span>
                                            <h2 className="studio-ws-oc-aside-title">封面与套内表情</h2>
                                        </header>
                                        <div className="studio-ws-oc-cover-ring">
                                            <div className="studio-ws-oc-image-panel">
                                                <button
                                                    type="button"
                                                    className="studio-ws-cover-frame studio-ws-oc-cover-tap"
                                                    onClick={() => coverInputRef.current?.click()}
                                                >
                                                    {coverPreview ? (
                                                        <img src={coverPreview} alt="" className="studio-ws-cover-img" />
                                                    ) : (
                                                        <div className="studio-ws-cover-ph studio-ws-cover-ph--oc">
                                                            <span className="studio-ws-cover-ph-label">点击上传主封面</span>
                                                            <span className="studio-ws-cover-ph-sub">首页卡片主图 · 建议方形或接近方形</span>
                                                        </div>
                                                    )}
                                                </button>
                                                <input
                                                    ref={coverInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="studio-ws-sr"
                                                    onChange={handleCover}
                                                />
                                            </div>
                                        </div>
                                        <div className="studio-ws-oc-gallery">
                                            <p className="studio-ws-oc-gallery-label">套内表情图</p>
                                            <p className="studio-ws-oc-gallery-desc">
                                                将参与首页卡片拼贴与详情图集；不含主封面，最多 12 张。
                                            </p>
                                            {allExtraPreviews.length > 0 ? (
                                                <div className="studio-ws-oc-gallery-thumbs">
                                                    {allExtraPreviews.map((src, i) => (
                                                        <div key={`${src}-${i}`} className="studio-ws-oc-gallery-thumb">
                                                            <img src={src} alt="" />
                                                            <button
                                                                type="button"
                                                                className="studio-ws-oc-gallery-thumb-x"
                                                                onClick={() => removeExtraAt(i)}
                                                                aria-label="移除表情图"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <button
                                                type="button"
                                                className="studio-ws-btn studio-ws-btn--ghost studio-ws-oc-gallery-add"
                                                onClick={() => extraInputRef.current?.click()}
                                                disabled={allExtraPreviews.length >= 12}
                                            >
                                                {allExtraPreviews.length >= 12
                                                    ? "已达 12 张上限"
                                                    : allExtraPreviews.length > 0
                                                      ? `继续添加（${allExtraPreviews.length}/12）`
                                                      : "添加表情图"}
                                            </button>
                                            <input
                                                ref={extraInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="studio-ws-sr"
                                                onChange={handleExtraImages}
                                            />
                                        </div>
                                    </div>
                                    <div className="studio-ws-oc-detail-right">
                                        <div className="studio-ws-oc-info-scroll">
                                            <div className="artwork-detail-card studio-ws-oc-detail-card studio-ws-oc-panel">
                                                <div className="studio-ws-oc-panel-intro">
                                                    <span className="studio-ws-oc-aside-kicker">档案</span>
                                                    <h3 className="studio-ws-oc-panel-lead">套组基础</h3>
                                                    <p className="studio-ws-oc-panel-lead-desc">
                                                        名称与一句话介绍会出现在列表卡片；套组说明写入详情「套组介绍」。
                                                    </p>
                                                </div>
                                                <div className="artwork-detail-work-section">
                                                    {titleField ? (
                                                        <div className="studio-ws-oc-title-field">
                                                            <label className="studio-ws-label" htmlFor="ws-em-name">
                                                                {titleField.label}
                                                                {titleField.required ? <span className="studio-ws-req">*</span> : null}
                                                            </label>
                                                            <input
                                                                id="ws-em-name"
                                                                className="studio-ws-input"
                                                                type="text"
                                                                value={String(formData[titleField.name] ?? "")}
                                                                onChange={(e) => handleChange(titleField.name, e.target.value)}
                                                                required={titleField.required}
                                                                placeholder={studioFieldPlaceholder(titleField)}
                                                            />
                                                        </div>
                                                    ) : null}
                                                    {taglineField ? renderField(taglineField) : null}
                                                    {descField ? renderField(descField) : null}
                                                </div>
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">规格与授权</h3>
                                                {emojiAllowDownloadField ? (
                                                    <div className="studio-ws-oc-meta-grid">
                                                        {renderField(emojiAllowDownloadField, true)}
                                                    </div>
                                                ) : null}
                                                {emojiLongFields.map((f) => (
                                                    <div key={f.name} className="studio-ws-wv-long-field">
                                                        {renderField(f)}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">标签</h3>
                                                <OcTagsPanel
                                                    variant="emoji"
                                                    value={String(formData.tags ?? "")}
                                                    onChange={(v) => handleChange("tags", v)}
                                                />
                                            </div>

                                            <div className="artwork-detail-card studio-ws-oc-panel studio-ws-oc-panel--privacy">
                                                <h3 className="artwork-detail-section-title">隐私设置</h3>
                                                <div className="studio-ws-vis">
                                                    <button
                                                        type="button"
                                                        className={`studio-ws-vis-btn ${visibility === "public" ? "on" : ""}`}
                                                        onClick={() => setVisibility("public")}
                                                    >
                                                        公共
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`studio-ws-vis-btn ${visibility === "private" ? "on" : ""}`}
                                                        onClick={() => setVisibility("private")}
                                                    >
                                                        私有
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <CategoryFieldsRenderer
                                category={category}
                                titleField={titleField}
                                taglineField={taglineField}
                                descField={descField}
                                section3Fields={section3Fields}
                                renderField={renderField}
                                coverPreview={coverPreview}
                                coverInputRef={coverInputRef}
                                onCoverChange={handleCover}
                                extraImagePreviews={allExtraPreviews}
                                extraInputRef={extraInputRef}
                                onExtraImages={handleExtraImages}
                                onRemoveExtra={removeExtraAt}
                                formTagsValue={String(formData.tags ?? "")}
                                onTagsChange={(v) => handleChange("tags", v)}
                                visibility={visibility}
                                onVisibility={setVisibility}
                            />
                        )}
                    </main>

                    <aside className="studio-ws-aside">
                        <section className="studio-ws-preview-panel">
                            <div className="studio-ws-preview-head">
                                <h2 className="studio-ws-preview-title">实时预览</h2>
                            </div>
                            <div className={`studio-ws-preview-card studio-ws-preview-card--list${soloPreview ? " studio-ws-preview-card--solo" : ""}`}>
                                {soloPreview ? (
                                    <div className="studio-ws-preview-body studio-ws-preview-body--solo">
                                        <StudioCategoryPreviewBody
                                            category={category}
                                            previewTitle={previewTitle}
                                            previewBlurb={previewBlurb}
                                            tagChips={tagChips}
                                            previewKvs={previewKvs}
                                            coverPreview={coverPreview}
                                            extraPreviews={allExtraPreviews}
                                            emojiAllowDownload={isEmoji ? String(formData.allowDownload ?? "") : undefined}
                                            emojiPackExcerpt={emojiPackExcerpt}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <div className="studio-ws-preview-cover">
                                            {coverPreview ? <img src={coverPreview} alt="" /> : null}
                                        </div>
                                        <div className="studio-ws-preview-body">
                                            <StudioCategoryPreviewBody
                                                category="OC"
                                                previewTitle={previewTitle}
                                                previewBlurb={previewBlurb}
                                                tagChips={tagChips}
                                                previewKvs={previewKvs}
                                                coverPreview={coverPreview}
                                                extraPreviews={allExtraPreviews}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
}
