// 作品/卡片数据类型（前端使用的简化版）
export interface Artwork {
    id: number;
    title: string;
    author: string;
    authorAvatar?: string | null;
    imageUrl: string;
    likes: number;
    views: number;
    /** 评论数（后端 _count.comments） */
    commentCount?: number;
    createdAt: string;
    category?: CategoryOption;
    /** 当前用户是否已点赞（列表接口在登录时返回） */
    isLiked?: boolean;
    /** 当前用户是否已评论 */
    isCommented?: boolean;
    /** 当前用户是否已查看过详情 */
    hasViewed?: boolean;
}

// 筛选选项
export type SortOption = 'latest' | 'popular' | 'trending';
export type DimensionOption = 'all' | '2d' | '3d';
export type CategoryOption = 'my-works' | 'following' | 'recommended' | 'oc' | 'worldview' | 'nienien' | 'emoji' | 'novel' | 'comic';
