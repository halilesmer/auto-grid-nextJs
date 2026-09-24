import { create } from 'zustand';
import { UpdateInfo } from './types';

interface SystemState {
  updateInfo: UpdateInfo | null;

  setUpdateInfo: (info: UpdateInfo | null) => void;
  resetSystem: () => void;
}

const initialState = {
  updateInfo: null,
};

export const useSystemStore = create<SystemState>((set) => ({
  ...initialState,

  setUpdateInfo: (info) => set({ updateInfo: info }),

  resetSystem: () => set(initialState),
}));