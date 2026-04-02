import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import StudioFilterSidebar from "../components/StudioFilterSidebar";
import CreateForm from "../components/CreateForm";
import DisplayBox from "../components/DisplayBox";
import { useAuth } from "../contexts/AuthContext";

export default function StudioPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showDisplayBox, setShowDisplayBox] = useState(false);
    const [formData, setFormData] = useState<any>(null);

    const handleCategorySelect = (category: string) => {
        if (!user) return;
        // 如果点击的是同一个选项且表单已显示，先关闭再打开以触发动画
        if (selectedCategory === category && showForm) {
            setShowForm(false);
            setTimeout(() => {
                setShowForm(true);
            }, 100);
        } else {
            setSelectedCategory(category);
            setShowForm(true);
        }
        // 关闭显示框
        setShowDisplayBox(false);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setShowDisplayBox(false);
    };

    const handleFormSubmit = (data: any) => {
        console.log('提交数据:', data);
        // 这里可以处理表单提交逻辑
    };

    const handleFormNext = (data: any) => {
        setFormData(data);
        setShowDisplayBox(true);
        // 表单不隐藏，保持显示
    };

    return (
        <div className="studio-page">
            <div className="studio-page-layout">
                {/* 左侧筛选栏 */}
                <StudioFilterSidebar
                    selectedCategory={selectedCategory}
                    onCategorySelect={handleCategorySelect}
                />
                
                {/* 右侧内容区域 */}
                <div className="studio-page-main">
                    <div className="studio-page-content-wrapper">
                        {!user ? (
                            <div className="studio-page-login-prompt">
                                <p className="studio-page-login-text">请先登录后使用工作站</p>
                                <Link to="/login?from=/studio" className="studio-page-login-btn">去登录</Link>
                            </div>
                        ) : (
                            <>
                                {selectedCategory && showForm && (
                                    <CreateForm
                                        key={selectedCategory}
                                        category={selectedCategory}
                                        isVisible={showForm}
                                        onClose={handleFormClose}
                                        onSubmit={handleFormSubmit}
                                        onNext={handleFormNext}
                                    />
                                )}
                                {selectedCategory && showDisplayBox && formData && (
                                    <DisplayBox
                                        key={`display-${selectedCategory}`}
                                        formData={formData}
                                        category={selectedCategory}
                                        onClose={() => setShowDisplayBox(false)}
                                        onSuccess={(createdId) => navigate(`/artwork/${createdId}`)}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
