# ICF Studio backend
Run: `cd backend && uv run fastapi dev app/main.py --port 8010` (API docs at http://localhost:8010/docs)
Lint: `uv run ruff check . && uv run ruff format .` — data in `icf.db` and `storage/` (gitignored).
