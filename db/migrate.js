/**
 * One-time migration: data/data.json → PostgreSQL
 * Run: node db/migrate.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('./index');

const DATA_FILE = path.join(__dirname, '../data/data.json');

async function migrate() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const { projects = [], settings = {} } = raw;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ---- Projects ----
    for (const p of projects) {
      await client.query(
        `INSERT INTO projects
           (id, name, status, division, funding_sources, project_manager, team,
            start_date, end_date, level_of_effort, notes, hide_from_timeline,
            custom_fields, budget_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
          p.name,
          p.status || 'Planning',
          p.division || '',
          p.fundingSources || [],
          p.projectManager || '',
          p.team || [],
          p.startDate || null,
          p.endDate   || null,
          p.levelOfEffort || '',
          p.notes || '',
          p.hideFromTimeline || false,
          JSON.stringify(p.customFields || {}),
          (p.budget && p.budget.total) ? p.budget.total : 0
        ]
      );

      // Cost items
      for (const ci of (p.budget && p.budget.costItems) ? p.budget.costItems : []) {
        await client.query(
          `INSERT INTO cost_items (id, project_id, date, description, category, amount)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
          [ci.id, p.id, ci.date || null, ci.description || '', ci.category || '', ci.amount || 0]
        );
      }

      // Links
      for (const l of p.links || []) {
        await client.query(
          `INSERT INTO links (id, project_id, title, url)
           VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
          [l.id, p.id, l.title || '', l.url || '']
        );
      }

      // Milestones
      for (const m of p.milestones || []) {
        await client.query(
          `INSERT INTO milestones (id, project_id, name, start_date, end_date, status)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
          [m.id, p.id, m.name || '', m.startDate || null, m.endDate || null, m.status || '']
        );
      }
    }

    // ---- Settings ----
    const settingsToInsert = {
      statusOptions:          settings.statusOptions          || [],
      divisionOptions:        settings.divisionOptions        || [],
      fundingSourceOptions:   settings.fundingSourceOptions   || [],
      levelOfEffortOptions:   settings.levelOfEffortOptions   || [],
      costCategories:         settings.costCategories         || [],
      customFieldDefinitions: settings.customFieldDefinitions || [],
      sidebarSort:            settings.sidebarSort            || 'name',
      boardSortColumn:        settings.boardSortColumn        || '',
      boardSortDir:           settings.boardSortDir           || 'asc'
    };

    for (const [key, value] of Object.entries(settingsToInsert)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value)]
      );
    }

    await client.query('COMMIT');
    console.log(`Migrated ${projects.length} projects and settings successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
