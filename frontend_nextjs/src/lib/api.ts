import axios from 'axios';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://tweet-overlying-monotone.ngrok-free.dev';

export const API = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

export const axiosInstance = axios.create({
  baseURL: API,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
});