# Native development

Use **Node 24 LTS, Python 3.12 and PostgreSQL 16+**. Git for Windows and `just`
are convenient; Docker is not required. `.nvmrc` and `.python-version` record the
supported runtimes. Run commands from the repository root.

```sh
just setup
just doctor
```

Setup preserves `.env` and an existing virtual environment. It installs the locked
backend dependencies and runs `npm ci` in the frontend. Doctor checks Python ABI
tags, native imports and the committed model; it does not modify the database.

Create your own **untracked** root `.env` if you do not already have one:

```dotenv
DATABASE_URL=postgresql+psycopg2://berthiq:YOUR_URL_ENCODED_PASSWORD@localhost:5432/berthiq
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
ENABLE_UPLOADS=false
```

Create the database and a dedicated role in PostgreSQL first. Encode special
characters in the URL password. Never paste credentials into Git, issues or logs.
Existing configuration takes precedence over these examples; do not replace it.

```sh
just migrate
just seed
just dev
```

Open http://localhost:3000. API documentation is at http://localhost:8000/docs.
`just seed` only inserts the built-in demo if missing. Re-running it preserves
existing scenarios and private uploads. The older generator command remains an
explicit destructive reseed tool and should not be used on a populated demo.
Training is offline and unnecessary for setup: the risk model is committed.

The launcher invokes Node and Python directly with argument arrays, so spaces in
`C:\Program Files` or the checkout path do not split commands. Ctrl+C stops both
owned process trees. Occupied ports produce an error and never kill another
process. Optional `BERTHIQ_API_PORT` and `BERTHIQ_WEB_PORT` overrides are wired
into the local frontend URL and CORS. `npm run dev` at the root is equivalent.
Git's shell is needed by the remaining `just` recipes on Windows; adjust the
`windows-shell` path in your private Just configuration if Git is elsewhere.

## Repairing a mixed Python environment

A virtual environment belongs to the Python minor version that created it.
Never copy `site-packages`, `.pyd` files, or a venv between Python 3.11 and 3.12,
between machines, or between operating systems. A `cp311` extension cannot load
inside Python 3.12. Updating `pyvenv.cfg` does not convert compiled packages.

First run `just doctor`. If it passes, keep the environment. If it reports a mixed
ABI, stop the servers and **rename** `backend/.venv` to a new backup name, preserving
it for recovery. Do not delete it or copy its compiled packages back. Select a
real Python 3.12 interpreter via `BERTHIQ_SETUP_PYTHON`, then run `just setup` to
create a fresh venv. Preserve the root `.env` throughout. On Windows you can find
installed interpreters with `py -0p`; on macOS/Linux use `command -v python3.12`.

## Verification

```sh
just test-backend
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run check:provenance
npm --prefix frontend run build
just golden
```

The backend runner creates/uses `berthiq_launch_test` on the configured server,
never the development database. Your local role needs CREATEDB, or provide an
explicit disposable `TEST_DATABASE_URL` whose database name ends in `_test`.
Fixtures drop tables in that test database. Never bypass the isolation guard.
The golden path uses the seeded local DB and cleans only its own private sessions.
Stop dev servers before building/running it; don't write dev/build outputs to
the same `.next` directory concurrently. Install Chromium once with
`cd frontend` followed by `npx playwright install chromium` if it is missing.

Use `just types` after changing backend contracts; never edit generated types.
Update the backend lock deliberately with:
`python -m uv pip compile backend/pyproject.toml --extra dev --universal --python-version 3.12 --output-file backend/requirements.lock`.
Audits are `npm --prefix frontend audit` and `python -m pip_audit` inside the venv.
Lock updates still require the complete test suite and model metric checks.
