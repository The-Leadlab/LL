import api from './axios';

export interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  layout: string;
  contentWidth: string;
  fixedHeader: boolean;
  fixSiderbar: boolean;
  colorWeak: boolean;
  darkMode: boolean;
}

export interface EmailSettings {
  smtp_server: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  sender_name: string;
  sender_email: string;
  footer_text?: string;
  signature?: string;
}

export interface OrganizationSettings {
  timezone: string;
  date_format: string;
  time_format: string;
  currency_id?: number;
  logo_url?: string;
  theme_settings?: ThemeSettings;
  email_settings?: EmailSettings;
  notification_settings?: {
    email: boolean;
    slack: boolean;
    webhook?: string;
  };
  default_lead_stage_id?: number;
  lead_auto_assignment: boolean;
  deal_approval_required: boolean;
  min_deal_amount?: number;
  max_deal_amount?: number;
  task_reminder_enabled: boolean;
  default_task_reminder_minutes: number;
  email_signature?: string;
  default_email_template_id?: number;
  analytics_enabled: boolean;
  custom_analytics_settings?: Record<string, any>;
}

export interface DashboardWidget {
  id: string;
  position: number;
  visible: boolean;
}

export interface UserSettings {
  theme_preference?: {
    mode: string;
    colorPrimary: string;
    colorSecondary: string;
    borderRadius: number;
    fontSize: string;
  };
  notification_preferences?: {
    email?: boolean;
    push?: boolean;
    leadAssigned?: boolean;
    dealUpdated?: boolean;
    taskDue?: boolean;
    taskAssigned?: boolean;
    meetingReminder?: boolean;
    systemUpdates?: boolean;
    messages?: boolean;
    mentions?: boolean;
  };
  dashboard_layout?: {
    widgets: DashboardWidget[];
    layout: string;
  };
  timezone?: string;
  language: string;
}

export const getOrganizationSettings = async () => {
  const response = await api.get('/settings/organization/');
  return response.data;
};

export const updateOrganizationSettings = async (data: Partial<OrganizationSettings>) => {
  const response = await api.put('/settings/organization/', data);
  return response.data;
};

export const getUserSettings = async () => {
  const response = await api.get('/settings/user');
  return response.data;
};

export const updateUserSettings = async (data: Partial<UserSettings>) => {
  const response = await api.put('/settings/user', data);
  return response.data;
};

export const uploadOrganizationLogo = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/settings/organization/logo/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export default {
  getOrganizationSettings,
  updateOrganizationSettings,
  getUserSettings,
  updateUserSettings,
  uploadOrganizationLogo,
};
