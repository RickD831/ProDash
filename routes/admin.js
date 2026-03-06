const express      = require('express');
const router       = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool         = require('../db');
const requireAdmin = require('../middleware/requireAdmin');

const DEFAULTS = {
  statusOptions:          [],
  divisionOptions:        [],
  fundingSourceOptions:   [],
  levelOfEffortOptions:   [],
  costCategories:         [],
  customFieldDefinitions: [],
  sidebarSort:            'name',
  boardSortColumn:        '',
  boardSortDir:           'asc'
};

async function getAllSettings() {
  const result = await pool.query('SELECT key, value FROM settings');
  const settings = { ...DEFAULTS };
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

async function upsertSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

/* ---- GET all settings ---- */
router.get('/settings', async (req, res) => {
  try {
    res.json(await getAllSettings());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- PUT update a settings key ---- */
router.put('/settings/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const arrayKeys  = ['statusOptions', 'fundingSourceOptions', 'levelOfEffortOptions', 'costCategories', 'divisionOptions'];
  const scalarKeys = ['sidebarSort', 'boardSortColumn', 'boardSortDir'];
  const allowedKeys = [...arrayKeys, ...scalarKeys];

  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Invalid settings key' });
  }

  try {
    if (arrayKeys.includes(key)) {
      if (!Array.isArray(req.body.values)) return res.status(400).json({ error: 'values must be an array' });
      await upsertSetting(key, req.body.values);
    } else {
      await upsertSetting(key, req.body.value);
    }
    res.json(await getAllSettings());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- POST add custom field ---- */
router.post('/customFields', requireAdmin, async (req, res) => {
  try {
    const settings = await getAllSettings();
    const defs = settings.customFieldDefinitions || [];
    const field = {
      id:         uuidv4(),
      name:       req.body.name,
      label:      req.body.label || req.body.name,
      type:       req.body.type  || 'text',
      options:    req.body.options    || [],
      showInList: req.body.showInList || false,
      required:   req.body.required   || false
    };
    defs.push(field);
    await upsertSetting('customFieldDefinitions', defs);
    res.status(201).json(field);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- PUT update custom field ---- */
router.put('/customFields/:fieldId', requireAdmin, async (req, res) => {
  try {
    const settings = await getAllSettings();
    const defs = settings.customFieldDefinitions || [];
    const field = defs.find(f => f.id === req.params.fieldId);
    if (!field) return res.status(404).json({ error: 'Custom field not found' });

    if (req.body.label      !== undefined) field.label      = req.body.label;
    if (req.body.options    !== undefined) field.options    = req.body.options;
    if (req.body.showInList !== undefined) field.showInList = req.body.showInList;
    if (req.body.required   !== undefined) field.required   = req.body.required;

    await upsertSetting('customFieldDefinitions', defs);
    res.json(field);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---- DELETE custom field ---- */
router.delete('/customFields/:fieldId', requireAdmin, async (req, res) => {
  try {
    const settings = await getAllSettings();
    const defs = settings.customFieldDefinitions || [];
    const idx = defs.findIndex(f => f.id === req.params.fieldId);
    if (idx === -1) return res.status(404).json({ error: 'Custom field not found' });

    defs.splice(idx, 1);
    await upsertSetting('customFieldDefinitions', defs);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
