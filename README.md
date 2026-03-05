# ProDash – Project Launch Board

A lightweight, local-first project management dashboard built with Node.js, Express, and plain HTML/CSS/JS. No database, no framework — all data lives in a single JSON file.

## Features

### Views
- **Launch Board** — Sortable, filterable table of all projects with key fields at a glance; column-level text filters + header sort
- **Timeline (Gantt)** — 96-month bar chart (Jan 2025 – Dec 2032) with calendar year, fiscal year (Jul–Jun), quarter, and month header rows; collapsible filter/sort bar for status, team, and custom fields; click a project name to navigate to its detail
- **Status** — At-a-glance dashboard with summary stat cards and three charts: projects by status (doughnut), by division (horizontal bar), and by project manager (horizontal bar); accessible from the sidebar or as a standalone page at `/status.html`
- **Project Detail** — Full-page panel view per project; also opens as a standalone page via the ↗ button

### Project Management
- **Milestones** — Add sub-tasks with start/end dates and status; editable inline (type in the blank row at the bottom of the table in edit mode); appear on the project detail page and as expandable rows in the Timeline
- **Budget Tracking** — Set a total budget, add categorized cost items, and see auto-calculated totals, remaining balance, and % used
- **Notes** — Freeform text notes per project
- **Links** — Store and display related URLs per project
- **Custom Fields** — Define additional fields globally (text, select, date, number); optionally surface them as columns on the launch board and as filters on the timeline

### Editing
- **Edit Mode** — Gear icon on project pages toggles editing without cluttering the default read-only view; automatically disengages when navigating away
- **Timeline Drag Editing** — Gear icon on the Timeline unlocks drag editing: drag a bar to move it (shifts both dates), drag the left or right edge to resize (changes one date). Snaps to the nearest week. Works for both project bars and milestone sub-rows. Edit mode automatically disengages when navigating away.
- **Hide from Timeline** — Checkbox in Project Details to exclude a project from the Timeline view entirely

### Data
- **CSV Export** — Download all projects as a CSV including notes, links, milestones, budget cost items, and custom fields (nested data encoded as JSON columns)
- **CSV Import** — Upload a CSV to append projects in bulk; accepts ISO dates (YYYY-MM-DD) or US format (MM/DD/YYYY); supports all exported columns including nested data

### Themes
- **Light / Dark / Synthwave** — Three themes toggled via the nav bar button on every page; persists across page loads via `localStorage`

### Admin
- **Option Lists** — Manage the status, funding source, level of effort, and cost category dropdown values
- **Display Settings** — Set the default sidebar project sort order (name, start date, status, or level of effort) and the default board sort column and direction
- **Custom Field Definitions** — Create, reorder, and delete custom fields; control which appear as launch board columns and timeline filters

---

## Getting Started

### Prerequisites
- Node.js v18 or higher

### Install & Run

```bash
cd ProDash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

For auto-reload during development:
```bash
npm run dev
```

---

## Project Structure

```
ProDash/
├── public/               # Frontend (served statically)
│   ├── index.html        # Main launch board + timeline
│   ├── project.html      # Standalone project detail page
│   ├── admin.html        # Administration page
│   ├── css/
│   │   └── style.css     # All styles including themes
│   └── js/
│       ├── main.js       # Launch board, timeline, project panel logic
│       ├── project.js    # Standalone project detail page logic
│       ├── admin.js      # Admin panel logic
│       └── theme.js      # Theme init + toggle (shared across all pages)
├── routes/
│   ├── projects.js       # REST API: /api/projects
│   └── admin.js          # REST API: /api/admin
├── data/
│   └── data.json         # All data (projects + settings)
├── server.js             # Express entry point (port 3000)
├── package.json
└── README.md
```

---

## API Reference

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/export` | Download all projects as CSV |
| POST | `/api/projects/import` | Bulk-import projects from CSV (append only) |
| GET | `/api/projects/:id` | Get single project |
| PUT | `/api/projects/:id` | Update project fields |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/:id/milestones` | Add milestone |
| PUT | `/api/projects/:id/milestones/:mid` | Update milestone |
| DELETE | `/api/projects/:id/milestones/:mid` | Delete milestone |
| POST | `/api/projects/:id/costItems` | Add cost item |
| DELETE | `/api/projects/:id/costItems/:itemId` | Delete cost item |
| POST | `/api/projects/:id/links` | Add link |
| DELETE | `/api/projects/:id/links/:linkId` | Delete link |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/settings` | Get all settings |
| PUT | `/api/admin/settings/:key` | Update an options list or scalar display setting |
| POST | `/api/admin/customFields` | Add custom field definition |
| PUT | `/api/admin/customFields/:fieldId` | Update custom field |
| DELETE | `/api/admin/customFields/:fieldId` | Delete custom field |

---

## Data Schema

All data lives in `data/data.json`:

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Project Name",
      "status": "Active",
      "fundingSources": ["Grant"],
      "projectManager": "Alice",
      "team": ["Alice", "Bob"],
      "startDate": "2025-01-01",
      "endDate": "2025-12-31",
      "levelOfEffort": "High",
      "budget": {
        "total": 50000,
        "costItems": [
          {
            "id": "uuid",
            "date": "2025-01-15",
            "description": "Kick-off meeting",
            "category": "Labor",
            "amount": 1200
          }
        ]
      },
      "notes": "Freeform notes here.",
      "links": [
        { "id": "uuid", "title": "Project Docs", "url": "https://..." }
      ],
      "milestones": [
        {
          "id": "uuid",
          "name": "Phase 1 Complete",
          "startDate": "2025-03-01",
          "endDate": "2025-06-30",
          "status": "Active"
        }
      ],
      "customFields": {
        "region": "Northeast"
      },
      "hideFromTimeline": false
    }
  ],
  "settings": {
    "statusOptions": ["Planning", "Active", "On Hold", "Completed", "Cancelled"],
    "fundingSourceOptions": ["General Budget", "Grant", "External Funding", "Partnership"],
    "levelOfEffortOptions": ["Low", "Medium", "High", "Critical"],
    "costCategories": ["Labor", "Materials", "Software", "Travel", "Overhead", "Other"],
    "customFieldDefinitions": [
      {
        "id": "uuid",
        "name": "region",
        "label": "Region",
        "type": "select",
        "options": ["Northeast", "Southeast", "Midwest", "West"],
        "showInList": true
      }
    ],
    "sidebarSort": "name",
    "boardSortColumn": "",
    "boardSortDir": "asc"
  }
}
```

The schema is intentionally flat and migration-friendly for moving to a real database later.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server and routing |
| `uuid` | UUID generation for all entity IDs |
| `nodemon` *(dev)* | Auto-restart on file changes |

Run `npm audit` to verify there are no known vulnerabilities.
