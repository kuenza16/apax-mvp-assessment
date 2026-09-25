import { baseAPI, ApiError } from './base.api';

export interface SessionUser {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface LoginResponse {
  success: true;
  token: string;
  user: SessionUser;
}

export async function loginApi(credentials: { email: string; password: string }) {
  const data = await baseAPI<LoginResponse>('/user/login', 'POST', credentials, { authenticated: false });
  if (typeof data.token !== 'string' || !data.token.trim() || !data.user ||
      !['_id', 'name', 'email', 'role'].every(key => typeof data.user[key as keyof SessionUser] === 'string')) {
    throw new ApiError('Authentication failed. Invalid server response.', 502);
  }
  return data;
}
