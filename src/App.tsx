import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import NavBar from "./components/NavBar";
import NotificationSocketBridge from "./components/NotificationSocketBridge";
import "./App.css";

import HomePage from "./pages/HomePage";
import CommissionsPage from "./pages/CommissionsPage";
import StudioPage from "./pages/StudioPage";
import InboxPage from "./pages/InboxPage";
import MePage from "./pages/MePage";
import MeFollowsPage from "./pages/MeFollowsPage";
import ArtworkDetailPage from "./pages/ArtworkDetailPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfileEditPage from "./pages/ProfileEditPage";
import CommissionDetailPage from "./pages/CommissionDetailPage";
import UserProfilePage from "./pages/UserProfilePage";
import CommissionCreatePage from "./pages/CommissionCreatePage";
import CommissionEditPage from "./pages/CommissionEditPage";
import MyCommissionsPage from "./pages/MyCommissionsPage";

function AppContent() {
    const location = useLocation();
    const isDetailPage = location.pathname.startsWith('/artwork/');

    return (
        <div className="app-container">
            <NotificationSocketBridge />
            {!isDetailPage && <NavBar />}
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/commissions" element={<CommissionsPage />} />
                <Route path="/my-commissions" element={<MyCommissionsPage />} />
                <Route path="/studio" element={<StudioPage />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/me" element={<MePage />} />
                <Route path="/me/follows" element={<MeFollowsPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/profile/edit" element={<ProfileEditPage />} />
                {/* 须写在 /commissions/:id 之前，否则 new、edit 会被当成动态 id */}
                <Route path="/commissions/new" element={<CommissionCreatePage />} />
                <Route path="/commissions/:id/edit" element={<CommissionEditPage />} />
                <Route path="/commissions/:id" element={<CommissionDetailPage />} />
                <Route path="/artwork/:id" element={<ArtworkDetailPage />} />
                <Route path="/user/:id" element={<UserProfilePage />} />

                {/* 兜底：未知路径跳回主页 */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}

export default function App() {
    return <AppContent />;
}
