/** 与后端 Artwork.category、首页筛选 slug 对齐的作品类型（历史 `nienien` 已并入 OC；`novel` 已下线，按 OC 展示；`comic` 已下线，按 OC 展示） */
export type ArtworkKind = "oc" | "worldview" | "emoji";

const KIND_SET = new Set<string>(["oc", "worldview", "emoji"]);

export function normalizeArtworkKind(raw: string | undefined | null): ArtworkKind {
    const s = (raw ?? "oc").toLowerCase().trim();
    if (s === "nienien" || s === "novel" || s === "comic") return "oc";
    if (KIND_SET.has(s)) return s as ArtworkKind;
    return "oc";
}

export function artworkKindLabel(kind: ArtworkKind): string {
    const m: Record<ArtworkKind, string> = {
        oc: "OC",
        worldview: "世界观",
        emoji: "表情包",
    };
    return m[kind];
}
