from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth, db
from .routers import generate, library, projects, review

app = FastAPI(title="ICF Studio API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init()
    auth.seed_demo_user()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


for r in (auth.router, library.router, projects.router, review.router, generate.router):
    app.include_router(r)
