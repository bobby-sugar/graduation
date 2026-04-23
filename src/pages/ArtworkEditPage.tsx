import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { buildArtworkCloseState, resolveReturnAfterDetailPreview } from "../artwork/artworkDetailNavigation";
import { splitDescriptionAndCardPayload } from "../artwork/cardPayload";
import { resolveArtworkUrl } from "../components/artwork/resolveArtworkUrl";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { resolveApiUrl, toStorageUrl } from "../config/api";
import { useAuth } from "../contexts/AuthContext";
import { OcTagsPanel } from "../studio/OcTagsPanel";
import { type OcWorldviewLink } from "../studio/ocWorldviewLinks";
import { normalizeEmojiTagsField, normalizeOcTagsField, normalizeWorldviewTagsField } from "../studio/ocStudioTags";
import { StudioCategoryPreviewBody } from "../studio/CategoryPreviewBody";
import { getStudioFormFields, partitionStudioFields, studioFieldPlaceholder, type FormFieldDef } from "../studio/studioFormFields";
import { WorldviewTimelineEditor, type WorldviewTimelineRow } from "../studio/WorldviewTimelineEditor";
import { normalizePickReturnPath } from "../studio/worldviewPickUiMemory";
import {
    buildStudioDescription,
    getStudioArtworkTags,
    getStudioArtworkTitle,
    mergeDescriptionWithCardPayload,
    STUDIO_LEGACY_PRIVACY_DESCRIPTION_MARKER,
    stripLegacyStudioPrivacyDescriptionMarker,
} from "../utils/studioArtwork";

type CategoryUi = "OC" | "世界观" | "表情包";

type ArtworkDetail = {
    id: number;
    title: string;
    description?: string | null;
    category?: string | null;
    imageUrl?: string | null;
    tags?: string | null;
    gender?: string | null;
    ocPrivacy?: "public" | "private" | null;
    authorId?: number;
    author?: { id?: number } | null;
};

function apiToUiCategory(raw: string | null | undefined): CategoryUi {
    const s = String(raw ?? "").toLowerCase();
    if (s === "worldview") return "世界观";
    if (s === "emoji") return "表情包";
    return "OC";
}

function parseDescriptionSections(prose: string): {
    intro: string;
    metaMap: Record<string, string>;
    sectionMap: Record<string, string[]>;
} {
    const lines = (prose ?? "").replace(/\r/g, "").split("\n");
    const intro: string[] = [];
    const sectionMap: Record<string, string[]> = {};
    const metaMap: Record<string, string> = {};
    let currentSection = "";
    let activeLabel = "";
    let activeValue = "";
    const flushMeta = () => {
        if (!activeLabel) return;
        metaMap[activeLabel] = activeValue.trim();
        activeLabel = "";
        activeValue = "";
    };
    for (const raw of lines) {
        const line = raw.trim();
        const sectionMatch = line.match(/^【(.+?)】$/);
        if (sectionMatch) {
            flushMeta();
            currentSection = sectionMatch[1].trim();
            if (!sectionMap[currentSection]) sectionMap[currentSection] = [];
            continue;
        }
        if (!currentSection) {
            if (line) intro.push(line);
            continue;
        }
        sectionMap[currentSection].push(line);
        if (!line) continue;
        const kv = line.match(/^([^：:\n]{1,30})[：:]\s*(.*)$/);
        if (kv) {
            flushMeta();
            activeLabel = kv[1].trim();
            activeValue = kv[2].trim();
            continue;
        }
        if (activeLabel) activeValue = activeValue ? `${activeValue}\n${line}` : line;
    }
    flushMeta();
    return { intro: intro.join("\n").trim(), metaMap, sectionMap };
}

function parseSectionRows(lines: string[] | undefined, fallbackLabel: string): WorldviewTimelineRow[] {
    if (!lines || lines.length === 0) return [];
    const out: WorldviewTimelineRow[] = [];
    let label = "";
    let value = "";
    const flush = () => {
        if (!label && !value.trim()) return;
        out.push({
            id: `${fallbackLabel}-${Date.now()}-${out.length}`,
            label: label || fallbackLabel,
            value: value.trim(),
        });
        label = "";
        value = "";
    };
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            flush();
            continue;
        }
        const kv = line.match(/^([^：:\n]{1,40})[：:]\s*(.*)$/);
        if (kv) {
            flush();
            label = kv[1].trim();
            value = kv[2].trim();
            continue;
        }
        value = value ? `${value}\n${line}` : line;
    }
    flush();
    return out;
}

