# University Website Platform

A full-stack university web platform combining a multilingual public website, content management admin panel, student/teacher/staff portals, electronic library, academic timetable and grading, online testing, built-in webmail, service desk, document editing, and Telegram bot integration in a single deployable application.

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see [LICENSE](LICENSE).

---

## Architecture

- **Backend**: Python 3.11+, FastAPI, PostgreSQL 12+ (`psycopg` 3 connection pool), optional S3 object storage, headless Chromium (Playwright / system binary) for PDF exports and Open Graph image rendering.
- **Frontend**: React 19, TypeScript, Vite (built into `frontend/dist` and served directly by FastAPI).
- **Optional sidecar services (included in `docker-compose.yml`)**:
  - **PostgreSQL 16** (`db`) — primary relational store (`kv`, content items, academic tables, library, mail accounts, desk tickets, analytics).
  - **ONLYOFFICE Document Server** (`onlyoffice`) — proxied under `/office-ds/` for viewing public documents and editing personal `docx` / `xlsx` / `pptx` files in the browser.
  - **Stalwart Mail Server** (`mail`) — SMTP/IMAP/JMAP mail server with automated domain/DKIM setup and built-in user webmail under `/student/mail`, `/teacher/mail`, `/staff/mail`, `/admin/mail`.

On startup, only minimal stock starter pages (`/about/about-university`, `/about/research`, `/about/anti-corruption`, `/about/terms-of-use`), default navigation structure, and empty institutional settings are seeded. Empty optional sections (clubs, scholarships, admission calculator, sports, gallery, campus map, virtual tour, partners, open vacancies, journal) are hidden from public navigation and search indexing until populated in `/admin`.

---

## Features

### Public Website (`/`)
- **Multilingual UI & content**: Uzbek (`uz`), Russian (`ru`), English (`en`) with localized routes, `hreflang`, canonical URLs, `sitemap.xml`, `robots.txt`, and `rss.xml`.
- **University profile & CMS pages**: Configurable institution name, abbreviation, logo, address, phones, social links, home hero slides, section toggles, and rich-text/TipTap pages.
- **Academic catalogue**: Faculties/departments (`/faculties`, `/structure`), degree programmes (`/programs`), admission (`/admission`), scholarship/tuition calculator (`/calculator`), tuition fees (`/tuition`), student grants (`/grant`).
- **News, events & media**: News (`/news`), announcements (`/announcements`), events with `.ics` export and registration (`/events`), photo gallery, campus map & virtual tour (`/campus-map`, `/virtual-tour`), legal documents (`/documents`), open data (`/open-data`), ratings (`/ratings`), rector's reception (`/reception`, `/rector`).
- **Cooperation & Career Centre**: Partners (`/partners`), practice bases (`/practice-bases`), startups (`/startups`), alumni stories & register (`/alumni`), vacancies & public employer opportunity submissions (`/careers`, `/career-center`), research articles (`/articles`).
- **Academic Journal**: Multi-issue journal with OAI-PMH endpoint (`/journal`, `/api/oai`).
- **Accessibility & UI extras**: Font scaling, contrast/motion preferences (`/accessibility`), SDG tracker (`/upgoals`), rule-based assistant widget, cookie consent, popup notices, and optional seasonal themes.

### User Portals (`/login` -> `/student`, `/teacher`, `/staff`)
- **Timetable & Academic Journal**: Group/teacher/faculty schedules, conflict-checked lesson grid, printable state-form timetable exports, attendance tracking, grading, assignments, and study materials.
- **Online Tests & Live Quizzes**: Question banks, timed tests, access-code or group-scoped exams, interactive live quiz sessions, and browser result sheets.
- **Digital Library (`/library`)**: Catalog search, ISBN/Excel bulk import, auto-generated SVG/PNG book covers, offline EPUB caching via service worker (`sw.js`), watermarked PDF reader, and an optional open-license starter catalog (`backend/university/seed_library/catalog.json`).
- **Built-in Webmail**: Auto-provisioned `login@domain` mailboxes via Stalwart JMAP/SMTP/IMAP with attachments and folder sync.
- **Documents (ONLYOFFICE)**: Personal document storage with version history (last 10 versions) and collaborative browser editing.
- **Calendar, Forum & Notices**: Personal events, targeted group/university notices, and community discussion forum (`/forum`).

### Administration Panel (`/admin`)
- Separate realm session isolation (`uni_admin` cookie + `X-Admin-Realm: admin` header).
- Role-based access control (`admin`, `study`, `editor`, `career`, `librarian`, desk operators, etc.).
- **Service Desk**: Ticket board for web contact forms, rector reception requests, club joins, employer submissions, and Telegram bot messages (`#UNI-N`), with email replies routed back to the originating ticket.
- **User Management**: Manual CRUD, bulk Excel template download and import (`users-students-template.xlsx`, `users-teachers-template.xlsx`), credentials export, and password resets.
- **Integrations**:
  - **HEMIS REST API**: Sync student/teacher profiles, groups, subjects, GPAs, and schedules (`SITE_HEMIS_*`).
  - **Telegram Bot**: Student/teacher account linking via deep link or 6-digit code, schedule/grade/test notifications, service-desk chat, and automated channel/group autoposting.
  - **Google Drive & S3 Storage**: Folder/archive sync and optional S3-compatible media storage (`SITE_S3_*`).
- **Statistics & Backups**: Privacy-aware pageview analytics (gated behind cookie consent), full database/media backup archives (`python -m university.backup`), and one-time legacy SQLite (`site.sqlite3`) import on first run.

---

## Quick Start

### 1. Docker Compose (Recommended for Production)

