# OSDS E-Library V2

A document library for the Office of Student Development and Services. Staff upload files against a
fixed category taxonomy, a year (1994–present), optional month, and shared tags; everything is
browsable from a category tree.

Same stack and theme as the OSDS Office Management System:

- React + Vite + TypeScript
- Tailwind CSS v3.4.17
- shadcn-style local UI components
- Google Apps Script backend
- Google Sheets for metadata, Google Drive for the files

## Access rules

- The signed-in Google account must be on the **ched.gov.ph** domain, **and**
- it must exist in the `Users` sheet with **STATUS = ACTIVE**.

Domain membership alone is not enough — a ched.gov.ph account that is not on the user list is
refused. Every account that passes both checks can browse and download the whole library and can
upload and tag documents.

| | Staff | Administrator |
|---|---|---|
| Browse / download every document | yes | yes |
| Upload documents | yes | yes |
| Create tags | yes | yes |
| Edit / delete a document | own uploads only | any |
| Rename / delete a tag | no | yes |
| Settings > User Management | no | yes |

The **Administrator** is the host account, `osdsrecords@ched.gov.ph`, set in
`apps-script/Code.gs` (`ADMIN_HOST_EMAIL`) and `frontend/src/lib/permissions.ts`. It cannot be
deactivated, deleted, or renamed from the UI.

## Categories

Documents are filed under a category path plus a year, and — for CEB Matters only — a month.

```
Issuances > CHED Memorandum Orders                                  > Year
Issuances > CHED Administrative Orders                              > Year
Issuances > Joint Administrative Orders                             > Year
Issuances > Joint Memorandum Circulars                              > Year
Issuances > Joint Advisories                                        > Year
Issuances > Memorandum from the Office of the Chairperson           > Year
Issuances > Memorandum from the Office of the Executive Director    > Year
Legal Bases                                                         > Year
Significant Communication                                           > Year
Physical and Financial Reports                                      > Year
CEB Matters                                                         > Year > Month
Office Order/Memorandum                                             > Year
Audit Query/Observation Memorandum                                  > Year
Budget                                                              > Year
Work and Financial Plan                                             > Year
Reports                                                             > Year
Complaints                                                          > Year
Freedom of Information                                              > Year
Position Papers                                                     > Year
```

In the sidebar a category lists only the years that actually hold documents, with a
**Show all years (1994–…)** toggle to reveal the full range for filing. A category with nothing in it
shows "No documents yet" rather than three decades of empty rows.

Year and month are deliberately **not** part of the stored category path — they are bounded,
generated ranges (1994 through the current year), so keeping them as their own fields makes
filtering and cross-year search straightforward.

Path segments are joined with `::`, not `/`, because one category is literally named
`Office Order/Memorandum`. The taxonomy is defined twice on purpose:

- `frontend/src/lib/categories.ts` — drives the sidebar, breadcrumb, and Category dropdown
- `apps-script/Code.gs` (`CATEGORY_LEVELS`) — server-side validation, so a stale client cannot
  file a document under a category that does not exist

**Keep the two in sync when the taxonomy changes.**

### Renaming a category

A category's label **is** its stored `category_path`, so renaming one orphans every document already
filed under the old string: those rows stop resolving, disappear from the sidebar, and can no longer
be edited. They are not lost — orphans still list under **All Documents** and can be refiled with
Move — but they vanish from their category until repointed.

**If the category being renamed already holds documents**, run `renameCategoryPath(oldPath, newPath)`
once from the editor after deploying. It repoints the affected rows and renames the matching Drive
folder so the files travel with them. Only the last segment may change — moving a category under a
different parent is refused rather than half-applied — and it will not rename into a folder name
that already exists, reporting that case for a manual merge instead of creating a duplicate.

Renaming an **empty** category needs no migration; just deploy.

## Upload dialog

Fields, in order: **Name**, **Browse file**, **Category**, **Year** (+ **Month** for CEB Matters),
**Tags**, **Remarks**. Actions: **Cancel**, **Save Another**, **Save**.

- **Save Another** keeps the category, year, month, and tags and clears only the name, file, and
  remarks — staff usually file a run of documents into the same folder in one sitting.
- Opening the dialog while a category/year is selected in the sidebar pre-fills that destination.
- Accepted: PDF, Word, Excel, and images. Maximum **15 MB** (`MAX_UPLOAD_BYTES`).

## Tags

Tags are a shared vocabulary stored in the `Tags` sheet; documents keep a denormalized
comma-separated `tags` column, and renaming or deleting a tag rewrites every affected document.

Two entry points for creating one:

1. **`+ Add Tags`** on the Tags field's label row inside the upload dialog — creating a tag is
   offered exactly where the user discovers the gap, mid-upload. The newly created tag is
   auto-selected for the document being filed. (A `New Tag` button at the foot of the tag list does
   the same thing.)
