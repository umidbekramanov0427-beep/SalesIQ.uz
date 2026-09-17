# SalesIQ CRM -- Python backend port

Work-in-progress Python (FastAPI) port of this repo's TypeScript backend
routes (`../src/routes/*.ts`). Same Supabase project, same database, same
frontend -- only the server-side application code is being rewritten here.

**Read `PORT_STATUS.md` first.** It lists exactly what's ported, what
isn't, in what order the remaining ~36 routes are worth tackling, and why
the frontend is intentionally out of scope for this port.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in from the deployed app's real env vars
uvicorn app.main:app --reload
```
