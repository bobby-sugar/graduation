export type FieldType = "text" | "number" | "textarea" | "select";

export interface FormFieldDef {
    name: string;
    label: string;
    type: FieldType;
    required?: boolean;
    options?: string[];
    placeholder?: string;
    rows?: number;
}

export function getStudioFormFields(category: string): FormFieldDef[] {
    switch (category) {
        case "OC":
            return [
                { name: "name", label: "姓名 / 称呼", type: "text", required: true, placeholder: "例如：星野眠" },
                { name: "gender", label: "性别", type: "text", placeholder: "或填写代词" },
                { name: "age", label: "年龄", type: "number", placeholder: "数字或写在简介" },
                { name: "race", label: "种族 / 物种", type: "text" },
                { name: "occupation", label: "职业 / 身份", type: "text" },
                { name: "tagline", label: "角色简介", type: "textarea", rows: 5, placeholder: "将展示在详情页「角色简介」与列表卡片摘要" },
            ];
        case "世界观":
            return [
                { name: "name", label: "世界观名称", type: "text", required: true },
                { name: "tagline", label: "一句话设定", type: "text", placeholder: "用一句话概括这个世界" },
                { name: "description", label: "世界观概述", type: "textarea", required: true, rows: 6, placeholder: "地理、历史、势力、规则等概览" },
                { name: "type", label: "类型", type: "text", placeholder: "例：奇幻、科幻、赛博朋克、架空历史（自由填写）" },
                { name: "era", label: "时代/背景", type: "text", placeholder: "例：近未来、蒸汽朋克" },
                { name: "regions", label: "地域/舞台", type: "text", placeholder: "主要发生地、地图要点" },
                { name: "factions", label: "阵营/势力", type: "text", placeholder: "可选，简要列举" },
                { name: "coreConflict", label: "核心冲突", type: "textarea", rows: 3, placeholder: "矛盾与张力来源" },
                { name: "worldRules", label: "世界规则", type: "textarea", rows: 4, placeholder: "魔法体系、科技水平、禁忌等" },
                { name: "keyTheme", label: "核心主题", type: "text", placeholder: "例：成长、救赎、战争" },
                { name: "tags", label: "标签", type: "text", placeholder: "逗号分隔" },
            ];
        case "表情包":
            return [
                { name: "name", label: "表情包名称", type: "text", required: true, placeholder: "例：眠眠日常四格" },
                { name: "tagline", label: "一句话介绍", type: "text", placeholder: "将显示在列表卡片与详情摘要" },
                { name: "description", label: "套组说明", type: "textarea", rows: 4, placeholder: "梗点、角色关系、适合聊天气氛等" },
                {
                    name: "allowDownload",
                    label: "允许下载",
                    type: "select",
                    options: ["", "是", "否"],
                },
                {
                    name: "usageNotes",
                    label: "使用说明 / 版权规则",
                    type: "textarea",
                    rows: 4,
                    placeholder: "例：允许非商用转载；商用需授权；付费渠道说明等",
                },
                { name: "tags", label: "标签", type: "text", placeholder: "逗号分隔" },
            ];
        default:
            return [];
    }
}

/**
 * ① 基础信息区：标题类、副标题/设定句、主描述（按类目不同）。
 * OC：仅姓名在首屏；「角色简介」保留字段名 tagline，与分区 ③ 中性格区原位置对齐。
 */
export function partitionStudioFields(category: string, fields: FormFieldDef[]) {
    const titleKey = "name";
    const titleField = fields.find((f) => f.name === titleKey);
    const taglineField = fields.find((f) => f.name === "tagline");
    const descField = fields.find((f) => f.name === "description" && f.type === "textarea");

    if (category === "OC") {
        const used = new Set<string>([titleField?.name].filter(Boolean) as string[]);
        const section3Fields = fields.filter((f) => !used.has(f.name));
        return { titleField, taglineField, descField: undefined, section3Fields };
    }

    const used = new Set<string>([titleField?.name, taglineField?.name, descField?.name].filter(Boolean) as string[]);
    const section3Fields = fields.filter((f) => !used.has(f.name));
    return { titleField, taglineField, descField, section3Fields };
}

/** 输入框占位：请填写「字段标题」 */
export function studioFieldPlaceholder(labelOrField: string | Pick<FormFieldDef, "label">): string {
    const label = typeof labelOrField === "string" ? labelOrField : labelOrField.label;
    return `请填写「${label}」`;
}
