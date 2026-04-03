export type CoreHealth = {
  status: string;
  providers?: string[];
  cache_available?: boolean;
};

export function getCoreUrl(): string {
  return process.env.CORE_URL || "http://localhost:8000";
}

export function buildCoreUrl(path: string): string {
  return new URL(path, getCoreUrl()).toString();
}

export async function fetchCore(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildCoreUrl(path), init);
}

export async function fetchCoreHealth(): Promise<CoreHealth> {
  const response = await fetchCore("/health");
  if (!response.ok) {
    throw new Error(`Core health request failed with status ${response.status}`);
  }
  return (await response.json()) as CoreHealth;
}
