'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { VPS_LOGS, type VpsLog } from '@/lib/vps';

const LABELS: Record<VpsLog, string> = {
  worker: 'Worker',
  ngrok: 'ngrok',
  update: 'Update',
};

interface Props {
  logName: VpsLog;
  lines: string[];
  note: string | null;
  loading: boolean;
  onSelect: (log: VpsLog) => void;
  onRefresh: () => void;
}

export default function VpsLogViewer({ logName, lines, note, loading, onSelect, onRefresh }: Props) {
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <Card>
      <CardHeader
        title="Logs vom VPS"
        description="Letzte 300 Zeilen"
        icon={<ScrollText size={16} />}
        actions={
          <Button size="icon-sm" variant="ghost" onClick={onRefresh} loading={loading} aria-label="Log neu laden">
            {!loading && <RefreshCw size={14} />}
          </Button>
        }
      />
      <CardContent className="space-y-3">
        <AnimatedTabs
          tabs={VPS_LOGS.map((id) => ({ id, label: LABELS[id] }))}
          activeTab={logName}
          onChange={(id) => onSelect(id as VpsLog)}
          variant="segment"
          layoutId="vps-log-tabs"
        />
        <pre
          ref={scrollRef}
          data-testid="vps-log-output"
          className="h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
        >
          {lines.length > 0 ? lines.join('\n') : <span className="text-muted-foreground">{note || 'Keine Einträge'}</span>}
        </pre>
      </CardContent>
    </Card>
  );
}
