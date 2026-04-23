import { useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useAuthPrompt } from "../contexts/AuthPromptContext";
import {
    buildStudioDescription,
    getStudioArtworkTags,
    getStudioArtworkTitle,
    studioCategoryToApi,
} from "../utils/studioArtwork";

interface DisplayBoxProps {
    formData: any;
    category: string;
    onClose: () => void;
    onSuccess?: (createdId: number) => void;
}

export default function DisplayBox({ formData, category, onClose, onSuccess }: DisplayBoxProps) {
    const { token } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [ocPrivacy, setOcPrivacy] = useState<"public" | "private">("public");
    const [useWatermark, setUseWatermark] = useState(false);
    const [allowDownload, setAllowDownload] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const imageInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleCreate = async () => {
        if (!token) {
            openAuthPrompt({
                title: "登录后发布作品",
                description: "登录后即可将作品发布到社区，并同步到个人主页。",
            });
            return;
        }
        setError("");
        setSubmitting(true);
        try {
            let imageUrl: string | undefined;
            if (imageFile) {
                const formDataUpload = new FormData();
                formDataUpload.append("file", imageFile);
                const uploadRes = await fetch("/api/upload", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formDataUpload,
                });
                if (!uploadRes.ok) {
                    const err = await uploadRes.json().catch(() => ({}));
                    throw new Error(err.message ?? "图片上传失败");
                }
                const uploadData = await uploadRes.json();
                imageUrl = uploadData.url;
            }
            const isOC = category === "OC";
            const title = getStudioArtworkTitle(category, formData as Record<string, unknown>);
            const description = buildStudioDescription(category, formData as Record<string, unknown>);
            const tags = getStudioArtworkTags(formData as Record<string, unknown>);
            const apiCategory = studioCategoryToApi(category);
            const gender =
                isOC && formData.gender ? String(formData.gender).trim() || null : null;

            const createRes = await fetch("/api/artworks", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title,
                    description: description ?? null,
                    category: apiCategory,
                    imageUrl: imageUrl ?? null,
                    tags,
                    gender,
                    ...(isOC ? { ocPrivacy } : {}),
                }),
            });
            if (!createRes.ok) {
                const err = await createRes.json().catch(() => ({}));
                throw new Error(err.message ?? "创建失败");
            }
            const created = await createRes.json();
            onSuccess?.(created.id);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "创建失败");
        } finally {
            setSubmitting(false);
        }
    };

    const isOC = category === "OC";

    return (
        <div className="create-display-box-wrapper">
            <div className="create-display-box-bubble">
                <div className="create-display-box-header">
                    <div className="create-display-box-header-text">
                        <p className="create-display-box-eyebrow">发布前确认</p>
                        <h2 className="create-display-box-title">创建{category}</h2>
                        <p className="create-display-box-lead">上传封面图（可选），确认后即可在首页对应分类中展示。</p>
                    </div>
                    <button className="create-display-box-close" onClick={onClose} type="button">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div className="create-display-box-content">
                    {isOC ? (
                        <>
                            <div className="display-box-section">
                                <label className="display-box-label">上传图片</label>
                                <div className="display-box-avatar-upload">
                                    <div className="display-box-avatar-preview">
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="作品图" className="display-box-avatar-image" />
                                        ) : (
                                            <div className="display-box-avatar-placeholder">
                                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                    <polyline points="21 15 16 10 5 21"></polyline>
                                                </svg>
                                            </div>
                                        )}
                                        {imagePreview && (
                                            <button
                                                type="button"
                                                className="display-box-avatar-remove"
                                                onClick={() => {
                                                    setImageFile(null);
                                                    setImagePreview(null);
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="display-box-upload-btn"
                                        onClick={() => imageInputRef.current?.click()}
                                    >
                                        {imagePreview ? "更换图片" : "上传图片"}
                                    </button>
                                    <input
                                        ref={imageInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        style={{ display: "none" }}
                                    />
                                </div>
                            </div>

                            <div className="display-box-section">
                                <label className="display-box-label">隐私设置</label>
                                <p className="create-form-module-hint" style={{ marginTop: 0 }}>
                                    公共 OC 可被世界观关联流程选用；私有 OC 不会出现在关联候选中。
                                </p>
                                <div className="studio-ws-vis" style={{ marginTop: "0.5rem" }}>
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
                        </>
                    ) : (
                        <div className="display-box-section">
                            <label className="display-box-label">封面图</label>
                            <div className="display-box-avatar-upload">
                                <div className="display-box-avatar-preview">
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="封面预览" className="display-box-avatar-image" />
                                    ) : (
                                        <div className="display-box-avatar-placeholder">
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                <circle cx="8.5" cy="8.5" r="1.5" />
                                                <polyline points="21 15 16 10 5 21" />
                                            </svg>
                                        </div>
                                    )}
                                    {imagePreview ? (
                                        <button
                                            type="button"
                                            className="display-box-avatar-remove"
                                            onClick={() => {
                                                setImageFile(null);
                                                setImagePreview(null);
                                            }}
                                            aria-label="移除图片"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                    ) : null}
                                </div>
                                <button type="button" className="display-box-upload-btn" onClick={() => imageInputRef.current?.click()}>
                                    {imagePreview ? "更换封面" : "上传封面（可选）"}
                                </button>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    style={{ display: "none" }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="display-box-section">
                        <label className="display-box-switch-label">
                            <span>使用水印</span>
                            <label className="display-box-switch">
                                <input
                                    type="checkbox"
                                    checked={useWatermark}
                                    onChange={(e) => setUseWatermark(e.target.checked)}
                                />
                                <span className="display-box-switch-slider"></span>
                            </label>
                        </label>
                    </div>

                    <div className="display-box-section">
                        <label className="display-box-switch-label">
                            <span>允许下载</span>
                            <label className="display-box-switch">
                                <input
                                    type="checkbox"
                                    checked={allowDownload}
                                    onChange={(e) => setAllowDownload(e.target.checked)}
                                />
                                <span className="display-box-switch-slider"></span>
                            </label>
                        </label>
                    </div>

                    {error && <p className="display-box-error">{error}</p>}

                    <div className="display-box-actions">
                        <button type="button" className="display-box-submit-btn" onClick={() => void handleCreate()} disabled={submitting}>
                            {submitting ? "创建中…" : "完成创建"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
