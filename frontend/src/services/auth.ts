import api from '../lib/axios';

// Backend-Go compatible types
export interface LoginCredentials {
  email?: string;
  username?: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  company?: string;
}

export interface UserInfo {
  id: string;
  email: string;
  username?: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_admin: boolean;
  organization_id?: string;
  created_at: string;
  updated_at: string;
  credit_balance: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: UserInfo;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  /** Preferred field — matches backend ResetPasswordInput.new_password */
  new_password: string;
  /** @deprecated kept for callers that still pass password */
  password?: string;
  password_confirmation?: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

export interface GoogleInitResponse {
  authorization_url: string;
}

// API endpoints aligned with backend-go
export const login = async (credentials: LoginCredentials): Promise<TokenResponse> => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const initGoogleSignIn = async (rememberMe = false): Promise<GoogleInitResponse> => {
  const response = await api.get('/auth/google/init', { params: { remember_me: rememberMe } });
  return response.data;
};

export const register = async (data: RegisterData): Promise<UserInfo> => {
  const response = await api.post('/auth/register', data);
  return response.data;
};

export const getCurrentUser = async (): Promise<UserInfo> => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const changePassword = async (data: ChangePasswordData): Promise<{ message: string }> => {
  const response = await api.post('/auth/change-password', data);
  return response.data;
};

export const logout = async (): Promise<{ message: string }> => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const refreshToken = async (): Promise<RefreshTokenResponse> => {
  const response = await api.post('/auth/refresh');
  return response.data;
};

export const forgotPassword = async (data: ForgotPasswordData): Promise<{ message: string }> => {
  const response = await api.post('/auth/forgot-password', data);
  return response.data;
};

export const resendPasswordReset = async (data: ForgotPasswordData): Promise<{ message: string }> => {
  const response = await api.post('/auth/resend-password-reset', data);
  return response.data;
};

export const resetPassword = async (data: ResetPasswordData): Promise<{ message: string }> => {
  const newPassword = data.new_password || data.password;
  if (!newPassword) {
    throw new Error('New password is required');
  }
  const response = await api.post('/auth/reset-password', {
    token: data.token,
    new_password: newPassword,
  });
  return response.data;
};

export const verifyEmail = async (token: string): Promise<{ message: string }> => {
  const response = await api.post('/auth/verify-email', { token });
  return response.data;
};

export const resendVerification = async (): Promise<{ message: string }> => {
  const response = await api.post('/auth/resend-verification');
  return response.data;
};

export default {
  login,
  initGoogleSignIn,
  register,
  getCurrentUser,
  changePassword,
  logout,
  refreshToken,
  forgotPassword,
  resendPasswordReset,
  resetPassword,
  verifyEmail,
  resendVerification,
};
