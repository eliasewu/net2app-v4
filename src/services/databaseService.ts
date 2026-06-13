// ============================================================
// NET2APP HUB - DATABASE SERVICE
// All data operations go through this service to PostgreSQL
// Falls back to localStorage when backend is unavailable
// ============================================================

// API base URL - in dev mode, Vite proxy forwards /api to backend
const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function apiFetch<T>(endpoint: string, method = 'GET', body?: any): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = getToken();
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API_BASE + endpoint, opts);
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error || json.message || 'Request failed' };
    return { success: true, data: json.data };
  } catch (e: any) {
    return { success: false, error: e.message || 'Network error' };
  }
}

// ==================== GENERIC CRUD WRAPPER ====================
// All tables that follow the pattern: GET list, POST create, PUT update, DELETE
async function getAll<T>(table: string): Promise<T[]> {
  const res = await apiFetch<T[]>(`/${table}`);
  return res.success && res.data ? res.data : [];
}
async function getById<T>(table: string, id: string): Promise<T | null> {
  const res = await apiFetch<T>(`/${table}/${id}`);
  return res.success && res.data ? res.data as T : null;
}
async function create<T>(table: string, data: any): Promise<T | null> {
  const res = await apiFetch<T>(`/${table}`, 'POST', data);
  return res.success && res.data ? res.data as T : null;
}
async function update<T>(table: string, id: string, data: any): Promise<boolean> {
  const res = await apiFetch<T>(`/${table}/${id}`, 'PUT', data);
  return res.success;
}
async function remove(table: string, id: string): Promise<boolean> {
  const res = await apiFetch(`${table}/${id}`, 'DELETE');
  return res.success;
}

// ==================== LOCALSTORAGE FALLBACK ====================
function loadLocal<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch {}
  return fallback;
}
function saveLocal(key: string, data: any) { localStorage.setItem(key, JSON.stringify(data)); }

