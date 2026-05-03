# ThesisVault

A **pure MERN** web app for managing university theses end-to-end: students upload drafts, supervisors review, admins publish, and the public browses an open repository.

**Stack**

| Layer    | Tech                                                                    |
|----------|-------------------------------------------------------------------------|
| Frontend | React 19 · react-router-dom · axios · Tailwind · lucide-react           |
| Backend  | Node.js 20 · Express · Mongoose · JWT (jsonwebtoken) · bcryptjs · multer |
| Database | MongoDB (documents + **binary PDFs stored inside Mongo**, no filesystem) |

> ℹ️ **About `backend/server.py`** — If you see that file in the Emergent preview, it is *not* part of your project. It's a ~130-line ASGI proxy that only exists because the Emergent preview's supervisor is hardcoded to run `uvicorn server:app`. Your real backend is `backend/index.js`. The file is **gitignored** (see `.gitignore`), so your GitHub repo and any deploy you take out of Emergent is **100% JavaScript**.

---

## Quick start — with Docker (recommended, one command)

Requires Docker + Docker Compose only. No local Node or Mongo install needed.

```bash
docker compose up
```

That starts:

| Service  | Port  | Notes                                                |
|----------|-------|------------------------------------------------------|
| mongo    | 27017 | Data persisted in named volume `thesisvault-mongo`   |
| backend  | 8002  | Runs `yarn install && yarn start` from `./backend`   |
| frontend | 3000  | Runs `yarn install && yarn start` from `./frontend`  |

Open <http://localhost:3000>. Demo accounts are seeded automatically.

Stop: `Ctrl+C` then `docker compose down`. Wipe data: `docker compose down -v`.

---

## Quick start — without Docker

### Prerequisites

- **Node.js** ≥ 18 (20 recommended) — <https://nodejs.org>
- **Yarn** (classic v1) — `npm i -g yarn`
- **MongoDB** ≥ 6 — install locally **or** use a free MongoDB Atlas cluster

  ```bash
  # macOS
  brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community

  # Debian/Ubuntu (see https://www.mongodb.com/docs/manual/administration/install-on-linux/)
  sudo apt install -y mongodb-org && sudo systemctl start mongod

  # Or via Docker (simplest)
  docker run -d --name mongo -p 27017:27017 -v mongo-data:/data/db mongo:7
  ```

  > *Why doesn't Mongo auto-start with the backend?* MongoDB is an **independent database server** — Node.js is just a client that connects to it. Use `docker compose up` (above) if you want them bundled, or point `MONGO_URL` at a cloud Atlas cluster.

### 1. Backend

```bash
cd backend
yarn install

# create backend/.env (copy the template below)

yarn start
```

`backend/.env` template:

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="thesisvault"
PORT=8002
CORS_ORIGINS="http://localhost:3000"
JWT_SECRET="replace-with-a-64-char-random-hex"

ADMIN_EMAIL="admin@thesisvault.io"
ADMIN_PASSWORD="Admin@12345"
SUPERVISOR_EMAIL="supervisor@thesisvault.io"
SUPERVISOR_PASSWORD="Super@12345"
STUDENT_EMAIL="student@thesisvault.io"
STUDENT_PASSWORD="Student@12345"
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Expected boot logs:

```
[db] connected to thesisvault
[seed] created admin: admin@thesisvault.io
[seed] created supervisor: supervisor@thesisvault.io
[seed] created student: demo student
[thesisvault] MERN backend listening on 0.0.0.0:8002
```

Sanity check: `curl http://localhost:8002/api/` → `{"stack":"MERN","status":"ok",...}`

### 2. Frontend

```bash
cd frontend
yarn install
# create frontend/.env:
#   REACT_APP_BACKEND_URL=http://localhost:8002
#   WDS_SOCKET_PORT=0
yarn start
```

Open <http://localhost:3000>.

---

## Demo accounts (seeded on first boot)

| Role       | Email                         | Password       |
|------------|-------------------------------|----------------|
| Admin      | admin@thesisvault.io          | Admin@12345    |
| Supervisor | supervisor@thesisvault.io     | Super@12345    |
| Student    | student@thesisvault.io        | Student@12345  |

Login page has one-click **demo-fill** buttons at the bottom.

---

## File storage — all PDFs live in MongoDB

PDFs are stored **inside MongoDB** in the `thesis_files` collection as `Buffer` fields — there is no filesystem folder, no S3 bucket, nothing to back up separately. MongoDB is the single source of truth for both metadata and files.

```js
// backend/src/models/ThesisFile.js
{
  thesis_id: String,
  filename:  String,
  content_type: "application/pdf",
  size: Number,
  data: Buffer,          // raw PDF bytes
  created_at, updated_at
}
```

**Size limit**: **15 MB per PDF** (the MongoDB BSON document max is 16 MB). If you expect larger files, swap `ThesisFile` for GridFS (mongoose has built-in support) — the routes in `backend/src/routes/files.js` are the only place that needs changing.

If you see an old `backend/uploads/` folder locally, it's harmless and gitignored. On first boot the backend auto-migrates any disk PDFs into MongoDB, then never touches disk again.

