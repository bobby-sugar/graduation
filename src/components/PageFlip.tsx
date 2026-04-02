import { useState, type ReactNode } from "react";

interface PageFlipProps {
    page1: ReactNode;
    page2: ReactNode;
    label1: string;
    label2: string;
    isFlipped?: boolean;
    onToggle?: () => void;
    showButton?: boolean;
}

export default function PageFlip({
    page1,
    page2,
    label1,
    label2,
    isFlipped: controlledFlipped,
    onToggle,
    showButton = true,
}: PageFlipProps) {
    const [internalFlipped, setInternalFlipped] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const isFlipped = controlledFlipped ?? internalFlipped;

    const handleFlip = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        if (onToggle) {
            onToggle();
        } else {
            setInternalFlipped((prev) => !prev);
        }

        // 轻量切换动画完成后解锁
        setTimeout(() => {
            setIsAnimating(false);
        }, 420);
    };

    return (
        <div className="page-flip-container">
            {showButton && (
                <button
                    className={`page-flip-icon-button ${isAnimating ? 'switching' : ''}`}
                    onClick={handleFlip}
                    disabled={isAnimating}
                    title={isFlipped ? label1 : label2}
                    aria-label={isFlipped ? `切换到${label1}` : `切换到${label2}`}
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="4" y1="8" x2="20" y2="8" />
                        <polyline points="16 4 20 8 16 12" />
                        <line x1="20" y1="16" x2="4" y2="16" />
                        <polyline points="8 12 4 16 8 20" />
                    </svg>
                </button>
            )}

            {/* 内容区域 - 简洁淡入淡出切换 */}
            <div className="page-flip-content-wrapper">
                <div className={`page-flip-content ${isFlipped ? 'flipped' : ''}`}>
                    <div className={`page-flip-content-item page-item-1 ${!isFlipped ? 'active' : ''}`}>
                        {page1}
                    </div>
                    <div className={`page-flip-content-item page-item-2 ${isFlipped ? 'active' : ''}`}>
                        {page2}
                    </div>
                </div>
            </div>
        </div>
    );
}
