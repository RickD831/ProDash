/* =============================
   ProDash – Admin Page
   ============================= */

let settings = {};

const SETTINGS_CONFIG = [
  { key: 'statusOptions',        label: 'Status Options',          icon: '🏷️' },
  { key: 'divisionOptions',      label: 'Division Options',        icon: '🏢' },
  { key: 'fundingSourceOptions', label: 'Funding Source Options',  icon: '💰' },
  { key: 'levelOfEffortOptions', label: 'Level of Effort Options', icon: '📊' },
  { key: 'costCategories',       label: 'Cost Categories',         icon: '🗂️' }
];

async function init() {
  settings = await fetch('/api/admin/settings').then(r => r.json());
  renderOptionCards();
  renderDisplaySettings();
  renderCustomFields();
  setupCustomFieldForm();
}

/* ---- Option list cards ---- */
function renderOptionCards() {
  const grid = document.getElementById('admin-grid');
  grid.innerHTML = SETTINGS_CONFIG.map(cfg => `
    <div class="card" id="card-${cfg.key}">
      <div class="section-header">
        <h2>${cfg.label}</h2>
      </div>
      <div class="section-body" style="padding:14px 16px;">
        <ul class="option-list" id="list-${cfg.key}">
          ${renderOptionItems(cfg.key)}
        </ul>
        <div class="add-option-row">
          <input type="text" id="input-${cfg.key}" placeholder="New option..." />
          <button class="btn btn-primary btn-sm" onclick="addOption('${cfg.key}')">Add</button>
        </div>
      </div>
    </div>
  `).join('');

  // Attach enter key listeners for each input
  SETTINGS_CONFIG.forEach(cfg => {
    const input = document.getElementById(`input-${cfg.key}`);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') addOption(cfg.key);
    });
  });
}

function renderOptionItems(key) {
  return (settings[key] || []).map((val, idx) => `
    <li class="option-item" data-key="${key}" data-idx="${idx}">
      <span>${escHtml(val)}</span>
      <button class="btn btn-ghost btn-sm" onclick="removeOption('${key}', ${idx})" title="Remove">&#10005;</button>
    </li>
  `).join('') || '<li class="text-muted" style="font-style:italic;padding:6px 0;">No options defined.</li>';
}

async function addOption(key) {
  const input = document.getElementById(`input-${key}`);
  const val = input.value.trim();
  if (!val) return;
  if (settings[key].includes(val)) {
    showToast('That option already exists');
    return;
  }

  settings[key].push(val);
  await saveOptionList(key);
  input.value = '';
  document.getElementById(`list-${key}`).innerHTML = renderOptionItems(key);
  showToast('Option added');
}

async function removeOption(key, idx) {
  settings[key].splice(idx, 1);
  await saveOptionList(key);
  document.getElementById(`list-${key}`).innerHTML = renderOptionItems(key);
  showToast('Option removed');
}

