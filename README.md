# ThesisVault

A **MERN** web app for managing university theses end-to-end: students upload drafts, supervisors review, admins publish, and the public browses an open repository.

**Stack**

| Layer    | Tech                                                            |
|----------|------------------------------------------------------------------|
| Frontend | React 19 · react-router-dom · axios · Tailwind · lucide-react   |
| Backend  | Node.js 20 · Express · Mongoose · JWT (jsonwebtoken) · bcryptjs · multer |
| Database | MongoDB                                                          |

---

## 1. Prerequisites

Install these on your machine:

- **Node.js** ≥ 18 (20 recommended) — <https://nodejs.org>
- **Yarn** (classic v1) — `npm i -g yarn`
- **MongoDB** ≥ 6 — run locally (`brew install mongodb-community` / `apt install mongodb` / official docker image)

Verify:

```bash
node -v        # v20.x
yarn -v        # 1.22.x
mongod --version
```

---

## 2. Project layout

```
/app
├── backend/                 # Node + Express API (MERN backend)
│   ├── index.js             # Entry point
│   ├── package.json
│   ├── .env                 # Local config (you create this)
│   ├── src/
│   │   ├── db.js
│   │   ├── seed.js
│   │   ├── models/          # User.js · Thesis.js · Review.js
│   │   ├── middleware/
│   │   │   └── auth.js      # JWT + bcrypt + role guards
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── theses.js
│   │       ├── public.js
│   │       └── files.js
│   ├── uploads/             # PDF files land here (auto-created)
│   └── server.py            # ⚠️ Emergent-preview-only ASGI proxy. DELETE for local/native deploy.
│
└── frontend/                # React app (CRA + craco)
    ├── package.json
    ├── .env                 # Local config (you create this)
    └── src/
        ├── App.js
        ├── context/AuthContext.jsx
        ├── components/      # Header · StatusBadge · ProtectedRoute
        ├── lib/api.js       # axios instance + error helpers
        └── pages/           # PublicRepository · Login · Register · StudentDashboard · ThesisForm · SupervisorDashboard · AdminDashboard
```

> 💡 `backend/server.py` exists only because the Emergent preview supervisor hardcodes `uvicorn`. **Ignore it for local dev** — run Node directly (`node index.js` or `yarn start`).

---

## 3. Backend setup

### 3.1 Install dependencies

```bash
cd backend
yarn install        # or: npm install
```

### 3.2 Create `backend/.env`

Copy-paste this file as-is for a working local config:

```env
# Mongo
MONGO_URL="mongodb://localhost:27017"
DB_NAME="thesisvault"

# Server
PORT=8002
CORS_ORIGINS="http://localhost:3000"

# Auth
JWT_SECRET="replace-with-a-64-char-random-hex-string"

# Seeded demo accounts (change for production!)
ADMIN_EMAIL="admin@thesisvault.io"
ADMIN_PASSWORD="Admin@12345"
SUPERVISOR_EMAIL="supervisor@thesisvault.io"
SUPERVISOR_PASSWORD="Super@12345"
STUDENT_EMAIL="student@thesisvault.io"
STUDENT_PASSWORD="Student@12345"

# Upload directory (auto-created if missing)
UPLOAD_DIR="./uploads"
```

Generate a fresh JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Start MongoDB (separate terminal)

```bash
# macOS / Linux (system service)
mongod --dbpath ~/data/db

# …or via Docker
docker run -d --name mongo -p 27017:27017 mongo:7
```

### 3.4 Run the backend

```bash
yarn start          # node index.js
# or for auto-reload during dev:
# npx nodemon index.js
```

You should see:

```
[db] connected to thesisvault
[seed] created admin: admin@thesisvault.io
[seed] created supervisor: supervisor@thesisvault.io
[seed] created student: demo student
[thesisvault] MERN backend listening on 0.0.0.0:8002
```

Sanity check:

```bash
curl http://localhost:8002/api/
# {"message":"ThesisVault API","status":"ok","stack":"MERN"}
```

---

## 4. Frontend setup

### 4.1 Install

```bash
cd frontend
yarn install
```

### 4.2 Create `frontend/.env`

```env
REACT_APP_BACKEND_URL=http://localhost:8002
WDS_SOCKET_PORT=0
```

> All frontend API calls prefix `/api` themselves (e.g. axios hits `${REACT_APP_BACKEND_URL}/api/auth/login`), so `REACT_APP_BACKEND_URL` must be the backend origin **without** `/api`.

