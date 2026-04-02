import { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

interface ArtistOption {
    id: number;
    username: string;
    avatarUrl: string | null;
}

interface DisplayBoxProps {
    formData: any;
    category: string;
    onClose: () => void;
    onSuccess?: (createdId: number) => void;
}

export default function DisplayBox({ formData, category, onClose, onSuccess }: DisplayBoxProps) {
    const { token } = useAuth();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [linkArtist, setLinkArtist] = useState(false);
    const [selectedArtist, setSelectedArtist] = useState<ArtistOption | null>(null);
    const [artistSearchQuery, setArtistSearchQuery] = useState("");
    const [artistSearchResults, setArtistSearchResults] = useState<ArtistOption[]>([]);
    const [artistSearchLoading, setArtistSearchLoading] = useState(false);
    const [artistSearchOpen, setArtistSearchOpen] = useState(false);
    const artistSearchRef = useRef<HTMLDivElement>(null);
    const [useWatermark, setUseWatermark] = useState(false);
    const [allowDownload, setAllowDownload] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const imageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!linkArtist || !artistSearchQuery.trim()) {
            setArtistSearchResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setArtistSearchLoading(true);
            try {
                const res = await fetch(
                    `/api/users/search?q=${encodeURIComponent(artistSearchQuery.trim())}`,
                    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
                );
                if (res.ok) {
                    const data = await res.json();
                    setArtistSearchResults(Array.isArray(data) ? data : []);
                } else {
                    setArtistSearchResults([]);
                }
            } catch {
                setArtistSearchResults([]);
            } finally {
                setArtistSearchLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [linkArtist, artistSearchQuery, token]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (artistSearchRef.current && !artistSearchRef.current.contains(e.target as Node)) {
                setArtistSearchOpen(false);
            }
        };
        document.addEventListener("click", onDocClick);
        return () => document.removeEventListener("click", onDocClick);
    }, []);

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
        if (category !== "OC") {
            onClose();
            return;
        }
        if (!token) {
            setError("请先登录后再创建");
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
            const artistId = linkArtist ? selectedArtist?.id : undefined;
            if (linkArtist && !selectedArtist) {
                setError("请搜索并选择一位画师");
                setSubmitting(false);
                return;
            }
            const createRes = await fetch("/api/artworks", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title: formData.name || "未命名 OC",
                    description: formData.description || null,
                    category: "oc",
                    imageUrl: imageUrl || null,
                    tags: formData.tags ? String(formData.tags).trim() || null : null,
                    gender: formData.gender ? String(formData.gender).trim() || null : null,
                    artistId: artistId ?? null,
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
                    <h2 className="create-display-box-title">创建{category}</h2>
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
                            {/* 上传图片 */}
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

                            {/* 是否链接画师 */}
                            <div className="display-box-section">
                                <label className="display-box-switch-label">
                                    <span>是否链接画师</span>
                                    <label className="display-box-switch">
                                        <input
                                            type="checkbox"
                                            checked={linkArtist}
                                            onChange={(e) => setLinkArtist(e.target.checked)}
                                        />
                                        <span className="display-box-switch-slider"></span>
                                    </label>
                                </label>
                                {linkArtist && (
                                    <div className="display-box-artist-search" ref={artistSearchRef}>
                                        {selectedArtist ? (
                                            <div className="display-box-artist-selected">
                                                {selectedArtist.avatarUrl ? (
                                                    <img src={selectedArtist.avatarUrl} alt="" className="display-box-artist-avatar" />
                                                ) : (
                                                    <div className="display-box-artist-avatar-placeholder">{selectedArtist.username.charAt(0)}</div>
                                                )}
                                                <span className="display-box-artist-name">{selectedArtist.username}</span>
                                                <button
                                                    type="button"
                                                    className="display-box-artist-remove"
                                                    onClick={() => { setSelectedArtist(null); setArtistSearchQuery(""); setArtistSearchOpen(false); }}
                                                    aria-label="取消选择"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <input
                                                    type="text"
                                                    className="display-box-input"
                                                    value={artistSearchQuery}
                                                    onChange={(e) => { setArtistSearchQuery(e.target.value); setArtistSearchOpen(true); }}
                                                    onFocus={() => setArtistSearchOpen(true)}
                                                    placeholder="搜索画师（按用户名）"
                                                />
                                                {artistSearchOpen && (
                                                    <div className="display-box-artist-dropdown">
                                                        {artistSearchLoading ? (
                                                            <div className="display-box-artist-dropdown-loading">搜索中…</div>
                                                        ) : artistSearchQuery.trim() === "" ? (
                                                            <div className="display-box-artist-dropdown-hint">输入用户名搜索画师</div>
                                                        ) : artistSearchResults.length === 0 ? (
                                                            <div className="display-box-artist-dropdown-empty">未找到用户</div>
                                                        ) : (
                                                            artistSearchResults.map((u) => (
                                                                <button
                                                                    key={u.id}
                                                                    type="button"
                                                                    className="display-box-artist-option"
                                                                    onClick={() => {
                                                                        setSelectedArtist(u);
                                                                        setArtistSearchQuery("");
                                                                        setArtistSearchOpen(false);
                                                                    }}
                                                                >
                                                                    {u.avatarUrl ? (
                                                                        <img src={u.avatarUrl} alt="" className="display-box-artist-option-avatar" />
                                                                    ) : (
                                                                        <div className="display-box-artist-option-avatar-placeholder">{u.username.charAt(0)}</div>
                                                                    )}
                                                                    <span>{u.username}</span>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* 非 OC 时保留原头像 + 主页背景占位，仅作展示可后续扩展 */}
                            <div className="display-box-section">
                                <label className="display-box-label">上传图片</label>
                                <div className="display-box-avatar-upload">
                                    <div className="display-box-avatar-preview">
                                        <div className="display-box-avatar-placeholder">
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                <polyline points="21 15 16 10 5 21"></polyline>
                                            </svg>
                                        </div>
                                    </div>
                                    <button type="button" className="display-box-upload-btn" disabled>
                                        上传图片
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* 使用水印 */}
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

                    {/* 允许下载 */}
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

                    {isOC && (
                        <div className="display-box-actions">
                            <button
                                type="button"
                                className="display-box-submit-btn"
                                onClick={handleCreate}
                                disabled={submitting}
                            >
                                {submitting ? "创建中…" : "完成创建"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
