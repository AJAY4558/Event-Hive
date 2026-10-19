import axios from 'axios';

/**
 * Typed Axios instance for all EventHive API calls.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15_000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('eventhive_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Structured error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const baseMessage = error.response.data?.error ?? 'An unexpected error occurred.';
      const fieldMessages = Object.values(error.response.data?.fields ?? {}).filter(Boolean);
      const message = fieldMessages.length
        ? `${baseMessage}: ${fieldMessages.join('; ')}`
        : baseMessage;
      const apiError = new Error(message);
      apiError.status = error.response.status;
      apiError.data = error.response.data;
      return Promise.reject(apiError);
    }
    if (error.request) {
      return Promise.reject(new Error('Network error — check your connection.'));
    }
    return Promise.reject(error);
  }
);

// Health check helper
export async function fetchHealth() {
  const res = await axios.get(
    (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000') + '/health'
  );
  return res.data;
}
