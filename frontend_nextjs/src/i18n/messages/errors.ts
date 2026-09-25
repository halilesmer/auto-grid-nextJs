import { defineArea } from './define';

export default defineArea(
  {
    'error.timeout': 'istek zaman aşımına uğradı',
    'error.unreachable': 'worker’a ulaşılamıyor (VPS veya ngrok çevrimdışı mı?)',
    'error.ngrok': 'ngrok tüneli çevrimdışı ({code}) – worker VPS’te çalışıyor mu?',
    'error.http': '(HTTP {status})',
  },
  {
    'error.timeout': 'request timed out',
    'error.unreachable': 'worker not reachable (VPS or ngrok offline?)',
    'error.ngrok': 'ngrok tunnel offline ({code}) – is the worker running on the VPS?',
    'error.http': '(HTTP {status})',
  },
  {
    'error.timeout': 'Zeitüberschreitung der Anfrage',
    'error.unreachable': 'Worker nicht erreichbar (VPS oder ngrok offline?)',
    'error.ngrok': 'ngrok-Tunnel offline ({code}) – läuft der Worker auf dem VPS?',
    'error.http': '(HTTP {status})',
  },
);
