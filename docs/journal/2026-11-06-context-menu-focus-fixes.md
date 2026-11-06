---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: [405]
features: [FRM-47]
areas: [frontend, tests, docs]
---

# Context menu: keyboard and focus fixes

## Request
The Opus audit (R2) of the line menu (PR 395) found four gaps. The project owner approved the fixes before the work started. This entry covers R2-01, R2-02, R2-07 and R2-09.

## Cause
| ID | Symptom | Cause |
|---|---|---|
| R2-01 | With the menu open, the arrow keys, Home and End act on the menu from anywhere on the page. Tab leaves the menu but the menu stays open. | `onKey` in `context-menu.tsx` listens on `window` in the capture phase and does not check where the focus is. No `focusout` closes the menu. |
| R2-02 | After the menu closes, the focus goes to `body`. | The effect did not save the element that had the focus before. |
| R2-07 | The catalog said that the D zone opens the menu. | The D zone has no hit area. The approved design agrees with the code. |
| R2-09 | FRM-47 tests did not test arrow keys, focus, scroll, resize or edge position. Two theme tests only took a screenshot. | The tests were never written. |

## Solution
| File | Change |
|---|---|
| `src/components/ui/context-menu.tsx` | Arrow, Home and End keys only act when the focus is in the menu (same pattern as `dropdown-menu.tsx`). `focusout` to an element outside the menu closes it. `relatedTarget` null (window loses focus) does not close it. The previous focused element gets the focus back on close. The close callback is kept in a ref, so a new `onClose` does not rebuild the listeners. |
| `e2e/mocked/formation-line-menu.spec.ts` | New tests: arrow, Home, End; Tab out; outside arrow key; focus return after Escape; scroll and resize; menu at the bottom right corner; `defaultPrevented` on empty area. The two theme tests now check the menu background color. |
| `docs/features/features.yaml` | FRM-47 text: D zone removed, keyboard and focus behavior added. |

## Verification
Red proof before the fix (`formation-line-menu.spec.ts`, 3 failed, 13 passed): Tab out left the menu open, the outside ArrowDown pulled the focus, and Escape left the focus not on the earlier element. After the fix, the whole spec and `scripts/features/precheck.sh` are green (see the PR).

## Lessons
A key listener on `window` must check the focus first. Write the keyboard test together with the component.
