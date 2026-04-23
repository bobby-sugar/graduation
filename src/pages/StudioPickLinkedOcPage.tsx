import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { normalizeArtworkKind } from "../artwork/apiCategory";
import { resolveArtworkUrl } from "../components/artwork/resolveArtworkUrl";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import {
    WORLDVIEW_LINKED_OC_PICK_SESSION_KEY,
    type OcWorldviewLink,
    type WorldviewLinkedOcPickLocationState,
} from "../studio/ocWorldviewLinks";
import {
    readLinkedOcPickUiRoute,
    resolveLinkedOcPickReturnPath,
    writeLinkedOcPickUiRoute,
} from "../studio/worldviewLinkedOcPickUiMemory";

function normalizeInitialPicks(raw: WorldviewLinkedOcPickLocationState["initial"]): OcWorldviewLink[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
        return raw.filter((x) => x && typeof x.artworkId === "number" && Number.isFinite(x.artworkId));
    }
    if (typeof raw.artworkId === "number" && Number.isFinite(raw.artworkId)) return [raw];
    return [];
}

type ApiArtworkRow = {
    id: number;
    title?: string | null;
    category?: string | null;
    imageUrl?: string | null;
    description?: string | null;
    tags?: string | null;
    author?: { id?: number; username?: string | null } | null;
};

function rowMatchesQuery(row: ApiArtworkRow, qLower: string): boolean {
    const blob = [row.title, row.description, row.tags, row.author?.username]
        .map((x) => (x ?? "").toString().toLowerCase())
        .join("\n");
    return blob.includes(qLower);
}

function toOcLink(row: ApiArtworkRow): OcWorldviewLink | null {
    if (normalizeArtworkKind(row.category ?? "") !== "oc") return null;
    const id = row.id;
    if (!Number.isFinite(id)) return null;
    return {
        id: `oc-${id}`,
        artworkId: id,
        title: (row.title ?? "").trim() || "未命名 OC",
        authorUsername: (row.author?.username ?? "").trim() || "未知作者",
        authorId: row.author?.id,
        imageUrl: row.imageUrl ?? null,
    };
}

const MAX_PICK = 24;

