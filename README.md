# E-CashEngine

Full-stack blog with admin publishing, AI article generation, SQLite runtime storage, secure admin auth, and Docker dev/prod environments.

## Stack

- Frontend: Vite, React, TypeScript, SCSS
- Backend: Node.js, Express, TypeScript
- Database: SQLite (`db.sqlite3` in the project root)
- Service dependency: Redis
- AI: OpenRouter API
- Email/newsletter: Nodemailer SMTP-ready env
- Infra: Docker, Docker Compose

## Project Structure

- `backend/src/index.ts` wires middleware, routes, scheduler, schema bootstrap, and error handling.
- `backend/src/routes/*` contains API route modules wrapped with `asyncHandler`.
- `backend/src/services/*` contains SQLite stores, auth, OpenRouter, sanitization, audit logging, and scheduler logic.
- `frontend/src/App.tsx` contains the small SPA router, pages, and reusable UI sections.
- `frontend/src/styles.scss` contains the e-CashEngine visual system.

Production runtime data lives in root-level `db.sqlite3` and `media/` on the Linux host. The old PostgreSQL and uploads volumes remain available to the import service; the backend uses SQLite after import.

## Features

- Blog list, search, article pages, newsletter, and admin UI
- Newsletter subscription endpoint
- Admin login with JWT access token and httpOnly refresh cookie
- Refresh token hashes stored in SQLite
- CSRF check on refresh
- CRUD for generated/admin posts
- Upload, select, and reuse article cover images
- Admin generation settings and Generate now button
- Multiple scheduled generation times per day
- OpenRouter generation with sanitized HTML before storage
- Audit events for login, settings, post changes, and generation

## Local Development Docker

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d --build
```

If Docker Desktop/BuildKit hangs on `load local bake definitions` or `listing workers`, use the classic-builder rebuild command:

```bash
npm run docker:rebuild
```

This builds `ecashengine-backend-dev` and `ecashengine-frontend-dev` with `DOCKER_BUILDKIT=0`, then starts Compose with `--no-build`.

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Redis runs inside Docker; SQLite and uploaded images live in the project root on the host.

The `admin-seed` service creates a local superadmin and may exit with code `0`. Defaults:

- Email: `admin@ecashengine.local`
- Password: `MySecretPassword123!`

Override with `LOCAL_SUPERADMIN_EMAIL` and `LOCAL_SUPERADMIN_PASSWORD`.

## Admin Setup

For local Docker, `admin-seed` runs automatically. Without Docker:

```bash
cd backend
npm install
npm run create-superadmin
```

Admin users are stored in SQLite. The app does not use `ADMIN_USERNAME`, `ADMIN_PASSWORD`, or `ADMIN_PASSWORD_HASH` for runtime login.

## Auth Troubleshooting

- `Invalid email or password`: run `npm run create-superadmin` with the same `DATABASE_PATH`.
- `Session expired`: sign in again; access tokens are intentionally short-lived.
- Refresh requires the httpOnly cookie and `x-csrf-token`.
- In production, `JWT_SECRET` and `REFRESH_TOKEN_SECRET` must be different, stable, and at least 32 characters.

## Production Secrets

Generate secrets:

```bash
npm run generate-secrets
npm run setup:prod-env
```

`JWT_SECRET` signs short-lived access tokens. `REFRESH_TOKEN_SECRET` hashes refresh tokens before storage. Keep both stable across deploys; rotating them logs users out.

Edit:

- root `.env.production` for one-time PostgreSQL import credentials and public frontend URLs
- `backend/.env.production` for backend secrets, CORS, OpenRouter, SMTP
- root `.env.production` uses `VITE_API_URL` for the browser API endpoint and `VITE_GA_MEASUREMENT_ID` for Google Analytics.

Production refuses to start if required secrets are missing, equal, too short, or production URLs point to localhost.

## Production Deployment Docker

For the first deployment from the old PostgreSQL version, follow [the server migration guide](MIGRATION_TO_SQLITE.ru.md). Once `.env.production` has been copied to the ignored root `.env`, the first import and later deployments use the same command:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Production ports:

- Frontend: host `8100` -> container `3000`
- Backend: host `4105` -> container `4000`
- PostgreSQL and Redis are not published to the host. PostgreSQL stays in Compose for the import dependency; the running backend reads and writes only SQLite.
- Uploaded covers are stored in root-level `media/covers` on the Linux host.

## Local Development Without Docker

Start Redis locally, then:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## API Summary

- `GET /api/health`
- `GET /api/posts`
- `GET /api/posts/search?q=term`
- `GET /api/posts/:slug`
- `POST /api/subscribe`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/admin/posts`
- `POST /api/admin/posts`
- `PUT /api/admin/posts/:slug`
- `DELETE /api/admin/posts/:slug`
- `GET /api/admin/settings`
- `PUT /api/admin/settings`
- `GET /api/admin/media/covers`
- `POST /api/admin/media/covers`
- `DELETE /api/admin/media/covers/:name`
- `POST /api/ai/generate-article`

## Backups

Back up `db.sqlite3` and `media/` together. Regular `docker compose up -d --build` keeps these host files. The old PostgreSQL and uploads volumes should be retained until the import and backup have been verified.

## Verification

Useful checks:

```bash
docker compose config
docker compose up -d --build
curl http://localhost:4000/api/health
curl -I http://localhost:3000/
curl http://localhost:4000/api/posts
docker compose --env-file .env.production -f docker-compose.prod.yml config
curl http://localhost:4105/api/health
curl -I http://localhost:8100/
```
