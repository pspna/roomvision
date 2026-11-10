export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (import.meta.env.DEV) console.error(`API network error (${method} /api/${path}):`, error);
    throw new Error('The server could not be reached. Check that the API service is running and try again.');
  }

  const responseText = response.status === 204 ? '' : await response.text();
  let data: unknown;
  if (responseText.trim()) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (import.meta.env.DEV) console.error(`API returned non-JSON content (${response.status} ${method} /api/${path}).`);
      if (response.ok) throw new Error('The server returned an invalid response. Please try again.');
      throw new Error(`The server returned an unexpected response (${response.status}). Please try again.`);
    }
  }

  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `The request failed (${response.status}). Please try again.`;
    throw new Error(message);
  }
  if (response.status === 204 || !responseText.trim()) return undefined as T;
  return data as T;
}
