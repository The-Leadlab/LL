import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import authService, { type UserInfo, type LoginCredentials, type RegisterData } from '../services/auth'
import api from '../lib/axios'
import { invalidateOrgScopedQueries } from '../lib/queryClient'
import { getApiErrorMessage } from '@/lib/apiError'

function orgsDiffer(previous: unknown, next: unknown): boolean {
  if (previous === undefined || previous === null || next === undefined || next === null) {
    return false
  }
  return String(previous) !== String(next)
}

export interface User {
  id: string
  email: string
  username?: string
  first_name: string
  last_name: string
  is_active: boolean
  is_admin: boolean
  organization_id?: string
  created_at: string
  updated_at: string
  credit_balance: number
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  rememberMe: boolean
  /** Bumped when profile photo changes so layout can refetch /users/me/avatar */
  avatarRevision: number
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  bumpAvatarRevision: () => void
  login: (credentials: LoginCredentials, rememberMe?: boolean) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  fetchUser: () => Promise<void>
  refreshToken: () => Promise<void>
  clearError: () => void
}

/** Apply the user's saved language (en/fr) after authentication. Never throws. */
async function syncLanguageFromUserSettings(): Promise<void> {
  try {
    const [{ getUserSettings }, { applyLanguageFromSettings }] = await Promise.all([
      import('@/services/settings'),
      import('@/i18n/setAppLanguage'),
    ])
    const settings = await getUserSettings()
    const language = settings?.language
    if (language === 'en' || language === 'fr') {
      await applyLanguageFromSettings(language)
    }
  } catch (error) {
    console.warn('Could not apply user language from settings', error)
  }
}

function clearAuthStorage() {
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('refreshToken')
}

function persistTokens(accessToken: string, refreshToken: string | null | undefined, rememberMe: boolean) {
  clearAuthStorage()
  if (rememberMe) {
    localStorage.setItem('token', accessToken)
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
  } else {
    sessionStorage.setItem('token', accessToken)
    if (refreshToken) sessionStorage.setItem('refreshToken', refreshToken)
  }
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      rememberMe: true,
      avatarRevision: 0,

      setUser: (user) => set({ user }),

      setToken: (token) => set({ token }),

      bumpAvatarRevision: () => set((s) => ({ avatarRevision: (s.avatarRevision ?? 0) + 1 })),
      
      login: async (credentials: LoginCredentials, rememberMe = true) => {
        set({ isLoading: true, error: null })
        
        try {
          const response = await authService.login(credentials)
          const { access_token, refresh_token, user } = response as {
            access_token: string
            refresh_token?: string
            user: UserInfo
          }
          
          api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
          persistTokens(access_token, refresh_token, rememberMe)
          set({
            token: access_token,
            user: user as unknown as User,
            isAuthenticated: true,
            error: null,
            rememberMe,
          })
          try {
            const previousOrg = (user as unknown as User).organization_id
            const me = await authService.getCurrentUser()
            if (orgsDiffer(previousOrg, (me as unknown as User).organization_id)) {
              invalidateOrgScopedQueries()
            }
            set({ user: me as unknown as User, isAuthenticated: true })
          } catch (refreshError) {
            console.warn('Could not refresh user after login; using login payload', refreshError)
          }
          void syncLanguageFromUserSettings()
        } catch (error: any) {
          clearAuthStorage()
          delete api.defaults.headers.common['Authorization']
          set({ 
            token: null, 
            user: null, 
            isAuthenticated: false,
            error: getApiErrorMessage(error, 'Login failed')
          })
          throw error
        } finally {
          set({ isLoading: false })
        }
      },
      
      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null })
        
        try {
          const user = await authService.register(data)
          set({ user: user as unknown as User, error: null })
        } catch (error: any) {
          set({ 
            error: getApiErrorMessage(error, 'Registration failed')
          })
          throw error
        } finally {
          set({ isLoading: false })
        }
      },

      logout: async () => {
        try {
          await authService.logout()
        } catch (error) {
          console.warn('Logout API call failed:', error)
        } finally {
          clearAuthStorage()
          delete api.defaults.headers.common['Authorization']
          set({ user: null, token: null, isAuthenticated: false })
        }
      },
      
      fetchUser: async () => {
        set({ isLoading: true, error: null })
        const tokenAtStart =
          get().token ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('token')

        try {
          const previousOrg = get().user?.organization_id
          const user = await authService.getCurrentUser()
          if (orgsDiffer(previousOrg, (user as unknown as User).organization_id)) {
            invalidateOrgScopedQueries()
          }
          set({ user: user as unknown as User, isAuthenticated: true, error: null })
          void syncLanguageFromUserSettings()
        } catch (error: any) {
          const tokenNow =
            get().token ||
            localStorage.getItem('token') ||
            sessionStorage.getItem('token')
          if (tokenAtStart && tokenNow && tokenAtStart !== tokenNow) {
            throw error
          }
          clearAuthStorage()
          delete api.defaults.headers.common['Authorization']
          set({ 
            token: null, 
            user: null, 
            isAuthenticated: false,
            error: getApiErrorMessage(error, 'Failed to fetch user')
          })
          throw error
        } finally {
          set({ isLoading: false })
        }
      },

      refreshToken: async () => {
        set({ isLoading: true, error: null })
        
        try {
          const storedRefresh = getStoredRefreshToken()
          if (!storedRefresh) {
            throw new Error('No refresh token')
          }
          const response = await authService.refreshToken(storedRefresh)
          const { access_token, refresh_token } = response as {
            access_token: string
            refresh_token?: string
          }
          const rememberMe = get().rememberMe
          
          api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
          persistTokens(access_token, refresh_token || storedRefresh, rememberMe)
          set({ token: access_token, error: null })
        } catch (error: any) {
          clearAuthStorage()
          delete api.defaults.headers.common['Authorization']
          set({ 
            token: null, 
            user: null, 
            isAuthenticated: false,
            error: error.response?.data?.message || 'Token refresh failed'
          })
          throw error
        } finally {
          set({ isLoading: false })
        }
      },
      
      clearError: () => set({ error: null })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ rememberMe: state.rememberMe, avatarRevision: state.avatarRevision }),
    }
  )
)

// Auto-login if token exists
const token = localStorage.getItem('token') || sessionStorage.getItem('token')
if (token) {
  const bootstrapToken = token
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  const remembered = Boolean(localStorage.getItem('token') || localStorage.getItem('refreshToken'))
  useAuthStore.setState({ token, isAuthenticated: true, rememberMe: remembered || useAuthStore.getState().rememberMe })
  useAuthStore.getState().fetchUser().catch(async () => {
    const still =
      localStorage.getItem('token') || sessionStorage.getItem('token')
    if (still && still !== bootstrapToken) return
    // Access token may be expired — try refresh before wiping the session
    try {
      if (getStoredRefreshToken()) {
        await useAuthStore.getState().refreshToken()
        await useAuthStore.getState().fetchUser()
        return
      }
    } catch {
      // fall through to clear
    }
    delete api.defaults.headers.common['Authorization']
    clearAuthStorage()
  })
}