---

## Project layout

```
/
├── .gitignore                    # excludes backend/server.py, requirements.txt, uploads/
├── docker-compose.yml            # one-command local dev (mongo + backend + frontend)
├── README.md
│
├── backend/                      # MERN backend
│   ├── index.js                  # Express entry
│   ├── package.json
│   ├── .env                      # you create this (gitignored)
│   └── src/
│       ├── db.js                 # Mongoose connection
│       ├── seed.js               # idempotent demo-account seeder
│       ├── migrate.js            # disk -> DB migration for legacy uploads
│       ├── models/
│       │   ├── User.js
│       │   ├── Thesis.js
│       │   ├── Review.js
│       │   └── ThesisFile.js     # PDF bytes inside Mongo
│       ├── middleware/
│       │   └── auth.js           # JWT + bcryptjs + role guards
│       └── routes/
│           ├── auth.js           # /api/auth/*
│           ├── theses.js         # /api/theses/*   (multer memoryStorage)
│           ├── public.js         # /api/public/*
│           └── files.js          # /api/files/:id  (streams Buffer from Mongo)
│
└── frontend/                     # React app (CRA + craco)
    ├── package.json
    ├── .env                      # you create this (gitignored)
    └── src/
        ├── App.js
        ├── context/AuthContext.jsx
        ├── components/           # Header · StatusBadge · ProtectedRoute
        ├── lib/api.js            # axios instance + error helpers
        └── pages/                # PublicRepository · Login · Register · StudentDashboard · ThesisForm · SupervisorDashboard · AdminDashboard
```

---

## End-to-end smoke test

1. Login as **student** → New thesis → fill metadata + attach any PDF ≤ 15 MB → Save → **Submit for review**
2. Logout → login as **supervisor** → Review Queue → **Review** → *Approve* → Submit
3. Logout → login as **admin** → Admin → **Publish**
4. Logout → visit `/` → your thesis is searchable and downloadable 🎉

---

## API quick reference

Auth header: `Authorization: Bearer <access_token>`. Errors use `{ "detail": "..." }`.

```
POST   /api/auth/register           { email, password, name, role }   role=student|supervisor
POST   /api/auth/login              { email, password }
GET    /api/auth/me

POST   /api/theses                  multipart (title,abstract,year,program,keywords,file)   [student]
GET    /api/theses/mine                                                                     [student]
GET    /api/theses/submitted                                                                [supervisor|admin]
GET    /api/theses/approved                                                                 [admin]
GET    /api/theses/:id                                                                      [any auth]
PUT    /api/theses/:id              multipart                                               [student owner]
POST   /api/theses/:id/submit                                                               [student owner]
POST   /api/theses/:id/review       { decision: approve|reject|changes, comment }          [supervisor]
GET    /api/theses/:id/reviews                                                              [any auth]
POST   /api/theses/:id/publish                                                              [admin]
POST   /api/theses/:id/unpublish                                                            [admin]

GET    /api/public/theses?q=&year=
GET    /api/public/theses/:id

GET    /api/files/:id               # public for published; Bearer or ?token= for unpublished
```

---

## Production deployment (pure JS, no Python)

1. `git push` — thanks to `.gitignore`, your repo has **zero** Python files.
2. On your host:
   ```bash
   cd backend && yarn install --production
   pm2 start index.js --name thesisvault-api
   pm2 save && pm2 startup
   ```
3. Build the frontend: `cd frontend && yarn build` — deploy `frontend/build/` to any static host (Vercel, Nginx, CDN).
4. Point your reverse-proxy `/api/*` to `http://localhost:8002`.
5. Set real `CORS_ORIGINS`, rotate `JWT_SECRET`, change every seeded password.

---

## Reset / cleanup

```bash
# Drop everything (dev only!)
docker compose down -v                                  # docker path
# or
mongosh thesisvault --eval 'db.dropDatabase()'         # host path

# Restart backend → demo accounts + indexes are re-seeded.
```

---

## Troubleshooting

| Symptom                                         | Fix                                                                                          |
|-------------------------------------------------|----------------------------------------------------------------------------------------------|
| `ECONNREFUSED 127.0.0.1:27017`                  | MongoDB is not running. Start `mongod`, Docker, or use `docker compose up`.                  |
| `JWT_SECRET not configured`                     | Missing `backend/.env`. Copy the template above.                                             |
| Login returns 401 with correct credentials      | First boot must finish seeding. Watch logs for `[seed] created ...`.                         |
| CORS errors in the browser console              | Set `CORS_ORIGINS=http://localhost:3000` in `backend/.env` and restart the backend.          |
| Frontend can't reach API                        | `REACT_APP_BACKEND_URL` must be `http://localhost:8002` (no trailing `/api`).                |
| `File too large` / 413 on upload                | PDFs are capped at 15 MB to stay under MongoDB's 16 MB BSON limit. Use GridFS if you need more. |
| `Only PDF files are allowed`                    | Upload must be a PDF.                                                                        |

---

📚 Built with a scholarly eye. Happy shipping.
