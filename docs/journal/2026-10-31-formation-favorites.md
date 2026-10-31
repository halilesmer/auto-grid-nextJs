---
date: 2026-10-31
author: Claude
type: feature
status: open
pr: []
features: [FRM-28]
areas: [worker, frontend, tests]
---

# Formation page gets favorite products

## Request
- Mark products as favorites on `/formasyon`, like on TradingView. The user sees a flag next to the selected product and next to each product in the search.
- This is PR A of two. PR B (search over favorites, side bar, prices, FRM-29) follows.
- Halil decided: favorites belong to the account and live on the VPS, so every device shows the same list. A flag replaces the star of the first plan.

## Solution
| File | Change |
|---|---|
| `worker_python/src/api/favorites.py` | `GET` and `PUT /favorites/{account_id}`, both with `account_access`. |
| `worker_python/src/utils/paths.py` | `get_favorites_path()`: `configs/favorites_<digits>.json`. The account id is cleaned like for settings. |
| `worker_python/src/api/models.py` | `FavoritesModel`: at most 200 symbols of 1 to 40 characters. Duplicates drop out, order stays. |
| `worker_python/src/api/accounts.py` | Deleting an account deletes its favorites file. |
| `useFavoritesStore.ts`, `useFavorites.ts`, `favoritesApi.ts` | Load per account. A toggle shows at once and is undone with a message when saving fails. |
| `FormationSelectors.tsx` | `SymbolSearch` replaces `SymbolAutoComplete` on this page and adds the flag in the pill and in each list row. |
| `ui/combobox.tsx` | New option `tabSelects` (default on). Off, Tab moves to the flags. |

## Why
- `configs/*.json` is already ignored by git, so the new file needs no new rule. The write uses a temporary file and `os.replace`; `_atomic_write` in `state_manager.py` is private, so the route has its own four lines.
- A broken file reads as an empty list. The next `PUT` repairs it.
- `ui_state` is not used: it holds only zone states and is cleared at start.
- `SymbolAutoComplete` is shared with the zone cards and has a fixed row, so no flag goes in. The page has its own search on `ComboboxAutocomplete` with the same FRM-25 rules: search by name or description, only a list entry is taken, cancel restores the product.
- A toggle is ignored until the list of the account has loaded. A write before that would replace the saved favorites with one symbol.
- Last write wins when two devices write at once. For a personal list this is enough.
- The worker runs the new route only after the VPS pulls and restarts.
