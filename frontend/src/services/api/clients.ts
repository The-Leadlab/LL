import api from '../axios';

export interface Client {
  id: number;
  organization_id: number;
  name: string;
  is_default: boolean;
  is_archived: boolean;
  created_by?: number | null;
  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  created_at: string;
  updated_at?: string | null;
  lead_count?: number | null;
}

export interface ClientList {
  items: Client[];
  total: number;
}

export const clientsAPI = {
  list: async (includeArchived = false): Promise<ClientList> => {
    const response = await api.get('/clients/', {
      params: { include_archived: includeArchived },
    });
    return response.data;
  },

  create: async (name: string): Promise<Client> => {
    const response = await api.post('/clients/', { name });
    return response.data;
  },

  rename: async (id: number, name: string): Promise<Client> => {
    const response = await api.patch(`/clients/${id}`, { name });
    return response.data;
  },

  archive: async (id: number): Promise<Client> => {
    const response = await api.post(`/clients/${id}/archive`);
    return response.data;
  },

  restore: async (id: number): Promise<Client> => {
    const response = await api.post(`/clients/${id}/restore`);
    return response.data;
  },

  /** Admin-only: assign list to a member (null = shared with org). */
  assign: async (id: number, assignedUserId: number | null): Promise<Client> => {
    const response = await api.post(`/clients/${id}/assign`, {
      assigned_user_id: assignedUserId,
    });
    return response.data;
  },

  /** Permanently delete client and soft-delete all its leads (admin only). */
  delete: async (
    id: number
  ): Promise<{
    status: string;
    message: string;
    client_id: number;
    client_name: string;
    deleted_leads: number;
  }> => {
    const response = await api.delete(`/clients/${id}`);
    return response.data;
  },

  /** Non-admin: email org admins to request permanent deletion. */
  requestDelete: async (
    id: number
  ): Promise<{
    status: string;
    message: string;
    client_id: number;
    client_name: string;
    admins_notified: number;
  }> => {
    const response = await api.post(`/clients/${id}/request-delete`);
    return response.data;
  },
};

export default clientsAPI;
