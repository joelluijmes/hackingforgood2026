import hashlib
import hmac
import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from . import db

Lang = Literal["en", "nl", "fr"]
router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, h_hex = stored.split("$")
        h = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    except ValueError:
        return False
    return hmac.compare_digest(h.hex(), h_hex)


def user_dict(row) -> dict:
    return {k: row[k] for k in ("id", "email", "name", "language", "role")}


def create_user(email: str, name: str, password: str, language: str, role: str = "staff") -> int:
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, name, language, pw_hash, role, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (
                email.strip().lower(),
                name.strip(),
                language,
                hash_password(password),
                role,
                db.now_iso(),
            ),
        )
        return cur.lastrowid


def seed_demo_user() -> None:
    with db.connect() as conn:
        n = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if n == 0:
        create_user("demo@bspho.be", "Demo Researcher", "demo1234", "en")


def _new_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)",
            (token, user_id, db.now_iso()),
        )
    return token


def current_user(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else None
    if not token and request.url.path.endswith("/file"):
        token = request.query_params.get("token")
    if token:
        with db.connect() as conn:
            row = conn.execute(
                "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
                (token,),
            ).fetchone()
        if row:
            return user_dict(row)
    raise HTTPException(401, "Not authenticated")


def current_staff(request: Request) -> dict:
    user = current_user(request)
    if user["role"] != "staff":
        raise HTTPException(403, "Staff access required")
    return user


User = Annotated[dict, Depends(current_user)]


class RegisterBody(BaseModel):
    email: str
    name: str
    password: str
    language: Lang = "en"


class LoginBody(BaseModel):
    email: str
    password: str


class PatchMe(BaseModel):
    name: str | None = None
    language: Lang | None = None


@router.post("/register")
def register(body: RegisterBody) -> dict:
    raise HTTPException(
        403, "Accounts are created by invitation. Contact your trial administrator."
    )


@router.post("/login")
def login(body: LoginBody) -> dict:
    with db.connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (body.email.strip().lower(),)
        ).fetchone()
    if not row or not verify_password(body.password, row["pw_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return {"token": _new_session(row["id"]), "user": user_dict(row)}


@router.get("/me")
def me(user: User) -> dict:
    return user


@router.patch("/me")
def patch_me(body: PatchMe, user: User) -> dict:
    name = (body.name or "").strip() or user["name"]
    language = body.language or user["language"]
    with db.connect() as conn:
        conn.execute("UPDATE users SET name = ?, language = ? WHERE id = ?",
                     (name, language, user["id"]))  # fmt: skip
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return user_dict(row)
