---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: []
features: [LOG-07, ENG-27]
areas: [worker]
---

# Worker log lines use the setup label

## Request
Replace the list-position label "Bölge n" in the user-visible worker log lines with the setup label that the symbol logs (LOG-07) show.

## Cause
The engine wrote `Bölge {zone_idx+1}`. The zone list position changes when a zone is deleted, because the engine re-keys its state by `magic` (ENG-27). After a deletion, the number in the log no longer matched the setup card. The UI badge is "<Symbol> · Setup n", where n counts the setups of one symbol.

## Solution
| File | Change |
|---|---|
| `worker_python/src/core/grid_helpers.py` | New `zone_label(zone_idx, zones=None)`. It returns "<SYMBOL> · Setup n". n is the rank among the zones with the same symbol, as in the symbol card. Without `zones`, it reads `state.zones`. |
| `grid_zone_selector.py`, `grid_order_manager.py`, `grid_orders.py`, `grid_execution/{handler,instant_entry,vanished,fractal_entry}.py` | Log messages call `zone_label` instead of `Bölge {idx+1}`. Only message text changed. |

## Why
The worker had no label helper. A small helper next to `zone_log_id` keeps one rule. Docstrings, comments and generic wording ("Bölge listesi", "Bölge çıkışı") stay as they are: they do not name a position. If the index is not in the list, the label is "Setup (sıra n)".

## Verification
- `pytest tests`: 984 passed before the new test file.
- New tests in `tests/unit/test_log_setup_label.py` (LOG-07): 2 passed. One checks that the zone-entry line has "XAUUSD · Setup 2" and not "Bölge 3" or "Bölge 1".
- Not verified on the VPS: the worker can run only there.
