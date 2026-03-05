const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '../data/data.json');

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET all settings
router.get('/settings', (req, res) => {
  const data = readData();
  res.json(data.settings);
});

// PUT update a specific settings key (array options lists or scalar values)
router.put('/settings/:key', (req, res) => {
  const data = readData();
  const { key } = req.params;
  const arrayKeys   = ['statusOptions', 'fundingSourceOptions', 'levelOfEffortOptions', 'costCategories', 'divisionOptions'];
  const scalarKeys  = ['sidebarSort', 'boardSortColumn', 'boardSortDir'];
  const allowedKeys = [...arrayKeys, ...scalarKeys];

  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Invalid settings key' });
  }

  if (arrayKeys.includes(key)) {
    if (!Array.isArray(req.body.values)) {
      return res.status(400).json({ error: 'values must be an array' });
    }
    data.settings[key] = req.body.values;
  } else {
    data.settings[key] = req.body.value;
  }

  writeData(data);
  res.json(data.settings);
});

// POST add a custom field definition
router.post('/customFields', (req, res) => {
  const data = readData();
  const field = {
    id: uuidv4(),
    name: req.body.name,
    label: req.body.label || req.body.name,
    type: req.body.type || 'text', // text, select, multiselect, date, number
    options: req.body.options || [],
    showInList: req.body.showInList || false,
    required: req.body.required || false
  };
  data.settings.customFieldDefinitions.push(field);
  writeData(data);
  res.status(201).json(field);
});

// PUT update custom field definition
router.put('/customFields/:fieldId', (req, res) => {
  const data = readData();
  const field = data.settings.customFieldDefinitions.find(f => f.id === req.params.fieldId);
  if (!field) return res.status(404).json({ error: 'Custom field not found' });

  if (req.body.label !== undefined) field.label = req.body.label;
  if (req.body.options !== undefined) field.options = req.body.options;
  if (req.body.showInList !== undefined) field.showInList = req.body.showInList;
  if (req.body.required !== undefined) field.required = req.body.required;

  writeData(data);
  res.json(field);
});

// DELETE custom field definition
router.delete('/customFields/:fieldId', (req, res) => {
  const data = readData();
  const idx = data.settings.customFieldDefinitions.findIndex(f => f.id === req.params.fieldId);
  if (idx === -1) return res.status(404).json({ error: 'Custom field not found' });

  data.settings.customFieldDefinitions.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

module.exports = router;
