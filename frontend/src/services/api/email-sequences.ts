/**
 * Email Sequences API Service
 */

import api from '@/lib/axios';

export interface SequenceStep {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
  template_id?: number;
}

export interface EmailSequence {
  id: number;
  name: string;
  description?: string;
  organization_id: number;
  is_active: boolean;
  steps: SequenceStep[];
  email_account_id?: number | null;
  settings?: Record<string, unknown> | null;
  total_enrolled: number;
  total_completed: number;
  total_replied: number;
  created_at: string;
  created_by_id?: number;
}

export interface SequenceEnrollment {
  id: number;
  sequence_id: number;
  lead_id: number;
  current_step: number;
  status: 'active' | 'completed' | 'paused' | 'replied';
  enrolled_at: string;
  completed_at?: string;
}

export interface SequenceStats {
  id: number;
  name: string;
  total_enrolled: number;
  total_completed: number;
  total_replied: number;
  active_enrollments: number;
  completion_rate: number;
  reply_rate: number;
  avg_days_to_complete?: number;
}

export interface CreateSequenceRequest {
  name: string;
  description?: string;
  is_active: boolean;
  steps: SequenceStep[];
  email_account_id?: number | null;
  settings?: Record<string, unknown> | null;
}

export const emailSequencesAPI = {
  // List all sequences
  getAll: async (is_active?: boolean): Promise<EmailSequence[]> => {
    const params = is_active !== undefined ? { is_active } : {};
    const response = await api.get('/email-sequences', { params });
    return response.data;
  },

  // Get sequence by ID
  getById: async (id: number): Promise<EmailSequence> => {
    const response = await api.get(`/email-sequences/${id}`);
    return response.data;
  },

  // Get all sequence stats
  getStats: async (): Promise<SequenceStats[]> => {
    const response = await api.get('/email-sequences/stats');
    return response.data;
  },

  // Get stats for specific sequence
  getSequenceStats: async (id: number): Promise<SequenceStats> => {
    const response = await api.get(`/email-sequences/${id}/stats`);
    return response.data;
  },

  // Create sequence
  create: async (data: CreateSequenceRequest): Promise<EmailSequence> => {
    const response = await api.post('/email-sequences', data);
    return response.data;
  },

  // Update sequence
  update: async (id: number, data: Partial<CreateSequenceRequest>): Promise<EmailSequence> => {
    const response = await api.put(`/email-sequences/${id}`, data);
    return response.data;
  },

  // Delete sequence
  delete: async (id: number): Promise<void> => {
    await api.delete(`/email-sequences/${id}`);
  },

  // Get sequence enrollments
  getEnrollments: async (
    sequenceId: number,
    status?: string,
    skip?: number,
    limit?: number
  ): Promise<SequenceEnrollment[]> => {
    const params: any = {};
    if (status) params.status = status;
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;

    const response = await api.get(`/email-sequences/${sequenceId}/enrollments`, { params });
    return response.data;
  },

  // Enroll lead in sequence
  enrollLead: async (sequenceId: number, leadId: number): Promise<SequenceEnrollment> => {
    const response = await api.post(`/email-sequences/${sequenceId}/enroll`, {
      lead_id: leadId
    });
    return response.data;
  },

  // Bulk enroll leads
  bulkEnroll: async (sequenceId: number, leadIds: number[]): Promise<any> => {
    const response = await api.post('/email-sequences/enroll/bulk', {
      sequence_id: sequenceId,
      lead_ids: leadIds
    });
    return response.data;
  },

  // Pause enrollment
  pauseEnrollment: async (enrollmentId: number): Promise<SequenceEnrollment> => {
    const response = await api.post(`/email-sequences/enrollments/${enrollmentId}/pause`);
    return response.data;
  },

  // Resume enrollment
  resumeEnrollment: async (enrollmentId: number): Promise<SequenceEnrollment> => {
    const response = await api.post(`/email-sequences/enrollments/${enrollmentId}/resume`);
    return response.data;
  },

  // Complete enrollment
  completeEnrollment: async (enrollmentId: number): Promise<SequenceEnrollment> => {
    const response = await api.post(`/email-sequences/enrollments/${enrollmentId}/complete`);
    return response.data;
  },

  // Remove enrollment
  removeEnrollment: async (enrollmentId: number): Promise<void> => {
    await api.delete(`/email-sequences/enrollments/${enrollmentId}`);
  }
};
