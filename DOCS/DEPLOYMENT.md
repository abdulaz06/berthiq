# Deployment preparation

**No public deployment has been verified.** This repository prepares three services:
a Next.js frontend, one persistent Python API process and PostgreSQL. Do not place
FastAPI's background computation in an ephemeral request-only/serverless function.
No hosting plan has been purchased or provisioned.

## Frontend

Build from `frontend/` using Node 24:

```sh
npm ci
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

Set `NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_HOST` and
`SITE_URL=https://YOUR_FRONTEND_HOST` **before building**. Public Next variables are
bundled at build time; changing runtime values alone does not change the browser
API URL. Set `NEXT_PUBLIC_USE_FIXTURES=false`. Never put secrets in `NEXT_PUBLIC_*`.
A managed Next host can run the same build with `frontend` as its root directory.

## Persistent API and database

Use Python 3.12, root directory `backend/`, and install:

```sh
python -m pip install -r requirements.lock
python -m pip install --no-deps -e .
```

The universal lock includes verification tools as well as runtime packages. Use
the committed lock in CI and deployment. The committed model requires exactly
scikit-learn 1.9.0; do not silently upgrade the model runtime or retrain at startup.

Supply `DATABASE_URL` through the host's secret store, with
`postgresql+psycopg2://...` and provider-required TLS parameters (`sslmode=require`
or stricter). Use a persistent PostgreSQL database, backups and a dedicated role.
Set `CORS_ORIGINS=["https://YOUR_FRONTEND_HOST"]`, `ENABLE_UPLOADS=false`, and
`PORT` to the platform port (default 8000). No `.env` file belongs in the artifact.

Release command, once per release while the old service is drained:

```sh
python -m alembic upgrade head
python scripts/prepare_demo.py
```

Start command:

```sh
python scripts/serve.py
```

Start fails closed if the database is not at Alembic head, the demo is missing,
model loading fails, or explicit production environment settings are absent.
The seed is insert-if-missing and keeps private scenarios and existing versions.
Migrations and seeding are separate from serving: a release failure must block
traffic. Test a database backup restore before public launch; don't automate
schema downgrades as an application rollback.

Configure HTTPS at the reverse proxy. Liveness: `/api/health`; readiness:
`/api/ready`. Route traffic only after readiness succeeds. Use **one API process
and one replica**: restart recovery and two compute slots are process-owned.
Do not roll two replicas over each other; drain/stop the old instance first.
Scaling requires durable external worker ownership, not increasing Uvicorn workers.
API concurrency is bounded to 64, keep-alive to five seconds. Apply proxy body
and request-rate limits too, especially to expensive read endpoints. Uploads
remain disabled unless deliberately enabled for a bounded demonstration.

The current public demo uses random per-tab owner tokens, not user authentication.
Private data is accessible to anyone holding its token. Use synthetic/non-sensitive
uploads only. Scenarios expire after 24 hours; scenario/run/session quotas and
upload byte/row limits are enforced. This is not enterprise multi-tenant security.

## Source and geography disclosures

PM4Py is AGPL-3.0 licensed. Its upstream license is included in its installed
distribution and [source](https://github.com/process-intelligence-solutions/pm4py).
The prior internal-only comment is superseded. Keep BerthIQ's public source link
visible in the app and provide the exact deployed source revision, dependency
licenses and any modifications. Before publication, settle a compatible project
license with the contributors; the repository currently does not grant a project
license. No commercial PM4Py license has been purchased. This licensing decision
remains a public-launch gate, not a completed deployment step.

Retain OpenFreeMap/OpenStreetMap attribution and the approximate-berth and
synthetic-operation disclosures. Vessel motion is simulated, with a schematic
fallback if external map tiles are unavailable. Results are model estimates and
counterfactuals, never measured port savings.

## Acceptance at the real URLs

After the owner selects hosting and provides credentials, record the frontend
URL, API URL, deployed commit, database migration head and deployment date. Verify
HTTPS, exact-origin CORS, readiness, asset/worker loading, model predictions,
optimization polling, matched simulation, private export and session isolation.
Check a restart during a job and verify its recoverable failure. Inspect both
1920×1080 and 390×844 on the real host, including tile failure. Until those checks
pass, describe the application as deployment-prepared, not deployed.
