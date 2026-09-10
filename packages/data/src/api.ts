export interface ApiTransport {
  request(path: string, init?: RequestInit): Promise<Response>;
}

export async function readApiJson<T>(transport: ApiTransport, path: string, init?: RequestInit): Promise<T> {
  const response = await transport.request(path, init);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : 'A API não conseguiu concluir a solicitação.';
    throw new Error(message);
  }
  return payload as T;
}
