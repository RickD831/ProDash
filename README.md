# ProDash – Project Launch Board

A project management dashboard for internal use, built with Node.js, Express, PostgreSQL, and plain HTML/CSS/JS. Authentication via Microsoft Entra ID (Azure AD) SSO — anyone already signed into O365 logs in automatically.

## Features

### Authentication & Access Control
- **Microsoft Entra ID SSO** — Single sign-on via Azure AD; no separate passwords
- **Role-based access** — `admin` role (configured via `ADMIN_EMAILS` in `.env`) can create, edit, and delete; all other authenticated users get read-only `reader` access
- **Session persistence** — Sessions stored in PostgreSQL; survive server restarts

### Views
- **Launch Board** — Sortable, filterable table of all projects with key fields at a glance; column-level text filters + header sort
- **Timeline (Gantt)** — 96-month bar chart (Jan 2025 – Dec 2032) with calendar year, fiscal year (Jul–Jun), quarter, and month header rows; collapsible filter/sort bar for status, team, and custom fields; click a project name to navigate to its detail
- **Status** — At-a-glance dashboard with summary stat cards and three charts: projects by status (doughnut), by division (horizontal bar), and by project manager (horizontal bar)
- **Project Detail** — Full-page panel view per project; also opens as a standalone page via the ↗ button

### Project Management
- **Milestones** — Add sub-tasks with start/end dates and status; editable inline in edit mode; appear on the project detail page and as expandable rows in the Timeline
- **Budget Tracking** — Set a total budget, add categorized cost items, and see auto-calculated totals, remaining balance, and % used
- **Notes** — Freeform text notes per project
- **Links** — Store and display related URLs per project
- **Custom Fields** — Define additional fields globally (text, select, date, number); optionally surface them as columns on the launch board and as filters on the timeline

### Editing (Admin only)
- **Edit Mode** — Gear icon on project pages toggles editing without cluttering the default read-only view
- **Timeline Drag Editing** — Gear icon on the Timeline unlocks drag editing: drag a bar to move it, drag edges to resize. Snaps to the nearest week. Works for both project bars and milestone sub-rows.
- **Hide from Timeline** — Checkbox in Project Details to exclude a project from the Timeline view

### Data
- **CSV Export** — Download all projects as a CSV including notes, links, milestones, budget cost items, and custom fields
- **CSV Import** — Upload a CSV to append projects in bulk (admin only); accepts ISO dates (YYYY-MM-DD) or US format (MM/DD/YYYY)

### Themes
- **Light / Dark / Synthwave** — Three themes toggled via the nav bar button on every page; persists across page loads via `localStorage`

### Admin
- **Option Lists** — Manage the status, division, funding source, level of effort, and cost category dropdown values
- **Display Settings** — Set the default sidebar sort order and board sort column/direction
- **Custom Field Definitions** — Create and delete custom fields; control which appear as launch board columns and timeline filters

---

## Prerequisites

- **Node.js** v18 or higher
- **PostgreSQL** v14 or higher
- A **Microsoft Azure** account with an Entra ID (Azure AD) app registration

---

## First-Time Setup

### 1. Clone and install dependencies

```bash
cd ProDash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=prodash
DB_USER=postgres
DB_PASSWORD=your_postgres_password

ENTRA_CLIENT_ID=your-azure-app-client-id
ENTRA_CLIENT_SECRET=your-azure-app-client-secret
ENTRA_TENANT_ID=your-azure-tenant-id
ENTRA_REDIRECT_URI=https://your-hostname:3000/auth/callback

SESSION_SECRET=a-long-random-string

# Comma-separated emails that get admin role
ADMIN_EMAILS=you@yourdomain.com
```

### 3. Register the app in Azure Portal

1. Go to **portal.azure.com** → Entra ID → **App registrations** → **New registration**
2. Name: `ProDash`, Supported account types: **Accounts in this org only**
3. Redirect URI: **Web** → `https://your-hostname:3000/auth/callback`
4. After creation, copy **Application (client) ID** → `ENTRA_CLIENT_ID`
5. Copy **Directory (tenant) ID** → `ENTRA_TENANT_ID`
6. Go to **Certificates & secrets** → **New client secret** → copy the **Value** → `ENTRA_CLIENT_SECRET`

### 4. Generate a TLS certificate

ProDash runs over HTTPS. For internal/dev use, a self-signed cert works fine.

**On Windows (PowerShell as Administrator):**
```powershell
# Generate cert and store it
New-SelfSignedCertificate `
  -DnsName "your-hostname" `
  -CertStoreLocation "cert:\LocalMachine\My" `
  -FriendlyName "ProDash" `
  -NotAfter (Get-Date).AddYears(5)

# Export to PFX
$cert = Get-ChildItem cert:\LocalMachine\My | Where-Object { $_.FriendlyName -eq "ProDash" }
Export-PfxCertificate -Cert $cert -FilePath "cert.pfx" `
  -Password (ConvertTo-SecureString -String "certpass" -Force -AsPlainText)

