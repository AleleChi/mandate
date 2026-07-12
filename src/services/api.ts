/// <reference types="vite/client" />

import { safeStorage } from '../utils/storage';

const TOKEN_KEY = 'koinonia_token';

const FORBIDDEN_WORDS = [
  'validation',
  'database',
  'server',
  'api',
  'token',
  'workflow',
  'portal',
  'system',
  'authentication',
  'registration',
  'sql',
  'postgres',
  'sqlite',
  'stack',
  'exception'
];

export class ParentApiError extends Error {
  description: string;
  code?: string;
  data?: any;
  constructor(message: string, description: string = 'Please try again.', code?: string, data?: any) {
    super(message);
    this.name = 'ParentApiError';
    this.description = description;
    this.code = code;
    this.data = data;
  }
}

export function extractApiError(err: any): { message: string; description: string; code?: string } {
  console.error('[extractApiError - Caught Source Error]:', err);
  if (err instanceof ParentApiError) {
    return { message: err.message, description: err.description, code: err.code };
  }
  const raw = (typeof err === 'string' ? err : err?.message || '').trim();
  if (!raw || raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('Load failed') || raw.includes('Connection problem')) {
    return { message: 'Connection problem', description: 'Please check your internet and try again.' };
  }
  const lower = raw.toLowerCase();
  const containsForbidden = FORBIDDEN_WORDS.some(w => lower.includes(w));
  if (containsForbidden || raw.includes('Request failed (5') || raw.includes('Request failed (4')) {
    return { message: 'Something went wrong', description: 'Please try again.', code: err?.code };
  }
  return { message: raw, description: 'Please try again.', code: err?.code };
}

