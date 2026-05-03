"""ThesisVault MERN backend integration tests.

Covers stack-marker, auth, student/supervisor/admin workflows, role guards,
public search, file download (incl. ?token= fallback), and data preservation.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend .env (tests run from /app)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@thesisvault.io", "password": "Admin@12345"}
SUPERVISOR = {"email": "supervisor@thesisvault.io", "password": "Super@12345"}
STUDENT = {"email": "student@thesisvault.io", "password": "Student@12345"}

# Minimal valid PDF (5-byte header + body is enough for multer mimetype/ext check)
MINIMAL_PDF = b"%PDF-1.4\n%EOF\n"


# ---------------------------- fixtures ----------------------------

@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    return s


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token(session):
    return _login(session, ADMIN)


@pytest.fixture(scope="session")
def supervisor_token(session):
    return _login(session, SUPERVISOR)


@pytest.fixture(scope="session")
def student_token(session):
    return _login(session, STUDENT)


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------- stack marker ----------------------------

class TestStackMarker:
    def test_root_returns_mern_stack(self, session):
        r = session.get(f"{API}/", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("stack") == "MERN"
        assert data.get("status") == "ok"


# ---------------------------- auth ----------------------------

class TestAuth:
    def test_login_admin(self, session):
        r = session.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200
        data = r.json()
        assert data["token_type"] == "bearer"
        assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN["email"]
        assert "password_hash" not in data["user"]
        assert "_id" not in data["user"]

    def test_login_supervisor(self, session):
        r = session.post(f"{API}/auth/login", json=SUPERVISOR)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "supervisor"

    def test_login_student(self, session):
        r = session.post(f"{API}/auth/login", json=STUDENT)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "student"

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_bearer(self, session, student_token):
        r = session.get(f"{API}/auth/me", headers=h(student_token))
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == STUDENT["email"]
        assert u["role"] == "student"
        assert "password_hash" not in u
        assert "_id" not in u

    def test_me_without_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_student(self, session):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass@12345", "name": "Test Student", "role": "student"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "student"
        assert data["user"]["email"] == email.lower()
        assert "access_token" in data

    def test_register_supervisor(self, session):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass@12345", "name": "Test Sup", "role": "supervisor"
        })
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "supervisor"

    def test_register_admin_blocked(self, session):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass@12345", "name": "X", "role": "admin"
        })
        assert r.status_code == 422

    def test_register_duplicate(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": ADMIN["email"], "password": "Pass@12345", "name": "X", "role": "student"
        })
        assert r.status_code == 400


# ---------------------------- student workflow ----------------------------

@pytest.fixture(scope="session")
def created_thesis(session, student_token):
    """Create a draft thesis with a PDF file; return its id."""
    files = {"file": ("test.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")}
    data = {
        "title": "TEST_MERN Thesis",
        "abstract": "Testing MERN migration with a PDF upload.",
        "year": "2026",
        "program": "Computer Science",
        "keywords": "mern,test,automation",
    }
    r = session.post(f"{API}/theses", headers=h(student_token), data=data, files=files)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["status"] == "draft"
    assert j["has_file"] is True
    assert "file_path" not in j  # must not leak server path
    assert j["title"] == "TEST_MERN Thesis"
    assert j["year"] == 2026
    assert j["keywords"] == ["mern", "test", "automation"]
    return j["id"]


class TestStudentWorkflow:
    def test_create_draft_has_file(self, created_thesis):
        assert created_thesis  # fixture already asserts

    def test_update_draft(self, session, student_token, created_thesis):
        r = session.put(
            f"{API}/theses/{created_thesis}",
            headers=h(student_token),
            data={"title": "TEST_MERN Thesis Updated"},
        )
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_MERN Thesis Updated"
        # GET verifies persistence
        r2 = session.get(f"{API}/theses/{created_thesis}", headers=h(student_token))
        assert r2.status_code == 200
        assert r2.json()["title"] == "TEST_MERN Thesis Updated"

    def test_submit(self, session, student_token, created_thesis):
        r = session.post(f"{API}/theses/{created_thesis}/submit", headers=h(student_token))
        assert r.status_code == 200
        assert r.json()["status"] == "submitted"

    def test_mine_lists_thesis(self, session, student_token, created_thesis):
        r = session.get(f"{API}/theses/mine", headers=h(student_token))
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_thesis in ids


# ---------------------------- role guards ----------------------------

class TestRoleGuards:
    def test_student_blocked_submitted(self, session, student_token):
        r = session.get(f"{API}/theses/submitted", headers=h(student_token))
        assert r.status_code == 403

    def test_student_blocked_approved(self, session, student_token):
        r = session.get(f"{API}/theses/approved", headers=h(student_token))
        assert r.status_code == 403

    def test_student_blocked_review(self, session, student_token, created_thesis):
        r = session.post(
            f"{API}/theses/{created_thesis}/review",
            headers=h(student_token),
            json={"decision": "approve"},
        )
        assert r.status_code == 403

    def test_student_blocked_publish(self, session, student_token, created_thesis):
        r = session.post(f"{API}/theses/{created_thesis}/publish", headers=h(student_token))
        assert r.status_code == 403

    def test_supervisor_blocked_publish(self, session, supervisor_token, created_thesis):
        r = session.post(f"{API}/theses/{created_thesis}/publish", headers=h(supervisor_token))
        assert r.status_code == 403


# ---------------------------- supervisor review ----------------------------

class TestSupervisorReview:
    def test_submitted_list_visible(self, session, supervisor_token, created_thesis):
        r = session.get(f"{API}/theses/submitted", headers=h(supervisor_token))
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_thesis in ids

    def test_review_approve(self, session, supervisor_token, created_thesis):
        r = session.post(
            f"{API}/theses/{created_thesis}/review",
            headers=h(supervisor_token),
            json={"decision": "approve", "comment": "Looks great."},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "approved"
        assert body["supervisor_id"]

    def test_review_record_created(self, session, supervisor_token, created_thesis):
        r = session.get(f"{API}/theses/{created_thesis}/reviews", headers=h(supervisor_token))
        assert r.status_code == 200
        reviews = r.json()
        assert len(reviews) >= 1
        assert reviews[0]["decision"] == "approve"
        assert all("_id" not in rev for rev in reviews)


# ---------------------------- admin publish / public ----------------------------

class TestAdminAndPublic:
    def test_approved_list(self, session, admin_token, created_thesis):
        r = session.get(f"{API}/theses/approved", headers=h(admin_token))
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_thesis in ids

    def test_publish(self, session, admin_token, created_thesis):
        r = session.post(f"{API}/theses/{created_thesis}/publish", headers=h(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "published"
        assert body["published_at"]

    def test_public_list_contains_published(self, session, created_thesis):
        r = session.get(f"{API}/public/theses")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_thesis in ids
        for t in r.json():
            assert t["status"] == "published"

    def test_public_search_q(self, session, created_thesis):
        r = session.get(f"{API}/public/theses", params={"q": "MERN"})
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_thesis in ids

    def test_public_search_year(self, session, created_thesis):
        r = session.get(f"{API}/public/theses", params={"year": 2026})
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_thesis in ids
        for t in r.json():
            assert t["year"] == 2026

    def test_public_search_no_match(self, session):
        r = session.get(f"{API}/public/theses", params={"q": "ZZZ_NO_MATCH_XYZ"})
        assert r.status_code == 200
        assert r.json() == []

    def test_unpublish(self, session, admin_token, created_thesis):
        r = session.post(f"{API}/theses/{created_thesis}/unpublish", headers=h(admin_token))
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        # confirm no longer public
        r2 = session.get(f"{API}/public/theses")
        assert created_thesis not in [t["id"] for t in r2.json()]


# ---------------------------- file download ----------------------------

class TestFileDownload:
    def test_download_unpublished_requires_auth(self, session, created_thesis):
        # after unpublish, thesis status=approved -> auth required
        r = session.get(f"{API}/files/{created_thesis}", allow_redirects=False)
        assert r.status_code == 401

    def test_download_unpublished_with_bearer(self, session, admin_token, created_thesis):
        r = session.get(f"{API}/files/{created_thesis}", headers=h(admin_token))
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF")

    def test_download_with_token_query_fallback(self, session, admin_token, created_thesis):
        r = session.get(f"{API}/files/{created_thesis}", params={"token": admin_token})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_download_public_when_published(self, session, admin_token, created_thesis):
        # republish then fetch without token
        session.post(f"{API}/theses/{created_thesis}/publish", headers=h(admin_token))
        r = session.get(f"{API}/files/{created_thesis}")
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF")
        # restore to approved for idempotency
        session.post(f"{API}/theses/{created_thesis}/unpublish", headers=h(admin_token))


# ---------------------------- seeded data preservation ----------------------------

class TestSeededData:
    def test_public_has_seeded_published(self, session):
        r = session.get(f"{API}/public/theses")
        assert r.status_code == 200
        # expect the 4 previously published seed theses still present
        assert len(r.json()) >= 3

    def test_student_has_seeded_theses(self, session, student_token):
        r = session.get(f"{API}/theses/mine", headers=h(student_token))
        assert r.status_code == 200
        assert len(r.json()) >= 3