2. **Settings > Tags**, for bulk curation — showing each tag's description and how many documents
   use it, so a delete is an informed one.

`Office of the Director` is seeded as a starter tag.

## Search

One search, in the header, covering the whole library. It is keyword search over name, tags, and
remarks, with a rules-based front end that lifts recognised tokens out of the query and turns them
into removable **category / year / month chips** — so staff can type the shorthand they already use:

| Typed | Becomes |
|---|---|
| `CMO 2016` | Issuances > CHED Memorandum Orders + 2016 |
| `CMO 16 2026` | CHED Memorandum Orders + 2026 + **No. 16** |
| `AOM 2023` | Audit Query/Observation Memorandum + 2023 |
| `CEB August 2025` | CEB Matters + 2025 + August |
| `office order s. 2025` | Office Order/Memorandum + 2025 |
| `WFP series of 1994` | Work and Financial Plan + 1994 |

**Issuance numbers.** A bare number that is not a year — `16`, `No. 16`, `#16` — becomes a number
filter matched against the document title on word boundaries with optional leading zeros. So `16`
finds "No. 16" and "No. 016" but not "No. 160", "No. 116", or the 16 inside "s. 2016". The year is
claimed first, which is what lets `CMO 16 2026` split cleanly into number 16 and year 2026.

Recognised abbreviations: `CMO`, `CAO`/`AO`, `JAO`, `JMC`, `JA`, `AOM`, `OO`, `WFP`, `CEB`, `FOI`,
plus the spelled-out category names. **Every category in the tree has an alias** — when a category is
added, add one here too, or typing its name falls through to a plain keyword search. **A bare `AO` means a CHED Administrative Order**; the joint variant must
be written `JAO`. Years accept `2016`, `s. 2016`, and `series of 1994`.

The query is split on slashes as well as spaces, so typing or pasting a category's own name works
for the two that contain one — `Office Order/Memorandum` and `Audit Query/Observation Memorandum`.
Every category in the tree resolves to itself when typed verbatim; that invariant is worth
re-checking whenever an alias is added, since a short alias can otherwise shadow a longer name.

Whatever the parser does not claim is treated as keyword terms; every term must appear somewhere,
and hits in the name outrank tags, which outrank remarks.

Searching and browsing are one mode at a time: a search always covers the whole library (otherwise
`CMO 2016` typed while sitting in Budget would find nothing), and clicking a category clears the
search. Metadata only — no PDF text is read.

## Ask

An opt-in AI assistant beside the search box. It answers from document **metadata only** — title,
category, year, month, tags, remarks — so it can tell you which documents exist and how they are
filed, but never what a document says inside. The panel states this, because otherwise "what does
CMO 01 require?" reads as a broken feature rather than an out-of-scope question.

- Provider is chosen by the `AI_PROVIDER` script property (default `gemini`) and implemented in the
  `AI_PROVIDERS` adapter in `Code.gs`, so swapping vendors is a config change plus one entry.
- The API key lives in Script Properties and never reaches the browser.
- Requires the `script.external_request` OAuth scope (already in `appsscript.json`).
- Document ids returned by the model are filtered against the real library, so a hallucinated
  citation can never be displayed.
- The prompt is capped at `ASK_MAX_DOCUMENTS` (100) documents, shortlisted by keyword overlap, which
  keeps each question well inside Groq's free-tier tokens-per-minute limit.

Script Properties — Gemini (`AI_PROVIDER=gemini`, the default):

| Key | Required | Default |
|---|---|---|
| `GEMINI_API_KEY` | for Ask | — |
| `AI_PROVIDER` | no | `gemini` |
| `GEMINI_MODEL` | no | `gemini-2.0-flash` |

### Non-Google providers

**Groq is the configuration this deployment actually runs on.** The Gemini route was abandoned after
the ched.gov.ph Workspace domain blocked AI Studio, org policy blocked service-account-bound API key
creation, and the resulting keys reported `generate_content_free_tier_requests, limit: 0`. None of
those were solvable from the code. Groq needs no Google Cloud project, service account, org-policy
exception, or billing account.

Verified working:

| Property | Value |
|---|---|
| `AI_PROVIDER` | `openai` |
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` |
| `OPENAI_API_KEY` | key from [console.groq.com](https://console.groq.com) |
| `OPENAI_MODEL` | `llama-3.3-70b-versatile` |

Run `listAskModels()` if that model id ever stops resolving — vendors rotate them.


The `openai` adapter speaks the OpenAI-compatible `/chat/completions` API, which Groq, OpenRouter,
Cerebras, Mistral, Together and GitHub Models all implement. Switching between them is two Script
Properties — no code change.

| Key | Example |
|---|---|
| `AI_PROVIDER` | `openai` |
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` |
| `OPENAI_API_KEY` | the vendor's key |
| `OPENAI_MODEL` | a model id that vendor offers |

