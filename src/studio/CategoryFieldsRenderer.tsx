import type { ChangeEvent, RefObject } from "react";
import { studioFieldPlaceholder, type FormFieldDef } from "./studioFormFields";

export interface CategoryFieldsRendererProps {
    category: string;
    titleField: FormFieldDef | undefined;
    taglineField: FormFieldDef | undefined;
    descField: FormFieldDef | undefined;
    section3Fields: FormFieldDef[];
    renderField: (field: FormFieldDef, compact?: boolean) => React.ReactNode;
    coverPreview: string | null;
    coverInputRef: RefObject<HTMLInputElement | null>;
    onCoverChange: (e: ChangeEvent<HTMLInputElement>) => void;
    extraImagePreviews: string[];
    extraInputRef: RefObject<HTMLInputElement | null>;
    onExtraImages: (e: ChangeEvent<HTMLInputElement>) => void;
    onRemoveExtra: (index: number) => void;
    formTagsValue: string;
    onTagsChange: (v: string) => void;
    visibility: "public" | "private";
    onVisibility: (v: "public" | "private") => void;
}

/**
 * 非 OC 类目：统一工作站框架下的分类专属表单区（封面 + 多图槽 + 专属字段 + 标签与可见性）。
 */
export function CategoryFieldsRenderer({
    category,
    titleField,
    taglineField,
    descField,
    section3Fields,
    renderField,
    coverPreview,
    coverInputRef,
    onCoverChange,
    extraImagePreviews,
    extraInputRef,
    onExtraImages,
    onRemoveExtra,
    formTagsValue,
    onTagsChange,
    visibility,
    onVisibility,
}: CategoryFieldsRendererProps) {
    const multiVisual = category === "表情包";
    const specFields = section3Fields.filter((f) => f.name !== "tags");

    return (
        <>
            <section className="studio-ws-panel">
                <div className="studio-ws-panel-head">
                    <h2 className="studio-ws-panel-title">① 基础信息</h2>
                    <span className="studio-ws-panel-badge">{category} 模式</span>
                </div>
                <div className="studio-ws-panel-body studio-ws-stack">
                    {titleField ? renderField({ ...titleField, label: category === "世界观" ? "世界观名称" : "标题" }) : null}
                    {taglineField ? renderField(taglineField) : null}
                    {descField ? renderField(descField) : null}
                </div>
            </section>

            <section className="studio-ws-panel">
                <h2 className="studio-ws-panel-title studio-ws-panel-title--solo">② 封面与素材</h2>
                <div className="studio-ws-upload-grid">
                    <div className="studio-ws-drop">
                        <button type="button" className="studio-ws-cover-frame" onClick={() => coverInputRef.current?.click()}>
                            {coverPreview ? <img src={coverPreview} alt="" className="studio-ws-cover-img" /> : <div className="studio-ws-cover-ph" />}
                        </button>
                        <p className="studio-ws-drop-hint">主封面 · 首页卡片主图</p>
                        <input ref={coverInputRef} type="file" accept="image/*" className="studio-ws-sr" onChange={onCoverChange} />
                    </div>
                    <div className="studio-ws-thumbs">
                        {multiVisual ? (
                            <div className="studio-ws-extra-visual-block">
                                <p className="studio-ws-label">
                                    {category === "表情包" ? "组图（首页 2×2 / 3×3 拼贴，可多选）" : "内页预览（首页卡片底部缩略条，可多选）"}
                                </p>
                                <div className="studio-ws-extra-preview-row">
                                    {extraImagePreviews.map((src, i) => (
                                        <div key={`${src}-${i}`} className="studio-ws-extra-thumb">
                                            <img src={src} alt="" />
                                            <button type="button" className="studio-ws-extra-thumb-x" onClick={() => onRemoveExtra(i)} aria-label="移除">
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" className="studio-ws-btn studio-ws-btn--ghost" onClick={() => extraInputRef.current?.click()}>
                                    添加图片
                                </button>
                                <input
                                    ref={extraInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="studio-ws-sr"
                                    onChange={onExtraImages}
                                />
                            </div>
                        ) : (
                            <>
                                <div className="studio-ws-thumb">
                                    <div className="studio-ws-thumb-ph" />
                                    <span className="studio-ws-thumb-cap">更多素材位（后续扩展）</span>
                                </div>
                                <div className="studio-ws-thumb studio-ws-thumb--dashed">
                                    <span className="studio-ws-thumb-add">+</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </section>

            <section className="studio-ws-panel">
                <h2 className="studio-ws-panel-title studio-ws-panel-title--solo">③ 分类专属字段</h2>
                <div className="studio-ws-spec-grid">{specFields.map((f) => renderField(f, true))}</div>
            </section>

            <section className="studio-ws-panel">
                <h2 className="studio-ws-panel-title studio-ws-panel-title--solo">④ 标签与发布设置</h2>
                <div className="studio-ws-field">
                    <label className="studio-ws-label">标签（逗号分隔，与首页检索一致）</label>
                    <input
                        className="studio-ws-input"
                        value={formTagsValue}
                        onChange={(e) => onTagsChange(e.target.value)}
                        placeholder={studioFieldPlaceholder("标签（逗号分隔，与首页检索一致）")}
                    />
                </div>
                <div className="studio-ws-publish-grid">
                    <div className="studio-ws-subpanel">
                        <div className="studio-ws-label">可见范围</div>
                        <div className="studio-ws-vis">
                            <button
                                type="button"
                                className={`studio-ws-vis-btn ${visibility === "public" ? "on" : ""}`}
                                onClick={() => onVisibility("public")}
                            >
                                公开
                            </button>
                            <button
                                type="button"
                                className={`studio-ws-vis-btn ${visibility === "private" ? "on" : ""}`}
                                onClick={() => onVisibility("private")}
                            >
                                仅自己
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
