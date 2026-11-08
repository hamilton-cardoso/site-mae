export async function api<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Ocorreu um erro. Tente novamente.");
  return value as T;
}

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Ocorreu um erro. Tente novamente.";
