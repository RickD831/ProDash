const express      = require('express');
const router       = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool         = require('../db');
const requireAdmin = require('../middleware/requireAdmin');

/* ---- Helpers ---- */

function fmtDate(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function assembleProject(row, costItems = [], links = [], milestones = []) {
  return {
    id:              row.id,
    name:            row.name,
    status:          row.status          || 'Planning',
    division:        row.division        || '',
    fundingSources:  row.funding_sources || [],
    projectManager:  row.project_manager || '',
    team:            row.team            || [],
    startDate:       fmtDate(row.start_date),
    endDate:         fmtDate(row.end_date),
    levelOfEffort:   row.level_of_effort || '',
    notes:           row.notes           || '',
    hideFromTimeline: row.hide_from_timeline || false,
    customFields:    row.custom_fields   || {},
    budget: {
      total:     parseFloat(row.budget_total) || 0,
      costItems: costItems.map(ci => ({
        id:          ci.id,
        date:        fmtDate(ci.date),
        description: ci.description || '',
        category:    ci.category    || '',
        amount:      parseFloat(ci.amount) || 0
      }))
    },
    links: links.map(l => ({
      id:    l.id,
      title: l.title || '',
      url:   l.url   || ''
    })),
    milestones: milestones.map(m => ({
      id:        m.id,
      name:      m.name      || '',
      startDate: fmtDate(m.start_date),
      endDate:   fmtDate(m.end_date),
      status:    m.status    || ''
    }))
  };
}

async function getProject(id) {
  const [pRows, ciRows, lRows, mRows] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE id=$1', [id]),
    pool.query('SELECT * FROM cost_items WHERE project_id=$1 ORDER BY date', [id]),
    pool.query('SELECT * FROM links WHERE project_id=$1', [id]),
    pool.query('SELECT * FROM milestones WHERE project_id=$1 ORDER BY start_date', [id])
  ]);
  if (!pRows.rows.length) return null;
  return assembleProject(pRows.rows[0], ciRows.rows, lRows.rows, mRows.rows);
}

