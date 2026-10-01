'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Plug } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { probeWorker, type ProbeFailure, type ProbeResult } from '@/lib/connection';
import { decodeConnectionCode, hostOf, normalizeBaseUrl } from '@/lib/connectionCode';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionStore } from '@/store/useConnectionStore';

const FAILURE_KEYS: Record<ProbeFailure, MessageKey> = {
  invalid: 'connection.test.invalid',
  insecure: 'connection.test.insecure',
  missingKey: 'connection.test.missingKey',
  unauthorized: 'connection.test.unauthorized',
  timeout: 'connection.test.timeout',
  unreachable: 'connection.test.unreachable',
  notWorker: 'connection.test.notWorker',
};

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'done'; result: ProbeResult; url: string; key: string };

// Verbinden/Trennen ändern die gespeicherte Verbindung; danach lädt die Seite neu, weil alle
// anderen Stores (Konten, Einstellungen, Logs) zum alten Worker gehören und nur im Speicher liegen.
function ConnectionForm({ link, onClose, onRequestDisconnect }: {
  link: string;
  onClose: () => void;
  onRequestDisconnect: () => void;
}) {
  const t = useT();
  const savedUrl = useConnectionStore((s) => s.baseUrl);
  const savedKey = useConnectionStore((s) => s.apiKey);
  const me = useAuthStore((s) => s.me);

  // Anfangswerte: Verbindungs-Link, sonst die gespeicherte Verbindung
  const [initial] = useState(() => {
    const decoded = link ? decodeConnectionCode(link) : null;
    return { decoded, linkText: link, linkInvalid: Boolean(link) && !decoded };
  });
  const [linkText, setLinkText] = useState(initial.linkText);
  const [linkInvalid, setLinkInvalid] = useState(initial.linkInvalid);
  const [fromLink, setFromLink] = useState(Boolean(initial.decoded));
  const [url, setUrl] = useState(initial.decoded?.baseUrl ?? savedUrl);
  const [key, setKey] = useState(initial.decoded?.apiKey ?? (initial.linkText ? '' : savedKey));
  const [showKey, setShowKey] = useState(false);
  // Aus einem Link geöffnet: die Probe startet gleich (Effekt unten), bis dahin gilt „wird getestet"
  const [test, setTest] = useState<TestState>({ phase: initial.decoded ? 'testing' : 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // Setzt State erst nach dem await, darf so direkt im Effekt laufen
  const probe = useCallback(async (testUrl: string, testKey: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await probeWorker(testUrl, testKey, controller.signal);
    if (controller.signal.aborted) return;
    setTest({ phase: 'done', result, url: testUrl, key: testKey });
  }, []);

  const runTest = useCallback(
    (testUrl: string, testKey: string) => {
      setTest({ phase: 'testing' });
      void probe(testUrl, testKey);
    },
    [probe],
  );

  // Gleich testen, dann muss nur noch „Verbinden" bestätigt werden
  useEffect(() => {
    const decoded = initial.decoded;
    // Über einen Timer, damit der State nicht synchron im Effekt gesetzt wird (auch im Strict Mode nur eine Probe)
    const timer = decoded ? setTimeout(() => void probe(decoded.baseUrl, decoded.apiKey), 0) : undefined;
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [initial.decoded, probe]);

  const onLinkChange = (text: string) => {
    setLinkText(text);
    if (!text.trim()) {
      setLinkInvalid(false);
      return;
    }
    const decoded = decodeConnectionCode(text);
    setLinkInvalid(!decoded);
    if (!decoded) return;
    setUrl(decoded.baseUrl);
    setKey(decoded.apiKey);
    setFromLink(true);
    runTest(decoded.baseUrl, decoded.apiKey);
  };

  const edited = () => setFromLink(false);

  const trimmedUrl = url.trim();
  const tested = test.phase === 'done' && test.url === trimmedUrl && test.key === key ? test.result : null;
  const canConnect = tested?.ok === true;
  const previewHost = normalizeBaseUrl(url);

  const connect = () => {
    if (!tested?.ok) return;
    useConnectionStore.getState().setConnection({ baseUrl: tested.baseUrl, apiKey: key });
    window.location.reload();
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (canConnect) connect();
    else if (trimmedUrl) runTest(trimmedUrl, key);
  };

  return (
    <div className="space-y-4" data-testid="connection-dialog">
      <p className="text-sm leading-relaxed text-muted-foreground">{t('connection.dialog.intro')}</p>

      {me && savedUrl && (
        <p className="text-xs font-medium text-foreground" data-testid="connection-identity">
          {t('auth.identity', { name: me.name, role: t(me.role === 'admin' ? 'auth.role.admin' : 'auth.role.user') })}
        </p>
      )}

      {fromLink && previewHost && (
        <div data-testid="connection-from-link">
          <Alert tone="warning" title={t('connection.fromLink.title')}>
            {t('connection.fromLink.body', { host: hostOf(previewHost) })}
          </Alert>
        </div>
      )}

      <InputField
        label={t('connection.field.link')}
        hint={t('connection.field.link.hint')}
        error={linkInvalid && <span className="text-[11px] font-semibold text-danger">{t('connection.link.invalid')}</span>}
      >
        <input
          className="input-s"
          data-testid="connection-link"
          value={linkText}
          onChange={(e) => onLinkChange(e.target.value)}
          placeholder={t('connection.field.link.placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </InputField>

      <InputField label={t('connection.field.url')} hint={t('connection.field.url.hint')}>
        <input
          className="input-s"
          data-testid="connection-url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            edited();
          }}
          onKeyDown={onEnter}
          placeholder={t('connection.field.url.placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </InputField>

      <InputField label={t('connection.field.key')} hint={t('connection.field.key.hint')}>
        <div className="relative">
          <input
            className="input-s pr-10"
            data-testid="connection-key"
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              edited();
            }}
            onKeyDown={onEnter}
            placeholder={t('connection.field.key.placeholder')}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Tooltip
            content={t(showKey ? 'connection.key.hide.hint' : 'connection.key.show.hint')}
            className="absolute right-1 top-1/2 -translate-y-1/2"
          >
            <button
              type="button"
              data-testid="connection-key-toggle"
              aria-label={t(showKey ? 'connection.key.hide' : 'connection.key.show')}
              aria-pressed={showKey}
              onClick={() => setShowKey((v) => !v)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </Tooltip>
        </div>
      </InputField>

      <div aria-live="polite" data-testid="connection-test-result">
        {test.phase === 'testing' && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="connection-test-testing">
            <Loader2 className="size-3.5 animate-spin" />
            {t('connection.test.testing')}
          </p>
        )}
        {tested?.ok === true && (
          <div
            data-testid="connection-test-ok"
            className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/[0.07] px-3.5 py-3 text-sm text-success"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words text-foreground/80">
              {t('connection.test.ok', { host: hostOf(tested.baseUrl), platform: tested.platform })}
            </span>
          </div>
        )}
        {tested && !tested.ok && (
          <div data-testid="connection-test-error" data-reason={tested.reason}>
            <Alert tone={tested.reason === 'unauthorized' || tested.reason === 'missingKey' ? 'warning' : 'danger'}>
              {tested.ngrokCode
                ? t('connection.test.unreachable.ngrok', { code: tested.ngrokCode })
                : t(FAILURE_KEYS[tested.reason])}
              {tested.detail && (
                <span
                  data-testid="connection-test-detail"
                  className="mt-1 block break-all font-mono text-[11px] text-muted-foreground"
                >
                  {t('connection.test.detail', { detail: tested.detail, url: tested.probedUrl ?? '' })}
                </span>
              )}
            </Alert>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t('connection.dialog.privacy')}</p>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {savedUrl && (
          <Button
            variant="ghost"
            data-testid="connection-disconnect"
            wrapperClassName="mr-auto"
            className="text-danger hover:text-danger"
            onClick={onRequestDisconnect}
            hint={t('connection.action.disconnect.hint')}
          >
            {t('connection.action.disconnect')}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose} hint={t('common.cancel.hint')}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="secondary"
          data-testid="connection-test"
          disabled={!trimmedUrl}
          loading={test.phase === 'testing'}
          onClick={() => runTest(trimmedUrl, key)}
          hint={t('connection.action.test.hint')}
        >
          {t('connection.action.test')}
        </Button>
        <Button
          variant="primary"
          data-testid="connection-connect"
          disabled={!canConnect}
          onClick={connect}
          hint={t('connection.action.connect.hint')}
        >
          {t('connection.action.connect')}
        </Button>
      </div>
    </div>
  );
}

// Einmal im Layout eingebunden; Chip, Leerzustand und Link-Auswertung öffnen ihn über useConnectionDialogStore.
export default function ConnectionDialog() {
  const t = useT();
  const open = useConnectionDialogStore((s) => s.open);
  const link = useConnectionDialogStore((s) => s.link);
  const nonce = useConnectionDialogStore((s) => s.nonce);
  const hide = useConnectionDialogStore((s) => s.hide);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Modal
        open={open}
        onClose={hide}
        title={t('connection.dialog.title')}
        icon={
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Plug size={18} />
          </div>
        }
      >
        <ConnectionForm key={nonce} link={link} onClose={hide} onRequestDisconnect={() => setConfirmOpen(true)} />
      </Modal>

      {/* Außerhalb des Modals: dessen transform würde das fixed-Modal darin auf die Karte begrenzen */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          useConnectionStore.getState().clearConnection();
          window.location.reload();
        }}
        title={t('connection.disconnect.title')}
        message={t('connection.disconnect.message')}
        confirmLabel={t('connection.action.disconnect')}
        confirmHint={t('connection.disconnect.confirm.hint')}
        variant="warning"
      />
    </>
  );
}
