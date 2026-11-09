---
date: 2026-11-08
author: Claude
type: plan
status: open
pr: []
features: [ACC-12]
areas: [worker, frontend, docs]
---

# Plan 1107-A20: media files in the account settings

The project owner approved this plan on 2026-11-08, with the decisions 1107-A20.1 to 1107-A20.5. The plan has four steps. Each step runs in its own session and its own PR.

## Request
The account settings dialog (`AccountForm`, below the notes field) gets a media section. One account holds at most 3 files: PDF, image or note. A file downloads only when the user clicks it, so the system stays fast. A preview window and a separate component show the file.

## Solution
Step S1 adds the worker API. The files are in `data/media/<account>/` with `index.json` and one `<mediaId>.<ext>` per file. `mediaId` is 12 hex characters. The file name lives only in the metadata (clean, 120 characters at most).

| Route | Result |
|---|---|
| `GET /api/accounts/{id}/media` | `items` (`id`, `name`, `kind`, `mime`, `size`, `created_at`), `limit` 3, `max_bytes` per kind. No file bytes. |
| `POST /api/accounts/{id}/media?name=` | 201 and the new item. The body is raw bytes (no multipart). |
| `GET /api/accounts/{id}/media/{mediaId}` | The file. Headers: stored `Content-Type`, `Content-Disposition: inline`, `nosniff`, `Content-Security-Policy: sandbox`, immutable private cache. |
| `DELETE /api/accounts/{id}/media/{mediaId}` | `{"deleted": id}` |

Every route uses `account_access`. Rules:

- A 4th file gives 409. The count is checked before the upload and again at commit, under a lock for each account.
- The type comes from the first bytes: PDF, PNG, JPEG, WebP. A note is a `.txt` or `.md` name with valid UTF-8 and no NUL byte. All other content gives 415.
- Limits: image and PDF 10 MB, note 1 MB (413). The upload streams to a `.part` file. The upper limit is 10 MB until the type is known.
- The account delete keeps the media. A new account (or a rename to an id) with a different owner deletes the old folder. If the delete fails, the account is not created (fail-closed). An owner change by the administrator does the same.

## Why
The decisions of the project owner:

- 1107-A20.1: the card shows no thumbnail, only an icon. This keeps the list light.
- 1107-A20.2: image and PDF up to 10 MB, note up to 1 MB.
- 1107-A20.3: the browser scales a JPEG or WebP above 2 MB down to 2560 px before the upload. A PNG stays as it is. This is work of S2.
- 1107-A20.4: the delete rule above. It is the same rule as 1107-A6.3 for the deal archive.
- 1107-A20.5: a note is plain text. Markdown is not rendered.

Rejected: multipart upload (needs a new dependency; the raw body pattern exists in `market.py`) and trust in the client MIME type (an HTML file named `.png` would run in the browser).

## Steps
| Step | Content | State |
|---|---|---|
| S0 | Design as an Artifact, main session | open |
| S1 | Worker API, tests, ACC-12 | this PR |
| S2 | Frontend: `src/components/account/media/` (`AccountMedia`, `MediaSlot`, `MediaPreviewDialog`, `useAccountMedia`), `src/services/mediaApi.ts`, lazy download as blob, mock worker, e2e ACC-12 and ACC-13 | open |
| S3 | Live test on the VPS and sign-off | done 2026-11-09 |

## Open points
No open points.

## Live test (2026-11-09, S3)
Worker on the VPS: v0.7.519, which includes the merge of S2. Browser: built-in browser on `localhost:3000`, connected to the live worker.

Account: a DEMO account (checked with `env_type`) without a running bot. The first test account had a running bot. The edit form is locked while a bot runs (ACC-04), so the Media section cannot open. The bot was not stopped.

Result of the UI flow (ACC-13):
- The form opened with no file download. The network log shows only list requests (`GET .../media`).
- Upload of a 200 B PDF, a 7.6 MB JPEG (4000 x 3000) and a .txt: each card shows up. The JPEG card shows "3 MB". The preview shows 2560 x 1920 pixels. The browser scaled it down before the upload.
- A click on the card opened the preview. The file came from one `GET .../media/<id>`, and only then.
- A 4th file gave the message "At most 3 files" in the UI.
- Escape closed only the preview. The form stayed open.

Result of the API checks (ACC-12), with `X-API-Key`:
- Each download has `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` and `Cache-Control: private, max-age=31536000, immutable`.
- A 4th upload gives 409. SVG, HTML and HEIC give 415 (checked with a free slot).
- Delete gives 200. At the end the account had no media files.
- `media.py` and `account_media.py` use only `get_media_dir`. The calls do not touch bot settings or the account list.

Not tried: no file larger than 10 MB (413) and no PNG. The mocked tests and the worker tests cover them.

## Read-only live suite (same day)
`run.sh live` found two red tests that had no link to media. Both were old test assumptions, not product defects:
- MET-03: `/chart` opens the stream only for a selected account, and the account comes from `?account=`. The test now opens `/chart?account=<id>`. The floating card starts closed (UI-22), so the test opens it before it reads the price.
- MET-01: the test read the Turkish number `4.102,17` as 4.1, and it compared the first card with the price of another symbol. It now parses the display format and compares with `symbol_prices` of the card symbol.
After the fix `run.sh live MET` gives 2 passed.

Lesson: a live test that does not select the account itself can pass by accident. Select the account in the URL or in the UI.
