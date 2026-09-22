'use client';

import { useState, useCallback } from 'react';
import type { UseMT5ScannerReturn } from '../types';
import { API, axiosInstance } from '@/lib/api';

export function useMT5Scanner(): UseMT5ScannerReturn {
  const [paths, setPaths] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (): Promise<string[]> => {
    setIsScanning(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`${API}/system/scan-mt5`);
      const found: string[] = res.data.paths || [];
      setPaths(found);
      return found;
    } catch (e) {
      setPaths([]);
      const errMsg = 'MT5 yolları taranırken sunucu hatası oluştu.';
      setError(errMsg);
      console.error('MT5 rescan failed', e);
      return [];
    } finally {
      setIsScanning(false);
    }
  }, []);

  return {
    paths,
    isScanning,
    error,
    scan,
  };
}