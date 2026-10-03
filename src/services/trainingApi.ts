import { api } from './api';

export const trainingApi = {
  getProgrammes: async () => {
    return api.request<{ success: boolean; programmes: any[] }>('/api/training/programmes');
  },
  createProgramme: async (data: any) => {
    return api.request<{ success: boolean; id: string; message: string }>('/api/training/programmes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  getScenarios: async () => {
    return api.request<{ success: boolean; scenarios: any[] }>('/api/training/scenarios');
  },
  getScenarioDetail: async (scenarioId: string) => {
    return api.request<{ success: boolean; scenario: any }>('/api/training/scenarios/' + scenarioId);
  },
  createScenario: async (data: any) => {
    return api.request<{ success: boolean; id: string; message: string }>('/api/training/scenarios', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  getSessions: async () => {
    return api.request<{ success: boolean; sessions: any[] }>('/api/training/sessions');
  },
  createSession: async (data: any) => {
    return api.request<{ success: boolean; sessionId: string; message: string }>('/api/training/sessions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  getSessionDetail: async (sessionId: string) => {
    return api.request<{ success: boolean; session: any }>('/api/training/sessions/' + sessionId);
  },
  joinSession: async (sessionId: string, trainingRole: string) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/join', {
      method: 'POST',
      body: JSON.stringify({ trainingRole })
    });
  },
  startSession: async (sessionId: string) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/start', {
      method: 'POST'
    });
  },
  pauseSession: async (sessionId: string) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/pause', {
      method: 'POST'
    });
  },
  resumeSession: async (sessionId: string) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/resume', {
      method: 'POST'
    });
  },
  completeSession: async (sessionId: string) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/complete', {
      method: 'POST'
    });
  },
  resetSession: async (sessionId: string) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/reset', {
      method: 'POST'
    });
  },
  getSessionActivity: async (sessionId: string) => {
    return api.request<{ success: boolean; activity: any[] }>('/api/training/sessions/' + sessionId + '/activity');
  },
  getSessionDebrief: async (sessionId: string) => {
    return api.request<{ success: boolean; debrief: any }>('/api/training/sessions/' + sessionId + '/debrief');
  },
  addObservation: async (sessionId: string, data: { category: string; note: string; participantUserId?: string; objectiveId?: string }) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/observations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  checkInChild: async (sessionId: string, data: { childId?: string; passCode?: string }) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/check-in', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  pickupChild: async (sessionId: string, data: { childId: string; collectorName: string }) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/pickup', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  raiseAlert: async (sessionId: string, data: { category: string; severity: string; message: string; locationLabel?: string; childId?: string }) => {
    return api.request<{ success: boolean; alertId: string; message: string }>('/api/training/sessions/' + sessionId + '/alerts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  respondAlert: async (sessionId: string, alertId: string, data: { actionType: 'acknowledge' | 'own' | 'resolve'; note?: string }) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/alerts/' + alertId + '/action', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  createIncident: async (sessionId: string, data: { category: string; summary: string; details?: string; followUps?: any[] }) => {
    return api.request<{ success: boolean; incidentId: string; message: string }>('/api/training/sessions/' + sessionId + '/incidents', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  triggerRealConcern: async (sessionId: string) => {
    return api.request<{ success: boolean; message: string }>('/api/training/sessions/' + sessionId + '/real-concern', {
      method: 'POST'
    });
  }
};
