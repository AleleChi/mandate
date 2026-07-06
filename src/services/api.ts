const TOKEN_KEY = 'koinonia_token';

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

    const res = await fetch(endpoint, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
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
    async forgotPassword(email: string) {
      return api.request<any>('/api/auth/forgot-password', {
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
    }
  }
};
