'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ServerCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useT } from '@/i18n';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useConnectionStore } from '@/store/useConnectionStore';

// Seiten, die ohne Worker-Verbindung funktionieren (die VPS-Seite spricht per SSH, nicht mit dem Worker)
const OPEN_PATHS = ['/vps'];

/**
 * Zeigt statt der Seite eine Anleitung, solange kein Worker eingetragen ist. Ohne das würden
 * Dashboard, Konten und Logs mit lauter Fehlern starten. Bis der Speicher gelesen ist, bleibt die
 * Seite leer: erst dann steht fest, ob eine Verbindung gespeichert ist.
 */
export default function ConnectionGate({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const show = useConnectionDialogStore((s) => s.show);

  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) return <>{children}</>;
  if (!hydrated) return null;
  if (baseUrl) return <>{children}</>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16" data-testid="connection-gate">
      <Card className="p-6 md:p-8">
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
          <ServerCog size={22} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{t('connection.gate.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('connection.gate.subtitle')}</p>

        <ol className="mt-6 space-y-3 text-sm text-foreground/90">
          {(['connection.gate.step1', 'connection.gate.step2', 'connection.gate.step3'] as const).map((key, i) => (
            <li key={key} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="pt-0.5">{t(key)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg border border-border bg-muted/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground/80">{t('connection.gate.mt5.title')}</p>
          <p className="mt-1">{t('connection.gate.mt5.body')}</p>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="mt-6"
          data-testid="connection-gate-connect"
          onClick={() => show()}
          hint={t('connection.gate.connect.hint')}
        >
          {t('connection.gate.connect')}
        </Button>
      </Card>
    </div>
  );
}
