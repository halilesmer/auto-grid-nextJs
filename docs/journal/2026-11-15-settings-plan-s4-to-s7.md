---
date: 2026-11-15
author: Claude
type: plan
status: open
pr: []
features: [USR-09, USR-10, USR-11, USR-12, USR-14]
areas: [settings, formation, chart]
---

# Settings plan: S4 to S7 (approved by Halil, 2026-11-15)

## Request
Record the plan for the remaining steps of the settings dialog (plan 1114-A4). S1 (user preferences, dialog, Appearance), S2 (Notifications, Chart, migration of the news settings) and S3 (load gate, focus, tabs) are merged.

## Plan
- S4 and S5 run at the same time.
  - S4: connection states in the dialog and the header menu (this series, USR-14).
  - S5: the "VPS and system" section (`SystemSection.tsx`, `/vps`). Version, update check, update and restart, developer panel move there. S5 also removes the shutdown row in the dialog.
- S6, after S4: the formation alarm moves to the VPS. The personal fields of the alarm and "metrics fixed" become user preferences. Notifications gets a "Formation alarm" tab.
- S7, after S6: chart style preferences move to the VPS.
  - In scope: appearance, templates, toolbar, indicator defaults and favourites, drawing defaults and templates, layers, trend and formation styles.
  - Stays on the device: drawings, indicators added to a symbol, images.
  - The worker limits (8 KB per value, 20 keys) will most likely change.

## Why
S4 and S5 touch different files, so they can run together. S6 and S7 write more personal values to the worker and need the read-only state and the retry from S4.

## Open points
- New worker limits for S7 are not decided.
