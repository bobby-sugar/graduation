import { useState, useRef, useEffect } from "react";
import Card from "./Card";
import type { Artwork } from "../types";

interface TinderCardStackProps {
    artworks: Artwork[];
    onCardClick?: (artwork: Artwork) => void;
}

export default function TinderCardStack({ artworks, onCardClick }: TinderCardStackProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const cardRef = useRef<HTMLDivElement>(null);

    const visibleCards = artworks.slice(currentIndex, currentIndex + 5);
    const SWIPE_THRESHOLD = 100;

    const handleStart = (clientX: number, clientY: number) => {
        setIsDragging(true);
        startPosRef.current = { x: clientX, y: clientY };
        dragOffsetRef.current = { x: 0, y: 0 };
        setDragOffset({ x: 0, y: 0 });
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - startPosRef.current.x;
            const deltaY = e.clientY - startPosRef.current.y;
            dragOffsetRef.current = { x: deltaX, y: deltaY };
            setDragOffset({ x: deltaX, y: deltaY });
        };

        const handleMouseUp = () => {
            const finalOffset = dragOffsetRef.current;
            if (Math.abs(finalOffset.x) > SWIPE_THRESHOLD) {
                if (finalOffset.x > 0 && currentIndex > 0) {
                    setCurrentIndex(currentIndex - 1);
                } else if (finalOffset.x < 0 && currentIndex < artworks.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                }
            }
            setIsDragging(false);
            dragOffsetRef.current = { x: 0, y: 0 };
            setDragOffset({ x: 0, y: 0 });
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches[0]) {
                const deltaX = e.touches[0].clientX - startPosRef.current.x;
                const deltaY = e.touches[0].clientY - startPosRef.current.y;
                dragOffsetRef.current = { x: deltaX, y: deltaY };
                setDragOffset({ x: deltaX, y: deltaY });
            }
        };

        const handleTouchEnd = () => {
            const finalOffset = dragOffsetRef.current;
            if (Math.abs(finalOffset.x) > SWIPE_THRESHOLD) {
                if (finalOffset.x > 0 && currentIndex > 0) {
                    setCurrentIndex(currentIndex - 1);
                } else if (finalOffset.x < 0 && currentIndex < artworks.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                }
            }
            setIsDragging(false);
            dragOffsetRef.current = { x: 0, y: 0 };
            setDragOffset({ x: 0, y: 0 });
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("touchmove", handleTouchMove);
        document.addEventListener("touchend", handleTouchEnd);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("touchmove", handleTouchMove);
            document.removeEventListener("touchend", handleTouchEnd);
        };
    }, [isDragging, currentIndex, artworks.length]);

    return (
        <div className="tinder-card-stack-container">
            <div className="tinder-card-stack">
                {visibleCards.map((artwork, index) => {
                    const isTop = index === 0;
                    const rotation = isTop && isDragging 
                        ? dragOffset.x * 0.1 
                        : 0;
                    const scale = 1 - index * 0.05;
                    const yOffset = index * 8;
                    const zIndex = visibleCards.length - index;
                    
                    return (
                        <div
                            key={artwork.id}
                            ref={isTop ? cardRef : null}
                            className={`tinder-card ${isTop ? 'top-card' : ''}`}
                            style={{
                                transform: isTop
                                    ? `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotation}deg) scale(${scale})`
                                    : `translateY(${yOffset}px) scale(${scale})`,
                                zIndex,
                                opacity: isTop ? 1 : 0.9 - index * 0.1,
                            }}
                            onMouseDown={(e) => isTop && handleStart(e.clientX, e.clientY)}
                            onTouchStart={(e) => isTop && e.touches[0] && handleStart(e.touches[0].clientX, e.touches[0].clientY)}
                        >
                            <Card
                                artwork={artwork}
                                onClick={() => onCardClick?.(artwork)}
                            />
                        </div>
                    );
                })}
            </div>
            
            {/* 导航按钮 */}
            <div className="tinder-card-nav">
                <button
                    className="tinder-card-nav-btn"
                    onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                    disabled={currentIndex === 0}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <span className="tinder-card-counter">
                    {currentIndex + 1} / {artworks.length}
                </span>
                <button
                    className="tinder-card-nav-btn"
                    onClick={() => setCurrentIndex(Math.min(artworks.length - 1, currentIndex + 1))}
                    disabled={currentIndex >= artworks.length - 1}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
        </div>
    );
}
