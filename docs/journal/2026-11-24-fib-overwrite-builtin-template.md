---
date: 2026-11-24
author: Claude
type: decision
status: open
features: [UI-27, UI-29]
areas: [frontend]
---

# Overwrite the built-in Fib template (1124-A7)

## Request
Halil chose the name "Geniş Fib seti" in "Farklı kaydet…" and saw a red warning: the built-in template cannot be overwritten. He wants to save over any existing name. Design approved on 2026-11-24.

## Solution
This entry changes decision A4.14.1 of [2026-11-10-fib-settings-dialog.md](2026-11-10-fib-settings-dialog.md). The name is still reserved: nobody can save a separate user template with it. But a save under that name now overwrites the built-in template.

- **1124-A7.1.1** The save window shows a grey info line (not red) when the name exists. The button says "Üzerine yaz" and stays enabled. Enter saves.
- **1124-A7.1.2** The code keeps `PRESET_LEVELS`. An overwrite stores the user copy at `drawingTemplates['fib-retracement']['__preset__']` (`PRESET_ID`). The store maps every reserved name to this key. Apply uses the copy, or `presetFibStyle()` when no copy exists. The key is not a row in the user list. Where the menu shows the built-in row (settings window, floating bar, right-click menu), a copy adds the tag "değiştirildi" and the button "Orijinal ayarlara dön", which deletes the copy. `parseDrawingTemplates` keeps `__preset__` for Fib only. The copy goes into `chart_fib_templates` with the other Fib templates, so the 8 KB limit is the same as before (one more template, about 3 KB).
- **1124-A7.1.3** The name field hint said "saved in this browser". Since S7 the worker holds the templates. The hint now says so.
- Other drawing kinds: an existing user template name gives the same grey info line. They have no built-in template, so the save window shows no built-in name for them (`preset` prop).

## Tests
`e2e/mocked/chart-fib-settings.spec.ts` (UI-27): overwrite, apply, restore. `e2e/mocked/chart-floating-bar-templates.spec.ts` (UI-29): floating bar row and reset button.
