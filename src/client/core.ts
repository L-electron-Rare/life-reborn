export type CoreHealth = {
  status: string;
};

const coreUrl = process.env.CORE_URL || "http://localhost:8000";

export async function fetchCoreHealth(): Promise<CoreHealth> {
  const response = await fetch(`${coreUrl}/health`);
  if (!response.ok) {
    throw new Error(`Core health request failed with status ${response.status}`);
  }
  return (await response.json()) as CoreHealth;
}