Base URLs: Groq `https://api.groq.com/openai/v1` · OpenRouter `https://openrouter.ai/api/v1` ·
Cerebras `https://api.cerebras.ai/v1` · Mistral `https://api.mistral.ai/v1` · GitHub Models
`https://models.github.ai/inference`.

This route needs no Google Cloud project, service account, org-policy exception, or billing
account — which matters if your Workspace domain restricts those. Check each vendor's current free
tier and data-handling terms before choosing; free tiers commonly permit training on submitted
prompts, and Ask sends document titles and remarks.

### Configuring Ask

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) → **Create API
   key**. Copy it.
2. In the Apps Script editor: **Project Settings** (the gear) → **Script properties** → **Add script
   property** → name `GEMINI_API_KEY`, value the key → **Save script properties**.
3. Make sure the project's `appsscript.json` includes
   `https://www.googleapis.com/auth/script.external_request`. Without it the call is blocked. If you
   just added it, run any function once from the editor and accept the new authorization prompt —
   added scopes require re-consent.
4. Run `checkAskConfig()` from the editor and read the log. It reports the provider, whether a key
   is present, the model, and the result of a real test call — without printing the key.
5. **Create a new deployment version** (Deploy → Manage deployments → edit → New version). The web
   app keeps serving the old version until you do, so Ask will keep reporting "not configured".

If Ask now says *unavailable* rather than *not configured*, the key is being read and the failure is
downstream — usually a wrong `GEMINI_MODEL`, or free-tier quota. `checkAskConfig()` prints the
provider's actual HTTP error.

### Ask rate limits

Per user: **5 questions per minute** and **60 per hour**, enforced server-side in `askLibrary` via
`CacheService`. Exceeding a limit is not an error — the question falls back to keyword search and
the panel says which limit was hit.

The limits are deliberately approximate: concurrent calls can race the counter and the cache may be
evicted early. They exist to stop one account draining the provider's free-tier quota, not as a
security boundary. Tune `ASK_LIMIT_PER_MINUTE` / `ASK_LIMIT_PER_HOUR` in `Code.gs`.

**Fallback:** with no key configured, when a rate limit is hit, or when the provider errors or its
quota trips, the question
is handed to the ordinary keyword search and a one-line notice says so. The fallback is deliberately
*not* silent — otherwise the user cannot tell an answer from a string match.

In `npm run dev` there is no key, so the mock provider synthesizes an answer from a keyword match
and labels itself `mock`. Include the word `nokey` or `quota` in a question to exercise the two
failure paths.

## Settings

Admin-only, reached from the **Settings** menu in the header.

- **User Management** — columns `NAME`, `EMAIL`, `STATUS`. Only `@ched.gov.ph` addresses may be
  added; duplicates are rejected; the Administrator row is protected.
- **Tags** — the tag vocabulary described above.
- **Library Health** — reconciles every document against Drive and reports files that are deleted,
  in the bin, or moved out of the folder the library expects. Read-only: it never repairs, because
  the right repair (restore, refile, or delete the record) depends on what happened. Staff are
  *viewers* on the library folder and viewers cannot move or delete files they do not own, so a
  discrepancy points at the owning account, someone with edit rights on the folder, or a change here
  that failed part-way. For **who** made the change, use Drive's own activity panel on the file —
  this reports what drifted, not who moved it.
- **Audit Log** — read-only view of the `Audit_Log` sheet, newest first: every create, update, and
  delete across documents, tags, and users, plus each Ask question, with the name and email of the
  account responsible and the time to the minute (seconds on hover). Paged with Newer/Older and a
  25/50/100/200 page size; only the requested page is read from the sheet. The filter box searches
  the loaded page, not the whole trail — it is labelled "Filter this page" for that reason.
  `listAuditLog` is Admin-guarded server-side, so a staff account calling it directly is refused.

**Appearance is not in Settings.** Settings is Admin-only, but the colour theme is a personal
preference every user needs, so it lives in the **profile menu** at the top right (avatar →
Appearance → Light / Dark / System default) alongside the signed-in account and role.

The same menu holds the **User Manual** link, above Appearance so it is not buried under a
three-row control block. It points at a PDF in the library's own Drive folder, so it inherits the
same access as the documents — every active account can open it and nobody else can. The constant
is `USER_MANUAL_URL` in `ProfileMenu.tsx`; replacing the file in Drive keeps the link valid, only
uploading a *new* file would require changing it.

## Drive layout

Uploaded files land in the configured library folder, mirroring the browsing tree:

