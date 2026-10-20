import api from '@/lib/axios';

export interface TeamInvitation {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'manager' | 'member' | 'viewer' | 'admin';
  organization_id: number;
  invited_by_id?: number;
  invited_by_name?: string;
  organization_name?: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  expires_at: string;
  message?: string;
  created_at: string;
  updated_at: string;
  existing_user?: boolean;
}

export interface InvitationCreateInput {
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
  message?: string;
}

export interface InvitationAcceptInput {
  password?: string;
  first_name?: string;
  last_name?: string;
}

// Team Invitation API endpoints
export const getInvitations = async (status?: string): Promise<TeamInvitation[]> => {
  const response = await api.get('/team-invitations', { params: status ? { status } : undefined });
  return response.data;
};

export const createInvitation = async (data: InvitationCreateInput): Promise<TeamInvitation> => {
  const response = await api.post('/team-invitations', data);
  return response.data;
};

export const resendInvitation = async (id: number): Promise<{ message: string }> => {
  const response = await api.post(`/team-invitations/${id}/resend`);
  return response.data;
};

export const cancelInvitation = async (id: number): Promise<{ message: string }> => {
  const response = await api.delete(`/team-invitations/${id}`);
  return response.data;
};

export const getInvitationByToken = async (token: string): Promise<TeamInvitation> => {
  const response = await api.get(`/team-invitations/token/${token}`);
  return response.data;
};

export const acceptInvitation = async (token: string, data: InvitationAcceptInput): Promise<{ message: string; user_id: number }> => {
  const response = await api.post(`/team-invitations/accept/${token}`, data);
  return response.data;
};

export const getStats = async (): Promise<Record<string, number>> => {
  const response = await api.get('/team-invitations/stats');
  return response.data;
};

export const teamInvitationsAPI = {
  getInvitations,
  createInvitation,
  resendInvitation,
  cancelInvitation,
  getInvitationByToken,
  acceptInvitation,
  getStats,
};

export default teamInvitationsAPI;