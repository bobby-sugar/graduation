import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export type AuthPromptOptions = {
    title: string;
    description?: string;
    /** 登录/注册成功后跳转，默认当前页 */
    returnTo?: string;
};

type AuthPromptContextValue = {
    openAuthPrompt: (opts: AuthPromptOptions) => void;
    closeAuthPrompt: () => void;
};

const AuthPromptContext = createContext<AuthPromptContextValue | null>(null);

export function AuthPromptProvider({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [payload, setPayload] = useState<AuthPromptOptions | null>(null);

    const closeAuthPrompt = useCallback(() => {
        setOpen(false);
        setPayload(null);
    }, []);

    const openAuthPrompt = useCallback(
        (opts: AuthPromptOptions) => {
            const returnTo = opts.returnTo ?? `${location.pathname}${location.search}`;
            setPayload({ ...opts, returnTo });
            setOpen(true);
        },
        [location.pathname, location.search],
    );

    const fromParam = useMemo(
        () => (payload?.returnTo ? encodeURIComponent(payload.returnTo) : encodeURIComponent("/")),
        [payload?.returnTo],
    );

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeAuthPrompt();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, closeAuthPrompt]);

    const value = useMemo(() => ({ openAuthPrompt, closeAuthPrompt }), [openAuthPrompt, closeAuthPrompt]);

    return (
        <AuthPromptContext.Provider value={value}>
            {children}
            {open && payload ? (
                <div className="auth-prompt-backdrop" onClick={closeAuthPrompt} role="presentation">
                    <div
                        className="auth-prompt-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="auth-prompt-modal-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button type="button" className="auth-prompt-modal-close" onClick={closeAuthPrompt} aria-label="关闭">
                            ×
                        </button>
                        <div className="auth-prompt-modal-icon" aria-hidden>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <h2 id="auth-prompt-modal-title" className="auth-prompt-modal-title">
                            {payload.title}
                        </h2>
                        {payload.description ? <p className="auth-prompt-modal-desc">{payload.description}</p> : null}
                        <div className="auth-prompt-modal-actions">
                            <Link to={`/login?from=${fromParam}`} className="auth-prompt-btn auth-prompt-btn--primary" onClick={closeAuthPrompt}>
                                登录
                            </Link>
                            <Link to={`/register?from=${fromParam}`} className="auth-prompt-btn auth-prompt-btn--secondary" onClick={closeAuthPrompt}>
                                注册
                            </Link>
                        </div>
                        <p className="auth-prompt-modal-foot">登录后将回到当前页面，继续你的操作。</p>
                    </div>
                </div>
            ) : null}
        </AuthPromptContext.Provider>
    );
}

export function useAuthPrompt(): AuthPromptContextValue {
    const ctx = useContext(AuthPromptContext);
    if (!ctx) {
        throw new Error("useAuthPrompt 必须在 AuthPromptProvider 内使用");
    }
    return ctx;
}
