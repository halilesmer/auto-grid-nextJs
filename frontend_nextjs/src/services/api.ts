import axios from 'axios';
import { WORKER_HEADERS } from '@/lib/api';

const rawAPI = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const API = rawAPI.endsWith('/api') ? rawAPI : `${rawAPI}/api`;

export const axiosInstance = axios.create({
  baseURL: API,
  headers: { ...WORKER_HEADERS },
});

export const API_URL = API;