export default function StudioPickLinkedOcPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { token, user } = useAuth();
    const pickState = (location.state ?? null) as WorldviewLinkedOcPickLocationState | null;
    const returnPath = resolveLinkedOcPickReturnPath(pickState?.returnPath ?? null);
    const resultChannel = pickState?.resultChannel ?? "router";
    const initialFromNav = normalizeInitialPicks(pickState?.initial);

    const [tab, setTab] = useState<"mine" | "search">(() => readLinkedOcPickUiRoute(returnPath)?.tab ?? "mine");
    const [mineRows, setMineRows] = useState<ApiArtworkRow[]>([]);
    const [mineLoading, setMineLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState(() => readLinkedOcPickUiRoute(returnPath)?.searchQuery ?? "");
    const [searchRows, setSearchRows] = useState<ApiArtworkRow[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selected, setSelected] = useState<OcWorldviewLink[]>(() => initialFromNav);

    const tabRef = useRef(tab);
    const searchQueryRef = useRef(searchQuery);
    const returnPathRef = useRef(returnPath);
    tabRef.current = tab;
    searchQueryRef.current = searchQuery;

    useEffect(() => {
        if (returnPathRef.current === returnPath) return;
        returnPathRef.current = returnPath;
        const m = readLinkedOcPickUiRoute(returnPath);
        if (m) {
            setTab(m.tab);
            setSearchQuery(m.searchQuery);
        }
    }, [returnPath]);

    const flushPickUiFull = useCallback(() => {
        const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const scrollY = Math.min(Math.max(0, window.scrollY), maxTop);
        writeLinkedOcPickUiRoute(returnPath, { tab: tabRef.current, searchQuery: searchQueryRef.current, scrollY });
    }, [returnPath]);

    const flushPickUiFieldsDebounced = useCallback(() => {
        const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const scrollY = Math.min(Math.max(0, window.scrollY), maxTop);
        writeLinkedOcPickUiRoute(
            returnPath,
            { tab: tabRef.current, searchQuery: searchQueryRef.current, scrollY },
            { keepScrollIfWindowTop: true },
        );
    }, [returnPath]);

    const handleLeave = useCallback(() => {
        flushPickUiFull();
        navigate(returnPath, { replace: true });
    }, [flushPickUiFull, navigate, returnPath]);

    useEffect(() => {
        const mem = readLinkedOcPickUiRoute(returnPath);
        const y = mem?.scrollY;
        if (!y || y < 8) return;
        const tid = window.setTimeout(() => {
            const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const top = Math.min(y, maxTop);
            window.scrollTo({ top, behavior: "auto" });
            writeLinkedOcPickUiRoute(
                returnPath,
                { tab: tabRef.current, searchQuery: searchQueryRef.current, scrollY: top },
                { keepScrollIfWindowTop: false },
            );
        }, 80);
        return () => window.clearTimeout(tid);
    }, [returnPath]);

    useEffect(() => {
        const t = window.setTimeout(() => flushPickUiFieldsDebounced(), 400);
        return () => window.clearTimeout(t);
    }, [tab, searchQuery, flushPickUiFieldsDebounced]);

    useEffect(() => {
        const persist = () => flushPickUiFull();
        window.addEventListener("pagehide", persist);
        const onVis = () => {
            if (document.visibilityState === "hidden") persist();
        };
        document.addEventListener("visibilitychange", onVis);
        let scrollT = 0;
        const onScroll = () => {
            window.clearTimeout(scrollT);
            scrollT = window.setTimeout(() => flushPickUiFull(), 280);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("pagehide", persist);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("scroll", onScroll);
            window.clearTimeout(scrollT);
        };
    }, [flushPickUiFull]);

    const togglePick = useCallback((link: OcWorldviewLink) => {
        setSelected((prev) => {
            const i = prev.findIndex((x) => x.artworkId === link.artworkId);
            if (i >= 0) return prev.filter((_, j) => j !== i);
            if (prev.length >= MAX_PICK) return prev;
            return [...prev, link];
        });
    }, []);

    const isOn = useCallback((id: number) => selected.some((x) => x.artworkId === id), [selected]);

    useEffect(() => {
        if (!user?.id || !token) {
            setMineRows([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setMineLoading(true);
            try {
                const res = await fetch(`/api/artworks?authorId=${user.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok || cancelled) return;
                const data = (await res.json()) as ApiArtworkRow[];
                setMineRows(Array.isArray(data) ? data : []);
            } catch {
                if (!cancelled) setMineRows([]);
            } finally {
                if (!cancelled) setMineLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, user?.id]);

    useEffect(() => {
        const q = searchQuery.trim();
        let cancelled = false;
        const t = window.setTimeout(async () => {
            setSearchLoading(true);
            try {
                const res = await fetch(`/api/artworks/linkable-ocs?q=${encodeURIComponent(q)}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!res.ok || cancelled) return;
                const data = (await res.json()) as ApiArtworkRow[];
                setSearchRows(Array.isArray(data) ? data : []);
            } catch {
                if (!cancelled) setSearchRows([]);
            } finally {
                if (!cancelled) setSearchLoading(false);
            }
        }, q ? 320 : 0);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [searchQuery, token]);

    const mineOcs = useMemo(() => mineRows.map(toOcLink).filter(Boolean) as OcWorldviewLink[], [mineRows]);

    const linkableAsLinks = useMemo(() => searchRows.map(toOcLink).filter(Boolean) as OcWorldviewLink[], [searchRows]);

    const mergedSearchOcs = useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return linkableAsLinks;
        const qLower = q.toLowerCase();
        const mineMatching: OcWorldviewLink[] = [];
        for (const row of mineRows) {
            const link = toOcLink(row);
            if (link && rowMatchesQuery(row, qLower)) mineMatching.push(link);
        }
        const seen = new Set<number>();
        const out: OcWorldviewLink[] = [];
        for (const l of mineMatching) {
            if (!seen.has(l.artworkId)) {
                seen.add(l.artworkId);
                out.push(l);
            }
        }
        for (const l of linkableAsLinks) {
            if (!seen.has(l.artworkId)) {
                seen.add(l.artworkId);
                out.push(l);
            }
        }
        return out;
    }, [mineRows, linkableAsLinks, searchQuery]);

    const handleConfirm = useCallback(() => {
        flushPickUiFull();
        if (resultChannel === "session") {
            try {
                sessionStorage.setItem(WORLDVIEW_LINKED_OC_PICK_SESSION_KEY, JSON.stringify(selected));
            } catch {
                /* ignore */
            }
            navigate(returnPath, { replace: true });
            return;
        }
        navigate(returnPath, { replace: true, state: { worldviewLinkedOcsPicked: selected } });
    }, [flushPickUiFull, navigate, resultChannel, returnPath, selected]);

    const renderCard = (link: OcWorldviewLink, fromSearchTab: boolean) => {
        const img = resolveArtworkUrl(link.imageUrl, "");
        const on = isOn(link.artworkId);
        const showMineBadge = fromSearchTab && user?.id != null && link.authorId === user.id;
        return (
            <button
                key={link.artworkId}
                type="button"
                className={`studio-pick-wv-card ${on ? "studio-pick-wv-card--on" : ""}`}
                onClick={() => togglePick(link)}
                aria-pressed={on}
            >
                <div className="studio-pick-wv-card-cover">
                    {img ? (
                        <img src={img} alt="" className="studio-pick-wv-card-img" loading="lazy" />
                    ) : (
                        <span className="studio-pick-wv-card-fallback" aria-hidden>
                            {link.title.slice(0, 1)}
                        </span>
                    )}
                    <span className="studio-pick-wv-card-kind">OC</span>
                    {showMineBadge ? <span className="studio-pick-wv-card-badge">我的</span> : null}
                    {on ? (
                        <span className="studio-pick-wv-card-selected-mark" aria-hidden>
                            ✓
                        </span>
                    ) : null}
                </div>
                <div className="studio-pick-wv-card-body">
                    <div className="studio-pick-wv-card-title">{link.title}</div>
                    <div className="studio-pick-wv-card-author">@{link.authorUsername}</div>
                </div>
            </button>
        );
    };

    if (!user || !token) {
        return (
            <div className="studio-page-root">
                <div className="oc-auth-gate-page">
                    <div className="oc-auth-gate-page__inner">
                        <AuthPromptPanel
                            title="登录后选择相关 OC"
                            description="登录后可在「我的」中浏览自己全部 OC（含私有）；全站列表仅展示公共 OC，与后端 ocPrivacy 规则一致。"
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="studio-page-root studio-pick-wv-page">
            <div className="studio-pick-wv-bg" aria-hidden />
            <div className="studio-pick-wv-inner">
                <header className="studio-pick-wv-header">
                    <div className="studio-pick-wv-header-row">
                        <button type="button" className="studio-pick-wv-back-btn" onClick={handleLeave}>
                            <svg className="studio-pick-wv-back-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path
                                    d="M15 18l-6-6 6-6"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <span>返回</span>
                        </button>
                        <span className="studio-pick-wv-kicker">工作站</span>
                    </div>
                    <h1 className="studio-pick-wv-title-page">选择相关 OC</h1>
                    <p className="studio-pick-wv-privacy-note">
                        「我的」含你名下全部 OC（含私有）；「全站公共 OC」仅展示 ocPrivacy 为公共的作品，数据来自 /api/artworks/linkable-ocs。可多选，最多{" "}
                        {MAX_PICK} 个。
                    </p>
                </header>

                <div className="studio-pick-wv-tabbar" role="tablist" aria-label="作品来源">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === "mine"}
                        className={`studio-pick-wv-tab ${tab === "mine" ? "is-active" : ""}`}
                        onClick={() => setTab("mine")}
                    >
                        我的 OC
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === "search"}
                        className={`studio-pick-wv-tab ${tab === "search" ? "is-active" : ""}`}
                        onClick={() => setTab("search")}
                    >
                        全站公共 OC
                    </button>
                </div>

                <section className="studio-pick-wv-sheet">
                    <div className="studio-pick-wv-list">
                        {tab === "mine" ? (
                            mineLoading ? (
                                <p className="studio-pick-wv-empty">加载中…</p>
                            ) : mineOcs.length === 0 ? (
                                <p className="studio-pick-wv-empty">暂无 OC 作品，请先在「工作站」发布 OC。</p>
                            ) : (
                                <div className="studio-pick-wv-grid">{mineOcs.map((l) => renderCard(l, false))}</div>
                            )
                        ) : (
                            <div className="studio-pick-wv-search-stack">
                                <label className="studio-pick-wv-search-label">
                                    <span className="studio-pick-wv-search-icon" aria-hidden>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                                            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </span>
                                    <input
                                        className="studio-pick-wv-search"
                                        type="search"
                                        placeholder="搜标题、标签、简介或作者…（空则列出公共 OC）"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        aria-label="搜索公共 OC"
                                    />
                                </label>
                                {searchLoading && mergedSearchOcs.length === 0 ? (
                                    <p className="studio-pick-wv-empty">加载中…</p>
                                ) : mergedSearchOcs.length === 0 ? (
                                    <p className="studio-pick-wv-empty">
                                        {searchQuery.trim() ? "没有匹配的公共 OC。" : "暂无可关联的公共 OC。"}
                                    </p>
                                ) : (
                                    <div className="studio-pick-wv-grid">
                                        {mergedSearchOcs.map((l) => renderCard(l, true))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                <footer className="studio-pick-wv-footer">
                    <div className="studio-pick-wv-footer-left">
                        <div className="studio-pick-wv-footer-meta">
                            <span className="studio-pick-wv-footer-eyebrow">当前已选</span>
                            <span className="studio-pick-wv-footer-title" title={selected.map((s) => s.title).join("、")}>
                                {selected.length === 0
                                    ? "未选择（可不关联）"
                                    : `已选 ${selected.length} 个：${selected
                                          .slice(0, 3)
                                          .map((s) => s.title)
                                          .join("、")}${selected.length > 3 ? "…" : ""}`}
                            </span>
                        </div>
                    </div>
                    <div className="studio-pick-wv-actions">
                        <button type="button" className="studio-pick-wv-btn studio-pick-wv-btn--ghost" onClick={handleLeave}>
                            取消
                        </button>
                        <button type="button" className="studio-pick-wv-btn studio-pick-wv-btn--primary" onClick={handleConfirm}>
                            完成选择
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