async function saveOptionList(key) {
  settings = await fetch(`/api/admin/settings/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: settings[key] })
  }).then(r => r.json());
}

/* ---- Display Settings ---- */
function renderDisplaySettings() {
  const container = document.getElementById('display-settings');

  const sidebarSortOpts = [
    { value: 'name',          label: 'Name (A–Z)' },
    { value: 'startDate',     label: 'Start Date' },
    { value: 'status',        label: 'Status' },
    { value: 'levelOfEffort', label: 'Level of Effort' }
  ];
  const boardColOpts = [
    { value: '',              label: '— None (default order) —' },
    { value: 'name',          label: 'Project Name' },
    { value: 'status',        label: 'Status' },
    { value: 'fundingSources',label: 'Funding Source(s)' },
    { value: 'projectManager',label: 'Project Manager' },
    { value: 'team',          label: 'Team' },
    { value: 'startDate',     label: 'Start Date' },
    { value: 'levelOfEffort', label: 'Level of Effort' }
  ];
  const curSidebar   = settings.sidebarSort     || 'name';
  const curBoardCol  = settings.boardSortColumn || '';
  const curBoardDir  = settings.boardSortDir    || 'asc';

  container.innerHTML = `
    <div class="form-row" style="max-width:720px;">
      <div class="form-group mb-0">
        <label for="sidebar-sort-sel">Default Sidebar Project Order</label>
        <select id="sidebar-sort-sel">
          ${sidebarSortOpts.map(o => `<option value="${o.value}" ${curSidebar === o.value ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}
        </select>
        <p style="font-size:12px;color:var(--gray-600);margin-top:4px;">Order of projects in the left sidebar.</p>
      </div>
      <div class="form-group mb-0">
        <label for="board-sort-col-sel">Default Board Sort Column</label>
        <select id="board-sort-col-sel">
          ${boardColOpts.map(o => `<option value="${o.value}" ${curBoardCol === o.value ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}
        </select>
        <p style="font-size:12px;color:var(--gray-600);margin-top:4px;">Column pre-sorted when the board loads.</p>
      </div>
      <div class="form-group mb-0">
        <label for="board-sort-dir-sel">Default Board Sort Direction</label>
        <select id="board-sort-dir-sel">
          <option value="asc"  ${curBoardDir === 'asc'  ? 'selected' : ''}>Ascending ↑</option>
          <option value="desc" ${curBoardDir === 'desc' ? 'selected' : ''}>Descending ↓</option>
        </select>
        <p style="font-size:12px;color:var(--gray-600);margin-top:4px;">Applied when a sort column is set.</p>
      </div>
    </div>
  `;

  const save = async (key, value) => {
    settings[key] = value;
    await fetch(`/api/admin/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    showToast('Display setting saved');
  };

  document.getElementById('sidebar-sort-sel').addEventListener('change',    e => save('sidebarSort',     e.target.value));
  document.getElementById('board-sort-col-sel').addEventListener('change',  e => save('boardSortColumn', e.target.value));
  document.getElementById('board-sort-dir-sel').addEventListener('change',  e => save('boardSortDir',    e.target.value));
}

/* ---- Custom Fields ---- */
function renderCustomFields() {
  const container = document.getElementById('custom-fields-list');
  const defs = settings.customFieldDefinitions || [];

  if (!defs.length) {
    container.innerHTML = `<p class="text-muted" style="font-style:italic;margin-bottom:0;">No custom fields defined yet.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Key</th>
            <th>Type</th>
            <th>Options</th>
            <th>Show in List</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${defs.map(f => `
            <tr data-field-id="${f.id}">
              <td style="font-weight:600;">${escHtml(f.label)}</td>
              <td><code style="font-size:12px;background:var(--gray-100);padding:1px 6px;border-radius:3px;">${escHtml(f.name)}</code></td>
              <td><span class="type-badge">${escHtml(f.type)}</span></td>
              <td style="color:var(--gray-600);">${f.options && f.options.length ? escHtml(f.options.join(', ')) : '<span class="text-muted">—</span>'}</td>
              <td>${f.showInList ? '✓' : '—'}</td>
              <td>
                <button class="btn btn-danger btn-sm" onclick="deleteCustomField('${f.id}')">Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function deleteCustomField(fieldId) {
  if (!confirm('Remove this custom field? Existing project data for this field will remain in the JSON but won\'t be shown.')) return;
  await fetch(`/api/admin/customFields/${fieldId}`, { method: 'DELETE' });
  settings.customFieldDefinitions = settings.customFieldDefinitions.filter(f => f.id !== fieldId);
  renderCustomFields();
  showToast('Custom field removed');
}

/* ---- New custom field form ---- */
function setupCustomFieldForm() {
  const typeSelect = document.getElementById('cf-type');
  const optionsGroup = document.getElementById('cf-options-group');

  typeSelect.addEventListener('change', () => {
    optionsGroup.style.display = typeSelect.value === 'select' ? 'flex' : 'none';
  });

  // Auto-generate key from label
  document.getElementById('cf-label').addEventListener('input', e => {
    const nameInput = document.getElementById('cf-name');
    nameInput.value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  });

  document.getElementById('btn-add-custom-field').addEventListener('click', addCustomField);
}

async function addCustomField() {
  const label = document.getElementById('cf-label').value.trim();
  const name  = document.getElementById('cf-name').value.trim();
  const type  = document.getElementById('cf-type').value;
  const showInList = document.getElementById('cf-show-in-list').checked;

  if (!label || !name) {
    showToast('Label and key are required');
    return;
  }

  if (!/^[a-z0-9_]+$/.test(name)) {
    showToast('Key must be lowercase letters, numbers, and underscores only');
    return;
  }

  const options = type === 'select'
    ? document.getElementById('cf-options').value.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const field = await fetch('/api/admin/customFields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, name, type, options, showInList })
  }).then(r => r.json());

  settings.customFieldDefinitions = settings.customFieldDefinitions || [];
  settings.customFieldDefinitions.push(field);

  // Reset form
  document.getElementById('cf-label').value = '';
  document.getElementById('cf-name').value = '';
  document.getElementById('cf-type').value = 'text';
  document.getElementById('cf-options').value = '';
  document.getElementById('cf-options-group').style.display = 'none';
  document.getElementById('cf-show-in-list').checked = false;

  renderCustomFields();
  showToast('Custom field added');
}

/* ---- Helpers ---- */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

init();
