import { Link, useLocation } from "react-router-dom";

export type AuthPromptPanelProps = {
    title: string;
    description?: string;
    /** 额外 class 挂在外层 */
    className?: string;
    /** 更紧凑（用于首页横幅等） */
    compact?: boolean;
};

/**
 * 整页 / 区域内「需要登录」的统一卡片（非弹窗），与 AuthPromptContext 弹窗视觉一致。
 */
export function AuthPromptPanel({ title, description, className = "", compact = false }: AuthPromptPanelProps) {
    const { pathname, search } = useLocation();
    const from = encodeURIComponent(`${pathname}${search}` || "/");

    return (
        <div className={`auth-prompt-panel ${compact ? "auth-prompt-panel--compact" : ""} ${className}`.trim()}>
            <div className="auth-prompt-panel-inner">
                <div className="auth-prompt-panel-icon" aria-hidden>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                </div>
                <h2 className="auth-prompt-panel-title">{title}</h2>
                {description ? <p className="auth-prompt-panel-desc">{description}</p> : null}
                <div className="auth-prompt-panel-actions">
                    <Link to={`/login?from=${from}`} className="auth-prompt-btn auth-prompt-btn--primary">
                        登录
                    </Link>
                    <Link to={`/register?from=${from}`} className="auth-prompt-btn auth-prompt-btn--secondary">
                        注册
                    </Link>
                </div>
            </div>
        </div>
    );
}
