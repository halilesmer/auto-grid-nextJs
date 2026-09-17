import { create } from 'zustand';
import { UpdateInfo } from './types';

interface SystemState {
  isWindows: boolean;
  simulatedPrice: number;
  updateInfo: UpdateInfo | null;

  setIsWindows: (v: boolean) => void;
  setSimulatedPrice: (price: number) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  resetSystem: () => void;
}

const initialState = {
  isWindows: true,
  simulatedPrice: 75.0,
  updateInfo: null,
};

export const useSystemStore = create<SystemState>((set) => ({
  ...initialState,

  setIsWindows: (v) => set({ isWindows: v }),
  setSimulatedPrice: (price) => set({ simulatedPrice: price }),
  setUpdateInfo: (info) => set({ updateInfo: info }),

  resetSystem: () => set(initialState),
}));