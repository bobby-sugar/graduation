import { useLocation, useNavigate } from "react-router-dom";
import StudioWorkstation from "../studio/StudioWorkstation";
import { useAuth } from "../contexts/AuthContext";
import { buildArtworkCloseState } from "../artwork/artworkDetailNavigation";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";

export default function StudioPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    return (
        <div className="studio-page-root">
            {!user ? (
                <div className="oc-auth-gate-page">
                    <div className="oc-auth-gate-page__inner">
                        <AuthPromptPanel
                            title="登录后使用工作站"
                            description="登录后可在此创建 OC、世界观、表情包等作品，并一键发布到首页。"
                        />
                    </div>
                </div>
            ) : (
                <StudioWorkstation
                    onPublished={(id) =>
                        navigate(`/artwork/${id}`, {
                            state: buildArtworkCloseState(`${location.pathname}${location.search}`),
                        })
                    }
                />
            )}
        </div>
    );
}
