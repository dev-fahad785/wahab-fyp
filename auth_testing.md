# ThesisVault Auth Testing Playbook

## Seeded Accounts (after backend start)
- Admin: admin@thesisvault.io / Admin@12345 (role: admin)
- Supervisor: supervisor@thesisvault.io / Super@12345 (role: supervisor)
- Student: student@thesisvault.io / Student@12345 (role: student)

## API Testing

Base URL: `${REACT_APP_BACKEND_URL}/api`

### Login
```
curl -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@thesisvault.io","password":"Admin@12345"}'
# -> { "access_token": "...", "token_type": "bearer", "user": {...} }
```

### Get current user
```
curl "$API/auth/me" -H "Authorization: Bearer $TOKEN"
```

### Register (student or supervisor only; admin is seeded)
```
curl -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d '{"email":"x@y.com","password":"Password@1","name":"Jane","role":"student"}'
```

## MongoDB Verification
```
mongosh
use test_database
db.users.find({}, {password_hash: 0}).pretty()
db.users.getIndexes()   # should include unique index on email
```

## Workflow end-to-end
1. Login as student → POST /api/theses (multipart: title, abstract, year, program, keywords, file) → draft created
2. POST /api/theses/{id}/submit → status=submitted
3. Login as supervisor → GET /api/theses/submitted → review → POST /api/theses/{id}/review {decision:"approve"|"reject"|"changes", comment}
4. Login as admin → GET /api/theses/approved → POST /api/theses/{id}/publish → status=published
5. Public (no auth) → GET /api/public/theses?q=...&year=... → visible list
6. Public → GET /api/files/{thesis_id} → PDF download (only for published)
