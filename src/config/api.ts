const rawBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

export const API_BASE_URL = rawBase.replace(/\/+$/, "");

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function resolveApiUrl(url: string | null | undefined): string {
  const value = String(url ?? "").trim();
  if (!value) return "";
  if (isAbsoluteUrl(value) || !API_BASE_URL) return value;
  return value.startsWith("/") ? `${API_BASE_URL}${value}` : `${API_BASE_URL}/${value}`;
}

export function toStorageUrl(url: string): string {
  const value = String(url ?? "").trim();
  if (!value) return "";
  if (!API_BASE_URL || !value.startsWith(API_BASE_URL)) return value;
  const rest = value.slice(API_BASE_URL.length);
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export function getSocketBaseUrl(): string | undefined {
  return API_BASE_URL || undefined;
}
