import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { resolveApiUrl, toStorageUrl } from "../config/api";

const DEFAULT_BACKGROUND = "/me-default-background.png";

export default function ProfileEditPage() {
  const { user, token, isReady, updateUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPositionX, setAvatarPositionX] = useState(50);
  const [avatarPositionY, setAvatarPositionY] = useState(50);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundPositionX, setBackgroundPositionX] = useState(50);
  const [backgroundPositionY, setBackgroundPositionY] = useState(50);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fromParam = searchParams.get("from") ?? "/me";
  const from =
    fromParam.startsWith("/") && !fromParam.startsWith("//") ? fromParam : "/me";

  useEffect(() => {
    if (user) {
      setUsername(user.username ?? "");
      setAvatarUrl(resolveApiUrl(user.avatarUrl));
      setAvatarPositionX(user.avatarPositionX ?? 50);
      setAvatarPositionY(user.avatarPositionY ?? 50);
      setBackgroundUrl(resolveApiUrl(user.profileBackgroundUrl));
      setBackgroundPositionX(user.backgroundPositionX ?? 50);
      setBackgroundPositionY(user.backgroundPositionY ?? 50);
      setBio(user.bio ?? "");
      setLocation(user.location ?? "");
    }
  }, [user]);

  if (!isReady) return null;
  if (!user) {
    return (
      <div className="oc-auth-gate-page">
        <div className="oc-auth-gate-page__inner">
          <AuthPromptPanel title="登录后编辑资料" description="登录后可修改头像、背景、签名与地区等展示信息。" />
        </div>
      </div>
    );
  }

  const uploadImage = async (file: File) => {
    if (!token) throw new Error("请先登录后上传图片");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error("图片上传失败");
    const data = await res.json();
    return resolveApiUrl(data?.url ?? "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          username: username.trim(),
          avatarUrl: toStorageUrl(avatarUrl.trim()),
          avatarPositionX,
          avatarPositionY,
          profileBackgroundUrl: backgroundUrl.trim()
            ? toStorageUrl(backgroundUrl.trim())
            : null,
          backgroundPositionX,
          backgroundPositionY,
          bio: bio.trim(),
          location: location.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = Array.isArray(err?.message) ? err.message.join("，") : err?.message;
        throw new Error(typeof msg === "string" && msg.trim() ? msg : "保存失败");
      }
      const updated = await res.json();
      updateUser({
        id: updated.id,
        username: updated.username,
        email: updated.email ?? user.email,
        avatarUrl: updated.avatarUrl ?? null,
        avatarPositionX: updated.avatarPositionX ?? 50,
        avatarPositionY: updated.avatarPositionY ?? 50,
        profileBackgroundUrl: updated.profileBackgroundUrl ?? null,
        backgroundPositionX: updated.backgroundPositionX ?? 50,
        backgroundPositionY: updated.backgroundPositionY ?? 50,
        bio: updated.bio ?? null,
        location: updated.location ?? null,
      });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-edit-page">
      <div className="profile-edit-card">
        <div className="profile-edit-header">
          <button
            type="button"
            className="profile-edit-back-btn"
            disabled={loading}
            onClick={() => navigate(from, { replace: true })}
          >
            返回
          </button>
          <h1 className="profile-edit-title">编辑个人资料</h1>
        </div>

        <form className="profile-edit-form" onSubmit={handleSubmit}>
          <div className="profile-edit-section">
            <label className="profile-edit-label">头像</label>
            <div className="profile-edit-upload-row">
              <button
                type="button"
                className="profile-edit-upload-btn"
                disabled={loading}
                onClick={() => document.getElementById("avatar-upload-input")?.click()}
              >
                上传头像
              </button>
              <input
                id="avatar-upload-input"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLoading(true);
                  try {
                    const url = await uploadImage(file);
                    setAvatarUrl(url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "上传失败");
                  } finally {
                    setLoading(false);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>

          {avatarUrl && (
            <div className="profile-edit-avatar-preview">
              <img src={avatarUrl} alt="头像预览" className="profile-edit-avatar-image" />
            </div>
          )}

          <div className="profile-edit-section">
            <label className="profile-edit-label">我的页面背景图</label>
            <div className="profile-edit-upload-row">
              <button
                type="button"
                className="profile-edit-upload-btn"
                disabled={loading}
                onClick={() => document.getElementById("background-upload-input")?.click()}
              >
                上传背景
              </button>
              <input
                id="background-upload-input"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLoading(true);
                  try {
                    const url = await uploadImage(file);
                    setBackgroundUrl(url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "上传失败");
                  } finally {
                    setLoading(false);
                    e.target.value = "";
                  }
                }}
              />
              <button
                type="button"
                className="profile-edit-upload-btn profile-edit-reset-btn"
                disabled={loading}
                onClick={() => {
                  setBackgroundUrl("");
                  setBackgroundPositionX(50);
                  setBackgroundPositionY(50);
                }}
              >
                恢复默认
              </button>
            </div>
          </div>

          <div className="profile-edit-banner-preview">
            <img
              src={backgroundUrl || DEFAULT_BACKGROUND}
              alt="背景预览"
              className="profile-edit-banner-image"
            />
          </div>

          <div className="profile-edit-section">
            <label className="profile-edit-label">名字</label>
            <input
              type="text"
              className="profile-edit-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入名字 / 昵称"
              disabled={loading}
            />
          </div>

          <div className="profile-edit-section">
            <label className="profile-edit-label">个人描述</label>
            <textarea
              className="profile-edit-textarea"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="用一句话介绍你自己"
              disabled={loading}
              rows={4}
            />
          </div>

          <div className="profile-edit-section">
            <label className="profile-edit-label">地区</label>
            <input
              type="text"
              className="profile-edit-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例如：四川 成都"
              disabled={loading}
            />
          </div>

          {error && <p className="profile-edit-error">{error}</p>}

          <div className="profile-edit-actions">
            <button
              type="button"
              className="profile-edit-secondary"
              disabled={loading}
              onClick={() => navigate(from, { replace: true })}
            >
              取消
            </button>
            <button type="submit" className="profile-edit-submit" disabled={loading}>
              {loading ? "保存中…" : "保存修改"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

