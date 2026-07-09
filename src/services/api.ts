/// <reference types="vite/client" />

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
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),

  async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem(TOKEN_KEY);
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
    } catch {
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
      const lower = rawError.toLowerCase();
      const containsForbidden = FORBIDDEN_WORDS.some(w => lower.includes(w));
      if (containsForbidden || res.status >= 500) {
        throw new ParentApiError('Something went wrong', 'Please try again.', errorCode, data);
      }
      throw new ParentApiError(rawError, 'Please try again.', errorCode, data);
    }
    return data as T;
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
      return { success: true };
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
    async getChildren(params?: { q?: string; filter?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.q) queryParams.append('q', params.q);
      if (params?.filter) queryParams.append('filter', params.filter);
      const queryString = queryParams.toString();
      return api.request<{
        success: boolean;
        stats: any;
        children: any[];
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
    async getApplications() {
      return api.request<{ success: boolean; applications: any[] }>('/api/admin/applications');
    },
    async getApplicationDetails(id: string) {
      return api.request<{ success: boolean; application: any }>(`/api/admin/applications/${id}`);
    },
    async reviewApplication(id: string, payload: { status: string; noteToTeam?: string; sendNotification?: boolean }) {
      return api.request<any>(`/api/admin/applications/${id}/review`, {
        method: 'POST',
        body: JSON.stringify(payload)
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
    async updateTeamMemberRole(payload: { userId: string; role: string }) {
      return api.request<{ success: boolean; message: string }>('/api/admin/team/edit-role', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getVolunteers(params?: { q?: string; status?: string; team?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.q) queryParams.append('q', params.q);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.team) queryParams.append('team', params.team);
      const queryString = queryParams.toString();
      return api.request<{ success: boolean; volunteers: any[] }>(`/api/admin/volunteers${queryString ? `?${queryString}` : ''}`);
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
    async getVolunteerParentStats() {
      return api.request<{ success: boolean; stats: any }>('/api/admin/reports/volunteer-parent-stats');
    }
  }
};