export default function ArtworkEditPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, token, isReady } = useAuth();
    const artworkId = Number(id);

    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [category, setCategory] = useState<CategoryUi>("OC");
    const [formData, setFormData] = useState<Record<string, unknown>>({ tags: "oc" });
    const [ocPrivacy, setOcPrivacy] = useState<"public" | "private">("public");
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [existingExtraImageUrls, setExistingExtraImageUrls] = useState<string[]>([]);
    const [extraImageFiles, setExtraImageFiles] = useState<File[]>([]);
    const [extraImagePreviews, setExtraImagePreviews] = useState<string[]>([]);
    const [ocWorldviewLinks, setOcWorldviewLinks] = useState<OcWorldviewLink[]>([]);
    const [worldviewTimeline, setWorldviewTimeline] = useState<WorldviewTimelineRow[]>([]);
    const [worldviewRegionLayers, setWorldviewRegionLayers] = useState<WorldviewTimelineRow[]>([]);
    const [worldviewLinkedOcs, setWorldviewLinkedOcs] = useState<OcWorldviewLink[]>([]);

    const coverInputRef = useRef<HTMLInputElement>(null);
    const extraInputRef = useRef<HTMLInputElement>(null);
    /** 含 mergeMode：避免挑选返回后异步 fetch 晚到时 ocWorldviewPickModeRef 已被重置为 add，误把「更换」当「追加」 */
    const pendingOcWorldviewPickRef = useRef<{
        hasValue: boolean;
        value: OcWorldviewLink | null;
        mergeMode: "add" | "replace" | null;
        replaceTargetId: number | null;
    }>({
        hasValue: false,
        value: null,
        mergeMode: null,
        replaceTargetId: null,
    });
    const ocWorldviewPickModeRef = useRef<{ mode: "add" | "replace"; targetArtworkId?: number }>({ mode: "add" });
    const pendingLinkedOcsPickRef = useRef<{ hasValue: boolean; value: OcWorldviewLink[] }>({
        hasValue: false,
        value: [],
    });
    const linkedOcPickModeRef = useRef<{ mode: "add" | "replace"; targetArtworkId?: number }>({ mode: "add" });
    const lastLoadedArtworkIdRef = useRef<number | null>(null);
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

    /** 从编辑打开作品详情后，「取消」应回到进入编辑前的页面（由详情/管理列表带入），而非编辑页本身 */
    const detailPreviewCloseTo = useMemo(() => resolveReturnAfterDetailPreview(location.state), [location.state]);

    useEffect(() => {
        if (!token || !user || !Number.isInteger(artworkId) || artworkId < 1) {
            setLoading(false);
            return;
        }
        const currentUserId = user.id;
        let cancelled = false;
        const run = async () => {
            if (lastLoadedArtworkIdRef.current !== artworkId) {
                lastLoadedArtworkIdRef.current = artworkId;
                pendingOcWorldviewPickRef.current = {
                    hasValue: false,
                    value: null,
                    mergeMode: null,
                    replaceTargetId: null,
                };
                pendingLinkedOcsPickRef.current = { hasValue: false, value: [] };
            }
            setLoading(true);
            setForbidden(false);
            setError("");
            try {
                const res = await fetch(`/api/artworks/${artworkId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error("作品加载失败");
                const data = (await res.json()) as ArtworkDetail | null;
                if (!data) throw new Error("作品不存在");
                const authorId = typeof data.authorId === "number" ? data.authorId : data.author?.id;
                if (!authorId || authorId !== currentUserId) {
                    if (!cancelled) setForbidden(true);
                    return;
                }
                const rawDescription = data.description ?? "";
                const hadLegacyPrivateMarker = rawDescription.includes(STUDIO_LEGACY_PRIVACY_DESCRIPTION_MARKER);
                const parsed = splitDescriptionAndCardPayload(stripLegacyStudioPrivacyDescriptionMarker(rawDescription));
                const prose = parsed.prose ?? "";
                const payload = parsed.payload;
                const sectionParsed = parseDescriptionSections(prose);
                const ui = apiToUiCategory(data.category);
                const next: Record<string, unknown> = {
                    name: (data.title ?? "").trim(),
                    tags: (data.tags ?? "").trim() || (ui === "世界观" ? "worldview" : ui === "表情包" ? "emoji" : "oc"),
                };
                if (ui === "OC") {
                    next.gender = (data.gender ?? "").trim();
                    next.tagline = sectionParsed.metaMap["角色简介"] ?? sectionParsed.intro ?? "";
                    next.age = sectionParsed.metaMap["年龄"] ?? "";
                    next.race = sectionParsed.metaMap["种族"] ?? "";
                    next.occupation = sectionParsed.metaMap["职业"] ?? "";
                    setOcPrivacy(data.ocPrivacy === "private" ? "private" : "public");
                    const linkedFromPayload: OcWorldviewLink[] = Array.from(
                        new Map(
                            (payload?.ocLinkedWorldviews ?? [])
                                .map((linked) => ({
                                    id: `wv-${linked.artworkId}`,
                                    artworkId: linked.artworkId,
                                    title: linked.title,
                                    authorId: linked.authorId,
                                    authorUsername: linked.authorUsername ?? "",
                                    imageUrl: linked.imageUrl ?? null,
                                }))
                                .filter((x) => Number.isFinite(x.artworkId) && x.title)
                                .map((x) => [x.artworkId, x]),
                        ).values(),
                    ).slice(0, 8);
                    const pOc = pendingOcWorldviewPickRef.current;
                    if (pOc.hasValue) {
                        const picked = pOc.value;
                        if (pOc.mergeMode === "replace" && picked && pOc.replaceTargetId != null) {
                            setOcWorldviewLinks(
                                linkedFromPayload.map((x) =>
                                    x.artworkId === pOc.replaceTargetId ? { ...picked, id: picked.id || `wv-${picked.artworkId}` } : x,
                                ),
                            );
                        } else if (pOc.mergeMode === "add" && picked) {
                            const merged = [...linkedFromPayload, { ...picked, id: picked.id || `wv-${picked.artworkId}` }];
                            setOcWorldviewLinks(Array.from(new Map(merged.map((x) => [x.artworkId, x])).values()).slice(0, 8));
                        } else {
                            setOcWorldviewLinks(linkedFromPayload);
                        }
                    } else {
                        setOcWorldviewLinks(linkedFromPayload);
                    }
                } else if (ui === "世界观") {
                    next.tagline = payload?.worldview?.summaryHint ?? sectionParsed.metaMap["一句话设定"] ?? "";
                    next.description = sectionParsed.intro ?? "";
                    next.type = sectionParsed.metaMap["类型"] ?? "";
                    next.era = sectionParsed.metaMap["时代/背景"] ?? "";
                    next.regions = sectionParsed.metaMap["地域/舞台"] ?? "";
                    next.factions = sectionParsed.metaMap["阵营/势力"] ?? "";
                    next.coreConflict = sectionParsed.metaMap["核心冲突"] ?? "";
                    next.worldRules = sectionParsed.metaMap["世界规则"] ?? "";
                    next.keyTheme = sectionParsed.metaMap["核心主题"] ?? "";
                    setWorldviewTimeline(
                        (
                            payload?.worldview?.timeline?.map((x, i) => ({
                                id: `tl-${Date.now()}-${i}`,
                                label: (x.label ?? "").trim(),
                                value: (x.value ?? "").trim(),
                            })) ?? parseSectionRows(sectionParsed.sectionMap["时间线"], "节点")
                        ).filter((x) => x.label || x.value),
                    );
                    setWorldviewRegionLayers(
                        (
                            payload?.worldview?.regionLayers?.map((x, i) => ({
                                id: `rl-${Date.now()}-${i}`,
                                label: (x.label ?? "").trim(),
                                value: (x.value ?? "").trim(),
                            })) ?? parseSectionRows(sectionParsed.sectionMap["区域图层"], "图层")
                        ).filter((x) => x.label || x.value),
                    );
                    const linkedFromPayload: OcWorldviewLink[] = (payload?.worldview?.linkedOcsPreview ?? []).map((x) => ({
                        id: `oc-${x.artworkId}`,
                        artworkId: x.artworkId,
                        title: x.title,
                        imageUrl: x.imageUrl ?? null,
                        authorUsername: x.authorUsername ?? "",
                    }));
                    const pLo = pendingLinkedOcsPickRef.current;
                    const nextLinkedOcs = pLo.hasValue ? pLo.value : linkedFromPayload;
                    setWorldviewLinkedOcs(nextLinkedOcs);
                    setOcPrivacy(
                        data.ocPrivacy === "private" ? "private" : hadLegacyPrivateMarker ? "private" : "public",
                    );
                } else {
                    next.tagline = sectionParsed.metaMap["一句话介绍"] ?? "";
                    next.description = sectionParsed.intro ?? "";
                    next.allowDownload =
                        payload?.emoji?.downloadable === true ? "是" : payload?.emoji?.downloadable === false ? "否" : sectionParsed.metaMap["允许下载"] ?? "";
                    next.usageNotes = payload?.emoji?.usageNotes ?? sectionParsed.sectionMap["使用说明"]?.join("\n").trim() ?? "";
                    setOcPrivacy(
                        data.ocPrivacy === "private" ? "private" : hadLegacyPrivateMarker ? "private" : "public",
                    );
                }
                if (cancelled) return;
                setCategory(ui);
                setFormData(next);
                setCoverPreview(resolveApiUrl(data.imageUrl));
                setCoverFile(null);
                setExistingExtraImageUrls((payload?.extraImageUrls ?? []).filter(Boolean));
                setExtraImageFiles([]);
                setExtraImagePreviews([]);
                pendingOcWorldviewPickRef.current = {
                    hasValue: false,
                    value: null,
                    mergeMode: null,
                    replaceTargetId: null,
                };
                pendingLinkedOcsPickRef.current = { hasValue: false, value: [] };
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [artworkId, token, user?.id]);

    useEffect(() => {
        const s = location.state as { ocWorldviewPicked?: OcWorldviewLink | OcWorldviewLink[] | null } | null | undefined;
        if (!s || typeof s !== "object" || !("ocWorldviewPicked" in s)) return;
        const raw = s.ocWorldviewPicked;
        const next: OcWorldviewLink | null = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
        const mode = ocWorldviewPickModeRef.current;
        if (mode.mode === "replace" && Number.isFinite(mode.targetArtworkId) && next) {
            const replaceTid = mode.targetArtworkId as number;
            pendingOcWorldviewPickRef.current = {
                hasValue: true,
                value: next,
                mergeMode: "replace",
                replaceTargetId: replaceTid,
            };
            setOcWorldviewLinks((prev) =>
                prev.map((x) => (x.artworkId === replaceTid ? { ...next, id: next.id || `wv-${next.artworkId}` } : x)),
            );
        } else if (next) {
            pendingOcWorldviewPickRef.current = {
                hasValue: true,
                value: next,
                mergeMode: "add",
                replaceTargetId: null,
            };
            setOcWorldviewLinks((prev) => {
                const merged = [...prev, { ...next, id: next.id || `wv-${next.artworkId}` }];
                return Array.from(new Map(merged.map((x) => [x.artworkId, x])).values());
            });
        } else {
            pendingOcWorldviewPickRef.current = {
                hasValue: true,
                value: null,
                mergeMode: null,
                replaceTargetId: null,
            };
        }
        ocWorldviewPickModeRef.current = { mode: "add" };
        navigate(location.pathname, { replace: true, state: {} });
    }, [location.pathname, location.state, navigate]);

    useEffect(() => {
        const s = location.state as { worldviewLinkedOcsPicked?: OcWorldviewLink[] } | null | undefined;
        if (!s || typeof s !== "object" || !Array.isArray(s.worldviewLinkedOcsPicked)) return;
        const picked = s.worldviewLinkedOcsPicked;
        const mode = linkedOcPickModeRef.current;
        if (mode.mode === "replace" && Number.isFinite(mode.targetArtworkId)) {
            const targetId = mode.targetArtworkId as number;
            const replacement = picked.find((x) => x.artworkId !== targetId) ?? picked[0];
            if (replacement) {
                setWorldviewLinkedOcs((prev) => {
                    const merged = prev.map((x) =>
                        x.artworkId === targetId ? { ...replacement, id: replacement.id || `oc-${replacement.artworkId}` } : x,
                    );
                    pendingLinkedOcsPickRef.current = { hasValue: true, value: merged };
                    return merged;
                });
            }
        } else {
            const normalized = picked.map((x) => ({ ...x, id: x.id || `oc-${x.artworkId}` }));
            pendingLinkedOcsPickRef.current = { hasValue: true, value: normalized };
            setWorldviewLinkedOcs(normalized);
        }
        linkedOcPickModeRef.current = { mode: "add" };
        navigate(location.pathname, { replace: true, state: {} });
    }, [location.pathname, location.state, navigate]);

    const handleChange = useCallback((name: string, value: unknown) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    }, []);

    const handleCover = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCoverFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setCoverPreview(reader.result as string);
        reader.readAsDataURL(file);
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
                setExtraImagePreviews((prev) =>
                    [...prev, reader.result as string].slice(0, Math.max(0, 12 - existingExtraImageUrls.length)),
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

    const goPickWorldview = useCallback(
        (opts?: { mode?: "add" | "replace"; target?: OcWorldviewLink }) => {
            const mode = opts?.mode ?? "add";
            ocWorldviewPickModeRef.current =
                mode === "replace" && opts?.target
                    ? { mode: "replace", targetArtworkId: opts.target.artworkId }
                    : { mode: "add" };
            navigate("/studio/pick-worldview", {
                state: {
                    returnPath: normalizePickReturnPath(location.pathname),
                    initial: mode === "replace" && opts?.target ? opts.target : null,
                    resultChannel: "router",
                },
            });
        },
        [location.pathname, navigate],
    );

    const goPickLinkedOcs = useCallback((opts?: { mode?: "add" | "replace"; target?: OcWorldviewLink }) => {
        const mode = opts?.mode ?? "add";
        linkedOcPickModeRef.current =
            mode === "replace" && opts?.target
                ? { mode: "replace", targetArtworkId: opts.target.artworkId }
                : { mode: "add" };
        navigate("/studio/pick-linked-oc", {
            state: {
                returnPath: normalizePickReturnPath(location.pathname),
                initial: mode === "replace" && opts?.target ? [opts.target] : worldviewLinkedOcs,
                resultChannel: "router",
            },
        });
    }, [location.pathname, navigate, worldviewLinkedOcs]);

    const buildSubmitPayload = () => {
        const base: Record<string, unknown> = {
            ...formData,
            ocWorldviewLinks: ocWorldviewLinks,
        };
        if (category === "OC") base.tags = normalizeOcTagsField(formData.tags);
        if (category === "世界观") {
            base.tags = normalizeWorldviewTagsField(formData.tags);
            base.worldviewTimeline = worldviewTimeline.map(({ label, value }) => ({ label: label.trim(), value: value.trim() }));
            base.worldviewRegionLayers = worldviewRegionLayers.map(({ label, value }) => ({ label: label.trim(), value: value.trim() }));
            base.worldviewLinkedOcs = worldviewLinkedOcs;
            base.relatedCharacters = worldviewLinkedOcs.map((x) => x.title).join("、");
        }
        if (category === "表情包") base.tags = normalizeEmojiTagsField(formData.tags);
        return base;
    };

    const handleSave = async () => {
        if (!token || !Number.isInteger(artworkId) || artworkId < 1) return;
        setSaving(true);
        setError("");
        try {
            const uploadFile = async (file: File): Promise<string> => {
                const fd = new FormData();
                fd.append("file", file);
                const res = await fetch("/api/upload", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd,
                });
                if (!res.ok) throw new Error("图片上传失败");
                const data = await res.json();
                return data.url as string;
            };

            let uploadedCoverUrl: string | undefined;
            if (coverFile) uploadedCoverUrl = await uploadFile(coverFile);
            const uploadedExtraUrls: string[] = [];
            for (const f of extraImageFiles) uploadedExtraUrls.push(await uploadFile(f));

            const extraForCard = [...existingExtraImageUrls, ...uploadedExtraUrls].filter(Boolean);
            const payload = buildSubmitPayload();
            const title = getStudioArtworkTitle(category, payload);
            const description = buildStudioDescription(category, payload);
            const tags = getStudioArtworkTags(payload);
            const ocOmitPrimaryInCard = category === "OC" && Boolean(formData.ocCoverInDetailGallery === false) && extraForCard.length > 0;
            const descriptionForApi = mergeDescriptionWithCardPayload(
                description,
                category,
                payload,
                extraForCard.length ? extraForCard : undefined,
                category === "OC" ? { ocPrimaryImageNotInGallery: ocOmitPrimaryInCard } : undefined,
            );

            const res = await fetch(`/api/artworks/${artworkId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title,
                    description: descriptionForApi ?? description ?? null,
                    imageUrl: uploadedCoverUrl ?? (coverPreview ? toStorageUrl(coverPreview) : null),
                    tags,
                    gender: category === "OC" && formData.gender ? String(formData.gender).trim() || null : null,
                    ocPrivacy:
                        category === "OC" || category === "世界观" || category === "表情包" ? ocPrivacy : null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message ?? "保存失败");
            }
            navigate(`/artwork/${artworkId}`, {
                state: buildArtworkCloseState(detailPreviewCloseTo),
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

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
                    placeholder={field.placeholder?.trim() ? field.placeholder : studioFieldPlaceholder(field)}
                />
            ) : field.type === "select" ? (
                <select className="studio-ws-input" value={String(formData[field.name] ?? "")} onChange={(e) => handleChange(field.name, e.target.value)}>
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
                    placeholder={field.placeholder?.trim() ? field.placeholder : studioFieldPlaceholder(field)}
                />
            )}
        </div>
    );

    if (!isReady) return null;
    if (!user || !token) {
        return (
            <div className="oc-auth-gate-page">
                <div className="oc-auth-gate-page__inner">
                    <AuthPromptPanel title="登录后编辑作品" description="登录后可进入工作台结构的编辑页，完整修改所有字段。" />
                </div>
            </div>
        );
    }
    if (!Number.isInteger(artworkId) || artworkId < 1) {
        return <div className="studio-ws-banner studio-ws-banner--err">作品 ID 无效</div>;
    }
    if (loading) {
        return (
            <div className="studio-ws">
                <div className="studio-ws-inner">
                    <div className="studio-ws-banner">加载作品中...</div>
                </div>
            </div>
        );
    }
    if (forbidden) {
        return (
            <div className="studio-ws">
                <div className="studio-ws-inner">
                    <div className="studio-ws-banner studio-ws-banner--err">你没有权限编辑该作品。</div>
                </div>
            </div>
        );
    }

    const submitPayload = buildSubmitPayload();
    const previewTitle = getStudioArtworkTitle(category, submitPayload) || "未命名作品";
    const taglineStr = String(formData.tagline ?? "").trim();
    const previewBlurb = taglineStr.length > 120 ? `${taglineStr.slice(0, 120)}…` : taglineStr;
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
    const ocMetaFields = section3Fields.filter((f) => f.type !== "textarea");
    const ocRoleIntroField = section3Fields.find((f) => f.name === "tagline");
    const wvMetaFields = section3Fields.filter((f) => f.type !== "textarea" && !new Set(["tags"]).has(f.name));
    const wvLongFields = section3Fields.filter((f) => f.type === "textarea");
    const emojiAllowDownloadField = section3Fields.find((f) => f.name === "allowDownload");
    const emojiLongFields = section3Fields.filter((f) => f.type === "textarea");

    return (
        <div className="studio-ws">
            <div className="studio-ws-inner">
                <header className="studio-ws-header">
                    <div className="studio-ws-header-main">
                        <div className="studio-ws-eyebrow">Studio / 编辑工作台</div>
                        <h1 className="studio-ws-title">编辑作品</h1>
                        <p className="studio-ws-sub">与工作站同结构编辑，支持所属世界观、时间线、区域图层等完整字段。</p>
                    </div>
                    <div className="studio-ws-header-actions">
                        <button
                            type="button"
                            className="studio-ws-btn studio-ws-btn--ghost"
                            onClick={() =>
                                navigate(`/artwork/${artworkId}`, {
                                    state: buildArtworkCloseState(detailPreviewCloseTo),
                                })
                            }
                        >
                            返回详情
                        </button>
                        <button type="button" className="studio-ws-btn studio-ws-btn--primary" onClick={() => void handleSave()} disabled={saving}>
                            {saving ? "保存中…" : "保存修改"}
                        </button>
                    </div>
                </header>

                <section className="studio-ws-cats" aria-label="作品类型">
                    <div className="studio-ws-cats-row">
                        <button type="button" className="studio-ws-cat active" disabled>
                            <span className="studio-ws-cat-icon" aria-hidden>
                                {isOC ? "👤" : isWorldview ? "🌍" : "😂"}
                            </span>
                            <span className="studio-ws-cat-name">{category}</span>
                        </button>
                    </div>
                </section>

                {error ? <div className="studio-ws-banner studio-ws-banner--err">{error}</div> : null}

                <div className="studio-ws-grid">
                    <main className="studio-ws-main">
                        <div className="studio-ws-oc-shell">
                            <div className="studio-ws-oc-detail">
                                <div className="studio-ws-oc-detail-left">
                                    <header className="studio-ws-oc-aside-head">
                                        <span className="studio-ws-oc-aside-kicker">视觉主区</span>
                                        <h2 className="studio-ws-oc-aside-title">{isEmoji ? "封面与套图" : "主视觉封面"}</h2>
                                    </header>
                                    <div className="studio-ws-oc-cover-ring">
                                        <div className="studio-ws-oc-image-panel">
                                            <button type="button" className="studio-ws-cover-frame studio-ws-oc-cover-tap" onClick={() => coverInputRef.current?.click()}>
                                                {coverPreview ? (
                                                    <img src={coverPreview} alt="" className="studio-ws-cover-img" />
                                                ) : (
                                                    <div className="studio-ws-cover-ph studio-ws-cover-ph--oc">
                                                        <span className="studio-ws-cover-ph-label">点击上传</span>
                                                    </div>
                                                )}
                                            </button>
                                            <input ref={coverInputRef} type="file" accept="image/*" className="studio-ws-sr" onChange={handleCover} />
                                        </div>
                                    </div>
                                    <div className="studio-ws-oc-gallery">
                                        <p className="studio-ws-oc-gallery-label">{isEmoji ? "套内表情图" : "设定配图"}</p>
                                        {allExtraPreviews.length > 0 ? (
                                            <div className="studio-ws-oc-gallery-thumbs">
                                                {allExtraPreviews.map((src, i) => (
                                                    <div key={`${src}-${i}`} className="studio-ws-oc-gallery-thumb">
                                                        <img src={src} alt="" />
                                                        <button type="button" className="studio-ws-oc-gallery-thumb-x" onClick={() => removeExtraAt(i)} aria-label="移除">
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
                                            {allExtraPreviews.length >= 12 ? "已达 12 张上限" : `继续添加（${allExtraPreviews.length}/12）`}
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
                                            <div className="artwork-detail-work-section">
                                                {titleField ? (
                                                    <div className="studio-ws-oc-title-field">
                                                        <label className="studio-ws-label">{titleField.label}</label>
                                                        <input
                                                            className="studio-ws-input"
                                                            value={String(formData[titleField.name] ?? "")}
                                                            onChange={(e) => handleChange(titleField.name, e.target.value)}
                                                        />
                                                    </div>
                                                ) : null}
                                                {isOC ? (
                                                    <>
                                                        {ocMetaFields.length > 0 ? (
                                                            <div className="studio-ws-oc-meta-grid">{ocMetaFields.map((f) => renderField(f, true))}</div>
                                                        ) : null}
                                                        {ocRoleIntroField ? renderField(ocRoleIntroField) : null}
                                                    </>
                                                ) : (
                                                    <>
                                                        {taglineField ? renderField(taglineField) : null}
                                                        {descField ? renderField(descField) : null}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {isOC ? (
                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">所属世界观</h3>
                                                {ocWorldviewLinks.length > 0 ? (
                                                    <div className="studio-ws-wv-linked-list">
                                                        {ocWorldviewLinks.map((wv) => (
                                                            <div key={wv.artworkId} className="studio-ws-wv-pick-card">
                                                                <div className="studio-ws-wv-pick-card-cover" aria-hidden>
                                                                    {(() => {
                                                                        const cover = resolveArtworkUrl(wv.imageUrl, "");
                                                                        return cover ? (
                                                                            <img src={cover} alt="" />
                                                                        ) : (
                                                                            <span className="studio-ws-wv-pick-card-fallback">{wv.title.slice(0, 1)}</span>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="studio-ws-wv-pick-card-main">
                                                                    <div className="studio-ws-wv-pick-card-title">{wv.title}</div>
                                                                    <div className="studio-ws-wv-pick-card-author">@{wv.authorUsername || "未知作者"}</div>
                                                                    <div className="studio-ws-wv-pick-card-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="studio-ws-btn studio-ws-btn--ghost"
                                                                            onClick={() => setOcWorldviewLinks((prev) => prev.filter((x) => x.artworkId !== wv.artworkId))}
                                                                        >
                                                                            移除
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="studio-ws-btn studio-ws-btn--primary"
                                                                            onClick={() => goPickWorldview({ mode: "replace", target: wv })}
                                                                        >
                                                                            更换
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <button type="button" className="studio-ws-wv-pick-add" onClick={() => goPickWorldview({ mode: "add" })}>
                                                        <span className="studio-ws-wv-pick-add-icon">+</span>
                                                        <span className="studio-ws-wv-pick-add-text">选择所属世界观</span>
                                                    </button>
                                                )}
                                                {ocWorldviewLinks.length > 0 ? (
                                                    <div className="studio-ws-wv-linked-actions studio-ws-wv-linked-actions--solo">
                                                        <button type="button" className="studio-ws-btn studio-ws-btn--ghost" onClick={() => goPickWorldview({ mode: "add" })}>
                                                            添加
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {isWorldview ? (
                                            <>
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
                                                                        <div className="studio-ws-wv-pick-card-author">@{oc.authorUsername || "未知作者"}</div>
                                                                        <div className="studio-ws-wv-pick-card-actions">
                                                                            <button
                                                                                type="button"
                                                                                className="studio-ws-btn studio-ws-btn--ghost"
                                                                                onClick={() => setWorldviewLinkedOcs((prev) => prev.filter((x) => x.artworkId !== oc.artworkId))}
                                                                            >
                                                                                移除
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                className="studio-ws-btn studio-ws-btn--primary"
                                                                                onClick={() => goPickLinkedOcs({ mode: "replace", target: oc })}
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
                                                            <span className="studio-ws-wv-pick-add-icon">+</span>
                                                            <span className="studio-ws-wv-pick-add-text">添加相关 OC</span>
                                                        </button>
                                                    )}
                                                    {worldviewLinkedOcs.length > 0 ? (
                                                        <div className="studio-ws-wv-linked-actions studio-ws-wv-linked-actions--solo">
                                                            <button
                                                                type="button"
                                                                className="studio-ws-btn studio-ws-btn--ghost"
                                                                onClick={() => goPickLinkedOcs({ mode: "add" })}
                                                            >
                                                                添加
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
                                            </>
                                        ) : null}

                                        {isEmoji ? (
                                            <div className="artwork-detail-card studio-ws-oc-panel">
                                                <h3 className="artwork-detail-section-title">规格与授权</h3>
                                                {emojiAllowDownloadField ? (
                                                    <div className="studio-ws-oc-meta-grid">{renderField(emojiAllowDownloadField, true)}</div>
                                                ) : null}
                                                {emojiLongFields.map((f) => (
                                                    <div key={f.name} className="studio-ws-wv-long-field">
                                                        {renderField(f)}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}

                                        <div className="artwork-detail-card studio-ws-oc-panel">
                                            <h3 className="artwork-detail-section-title">标签</h3>
                                            <OcTagsPanel
                                                variant={isWorldview ? "worldview" : isEmoji ? "emoji" : "oc"}
                                                value={String(formData.tags ?? "")}
                                                onChange={(v) => handleChange("tags", v)}
                                            />
                                        </div>

                                        {isOC || isWorldview || isEmoji ? (
                                            <div className="artwork-detail-card studio-ws-oc-panel studio-ws-oc-panel--privacy">
                                                <h3 className="artwork-detail-section-title">隐私设置</h3>
                                                {isWorldview || isEmoji ? (
                                                    <p className="studio-ws-oc-panel-lead-desc">
                                                        私有作品不会出现在全站列表与他人访问中，仅作者本人可打开详情。
                                                    </p>
                                                ) : null}
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
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>

                    <aside className="studio-ws-aside">
                        <section className="studio-ws-preview-panel">
                            <div className="studio-ws-preview-head">
                                <h2 className="studio-ws-preview-title">实时预览</h2>
                            </div>
                            <div className={`studio-ws-preview-card studio-ws-preview-card--list${isWorldview || isEmoji ? " studio-ws-preview-card--solo" : ""}`}>
                                {isWorldview || isEmoji ? (
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
                                            emojiPackExcerpt={isEmoji ? String(formData.description ?? "") : undefined}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <div className="studio-ws-preview-cover">{coverPreview ? <img src={coverPreview} alt="" /> : null}</div>
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
