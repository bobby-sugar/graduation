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

  const from = searchParams.get("from") ?? "/";

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
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">登录</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label">邮箱或用户名</label>
          <input
            type="text"
            className="login-input"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="请输入邮箱或用户名"
            autoComplete="username"
            disabled={loading}
          />
          <label className="login-label">密码</label>
          <input
            type="password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            autoComplete="current-password"
            disabled={loading}
          />
          {error && <p className="login-error">{error}</p>}
          <div className="login-actions">
            <button
              type="button"
              className="login-secondary"
              disabled={loading}
              onClick={() => navigate(`/register?from=${encodeURIComponent(from)}`)}
            >
              注册
            </button>
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "登录中…" : "登录"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

