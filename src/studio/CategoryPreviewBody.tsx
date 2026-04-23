interface CategoryPreviewBodyProps {
    category: string;
    previewTitle: string;
    previewBlurb: string;
    tagChips: string[];
    previewKvs: { label: string; value: string }[];
    coverPreview: string | null;
    extraPreviews: string[];
    /** 表情包：「允许下载」表单值（是 / 否 / 空） */
    emojiAllowDownload?: string;
    /** 表情包：套组说明摘，对应发布后详情「套组介绍」 */
    emojiPackExcerpt?: string;
}

function emojiDownloadPreviewBadge(allowRaw: string | undefined): { text: string; tone: "allow" | "deny" | "muted" } {
    const v = (allowRaw ?? "").trim();
    if (v === "是") return { text: "可下载", tone: "allow" };
    if (v === "否") return { text: "不可下载", tone: "deny" };
    return { text: "未选择", tone: "muted" };
}

/** 与首页 `ArtworkCategoryCardInner` 表情包网格一致：≥9 格用 3 列否则 2 列；2 列时最多展示 4 格；不足 4 张用首图垫满 */
function buildEmojiPreviewGrid(
    coverPreview: string | null,
    extraPreviews: string[],
): { displayUrls: string[]; cols: 2 | 3 } {
    const cells = [coverPreview, ...extraPreviews].filter(Boolean) as string[];
    const out = [...cells];
    while (out.length < 4 && out.length > 0) out.push(out[0]);
    const urls = out.slice(0, 9);
    const cols: 2 | 3 = urls.length >= 9 ? 3 : 2;
    const displayUrls = urls.slice(0, cols === 3 ? 9 : 4);
    return { displayUrls, cols };
}

/** 工作站右侧「分类专属实时预览」：各类型仅展示与列表/档案一致的关键层级 */
export function StudioCategoryPreviewBody({
    category,
    previewTitle,
    previewBlurb,
    tagChips,
    previewKvs,
    coverPreview,
    extraPreviews,
    emojiAllowDownload,
    emojiPackExcerpt,
}: CategoryPreviewBodyProps) {
    if (category === "世界观") {
        return (
            <div className="studio-ws-preview-variant studio-ws-preview-variant--world">
                {coverPreview ? (
                    <div className="studio-ws-preview-world-visual">
                        <img src={coverPreview} alt="" />
                        <div className="studio-ws-preview-world-scrim" />
                    </div>
                ) : (
                    <div className="studio-ws-preview-world-visual studio-ws-preview-world-visual--empty" aria-hidden>
                        <span className="studio-ws-preview-world-empty-icon">🌍</span>
                        <span className="studio-ws-preview-world-empty-txt">主封面将显示在列表卡顶部</span>
                    </div>
                )}
                <h3 className="studio-ws-preview-ht">{previewTitle || "未命名世界观"}</h3>
                <p className="studio-ws-preview-blurb">{previewBlurb}</p>
                {tagChips.length > 0 ? (
                    <div className="studio-ws-preview-tags">
                        {tagChips.map((t) => (
                            <span key={t} className="studio-ws-preview-tag">
                                #{t}
                            </span>
                        ))}
                    </div>
                ) : null}
                <div className="studio-ws-preview-kv">
                    <div className="studio-ws-preview-kv-cap">关键信息</div>
                    <div className="studio-ws-preview-kv-grid">
                        {previewKvs.map((kv) => (
                            <div key={kv.label} className="studio-ws-preview-kv-cell">
                                {kv.label}：{kv.value}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (category === "表情包") {
        const sheetCount = (coverPreview ? 1 : 0) + extraPreviews.filter(Boolean).length;
        const { displayUrls, cols } = buildEmojiPreviewGrid(coverPreview, extraPreviews);
        const dl = emojiDownloadPreviewBadge(emojiAllowDownload);

        return (
            <div className="studio-ws-preview-variant studio-ws-preview-variant--emoji">
                <div className="studio-ws-preview-emoji-visual">
                    {displayUrls.length > 0 ? (
                        <div className={`artwork-card-emoji-grid artwork-card-emoji-grid--${cols}`}>
                            {displayUrls.map((src, i) => (
                                <div key={`emoji-${src}-${i}`} className="artwork-card-emoji-cell">
                                    <img src={src} alt="" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="artwork-card-emoji-grid artwork-card-emoji-grid--2 studio-ws-preview-emoji-grid--empty" aria-hidden>
                            {[0, 1, 2, 3].map((i) => (
                                <div key={`emoji-ph-${i}`} className="artwork-card-emoji-cell studio-ws-preview-emoji-grid-ph">
                                    <span>+</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="studio-ws-preview-emoji-top-meta">
                    <span className="studio-ws-preview-sub-pill">表情包</span>
                    {sheetCount > 0 ? <span className="studio-ws-preview-emoji-count">共 {sheetCount} 张</span> : null}
                </div>

                <h3 className="studio-ws-preview-ht">{previewTitle || "未命名表情包"}</h3>
                <p className="studio-ws-preview-blurb">{previewBlurb}</p>

                {tagChips.length > 0 ? (
                    <div className="studio-ws-preview-tags">
                        {tagChips.map((t) => (
                            <span key={t} className="studio-ws-preview-tag">
                                #{t}
                            </span>
                        ))}
                    </div>
                ) : null}

                {emojiPackExcerpt ? (
                    <div className="studio-ws-preview-emoji-pack">
                        <div className="studio-ws-preview-emoji-pack-cap">套组介绍</div>
                        <p className="studio-ws-preview-emoji-pack-txt">{emojiPackExcerpt}</p>
                    </div>
                ) : null}

                <div className="studio-ws-preview-emoji-usage-head">
                    <span className="studio-ws-preview-emoji-usage-cap">使用说明</span>
                    <span
                        className={`studio-ws-preview-emoji-dl-badge${
                            dl.tone === "allow"
                                ? " studio-ws-preview-emoji-dl-badge--allow"
                                : dl.tone === "deny"
                                  ? " studio-ws-preview-emoji-dl-badge--deny"
                                  : " studio-ws-preview-emoji-dl-badge--muted"
                        }`}
                    >
                        {dl.text}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <>
            <h3 className="studio-ws-preview-ht">{previewTitle}</h3>
            <p className="studio-ws-preview-blurb">{previewBlurb}</p>
            {tagChips.length > 0 ? (
                <div className="studio-ws-preview-tags">
                    {tagChips.map((t) => (
                        <span key={t} className="studio-ws-preview-tag">
                            #{t}
                        </span>
                    ))}
                </div>
            ) : null}
            <div className="studio-ws-preview-kv">
                <div className="studio-ws-preview-kv-cap">关键信息</div>
                <div className="studio-ws-preview-kv-grid">
                    {previewKvs.map((kv) => (
                        <div key={kv.label} className="studio-ws-preview-kv-cell">
                            {kv.label}：{kv.value}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