export const api = {
  getToken: () => safeStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => safeStorage.setItem(TOKEN_KEY, token),
  clearToken: () => safeStorage.removeItem(TOKEN_KEY),

  async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = safeStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let apiBaseUrl = '';
    try {
      apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
    } catch {
      apiBaseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim();
    }

    let isDev = false;
    try {
      isDev = !!import.meta.env.DEV;
    } catch {}

    // Fallback to relative URLs in development/preview to connect to the local container backend
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (
        isDev ||
        hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname.endsWith('.run.app') || 
        hostname.endsWith('.google.com') ||
        hostname.endsWith('.googleusercontent.com')
      ) {
        apiBaseUrl = ''; // Use relative paths for local development and AI Studio preview
      }
    }

    const url = apiBaseUrl
      ? `${apiBaseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`
      : endpoint;

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw err;
      }
      throw new ParentApiError('Connection problem', 'Please check your internet and try again.');
    }

    // Safely parse JSON or handle HTML fallback responses
    let data: any = {};
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    } else {
      const text = await res.text().catch(() => '');
      if (text.trim().startsWith('<')) {
        throw new ParentApiError('Connection problem', 'The server returned an invalid response. Please try again.');
      }
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || `Request failed (${res.status})` };
      }
    }

    if (!res.ok) {
      const rawError = data.error || data.message || `Request failed (${res.status})`;
      const errorCode = data.code;
      console.error('[api.request Error Details]:', { url, status: res.status, rawError, errorCode, data });
      const lower = rawError.toLowerCase();
      const containsForbidden = FORBIDDEN_WORDS.some(w => lower.includes(w));
      if (containsForbidden || res.status >= 500) {
        throw new ParentApiError('Something went wrong', 'Please try again.', errorCode, data);
      }
      throw new ParentApiError(rawError, 'Please try again.', errorCode, data);
    }
    return data as T;
  },

  async getPublicAppMedia() {
    return api.request<{
      success: boolean;
      media: {
        parentDashboardHero: { url: string | null; thumbnailUrl: string | null };
        volunteerDashboardHero: { url: string | null; thumbnailUrl: string | null };
        defaultEventHero: { url: string | null; thumbnailUrl: string | null };
      };
    }>('/api/public/app-media');
  },

  auth: {
    async createAccount(payload: any) {
      const res = await api.request<any>('/api/auth/create-account', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.token) api.setToken(res.token);
      return res;
    },
    async signIn(payload: any) {
      const res = await api.request<any>('/api/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.token) api.setToken(res.token);
      return res;
    },
    async signOut() {
      api.clearToken();
      return api.request('/api/auth/sign-out', { method: 'POST' }).catch(() => ({}));
    },
    async getMe() {
      return api.request<{ user: any; profile: any }>('/api/auth/me');
    },
    async getAccess() {
      return api.request<any>('/api/me/access');
    },
    async forgotPassword(email: string) {
      return api.request<any>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async resetPassword(token: string, password: string) {
      return api.request<any>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
    },
    async verifyEmail(token: string) {
      return api.request<any>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token })
      });
    },
    async resendVerification(email: string) {
      return api.request<any>('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    passkeys: {
      async getList() {
        return api.request<any>('/api/auth/passkeys');
      },
      async revoke(passkeyId: string) {
        return api.request<any>(`/api/auth/passkeys/${passkeyId}`, {
          method: 'DELETE'
        });
      },
      async registerOptions() {
        return api.request<any>('/api/auth/passkeys/register/options', {
          method: 'POST'
        });
      },
      async registerVerify(credential: any, deviceName: string) {
        return api.request<any>('/api/auth/passkeys/register/verify', {
          method: 'POST',
          body: JSON.stringify({ credential, deviceName })
        });
      },
      async loginOptions(email: string) {
        return api.request<any>('/api/auth/passkeys/login/options', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
      },
      async loginVerify(credential: any, challengeKey: string) {
        const res = await api.request<any>('/api/auth/passkeys/login/verify', {
          method: 'POST',
          body: JSON.stringify({ credential, challengeKey })
        });
        if (res.token) api.setToken(res.token);
        return res;
      },
      async verifyAction(credential: any, actionName: string) {
        return api.request<any>('/api/auth/passkeys/verify-action', {
          method: 'POST',
          body: JSON.stringify({ credential, actionName })
        });
      }
    }
  },

  parent: {
    async getProfile() {
      return api.request<any>('/api/parent/profile');
    },
    async updateProfile(profile: any) {
      return api.request<any>('/api/parent/profile', {
        method: 'PUT',
        body: JSON.stringify(profile)
      });
    },
    async getHome() {
      return api.request<any>('/api/parent/home');
    },
    async getPasses() {
      return api.request<any>('/api/parent/passes');
    },
    async getPass(passId: string) {
      return api.request<any>(`/api/parent/passes/${passId}`);
    },
    async getChildren() {
      return api.request<any[]>('/api/parent/children');
    },
    async saveChildDraft(draft: any, childId?: string) {
      const endpoint = childId ? `/api/parent/children/${childId}/draft` : '/api/parent/children/draft';
      return api.request<any>(endpoint, {
        method: childId ? 'PUT' : 'POST',
        body: JSON.stringify(draft)
      });
    },
    async submitChildReview(childId: string, finalDraft?: any) {
      return api.request<any>(`/api/parent/children/${childId}/submit`, {
        method: 'POST',
        body: JSON.stringify(finalDraft || {})
      });
    },
    async getChildStatus(childId: string) {
      return api.request<any>(`/api/parent/children/${childId}/status`);
    },
    async getChildPass(childId: string) {
      return api.request<any>(`/api/parent/children/${childId}/pass`);
    },
    async deleteChild(childId: string) {
      return api.request<any>(`/api/parent/children/${childId}`, {
        method: 'DELETE'
      });
    },
    async getNotifications(unreadOnly = false, role?: string) {
      let url = `/api/notifications?unread=${unreadOnly}`;
      if (role) {
        url += `&role=${role}`;
      }
      const res = await api.request<{ notifications: any[] }>(url);
      return res.notifications || [];
    },
    async markAllNotificationsAsRead() {
      return api.request<any>('/api/notifications/read-all', {
        method: 'POST'
      });
    },
    async markNotificationAsRead(id: string) {
      return api.request<any>(`/api/notifications/${id}/read`, {
        method: 'POST'
      });
    },
    async savePushSubscription(subscription: any) {
      return api.request<any>('/api/notifications/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription)
      });
    },
    async getVapidPublicKey() {
      return api.request<{ publicKey: string }>('/api/notifications/push/vapid-key');
    },
    async getNotificationPreferences() {
      return api.request<{ soundEnabled: boolean; pushEnabled: boolean; emailEnabled: boolean }>('/api/notifications/preferences');
    },
    async updateNotificationPreferences(payload: { soundEnabled?: boolean; pushEnabled?: boolean; emailEnabled?: boolean }) {
      return api.request<{ soundEnabled: boolean; pushEnabled: boolean; emailEnabled: boolean }>('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    }
  },

  volunteer: {
    async createAccount(payload: any) {
      const res = await api.request<any>('/api/volunteer/create-account', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.token) api.setToken(res.token);
      return res;
    },
    async createAccountWithPhoto(formData: FormData) {
      const res = await api.request<any>('/api/volunteer/create-account', {
        method: 'POST',
        body: formData
      });
      if (res.token) api.setToken(res.token);
      return res;
    },
    async signIn(payload: any) {
      const res = await api.request<any>('/api/volunteer/sign-in', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.token) api.setToken(res.token);
      return res;
    },
    async getMe() {
      return api.request<{ user: any; profile: any }>('/api/volunteer/me');
    },
    async getProfile() {
      return api.request<any>('/api/volunteer/me');
    },
    async getStatus() {
      return api.request<{ success: boolean; user: any; profile: any; volunteerProfile: any; nextRoute?: string }>('/api/volunteer/me/status');
    },
    async requestAccess(payload: any) {
      return api.request<any>('/api/volunteer/request', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getEventHome() {
      return api.request<{ event: any; stats: { expected: number; checkedIn: number; pickedUp: number; attention: number }; attentionItems: any[] }>('/api/volunteer/event-home');
    },
    async updateProfile(profile: any) {
      if (profile instanceof FormData) {
        return api.request<any>('/api/volunteer/me/profile', {
          method: 'PATCH',
          body: profile
        });
      }
      return api.request<any>('/api/volunteer/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(profile)
      });
    },
    async resendVerification(email: string) {
      return api.request<any>('/api/volunteer/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async requestPasswordReset(email: string) {
      return api.request<any>('/api/volunteer/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async resetPassword(token: string, password: string) {
      return api.request<any>('/api/volunteer/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
    },
    async searchChildren(q: string) {
      return api.request<any[]>(`/api/volunteer/children/search?q=${encodeURIComponent(q)}`);
    },
    async lookupPass(payload: { passReference?: string; childId?: string; childEventEntryId?: string }) {
      return api.request<any>('/api/volunteer/pass/lookup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async checkIn(payload: { passReference?: string; childId?: string; childEventEntryId?: string }) {
      return api.request<any>('/api/volunteer/check-in', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async checkOut(payload: { passReference?: string; childId?: string; childEventEntryId?: string }) {
      return api.request<any>('/api/volunteer/check-out', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getCheckInHistory() {
      return api.request<any[]>('/api/volunteer/check-in-history');
    },
    async lookupPickup(payload: { passCode: string; source?: string }) {
      return api.request<any>('/api/volunteer/pickup/lookup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async markPickup(payload: { childId?: string; passCode?: string; pickupPersonId?: string; source?: string }) {
      return api.request<any>('/api/volunteer/pickup/mark', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async markChildPickedUp(payload: { childId?: string; passCode?: string; pickupPersonId?: string; source?: string }) {
      return api.request<any>('/api/volunteer/pickup/mark', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getPickupHome() {
      return api.request<any>('/api/volunteer/pickup-home');
    },
    async getChildren(params: { q?: string; status?: string; limit?: number }) {
      const queryParams = new URLSearchParams();
      if (params.q) queryParams.append('q', params.q);
      if (params.status) queryParams.append('status', params.status);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      return api.request<any[]>(`/api/volunteer/children?${queryParams.toString()}`);
    },
    async getChildProfile(childId: string) {
      return api.request<any>(`/api/volunteer/children/${childId}`);
    },
    async preparePickup(childId: string) {
      return api.request<any>('/api/volunteer/pickup/prepare-child', {
        method: 'POST',
        body: JSON.stringify({ childId })
      });
    },
    async getReports() {
      return api.request<any>('/api/volunteer/reports');
    },
    async submitFinalReport(notes: string) {
      return api.request<any>('/api/volunteer/reports/submit', {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
    },
    async getAttentionItems() {
      return api.request<any[]>('/api/volunteer/attention-items');
    },
    async getAttentionItem(itemId: string) {
      return api.request<any>(`/api/volunteer/attention-items/${itemId}`);
    },
    async reviewAttentionItem(itemId: string, payload: { note: string }) {
      return api.request<any>(`/api/volunteer/attention-items/${itemId}/review`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async resolveAttentionItem(itemId: string, payload: { note: string }) {
      return api.request<any>(`/api/volunteer/attention-items/${itemId}/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async verifyAttentionItem(itemId: string, payload: { note: string }) {
      return api.request<any>(`/api/volunteer/attention-items/${itemId}/verify`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async escalateAttentionItem(itemId: string, payload: { note: string }) {
      return api.request<any>(`/api/volunteer/attention-items/${itemId}/escalate`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getSafetyAlerts() {
      return api.request<{ success: boolean; alerts: any[] }>('/api/volunteer/safety-alerts');
    },
    async raiseSafetyAlert(payload: { childId?: string; childEventEntryId?: string; category: string; severity: string; locationLabel?: string; message: string; locationId?: string | null; locationDetail?: string; locationSource?: string; structuredDetails?: any }) {
      return api.request<any>('/api/volunteer/safety-alerts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getTeamSafetyAlerts() {
      return api.request<any[]>('/api/volunteer/team-safety-alerts');
    },
    async acknowledgeSafetyAlert(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/volunteer/safety-alerts/${id}/acknowledge`, {
        method: 'POST'
      });
    },
    async resolveSafetyAlert(id: string, note?: string) {
      return api.request<{ success: boolean; message: string }>(`/api/volunteer/safety-alerts/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
    },
    async escalateSafetyAlert(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/volunteer/safety-alerts/${id}/escalate`, {
        method: 'POST'
      });
    }
  },

  media: {
    async upload(fileDataUrl: string, fileName?: string, fileType?: string) {
      return api.request<{ id: string; provider: string; publicId: string; secureUrl: string; resourceType: string; fileType: string; url: string }>('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({ fileDataUrl, fileName, purpose: fileType || 'parent_profile_photo', fileType: fileType || 'parent_profile_photo' })
      });
    },
    async uploadFile(file: File | Blob, purpose: string = 'parent_profile_photo', slotKey?: string) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);
      if (slotKey) {
        formData.append('slotKey', slotKey);
      }
      return api.request<{ id: string; provider: string; publicId: string; secureUrl: string; resourceType: string; fileType: string; url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData
      });
    },
    async publicUploadFile(file: File | Blob, purpose: string = 'volunteer_profile_photo') {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);
      return api.request<{ id: string; provider: string; publicId: string; secureUrl: string; resourceType: string; fileType: string; url: string }>('/api/media/public-upload', {
        method: 'POST',
        body: formData
      });
    }
  },

  landing: {
    async getPublicPage() {
      return api.request<{ success: boolean; settings: Record<string, string> }>('/api/admin/public-landing-page');
    }
  },

  adminUpdates: {
    async getUpdates(filters: {
      limit?: number;
      page?: number;
      status?: string;
      type?: string;
      senderRole?: string;
      priority?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    }) {
      const params = new URLSearchParams();
      if (filters.limit) params.append('limit', String(filters.limit));
      if (filters.page) params.append('page', String(filters.page));
      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);
      if (filters.senderRole) params.append('senderRole', filters.senderRole);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.search) params.append('search', filters.search);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

      return api.request<{ updates: any[]; pagination: any }>(
        `/api/notifications/admin/updates?${params.toString()}`
      );
    },
    async markAsRead(id: string) {
      return api.request<any>(`/api/notifications/admin/updates/${id}/read`, { method: 'POST' });
    },
    async markAsUnread(id: string) {
      return api.request<any>(`/api/notifications/admin/updates/${id}/unread`, { method: 'POST' });
    },
    async markAllAsRead() {
      return api.request<any>('/api/notifications/admin/updates/read-all', { method: 'POST' });
    },
    async archiveUpdate(id: string) {
      return api.request<any>(`/api/notifications/admin/updates/${id}/archive`, { method: 'POST' });
    },
    async unarchiveUpdate(id: string) {
      return api.request<any>(`/api/notifications/admin/updates/${id}/unarchive`, { method: 'POST' });
    },
    async getSummary() {
      return api.request<{ success: boolean; summary: any }>('/api/notifications/admin/updates/summary');
    }
  },

  admin: {
    async signIn(payload: any) {
      const res = await api.request<any>('/api/admin/sign-in', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.token) api.setToken(res.token);
      return res;
    },
    async requestPasswordReset(email: string) {
      return api.request<any>('/api/admin/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async resetPassword(payload: any) {
      return api.request<any>('/api/admin/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getMe() {
      return api.request<{ user: any; profile: any }>('/api/admin/me');
    },
    async getOverview() {
      return api.request<any>('/api/admin/overview');
    },
    async getChildren(params?: { q?: string; filter?: string; page?: number; limit?: number }) {
      const queryParams = new URLSearchParams();
      if (params?.q) queryParams.append('q', params.q);
      if (params?.filter) queryParams.append('filter', params.filter);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      const queryString = queryParams.toString();
      return api.request<{
        success: boolean;
        stats: any;
        children: any[];
        pagination?: {
          total: number;
          page: number;
          limit: number;
          pages: number;
        };
      }>(`/api/admin/children${queryString ? `?${queryString}` : ''}`);
    },
    async getAttendance(params?: { q?: string; status?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.q) queryParams.append('q', params.q);
      if (params?.status) queryParams.append('status', params.status);
      const queryString = queryParams.toString();
      return api.request<{
        success: boolean;
        stats: {
          expected: number;
          checkedIn: number;
          inside: number;
          pickedUp: number;
          notArrived: number;
          needsAttention: number;
        };
        rows: any[];
        ageGroups: any[];
        recentScans: any[];
        teamActivity: any[];
        total: number;
      }>(`/api/admin/attendance${queryString ? `?${queryString}` : ''}`);
    },
    async getApplications(params?: { q?: string; status?: string; page?: number; limit?: number }) {
      const queryParams = new URLSearchParams();
      if (params?.q) queryParams.append('q', params.q);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      const queryString = queryParams.toString();
      return api.request<{
        success: boolean;
        applications: any[];
        stats?: any;
        pagination?: {
          total: number;
          page: number;
          limit: number;
          pages: number;
        };
      }>(`/api/admin/applications${queryString ? `?${queryString}` : ''}`);
    },
    async getApplicationDetails(id: string) {
      return api.request<{ success: boolean; application: any }>(`/api/admin/applications/${id}`);
    },
    async updateApplicationDetails(id: string, payload: any) {
      return api.request<any>(`/api/admin/applications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    async removeChild(id: string, reason: string) {
      return api.request<any>(`/api/admin/applications/${id}/remove`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async restoreChild(id: string, reason?: string) {
      return api.request<any>(`/api/admin/applications/${id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async reviewApplication(id: string, payload: { status: string; noteToTeam?: string; sendNotification?: boolean }) {
      return api.request<any>(`/api/admin/applications/${id}/review`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async reopenApplicationReview(id: string, reason?: string) {
      return api.request<any>(`/api/admin/applications/${id}/reopen-review`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async bulkReviewApplications(payload: { applicationIds: string[]; decision: string; note?: string }) {
      return api.request<any>('/api/admin/applications/bulk-review', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async updateApplicationStatus(id: string, status: string, noteToTeam?: string) {
      return api.request<any>(`/api/admin/applications/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, noteToTeam })
      });
    },
    async generateChildPass(childId: string) {
      return api.request<any>(`/api/admin/children/${childId}/pass/generate`, {
        method: 'POST'
      });
    },
    async getChildPass(childId: string) {
      return api.request<any>(`/api/admin/children/${childId}/pass`);
    },
    async revokeChildPass(childId: string, reason: string) {
      return api.request<any>(`/api/admin/children/${childId}/pass/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async changePassword(payload: any) {
      return api.request<any>('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async listAdmins() {
      return api.request<{ success: boolean; admins: any[] }>('/api/admin/admins');
    },
    async inviteAdmin(payload: any) {
      return api.request<any>('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async acceptInvite(payload: any) {
      return api.request<any>('/api/admin/accept-invite', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getReports(params?: { reportType?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.reportType) queryParams.append('reportType', params.reportType);
      const queryString = queryParams.toString();
      return api.request<any>(`/api/admin/reports${queryString ? `?${queryString}` : ''}`);
    },
    async saveReportNotes(payload: { eventId: string; reportType: string; notes: string }) {
      return api.request<any>('/api/admin/reports/notes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getMessages() {
      return api.request<{
        success: boolean;
        stats: {
          messagesSent: number;
          whatsappSent: number;
          emailSent: number;
          failed: number;
          pending: number;
        };
        recipientGroups: Array<{ key: string; label: string; count: number }>;
        messageTypes: Array<{ key: string; label: string }>;
        recentActivity: any[];
        latestDraft: any;
        emailEnabled?: boolean;
        whatsappEnabled?: boolean;
        providerStatus?: {
          emailEnabled: boolean;
          whatsappEnabled: boolean;
          emailProvider: string | null;
          whatsappProvider: string | null;
          senderName: string | null;
          fromEmail: string | null;
          replyToEmail: string | null;
        };
      }>('/api/admin/messages');
    },
    async previewMessage(payload: {
      recipientGroup: string;
      messageType: string;
      channel: string;
      subject?: string;
      body: string;
    }) {
      return api.request<{ success: boolean; preview: { subject: string; body: string } }>('/api/admin/messages/preview', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async saveMessageDraft(payload: {
      recipientGroup: string;
      messageType: string;
      channel: string;
      subject?: string;
      body: string;
    }) {
      return api.request<{ success: boolean; message: string }>('/api/admin/messages/drafts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async sendMessage(payload: {
      recipientGroup: string;
      messageType: string;
      channel: string;
      subject?: string;
      body: string;
      confirmed: boolean;
    }) {
      return api.request<{
        success: boolean;
        summary: { requested: number; sent: number; pending: number; failed: number };
        message: string;
      }>('/api/admin/messages/send', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getMessagesSettings() {
      return api.request<{
        success: boolean;
        senderName: string;
        fromEmail: string | null;
        replyToEmail: string | null;
        emailEnabled: boolean;
        whatsappEnabled: boolean;
        emailProvider: string | null;
        whatsappProvider: string | null;
      }>('/api/admin/messages/settings');
    },
    async updateMessagesSettings(payload: { senderName: string; replyToEmail: string }) {
      return api.request<{ success: boolean; message: string }>('/api/admin/messages/settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getGeneralSettings() {
      return api.request<{
        success: boolean;
        settings: {
          parentRegistrationEnabled: number;
          parentLoginEnabled: number;
          requiredChildPhoto: number;
          requiredParentPhoto: number;
          requiredMedicalNotes: number;
          requiredPickupPerson: number;
        };
      }>('/api/admin/general-settings');
    },
    async updateGeneralSettings(payload: {
      parentRegistrationEnabled: boolean;
      parentLoginEnabled: boolean;
      requiredChildPhoto: boolean;
      requiredParentPhoto: boolean;
      requiredMedicalNotes: boolean;
      requiredPickupPerson: boolean;
    }) {
      return api.request<{ success: boolean; message: string }>('/api/admin/general-settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getLandingSettings() {
      return api.request<{ success: boolean; settings: Record<string, string> }>('/api/admin/landing-settings');
    },
    async updateLandingSettings(settings: Record<string, string>) {
      return api.request<{ success: boolean; message: string }>('/api/admin/landing-settings', {
        method: 'POST',
        body: JSON.stringify({ settings })
      });
    },
    async getSettingsMedia() {
      return api.request<{
        success: boolean;
        media: {
          parent_dashboard_hero: string;
          volunteer_dashboard_hero: string;
          default_event_hero: string;
        };
      }>('/api/admin/settings/media');
    },
    async uploadSettingsMedia(slot: string, file: File) {
      const formData = new FormData();
      formData.append('slot', slot);
      formData.append('file', file);
      return api.request<{
        success: boolean;
        media: {
          slot: string;
          url: string;
        };
      }>('/api/admin/settings/media', {
        method: 'POST',
        body: formData
      });
    },
    async resetSettingsMedia(slot: string) {
      return api.request<{ success: boolean; message: string }>('/api/admin/settings/media/reset', {
        method: 'POST',
        body: JSON.stringify({ slot })
      });
    },
    async updateTeamMemberRole(payload: { userId: string; role: string }) {
      return api.request<{ success: boolean; message: string }>('/api/admin/team/edit-role', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async updateTeamMemberStatus(payload: { userId: string; status: string }) {
      return api.request<{ success: boolean; message: string }>('/api/admin/team/edit-status', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getVolunteers(params?: { q?: string; status?: string; team?: string; page?: number; limit?: number }) {
      const queryParams = new URLSearchParams();
      if (params?.q) queryParams.append('q', params.q);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.team) queryParams.append('team', params.team);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      const queryString = queryParams.toString();
      return api.request<{ 
        success: boolean; 
        volunteers: any[]; 
        stats?: any;
        pagination?: {
          total: number;
          page: number;
          limit: number;
          pages: number;
        };
      }>(`/api/admin/volunteers${queryString ? `?${queryString}` : ''}`);
    },
    async getVolunteerDetails(id: string) {
      return api.request<{ success: boolean; volunteer: any }>(`/api/admin/volunteers/${id}`);
    },
    async reviewVolunteer(id: string, payload: { status: 'approved' | 'rejected'; team?: string; note?: string }) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/volunteers/${id}/review`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async removeVolunteer(id: string, reason?: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/volunteers/${id}/remove`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async restoreVolunteer(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/volunteers/${id}/restore`, {
        method: 'POST'
      });
    },
    async updateVolunteerAssignment(id: string, assignedTeam: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/volunteers/${id}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedTeam })
      });
    },
    async resendVolunteerApprovalEmail(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/volunteers/${id}/resend-approval-email`, {
        method: 'POST'
      });
    },
    async permanentlyDeleteVolunteer(id: string, payload: { reason: string; confirmation: string }) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/volunteers/${id}/permanent-delete`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getParents(params?: { q?: string; status?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.q) queryParams.append('q', params.q);
      if (params?.status) queryParams.append('status', params.status);
      const queryString = queryParams.toString();
      return api.request<{ success: boolean; parents: any[] }>(`/api/admin/parents${queryString ? `?${queryString}` : ''}`);
    },
    async getParentDetails(id: string) {
      return api.request<{ success: boolean; parent: any; linkedChildren: any[]; eventSummary: any; attention: any; adminNotes: any[] }>(`/api/admin/parents/${id}`);
    },
    async removeParent(id: string, reason?: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/parents/${id}/remove`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async restoreParent(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/parents/${id}/restore`, {
        method: 'POST'
      });
    },
    async saveParentNote(id: string, note: string) {
      return api.request<{ success: boolean; message: string; note: any }>(`/api/admin/parents/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
    },
    async updateParentProfile(id: string, payload: any) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/parents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    async permanentlyDeleteParent(id: string, payload: { reason: string; confirmation: string }) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/parents/${id}/permanent-delete`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getVolunteerParentStats() {
      return api.request<{ success: boolean; stats: any }>('/api/admin/reports/volunteer-parent-stats');
    },
    async getFooterSettings() {
      return api.request<{ success: boolean; settings: { copyrightYear: number; copyrightText: string } }>('/api/admin/footer-settings');
    },
    async updateFooterSettings(payload: { copyrightYear: number; copyrightText: string }) {
      return api.request<{ success: boolean; message: string }>('/api/admin/footer-settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getEvents(params?: { status?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.append('status', params.status);
      const queryString = queryParams.toString();
      return api.request<{ success: boolean; events: any[] }>(`/api/admin/events${queryString ? `?${queryString}` : ''}`);
    },
    async getEvent(eventId: string) {
      return api.request<{ success: boolean; event: any; ageGroups: any[] }>(`/api/admin/events/${eventId}`);
    },
    async createEvent(payload: any) {
      return api.request<{ success: boolean; eventId: string; message?: string }>('/api/admin/events', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async updateEvent(eventId: string, payload: any) {
      return api.request<{ success: boolean; message?: string }>(`/api/admin/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    },
    async publishEvent(eventId: string) {
      return api.request<{ success: boolean; message?: string }>(`/api/admin/events/${eventId}/publish`, {
        method: 'POST'
      });
    },
    async archiveEvent(eventId: string) {
      return api.request<{ success: boolean; message?: string }>(`/api/admin/events/${eventId}/archive`, {
        method: 'POST'
      });
    },
    async setCurrentEvent(eventId: string) {
      return api.request<{ success: boolean; message?: string }>(`/api/admin/events/${eventId}/set-current`, {
        method: 'POST'
      });
    },
    async getSafetyAlerts() {
      return api.request<any[]>('/api/admin/safety-alerts');
    },
    async getSafetyAlertDetail(id: string, role?: string) {
      const url = role ? `/api/admin/safety-alerts/${id}?role=${encodeURIComponent(role)}` : `/api/admin/safety-alerts/${id}`;
      return api.request<{
        success: boolean;
        alert: any;
        raisedBy: any;
        child: any;
        parent: any;
        pickup: any;
        careSummary: any;
      }>(url);
    },
    async acknowledgeSafetyAlert(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/safety-alerts/${id}/acknowledge`, {
        method: 'POST'
      });
    },
    async resolveSafetyAlert(id: string, note?: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/safety-alerts/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
    },
    async escalateSafetyAlert(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/safety-alerts/${id}/escalate`, {
        method: 'POST'
      });
    },
    async silenceSafetyAlert(id: string) {
      return api.request<{ success: boolean; message: string }>(`/api/admin/safety-alerts/${id}/silence`, {
        method: 'POST'
      });
    },
    async testDeviceAlert() {
      return api.request<{ success: boolean; message: string; alert: any }>('/api/admin/alert-delivery/test-device', {
        method: 'POST'
      });
    }
  },

  safetyAlerts: {
    // Proof: data-component-version="alert-response-frontend-api-v1"
    async getAlertResponse(alertId: string) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/response`);
    },
    async acknowledgeAndRespond(alertId: string, payload: { expectedVersion?: number; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/acknowledge-and-respond`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async joinAlertResponse(alertId: string, payload: { expectedVersion?: number; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/assist`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async leaveAlertResponse(alertId: string, payload: { expectedVersion?: number; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/assist`, {
        method: 'DELETE',
        body: JSON.stringify(payload)
      });
    },
    async markAlertInProgress(alertId: string, payload: { expectedVersion?: number; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/in-progress`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async addAlertResponseUpdate(alertId: string, payload: { updateType: string; note?: string; visibility?: string; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/updates`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async requestAlertAssistance(alertId: string, payload: { userId?: string; responsibilityKey?: string; teamKey?: string; note?: string; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/request-assistance`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async requestAlertHandover(alertId: string, payload: { targetUserId: string; reason: string; note?: string; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/handover`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async respondToAlertHandover(alertId: string, handoverId: string, payload: { decision: 'accept' | 'decline'; note?: string; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/handover/${handoverId}/respond`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async adminReassignAlertResponse(alertId: string, payload: { targetUserId: string; reason: string; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/reassign`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async resolveAlertResponse(alertId: string, payload: { outcome: string; resolutionNote: string; followUpRequired?: boolean; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async reopenAlertResponse(alertId: string, payload: { reason: string; idempotencyKey?: string }) {
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/reopen`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getAlertResponseTimeline(alertId: string, pagination: { page?: number; limit?: number }) {
      const q = new URLSearchParams();
      if (pagination.page) q.append('page', String(pagination.page));
      if (pagination.limit) q.append('limit', String(pagination.limit));
      return api.request<any>(`/api/volunteer/safety-alerts/${alertId}/history?${q.toString()}`);
    },
    async getVolunteerHelpRequests(filters?: any) {
      const q = new URLSearchParams(filters);
      return api.request<{ success: boolean; alerts: any[] }>(`/api/volunteer/safety-alerts?${q.toString()}`);
    },
    async getVolunteerHelpRequestProgress(alertId: string) {
      return api.request<any>(`/api/volunteer/safety-alerts/help-requests/${alertId}/progress`);
    },
    async getAdminActiveResponses(filters?: any) {
      const q = new URLSearchParams(filters);
      return api.request<any[]>(`/api/admin/safety-alerts?${q.toString()}`);
    },
    async searchEligibleResponders(role: string, query: string = '') {
      const path = role === 'admin' ? '/api/admin/volunteers' : '/api/volunteer/admin/volunteers';
      const q = new URLSearchParams({ q: query, status: 'approved', limit: '50' });
      try {
        const res = await api.request<any>(`${path}?${q.toString()}`);
        return res.volunteers || [];
      } catch (err) {
        console.error('[searchEligibleResponders Error]:', err);
        return [];
      }
    }
  },
  incidents: {
    async create(payload: any) {
        return api.request<any>('/api/incidents', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async get(id: string) {
        return api.request<any>(`/api/incidents/${id}`);
      },
      async getByAlert(alertId: string) {
        return api.request<any>(`/api/incidents/alert/${alertId}`);
      },
      async updateDraft(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/draft`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      },
      async submit(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/submit`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async submitChangeRequest(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/change-request`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async resolveChangeRequests(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/resolve-change-requests`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async addFollowUpAction(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/follow-up`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async completeFollowUpAction(id: string, actionId: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/follow-up/${actionId}/complete`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async updateClosureChecklist(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/closure-checklist`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      },
      async close(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/close`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async reopen(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/reopen`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async void(id: string, payload: any) {
        return api.request<any>(`/api/incidents/${id}/void`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },
      async list(params?: { status?: string; category?: string; page?: number; limit?: number }) {
        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.append('status', params.status);
        if (params?.category) queryParams.append('category', params.category);
        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        const queryString = queryParams.toString();
        return api.request<any>(`/api/incidents${queryString ? `?${queryString}` : ''}`);
      },
      async history(id: string) {
        return api.request<any>(`/api/incidents/${id}/history`);
      },
      async stats() {
        return api.request<any>('/api/incidents/stats/summary');
      }
    },
    escalation: {
      async getPolicies(eventId?: string) {
        return api.request<any>(`/api/admin/escalation/policies?eventId=${eventId || 'event-ga-2026'}`);
      },
      async getPolicy(id: string) {
        return api.request<any>(`/api/admin/escalation/policies/${id}`);
      },
      async createPolicy(policy: any) {
        return api.request<any>('/api/admin/escalation/policies', {
          method: 'POST',
          body: JSON.stringify(policy)
        });
      },
      async updatePolicy(id: string, policy: any) {
        return api.request<any>(`/api/admin/escalation/policies/${id}`, {
          method: 'PUT',
          body: JSON.stringify(policy)
        });
      },
      async deletePolicy(id: string) {
        return api.request<any>(`/api/admin/escalation/policies/${id}`, {
          method: 'DELETE'
        });
      },
      async getHistory(eventId?: string) {
        return api.request<any>(`/api/admin/escalation/history?eventId=${eventId || 'event-ga-2026'}`);
      }
    },
    operations: {
      async getOverview(eventId: string, profile?: string, options?: RequestInit) {
        const queryParams = new URLSearchParams();
        if (profile) queryParams.append('profile', profile);
        const queryStr = queryParams.toString();
        return api.request<any>(`/api/admin/events/${eventId}/operations/overview${queryStr ? `?${queryStr}` : ''}`, options);
      },
      async getActivity(eventId: string, params?: { type?: string; page?: number; limit?: number }, options?: RequestInit) {
        const queryParams = new URLSearchParams();
        if (params?.type) queryParams.append('type', params.type);
        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        const queryStr = queryParams.toString();
        return api.request<any>(`/api/admin/events/${eventId}/operations/activity${queryStr ? `?${queryStr}` : ''}`, options);
      }
    }
};