### 4.3 Run

```bash
yarn start
```

Open <http://localhost:3000>. You should see the editorial Repository landing page.

---

## 5. Demo accounts (seeded on first backend boot)

| Role       | Email                         | Password       |
|------------|-------------------------------|----------------|
| Admin      | admin@thesisvault.io          | Admin@12345    |
| Supervisor | supervisor@thesisvault.io     | Super@12345    |
| Student    | student@thesisvault.io        | Student@12345  |

On the Login page, use the one-click **demo fill** buttons at the bottom.

---

## 6. End-to-end smoke test

1. Login as **student** → New thesis → fill metadata + attach any PDF → save → **Submit for review**
2. Logout → login as **supervisor** → open Review Queue → click **Review** → choose *Approve* → Submit
3. Logout → login as **admin** → open Admin → click **Publish**
4. Logout → visit `/` (public) → your thesis is searchable and downloadable 🎉

---

## 7. API quick reference

All routes are JSON except PDF uploads (multipart) and `/api/files/*` (binary PDF).
Auth: `Authorization: Bearer <access_token>`.

```
POST   /api/auth/register          { email, password, name, role }   role=student|supervisor
POST   /api/auth/login             { email, password }
GET    /api/auth/me

POST   /api/theses                 multipart (title,abstract,year,program,keywords,file)     [student]
GET    /api/theses/mine                                                                       [student]
GET    /api/theses/submitted                                                                  [supervisor|admin]
GET    /api/theses/approved                                                                   [admin]
GET    /api/theses/:id                                                                        [any auth]
PUT    /api/theses/:id             multipart                                                  [student owner]
POST   /api/theses/:id/submit                                                                 [student owner]
POST   /api/theses/:id/review      { decision: approve|reject|changes, comment }             [supervisor]
GET    /api/theses/:id/reviews                                                                [any auth]
POST   /api/theses/:id/publish                                                                [admin]
POST   /api/theses/:id/unpublish                                                              [admin]

GET    /api/public/theses?q=&year=
GET    /api/public/theses/:id

GET    /api/files/:id              # public for published; Bearer or ?token= for unpublished
```

---

## 8. Common scripts

### Backend

```bash
yarn start              # node index.js
npx nodemon index.js    # auto-reload on file change (install nodemon if needed)
```

### Frontend

```bash
yarn start              # dev server on :3000
yarn build              # production bundle in build/
```

### Reset MongoDB (dev only)

```bash
mongosh thesisvault --eval 'db.dropDatabase()'
```

Restart the backend and the demo accounts + indexes are re-seeded automatically.

---

## 9. Production deployment notes

- Drop `backend/server.py` and `backend/requirements.txt` entirely — they are only plumbing for the Emergent preview.
- Run Node with a process manager (pm2, systemd, Docker):

  ```bash
  pm2 start index.js --name thesisvault
  pm2 save
  ```
- Put Node behind Nginx / Caddy on the public host and proxy `/api/*`.
- Set `CORS_ORIGINS` to your frontend's real origin (e.g. `https://thesisvault.yourschool.edu`).
- Rotate `JWT_SECRET` and change all seeded passwords in `.env`.
- Build the frontend (`yarn build`) and serve the static bundle from any CDN or Nginx.
- For file storage at scale, swap the local `uploads/` directory for S3 or similar (only the `persistPdf` helper in `src/routes/theses.js` needs changing).

---

## 10. Troubleshooting

| Symptom                                         | Fix                                                                                          |
|-------------------------------------------------|----------------------------------------------------------------------------------------------|
| `ECONNREFUSED 127.0.0.1:27017`                  | MongoDB is not running. Start `mongod` or Docker container.                                  |
| `JWT_SECRET not configured`                     | Missing `backend/.env`. Copy the template in §3.2.                                           |
| Login returns 401 even with correct credentials | First boot must complete seeding. Check backend logs for `[seed] created ...` lines.         |
| CORS errors in browser console                  | Set `CORS_ORIGINS=http://localhost:3000` in `backend/.env` and restart the backend.          |
| Frontend can't reach API                        | Confirm `frontend/.env` has `REACT_APP_BACKEND_URL=http://localhost:8002` (no trailing `/api`). |
| `Only PDF files are allowed`                    | Upload must be a PDF ≤ 50 MB.                                                                |

---

Happy shipping. 📚
