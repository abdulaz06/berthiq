# ONBOARDING_PROMPT — Shravani (macOS), one time only

Run this **after** Abdul has scaffolded the repo (M0-1 merged). It gets your M1 MacBook Air set up and confirms you can run BerthIQ, then you're ready to pick up tasks from the queue like anyone else.

Your machine is an 8GB M1 Air, so we deliberately **do not use Docker for daily development** — Postgres runs natively. This keeps memory comfortable.

---

## Step 1 — install the toolchain (terminal, ~15 min)

Run these one at a time. If a tool is already installed, the command just confirms it.

```
# Xcode command-line tools (git, compilers)
xcode-select --install

# Homebrew (skip if you have it): see https://brew.sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Core tools
brew install git python@3.12 node postgresql@15 just

# Start Postgres as a background service
brew services start postgresql@15
```

Confirm versions:
```
git --version
python3 --version      # 3.12.x
node --version         # 18+ ideally 20+
psql --version         # 15.x
just --version
```

## Step 2 — get the repo

```
git clone <the berthiq repo URL>
cd berthiq
```

## Step 3 — let Claude Code finish setup and verify

Open the repo in Claude Code and paste this:

```
You are onboarding a second developer (Shravani) onto BerthIQ, on an 8GB M1
MacBook Air. The repo skeleton (M0-1) already exists. Do NOT start a feature task.

Read CLAUDE.md and docs/ARCHITECTURE.md §8 (local dev topology) first.

Then:
1. Verify the toolchain: git, python 3.12, node, and a running postgresql@15.
   If Postgres isn't running, start it (brew services start postgresql@15) and
   create the local database referenced by .env.example.
2. Copy .env.example to .env and fill in sensible local defaults (a local
   DATABASE_URL for the Postgres you just confirmed, NEXT_PUBLIC_USE_FIXTURES=true).
3. Install dependencies: backend (create a venv, install from pyproject) and
   frontend (npm install).
4. Run `just dev` and confirm the health-check page loads against the live
   backend. If anything fails on this machine, fix it and note what you changed
   in the README under a "macOS / Apple Silicon setup" section so it's captured
   for next time.
5. Run `just test` and confirm it passes.

Do not modify application code beyond what's needed to get the environment
running. When done, append a HANDOFF.md entry confirming your machine is set up
and `just dev` works. Then stop — you're ready to pick up tasks from ACTIVE_WORK.md.
```

## Step 4 — you're ready

From now on, both of you use `SESSION_PROMPT.md` to start every working session. You pick tasks from the same queue; there's no split by topic. When unsure what to grab, take the top task in **Ready to pick up** in `ACTIVE_WORK.md`.

**One rule to internalize:** never end a session without updating `ACTIVE_WORK.md` and adding a `HANDOFF.md` entry. That's what lets Abdul (or you, next time) continue exactly where you stopped.
