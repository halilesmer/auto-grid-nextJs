<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## State Synchronization Pattern

### Global Store as Source of Truth
Use Zustand stores (`useAccountStore`, `useSettingsStore`, `useSystemStore`, `useBotRuntimeStore`, `useLogsStore`) as the single source of truth for shared data across components.

### Sync Pattern for API-Fetching Hooks
When a hook fetches data that should be globally available, **always sync to the global store**:

```typescript
// ✅ CORRECT: Sync to global store after fetch
const fetchAccounts = useCallback(async () => {
  const res = await axiosInstance.get(`${API}/accounts`);
  const accounts = res.data.accounts || [];
  setAccounts(accounts);                    // Local state
  useAccountStore.getState().setAccounts(accounts);  // Global store
}, []);

// ❌ WRONG: Only local state (causes 409 errors, stale dropdowns)
const fetchAccounts = useCallback(async () => {
  const res = await axiosInstance.get(`${API}/accounts`);
  setAccounts(res.data.accounts || []);  // Missing global sync!
}, []);
```

### Mutation Flow
For create/update/delete operations:
1. Call API
2. Call `fetchAccounts()` to refresh global store (preferred)
   - Or directly update global store for immediate consistency

### Component Consumption
Components read from global store, not hook-local state:
```typescript
const storeAccounts = useAccountStore((s) => s.accounts);
```

### Intentional Local-Only State (No Global Store)
Some hooks intentionally manage only local state when data isn't shared globally:
- `useMT5Scanner` - MT5 paths used only in AccountForm dialog
- No global store needed → no sync required

### Files Reference
- `src/store/useAccountStore.ts` - Global account store
- `src/components/account/hooks/useAccounts.ts:13-28` - Correct sync implementation
- `src/components/account/AccountSelector.tsx:22,41` - Correct consumption pattern