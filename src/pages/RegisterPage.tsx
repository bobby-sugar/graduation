import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = searchParams.get("from") ?? "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !email.trim() || !password) {
      setError("请输入用户名、邮箱和密码");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      navigate(`/profile/edit?from=${encodeURIComponent(from)}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page-bg" aria-hidden />
      <div className="auth-page-inner">
        <div className="auth-brand">
          <div className="auth-brand-mark" aria-hidden>
            <span className="auth-brand-icon" />
          </div>
          <span className="auth-brand-text">YumeCore</span>
          <p className="auth-brand-tagline">创作 · 展示 · 约稿</p>
        </div>

        <div className="auth-card auth-card--wide">
          <div className="auth-card-accent" aria-hidden />
          <header className="auth-card-header">
            <h1 className="auth-title">创建账户</h1>
            <p className="auth-subtitle">加入社区，发布作品并参与约稿</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="reg-username">
                  用户名
                </label>
                <input
                  id="reg-username"
                  type="text"
                  className="auth-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="展示用的昵称"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="reg-email">
                  邮箱
                </label>
                <input
                  id="reg-email"
                  type="email"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="用于登录与找回"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="auth-field-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="reg-password">
                  密码
                </label>
                <input
                  id="reg-password"
                  type="password"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位建议更强"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="reg-confirm">
                  确认密码
                </label>
                <input
                  id="reg-confirm"
                  type="password"
                  className="auth-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
            </div>

            {error ? (
              <div className="auth-error" role="alert">
                {error}
              </div>
            ) : null}

            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? (
                <span className="auth-btn-loading">
                  <span className="auth-spinner" aria-hidden />
                  注册中…
                </span>
              ) : (
                "注册并继续"
              )}
            </button>

            <p className="auth-switch">
              已有账户？
              <button
                type="button"
                className="auth-switch-link"
                disabled={loading}
                onClick={() => navigate(`/login?from=${encodeURIComponent(from)}`)}
              >
                返回登录
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

