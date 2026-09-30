# Mit dem VPS-Worker verbinden (Web-UI)

Adresse und API-Key des Workers werden nicht im Build gespeichert, sondern einmal pro Browser im Dialog **„VPS verbinden“ / „Connect to VPS“** eingegeben (`localStorage`, Key `grid-robot-connection`). Sie gehen direkt vom Browser zum Worker, nie über den Vercel-Server.

## Wo stehen die Werte?

| Wert | Quelle |
|---|---|
| Worker-Adresse | `frontend_nextjs/.env.local` → `NEXT_PUBLIC_API_URL` (ohne `/api` am Ende eintragen) |
| API-Key (Admin) | `frontend_nextjs/.env.local` → `NEXT_PUBLIC_WORKER_API_KEY`; auf dem VPS ist es `WORKER_API_KEY` |
| Key eines normalen Benutzers | Admin legt ihn auf der Seite `/users` an, wird nur einmal angezeigt |
| Verbindungslink | wird am Ende des VPS-Setups ausgegeben, später erneut mit `worker_python/ops/windows/connect-link.ps1` |

**Keine Geheimnisse in dieses Repo schreiben** (weder Key noch Verbindungscode; der Code enthält den Key im Klartext).

## Schritte

1. Dialog öffnen („VPS verbinden“ in der Navigation).
2. **Variante A – Link/Code:** Verbindungslink oder Code (`#connect=…`) in „Connection link or code“ einfügen. Adresse und Key werden automatisch gefüllt.
   **Variante B – manuell:** „Worker address“ (z. B. `https://<name>.ngrok-free.dev`) und „API key“ (64 Zeichen) eintragen. Das Code-Feld bleibt leer.
3. **Test** klicken. Er ruft `GET /api/system/platform` auf.
4. Erst wenn der Test grün ist, wird **Connect** aktiv. Wird Adresse oder Key danach geändert, ist ein neuer Test nötig.

## Verbindungscode selbst erzeugen

Format: `base64url(UTF-8-JSON {"v":1,"u":"<Adresse>","k":"<Key>"})` (`src/lib/connectionCode.ts`):

```bash
node -e 'console.log(Buffer.from(JSON.stringify({v:1,u:"https://<name>.ngrok-free.dev",k:"<KEY>"})).toString("base64url"))'
```

## Wenn der Test fehlschlägt

- **401 / unauthorized:** Key falsch (oder nicht der Schlüssel des Workers, auf den die Adresse zeigt).
- **Nicht erreichbar:** Worker läuft nicht, oder die ngrok-Adresse hat sich nach einem Neustart geändert → aktuellen Link vom VPS holen (`connect-link.ps1`).
- **ngrok-Fehlercode:** wird im Dialog angezeigt; ngrok-Watchdog/Tunnel auf dem VPS prüfen (`docs/windows_start_guide.md`).
- Mixed Content: `http://`-Adressen von der https-Seite (Vercel) werden blockiert, nur `https://` verwenden.
