# RelayOps — Maintenance & Reliability

**[Open RelayOps](https://relayops-muhammad.sweetmo786.chatgpt.site/)** · private application · ChatGPT sign-in required

This repository now contains RelayOps. The former GitHub Pages demo redirects to the hosted application because shared SQL storage, authentication, and file uploads require a backend.

RelayOps turns an equipment issue into assigned work, documented completion, and a verified repair. It is the full-stack successor to [SmartMaint AI](https://github.com/MuhammadB786/smartmaint-ai/tree/508b408328fb1849764c16af0645d10ee580a940), originally a single-file systems-analysis prototype.

## What is implemented

- Shared SQL-backed workspaces and authenticated identity through the private Sites host.
- Owner, manager, technician and viewer roles, enforced server-side on every mutation.
- Equipment register, detail pages, maintenance history, equipment links and downloadable QR labels.
- Work orders with assignment, priority, due date, checklists, completion notes, labor hours, recorded cost, comments and file evidence.
- Enforced lifecycle: Open → In progress → Awaiting verification → Done. Repairs require completed checklists and notes; managers verify closure. Recovery never closes repair work.
- Sensor configuration, manual readings, validated CSV ingestion, historical readings and explicit provenance.
- Explainable upper-threshold, disconnected and stale-signal alerts. Sensor alerts are not time-to-failure predictions.
- Scenario lab: overheating, vibration, disconnection, recovery, and pausable six-second playback.
- Recurring preventive plans and on-demand generation of due work. Active-source uniqueness is enforced in SQL.
- Recorded-cost and labor reports, CSV export with spreadsheet-formula protection, and JSON workspace snapshots.
- Text documentation with source-excerpt retrieval, plus original document attachments.
- Structured rules-based draft assistance. An optional OpenAI Responses adapter supports strict structured output, review, bounded requests, failure handling, and a per-user request limit when credentials are configured.
- Activity history, recipient-bound expiring invitation codes, owner-controlled member roles, and workspace isolation.
- Responsive interface, keyboard focus states, native modal focus handling, skip link, text status labels, chart data tables, pausable simulation and reduced-motion support. Accessibility conformance has not been independently certified.
- Reproducible trained classifier benchmark with frozen artifact, ordered holdout evaluation, baseline, confusion matrix, decision paths, source attribution and model limitations.

## Architecture

React 19 and TypeScript → authenticated Vinext route handlers → Cloudflare D1 SQL and R2 file storage. The Sites hosting integration provisions storage and handles sign-in. No private credential enters the browser bundle. Zod validates incoming records and AI-generated drafts. SQL migrations and schema definitions are committed.

Records are scoped to a workspace; membership is checked before each read or write. Record versions prevent lost updates. A unique partial index prevents multiple open orders for a given source. Work-order history is retained rather than deleted.

The host uses a TypeScript server and managed SQLite rather than the earlier proposed separate Python/PostgreSQL deployment. That keeps authentication, storage and the application deployable together. The original prototype remains available in Git history; its systems-analysis documents are retained under `docs/`.

## Develop

Requires Node.js 22.13 or later (Node 25 is used for direct TypeScript tests).

```sh
npm ci
npm run build
```

Apply each pending migration once, in order, to the LOCAL database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lumpy_lionheart.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_last_surge.sql
npm run dev -- --port 5180
```

Open the printed loopback URL. Development sign-in uses the starter's fixed local test identity. Hosted authentication is supplied by Sites; development mock authentication is excluded from production.

Create a workspace, then choose **Load sample workspace** to explore six sample assets. Sample records and simulated readings are labeled. A normal new workspace starts empty.

## Validation

```sh
npm run typecheck
npm test
npm run test:api
```

The API integration script uses the loopback development server and creates a uniquely named LOCAL test workspace. It verifies auth rejection, tenant isolation, lifecycle rules, evidence requirements, optimistic concurrency, alert deduplication, recovery semantics, foreign-reference rejection, CSV validation, manual retrieval, R2 upload/download, and activity persistence. Do not target a live deployment with the test script.

Unit tests cover permission boundaries, state transitions, sensor states, CSV quoting and formula safety, AI-provider output handling using mocked responses, SQL migration invariants, and benchmark artifact integrity.

## Trained model and evaluation

`npm run model:train` reproduces `lib/generated/benchmark.json` from the bundled source CSV.

Dataset: **AI4I 2020 Predictive Maintenance Dataset** (2020), UCI Machine Learning Repository, DOI [10.24432/C5HS5C](https://doi.org/10.24432/C5HS5C), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original CSV is included under `data/ai4i2020/`. See [UCI](https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset).

This is a SYNTHETIC dataset, not facility field data. A class-weighted CART classifier is trained on rows 1–6000, tuned on 6001–8000, and evaluated on held-out rows 8001–10000. Failure-mode target columns, IDs and product identifiers are excluded as predictors. Derived physical features use only measurements. The committed artifact includes the source checksum and full method.

Held-out result: precision 25.8%, recall 64.1%, F1 36.8%, accuracy 95.7%; 25 true positives, 72 false positives, 14 false negatives and 1889 true negatives. Always-normal baseline accuracy is 98.05% with zero failure recall. These results reveal a substantial false-alarm problem and do not support autonomous deployment. They are displayed honestly, rather than hidden behind accuracy alone.

The classifier does not estimate remaining useful life, predict a future failure horizon, or control live work orders. Leaf scores are not calibrated probabilities. Real deployment needs suitable equipment data, outcome labels, validation across equipment, and operational acceptance testing.

## Optional generative drafting

Hosted secret names: `OPENAI_API_KEY`, optional `OPENAI_MODEL` (default `gpt-5-mini`). Configure them through the secure Sites runtime-secret workflow, never in source or the hosting manifest. Local development can use ignored `.dev.vars` with the equivalent names, after explicit secret destination confirmation. Do not copy credentials into chat, docs, commits or client code.

The UI offers **Draft with AI** only when a key is configured. It sends only the entered notes to OpenAI, with response storage disabled. Generated details are validated and remain an unsaved draft requiring human review. The labeled rules-based assistant remains separately available. Provider-contract tests are mocked; a successful live request must be verified separately once credentials are provisioned.

## Operating limits and remaining external setup

- The Site is private by default. Application invitation codes do not independently grant access through the hosting platform; teammates also need Site access granted by the owner.
- Preventive work is generated on demand. Unattended scheduling and real device/MQTT ingestion require a configured scheduler/device integration; playback is browser-driven test behavior.
- No automatic email invitation or notification service is connected; invitation codes are created for the owner to share.
- Knowledge search indexes supplied text, not OCR of attached PDFs.
- Reports use entered costs and verified work; there are no fabricated savings or downtime-reduction claims.
- Current workspace response is bounded to the latest 10,000 operational records, latest 2,000 sensor readings, and latest 500 activity events. Add server-side pagination and archival for larger deployments.
- Workspace snapshots include attachment metadata; download original files separately. A tested disaster-recovery restore procedure is not provided by the snapshot UI.
- This build is a usable application foundation with automated and browser checks, not an assertion of production certification, perfect security, or field reliability.

## Resume framing

> Built RelayOps, a full-stack maintenance management application with shared SQL workspaces, server-enforced roles, auditable repair verification, QR equipment access, CSV sensor ingestion and file evidence.

> Developed a reproducible predictive-maintenance classifier benchmark with ordered holdout evaluation, baseline comparison, confusion-matrix reporting and explainable decision paths.

Only add live-user counts, operational savings, accessibility conformance or production impact after measuring and verifying those claims.

Author: Muhammad Mustafa. Original concept and systems-analysis foundation: SmartMaint AI.
