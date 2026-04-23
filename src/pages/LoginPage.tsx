import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fromParam = searchParams.get("from") ?? "/";
  const from =
    fromParam.startsWith("/") && !fromParam.startsWith("//") ? fromParam : "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!loginId.trim() || !password) {
      setError("请输入邮箱/用户名和密码");
      return;
    }
    setLoading(true);
    try {
      await login(loginId.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
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

        <div className="auth-card">
          <div className="auth-card-accent" aria-hidden />
          <header className="auth-card-header">
            <h1 className="auth-title">欢迎回来</h1>
            <p className="auth-subtitle">使用邮箱或用户名登录你的账户</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-id">
                邮箱或用户名
              </label>
              <input
                id="login-id"
                type="text"
                className="auth-input"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="name@email.com 或 昵称"
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-password">
                密码
              </label>
              <input
                id="login-password"
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                autoComplete="current-password"
                disabled={loading}
              />
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
                  登录中…
                </span>
              ) : (
                "登录"
              )}
            </button>

            <p className="auth-switch">
              还没有账户？
              <button
                type="button"
                className="auth-switch-link"
                disabled={loading}
                onClick={() => navigate(`/register?from=${encodeURIComponent(from)}`)}
              >
                立即注册
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