/* ---- GET all projects (with aggregated sub-rows) ---- */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', ci.id,
          'date', to_char(ci.date, 'YYYY-MM-DD'),
          'description', ci.description,
          'category', ci.category,
          'amount', ci.amount
        )) FILTER (WHERE ci.id IS NOT NULL), '[]') AS cost_items_json,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', l.id, 'title', l.title, 'url', l.url
        )) FILTER (WHERE l.id IS NOT NULL), '[]') AS links_json,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', m.id,
          'name', m.name,
          'startDate', to_char(m.start_date, 'YYYY-MM-DD'),
          'endDate', to_char(m.end_date, 'YYYY-MM-DD'),
          'status', m.status
        )) FILTER (WHERE m.id IS NOT NULL), '[]') AS milestones_json
      FROM projects p
      LEFT JOIN cost_items ci ON ci.project_id = p.id
      LEFT JOIN links l ON l.project_id = p.id
      LEFT JOIN milestones m ON m.project_id = p.id
      GROUP BY p.id
      ORDER BY p.name
    `);

    const projects = result.rows.map(row => ({
      id:              row.id,
      name:            row.name,
      status:          row.status          || 'Planning',
      division:        row.division        || '',
      fundingSources:  row.funding_sources || [],
      projectManager:  row.project_manager || '',
      team:            row.team            || [],
      startDate:       fmtDate(row.start_date),
      endDate:         fmtDate(row.end_date),
      levelOfEffort:   row.level_of_effort || '',
      notes:           row.notes           || '',
      hideFromTimeline: row.hide_from_timeline || false,
      customFields:    row.custom_fields   || {},
      budget: {
        total:     parseFloat(row.budget_total) || 0,
        costItems: row.cost_items_json || []
      },
      links:      row.links_json      || [],
      milestones: row.milestones_json || []
    }));

    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- GET export CSV ---- */
router.get('/export', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', ci.id, 'date', to_char(ci.date, 'YYYY-MM-DD'),
          'description', ci.description, 'category', ci.category, 'amount', ci.amount
        )) FILTER (WHERE ci.id IS NOT NULL), '[]') AS cost_items_json,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', l.id, 'title', l.title, 'url', l.url
        )) FILTER (WHERE l.id IS NOT NULL), '[]') AS links_json,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', m.id, 'name', m.name,
          'startDate', to_char(m.start_date, 'YYYY-MM-DD'),
          'endDate', to_char(m.end_date, 'YYYY-MM-DD'), 'status', m.status
        )) FILTER (WHERE m.id IS NOT NULL), '[]') AS milestones_json
      FROM projects p
      LEFT JOIN cost_items ci ON ci.project_id = p.id
      LEFT JOIN links l ON l.project_id = p.id
      LEFT JOIN milestones m ON m.project_id = p.id
      GROUP BY p.id ORDER BY p.name
    `);

    const headers = 'name,status,division,fundingSources,projectManager,team,startDate,endDate,levelOfEffort,budgetTotal,notes,links,milestones,costItems,customFields';
    const rows = result.rows.map(p => [
      p.name,
      p.status,
      p.division || '',
      (p.funding_sources || []).join(';'),
      p.project_manager || '',
      (p.team || []).join(';'),
      fmtDate(p.start_date),
      fmtDate(p.end_date),
      p.level_of_effort || '',
      parseFloat(p.budget_total) || 0,
      p.notes || '',
      JSON.stringify(p.links_json || []),
      JSON.stringify(p.milestones_json || []),
      JSON.stringify(p.cost_items_json || []),
      JSON.stringify(p.custom_fields || {})
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="projects.csv"');
    res.send([headers, ...rows].join('\r\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- POST import CSV ---- */
router.post('/import', requireAdmin, async (req, res) => {
  const safeParse = (val, fallback) => {
    if (!val || val === '') return fallback;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch { return fallback; }
  };

  const incoming = Array.isArray(req.body.projects) ? req.body.projects : [];
  let created = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const p of incoming) {
      if (!p.name) continue;
      const pid = uuidv4();
      const links     = safeParse(p.links, []);
      const milestones = safeParse(p.milestones, []);
      const costItems  = safeParse(p.costItems, []);
      const customFields = safeParse(p.customFields, {});

      await client.query(
        `INSERT INTO projects
           (id, name, status, division, funding_sources, project_manager, team,
            start_date, end_date, level_of_effort, notes, custom_fields, budget_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          pid,
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
          JSON.stringify(customFields),
          parseFloat(p.budgetTotal) || 0
        ]
      );

      for (const l of links) {
        await client.query(
          'INSERT INTO links (id, project_id, title, url) VALUES ($1,$2,$3,$4)',
          [uuidv4(), pid, l.title || '', l.url || '']
        );
      }
      for (const m of milestones) {
        await client.query(
          'INSERT INTO milestones (id, project_id, name, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,$6)',
          [uuidv4(), pid, m.name || '', m.startDate || null, m.endDate || null, m.status || '']
        );
      }
      for (const ci of costItems) {
        await client.query(
          'INSERT INTO cost_items (id, project_id, date, description, category, amount) VALUES ($1,$2,$3,$4,$5,$6)',
          [uuidv4(), pid, ci.date || null, ci.description || '', ci.category || '', parseFloat(ci.amount) || 0]
        );
      }
      created++;
    }

    await client.query('COMMIT');
    res.json({ created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

/* ---- GET single project ---- */
router.get('/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- POST create project ---- */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO projects
         (id, name, status, division, funding_sources, project_manager, team,
          start_date, end_date, level_of_effort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        req.body.name || 'Untitled Project',
        req.body.status || 'Planning',
        req.body.division || '',
        req.body.fundingSources || [],
        req.body.projectManager || '',
        req.body.team || [],
        req.body.startDate || null,
        req.body.endDate   || null,
        req.body.levelOfEffort || ''
      ]
    );
    const project = await getProject(id);
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- PUT update project fields ---- */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const setClauses = [];
    const vals = [];
    let idx = 1;

    const map = {
      name:            'name',
      status:          'status',
      division:        'division',
      fundingSources:  'funding_sources',
      projectManager:  'project_manager',
      team:            'team',
      startDate:       'start_date',
      endDate:         'end_date',
      levelOfEffort:   'level_of_effort',
      notes:           'notes',
      customFields:    'custom_fields',
      hideFromTimeline:'hide_from_timeline',
      budgetTotal:     'budget_total'
    };

    for (const [jsKey, dbCol] of Object.entries(map)) {
      if (req.body[jsKey] !== undefined) {
        const v = jsKey === 'customFields' ? JSON.stringify(req.body[jsKey]) : req.body[jsKey];
        setClauses.push(`${dbCol} = $${idx++}`);
        vals.push(v === '' && (jsKey === 'startDate' || jsKey === 'endDate') ? null : v);
      }
    }

    if (!setClauses.length) {
      const project = await getProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      return res.json(project);
    }

    setClauses.push(`updated_at = NOW()`);
    vals.push(req.params.id);

    await pool.query(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      vals
    );

    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- DELETE project ---- */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- Cost Items ---- */
router.post('/:id/costItems', requireAdmin, async (req, res) => {
  try {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO cost_items (id, project_id, date, description, category, amount) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, req.params.id, req.body.date || null, req.body.description || '', req.body.category || '', parseFloat(req.body.amount) || 0]
    );
    const row = (await pool.query('SELECT * FROM cost_items WHERE id=$1', [id])).rows[0];
    res.status(201).json({ id: row.id, date: fmtDate(row.date), description: row.description, category: row.category, amount: parseFloat(row.amount) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/:id/costItems/:itemId', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE cost_items SET
         date=$1, description=$2, category=$3, amount=$4
       WHERE id=$5 AND project_id=$6`,
      [req.body.date || null, req.body.description || '', req.body.category || '', parseFloat(req.body.amount) || 0, req.params.itemId, req.params.id]
    );
    const row = (await pool.query('SELECT * FROM cost_items WHERE id=$1', [req.params.itemId])).rows[0];
    if (!row) return res.status(404).json({ error: 'Cost item not found' });
    res.json({ id: row.id, date: fmtDate(row.date), description: row.description, category: row.category, amount: parseFloat(row.amount) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/:id/costItems/:itemId', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM cost_items WHERE id=$1 AND project_id=$2', [req.params.itemId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- Links ---- */
router.post('/:id/links', requireAdmin, async (req, res) => {
  try {
    const id = uuidv4();
    const title = req.body.title || req.body.url;
    await pool.query(
      'INSERT INTO links (id, project_id, title, url) VALUES ($1,$2,$3,$4)',
      [id, req.params.id, title, req.body.url]
    );
    res.status(201).json({ id, title, url: req.body.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/:id/links/:linkId', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM links WHERE id=$1 AND project_id=$2', [req.params.linkId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- Milestones ---- */
router.post('/:id/milestones', requireAdmin, async (req, res) => {
  try {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO milestones (id, project_id, name, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, req.params.id, req.body.name || '', req.body.startDate || null, req.body.endDate || null, req.body.status || '']
    );
    const row = (await pool.query('SELECT * FROM milestones WHERE id=$1', [id])).rows[0];
    res.status(201).json({ id: row.id, name: row.name, startDate: fmtDate(row.start_date), endDate: fmtDate(row.end_date), status: row.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/:id/milestones/:mid', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE milestones SET name=$1, start_date=$2, end_date=$3, status=$4
       WHERE id=$5 AND project_id=$6`,
      [req.body.name || '', req.body.startDate || null, req.body.endDate || null, req.body.status || '', req.params.mid, req.params.id]
    );
    const row = (await pool.query('SELECT * FROM milestones WHERE id=$1', [req.params.mid])).rows[0];
    if (!row) return res.status(404).json({ error: 'Milestone not found' });
    res.json({ id: row.id, name: row.name, startDate: fmtDate(row.start_date), endDate: fmtDate(row.end_date), status: row.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/:id/milestones/:mid', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM milestones WHERE id=$1 AND project_id=$2', [req.params.mid, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
