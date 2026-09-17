import axios from 'axios';

const rawAPI = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const API = rawAPI.endsWith('/api') ? rawAPI : `${rawAPI}/api`;

export const axiosInstance = axios.create({
  baseURL: API,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
});

export const API_URL = API;