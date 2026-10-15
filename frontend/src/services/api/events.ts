import { AxiosInstance } from 'axios';
import api from '../axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';

export interface Event {
  id: number;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  start?: string | Date;  // Alternative field names that might be present in responses
  end?: string | Date;    // Alternative field names that might be present in responses
  location?: string;
  event_type: string;
  is_all_day: boolean;
  allDay?: boolean;       // Alternative field name for is_all_day
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  organization_id: number;
  created_by?: number;  // Optional as it might be set on the server-side
  created_at?: string;
  updated_at?: string;
  timezone: string;
}

export interface EventResponse {
  items: Event[];
  total: number;
}

export interface EventCreateInput {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  location: string;
  event_type: string;
  is_all_day: boolean;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  organization_id: number;
  user_id?: number;   // This is used to assign the event to a user
  created_by?: number; // Explicitly passed created_by field
  timezone: string;
}

export interface EventUpdateInput {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  event_type?: string;
  is_all_day?: boolean;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  organization_id?: number;
  user_id?: number;
  timezone?: string;
}

export interface EventListParams {
  start_date?: string;
  end_date?: string;
  timezone?: string;
}

export interface TimezonesResponse {
  timezones: string[];
  system_timezone: string | null;
}

export interface EventListResponse {
  items: Event[];
  total: number;
  skip: number;
  limit: number;
}

const eventsAPI = {
  // Create a new event
  create: async (eventData: EventCreateInput): Promise<Event> => {
    try {
      // Create a clean data model that aligns with the backend expectations
      const cleanData: Record<string, any> = {
        title: eventData.title,
        description: eventData.description || '',
        start_date: eventData.start_date,
        end_date: eventData.end_date,
        location: eventData.location || '',
        event_type: eventData.event_type,
        is_all_day: eventData.is_all_day,
        status: eventData.status,
        organization_id: eventData.organization_id,
        timezone: eventData.timezone
      };
      
      // Handle created_by field - critical for the backend
      if (eventData.created_by) {
        cleanData.created_by = eventData.created_by;
      } else if (eventData.user_id) {
        cleanData.created_by = eventData.user_id;
      } else {
        // Get user ID from the live auth store (persisted storage does not keep the user)
        try {
          const liveUser = useAuthStore.getState().user;
          const authStore = JSON.parse(localStorage.getItem('auth-storage') || '{}');
          const user = liveUser?.id ? liveUser : authStore?.state?.user;
          
          if (user && user.id) {
            cleanData.created_by = user.id;
            console.log('Using user ID from auth store:', user.id);
          } else {
            // Fallback to direct localStorage check
            const token = localStorage.getItem('token');
            if (!token) {
              throw new Error('User ID is required to create an event. Please log in.');
            }
            
            // Try to fetch user info from token
            throw new Error('User ID is required to create an event. Please log in again.');
          }
        } catch (e) {
          console.error('Error extracting user info:', e);
          throw new Error('User ID is required to create an event. Please log in again.');
        }
      }
      
      // Final validation before API call
      if (!cleanData.created_by) {
        console.error('Fatal error: created_by is not set after all attempts');
        throw new Error('User ID is required to create an event');
      }
      
      // Debug logging
      console.log('Creating event with data:', cleanData);
      
      // Remove trailing slash from URL and explicitly set created_by in POST body
      const response = await api.post('/events', {
        ...cleanData,
        created_by: cleanData.created_by // Ensure created_by is set in the request body
      });
      return response.data;
    } catch (error: any) {
      if (error.message === 'Network Error') {
        console.error('Network error creating event - possible CORS issue:', error);
        console.error('Check that your backend CORS configuration allows requests from your frontend origin');
      } else {
        console.error('Error creating event:', error);
        // Add more detailed error information if available
        if (error.response) {
          console.error('Server responded with error:', error.response.status, error.response.data);
        }
      }
      throw error;
    }
  },

  // Update an existing event
  update: async (eventId: number, eventData: EventUpdateInput) => {
    try {
      // Create a clean data model that aligns with the backend expectations
      const cleanData: Record<string, any> = {};
      
      // Only add specified fields to the clean data
      if (eventData.title !== undefined) cleanData.title = eventData.title;
      if (eventData.description !== undefined) cleanData.description = eventData.description;
      if (eventData.start_date !== undefined) cleanData.start_date = eventData.start_date;
      if (eventData.end_date !== undefined) cleanData.end_date = eventData.end_date;
      if (eventData.location !== undefined) cleanData.location = eventData.location;
      if (eventData.event_type !== undefined) cleanData.event_type = eventData.event_type;
      if (eventData.is_all_day !== undefined) cleanData.is_all_day = eventData.is_all_day;
      if (eventData.status !== undefined) cleanData.status = eventData.status;
      if (eventData.organization_id !== undefined) cleanData.organization_id = eventData.organization_id;
      if (eventData.timezone !== undefined) cleanData.timezone = eventData.timezone;
      
      // Handle created_by field correctly
      if (eventData.user_id !== undefined) {
        cleanData.created_by = eventData.user_id;
      }
      
      console.log('Updating event with id', eventId, 'using CLEAN data:', cleanData);
      const response = await api.put(`/events/${eventId}`, cleanData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating event:', error);
      if (error.response) {
        console.error('Server responded with error:', error.response.status, error.response.data);
      }
      throw error;
    }
  },

  // Get a list of events
  list: async (params: EventListParams = {}) => {
    try {
      console.log('Fetching events with params:', params);
      const response = await api.get('/events', { params });
      const data = response.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      return [];
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  },

  // Get a single event by ID
  get: async (id: number) => {
    try {
      const response = await api.get(`/events/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching event:', error);
      throw error;
    }
  },

  // Delete an event
  remove: async (id: number) => {
    try {
      const response = await api.delete(`/events/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  },

  // Get available timezones
  getTimezones: async () => {
    try {
      const response = await api.get('/events/timezones');
      return response.data;
    } catch (error) {
      console.error('Error fetching timezones:', error);
      throw error;
    }
  }
};

export default eventsAPI;