# Create cert folder and convert to PEM (requires OpenSSL)
mkdir cert
openssl pkcs12 -in cert.pfx -nocerts -noenc -out cert\key.pem -passin pass:certpass
openssl pkcs12 -in cert.pfx -clcerts -nokeys -out cert\cert.pem -passin pass:certpass
```

To avoid browser warnings, import `cert\cert.pem` into the trusted root store on each client machine:
```powershell
Import-Certificate -FilePath "cert\cert.pem" -CertStoreLocation "cert:\LocalMachine\Root"
```

> The `cert/` folder is gitignored — your private key is never committed.

### 5. Create the PostgreSQL database and schema

```bash
psql -U postgres -c "CREATE DATABASE prodash;"
psql -U postgres -d prodash -f db/schema.sql
```

### 6. Migrate existing data (if upgrading from the JSON version)

```bash
node db/migrate.js
```

### 7. Start the server

```bash
npm start
```

Open **https://your-hostname:3000** — you'll be redirected to the Microsoft login page.

For auto-reload during development:
```bash
npm run dev
```

---

## Project Structure

```
ProDash/
├── public/               # Frontend (served statically, auth-gated)
│   ├── index.html        # Main launch board + timeline
│   ├── project.html      # Standalone project detail page
│   ├── admin.html        # Administration page (admin role only)
│   ├── css/
│   │   └── style.css     # All styles including dark + synthwave themes
│   └── js/
│       ├── main.js       # Launch board, timeline, project panel logic
│       ├── project.js    # Standalone project detail page logic
│       ├── admin.js      # Admin panel logic
│       └── theme.js      # Theme init + toggle (shared across all pages)
├── routes/
│   ├── projects.js       # REST API: /api/projects (PostgreSQL)
│   ├── admin.js          # REST API: /api/admin (PostgreSQL)
│   └── auth.js           # /auth/login, /auth/callback, /auth/logout
├── middleware/
│   ├── requireAuth.js    # Redirects unauthenticated requests
│   └── requireAdmin.js   # Returns 403 for non-admin roles
├── db/
│   ├── index.js          # pg connection pool
│   ├── schema.sql        # CREATE TABLE statements
│   └── migrate.js        # One-time migration: data.json → PostgreSQL
├── data/
│   └── data.json         # Legacy JSON data (used only by migrate.js)
├── server.js             # Express entry point (port 3000)
├── cert/                 # TLS cert + key — never committed
├── .env                  # Secrets — never committed
├── .env.example          # Template with blank values
├── package.json
└── README.md
```

---

## API Reference

All API endpoints require authentication. Write endpoints (`POST`, `PUT`, `DELETE`) additionally require the `admin` role.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/login` | Redirect to Microsoft login |
| GET | `/auth/callback` | OAuth callback — sets session |
| GET | `/auth/logout` | Destroy session + redirect to Microsoft logout |
| GET | `/api/me` | Returns `{ name, email, role }` for the current user |

### Projects

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/projects` | any | List all projects |
| POST | `/api/projects` | admin | Create project |
| GET | `/api/projects/export` | any | Download all projects as CSV |
| POST | `/api/projects/import` | admin | Bulk-import projects from CSV |
| GET | `/api/projects/:id` | any | Get single project |
| PUT | `/api/projects/:id` | admin | Update project fields |
| DELETE | `/api/projects/:id` | admin | Delete project |
| POST | `/api/projects/:id/milestones` | admin | Add milestone |
| PUT | `/api/projects/:id/milestones/:mid` | admin | Update milestone |
| DELETE | `/api/projects/:id/milestones/:mid` | admin | Delete milestone |
| POST | `/api/projects/:id/costItems` | admin | Add cost item |
| PUT | `/api/projects/:id/costItems/:itemId` | admin | Update cost item |
| DELETE | `/api/projects/:id/costItems/:itemId` | admin | Delete cost item |
| POST | `/api/projects/:id/links` | admin | Add link |
| DELETE | `/api/projects/:id/links/:linkId` | admin | Delete link |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/settings` | any | Get all settings |
| PUT | `/api/admin/settings/:key` | admin | Update an options list or display setting |
| POST | `/api/admin/customFields` | admin | Add custom field definition |
| PUT | `/api/admin/customFields/:fieldId` | admin | Update custom field |
| DELETE | `/api/admin/customFields/:fieldId` | admin | Delete custom field |

---

## Database Schema

Data is stored across six PostgreSQL tables:

| Table | Description |
|-------|-------------|
| `projects` | Core project fields |
| `cost_items` | Budget line items (FK → projects) |
| `links` | Related URLs (FK → projects) |
| `milestones` | Sub-tasks with dates/status (FK → projects) |
| `settings` | Key/JSONB pairs for all admin configuration |
| `session` | Express session store (managed by connect-pg-simple) |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server and routing |
| `uuid` | UUID generation |
| `dotenv` | Environment variable loading |
| `pg` | PostgreSQL client |
| `connect-pg-simple` | PostgreSQL-backed session store |
| `express-session` | Session middleware |
| `@azure/msal-node` | Microsoft Entra ID OAuth flow |
| `nodemon` *(dev)* | Auto-restart on file changes |
