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
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">注册</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label">用户名</label>
          <input
            type="text"
            className="login-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入昵称/用户名"
            autoComplete="username"
            disabled={loading}
          />
          <label className="login-label">邮箱</label>
          <input
            type="email"
            className="login-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            autoComplete="email"
            disabled={loading}
          />
          <label className="login-label">密码</label>
          <input
            type="password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            autoComplete="new-password"
            disabled={loading}
          />
          <label className="login-label">确认密码</label>
          <input
            type="password"
            className="login-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="请再次输入密码"
            autoComplete="new-password"
            disabled={loading}
          />
          {error && <p className="login-error">{error}</p>}
          <div className="login-actions">
            <button
              type="button"
              className="login-secondary"
              disabled={loading}
              onClick={() => navigate("/login")}
            >
              返回登录
            </button>
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "注册中…" : "注册"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

