const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }
  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  getMetrics: (token) => request('/metrics', { token }),
  getCases: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/cases${qs ? `?${qs}` : ''}`, { token });
  },
  getCase: (token, id) => request(`/cases/${id}`, { token }),
  runBatch: (token, size) => request('/simulate/batch', { method: 'POST', body: { size }, token }),
  clearDemoData: (token, mode = 'demo') => request('/simulate/clear', { method: 'POST', body: { mode }, token }),

  /**
   * Streams a batch replay, calling onResult(parsedLine) for each
   * newline-delimited JSON result as it arrives — this is what lets the
   * dashboard tick up live instead of jumping once at the end (FR-22).
   */
  async streamBatch(token, size, onResult, { pacingMs = 150 } = {}) {
    const response = await fetch(`${BASE_URL}/simulate/batch/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ size, pacingMs }),
    });

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || `Stream failed (${response.status})`, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) await onResult(JSON.parse(line));
      }
    }
    if (buffer.trim()) await onResult(JSON.parse(buffer.trim()));
  },
  triggerAction: (token, caseId) => request(`/cases/${caseId}/action`, { method: 'POST', token }),
  stopCase: (token, caseId, reason) => request(`/cases/${caseId}/stop`, { method: 'POST', body: { reason }, token }),
  getSettings: (token) => request('/settings', { token }),
  updateSettings: (token, settings) => request('/settings', { method: 'PUT', body: settings, token }),
};

export { ApiError };