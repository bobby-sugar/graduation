/** OC 工作站「标签」与作品 `tags` 字段（逗号分隔）同步 */

export const OC_PRIMARY_TAG = "oc";

export function parseOcTagList(raw: unknown): string[] {
    return String(raw ?? "")
        .split(/[,，、]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export function serializeOcTagList(tags: string[]): string {
    return tags.join(",");
}

/** 始终包含一个小写 `oc` 作为首项，其余去重（忽略大小写与 oc 重复） */
export function ensurePrimaryOc(tags: string[]): string[] {
    const rest: string[] = [];
    for (const t of tags) {
        const tl = t.trim();
        if (!tl || tl.toLowerCase() === OC_PRIMARY_TAG) continue;
        if (!rest.some((x) => x.toLowerCase() === tl.toLowerCase())) rest.push(tl);
    }
    return [OC_PRIMARY_TAG, ...rest];
}

export function canRemoveOcTag(tag: string): boolean {
    return tag.trim().toLowerCase() !== OC_PRIMARY_TAG;
}

/** 从表单原始值得到写入接口用的 tags 字符串 */
export function normalizeOcTagsField(raw: unknown): string {
    return serializeOcTagList(ensurePrimaryOc(parseOcTagList(raw)));
}

/** 世界观工作站：首项固定为 `worldview`，与首页分类检索一致 */
export const WORLDVIEW_PRIMARY_TAG = "worldview";

export function ensurePrimaryWorldview(tags: string[]): string[] {
    const rest: string[] = [];
    for (const t of tags) {
        const tl = t.trim();
        if (!tl || tl.toLowerCase() === WORLDVIEW_PRIMARY_TAG) continue;
        if (!rest.some((x) => x.toLowerCase() === tl.toLowerCase())) rest.push(tl);
    }
    return [WORLDVIEW_PRIMARY_TAG, ...rest];
}

export function canRemoveWorldviewTag(tag: string): boolean {
    return tag.trim().toLowerCase() !== WORLDVIEW_PRIMARY_TAG;
}

export function normalizeWorldviewTagsField(raw: unknown): string {
    return serializeOcTagList(ensurePrimaryWorldview(parseOcTagList(raw)));
}

/** 表情包工作站：首项固定为 `emoji`，与首页分类检索一致 */
export const EMOJI_PRIMARY_TAG = "emoji";

export function ensurePrimaryEmoji(tags: string[]): string[] {
    const rest: string[] = [];
    for (const t of tags) {
        const tl = t.trim();
        if (!tl || tl.toLowerCase() === EMOJI_PRIMARY_TAG) continue;
        if (!rest.some((x) => x.toLowerCase() === tl.toLowerCase())) rest.push(tl);
    }
    return [EMOJI_PRIMARY_TAG, ...rest];
}

export function canRemoveEmojiTag(tag: string): boolean {
    return tag.trim().toLowerCase() !== EMOJI_PRIMARY_TAG;
}

export function normalizeEmojiTagsField(raw: unknown): string {
    return serializeOcTagList(ensurePrimaryEmoji(parseOcTagList(raw)));
}
