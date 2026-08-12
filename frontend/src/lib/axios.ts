import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import { getApiOrigin } from './apiOrigin';
import { EMPTY_LEAD_LIST_PAGE } from '@/lib/emptyApiFallbacks';

// Get API URL from environment variables or use proxy in development
const isDevelopment = import.meta.env.DEV;
// Production: origin only (getApiOrigin strips mistaken /api/v1 from VITE_API_URL)
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

function getStoredRefreshToken(): string | null {
  return localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
}

function storeRefreshedTokens(accessToken: string, refreshToken?: string | null) {
  const rememberMe =
    Boolean(localStorage.getItem('token') || localStorage.getItem('refreshToken')) ||
    useAuthStore.getState().rememberMe;

  if (rememberMe) {
    localStorage.setItem('token', accessToken);
    sessionStorage.removeItem('token');
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
      sessionStorage.removeItem('refreshToken');
    }
  } else {
    sessionStorage.setItem('token', accessToken);
    localStorage.removeItem('token');
    if (refreshToken) {
      sessionStorage.setItem('refreshToken', refreshToken);
      localStorage.removeItem('refreshToken');
    }
  }
  useAuthStore.setState({ token: accessToken, rememberMe });
}

// Yönlendirme yapıp yapılmayacağını kontrol eden değişken
let isRefreshingToken = false;
let redirectToLogin = false;
// Bekleyen istekleri depolayacak array
let pendingRequests: Array<() => void> = [];

