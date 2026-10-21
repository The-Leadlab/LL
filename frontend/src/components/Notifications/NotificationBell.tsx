import React, { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notificationsAPI } from '../../services/api/notifications'
import { Notification } from '../../types/notification'

interface NotificationBellProps {
  isCollapsed?: boolean
  /** Compact icon button for top header bars */
  variant?: 'sidebar' | 'header'
}

export function NotificationBell({
  isCollapsed = false,
  variant = 'sidebar',
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isHeader = variant === 'header'

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsAPI.getAll({ limit: 10 }),
    refetchInterval: 30000,
  })

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsAPI.getUnreadCount(),
    refetchInterval: 30000,
  })

  const markAsReadMutation = useMutation({
    mutationFn: notificationsAPI.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const unreadCount =
    typeof unreadData?.count === 'number'
      ? unreadData.count
      : notifications.filter((n: Notification) => !n.is_read).length

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id)
    }

    const url = notification.action_url || notification.link
    if (url) {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.location.href = url
      } else {
        navigate(url)
      }
    }

    setIsOpen(false)
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✅'
      case 'warning':
        return '⚠️'
      case 'error':
        return '❌'
      default:
        return 'ℹ️'
    }
  }

  return (
    <div className={`relative ${isHeader ? '' : 'w-full'}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        className={
          isHeader
            ? 'relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800'
            : `group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 text-gray-700 hover:bg-gray-50 ${
                isCollapsed ? 'justify-center' : ''
              } w-full`
        }
        title={isCollapsed || isHeader ? 'Notifications' : undefined}
      >
        <div className="relative">
          <Bell
            className={
              isHeader
                ? 'h-5 w-5 text-neutral-700 dark:text-neutral-200'
                : 'flex-shrink-0 w-5 h-5 text-gray-400'
            }
          />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold leading-none text-white bg-red-600 min-w-[18px] h-[18px]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        {!isCollapsed && !isHeader && <span className="ml-3">Notifications</span>}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={`absolute ${
              isHeader
                ? 'right-0 top-full mt-1'
                : isCollapsed
                  ? 'left-full ml-2 top-0'
                  : 'left-0 top-full mt-1'
            } w-80 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-gray-200 dark:border-neutral-700 z-50 max-h-96 overflow-hidden`}
          >
            <div className="p-3 border-b border-gray-200 dark:border-neutral-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-50">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <p className="text-xs text-gray-500 mt-1">{unreadCount} unread</p>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                  <p className="mt-2 text-sm">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {notifications.map((notification: Notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-3 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors ${
                        !notification.is_read ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <span className="text-lg flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type || 'info')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm ${
                              !notification.is_read
                                ? 'font-medium text-gray-900 dark:text-neutral-50'
                                : 'text-gray-700 dark:text-neutral-300'
                            }`}
                          >
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(notification.created_at).toLocaleDateString(undefined, {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-3 border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false)
                    navigate('/notifications')
                  }}
                  className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View all notifications
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
