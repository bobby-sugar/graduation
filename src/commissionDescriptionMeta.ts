/** 与 CommissionDetailPage 一致：从 description 中解析「筛选信息」键值 */

export interface ParsedCommissionDescription {
    plainDescription: string;
    map: Record<string, string>;
}

export function parseCommissionDescription(rawDescription?: string | null): ParsedCommissionDescription {
    if (!rawDescription) {
        return { plainDescription: "", map: {} };
    }
    const [plainPart, metaPart] = rawDescription.split("【筛选信息】");
    const map: Record<string, string> = {};
    if (metaPart) {
        metaPart
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
                const idx = line.indexOf("：");
                if (idx > 0) {
                    const key = line.slice(0, idx).trim();
                    const value = line.slice(idx + 1).trim();
                    map[key] = value;
                }
            });
    }
    return { plainDescription: (plainPart ?? "").trim(), map };
}

export function formatCommissionDateTime(time: string | null | undefined) {
    if (!time) return "-";
    const d = new Date(time);
    return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