// Kritik olmayan endpointler (401 olduğunda logout olmayalım)
const nonCriticalEndpoints = [
  '/notifications',
  '/leads',
  '/users',
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

// Task endpoint'inde özel olarak kullanılacak veri yapısı
const taskDefaultResponses = {
  single: {
    id: 0,
    title: "Yetkilendirme Hatası",
    description: "Bu göreve erişim izniniz bulunmamaktadır.",
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

// Son başarılı token yenileme zamanı
let lastSuccessfulTokenRefresh = 0;
// Token yenileme minimum aralığı (15 saniye)
const TOKEN_REFRESH_MIN_INTERVAL = 15000;

/** Do not fake 404/401 responses for these /users/* paths — real errors must surface (profile, avatar, org roster, user by id). */
function isUsersSubResourceUrl(url: string): boolean {
  return (
    url.includes('/users/me') ||
    url.includes('/users/organization-users') ||
    url.includes('/users/actions/') ||
    url.includes('/users/deactivate-all-except-ali') ||
    /\/users\/\d+(\/|$|\?)/.test(url)
  );
}

// Request interceptor - URL'lerin sonuna / ekleyerek yönlendirmeleri önleyelim
api.interceptors.request.use(
  (config) => {
    const token = getStoredAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Multipart uploads: default Content-Type is application/json — strip so the browser sets boundary
    if (config.data instanceof FormData) {
      const h = config.headers as Record<string, unknown>;
      delete h['Content-Type'];
      delete h['content-type'];
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

    // Eğer endpoint 404 hatası veriyorsa ve kritik olmayan bir endpoint ise, sessizce hatayı geçelim
    if (error.response?.status === 404) {
      const currentUrl = originalRequest?.url || '';
      const isNonCritical = nonCriticalEndpoints.some(endpoint => currentUrl.includes(endpoint));
      
      if (isNonCritical) {
        console.warn(`Endpoint not found (404): ${currentUrl}. This feature may not be implemented yet.`);
        // Empty/default response döndür
        if (currentUrl.includes('/notifications')) {
          return Promise.resolve({ data: { items: [], total: 0 } });
        }
        if (currentUrl.includes('/leads')) {
          return Promise.resolve({ data: { ...EMPTY_LEAD_LIST_PAGE } });
        }
        if (currentUrl.includes('/users') && !isUsersSubResourceUrl(currentUrl)) {
          return Promise.resolve({ data: { items: [], total: 0 } });
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
        if (currentUrl.includes('/tasks')) {
          if (currentUrl.match(/\/tasks\/\d+/)) {
            // For individual task requests
            return Promise.resolve({ data: {} });
          }
          // For task list requests
          return Promise.resolve({ data: { items: [], total: 0 } });
        }
        
        // Diğer durumlar için boş bir yanıt döndür
        return Promise.resolve({ data: {} });
      }
    }

    // If there's no response, possibly a network error
    if (!error.response) {
      console.error('Network error:', error.message);
      return Promise.reject(error);
    }

    // 401 Unauthorized hatası - Token sorunlarını ele alma
    if (error.response.status === 401 && !originalRequest._retry) {
      const currentUrl = originalRequest?.url || '';
      // Don't redirect on login endpoint - let the form show "invalid credentials"
      if (currentUrl.includes('/auth/login')) {
        return Promise.reject(error);
      }
      // Kritik olmayan endpointler için sessizce geçelim, kullanıcıyı logout yapmayalım
      const isNonCritical = nonCriticalEndpoints.some(endpoint => currentUrl.includes(endpoint));
      
      if (isNonCritical) {
        console.warn(`Authentication error on non-critical endpoint: ${currentUrl}`);
        
        // Leads veya users için boş sonuç döndürelim
        if (currentUrl.includes('/leads')) {
          return Promise.resolve({ data: { ...EMPTY_LEAD_LIST_PAGE } });
        }
        if (currentUrl.includes('/users') && !isUsersSubResourceUrl(currentUrl)) {
          return Promise.resolve({ data: { items: [], total: 0 } });
        }
        if (currentUrl.includes('/tags')) {
          return Promise.resolve({ data: { items: [], total: 0 } });
        }
        if (currentUrl.includes('/tasks')) {
          if (currentUrl.match(/\/tasks\/\d+/)) {
            // Task detayı isteği için daha zengin bir varsayılan yanıt
            return Promise.resolve({ data: taskDefaultResponses.single });
          }
          // Task listesi için boş liste
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
        
        // Diğer kritik olmayan endpointler için hatayı geçelim
        return Promise.reject(error);
      }

      // Son token yenilemesinden bu yana yeterli zaman geçti mi?
      const now = Date.now();
      if (now - lastSuccessfulTokenRefresh < TOKEN_REFRESH_MIN_INTERVAL) {
        console.warn('Token refresh attempted too soon, skipping...');
        return Promise.reject(error);
      }

      // Eğer oturum yenileme işlemi zaten devam ediyorsa
      if (isRefreshingToken) {
        return new Promise((resolve) => {
          // Mevcut isteği bekletme kuyruğuna ekle
          pendingRequests.push(() => {
            resolve(api(originalRequest));
          });
        });
      }

      // Mevcut isteği yeniden deneme olarak işaretle
      originalRequest._retry = true;
      isRefreshingToken = true;

      console.log('Attempting to refresh token...');
      
      try {
        // Try to refresh token
        const refreshToken = getStoredRefreshToken();
        
        // Refresh token yoksa, login'e yönlendir
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
        const refreshURL = isDevelopment ? '/api/v1/auth/refresh' : `${API_URL}/api/v1/auth/refresh`;
        const response = await axios.post(
          refreshURL,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' }, withCredentials: true }
        );

        if (response.data.access_token) {
          console.log('Token refresh successful');
          // Token yenileme başarılı zamanını kaydet
          lastSuccessfulTokenRefresh = Date.now();
          
          // Update tokens (respect Remember me storage)
          storeRefreshedTokens(response.data.access_token, response.data.refresh_token);

          // Update auth header
          api.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
          originalRequest.headers['Authorization'] = `Bearer ${response.data.access_token}`;

          // Bekletme kuyruğundaki tüm istekleri yeni token ile yeniden yap
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
        
        // Login'e yönlendir
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

// Export both default and named export for compatibility
export default api;
export { api };