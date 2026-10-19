import { t } from '@/i18n';
import { axiosInstance } from '@/lib/api';
import type { Report, ReportContent, ReportSummary } from '@/lib/backtest/liveCompare';

const URL = '/backtest/reports';
const OPTIONS = { timeout: 30_000 };

/** Mindestprüfung der Antwort: ein Worker, der etwas anderes liefert, ist älter oder defekt */
function isSummary(value: unknown): value is ReportSummary {
  const item = value as Partial<ReportSummary> | null;
  return Boolean(item) && typeof item?.id === 'string' && typeof item.name === 'string' && typeof item.createdAt === 'number';
}
function parseReport(value: unknown): Report {
  const item = value as Partial<Report> | null;
  if (!isSummary(value) || !Array.isArray(item?.symbols) || !Array.isArray(item.zones) || !item.tolerance) {
    throw new Error(t('backtest.live.invalid'));
  }
  return value as Report;
}

export async function listReports(signal?: AbortSignal): Promise<ReportSummary[]> {
  const response = await axiosInstance.get(URL, { ...OPTIONS, signal });
  if (!Array.isArray(response.data?.reports) || !response.data.reports.every(isSummary)) throw new Error(t('backtest.live.invalid'));
  return response.data.reports;
}
export async function getReport(id: string, signal?: AbortSignal): Promise<Report> {
  const response = await axiosInstance.get(`${URL}/${encodeURIComponent(id)}`, { ...OPTIONS, signal });
  return parseReport(response.data?.report);
}
export interface ReportInput extends ReportContent {
  requestId: string;
  name: string;
  note: string;
  accountId: string;
  periodFrom: number;
  periodTo: number;
}
export async function saveReport(input: ReportInput): Promise<Report> {
  const response = await axiosInstance.post(URL, input, OPTIONS);
  return parseReport(response.data?.report);
}
export async function deleteReport(id: string): Promise<void> {
  await axiosInstance.delete(`${URL}/${encodeURIComponent(id)}`, OPTIONS);
}
