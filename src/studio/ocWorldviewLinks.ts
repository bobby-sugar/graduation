/** 工作站为 OC 关联的世界观（写入表单与卡片 JSON） */
export type OcWorldviewLink = {
    /** 列表 key，稳定即可 */
    id: string;
    artworkId: number;
    title: string;
    authorUsername: string;
    authorId?: number;
    imageUrl?: string | null;
};

export const WORLDVIEW_PICK_SESSION_KEY = "oc_web_wv_pick_result_v1";

/** 世界观工作站「相关 OC」挑选结果（session 或 router state） */
export const WORLDVIEW_LINKED_OC_PICK_SESSION_KEY = "oc_web_wv_linked_oc_pick_result_v1";

export type WorldviewLinkedOcPickLocationState = {
    returnPath: string;
    /** 已选中的 OC（可多选） */
    initial?: OcWorldviewLink | OcWorldviewLink[] | null;
    resultChannel?: "router" | "session";
};

/** 挑选页界面记忆：Tab、搜索词、滚动位置（按 returnPath 区分） */
export const WORLDVIEW_PICK_UI_KEY = "oc_web_wv_pick_ui_v1";

export type WorldviewPickUiMemoryV1 = {
    v: 1;
    returnPath: string;
    tab: "mine" | "search";
    searchQuery: string;
    scrollY: number;
};

export type WorldviewPickLocationState = {
    returnPath: string;
    /** 进入挑选页时已选中的世界观（最多一项；兼容旧版数组只取首项） */
    initial?: OcWorldviewLink | OcWorldviewLink[] | null;
    /** router：返回时用 location.state；session：写入 WORLDVIEW_PICK_SESSION_KEY（如弹窗创建流程） */
    resultChannel?: "router" | "session";
};
