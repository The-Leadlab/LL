import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/auth';
import { Header } from '../components/layout/Header';
import { toast } from 'react-hot-toast';
import { updateProfile, changePassword, User as UserType } from '../services/users';
import { linkedinAPI } from '@/services/linkedin';
import axios from '@/services/axios';
import { Globe, Loader2, CreditCard, Shield, User, Mail, Key, ExternalLink, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { LinkedInConnection } from '../components/LinkedInConnection';
import { useTranslation } from 'react-i18next'

interface ProfileForm {
  firstName: string
  lastName: string
  email: string
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

export function ProfilePage() {
  const { t } = useTranslation('modules')
  const { user, token, fetchUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm<ProfileForm>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
    },
  })

  // İlk yükleme ve kullanıcı verisi çekme
  useEffect(() => {
    const initializeProfile = async () => {
      try {
        await fetchUser()
      } catch (error) {
        console.error('Failed to fetch user data:', error)
        setError(t('profilePage.toast.loadFailed'))
      }
    }

    initializeProfile()
  }, [fetchUser])

  // Form verilerini güncelleme
  useEffect(() => {
    if (user) {
      reset({
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
      })
    }
  }, [user, reset])

  const onSubmit = async (data: ProfileForm) => {
    setLoading(true)
    setError(null)

    try {
      // Profile update
      if (data.firstName || data.lastName || data.email !== user?.email) {
        await updateProfile({
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
        })
      }

      // Password change
      if (data.currentPassword && data.newPassword) {
        await changePassword(data.currentPassword, data.newPassword)
      }

      await fetchUser()
      toast.success(t('profilePage.toast.updated'))
    } catch (err: any) {
      console.error('Failed to update profile:', err)
      setError(err.response?.data?.message || t('profilePage.toast.updateFailed'))
      toast.error(err.response?.data?.message || t('profilePage.toast.updateFailed'))
    } finally {
      setLoading(false)
    }
  };

  // LinkedIn bağlantı durumunu kontrol et
  const { data: linkedinStatus } = useQuery({
    queryKey: ['linkedin-status'],
    queryFn: async () => {
      const response = await axios.get('/linkedin/status');
      return response.data;
    }
  });

  // LinkedIn bağlantısını kaldır
  const disconnectLinkedInMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/linkedin/disconnect');
      return response.data;
    },
    onSuccess: () => {
      toast.success(t('profilePage.toast.linkedinDisconnected'));
      queryClient.invalidateQueries({ queryKey: ['linkedin-status'] });
    },
    onError: () => {
      toast.error(t('profilePage.toast.linkedinDisconnectFailed'));
    }
  });

  const handleConnectLinkedIn = () => {
    linkedinAPI.authorize();
  };

  const handleDisconnectLinkedIn = () => {
    if (window.confirm(t('profilePage.confirmDisconnect'))) {
      disconnectLinkedInMutation.mutate();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse space-y-8">
            {/* Profile Header */}
            <div className="bg-white rounded-xl shadow-sm p-8">
              <div className="flex items-center space-x-6">
                <div className="h-20 w-20 bg-gray-200 rounded-full"></div>
                <div className="space-y-3 flex-1">
                  <div className="h-7 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-5 bg-gray-200 rounded w-1/5"></div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-6">
                  <div className="h-5 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-10 bg-gray-200 rounded w-1/3"></div>
                </div>
              ))}
            </div>

            {/* Form */}
            <div className="bg-white rounded-xl shadow-sm p-8">
              <div className="h-7 bg-gray-200 rounded w-1/4 mb-6"></div>
              <div className="space-y-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <AlertTriangle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
              <div className="text-xl font-semibold text-gray-900 mb-2">{t('profilePage.somethingWrong')}</div>
              <div className="text-base text-red-600 mb-6">{error}</div>
              <Button 
                onClick={() => fetchUser()}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg hover:from-blue-700 hover:to-indigo-800 transition-colors shadow-md"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> {t('profilePage.tryAgain')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto">
        
          {/* Profile Header Card */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 h-32"></div>
            <div className="px-8 pb-8 relative">
              <div className="flex flex-col sm:flex-row items-center sm:items-end -mt-16 mb-6">
                <div className="relative rounded-full border-4 border-white bg-white shadow-lg h-32 w-32 overflow-hidden">
                  <img
                    src={`https://ui-avatars.com/api/?name=${user ? `${user.first_name} ${user.last_name}` : 'User'}&background=0D8ABC&color=fff&size=128`}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="mt-4 sm:mt-0 sm:ml-6 text-center sm:text-left">
                  <h1 className="text-3xl font-bold text-gray-900">
                    {user ? `${user.first_name} ${user.last_name}` : t('profilePage.user')}
                  </h1>
                  <p className="mt-1 text-gray-500 flex items-center justify-center sm:justify-start">
                    <Mail className="w-4 h-4 mr-2" /> {user?.email}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center justify-between">
                <div className="flex items-center space-x-3 mb-4 sm:mb-0">
                  {user?.is_admin && (
                    <div className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800">
                      <Shield className="w-4 h-4 mr-1" /> {t('profilePage.admin')}
                    </div>
                  )}
                  <div className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                    <User className="w-4 h-4 mr-1" /> {t('profilePage.active')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Profile Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
                <div className="px-6 py-6 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                    <User className="w-5 h-5 mr-2 text-blue-600" /> {t('profilePage.personalInfo')}
                  </h2>
                </div>
                
                <div className="p-6">
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-6">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                          {t('profilePage.firstName')}
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <input
                            {...register('firstName', { required: t('profilePage.firstNameRequired') })}
                            type="text"
                            className="block w-full rounded-md border-gray-300 pr-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition-colors placeholder:text-gray-400"
                            placeholder={t('profilePage.firstNamePlaceholder')}
                          />
                          {errors.firstName ? (
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </div>
                          ) : null}
                        </div>
                        {errors.firstName && (
                          <p className="mt-2 text-sm text-red-600">{errors.firstName.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                          {t('profilePage.lastName')}
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <input
                            {...register('lastName', { required: t('profilePage.lastNameRequired') })}
                            type="text"
                            className="block w-full rounded-md border-gray-300 pr-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition-colors placeholder:text-gray-400"
                            placeholder={t('profilePage.lastNamePlaceholder')}
                          />
                          {errors.lastName ? (
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </div>
                          ) : null}
                        </div>
                        {errors.lastName && (
                          <p className="mt-2 text-sm text-red-600">{errors.lastName.message}</p>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                          {t('profilePage.email')}
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <input
                            type="email"
                            value={user?.email}
                            disabled
                            className="block w-full rounded-md border-gray-300 bg-gray-50 pr-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition-colors"
                          />
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <Mail className="h-5 w-5 text-gray-400" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Password Change Section */}
                    <div className="pt-6">
                      <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-white px-3 text-sm text-gray-500 flex items-center">
                            <Key className="w-4 h-4 mr-2 text-gray-400" />
                            {t('profilePage.changePassword')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-6">
                        <div>
                          <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                            {t('profilePage.currentPassword')}
                          </label>
                          <div className="mt-1 relative rounded-md shadow-sm">
                            <input
                              {...register('currentPassword')}
                              type="password"
                              className="block w-full rounded-md border-gray-300 pr-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition-colors"
                              placeholder="Enter current password"
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <Key className="h-5 w-5 text-gray-400" />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                            {t('profilePage.newPassword')}
                          </label>
                          <div className="mt-1 relative rounded-md shadow-sm">
                            <input
                              {...register('newPassword', {
                                minLength: {
                                  value: 8,
                                  message: t('profilePage.passwordMin')
                                }
                              })}
                              type="password"
                              className="block w-full rounded-md border-gray-300 pr-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition-colors"
                              placeholder="Enter new password"
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <Key className="h-5 w-5 text-gray-400" />
                            </div>
                          </div>
                          {errors.newPassword && (
                            <p className="mt-2 text-sm text-red-600">{errors.newPassword.message}</p>
                          )}
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                            {t('profilePage.confirmPassword')}
                          </label>
                          <div className="mt-1 relative rounded-md shadow-sm">
                            <input
                              {...register('confirmPassword', {
                                validate: value => !watch('newPassword') || value === watch('newPassword') || t('profilePage.passwordsMismatch')
                              })}
                              type="password"
                              className="block w-full rounded-md border-gray-300 pr-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition-colors"
                              placeholder="Confirm new password"
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <Key className="h-5 w-5 text-gray-400" />
                            </div>
                          </div>
                          {errors.confirmPassword && (
                            <p className="mt-2 text-sm text-red-600">{errors.confirmPassword.message}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-6">
                      <Button
                        type="submit"
                        disabled={loading}
                        className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-sm"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {t('profilePage.saving')}
                          </>
                        ) : t('profilePage.save')}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* Right Column - Account Settings */}
            <div className="lg:col-span-1">
              {/* Credits Management Card */}
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-amber-50">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2 text-yellow-600" /> {t('profilePage.creditsBilling')}
                  </h3>
                </div>
                <div className="p-6">
                  <p className="text-sm text-gray-600 mb-4">
                    {t('profilePage.creditsBody')}
                    </p>
                  <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-center text-yellow-700 font-medium text-sm">
                      {t('profilePage.creditsBadge')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate('/credits');
                    }}
                    className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white shadow-sm"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {t('profilePage.manageCredits')}
                  </Button>
                </div>
              </div>
              
              {/* LinkedIn Card */}
              <LinkedInConnection />
              
              {/* Account Status Card */}
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="p-6 border-b border-gray-200 bg-blue-50">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Shield className="w-5 h-5 mr-2 text-green-600" /> {t('profilePage.accountStatus')}
                  </h3>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700">{t('profilePage.status')}</h4>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user?.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {user?.is_active ? t('profilePage.active') : t('profilePage.inactive')}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700">{t('profilePage.accountType')}</h4>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user?.is_admin ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user?.is_admin ? t('profilePage.administrator') : t('profilePage.user')}
                    </span>
                  </div>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    {t('profilePage.deleteAccount')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