// ==================== EXPORTED SERVICE ====================
export const dbService = {
  // ==================== CLIENTS ====================
  async getClients(): Promise<ClientRow[]> {
    const api = await getAll<ClientRow>('clients');
    if (api.length > 0) { saveLocal('clients_db', api); return api; }
    return loadLocal<ClientRow[]>('clients_db', []);
  },
  async getClient(id: string): Promise<ClientRow | null> {
    return getById<ClientRow>('clients', id);
  },
  async createClient(data: Omit<ClientRow, 'id' | 'created_at' | 'updated_at'>): Promise<ClientRow | null> {
    return create<ClientRow>('clients', data);
  },
  async updateClient(id: string, data: any): Promise<boolean> {
    return update('clients', id, data);
  },
  async deleteClient(id: string): Promise<boolean> {
    return remove('clients', id);
  },

  // ==================== SUPPLIERS ====================
  async getSuppliers(): Promise<SupplierRow[]> {
    const api = await getAll<SupplierRow>('suppliers');
    if (api.length > 0) { saveLocal('suppliers_db', api); return api; }
    return loadLocal<SupplierRow[]>('suppliers_db', []);
  },
  async getSupplier(id: string): Promise<SupplierRow | null> {
    return getById<SupplierRow>('suppliers', id);
  },
  async createSupplier(data: any): Promise<SupplierRow | null> {
    return create<SupplierRow>('suppliers', data);
  },
  async updateSupplier(id: string, data: any): Promise<boolean> {
    return update('suppliers', id, data);
  },
  async deleteSupplier(id: string): Promise<boolean> {
    return remove('suppliers', id);
  },

  // ==================== TRUNKS ====================
  async getTrunks(): Promise<any[]> {
    const api = await getAll('trunks');
    if (api.length > 0) { saveLocal('trunks_db', api); return api; }
    return loadLocal<any[]>('trunks_db', []);
  },
  async createTrunk(data: any): Promise<any | null> { return create('trunks', data); },
  async updateTrunk(id: string, data: any): Promise<boolean> { return update('trunks', id, data); },
  async deleteTrunk(id: string): Promise<boolean> { return remove('trunks', id); },

  // ==================== ROUTES ====================
  async getRoutes(): Promise<any[]> {
    const api = await getAll('routes');
    if (api.length > 0) { saveLocal('routes_db', api); return api; }
    return loadLocal<any[]>('routes_db', []);
  },
  async createRoute(data: any): Promise<any | null> { return create('routes', data); },
  async updateRoute(id: string, data: any): Promise<boolean> { return update('routes', id, data); },
  async deleteRoute(id: string): Promise<boolean> { return remove('routes', id); },

  // ==================== ROUTE PLANS ====================
  async getRoutePlans(): Promise<any[]> {
    const api = await getAll('route_plans');
    if (api.length > 0) { saveLocal('route_plans_db', api); return api; }
    return loadLocal<any[]>('route_plans_db', []);
  },
  async createRoutePlan(data: any): Promise<any | null> { return create('route_plans', data); },
  async updateRoutePlan(id: string, data: any): Promise<boolean> { return update('route_plans', id, data); },
  async deleteRoutePlan(id: string): Promise<boolean> { return remove('route_plans', id); },

  // ==================== RATES ====================
  async getRates(): Promise<any[]> {
    const api = await getAll('rates');
    if (api.length > 0) { saveLocal('rates_db', api); return api; }
    return loadLocal<any[]>('rates_db', []);
  },
  async createRate(data: any): Promise<any | null> { return create('rates', data); },
  async updateRate(id: string, data: any): Promise<boolean> { return update('rates', id, data); },
  async deleteRate(id: string): Promise<boolean> { return remove('rates', id); },

  // ==================== MCCMNC ====================
  async getMCCMNC(): Promise<any[]> {
    const api = await getAll('mccmnc');
    if (api.length > 0) { saveLocal('mccmnc_db', api); return api; }
    return loadLocal<any[]>('mccmnc_db', []);
  },
  async createMCCMNC(data: any): Promise<any | null> { return create('mccmnc', data); },
  async updateMCCMNC(id: string, data: any): Promise<boolean> { return update('mccmnc', id, data); },
  async deleteMCCMNC(id: string): Promise<boolean> { return remove('mccmnc', id); },

  // ==================== SMS LOGS ====================
  async getSMSLogs(): Promise<any[]> {
    const res = await apiFetch<any>('/sms/logs', 'POST', { limit: 500, offset: 0 });
    if (res.success && res.data) {
      const logs = Array.isArray(res.data) ? res.data : [];
      if (logs.length > 0) { saveLocal('sms_logs_db', logs); return logs; }
    }
    return loadLocal<any[]>('sms_logs_db', []);
  },

  // ==================== INVOICES ====================
  async getInvoices(): Promise<any[]> {
    const api = await getAll('invoices');
    if (api.length > 0) { saveLocal('invoices_db', api); return api; }
    return loadLocal<any[]>('invoices_db', []);
  },
  async createInvoice(data: any): Promise<any | null> { return create('invoices', data); },
  async updateInvoice(id: string, data: any): Promise<boolean> { return update('invoices', id, data); },

  // ==================== PAYMENTS ====================
  async getPayments(): Promise<any[]> {
    const api = await getAll('payments');
    if (api.length > 0) { saveLocal('payments_db', api); return api; }
    return loadLocal<any[]>('payments_db', []);
  },
  async createPayment(data: any): Promise<any | null> { return create('payments', data); },

  // ==================== SMS LOGS (write) ====================
  async createSMSLog(data: any): Promise<any | null> {
    return create('sms_logs', data);
  },

  // ==================== OTT DEVICES ====================
  async getOTTDevices(): Promise<any[]> {
    const api = await getAll('ott_devices');
    if (api.length > 0) { saveLocal('ott_devices_db', api); return api; }
    return loadLocal<any[]>('ott_devices_db', []);
  },
  async createOTTDevice(data: any): Promise<any | null> { return create('ott_devices', data); },
  async updateOTTDevice(id: string, data: any): Promise<boolean> { return update('ott_devices', id, data); },
  async deleteOTTDevice(id: string): Promise<boolean> { return remove('ott_devices', id); },

  // ==================== NOTIFICATIONS ====================
  async getNotifications(): Promise<any[]> {
    const api = await getAll('notifications');
    if (api.length > 0) { saveLocal('notifications_db', api); return api; }
    return loadLocal<any[]>('notifications_db', []);
  },
  async markNotificationRead(id: string): Promise<boolean> {
    const res = await apiFetch(`/notifications/${id}`, 'PUT', { is_read: true });
    return res.success;
  },

  // ==================== CAMPAIGNS ====================
  async getCampaigns(): Promise<any[]> {
    const api = await getAll('campaigns');
    if (api.length > 0) { saveLocal('campaigns_db', api); return api; }
    return loadLocal<any[]>('campaigns_db', []);
  },
  async createCampaign(data: any): Promise<any | null> { return create('campaigns', data); },
  async updateCampaign(id: string, data: any): Promise<boolean> { return update('campaigns', id, data); },
  async deleteCampaign(id: string): Promise<boolean> { return remove('campaigns', id); },

  // ==================== TRANSLATIONS ====================
  async getTranslations(): Promise<any[]> {
    const api = await getAll('translations');
    if (api.length > 0) { saveLocal('translations_db', api); return api; }
    return loadLocal<any[]>('translations_db', []);
  },
  async createTranslation(data: any): Promise<any | null> { return create('translations', data); },
  async updateTranslation(id: string, data: any): Promise<boolean> { return update('translations', id, data); },
  async deleteTranslation(id: string): Promise<boolean> { return remove('translations', id); },

  // ==================== PLATFORM SETTINGS ====================
  async getPlatformSettings(): Promise<Record<string, string>> {
    const api = await getAll<any>('platform_settings');
    if (api.length > 0) {
      const settings: Record<string, string> = {};
      api.forEach((s: any) => { if (s.key) settings[s.key] = s.value; });
      saveLocal('platform_settings_db', settings);
      return settings;
    }
    return loadLocal<Record<string, string>>('platform_settings_db', { platform_name: 'NET2APP Hub', currency: 'EUR' });
  },
  async updatePlatformSetting(key: string, value: string): Promise<boolean> {
    // Try to update existing or create new
    const res = await apiFetch('/platform_settings', 'POST', { key, value });
    return res.success;
  },

  // ==================== SMTP CONFIG ====================
  async getSMTPConfig(): Promise<any> {
    const api = await getAll<any>('smtp_config');
    if (api.length > 0) { saveLocal('smtp_config_db', api[0]); return api[0]; }
    return loadLocal<any>('smtp_config_db', { host: 'smtp.gmail.com', port: 587, encryption: 'tls' });
  },
  async updateSMTPConfig(data: any): Promise<boolean> {
    // Upsert SMTP config
    const existing = await getAll<any>('smtp_config');
    if (existing.length > 0) return update('smtp_config', existing[0].id, data);
    const res = await apiFetch('/smtp_config', 'POST', data);
    return res.success;
  },

  // ==================== EMAIL TEMPLATES ====================
  async getEmailTemplates(): Promise<any[]> {
    const api = await getAll('notification_templates');
    if (api.length > 0) { saveLocal('email_templates_db', api); return api; }
    return loadLocal<any[]>('email_templates_db', []);
  },
  async updateEmailTemplate(id: string, data: any): Promise<boolean> {
    return update('notification_templates', id, data);
  },

  // ==================== DASHBOARD STATS ====================
  async getDashboardStats(): Promise<any> {
    const res = await apiFetch<any>('/dashboard/stats');
    if (res.success && res.data) return res.data;
    return null;
  },
};

// Type helpers
interface ClientRow { id: string; client_code: string; company_name: string; contact_person?: string; email: string; phone?: string; smpp_username: string; smpp_password: string; billing_mode: string; currency: string; balance: number; credit_limit: number; status: string; created_at?: string; updated_at?: string; [key: string]: any; }
interface SupplierRow { id: string; supplier_code: string; company_name: string; contact_person?: string; email: string; phone?: string; connection_type: string; bind_status: string; status: string; balance: number; credit_limit: number; currency: string; consecutive_failures: number; created_at?: string; updated_at?: string; [key: string]: any; }

export default dbService;
