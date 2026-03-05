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

// GET all projects
router.get('/', (req, res) => {
  const data = readData();
  res.json(data.projects);
});

// GET export CSV — must be before GET /:id
router.get('/export', (req, res) => {
  const data = readData();
  const headers = 'name,status,division,fundingSources,projectManager,team,startDate,endDate,levelOfEffort,budgetTotal,notes,links,milestones,costItems,customFields';
  const rows = data.projects.map(p => [
    p.name,
    p.status,
    p.division || '',
    (p.fundingSources || []).join(';'),
    p.projectManager,
    (p.team || []).join(';'),
    p.startDate,
    p.endDate || '',
    p.levelOfEffort,
    p.budget?.total || 0,
    p.notes || '',
    JSON.stringify((p.links || []).map(l => ({ title: l.title, url: l.url }))),
    JSON.stringify((p.milestones || []).map(m => ({ name: m.name, startDate: m.startDate, endDate: m.endDate, status: m.status }))),
    JSON.stringify((p.budget?.costItems || []).map(ci => ({ date: ci.date, description: ci.description, category: ci.category, amount: ci.amount }))),
    JSON.stringify(p.customFields || {})
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="projects.csv"');
  res.send([headers, ...rows].join('\r\n'));
});

// POST import CSV — must be before /:id routes
router.post('/import', (req, res) => {
  const safeParse = (val, fallback) => {
    if (!val || val === '') return fallback;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch (e) { return fallback; }
  };

  const data = readData();
  const incoming = Array.isArray(req.body.projects) ? req.body.projects : [];
  let created = 0;
  incoming.forEach(p => {
    if (!p.name) return;
    const links = safeParse(p.links, []).map(l => ({ id: uuidv4(), title: l.title || '', url: l.url || '' }));
    const milestones = safeParse(p.milestones, []).map(m => ({ id: uuidv4(), name: m.name || '', startDate: m.startDate || '', endDate: m.endDate || '', status: m.status || '' }));
    const costItems = safeParse(p.costItems, []).map(ci => ({ id: uuidv4(), date: ci.date || '', description: ci.description || '', category: ci.category || '', amount: parseFloat(ci.amount) || 0 }));
    const customFields = safeParse(p.customFields, {});
    data.projects.push({
      id: uuidv4(),
      name: p.name,
      status: p.status || 'Planning',
      division: p.division || '',
      fundingSources: p.fundingSources || [],
      projectManager: p.projectManager || '',
      team: p.team || [],
      startDate: p.startDate || '',
      endDate: p.endDate || '',
      levelOfEffort: p.levelOfEffort || '',
      budget: { total: parseFloat(p.budgetTotal) || 0, costItems },
      notes: p.notes || '',
      links,
      milestones,
      customFields
    });
    created++;
  });
  writeData(data);
  res.json({ created });
});

// GET single project
router.get('/:id', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// POST create project
router.post('/', (req, res) => {
  const data = readData();
  const project = {
    id: uuidv4(),
    name: req.body.name || 'Untitled Project',
    status: req.body.status || 'Planning',
    division: req.body.division || '',
    fundingSources: req.body.fundingSources || [],
    projectManager: req.body.projectManager || '',
    team: req.body.team || [],
    startDate: req.body.startDate || '',
    endDate: req.body.endDate || '',
    levelOfEffort: req.body.levelOfEffort || '',
    budget: {
      total: 0,
      costItems: []
    },
    notes: '',
    links: [],
    milestones: [],
    customFields: {}
  };
  data.projects.push(project);
  writeData(data);
  res.status(201).json(project);
});

// PUT update project fields
router.put('/:id', (req, res) => {
  const data = readData();
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });

  const allowed = ['name', 'status', 'division', 'fundingSources', 'projectManager', 'team',
    'startDate', 'endDate', 'levelOfEffort', 'notes', 'customFields', 'hideFromTimeline'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) {
      data.projects[idx][field] = req.body[field];
    }
  });

  // Budget total update
  if (req.body.budgetTotal !== undefined) {
    data.projects[idx].budget.total = req.body.budgetTotal;
  }

  writeData(data);
  res.json(data.projects[idx]);
});

// DELETE project
router.delete('/:id', (req, res) => {
  const data = readData();
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  data.projects.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// POST add cost item
router.post('/:id/costItems', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const item = {
    id: uuidv4(),
    date: req.body.date || '',
    description: req.body.description || '',
    category: req.body.category || '',
    amount: parseFloat(req.body.amount) || 0
  };
  project.budget.costItems.push(item);
  writeData(data);
  res.status(201).json(item);
});

// PUT update cost item
router.put('/:id/costItems/:itemId', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const item = project.budget.costItems.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Cost item not found' });

  if (req.body.date !== undefined) item.date = req.body.date;
  if (req.body.description !== undefined) item.description = req.body.description;
  if (req.body.category !== undefined) item.category = req.body.category;
  if (req.body.amount !== undefined) item.amount = parseFloat(req.body.amount) || 0;

  writeData(data);
  res.json(item);
});

// DELETE cost item
router.delete('/:id/costItems/:itemId', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const idx = project.budget.costItems.findIndex(i => i.id === req.params.itemId);
  if (idx === -1) return res.status(404).json({ error: 'Cost item not found' });

  project.budget.costItems.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// POST add link
router.post('/:id/links', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const link = {
    id: uuidv4(),
    title: req.body.title || req.body.url,
    url: req.body.url
  };
  project.links.push(link);
  writeData(data);
  res.status(201).json(link);
});

// DELETE link
router.delete('/:id/links/:linkId', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const idx = project.links.findIndex(l => l.id === req.params.linkId);
  if (idx === -1) return res.status(404).json({ error: 'Link not found' });

  project.links.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// POST add milestone
router.post('/:id/milestones', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.milestones) project.milestones = [];

  const ms = {
    id: uuidv4(),
    name: req.body.name || '',
    startDate: req.body.startDate || '',
    endDate: req.body.endDate || '',
    status: req.body.status || ''
  };
  project.milestones.push(ms);
  writeData(data);
  res.status(201).json(ms);
});

// PUT update milestone
router.put('/:id/milestones/:mid', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const ms = (project.milestones || []).find(m => m.id === req.params.mid);
  if (!ms) return res.status(404).json({ error: 'Milestone not found' });

  if (req.body.name !== undefined) ms.name = req.body.name;
  if (req.body.startDate !== undefined) ms.startDate = req.body.startDate;
  if (req.body.endDate !== undefined) ms.endDate = req.body.endDate;
  if (req.body.status !== undefined) ms.status = req.body.status;

  writeData(data);
  res.json(ms);
});

// DELETE milestone
router.delete('/:id/milestones/:mid', (req, res) => {
  const data = readData();
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const idx = (project.milestones || []).findIndex(m => m.id === req.params.mid);
  if (idx === -1) return res.status(404).json({ error: 'Milestone not found' });

  project.milestones.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

module.exports = router;
