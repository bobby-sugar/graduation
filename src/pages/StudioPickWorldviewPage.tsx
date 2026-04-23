import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { normalizeArtworkKind } from "../artwork/apiCategory";
import { resolveArtworkUrl } from "../components/artwork/resolveArtworkUrl";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { WORLDVIEW_PICK_SESSION_KEY, type OcWorldviewLink, type WorldviewPickLocationState } from "../studio/ocWorldviewLinks";
import {
    readPickUiRoute,
    resolvePickReturnPath,
    writePickUiRoute,
} from "../studio/worldviewPickUiMemory";

function normalizeInitialPick(raw: WorldviewPickLocationState["initial"]): OcWorldviewLink | null {
    if (raw == null) return null;
    if (Array.isArray(raw)) {
        const first = raw[0];
        if (first && typeof first.artworkId === "number") return first;
        return null;
    }
    if (typeof raw.artworkId === "number" && Number.isFinite(raw.artworkId)) return raw;
    return null;
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

function toLink(row: ApiArtworkRow): OcWorldviewLink | null {
    if (normalizeArtworkKind(row.category ?? "") !== "worldview") return null;
    const id = row.id;
    if (!Number.isFinite(id)) return null;
    return {
        id: `wv-${id}`,
        artworkId: id,
        title: (row.title ?? "").trim() || "未命名世界观",
        authorUsername: (row.author?.username ?? "").trim() || "未知作者",
        authorId: row.author?.id,
        imageUrl: row.imageUrl ?? null,
    };
}

export default function StudioPickWorldviewPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { token, user } = useAuth();
    const pickState = (location.state ?? null) as WorldviewPickLocationState | null;
    const returnPath = resolvePickReturnPath(pickState?.returnPath ?? null);
    const resultChannel = pickState?.resultChannel ?? "router";
    const initialFromNav = normalizeInitialPick(pickState?.initial);

    const [tab, setTab] = useState<"mine" | "search">(() => readPickUiRoute(returnPath)?.tab ?? "mine");
    const [mineRows, setMineRows] = useState<ApiArtworkRow[]>([]);
    const [mineLoading, setMineLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState(() => readPickUiRoute(returnPath)?.searchQuery ?? "");
    const [searchRows, setSearchRows] = useState<ApiArtworkRow[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selected, setSelected] = useState<OcWorldviewLink | null>(() => initialFromNav);

    const tabRef = useRef(tab);
    const searchQueryRef = useRef(searchQuery);
    const returnPathRef = useRef(returnPath);
    tabRef.current = tab;
    searchQueryRef.current = searchQuery;

    useEffect(() => {
        if (returnPathRef.current === returnPath) return;
        returnPathRef.current = returnPath;
        const m = readPickUiRoute(returnPath);
        if (m) {
            setTab(m.tab);
            setSearchQuery(m.searchQuery);
        }
    }, [returnPath]);

    /** 立即写入当前滚动 + Tab + 搜索（离开 / 完成 / 切页前必调） */
    const flushPickUiFull = useCallback(() => {
        const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const scrollY = Math.min(Math.max(0, window.scrollY), maxTop);
        writePickUiRoute(returnPath, { tab: tabRef.current, searchQuery: searchQueryRef.current, scrollY });
    }, [returnPath]);

    /** 仅 Tab/搜索变化时防抖写入；窗口仍在顶部时不冲掉已保存的滚动 */
    const flushPickUiFieldsDebounced = useCallback(() => {
        const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const scrollY = Math.min(Math.max(0, window.scrollY), maxTop);
        writePickUiRoute(
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
        const mem = readPickUiRoute(returnPath);
        const y = mem?.scrollY;
        if (!y || y < 8) return;
        const tid = window.setTimeout(() => {
            const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const top = Math.min(y, maxTop);
            window.scrollTo({ top, behavior: "auto" });
            writePickUiRoute(
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

    const pickLink = useCallback((link: OcWorldviewLink) => {
        setSelected((prev) => (prev?.artworkId === link.artworkId ? null : link));
    }, []);

    const isSelected = useCallback((id: number) => selected?.artworkId === id, [selected]);

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
        if (!q) {
            setSearchRows([]);
            return;
        }
        let cancelled = false;
        const t = window.setTimeout(async () => {
            setSearchLoading(true);
            try {
                const res = await fetch(`/api/artworks/search?q=${encodeURIComponent(q)}`, {
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
        }, 320);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [searchQuery, token]);

    const mineWorldviews = useMemo(() => mineRows.map(toLink).filter(Boolean) as OcWorldviewLink[], [mineRows]);
    const searchWorldviews = useMemo(() => searchRows.map(toLink).filter(Boolean) as OcWorldviewLink[], [searchRows]);

    /** 全站 Tab：无关键词时展示自己全部世界观；有关键词时合并「自己作品中匹配的」与接口搜索结果（去重，自己的在前） */
    const mergedSearchWorldviews = useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return mineWorldviews;
        const qLower = q.toLowerCase();
        const mineMatching: OcWorldviewLink[] = [];
        for (const row of mineRows) {
            const link = toLink(row);
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
        for (const l of searchWorldviews) {
            if (!seen.has(l.artworkId)) {
                seen.add(l.artworkId);
                out.push(l);
            }
        }
        return out;
    }, [mineRows, mineWorldviews, searchQuery, searchWorldviews]);

    const handleConfirm = useCallback(() => {
        flushPickUiFull();
        if (resultChannel === "session") {
            try {
                sessionStorage.setItem(WORLDVIEW_PICK_SESSION_KEY, JSON.stringify(selected));
            } catch {
                /* ignore */
            }
            navigate(returnPath, { replace: true });
            return;
        }
        navigate(returnPath, { replace: true, state: { ocWorldviewPicked: selected } });
    }, [flushPickUiFull, navigate, resultChannel, returnPath, selected]);

    if (!user || !token) {
        return (
            <div className="studio-page-root">
                <div className="oc-auth-gate-page">
                    <div className="oc-auth-gate-page__inner">
                        <AuthPromptPanel title="登录后选择所属世界观" description="登录后即可浏览自己与他人发布的世界观作品，并绑定为当前 OC 的所属世界观。" />
                    </div>
                </div>
            </div>
        );
    }

    const renderCard = (link: OcWorldviewLink, fromSearchTab: boolean) => {
        const img = resolveArtworkUrl(link.imageUrl, "");
        const on = isSelected(link.artworkId);
        const showMineBadge = fromSearchTab && user?.id != null && link.authorId === user.id;
        return (
            <button
                key={link.artworkId}
                type="button"
                className={`studio-pick-wv-card ${on ? "studio-pick-wv-card--on" : ""}`}
                onClick={() => pickLink(link)}
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
                    <span className="studio-pick-wv-card-kind">世界观</span>
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

    const selectedCover = selected ? resolveArtworkUrl(selected.imageUrl, "") : "";

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
                    <h1 className="studio-pick-wv-title-page">选择所属世界观</h1>
                </header>

                <div className="studio-pick-wv-tabbar" role="tablist" aria-label="作品来源">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === "mine"}
                        className={`studio-pick-wv-tab ${tab === "mine" ? "is-active" : ""}`}
                        onClick={() => setTab("mine")}
                    >
                        我的世界观
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === "search"}
                        className={`studio-pick-wv-tab ${tab === "search" ? "is-active" : ""}`}
                        onClick={() => setTab("search")}
                    >
                        全站搜索
                    </button>
                </div>

                <section className="studio-pick-wv-sheet">
                    <div className="studio-pick-wv-list">
                        {tab === "mine" ? (
                            mineLoading ? (
                                <p className="studio-pick-wv-empty">加载中…</p>
                            ) : mineWorldviews.length === 0 ? (
                                <p className="studio-pick-wv-empty">暂无世界观作品，请先在工作站发布「世界观」类型。</p>
                            ) : (
                                <div className="studio-pick-wv-grid">{mineWorldviews.map((l) => renderCard(l, false))}</div>
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
                                        placeholder="搜标题、标签、简介或作者…"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        aria-label="搜索世界观"
                                    />
                                </label>
                                {!searchQuery.trim() ? (
                                    mineLoading ? (
                                        <p className="studio-pick-wv-empty">加载中…</p>
                                    ) : mergedSearchWorldviews.length === 0 ? (
                                        <p className="studio-pick-wv-empty">你还没有世界观作品，请先在「工作站」发布。</p>
                                    ) : (
                                        <div className="studio-pick-wv-grid">
                                            {mergedSearchWorldviews.map((l) => renderCard(l, false))}
                                        </div>
                                    )
                                ) : searchLoading && mergedSearchWorldviews.length === 0 ? (
                                    <p className="studio-pick-wv-empty">搜索中…</p>
                                ) : mergedSearchWorldviews.length === 0 ? (
                                    <p className="studio-pick-wv-empty">没有找到匹配的世界观。</p>
                                ) : (
                                    <div className="studio-pick-wv-grid">
                                        {mergedSearchWorldviews.map((l) => renderCard(l, true))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                <footer className="studio-pick-wv-footer">
                    <div className="studio-pick-wv-footer-left">
                        {selected ? (
                            <>
                                <div className="studio-pick-wv-footer-thumb" aria-hidden>
                                    {selectedCover ? (
                                        <img src={selectedCover} alt="" />
                                    ) : (
                                        <span>{selected.title.slice(0, 1)}</span>
                                    )}
                                </div>
                                <div className="studio-pick-wv-footer-meta">
                                    <span className="studio-pick-wv-footer-eyebrow">当前已选</span>
                                    <span className="studio-pick-wv-footer-title" title={selected.title}>
                                        {selected.title}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div className="studio-pick-wv-footer-meta">
                                <span className="studio-pick-wv-footer-eyebrow">当前已选</span>
                                <span className="studio-pick-wv-footer-title studio-pick-wv-footer-title--muted">未选择（可不关联）</span>
                            </div>
                        )}
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
