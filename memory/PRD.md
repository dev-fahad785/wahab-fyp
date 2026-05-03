# ThesisVault — Product Requirements Document

## Original Problem Statement
Build a Minimum Viable Product (MVP) for a web-based thesis management system called **ThesisVault**. A functional system that allows:
- Students to upload and manage thesis drafts
- Supervisors to review and give decisions
- Admins to publish approved theses
- Public users to search and view published theses

Source: User-provided SDD and SRS PDFs (ThesisVault project).

## User Choices (Jan 2026)
- **Stack**: React + FastAPI REST + MongoDB (adapted from original Next.js + Supabase spec to match Emergent preview environment)
- **Auth**: Custom JWT (HS256) with bcrypt password hashing, Bearer token in `Authorization` header, stored in `localStorage` (`tv_token`)
- **Seeded accounts**: Yes — admin, supervisor, student pre-created
- **Design**: Distinctive editorial / scholarly "Modern Archive" aesthetic (Cormorant Garamond + IBM Plex Sans, paper background, sharp borders, status badges)
- **Scope**: Full MVP in one iteration

## Architecture
- **Frontend** (`/app/frontend`): React 19, react-router-dom 7, axios, Tailwind CSS, lucide-react icons. Pages: PublicRepository, Login, Register, StudentDashboard, ThesisForm (create/edit), SupervisorDashboard, AdminDashboard. AuthContext stores user + token.
- **Backend** (`/app/backend`): **Node.js + Express + Mongoose** — entry `index.js` → `src/{db,seed}.js` + `src/routes/{auth,theses,public,files}.js` + `src/models/{User,Thesis,Review}.js` + `src/middleware/auth.js`. Uses `bcryptjs`, `jsonwebtoken`, `multer` (memoryStorage, 50MB, PDF-only), `cors`, `dotenv`, `uuid`. Uploads stored at `/app/backend/uploads/{thesis_id}.pdf`.
- **Preview harness**: `server.py` (~130 LoC) is a FastAPI ASGI proxy that spawns Node on `127.0.0.1:8002` and forwards every request. Required only because the Emergent preview supervisor hardcodes `uvicorn server:app` — drop this file on native Node deploy.
- **Database**: MongoDB collections — `users`, `theses`, `reviews`. Indexes: users.email (unique), theses.id/status/student_id, reviews.thesis_id. Data was preserved across the FastAPI→Node migration.
- **Status state machine**: draft → submitted → (approved | rejected | changes). approved ↔ published (admin).

## User Personas
1. **Student** — registers, creates thesis drafts with metadata + PDF, submits for review, resubmits after "changes requested".
2. **Supervisor** — registers, reviews submitted theses, issues approve/reject/changes decisions with comments.
3. **Admin** — seeded by institution, publishes/unpublishes approved theses.
4. **Public** — browses and downloads published theses, no login required.

## Core Requirements (Static)
- Email/password auth with role-based access
- Thesis metadata: title, abstract, year, program, keywords, PDF file
- Review history stored per thesis
- Public search by title/keyword/author/program + year filter
- RBAC enforced at API layer
- PDFs downloadable by public only when `status=published`

## Implemented (Jan 2026)
✅ Auth (register, login, /me) with JWT Bearer tokens + bcrypt
✅ Seeded accounts: admin/supervisor/student
✅ Student: create draft (multipart), edit, submit, view feedback
✅ Supervisor: review queue, approve/reject/changes with comments
✅ Admin: publish/unpublish approved theses
✅ Public: searchable repository with year/query filters, PDF download
✅ Role guards on every endpoint, tested
✅ File upload/download (PDF only) with signed query-token fallback for anchor downloads
✅ Editorial scholarly UI with status badges, paper noise background, serif display type
✅ Sample data seeded: 3 published theses, 1 draft, 1 awaiting review under student demo

## Test Status
- **Iteration 1** (Jan 2026, FastAPI): 100% backend (33/33) + 100% frontend flows.
- **Iteration 2** (Jan 2026, MERN migration): 100% backend (36/36) + 100% frontend flows.
- **Iteration 3** (Jan 2026, PDFs in DB): 48/50 — exposed a real schema bug (`file_path` still in Mongoose schema).
- **Iteration 4** (Jan 2026, bug fix): **50/50 backend** (14 migration + 36 regression) + frontend unchanged. Reports: `/app/test_reports/iteration_{3,4}.json`.

## File storage
As of iteration 3, PDFs are stored **inside MongoDB** (`thesis_files` collection, `Buffer` field, 15 MB cap under BSON limit). No filesystem, no S3. Legacy disk files are auto-migrated + cleaned on boot.

## Repo hygiene
`/app/.gitignore` excludes Emergent-preview-only files (`backend/server.py`, `backend/requirements.txt`, `backend/uploads/`) — so the repo a user checks out / deploys is **pure JavaScript / MERN**. `docker-compose.yml` at the repo root starts mongo + backend + frontend with one `docker compose up`.

## Backlog / Future Enhancements
### P1
- **Email notifications** on submit/approve/publish (currently visible only in UI)
- **Version history** per thesis (multiple file versions as per SDD)
- **Supervisor assignment** — currently any supervisor can review any submission; SDD implies assignment
- **Admin user management** — list/deactivate users
- **Delete / archive** thesis endpoint (seed & test data currently cannot be removed via UI)

### P2
- Replace deprecated `@app.on_event` with lifespan context manager
- Split `server.py` into routers/ + models/ modules for maintainability
- Short-lived signed download URLs instead of JWT in query string
- Pagination on dashboards and public repository
- Thesis rich metadata (supervisor selection, co-authors, department)
- In-app PDF preview

### P3 (Nice-to-have)
- Dark mode toggle
- Supervisor analytics (avg review time, approval rate)
- Full-text search with MongoDB Atlas Search or similar
- CSV export of catalog
- Citation-ready BibTeX/APA export per thesis
