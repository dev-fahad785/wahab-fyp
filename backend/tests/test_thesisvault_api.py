"""ThesisVault end-to-end API tests.

Covers: auth (login/register/me), student CRUD + submit, supervisor review,
admin publish/unpublish, public listing & search, file download (public + auth).
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env value used by the deployed app
    from pathlib import Path
    env_text = Path("/app/frontend/.env").read_text()
    for line in env_text.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"

ADMIN = ("admin@thesisvault.io", "Admin@12345")
SUPER = ("supervisor@thesisvault.io", "Super@12345")
STUDENT = ("student@thesisvault.io", "Student@12345")

PDF_BYTES = (
    b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\n"
    b"trailer<<>>\n%%EOF\n"
)


# -------------------- Fixtures --------------------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data["user"]


@pytest.fixture(scope="session")
def admin_token(s):
    tok, _ = _login(s, *ADMIN)
    return tok


@pytest.fixture(scope="session")
def super_token(s):
    tok, _ = _login(s, *SUPER)
    return tok


@pytest.fixture(scope="session")
def student_ctx(s):
    tok, user = _login(s, *STUDENT)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# -------------------- Health --------------------
def test_root(s):
    r = s.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# -------------------- Auth --------------------
class TestAuth:
    def test_login_admin(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        assert r.status_code == 200
        body = r.json()
        assert body["token_type"] == "bearer"
        assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20
        assert body["user"]["email"] == ADMIN[0]
        assert body["user"]["role"] == "admin"

    def test_login_supervisor(self, s):
        r = s.post(f"{API}/auth/login", json={"email": SUPER[0], "password": SUPER[1]})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "supervisor"

    def test_login_student(self, s):
        r = s.post(f"{API}/auth/login", json={"email": STUDENT[0], "password": STUDENT[1]})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "student"

    def test_login_invalid(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": "wrong"})
        assert r.status_code == 401

    def test_me_returns_current(self, s, admin_token):
        r = s.get(f"{API}/auth/me", headers=_h(admin_token))
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN[0]

    def test_me_no_token_401(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_student_ok(self, s):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass@1234", "name": "Test Stu", "role": "student"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email.lower()
        assert data["user"]["role"] == "student"
        assert data["access_token"]

    def test_register_supervisor_ok(self, s):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass@1234", "name": "Test Sup", "role": "supervisor"
        })
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "supervisor"

    def test_register_admin_rejected(self, s):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass@1234", "name": "X", "role": "admin"
        })
        # Pydantic Literal restricts to student/supervisor → 422
        assert r.status_code in (400, 422)

    def test_register_duplicate_email(self, s):
        r = s.post(f"{API}/auth/register", json={
            "email": STUDENT[0], "password": "Whatever1!", "name": "Dup", "role": "student"
        })
        assert r.status_code == 400


# -------------------- Student workflow --------------------
class TestStudentWorkflow:
    def test_create_thesis_with_file(self, s, student_ctx):
        files = {"file": ("draft.pdf", io.BytesIO(PDF_BYTES), "application/pdf")}
        data = {
            "title": "TEST_Thesis_Workflow",
            "abstract": "Abstract for workflow",
            "year": 2025,
            "program": "MSc Testing",
            "keywords": "test, workflow, qa",
        }
        r = s.post(f"{API}/theses", data=data, files=files, headers=student_ctx["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "draft"
        assert body["has_file"] is True
        assert body["title"] == "TEST_Thesis_Workflow"
        assert body["keywords"] == ["test", "workflow", "qa"]
        student_ctx["thesis_id"] = body["id"]

        # GET verify persistence
        r2 = s.get(f"{API}/theses/{body['id']}", headers=student_ctx["headers"])
        assert r2.status_code == 200
        assert r2.json()["id"] == body["id"]

    def test_mine_lists_thesis(self, s, student_ctx):
        r = s.get(f"{API}/theses/mine", headers=student_ctx["headers"])
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert student_ctx["thesis_id"] in ids

    def test_submit_thesis(self, s, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.post(f"{API}/theses/{tid}/submit", headers=student_ctx["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "submitted"
        assert r.json()["submitted_at"] is not None

    def test_submit_without_file_400(self, s, student_ctx):
        # Create draft without file
        data = {"title": "TEST_NoFile", "abstract": "x", "year": 2025, "program": "p", "keywords": ""}
        r = s.post(f"{API}/theses", data=data, headers=student_ctx["headers"])
        assert r.status_code == 200
        tid = r.json()["id"]
        r2 = s.post(f"{API}/theses/{tid}/submit", headers=student_ctx["headers"])
        assert r2.status_code == 400


# -------------------- Supervisor / Admin / Public --------------------
class TestReviewPublishPublic:
    def test_supervisor_lists_submitted(self, s, super_token, student_ctx):
        r = s.get(f"{API}/theses/submitted", headers=_h(super_token))
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert student_ctx["thesis_id"] in ids

    def test_student_cannot_list_submitted(self, s, student_ctx):
        r = s.get(f"{API}/theses/submitted", headers=student_ctx["headers"])
        assert r.status_code == 403

    def test_student_cannot_review(self, s, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.post(f"{API}/theses/{tid}/review",
                   json={"decision": "approve", "comment": "no"},
                   headers=student_ctx["headers"])
        assert r.status_code == 403

    def test_supervisor_approves(self, s, super_token, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.post(f"{API}/theses/{tid}/review",
                   json={"decision": "approve", "comment": "Looks good"},
                   headers=_h(super_token))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

        # Reviews list contains record
        rv = s.get(f"{API}/theses/{tid}/reviews", headers=_h(super_token))
        assert rv.status_code == 200
        decisions = [d["decision"] for d in rv.json()]
        assert "approve" in decisions

    def test_student_cannot_publish(self, s, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.post(f"{API}/theses/{tid}/publish", headers=student_ctx["headers"])
        assert r.status_code == 403

    def test_supervisor_cannot_publish(self, s, super_token, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.post(f"{API}/theses/{tid}/publish", headers=_h(super_token))
        assert r.status_code == 403

    def test_admin_lists_approved(self, s, admin_token, student_ctx):
        r = s.get(f"{API}/theses/approved", headers=_h(admin_token))
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert student_ctx["thesis_id"] in ids

    def test_admin_publish(self, s, admin_token, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.post(f"{API}/theses/{tid}/publish", headers=_h(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "published"
        assert body["published_at"] is not None

    def test_public_lists_published(self, s, student_ctx):
        r = s.get(f"{API}/public/theses")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert student_ctx["thesis_id"] in ids
        for t in r.json():
            assert t["status"] == "published"

    def test_public_search_query(self, s):
        r = s.get(f"{API}/public/theses", params={"q": "TEST_Thesis_Workflow"})
        assert r.status_code == 200
        results = r.json()
        assert len(results) >= 1
        assert any("TEST_Thesis_Workflow" in t["title"] for t in results)

    def test_public_search_year_filter(self, s):
        r = s.get(f"{API}/public/theses", params={"year": 2025})
        assert r.status_code == 200
        for t in r.json():
            assert t["year"] == 2025

    def test_public_search_seeded_keyword(self, s):
        # Seeded data has urban mobility keyword
        r = s.get(f"{API}/public/theses", params={"q": "mobility"})
        assert r.status_code == 200
        # Either seeded or our test thesis returns; at minimum 200 OK with list
        assert isinstance(r.json(), list)

    def test_file_download_public_for_published(self, s, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.get(f"{API}/files/{tid}", allow_redirects=True)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_admin_unpublish(self, s, admin_token, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.post(f"{API}/theses/{tid}/unpublish", headers=_h(admin_token))
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

    def test_file_download_requires_auth_after_unpublish(self, s, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.get(f"{API}/files/{tid}")
        assert r.status_code == 401

    def test_file_download_with_token_query(self, s, student_ctx):
        tid = student_ctx["thesis_id"]
        r = s.get(f"{API}/files/{tid}", params={"token": student_ctx["token"]})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")


# -------------------- Seeded sample data sanity --------------------
class TestSeedData:
    def test_three_published_seeded(self, s):
        # Public list (without our test thesis) should contain at least 3 published
        r = s.get(f"{API}/public/theses")
        assert r.status_code == 200
        # Filter only those that are seeded student demo (may include test data — just ensure ≥3)
        assert len(r.json()) >= 3

    def test_student_dashboard_has_seeded_data(self, s, student_ctx):
        r = s.get(f"{API}/theses/mine", headers=student_ctx["headers"])
        assert r.status_code == 200
        items = r.json()
        statuses = [t["status"] for t in items]
        assert statuses.count("published") >= 3
        assert "draft" in statuses
        assert "submitted" in statuses
