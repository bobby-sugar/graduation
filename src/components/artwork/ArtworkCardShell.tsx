import type { Artwork } from "../../types";
import type { ArtworkKind } from "../../artwork/apiCategory";
import { resolveArtworkUrl } from "./resolveArtworkUrl";

interface ArtworkCardShellProps {
    artwork: Artwork;
    kind: ArtworkKind;
    apiBaseUrl: string;
    isHovered: boolean;
    onHoverChange: (v: boolean) => void;
    onClick?: () => void;
    children: React.ReactNode;
}

function getHoverKindLabel(kind: ArtworkKind): string {
    switch (kind) {
        case "oc":
            return "OC";
        case "worldview":
            return "\u4e16\u754c\u89c2";
        case "emoji":
            return "\u8868\u60c5\u5305";
        default:
            return "";
    }
}

export function ArtworkCardShell({
    artwork,
    kind,
    apiBaseUrl,
    isHovered,
    onHoverChange,
    onClick,
    children,
}: ArtworkCardShellProps) {
    const resolveUrl = (u: string) => resolveArtworkUrl(u, apiBaseUrl);
    const hoverKindLabel = getHoverKindLabel(kind);

    return (
        <div
            className="artwork-card"
            onClick={onClick}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    onClick?.();
                }
            }}
        >
            <div className="artwork-card-image-container">
                {children}

                <div className={`artwork-card-overlay ${isHovered ? "visible" : ""}`}>
                    <div className="artwork-card-overlay-top">
                        <div className="artwork-card-title-overlay">{artwork.title}</div>
                        {hoverKindLabel ? (
                            <div className={`artwork-card-kind-hover-badge artwork-card-kind-hover-badge--${kind}`}>
                                {hoverKindLabel}
                            </div>
                        ) : null}
                    </div>

                    <div className="artwork-card-overlay-bottom">
                        <div className="artwork-card-author-overlay">
                            {artwork.authorAvatar ? (
                                <img
                                    src={resolveUrl(artwork.authorAvatar)}
                                    alt={artwork.author}
                                    className="artwork-card-avatar-overlay"
                                />
                            ) : null}
                            <span className="artwork-card-author-name-overlay">{artwork.author}</span>
                        </div>

                        <div className="artwork-card-stats-overlay">
                            {artwork.likes !== undefined ? (
                                <div className={`artwork-stat-overlay ${artwork.isLiked ? "artwork-stat-liked" : ""}`}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill={artwork.isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                    </svg>
                                    <span>{artwork.likes}</span>
                                </div>
                            ) : null}
                            {artwork.commentCount !== undefined ? (
                                <div className={`artwork-stat-overlay ${artwork.isCommented ? "artwork-stat-commented" : ""}`}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <span>{artwork.commentCount}</span>
                                </div>
                            ) : null}
                            {artwork.views !== undefined ? (
                                <div className="artwork-stat-overlay">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                    <span>{artwork.views}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
