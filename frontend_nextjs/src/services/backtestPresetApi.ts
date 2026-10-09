import { t } from '@/i18n';
import { axiosInstance } from '@/lib/api';
import { parsePreset, type PresetData } from '@/lib/backtest/presets';

const URL = '/backtest/presets';
const OPTIONS = { timeout: 30_000 };
export async function listPresets(signal?: AbortSignal) {
  const response = await axiosInstance.get(URL, { ...OPTIONS, signal });
  if (!Array.isArray(response.data?.presets)) throw new Error(t('backtest.presets.invalid'));
  return response.data.presets.map(parsePreset);
}
export async function savePreset({ name, data, requestId }: { name: string; data: PresetData; requestId: string }) {
  const response = await axiosInstance.post(URL, { ...data, name, requestId }, OPTIONS);
  return parsePreset(response.data.preset);
}
export async function renamePreset(id: string, name: string) {
  const response = await axiosInstance.put(`${URL}/${encodeURIComponent(id)}`, { name }, OPTIONS);
  return parsePreset(response.data.preset);
}
export async function deletePreset(id: string) {
  await axiosInstance.delete(`${URL}/${encodeURIComponent(id)}`, OPTIONS);
}
