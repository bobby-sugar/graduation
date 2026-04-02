import { useState } from "react";
import type { Artwork } from "../types";

interface CardProps {
    artwork: Artwork;
    onClick?: () => void;
}

export default function Card({ artwork, onClick }: CardProps) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="artwork-card"
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onClick?.();
                }
            }}
        >
            <div className="artwork-card-image-container">
                <img
                    src={artwork.imageUrl}
                    alt={artwork.title}
                    className="artwork-card-image"
                    loading="lazy"
                    onLoad={() => setImageLoaded(true)}
                    style={{ opacity: imageLoaded ? 1 : 0 }}
                />
                {!imageLoaded && (
                    <div className="artwork-card-image-placeholder" />
                )}
                
                {/* 悬停时显示的信息覆盖层 */}
                <div className={`artwork-card-overlay ${isHovered ? 'visible' : ''}`}>
                    {/* 左上角：标题 */}
                    <div className="artwork-card-title-overlay">{artwork.title}</div>
                    
                    {/* 左下角：作者信息 */}
                    <div className="artwork-card-author-overlay">
                        {artwork.authorAvatar && (
                            <img
                                src={artwork.authorAvatar}
                                alt={artwork.author}
                                className="artwork-card-avatar-overlay"
                            />
                        )}
                        <span className="artwork-card-author-name-overlay">{artwork.author}</span>
                    </div>
                    
                    {/* 右下角：点赞 | 评论 | 浏览（点赞/评论高亮与详情页一致） */}
                    <div className="artwork-card-stats-overlay">
                        {artwork.likes !== undefined && (
                            <div className={`artwork-stat-overlay ${artwork.isLiked ? "artwork-stat-liked" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill={artwork.isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                                <span>{artwork.likes}</span>
                            </div>
                        )}
                        {artwork.commentCount !== undefined && (
                            <div className={`artwork-stat-overlay ${artwork.isCommented ? "artwork-stat-commented" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                                <span>{artwork.commentCount}</span>
                            </div>
                        )}
                        {artwork.views !== undefined && (
                            <div className="artwork-stat-overlay">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <span>{artwork.views}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
