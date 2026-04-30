"""ThesisVault backend — FastAPI REST API + MongoDB."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import json
import logging
import shutil
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Form,
    Query,
    Request,
)
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    seed_users,
)

# -------------------- Setup --------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/backend/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ThesisVault API")
api = APIRouter(prefix="/api")
bearer_scheme = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("thesisvault")


# -------------------- Models --------------------
class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: Literal["student", "supervisor", "admin"]
    created_at: Optional[str] = None


class RegisterReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Literal["student", "supervisor"]  # admin cannot self-register


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class ReviewReq(BaseModel):
    decision: Literal["approve", "reject", "changes"]
    comment: str = Field(default="", max_length=2000)


class Review(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    thesis_id: str
    supervisor_id: str
    supervisor_name: str
    decision: Literal["approve", "reject", "changes"]
    comment: str
    created_at: str


class Thesis(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    student_id: str
    student_name: str
    student_email: EmailStr
    title: str
    abstract: str
    year: int
    program: str
    keywords: List[str] = []
    status: Literal["draft", "submitted", "approved", "rejected", "changes", "published"]
    supervisor_id: Optional[str] = None
    supervisor_name: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    has_file: bool = False
    created_at: str
    updated_at: str
    submitted_at: Optional[str] = None
    published_at: Optional[str] = None


# -------------------- Helpers --------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_thesis_view(doc: dict) -> dict:
    out = {k: v for k, v in doc.items() if k not in ("_id", "file_path")}
    out["has_file"] = bool(doc.get("file_path"))
    return out


def parse_keywords(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    raw = raw.strip()
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(k).strip() for k in parsed if str(k).strip()]
        except Exception:
            pass
    return [k.strip() for k in raw.split(",") if k.strip()]


async def save_upload(thesis_id: str, upload: UploadFile) -> dict:
    if not upload.filename or not upload.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    dest = UPLOAD_DIR / f"{thesis_id}.pdf"
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    size = dest.stat().st_size
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return {"file_name": upload.filename, "file_path": str(dest), "file_size": size}


async def _resolve_user(token: str) -> dict:
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    token: Optional[str] = None
    if creds and creds.scheme.lower() == "bearer":
        token = creds.credentials
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await _resolve_user(token)


def require_role(*roles: str):
    async def _check(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return user
    return _check


# -------------------- Auth Routes --------------------
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register", response_model=AuthResponse)
async def register(body: RegisterReq):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "role": body.role,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["id"], user_doc["email"], user_doc["role"])
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return AuthResponse(access_token=token, user=UserPublic(**user_doc))


@auth_router.post("/login", response_model=AuthResponse)
async def login(body: LoginReq):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"], user["role"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return AuthResponse(access_token=token, user=UserPublic(**user))


@auth_router.get("/me", response_model=UserPublic)
async def me(user: dict = Depends(current_user)):
    return UserPublic(**user)


# -------------------- Thesis Routes --------------------
thesis_router = APIRouter(prefix="/theses", tags=["theses"])


@thesis_router.post("", response_model=Thesis)
async def create_thesis(
    title: str = Form(...),
    abstract: str = Form(...),
    year: int = Form(...),
    program: str = Form(...),
    keywords: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(require_role("student")),
):
    thesis_id = str(uuid.uuid4())
    doc = {
        "id": thesis_id,
        "student_id": user["id"],
        "student_name": user["name"],
        "student_email": user["email"],
        "title": title.strip(),
        "abstract": abstract.strip(),
        "year": int(year),
        "program": program.strip(),
        "keywords": parse_keywords(keywords),
        "status": "draft",
        "supervisor_id": None,
        "supervisor_name": None,
        "file_name": None,
        "file_path": None,
        "file_size": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "submitted_at": None,
        "published_at": None,
    }
    if file is not None:
        info = await save_upload(thesis_id, file)
        doc.update(info)
    await db.theses.insert_one(doc)
    return Thesis(**to_thesis_view(doc))


@thesis_router.get("/mine", response_model=List[Thesis])
async def my_theses(user: dict = Depends(require_role("student"))):
    cur = db.theses.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return [Thesis(**to_thesis_view(d)) async for d in cur]


@thesis_router.get("/submitted", response_model=List[Thesis])
async def submitted_theses(user: dict = Depends(require_role("supervisor", "admin"))):
    cur = db.theses.find(
        {"status": {"$in": ["submitted", "changes", "rejected", "approved"]}}, {"_id": 0}
    ).sort("submitted_at", -1)
    return [Thesis(**to_thesis_view(d)) async for d in cur]


@thesis_router.get("/approved", response_model=List[Thesis])
async def approved_theses(user: dict = Depends(require_role("admin"))):
    cur = db.theses.find(
        {"status": {"$in": ["approved", "published"]}}, {"_id": 0}
    ).sort("updated_at", -1)
    return [Thesis(**to_thesis_view(d)) async for d in cur]


@thesis_router.get("/{thesis_id}", response_model=Thesis)
async def get_thesis(thesis_id: str, user: dict = Depends(current_user)):
    doc = await db.theses.find_one({"id": thesis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if user["role"] == "student" and doc["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your thesis")
    return Thesis(**to_thesis_view(doc))


@thesis_router.put("/{thesis_id}", response_model=Thesis)
async def update_thesis(
    thesis_id: str,
    title: Optional[str] = Form(None),
    abstract: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    program: Optional[str] = Form(None),
    keywords: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(require_role("student")),
):
    doc = await db.theses.find_one({"id": thesis_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if doc["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your thesis")
    if doc["status"] not in ("draft", "changes", "rejected"):
        raise HTTPException(
            status_code=400,
            detail="Cannot edit after submission unless changes were requested",
        )
    updates: dict = {"updated_at": now_iso()}
    if title is not None:
        updates["title"] = title.strip()
    if abstract is not None:
        updates["abstract"] = abstract.strip()
    if year is not None:
        updates["year"] = int(year)
    if program is not None:
        updates["program"] = program.strip()
    if keywords is not None:
        updates["keywords"] = parse_keywords(keywords)
    if file is not None:
        info = await save_upload(thesis_id, file)
        updates.update(info)
    await db.theses.update_one({"id": thesis_id}, {"$set": updates})
    doc = await db.theses.find_one({"id": thesis_id}, {"_id": 0})
    return Thesis(**to_thesis_view(doc))


@thesis_router.post("/{thesis_id}/submit", response_model=Thesis)
async def submit_thesis(thesis_id: str, user: dict = Depends(require_role("student"))):
    doc = await db.theses.find_one({"id": thesis_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if doc["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your thesis")
    if not doc.get("file_path"):
        raise HTTPException(status_code=400, detail="Upload a PDF before submitting")
    if doc["status"] not in ("draft", "changes", "rejected"):
        raise HTTPException(status_code=400, detail="Already submitted")
    ts = now_iso()
    await db.theses.update_one(
        {"id": thesis_id},
        {"$set": {"status": "submitted", "submitted_at": ts, "updated_at": ts}},
    )
    doc = await db.theses.find_one({"id": thesis_id}, {"_id": 0})
    return Thesis(**to_thesis_view(doc))


@thesis_router.post("/{thesis_id}/review", response_model=Thesis)
async def review_thesis(
    thesis_id: str, body: ReviewReq, user: dict = Depends(require_role("supervisor"))
):
    doc = await db.theses.find_one({"id": thesis_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if doc["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Thesis is not awaiting review")
    decision_map = {"approve": "approved", "reject": "rejected", "changes": "changes"}
    new_status = decision_map[body.decision]
    review_doc = {
        "id": str(uuid.uuid4()),
        "thesis_id": thesis_id,
        "supervisor_id": user["id"],
        "supervisor_name": user["name"],
        "decision": body.decision,
        "comment": body.comment,
        "created_at": now_iso(),
    }
    await db.reviews.insert_one(review_doc)
    await db.theses.update_one(
        {"id": thesis_id},
        {
            "$set": {
                "status": new_status,
                "supervisor_id": user["id"],
                "supervisor_name": user["name"],
                "updated_at": now_iso(),
            }
        },
    )
    doc = await db.theses.find_one({"id": thesis_id}, {"_id": 0})
    return Thesis(**to_thesis_view(doc))


@thesis_router.get("/{thesis_id}/reviews", response_model=List[Review])
async def list_reviews(thesis_id: str, user: dict = Depends(current_user)):
    doc = await db.theses.find_one({"id": thesis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if user["role"] == "student" and doc["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your thesis")
    cur = db.reviews.find({"thesis_id": thesis_id}, {"_id": 0}).sort("created_at", -1)
    return [Review(**d) async for d in cur]


@thesis_router.post("/{thesis_id}/publish", response_model=Thesis)
async def publish_thesis(thesis_id: str, user: dict = Depends(require_role("admin"))):
    doc = await db.theses.find_one({"id": thesis_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if doc["status"] not in ("approved", "published"):
        raise HTTPException(status_code=400, detail="Only approved theses can be published")
    ts = now_iso()
    await db.theses.update_one(
        {"id": thesis_id},
        {"$set": {"status": "published", "published_at": ts, "updated_at": ts}},
    )
    doc = await db.theses.find_one({"id": thesis_id}, {"_id": 0})
    return Thesis(**to_thesis_view(doc))


@thesis_router.post("/{thesis_id}/unpublish", response_model=Thesis)
async def unpublish_thesis(thesis_id: str, user: dict = Depends(require_role("admin"))):
    doc = await db.theses.find_one({"id": thesis_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if doc["status"] != "published":
        raise HTTPException(status_code=400, detail="Thesis is not published")
    await db.theses.update_one(
        {"id": thesis_id}, {"$set": {"status": "approved", "updated_at": now_iso()}}
    )
    doc = await db.theses.find_one({"id": thesis_id}, {"_id": 0})
    return Thesis(**to_thesis_view(doc))


# -------------------- Public Routes (no auth) --------------------
public_router = APIRouter(prefix="/public", tags=["public"])


@public_router.get("/theses", response_model=List[Thesis])
async def public_list(
    q: Optional[str] = Query(None, description="Search in title, keywords, abstract"),
    year: Optional[int] = Query(None),
):
    query: dict = {"status": "published"}
    if year is not None:
        query["year"] = year
    if q:
        regex = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"title": regex},
            {"abstract": regex},
            {"keywords": {"$elemMatch": regex}},
            {"program": regex},
            {"student_name": regex},
        ]
    cur = db.theses.find(query, {"_id": 0}).sort("published_at", -1)
    return [Thesis(**to_thesis_view(d)) async for d in cur]


@public_router.get("/theses/{thesis_id}", response_model=Thesis)
async def public_detail(thesis_id: str):
    doc = await db.theses.find_one({"id": thesis_id, "status": "published"}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return Thesis(**to_thesis_view(doc))


# -------------------- File download --------------------
@api.get("/files/{thesis_id}")
async def download_file(thesis_id: str, request: Request, token: Optional[str] = Query(None)):
    doc = await db.theses.find_one({"id": thesis_id})
    if not doc or not doc.get("file_path"):
        raise HTTPException(status_code=404, detail="File not found")
    if doc["status"] != "published":
        # Require auth: owner student, any supervisor, or any admin
        auth_header = request.headers.get("Authorization", "")
        tok: Optional[str] = None
        if auth_header.lower().startswith("bearer "):
            tok = auth_header[7:]
        elif token:
            tok = token
        if not tok:
            raise HTTPException(status_code=401, detail="Authentication required")
        user = await _resolve_user(tok)
        if user["role"] == "student" and doc["student_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your thesis")
    return FileResponse(
        doc["file_path"],
        media_type="application/pdf",
        filename=doc.get("file_name") or f"{thesis_id}.pdf",
    )


# -------------------- Misc --------------------
@api.get("/")
async def root():
    return {"message": "ThesisVault API", "status": "ok"}


# -------------------- Mount --------------------
api.include_router(auth_router)
api.include_router(thesis_router)
api.include_router(public_router)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- Startup --------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.theses.create_index("student_id")
    await db.theses.create_index("status")
    await db.reviews.create_index("thesis_id")
    await seed_users(db)
    logger.info("ThesisVault startup complete. Seed users ensured.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
