/**
 * Outreach Platform API — connections, scenarios, runs, templates, AI rewrite.
 */

import api from '@/lib/axios';

export type ConnectionType = 'google_sheets' | 'webhook' | 'ai' | 'gmail_link';

export type ScenarioModuleType =
  | 'trigger_manual'
  | 'wait'
  | 'router_has_email'
  | 'send_email'
  | 'ai_rewrite'
  | 'update_lead'
  | 'stop_on_reply'
  | 'ab_subject';

export interface ScenarioModule {
  id: string;
  type: ScenarioModuleType;
  config: Record<string, unknown>;
}

export interface FlowDefinition {
  modules: ScenarioModule[];
}

export interface OutreachConnection {
  id: number;
  organization_id: number;
  user_id: number;
  type: ConnectionType | string;
  display_name: string;
  config?: Record<string, unknown> | null;
  status: string;
  last_error?: string | null;
  public_token?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface OutreachScenario {
  id: number;
  organization_id: number;
  name: string;
  description?: string | null;
  status: 'draft' | 'active' | 'paused' | string;
  flow_definition: FlowDefinition;
  schedule_config?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  created_by_id?: number | null;
  created_at: string;
  updated_at?: string | null;
}

export interface OutreachRunStep {
  id: number;
  run_id: number;
  node_id: string;
  lead_id?: number | null;
  status: string;
  scheduled_at: string;
  executed_at?: string | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  created_at: string;
}

export interface OutreachRun {
  id: number;
  scenario_id: number;
  organization_id: number;
  trigger_type: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  stats?: Record<string, unknown> | null;
  created_by_id?: number | null;
  scenario?: Pick<OutreachScenario, 'id' | 'name' | 'status'>;
  steps?: OutreachRunStep[];
}

export interface OutreachTemplate {
  id: number;
  organization_id: number;
  name: string;
  subject: string;
  body: string;
  format: 'text' | 'html' | string;
  ab_subjects?: string[] | null;
  created_by_id?: number | null;
  created_at: string;
  updated_at?: string | null;
}

export interface CreateConnectionPayload {
  type: ConnectionType | string;
  display_name: string;
  config?: Record<string, unknown>;
  access_token?: string;
}

export interface SheetsImportPayload {
  spreadsheet_id?: string;
  range?: string;
  header_row?: number;
  mapping?: Record<string, string>;
  pasted_values?: string;
}

export interface GoogleSheetsStatus {
  connected: boolean;
  has_sheets_scope: boolean;
  email?: string | null;
  can_write_sheets?: boolean;
  connection_id?: number | null;
  spreadsheet_id?: string | null;
}

export interface GoogleSpreadsheetFile {
  id: string;
  name?: string | null;
  modified_time?: string | null;
}

export interface GoogleSpreadsheetsResponse extends GoogleSheetsStatus {
  files: GoogleSpreadsheetFile[];
  drive_error?: string | null;
}

export interface LeadsFromTextResult {
  imported: number;
  skipped: number;
  updated?: number;
  lead_ids: number[];
  ready_ids?: number[];
  already_sent?: number;
}

export interface LeadImportPreview {
  headers: string[];
  mapping: Record<string, string>;
  unmapped: string[];
  sample: Array<Record<string, string>>;
  total_rows: number;
  has_email: boolean;
  has_status?: boolean;
  sent_count?: number;
  ready_count?: number;
  fields?: string[];
}

export interface CreateScenarioPayload {
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  flow_definition?: FlowDefinition;
  schedule_config?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface RunScenarioPayload {
  lead_ids: number[];
  account_id?: number;
}

export interface RewritePayload {
  subject: string;
  body: string;
  instruction: string;
  lead?: Record<string, unknown>;
}

export interface RewriteResult {
  subject: string;
  body: string;
}

export interface OutreachJobItem {
  id: number;
  batch_id: string;
  lead_id: number;
  account_id: number;
  status: string;
  scheduled_at?: string | null;
  sent_at?: string | null;
  last_error?: string | null;
  subject?: string | null;
}

export interface OutreachJobsResponse {
  total: number;
  items: OutreachJobItem[];
}

export const outreachAPI = {
  // Connections
  listConnections: async (): Promise<OutreachConnection[]> => {
    const response = await api.get('/outreach/connections');
    return response.data;
  },

  createConnection: async (data: CreateConnectionPayload): Promise<OutreachConnection> => {
    const response = await api.post('/outreach/connections', data);
    return response.data;
  },

  updateConnection: async (
    id: number,
    data: Partial<CreateConnectionPayload>,
  ): Promise<OutreachConnection> => {
    const response = await api.patch(`/outreach/connections/${id}`, data);
    return response.data;
  },

  deleteConnection: async (id: number): Promise<void> => {
    await api.delete(`/outreach/connections/${id}`);
  },

  importSheets: async (
    connectionId: number,
    data: SheetsImportPayload,
  ): Promise<LeadsFromTextResult> => {
    const response = await api.post(`/outreach/connections/${connectionId}/sheets/import`, data);
    return response.data;
  },

  previewLeads: async (data: {
    text?: string;
    spreadsheet_id?: string;
    range?: string;
    header_row?: number;
    mapping?: Record<string, string>;
  }): Promise<LeadImportPreview> => {
    const response = await api.post('/outreach/leads/preview', data);
    return response.data;
  },

  importGoogleSheet: async (data: SheetsImportPayload & { client_id?: number }): Promise<LeadsFromTextResult> => {
    const response = await api.post('/outreach/google/sheets/import', data);
    return response.data;
  },

  googleStatus: async (): Promise<GoogleSheetsStatus> => {
    const response = await api.get('/outreach/google/status');
    return response.data;
  },

  listSpreadsheets: async (): Promise<GoogleSpreadsheetsResponse> => {
    const response = await api.get('/outreach/google/spreadsheets');
    return response.data;
  },

  listSpreadsheetTabs: async (
    spreadsheetId: string,
  ): Promise<{ spreadsheet_id: string; tabs: Array<{ title: string; sheet_id?: number }> }> => {
    const response = await api.get(
      `/outreach/google/spreadsheets/${encodeURIComponent(spreadsheetId)}/tabs`,
    );
    return response.data;
  },

  importLeadsFromText: async (
    text: string,
    source = 'outreach_paste',
    extra?: { mapping?: Record<string, string>; client_id?: number; header_row?: number },
  ): Promise<LeadsFromTextResult> => {
    const response = await api.post('/outreach/leads/from-text', { text, source, ...(extra || {}) });
    return response.data;
  },

  // Scenarios
  listScenarios: async (): Promise<OutreachScenario[]> => {
    const response = await api.get('/outreach/scenarios');
    return response.data;
  },

  getScenario: async (id: number): Promise<OutreachScenario> => {
    const response = await api.get(`/outreach/scenarios/${id}`);
    return response.data;
  },

  createScenario: async (data: CreateScenarioPayload): Promise<OutreachScenario> => {
    const response = await api.post('/outreach/scenarios', data);
    return response.data;
  },

  seedDemoScenario: async (): Promise<OutreachScenario> => {
    const response = await api.post('/outreach/scenarios/seed-demo');
    return response.data;
  },

  updateScenario: async (
    id: number,
    data: Partial<CreateScenarioPayload>,
  ): Promise<OutreachScenario> => {
    const response = await api.patch(`/outreach/scenarios/${id}`, data);
    return response.data;
  },

  deleteScenario: async (id: number): Promise<void> => {
    await api.delete(`/outreach/scenarios/${id}`);
  },

  runScenario: async (id: number, data: RunScenarioPayload): Promise<OutreachRun> => {
    const response = await api.post(`/outreach/scenarios/${id}/run`, data);
    return response.data;
  },

  // Runs
  listRuns: async (params?: { skip?: number; limit?: number; status?: string }): Promise<OutreachRun[]> => {
    const response = await api.get('/outreach/runs', { params });
    return response.data;
  },

  getRun: async (id: number): Promise<OutreachRun> => {
    const response = await api.get(`/outreach/runs/${id}`);
    return response.data;
  },

  // Templates
  listTemplates: async (): Promise<OutreachTemplate[]> => {
    const response = await api.get('/outreach/templates');
    return response.data;
  },

  createTemplate: async (
    data: Omit<OutreachTemplate, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'created_by_id'>,
  ): Promise<OutreachTemplate> => {
    const response = await api.post('/outreach/templates', data);
    return response.data;
  },

  updateTemplate: async (
    id: number,
    data: Partial<Omit<OutreachTemplate, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>,
  ): Promise<OutreachTemplate> => {
    const response = await api.patch(`/outreach/templates/${id}`, data);
    return response.data;
  },

  deleteTemplate: async (id: number): Promise<void> => {
    await api.delete(`/outreach/templates/${id}`);
  },

  // AI rewrite
  rewrite: async (data: RewritePayload): Promise<RewriteResult> => {
    const response = await api.post('/outreach/ai/rewrite', data);
    return response.data;
  },

  processNow: async (limit = 25): Promise<Record<string, unknown>> => {
    const response = await api.post('/outreach/worker/process-now', null, { params: { limit } });
    return response.data;
  },

  // Jobs (also on emailAPI)
  listJobs: async (params?: {
    batch_id?: string;
    status?: string;
    skip?: number;
    limit?: number;
  }): Promise<OutreachJobsResponse> => {
    const response = await api.get('/outreach/jobs', { params });
    return response.data;
  },
};

export default outreachAPI;
