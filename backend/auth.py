"""Authentication helpers: bcrypt password hashing, JWT tokens, role-based dependencies."""
import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user_factory(db):
    """Create a dependency bound to the given db handle."""

    async def _get_current_user(
        request: Request,
        creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    ) -> dict:
        token = None
        if creds and creds.scheme.lower() == "bearer":
            token = creds.credentials
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        payload = decode_token(token)
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    return _get_current_user


def require_roles(*allowed_roles: str):
    """Return a dependency that enforces the current user's role."""

    def checker(user: dict) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed_roles)}",
            )
        return user

    return checker


async def seed_users(db):
    """Seed admin, supervisor, and student demo accounts if missing."""
    seeds = [
        (os.environ.get("ADMIN_EMAIL", "admin@thesisvault.io"),
         os.environ.get("ADMIN_PASSWORD", "Admin@12345"),
         "Admin", "admin"),
        (os.environ.get("SUPERVISOR_EMAIL", "supervisor@thesisvault.io"),
         os.environ.get("SUPERVISOR_PASSWORD", "Super@12345"),
         "Dr. Supervisor", "supervisor"),
        (os.environ.get("STUDENT_EMAIL", "student@thesisvault.io"),
         os.environ.get("STUDENT_PASSWORD", "Student@12345"),
         "Demo Student", "student"),
    ]
    for email, password, name, role in seeds:
        email_norm = email.lower().strip()
        existing = await db.users.find_one({"email": email_norm})
        if existing is None:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email_norm,
                "password_hash": hash_password(password),
                "name": name,
                "role": role,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            # Keep seeded passwords in sync with env so demos keep working
            if not verify_password(password, existing["password_hash"]):
                await db.users.update_one(
                    {"email": email_norm},
                    {"$set": {"password_hash": hash_password(password), "role": role}},
                )
