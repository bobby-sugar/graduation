import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getStudioFormFields, partitionStudioFields, studioFieldPlaceholder, type FormFieldDef } from "../studio/studioFormFields";
import { OcTagsPanel } from "../studio/OcTagsPanel";
import { normalizeOcTagsField } from "../studio/ocStudioTags";

export interface CreateFormProps {
    category: string;
    isVisible: boolean;
    onClose: () => void;
    onSubmit: (data: Record<string, unknown>) => void;
    onNext?: (data: Record<string, unknown>) => void;
}

// 使用一个计数器来确保每次显示时都重新触发动画
let animationKey = 0;

const getFormFields = getStudioFormFields;

export default function CreateForm({ category, isVisible, onClose, onSubmit, onNext }: CreateFormProps) {
    const { user } = useAuth();
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [animKey, setAnimKey] = useState(0);

    const fields = getFormFields(category);
    const partitioned = useMemo(() => partitionStudioFields(category, fields), [category, fields]);
    const section3Fields = useMemo(
        () => partitioned.section3Fields.filter((f) => f.name !== "tags"),
        [partitioned.section3Fields],
    );
    const { titleField } = partitioned;

    useEffect(() => {
        if (isVisible) {
            setFormData(category === "OC" ? { tags: "oc" } : {});
            animationKey += 1;
            setAnimKey(animationKey);
        }
    }, [isVisible, category]);

    const handleChange = useCallback((name: string, value: unknown) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const submitData: Record<string, unknown> = {
            ...formData,
            ocWorldviewLinks: [],
        };
        if (category === "OC") {
            submitData.tags = normalizeOcTagsField(submitData.tags);
        }

        if (onNext) {
            onNext(submitData);
        } else {
            onSubmit(submitData);
            onClose();
        }
    };

    const renderField = (field: FormFieldDef) => (
        <div key={field.name} className="create-form-field">
            <label className="create-form-label">
                {field.label}
                {field.required ? <span className="create-form-required">*</span> : null}
            </label>
            {field.type === "textarea" ? (
                <textarea
                    className="create-form-input"
                    value={String(formData[field.name] ?? "")}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    rows={field.rows ?? 4}
                    required={field.required}
                    placeholder={studioFieldPlaceholder(field)}
                />
            ) : field.type === "select" ? (
                <select
                    className="create-form-input"
                    value={String(formData[field.name] ?? "")}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    required={field.required}
                >
                    <option value="">请选择（可选）</option>
                    {field.options?.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    className="create-form-input"
                    type={field.type === "number" ? "number" : "text"}
                    value={String(formData[field.name] ?? "")}
                    onChange={(e) => handleChange(field.name, field.type === "number" ? e.target.value : e.target.value)}
                    required={field.required}
                    placeholder={studioFieldPlaceholder(field)}
                />
            )}
        </div>
    );

    if (!isVisible) return null;

    const isOC = category === "OC";
    const ocMetaFields = section3Fields.filter((f) => f.type !== "textarea");
    const ocRoleIntroField = section3Fields.find((f) => f.name === "tagline");

    return (
        <div className={`create-form-wrapper${isOC ? " create-form-wrapper--oc" : ""}`} key={animKey}>
            <div className={`create-form-bubble${isOC ? " create-form-bubble--oc" : ""}`}>
                <div className="create-form-header">
                    <div className="create-form-header-text">
                        <p className="create-form-eyebrow">工作站</p>
                        <h2 className="create-form-title">创建{category}</h2>
                        <p className="create-form-lead">
                            {isOC
                                ? "布局与 OC 详情页一致：左侧对应主图位，右侧为档案卡片；封面在下一步上传。"
                                : "按类型填写档案信息，发布前可在下一步上传封面图。"}
                        </p>
                    </div>
                    <button type="button" className="create-form-close" onClick={onClose} aria-label="关闭">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <form className="create-form-content" onSubmit={handleSubmit}>
                    {isOC ? (
                        <div className="studio-ws-oc-detail create-form-oc-detail">
                            <div className="studio-ws-oc-detail-left" aria-label="主图位">
                                <div className="studio-ws-oc-image-panel create-form-oc-cover-hint">
                                    <div className="create-form-oc-cover-placeholder" aria-hidden />
                                    <p className="studio-ws-oc-image-caption">主封面在下一步「封面与发布」上传，此处对应详情页左侧大图区域。</p>
                                </div>
                            </div>
                            <div className="studio-ws-oc-detail-right">
                                <div className="studio-ws-oc-info-scroll">
                                    <div className="artwork-detail-card create-form-oc-main-card">
                                        <div className="artwork-detail-author-section">
                                            <div className="artwork-detail-author-header">
                                                {user?.avatarUrl ? (
                                                    <img src={user.avatarUrl} alt="" className="artwork-detail-author-avatar" />
                                                ) : (
                                                    <div
                                                        className="artwork-detail-author-avatar studio-ws-oc-author-avatar-fallback"
                                                        aria-hidden
                                                    >
                                                        {(user?.username ?? "?").slice(0, 1)}
                                                    </div>
                                                )}
                                                <div className="artwork-detail-author-info">
                                                    <div className="artwork-detail-author-name-row">
                                                        <span className="artwork-detail-author-name">{user?.username ?? "创作者"}</span>
                                                    </div>
                                                    <div className="artwork-detail-author-bio">
                                                        {user?.bio?.trim() || "在个人资料中可补充签名"}
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="studio-ws-oc-phantom-hint">点赞与收藏在发布后的详情页使用</p>
                                        </div>
                                        <div className="artwork-detail-work-section">
                                            {titleField ? (
                                                <div className="create-form-field studio-ws-oc-title-field">
                                                    <label className="create-form-label" htmlFor="cf-oc-name">
                                                        {titleField.label}
                                                        {titleField.required ? <span className="create-form-required">*</span> : null}
                                                    </label>
                                                    <input
                                                        id="cf-oc-name"
                                                        className="create-form-input create-form-oc-title-input"
                                                        type="text"
                                                        value={String(formData[titleField.name] ?? "")}
                                                        onChange={(e) => handleChange(titleField.name, e.target.value)}
                                                        required={titleField.required}
                                                        placeholder={studioFieldPlaceholder(titleField)}
                                                    />
                                                </div>
                                            ) : null}
                                            {ocMetaFields.length > 0 ? (
                                                <div className="studio-ws-oc-meta-grid">{ocMetaFields.map((field) => renderField(field))}</div>
                                            ) : null}
                                            {ocRoleIntroField ? renderField(ocRoleIntroField) : null}
                                        </div>
                                    </div>

                                    <div className="artwork-detail-card">
                                        <h3 className="artwork-detail-section-title">所属世界观</h3>
                                        <p className="create-form-module-hint">
                                            请从顶部菜单进入「工作站」创建 OC：在表单内通过「选择所属世界观」绑定一个世界观（我的或全站搜索）。
                                        </p>
                                    </div>

                                    <div className="artwork-detail-card">
                                        <h3 className="artwork-detail-section-title">标签</h3>
                                        <OcTagsPanel
                                            value={String(formData.tags ?? "")}
                                            onChange={(v) => handleChange("tags", v)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="create-form-studio-card">
                            <h3 className="create-form-studio-card-title">填写档案</h3>
                            <p className="create-form-studio-card-desc">标 * 为必填；其余可按需填写，将一并写入作品详情。</p>
                            {fields.map((field) => renderField(field))}
                        </div>
                    )}

                    <div className="create-form-actions">
                        <button type="button" className="create-form-cancel" onClick={onClose}>
                            取消
                        </button>
                        <button type="submit" className="create-form-submit">
                            {onNext ? "下一步：封面与发布" : "创建"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