Includes the web application, PostgreSQL 16, ONLYOFFICE Document Server, and Stalwart Mail Server.

```bash
cp .env.example .env
# Edit .env: set SITE_URL, SITE_MAIL_DOMAIN, MAIL_HOSTNAME, SITE_ADMIN_PASSWORD, etc.
docker compose up -d --build
```

Check container status and initial admin credentials:

```bash
docker compose logs -f web
```

If `SITE_ADMIN_PASSWORD` is left blank in `.env`, a random password is generated on first boot, printed in container logs, and written to `/data/admin_password.txt` inside the `site-data` volume.

By default `docker-compose.yml` exposes the web app on `127.0.0.1:${SITE_PORT:-11659}` -> container port `8000` (intended to sit behind nginx, Caddy, or Cloudflare with TLS).

#### Mail Server Notes (Stalwart)
- On first boot, `docker/mail/entrypoint.sh` creates `/secrets/admin_password` inside `mail-secrets` and configures the mail hostname and domain automatically.
- Set `MAIL_ACME=1` in `.env` if `MAIL_HOSTNAME` resolves to the server on port 443 and should request a Let's Encrypt certificate; otherwise a self-signed certificate is used.
- Configure DNS `MX`, `SPF`, `DKIM`, and `DMARC` records from the DNS helper inside `/admin` -> Mail Server.
- To run without the mail server, set `SITE_MAIL_ENABLED=0`.

---

### 2. Local Development (Linux / macOS)

Requires **Python 3.11+**, **Node.js 20+**, and **PostgreSQL 12+** (`psql`, `initdb`, `pg_ctl` for automatic local cluster, or an external `SITE_DATABASE_URL`).

```bash
# Build frontend
cd frontend
npm ci
npm run build
cd ..

# Install backend dependencies
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Start backend + local Postgres cluster (initializes ./var/pg if SITE_DATABASE_URL is unset)
./run.sh
```

Open `http://127.0.0.1:8000` (and `/admin` for the admin panel).

For frontend hot-reload during development, run Vite in one terminal and uvicorn in another:

```bash
# Terminal 1 (frontend dev server)
cd frontend && npm run dev

# Terminal 2 (backend API)
PYTHONPATH=backend uvicorn university.api.main:app --reload --port 8000
```

---

## Environment Variables

See [`.env.example`](.env.example) for all supported options. Key variables:

| Variable | Description | Default / Example |
|---|---|---|
| `SITE_ADMIN_LOGIN` | Initial administrator username | `admin` |
| `SITE_ADMIN_PASSWORD` | Initial admin password (auto-generated if empty) | `""` |
| `SITE_ADMIN_RESET_PASSWORD` | Set to `1` to reset admin password to `SITE_ADMIN_PASSWORD` on boot | `""` |
| `SITE_URL` | Public origin URL used in emails, sitemaps, RSS, and OG tags | `https://example.edu` |
| `SITE_TZ` | IANA timezone for schedules, tickets, and logs | `Asia/Tashkent` |
| `SITE_COOKIE_SECURE` | Set `1` behind HTTPS; set `0` for plain HTTP on `localhost` | `1` |
| `SITE_DATABASE_URL` | PostgreSQL DSN | `postgresql://university@db:5432/university` |
| `SITE_DEMO_ACADEMIC` | Seed sample academic groups/users/lessons on fresh DB (`0` for production) | `0` in `.env.example` |
| `SITE_DEMO_PASSWORD` | Password for demo academic accounts when `SITE_DEMO_ACADEMIC=1` | `demo2025` |
| `SITE_DATA_DIR` | Directory for uploads, backups, documents, and library files | `/data` (Docker) / `./var` (`run.sh`) |
| `SITE_OFFICE_ENABLED` | Enable ONLYOFFICE integration (`1` / `0`) | `0` (code default) / `1` (Compose) |
| `SITE_MAIL_ENABLED` | Enable built-in mail integration (`1` / `0`) | Auto-detected from secrets |
| `SITE_MAIL_DOMAIN` | Primary mailbox domain (`user@domain`) | `example.edu` |
| `SITE_HEMIS_ENABLED` | Enable HEMIS sync on startup (`1` / `0`) | `0` |
| `SITE_S3_ENABLED` | Enable S3-compatible object storage (`1` / `0`) | `0` |
| `SITE_TELEGRAM_TOKEN` | Telegram bot token (also editable in `/admin`) | `""` |
| `SITE_LIBRARY_SEED` | Disable open-license library catalog background seed when `0` | Enabled by default |

---

## Backups & CLI Utilities

Database tables are exported cleanly as CSV snapshots alongside media/library/office files:

```bash
# Create backup in <SITE_DATA_DIR>/backups/<timestamp>
PYTHONPATH=backend python -m university.backup make

# Restore database and files from a backup directory
PYTHONPATH=backend python -m university.backup restore /data/backups/2026-01-15T12-00-00
```

Legacy SQLite migration: if a `site.sqlite3` file exists in `SITE_DATA_DIR` on first PostgreSQL startup, it is imported once into PostgreSQL and renamed to `site.sqlite3.migrated-<timestamp>`.

---

## Testing

### Frontend Type-Check & Production Build

```bash
cd frontend
npx tsc -b
npm run build
```

### Backend Test Suite

Tests run against a real PostgreSQL database (specified via `SITE_TEST_PG_URL`):

```bash
pip install pytest
SITE_TEST_PG_URL=postgresql://user@127.0.0.1:5432/site_test PYTHONPATH=backend pytest -q backend/tests
```

---

## License

This project is free software licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. Anyone using, modifying, or running this software over a network must distribute the corresponding source code under the same license terms. See [LICENSE](LICENSE) for details.
