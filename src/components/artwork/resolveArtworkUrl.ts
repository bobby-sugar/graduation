export function resolveArtworkUrl(raw: string | undefined | null, apiBaseUrl: string): string {
    if (!raw || !raw.trim()) return "";
    const u = raw.trim();
    if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
    const base = apiBaseUrl.replace(/\/$/, "");
    return u.startsWith("/") ? `${base}${u}` : `${base}/${u}`;
}