```
<LIBRARY_FOLDER_ID>/Issuances/CHED Memorandum Orders/2026/20260211-093012 - CMO-01-s2026.pdf
<LIBRARY_FOLDER_ID>/CEB Matters/2025/08 August/...
```

Replacing or deleting a document also trashes its Drive file, so the folder does not accumulate
orphans.

**Moving.** The Move action on a document (list and grid) refiles it under a different category,
year, or month and relocates the Drive file to match, so the folder tree never drifts from the
library. Editing those fields in the upload dialog does the same. Both are restricted to the
uploader and the Admin, and are recorded in the audit log as `MOVE_DOCUMENT` with the old and new
locations.

### Drive sharing (required)

The web app runs as `USER_DEPLOYING`, so every uploaded file is **owned by the deploying account**.
Unless the root library folder grants read access, other staff clicking a document link get
"You need access" — the library would be readable only by the deployer.

`syncLibraryFolderAccess()` grants Drive read access to **exactly the ACTIVE accounts in the Users
sheet** — no link sharing, no domain sharing. Sub-folders and files inherit from the root, so the
viewer list covers every document ever uploaded, including ones added before a user joined.

Creating, deactivating, renaming, or deleting a user adjusts **that one account's** permission
immediately, so Drive access is revoked at the same moment sign-in is. Per-user changes are
deliberately incremental — a full reconcile walks every viewer, which on a sizeable roster means
dozens of sequential Drive calls inside the script lock that `saveUser` holds.

The full reconcile is available as **Settings → User Management → SYNC DRIVE ACCESS** (and as
`syncLibraryFolderAccess()` from the editor). Run it after changing `LIBRARY_FOLDER_ID`, after the
first deploy, or if an individual permission change failed — those are logged to the Apps Script
console rather than surfaced, so the reconcile is the recovery path. `seedELibrary()` calls it too.

The folder is set to `PRIVATE`, so the only accounts that can read documents are the Users-sheet
entries plus the folder's owner (the deploying account, which cannot be removed). Anyone granted
**edit** rights on the folder by hand keeps access — the sync deliberately does not remove editors,
but reports any that are not in the Users list in its return message. Check that message after
running it.

**No sharing emails are sent.** Staff learn about the library through the app, not through Drive, so
`addViewerSilently_` creates the permission with notifications explicitly disabled via the advanced
Drive service (declared in `appsscript.json` as `Drive` v3). If that service is unavailable it falls
back to `DriveApp.addViewer`, which also does not notify — the advanced service is used so the
behaviour is guaranteed rather than incidental.

## Local development

```bash
npm install --prefix frontend
```

```bash
npm run dev --prefix frontend
```

There is no Google session in `npm run dev`, so the app runs against `src/lib/mockApi.ts` — an
in-browser stand-in seeded with sample documents, users, and the starter tag. It enforces the same
rules as the real backend (domain check, active-user check, duplicate tag names, uploader-only
edits). A **DEV** account switcher appears in the header to preview the app as the Administrator, an
active staff member, or an inactive account; it disappears once the app runs inside Apps Script.

Typecheck:

```bash
npm run typecheck --prefix frontend
```

## Deploying to Apps Script

1. Create a Google Sheet and a Google Drive folder for the library files.
2. Apps Script > Project Settings > Script Properties:
   - `SPREADSHEET_ID` — the spreadsheet id
   - `LIBRARY_FOLDER_ID` — the Drive folder id
   - `GEMINI_API_KEY` — optional, enables [Ask](#ask)
   - `DEV_USER_EMAIL` — optional, local testing only
3. Build the bundle:

```bash
npm run build:gas --prefix frontend
```

4. Upload/update these Apps Script files:
   - `apps-script/Code.gs`
   - `apps-script/AppShell.html`
   - `apps-script/ReactCss.html`
   - `apps-script/ReactJs.html`
   - `apps-script/appsscript.json`
5. Run `setupELibrarySheets()` — creates `Users`, `Documents`, `Tags`, `Audit_Log`.
6. Run `seedELibrary()` — creates the Administrator account, adds whoever ran setup, seeds the
   `Office of the Director` tag, and grants the library folder domain read access (see
   [Drive sharing](#drive-sharing-required)).
7. Deploy as a Web App: execute as **USER_DEPLOYING**, access **DOMAIN**.

The app deploys as a single inlined bundle: `scripts/sync-dist-to-gas.mjs` base64-inlines the Vite
entry chunk into `ReactCss.html` / `ReactJs.html`. Code-splitting would emit chunks that never get
inlined, so the bundle is intentionally one file.

## Sheets

| Sheet | Purpose |
|---|---|
| `Users` | who may sign in — `user_id`, `name`, `email`, `active` |
| `Documents` | document metadata and the Drive file pointer |
| `Tags` | the shared tag vocabulary |
| `Audit_Log` | create/update/delete trail with the actor's email |
