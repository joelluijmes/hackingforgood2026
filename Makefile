.DEFAULT_GOAL := help
.PHONY: help install dev dev-backend dev-frontend lint fmt build clean-db

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

install: ## Install backend (uv) and frontend (pnpm) deps
	cd backend && uv sync
	cd frontend && pnpm install

dev: ## Run backend (8000) and frontend (5173) together
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend: ## Run FastAPI dev server
	cd backend && uv run fastapi dev app/main.py --port 8000

dev-frontend: ## Run Vite dev server
	cd frontend && pnpm dev

lint: ## ruff + biome + tsc
	cd backend && uv run ruff check .
	cd frontend && pnpm exec biome check . && pnpm exec tsc --noEmit

fmt: ## Auto-format and fix
	cd backend && uv run ruff format . && uv run ruff check --fix .
	cd frontend && pnpm exec biome check --write .

build: ## Build frontend
	cd frontend && pnpm build

clean-db: ## Remove SQLite db and uploaded files
	rm -rf backend/icf.db backend/storage
