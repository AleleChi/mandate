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

    // Fallback to relative URLs in development/preview to connect to the local container backend
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (
        hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname.endsWith('.run.app') || 
        hostname.endsWith('.google.com')
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

    const data = await res.json().catch(() => ({}));
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
      return api.request<any>('/api/volunteer/profile', {
        method: 'PUT',
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
    }
  },

  media: {
    async upload(fileDataUrl: string, fileName?: string, fileType?: string) {
      return api.request<{ id: string; provider: string; publicId: string; secureUrl: string; resourceType: string; fileType: string; url: string }>('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({ fileDataUrl, fileName, purpose: fileType || 'parent_profile_photo', fileType: fileType || 'parent_profile_photo' })
      });
    },
    async uploadFile(file: File | Blob, purpose: string = 'parent_profile_photo') {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);
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
  }
};
