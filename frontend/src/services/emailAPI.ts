import api from './axios';

export interface EmailAccount {
  id: number;
  email: string;
  display_name: string;
  provider_type: string;
  is_active: boolean;
  calendar_sync_enabled: boolean;
  auto_sync_calendar_events?: boolean;
  calendar_url?: string | null;
  last_sync_at: string;
  last_calendar_sync_at?: string | null;
  calendar_sync_error?: string | null;
  created_at: string;
}

export interface EmailMessage {
  id: number;
  subject: string;
  from_email?: string;
  from_address: string;
  from_name: string;
  to_emails?: string[] | string;
  to_address: string;
  body_text: string;
  body_html: string;
  status?: string;
  received_date: string;
  sent_date: string;
  is_read: boolean;
  is_important: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  folder_name: string;
  email_account_id: number;
  organization_id: number;
}

export interface SendEmailResult {
  message: string;
  transport?: string;
  sent?: boolean;
  persisted?: boolean;
  warning?: string | null;
}

export interface OutreachSendPayload {
  account_id: number;
  lead_ids: number[];
  subject: string;
  body: string;
  format: 'text' | 'html';
  delay_seconds?: number;
}

export interface OutreachSendResult {
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  results: Array<{
    lead_id: number;
    email?: string | null;
    status: 'sent' | 'failed' | 'skipped';
    reason?: string;
  }>;
}

const normalizeEmailMessage = (raw: any): EmailMessage => {
  const decodeMimeHeader = (input?: string): string => {
    if (!input || typeof input !== 'string' || !input.includes('=?')) return input || '';
    return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset, encoding, encodedText) => {
      try {
        let bytes: Uint8Array;
        if (String(encoding).toUpperCase() === 'B') {
          const bin = atob(encodedText);
          bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        } else {
          const qp = encodedText
            .replace(/_/g, ' ')
            .replace(/=([A-Fa-f0-9]{2})/g, (_: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          bytes = Uint8Array.from(qp, (c) => c.charCodeAt(0));
        }
        const decoder = new TextDecoder((charset || 'utf-8').toLowerCase());
        return decoder.decode(bytes);
      } catch {
        return encodedText;
      }
    });
  };

  const fromAddress = raw.from_address || raw.from_email || '';
  const fromName = decodeMimeHeader(raw.from_name || '') || fromAddress;
  const toAddress = decodeMimeHeader(raw.to_address || (Array.isArray(raw.to_emails) ? raw.to_emails.join(', ') : raw.to_emails || ''));
  const status = String(raw.status || '').toLowerCase();
  const isRead = typeof raw.is_read === 'boolean' ? raw.is_read : status === 'read';
  return {
    ...raw,
    subject: decodeMimeHeader(raw.subject || ''),
    from_address: fromAddress,
    from_name: fromName,
    to_address: toAddress,
    body_text: raw.body_text || '',
    body_html: raw.body_html || '',
    received_date: raw.received_date || raw.sent_date || new Date().toISOString(),
    sent_date: raw.sent_date || raw.received_date || new Date().toISOString(),
    is_read: isRead,
    is_important: Boolean(raw.is_important),
    is_starred: Boolean(raw.is_starred),
    has_attachments: Boolean(raw.has_attachments),
    folder_name: raw.folder_name || (raw.direction === 'outgoing' ? 'SENT' : 'INBOX'),
  };
};

export interface EmailFolder {
  name: string;
  count: number;
  unread: number;
}

export interface EmailAttachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  download_url: string;
}

export interface SendEmailData {
  account_id: number;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachments?: File[];
}

const parseRecipients = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export interface CreateEmailAccountData {
  email: string;
  password: string;
  provider_type: string;
  imap_server?: string;
  imap_port?: number;
  smtp_server?: string;
  smtp_port?: number;
  display_name?: string;
}

export interface EmailAccountSettings {
  calendar_sync_enabled: boolean;
  auto_sync_calendar_events: boolean;
  calendar_url?: string;
}

