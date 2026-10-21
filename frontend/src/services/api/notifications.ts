import api from '@/lib/axios';

export interface Notification {
  id: number;
  title: string;
  message: string;
  link?: string;
  action_url?: string;
  is_read: boolean;
  created_at: string;
  user_id: number;
  type?: string;
  priority?: string;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  page: number;
  size: number;
  has_more: boolean;
}

export const notificationsAPI = {
  getUnreadCount: async (): Promise<{ count: number }> => {
    try {
      const response = await api.get<{ count: number }>('/notifications/unread-count');
      return response.data ?? { count: 0 };
    } catch (error: any) {
      console.error('Error fetching unread count:', error);
      return { count: 0 };
    }
  },

  getAll: async (params?: { 
    unread_only?: boolean;
    page?: number;
    limit?: number;
  }): Promise<Notification[]> => {
    try {
      const response = await api.get<Notification[]>('/notifications', { params });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch notifications');
    }
  },

  getNotifications: async ({ unread_only = false } = {}): Promise<Notification[]> => {
    try {
      const response = await api.get<Notification[]>('/notifications', {
        params: { unread_only }
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  },

  markAsRead: async (notificationId: number): Promise<void> => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
      throw new Error(error.response?.data?.detail || 'Failed to mark notification as read');
    }
  },

  markAllAsRead: async (): Promise<void> => {
    try {
      await api.put('/notifications/read-all');
    } catch (error: any) {
      console.error('Error marking all notifications as read:', error);
      throw new Error(error.response?.data?.detail || 'Failed to mark all notifications as read');
    }
  },

  delete: async (notificationId: number): Promise<void> => {
    try {
      await api.delete(`/notifications/${notificationId}`);
    } catch (error: any) {
      console.error('Error deleting notification:', error);
      throw new Error(error.response?.data?.detail || 'Failed to delete notification');
    }
  },

  createTest: async (): Promise<void> => {
    try {
      await api.post('/notifications/test');
    } catch (error: any) {
      console.error('Error creating test notification:', error);
      throw new Error(error.response?.data?.detail || 'Failed to create test notification');
    }
  }
};
