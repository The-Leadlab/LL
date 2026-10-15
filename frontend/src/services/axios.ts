import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import { getApiOrigin } from '@/lib/apiOrigin';
import { EMPTY_LEAD_LIST_PAGE } from '@/lib/emptyApiFallbacks';
import { shouldFakeTaskError } from '@/utils/axiosErrorPolicy';

// Get API URL from environment variables or use proxy in development
const isDevelopment = import.meta.env.DEV;
const API_URL = isDevelopment ? '' : getApiOrigin();
if (!isDevelopment && !API_URL) {
  console.error('VITE_API_URL is not defined in environment variables and not in development mode');
}

// In development, use the proxy to route to localhost:8000
const baseURL = isDevelopment ? '/api/v1' : `${API_URL}/api/v1`;

const api = axios.create({
  baseURL,
  timeout: 60000,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  withCredentials: true // Include cookies in requests
});

/** Must match `store/auth.ts`: token may live in sessionStorage when "Remember me" is off. */
function getStoredAccessToken(): string | null {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

// Variable to check whether to redirect
let isRefreshingToken = false;
let redirectToLogin = false;
// Array to store pending requests
let pendingRequests: Array<() => void> = [];

// Non-critical endpoints (don't logout on 401)
const nonCriticalEndpoints = [
  '/notifications',
  '/leads',
  '/organization-settings',
  '/user-settings',
  '/currencies',
  '/tags',
  '/roles',
  '/lead-stages',
  '/information-requests',
  '/activities',
  '/tasks'
];

// Task endpoint special data structure
const taskDefaultResponses = {
  single: {
    id: 0,
    title: "Authorization Error",
    description: "You do not have permission to access this task.",
    due_date: new Date().toISOString(),
    priority: "MEDIUM",
    status: "PENDING",
    completed_at: null,
    assigned_to_id: null,
    organization_id: 0,
    lead_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  list: { items: [], total: 0 }
};

// Last successful token refresh time
let lastSuccessfulTokenRefresh = 0;
// Token refresh minimum interval (15 seconds)
const TOKEN_REFRESH_MIN_INTERVAL = 15000; 

// Request interceptor - Add authentication token to requests
api.interceptors.request.use(
  (config) => {
    const token = getStoredAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    console.log('Response error:', {
      status: error.response?.status,
      url: originalRequest?.url,
      isRetry: originalRequest?._retry
    });

    // Specific handling for leads/{id} endpoints with 401 errors
    if (error.response?.status === 401 && 
        originalRequest?.url && 
        originalRequest.url.match(/\/leads\/\d+$/)) {
      
      console.warn(`Authentication error on lead detail: ${originalRequest.url}, retrying with fresh token`);
      
      // Try to get a fresh token from localStorage (might have been updated)
      const token = getStoredAccessToken();
      if (token) {
        console.log('Retrying with fresh token from storage');
        originalRequest.headers['Authorization'] = `Bearer ${token}`;
        return api(originalRequest);
      }
    }

    // If endpoint returns 404 and is non-critical, silently handle the error
    if (error.response?.status === 404) {
      const currentUrl = originalRequest?.url || '';
      const isNonCritical = nonCriticalEndpoints.some(endpoint => currentUrl.includes(endpoint));
      
      if (isNonCritical) {
        console.warn(`Endpoint not found (404): ${currentUrl}. This feature may not be implemented yet.`);
        // Return empty/default response
        if (currentUrl.includes('/notifications')) {
          return Promise.resolve({ data: { items: [], total: 0 } });
        }
        if (currentUrl.includes('/leads')) {
          return Promise.resolve({ data: { ...EMPTY_LEAD_LIST_PAGE } });
        }
        if (currentUrl.includes('/tags')) {
          return Promise.resolve({ data: { items: [], total: 0 } });
        }
        if (currentUrl.includes('/organization-settings')) {
          return Promise.resolve({ data: { settings: {} } });
        }
        if (currentUrl.includes('/user-settings')) {
          return Promise.resolve({ data: { settings: {} } });
        }
        if (currentUrl.includes('/currencies')) {
          return Promise.resolve({ data: [] });
        }
        if (currentUrl.includes('/lead-stages')) {
          return Promise.resolve({ data: [] });
        }
        if (currentUrl.includes('/information-requests')) {
          return Promise.resolve({ data: { items: [] } });
        }
        if (currentUrl.includes('/activities')) {
          return Promise.resolve({ data: { items: [] } });
        }
        if (shouldFakeTaskError(currentUrl, originalRequest?.method)) {
          return Promise.resolve({ data: { items: [], total: 0 } });
        }

        // Return empty response for other cases
        return Promise.resolve({ data: {} });
      }
    }

    // If there's no response, possibly a network error
    if (!error.response) {
      console.error('Network error:', error.message);
      return Promise.reject(error);
    }

    // 401 Unauthorized error - Handle token issues
    if (error.response.status === 401 && !originalRequest._retry) {
      // For non-critical endpoints, silently handle without logging out the user
      const currentUrl = originalRequest?.url || '';
      const isNonCritical = nonCriticalEndpoints.some(endpoint => currentUrl.includes(endpoint));
      
      if (isNonCritical) {
        console.warn(`Authentication error on non-critical endpoint: ${currentUrl}`);

        // Return empty results for leads or users
        if (currentUrl.includes('/leads')) {
          return Promise.resolve({ data: { ...EMPTY_LEAD_LIST_PAGE } });
        }
        if (currentUrl.includes('/tags')) {
          return Promise.resolve({ data: { items: [], total: 0 } });
        }
        if (shouldFakeTaskError(currentUrl, originalRequest?.method)) {
          return Promise.resolve({ data: taskDefaultResponses.list });
        }
        if (currentUrl.includes('/organization-settings')) {
          return Promise.resolve({ data: { settings: {} } });
        }
        if (currentUrl.includes('/user-settings')) {
          return Promise.resolve({ data: { settings: {} } });
        }
        if (currentUrl.includes('/currencies')) {
          return Promise.resolve({ data: [] });
        }
        if (currentUrl.includes('/lead-stages')) {
          return Promise.resolve({ data: [] });
        }
        if (currentUrl.includes('/information-requests')) {
          return Promise.resolve({ data: { items: [] } });
        }
        if (currentUrl.includes('/activities')) {
          return Promise.resolve({ data: { items: [] } });
        }

        // Reject error for other non-critical endpoints
        return Promise.reject(error);
      }

      // Has enough time passed since the last token refresh?
      const now = Date.now();
      if (now - lastSuccessfulTokenRefresh < TOKEN_REFRESH_MIN_INTERVAL) {
        console.warn('Token refresh attempted too soon, skipping...');
        return Promise.reject(error);
      }

      // If token refresh is already in progress
      if (isRefreshingToken) {
        return new Promise((resolve) => {
          // Add current request to the pending queue
          pendingRequests.push(() => {
            resolve(api(originalRequest));
          });
        });
      }

      // Mark current request as retry
      originalRequest._retry = true;
      isRefreshingToken = true;

      console.log('Attempting to refresh token...');
      
      try {
        // Try to refresh token
        const refreshToken = localStorage.getItem('refreshToken');

        // If no refresh token, redirect to login
        if (!refreshToken) {
          console.log('No refresh token found');
          if (!redirectToLogin) {
            redirectToLogin = true;
            useAuthStore.getState().logout();
            window.location.href = '/signin';
          }
          return Promise.reject(error);
        }

        console.log('Calling refresh token endpoint...');
        // Use the same baseURL logic as the main api instance
        const refreshURL = isDevelopment ? '/api/v1/auth/refresh/' : `${API_URL}/api/v1/auth/refresh/`;
        const response = await axios.post(
          refreshURL,
          { refresh_token: refreshToken }
        );

        if (response.data.access_token) {
          console.log('Token refresh successful');
          // Record the time of successful token refresh
          lastSuccessfulTokenRefresh = Date.now();
          
          // Update tokens
          localStorage.setItem('token', response.data.access_token);
          if (response.data.refresh_token) {
            localStorage.setItem('refreshToken', response.data.refresh_token);
          }

          // Update auth header
          api.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
          originalRequest.headers['Authorization'] = `Bearer ${response.data.access_token}`;

          // Retry all pending requests with new token
          pendingRequests.forEach(callback => callback());
          pendingRequests = [];
          
          // Retry original request
          console.log('Retrying original request...');
          isRefreshingToken = false;
          redirectToLogin = false;
          return api(originalRequest);
        } else {
          throw new Error('Token refresh failed - no access token returned');
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);

        // Redirect to login
        if (!redirectToLogin) {
          redirectToLogin = true;
          useAuthStore.getState().logout();
          window.location.href = '/signin';
        }
        
        isRefreshingToken = false;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;