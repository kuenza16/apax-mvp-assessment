import { clearSession, getToken } from '../session';

const baseUrl = (process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000')).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

interface RequestOptions {
  authenticated?: boolean;
  signal?: AbortSignal;
}

// Only known public backend messages are shown; never render arbitrary server details.
const publicMessages = new Set([
  'Invalid Email or Password', 'Please Enter Email And Password',
  'Authentication required', 'Token expired', 'Invalid token', 'Access forbidden',
]);

export async function baseAPI<T>(
  path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown,
  { authenticated = true, signal }: RequestOptions = {}
): Promise<T> {
  const token = authenticated ? getToken() : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let response: Response;
  try {
    response = await fetch(baseUrl + path, {
      method, headers, signal, cache: 'no-store',
      body: method !== 'GET' && body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Unable to connect to the server. Please try again.', 0);
  }
  // A late response from an older session must not clear a newer login.
  if (response.status === 401 && authenticated && token && getToken() === token) clearSession();
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== 'object' || !('success' in data) || data.success !== true) {
    const message = data && typeof data === 'object' && 'message' in data &&
      typeof data.message === 'string' && publicMessages.has(data.message) ? data.message :
      response.status === 401 ? 'Authentication required' :
      'Unable to complete the request. Please try again.';
    throw new ApiError(message, response.status);
  }
  return data as T;
}