const emailAPI = {
  async initGoogleOAuth(): Promise<{ provider: string; authorization_url: string }> {
    const response = await api.post('/email/oauth/google/init');
    return response.data;
  },

  // Email Account Management
  async getAccounts(): Promise<EmailAccount[]> {
    const response = await api.get(`/email/accounts`);
    return response.data;
  },

  async createAccount(data: CreateEmailAccountData): Promise<EmailAccount> {
    const emailAddr = data.email.trim();
    const display_name =
      (data.display_name && data.display_name.trim()) || emailAddr.split('@')[0] || 'Mailbox';
    const provider = data.provider_type.toLowerCase();

    const body: {
      email: string;
      password: string;
      display_name: string;
      provider_type: string;
      custom_settings?: {
        imap: Record<string, unknown>;
        smtp: Record<string, unknown>;
      };
    } = {
      email: emailAddr,
      password: data.password,
      display_name,
      provider_type: provider,
    };

    if (
      provider === 'custom' ||
      data.imap_server ||
      data.smtp_server ||
      data.imap_port ||
      data.smtp_port
    ) {
      body.custom_settings = {
        imap: {
          imap_host: data.imap_server || '',
          imap_port: data.imap_port ?? 993,
          imap_use_ssl: true,
        },
        smtp: {
          smtp_host: data.smtp_server || '',
          smtp_port: data.smtp_port ?? 587,
          smtp_use_tls: true,
        },
      };
    }

    const response = await api.post(`/email/accounts`, body);
    return response.data;
  },

  async updateAccount(id: number, data: Partial<CreateEmailAccountData>): Promise<EmailAccount> {
    const response = await api.put(`/email/accounts/${id}`, data);
    return response.data;
  },

  async deleteAccount(id: number): Promise<void> {
    await api.delete(`/email/accounts/${id}`);
  },

  async testConnection(data: CreateEmailAccountData): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/email/accounts/test`, data);
    return response.data;
  },

  async syncAccount(id: number): Promise<{ message: string; status: string }> {
    const response = await api.post(`/email/accounts/${id}/sync`);
    return response.data;
  },

  // Email Management
  async getEmails(accountId: number, folder: string = 'inbox', page: number = 1, limit: number = 50): Promise<{
    emails: EmailMessage[];
    total: number;
    page: number;
    total_pages: number;
  }> {
    const params: Record<string, unknown> = { account_id: accountId, page, limit, folder: folder.toUpperCase() };
    // Keep direction only where it cannot conflict with explicit folder filters.
    if (folder === 'sent') params.direction = 'outgoing';
    else if (folder === 'inbox') params.direction = 'incoming';
    else if (folder === 'drafts') params.direction = 'outgoing';

    const response = await api.get(`/email/emails`, {
      params
    });
    const list = Array.isArray(response.data) ? response.data.map(normalizeEmailMessage) : [];
    return {
      emails: list,
      total: list.length,
      page,
      total_pages: 1,
    };
  },

  async getEmailById(emailId: number): Promise<EmailMessage> {
    const response = await api.get(`/email/emails/${emailId}`);
    return response.data;
  },

  async sendEmail(data: SendEmailData): Promise<SendEmailResult> {
    const payload = {
      account_id: data.account_id,
      to_emails: parseRecipients(data.to),
      cc_emails: parseRecipients(data.cc),
      bcc_emails: parseRecipients(data.bcc),
      subject: data.subject,
      body_text: data.body,
      body_html: data.body,
    };

    const response = await api.post(`/email/send`, payload);
    return response.data;
  },

  async sendOutreach(data: OutreachSendPayload): Promise<OutreachSendResult> {
    const response = await api.post(`/email/outreach`, data);
    return response.data;
  },

  async markAsRead(emailId: number): Promise<void> {
    await api.post(`/email/emails/${emailId}/mark-read`);
  },

  async markAsUnread(emailId: number): Promise<void> {
    await api.post(`/email/emails/${emailId}/mark-unread`);
  },

  async toggleStar(emailId: number): Promise<void> {
    // No backend star endpoint yet; noop so UI doesn't crash.
    return;
  },

  async deleteEmail(_emailId: number): Promise<void> {
    await api.patch(`/email/emails/${_emailId}/move`, { folder: 'TRASH' });
  },

  async moveToFolder(emailId: number, folder: string): Promise<void> {
    await api.patch(`/email/emails/${emailId}/move`, {
      folder
    });
  },

  async archiveEmail(emailId: number): Promise<void> {
    await api.patch(`/email/emails/${emailId}/archive`);
  },

  // Folders - Backend'te bu endpoint'ler yok, geçici olarak boş array döndür
  async getFolders(accountId: number): Promise<EmailFolder[]> {
    // Backend'te folders endpoint'i yok, geçici çözüm
    return [
      { name: 'inbox', count: 0, unread: 0 },
      { name: 'sent', count: 0, unread: 0 },
      { name: 'draft', count: 0, unread: 0 },
      { name: 'trash', count: 0, unread: 0 }
    ];
  },

  // Attachments - Backend'te bu endpoint'ler yok
  async getAttachments(accountId: number, emailId: number): Promise<EmailAttachment[]> {
    // Backend'te attachments endpoint'i yok, geçici çözüm
    return [];
  },

  async downloadAttachment(accountId: number, emailId: number, attachmentId: number): Promise<string> {
    // Backend'te download endpoint'i yok, geçici çözüm
    return `/emails/${emailId}/attachments/${attachmentId}/download`;
  },

  // Calendar Integration
  async syncCalendar(accountId: number): Promise<void> {
    await api.post(`/email/accounts/${accountId}/sync-calendar`);
  },

  async getCalendarSettings(accountId: number): Promise<EmailAccountSettings> {
    // Backend'te get calendar settings endpoint'i yok, geçici çözüm
    return {
      calendar_sync_enabled: false,
      auto_sync_calendar_events: false
    };
  },

  async updateCalendarSettings(accountId: number, settings: EmailAccountSettings): Promise<EmailAccountSettings> {
    const response = await api.post(`/email/accounts/${accountId}/calendar-settings`, settings);
    return response.data;
  },

  // Search - Backend'te search endpoint'i yok
  async searchEmails(accountId: number, query: string, folder?: string): Promise<EmailMessage[]> {
    // Backend'te search endpoint'i yok, geçici olarak normal email listesini döndür
    const response = await api.get(`/email/emails`, {
      params: { account_id: accountId, limit: 100 }
    });
    // Frontend'te filtreleme yapabiliriz
    return response.data.filter((email: EmailMessage) => 
      email.subject.toLowerCase().includes(query.toLowerCase()) ||
      email.body_text?.toLowerCase().includes(query.toLowerCase())
    );
  },

  // Real-time updates
  subscribeToEmailUpdates(accountId: number, callback: (email: EmailMessage) => void) {
    // This would typically use WebSocket or Server-Sent Events
    // For now, we'll implement polling in the component
    return () => {}; // Return unsubscribe function
  }
};

export default emailAPI;