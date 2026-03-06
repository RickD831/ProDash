/* ================================
   ProDash – Project Detail Page
   ================================ */

const params = new URLSearchParams(window.location.search);
const PROJECT_ID = params.get('id');

let project = null;
let settings = null;
let editMode = false;
let editingMilestoneId = null;
let currentUser = null;

if (!PROJECT_ID) {
  window.location.href = '/';
}

async function init() {
  const me = await fetch('/api/me').then(r => r.ok ? r.json() : null);
  if (!me) { window.location = '/auth/login'; return; }
  currentUser = me;
  const navUser = document.getElementById('nav-user');
  if (navUser) navUser.textContent = me.name;

  [project, settings] = await Promise.all([
    fetch(`/api/projects/${PROJECT_ID}`).then(r => {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    }),
    fetch('/api/admin/settings').then(r => r.json())
  ]).catch(() => {
    window.location.href = '/';
  });

  document.title = `ProDash – ${project.name}`;

  // Hide edit controls for readers
  if (me.role !== 'admin') {
    const editBtn = document.getElementById('btn-edit-toggle');
    if (editBtn) editBtn.style.display = 'none';
  }

  renderAll();
}

/* =====================
   Render
   ===================== */
function renderAll() {
  editingMilestoneId = null;
  const container = document.getElementById('project-container');
  container.innerHTML = buildHTML();
  attachAllListeners();
  recalcBudget();
}

function buildHTML() {
  return `
    <!-- PROJECT TITLE -->
    <div class="page-header" style="margin-bottom:20px;">
      <div class="view-only">
        <h1 style="font-size:24px;font-weight:800;">${escHtml(project.name)}</h1>
      </div>
      <div class="edit-only" style="flex:1;max-width:480px;">
        <input type="text" id="edit-name" value="${escAttr(project.name)}" style="font-size:18px;font-weight:700;" />
      </div>
    </div>

    <!-- TOP 2-COLUMN GRID: Details | Notes + Links -->
    <div class="project-top-grid">

      <!-- KEY FIELDS -->
      <div class="section">
        <div class="section-header">
          <h2>Project Details</h2>
          <div class="edit-only" style="display:none;">
            <button class="btn btn-primary btn-sm" id="btn-save-fields">Save</button>
            <button class="btn btn-secondary btn-sm" id="btn-cancel-fields">Cancel</button>
          </div>
        </div>
        <div class="section-body">
          <div class="fields-grid view-only" id="fields-view"></div>
          <div class="edit-only" id="fields-edit" style="display:none;">
            <div class="form-row">
              <div class="form-group mb-0">
                <label for="e-status">Status</label>
                <select id="e-status">
                  ${(settings.statusOptions || []).map(o =>
                    `<option value="${escAttr(o)}" ${project.status === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-division">Division</label>
                <select id="e-division">
                  <option value="">— Select —</option>
                  ${(settings.divisionOptions || []).map(o =>
                    `<option value="${escAttr(o)}" ${project.division === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-loe">Level of Effort</label>
                <select id="e-loe">
                  <option value="">— Select —</option>
                  ${(settings.levelOfEffortOptions || []).map(o =>
                    `<option value="${escAttr(o)}" ${project.levelOfEffort === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-funding">Funding Source</label>
                <select id="e-funding">
                  <option value="">— Select —</option>
                  ${(settings.fundingSourceOptions || []).map(o =>
                    `<option value="${escAttr(o)}" ${(project.fundingSources || [])[0] === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-pm">Project Manager</label>
                <input type="text" id="e-pm" value="${escAttr(project.projectManager)}" />
              </div>
              <div class="form-group mb-0">
                <label for="e-start">Start Date</label>
                <input type="date" id="e-start" value="${escAttr(project.startDate)}" />
              </div>
              <div class="form-group mb-0">
                <label for="e-end">End Date</label>
                <input type="date" id="e-end" value="${escAttr(project.endDate || '')}" />
              </div>
              <div class="form-group mb-0">
                <label for="e-team">Team (comma-separated)</label>
                <input type="text" id="e-team" value="${escAttr((project.team || []).join(', '))}" />
              </div>
              ${buildCustomFieldEditors()}
              <div class="form-group mb-0" style="grid-column:1/-1;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:normal;text-transform:none;letter-spacing:0;font-size:13px;">
                  <input type="checkbox" id="e-hide-tl" ${project.hideFromTimeline ? 'checked' : ''} style="width:auto;" />
                  Hide from Timeline
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- NOTES + LINKS stacked in right column -->
      <div class="project-side-stack">

        <!-- NOTES -->
        <div class="section">
          <div class="section-header">
            <h2>Notes</h2>
            <div class="edit-only" style="display:none;">
              <button class="btn btn-primary btn-sm" id="btn-save-notes">Save</button>
            </div>
          </div>
          <div class="section-body">
            <div class="view-only" id="notes-view">${renderNotes(project.notes)}</div>
            <div class="edit-only" style="display:none;">
              <textarea id="e-notes" style="min-height:120px;width:100%;">${escHtml(project.notes)}</textarea>
            </div>
          </div>
        </div>

        <!-- LINKS -->
        <div class="section">
          <div class="section-header">
            <h2>Links</h2>
          </div>
          <div class="section-body">
            <ul class="links-list" id="links-list"></ul>
            <div class="edit-only" id="add-link-form" style="display:none;margin-top:12px;">
              <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;background:var(--gray-50);">
                <div style="font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">Add Link</div>
                <div class="form-group">
                  <label for="link-title">Title</label>
                  <input type="text" id="link-title" placeholder="Link label" />
                </div>
                <div class="form-group">
                  <label for="link-url">URL</label>
                  <input type="url" id="link-url" placeholder="https://..." />
                </div>
                <button class="btn btn-primary btn-sm" id="btn-add-link">+ Add Link</button>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /.project-side-stack -->

    </div><!-- /.project-top-grid -->

    <!-- MILESTONES -->
    <div class="section">
      <div class="section-header">
        <h2>Milestones</h2>
      </div>
      <div class="section-body">
        <div id="milestones-list"></div>
      </div>
    </div>

    <!-- BUDGET -->
    <div class="section">
      <div class="section-header">
        <h2>Budget</h2>
        <div class="edit-only" style="display:none;align-items:center;gap:8px;">
          <label style="font-size:12px;font-weight:600;color:var(--gray-600);white-space:nowrap;">Total Budget ($)</label>
          <input type="number" id="e-budget-total" value="${project.budget.total || 0}"
            style="width:140px;" min="0" step="0.01" />
          <button class="btn btn-primary btn-sm" id="btn-save-budget-total">Update</button>
        </div>
      </div>
      <div class="section-body">
        <div class="budget-summary" id="budget-summary"></div>
        <div class="table-wrapper" style="margin-bottom:16px;">
          <table class="cost-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th class="amount-col">Amount</th>
                <th class="actions-col edit-only" style="display:none;"></th>
              </tr>
            </thead>
            <tbody id="cost-items-tbody"></tbody>
            <tfoot id="cost-tfoot"></tfoot>
          </table>
        </div>
        <div class="edit-only" id="add-cost-form" style="display:none;">
          <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;background:var(--gray-50);">
            <div style="font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">Add Cost Item</div>
            <div class="form-row">
              <div class="form-group mb-0">
                <label for="ci-date">Date</label>
                <input type="date" id="ci-date" />
              </div>
              <div class="form-group mb-0">
                <label for="ci-category">Category</label>
                <select id="ci-category">
                  <option value="">— Select —</option>
                  ${(settings.costCategories || []).map(c =>
                    `<option value="${escAttr(c)}">${escHtml(c)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="ci-amount">Amount ($)</label>
                <input type="number" id="ci-amount" min="0" step="0.01" placeholder="0.00" />
              </div>
            </div>
            <div class="form-group mt-12">
              <label for="ci-desc">Description</label>
              <input type="text" id="ci-desc" placeholder="What was this expense for?" />
            </div>
            <button class="btn btn-primary btn-sm mt-8" id="btn-add-cost-item">+ Add Item</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildCustomFieldEditors() {
  if (!settings.customFieldDefinitions || !settings.customFieldDefinitions.length) return '';
  return settings.customFieldDefinitions.map(f => buildCustomFieldEditor(f)).join('');
}

function buildCustomFieldEditor(f) {
  const val = (project.customFields || {})[f.name] || '';
  if (f.type === 'select') {
    return `
      <div class="form-group mb-0">
        <label for="cf-${escAttr(f.name)}">${escHtml(f.label)}</label>
        <select id="cf-${escAttr(f.name)}" class="custom-field-input" data-field="${escAttr(f.name)}">
          <option value="">— Select —</option>
          ${f.options.map(o => `<option value="${escAttr(o)}" ${val === o ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}
        </select>
      </div>`;
  }
  if (f.type === 'date') {
    return `
      <div class="form-group mb-0">
        <label for="cf-${escAttr(f.name)}">${escHtml(f.label)}</label>
        <input type="date" id="cf-${escAttr(f.name)}" class="custom-field-input" data-field="${escAttr(f.name)}" value="${escAttr(val)}" />
      </div>`;
  }
  if (f.type === 'number') {
    return `
      <div class="form-group mb-0">
        <label for="cf-${escAttr(f.name)}">${escHtml(f.label)}</label>
        <input type="number" id="cf-${escAttr(f.name)}" class="custom-field-input" data-field="${escAttr(f.name)}" value="${escAttr(val)}" />
      </div>`;
  }
  return `
    <div class="form-group mb-0">
      <label for="cf-${escAttr(f.name)}">${escHtml(f.label)}</label>
      <input type="text" id="cf-${escAttr(f.name)}" class="custom-field-input" data-field="${escAttr(f.name)}" value="${escAttr(val)}" />
    </div>`;
}

function renderFieldsView() {
  const el = document.getElementById('fields-view');
  if (!el) return;
  const customFields = settings.customFieldDefinitions || [];
  el.innerHTML = `
    <div class="field-item">
      <label>Status</label>
      <div class="field-value"><span class="badge ${badgeClass(project.status)}">${escHtml(project.status)}</span></div>
    </div>
    <div class="field-item">
      <label>Division</label>
      <div class="field-value ${!project.division ? 'empty' : ''}">${project.division || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Project Manager</label>
      <div class="field-value ${!project.projectManager ? 'empty' : ''}">${project.projectManager || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Start Date</label>
      <div class="field-value ${!project.startDate ? 'empty' : ''}">${project.startDate ? formatDate(project.startDate) : 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>End Date</label>
      <div class="field-value ${!project.endDate ? 'empty' : ''}">${project.endDate ? formatDate(project.endDate) : 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Level of Effort</label>
      <div class="field-value ${!project.levelOfEffort ? 'empty' : ''}">${project.levelOfEffort || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Funding Source</label>
      <div class="field-value ${!(project.fundingSources || []).length ? 'empty' : ''}">${(project.fundingSources || []).join(', ') || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Team</label>
      <div class="field-value ${!(project.team || []).length ? 'empty' : ''}">${(project.team || []).join(', ') || 'Not set'}</div>
    </div>
    ${customFields.map(f => `
      <div class="field-item">
        <label>${escHtml(f.label)}</label>
        <div class="field-value ${!(project.customFields || {})[f.name] ? 'empty' : ''}">${(project.customFields || {})[f.name] || 'Not set'}</div>
      </div>
    `).join('')}
    ${project.hideFromTimeline ? `<div class="field-item"><label>Timeline</label><div class="field-value empty">Hidden from Timeline</div></div>` : ''}
  `;
}

function renderMilestones() {
  const list = document.getElementById('milestones-list');
  if (!list) return;
  const milestones = project.milestones || [];

  if (!milestones.length && !editMode) {
    list.innerHTML = '<p class="text-muted" style="font-style:italic;padding:4px 0;">No milestones yet.</p>';
    return;
  }

  const addRow = editMode ? `
    <tr class="ms-add-row">
      <td><input type="text" id="ms-new-name" placeholder="New milestone…" style="width:100%;min-width:120px;" /></td>
      <td><input type="date" id="ms-new-start" /></td>
      <td><input type="date" id="ms-new-end" /></td>
      <td>
        <select id="ms-new-status">
          <option value="">— Status —</option>
          ${(settings.statusOptions || []).map(o =>
            `<option value="${escAttr(o)}">${escHtml(o)}</option>`
          ).join('')}
        </select>
      </td>
      <td class="actions-col"><button class="btn btn-primary btn-sm" id="btn-add-ms" title="Add milestone">+</button></td>
    </tr>` : '';

  list.innerHTML = `
    <div class="table-wrapper" style="margin-bottom:12px;">
      <table class="milestone-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Start</th>
            <th>End</th>
            <th>Status</th>
            <th class="actions-col edit-only" style="${editMode ? '' : 'display:none;'}"></th>
          </tr>
        </thead>
        <tbody>
          ${milestones.map(m => {
            if (editingMilestoneId === m.id) {
              return `
                <tr data-ms-id="${m.id}">
                  <td><input type="text" class="ms-edit-name" value="${escAttr(m.name)}" style="width:100%;min-width:120px;" /></td>
                  <td><input type="date" class="ms-edit-start" value="${escAttr(m.startDate)}" /></td>
                  <td><input type="date" class="ms-edit-end" value="${escAttr(m.endDate)}" /></td>
                  <td>
                    <select class="ms-edit-status">
                      <option value="">— Select —</option>
                      ${(settings.statusOptions || []).map(o =>
                        `<option value="${escAttr(o)}" ${m.status === o ? 'selected' : ''}>${escHtml(o)}</option>`
                      ).join('')}
                    </select>
                  </td>
                  <td class="actions-col">
                    <button class="btn btn-primary btn-sm btn-save-ms" data-id="${m.id}">&#10003;</button>
                    <button class="btn btn-ghost btn-sm btn-cancel-ms">&#10005;</button>
                  </td>
                </tr>`;
            }
            return `
              <tr data-ms-id="${m.id}">
                <td>${escHtml(m.name)}</td>
                <td>${m.startDate ? formatDate(m.startDate) : '<span class="text-muted">—</span>'}</td>
                <td>${m.endDate ? formatDate(m.endDate) : '<span class="text-muted">—</span>'}</td>
                <td>${m.status ? `<span class="badge ${badgeClass(m.status)}">${escHtml(m.status)}</span>` : '<span class="text-muted">—</span>'}</td>
                <td class="actions-col edit-only" style="${editMode ? '' : 'display:none;'}">
                  <button class="btn btn-ghost btn-sm btn-edit-ms" data-id="${m.id}" title="Edit">&#9998;</button>
                  <button class="btn btn-ghost btn-sm btn-delete-ms" data-id="${m.id}" title="Remove">&#10005;</button>
                </td>
              </tr>`;
          }).join('')}
          ${addRow}
        </tbody>
      </table>
    </div>
  `;

  list.querySelectorAll('.btn-edit-ms').forEach(btn => {
    btn.addEventListener('click', () => { editingMilestoneId = btn.dataset.id; renderMilestones(); });
  });
  list.querySelectorAll('.btn-save-ms').forEach(btn => {
    btn.addEventListener('click', () => saveMilestone(btn.dataset.id));
  });
  list.querySelectorAll('.btn-cancel-ms').forEach(btn => {
    btn.addEventListener('click', () => { editingMilestoneId = null; renderMilestones(); });
  });
  list.querySelectorAll('.btn-delete-ms').forEach(btn => {
    btn.addEventListener('click', () => deleteMilestone(btn.dataset.id));
  });

  const addBtn = list.querySelector('#btn-add-ms');
  if (addBtn) addBtn.addEventListener('click', addMilestone);
  const newNameEl = list.querySelector('#ms-new-name');
  if (newNameEl) newNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') addMilestone(); });
}

function renderCostItems() {
  const tbody = document.getElementById('cost-items-tbody');
  const tfoot = document.getElementById('cost-tfoot');
  if (!tbody) return;

  const items = project.budget.costItems || [];

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-muted" style="text-align:center;padding:16px;">No cost items yet.</td>
      </tr>`;
  } else {
    tbody.innerHTML = items.map(item => `
      <tr data-item-id="${item.id}">
        <td>${item.date ? formatDate(item.date) : '<span class="text-muted">—</span>'}</td>
        <td>${escHtml(item.description)}</td>
        <td>${escHtml(item.category)}</td>
        <td class="amount-col">$${fmt(item.amount)}</td>
        <td class="actions-col edit-only" style="display:none;">
          <button class="btn btn-ghost btn-sm btn-delete-cost" data-id="${item.id}" title="Remove">&#10005;</button>
        </td>
      </tr>
    `).join('');
  }

  document.querySelectorAll('.btn-delete-cost').forEach(btn => {
    btn.addEventListener('click', () => deleteCostItem(btn.dataset.id));
  });

  const total = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  tfoot.innerHTML = items.length ? `
    <tr style="background:var(--gray-50);font-weight:700;">
      <td colspan="3" style="padding:9px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--gray-600);">Total Spent</td>
      <td class="amount-col" style="padding:9px 12px;">$${fmt(total)}</td>
      <td class="edit-only" style="display:none;"></td>
    </tr>
  ` : '';
}

function renderLinks() {
  const list = document.getElementById('links-list');
  if (!list) return;
  const links = project.links || [];

  if (!links.length) {
    list.innerHTML = `<li class="text-muted view-only" style="font-style:italic;">No links yet.</li>`;
    return;
  }

  list.innerHTML = links.map(l => `
    <li class="link-item" data-link-id="${l.id}">
      <a href="${escAttr(l.url)}" target="_blank" rel="noopener">${escHtml(l.title || l.url)}</a>
      <button class="btn btn-ghost btn-sm btn-delete-link edit-only" data-id="${l.id}" title="Remove" style="display:none;">&#10005;</button>
    </li>
  `).join('');

  document.querySelectorAll('.btn-delete-link').forEach(btn => {
    btn.addEventListener('click', () => deleteLink(btn.dataset.id));
  });
}

function renderNotes(notes) {
  if (!notes || !notes.trim()) return '<span class="text-muted" style="font-style:italic;">No notes yet.</span>';
  return escHtml(notes).replace(/\n/g, '<br>');
}

function recalcBudget() {
  const summary = document.getElementById('budget-summary');
  if (!summary) return;

  const total = project.budget.total || 0;
  const spent = (project.budget.costItems || []).reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = total - spent;
  const pct = total > 0 ? Math.min((spent / total) * 100, 100) : 0;
  const isOver = spent > total && total > 0;

  summary.innerHTML = `
    <div class="budget-stat">
      <div class="stat-label">Total Budget</div>
      <div class="stat-value">$${fmt(total)}</div>
    </div>
    <div class="budget-stat">
      <div class="stat-label">Total Spent</div>
      <div class="stat-value ${isOver ? 'over' : ''}">$${fmt(spent)}</div>
    </div>
    <div class="budget-stat">
      <div class="stat-label">Remaining${isOver ? ' (Over)' : ''}</div>
      <div class="stat-value ${isOver ? 'over' : remaining === 0 && total === 0 ? '' : 'good'}">${isOver ? '-' : ''}$${fmt(Math.abs(remaining))}</div>
      ${total > 0 ? `
        <div class="progress-bar">
          <div class="progress-bar-fill ${isOver ? 'over' : ''}" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">${pct.toFixed(1)}% used</div>
      ` : ''}
    </div>
  `;
}

/* =====================
   Edit Mode Toggle
   ===================== */
function setEditMode(on) {
  editMode = on;
  if (on) {
    document.body.classList.add('edit-mode');
    document.getElementById('btn-edit-toggle').classList.add('active');
    document.getElementById('btn-delete-project').classList.remove('hidden');
  } else {
    document.body.classList.remove('edit-mode');
    document.getElementById('btn-edit-toggle').classList.remove('active');
    document.getElementById('btn-delete-project').classList.add('hidden');
  }

  document.querySelectorAll('.edit-only').forEach(el => {
    el.style.display = on ? (el.tagName === 'DIV' || el.tagName === 'TD' || el.tagName === 'TH' || el.tagName === 'BUTTON' ? 'flex' : '') : 'none';
  });
  document.querySelectorAll('.view-only').forEach(el => {
    el.style.display = on ? 'none' : '';
  });

  if (!on) {
    renderFieldsView();
    renderCostItems();
    renderLinks();
    document.getElementById('notes-view').innerHTML = renderNotes(project.notes);
  } else {
    renderCostItems();
    renderLinks();
  }
  renderMilestones();
}

/* =====================
   Save actions
   ===================== */
async function saveFields() {
  const name = document.getElementById('edit-name').value.trim();
  if (!name) return;

  const customFields = {};
  document.querySelectorAll('.custom-field-input').forEach(el => {
    customFields[el.dataset.field] = el.value;
  });

  const team = document.getElementById('e-team').value
    .split(',').map(s => s.trim()).filter(Boolean);

  const fundingVal = document.getElementById('e-funding').value;
  const fundingSources = fundingVal ? [fundingVal] : [];

  project = await api('PUT', `/api/projects/${PROJECT_ID}`, {
    name,
    status: document.getElementById('e-status').value,
    division: document.getElementById('e-division').value,
    levelOfEffort: document.getElementById('e-loe').value,
    projectManager: document.getElementById('e-pm').value.trim(),
    startDate: document.getElementById('e-start').value,
    endDate: document.getElementById('e-end').value,
    team,
    fundingSources,
    customFields,
    hideFromTimeline: document.getElementById('e-hide-tl').checked
  });

  document.title = `ProDash – ${project.name}`;
  renderFieldsView();
  showToast('Project details saved');
}

async function saveBudgetTotal() {
  const val = parseFloat(document.getElementById('e-budget-total').value) || 0;
  project = await api('PUT', `/api/projects/${PROJECT_ID}`, { budgetTotal: val });
  recalcBudget();
  showToast('Budget updated');
}

async function saveNotes() {
  const notes = document.getElementById('e-notes').value;
  project = await api('PUT', `/api/projects/${PROJECT_ID}`, { notes });
  document.getElementById('notes-view').innerHTML = renderNotes(notes);
  showToast('Notes saved');
}

async function saveMilestone(mid) {
  const row = document.querySelector(`tr[data-ms-id="${mid}"]`);
  if (!row) return;
  const name = row.querySelector('.ms-edit-name').value.trim();
  if (!name) return;

  const updated = await api('PUT', `/api/projects/${PROJECT_ID}/milestones/${mid}`, {
    name,
    startDate: row.querySelector('.ms-edit-start').value,
    endDate: row.querySelector('.ms-edit-end').value,
    status: row.querySelector('.ms-edit-status').value
  });

  const idx = (project.milestones || []).findIndex(m => m.id === mid);
  if (idx !== -1) project.milestones[idx] = updated;
  editingMilestoneId = null;
  renderMilestones();
  showToast('Milestone updated');
}

async function addMilestone() {
  const nameEl = document.getElementById('ms-new-name');
  if (!nameEl) return;
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }

  const ms = await api('POST', `/api/projects/${PROJECT_ID}/milestones`, {
    name,
    startDate: document.getElementById('ms-new-start').value,
    endDate: document.getElementById('ms-new-end').value,
    status: document.getElementById('ms-new-status').value
  });

  if (!project.milestones) project.milestones = [];
  project.milestones.push(ms);

  renderMilestones();
  const fresh = document.getElementById('ms-new-name');
  if (fresh) fresh.focus();
  showToast('Milestone added');
}

async function deleteMilestone(mid) {
  await api('DELETE', `/api/projects/${PROJECT_ID}/milestones/${mid}`);
  project.milestones = (project.milestones || []).filter(m => m.id !== mid);
  renderMilestones();
  showToast('Milestone removed');
}

async function addCostItem() {
  const amount = parseFloat(document.getElementById('ci-amount').value);
  if (!amount && amount !== 0) return;

  const item = await api('POST', `/api/projects/${PROJECT_ID}/costItems`, {
    date: document.getElementById('ci-date').value,
    description: document.getElementById('ci-desc').value.trim(),
    category: document.getElementById('ci-category').value,
    amount
  });

  project.budget.costItems.push(item);

  document.getElementById('ci-amount').value = '';
  document.getElementById('ci-desc').value = '';
  document.getElementById('ci-date').value = '';
  document.getElementById('ci-category').value = '';

  renderCostItems();
  recalcBudget();
  showToast('Cost item added');
}

async function deleteCostItem(itemId) {
  await api('DELETE', `/api/projects/${PROJECT_ID}/costItems/${itemId}`);
  project.budget.costItems = project.budget.costItems.filter(i => i.id !== itemId);
  renderCostItems();
  recalcBudget();
  showToast('Cost item removed');
}

async function addLink() {
  const url = document.getElementById('link-url').value.trim();
  if (!url) return;
  const title = document.getElementById('link-title').value.trim();

  const link = await api('POST', `/api/projects/${PROJECT_ID}/links`, { url, title });
  project.links.push(link);

  document.getElementById('link-url').value = '';
  document.getElementById('link-title').value = '';

  renderLinks();
  showToast('Link added');
}

async function deleteLink(linkId) {
  await api('DELETE', `/api/projects/${PROJECT_ID}/links/${linkId}`);
  project.links = project.links.filter(l => l.id !== linkId);
  renderLinks();
  showToast('Link removed');
}

async function deleteProject() {
  if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
  await api('DELETE', `/api/projects/${PROJECT_ID}`);
  window.location.href = '/';
}

/* =====================
   Event Listeners
   ===================== */
function attachAllListeners() {
  renderFieldsView();
  renderMilestones();
  renderCostItems();
  renderLinks();

  document.getElementById('btn-save-fields').addEventListener('click', saveFields);
  document.getElementById('btn-cancel-fields').addEventListener('click', () => setEditMode(false));
  document.getElementById('btn-save-budget-total').addEventListener('click', saveBudgetTotal);
  document.getElementById('btn-save-notes').addEventListener('click', saveNotes);
  document.getElementById('btn-add-cost-item').addEventListener('click', addCostItem);
  document.getElementById('btn-add-link').addEventListener('click', addLink);
}

/* Global nav button listeners */
document.getElementById('btn-edit-toggle').addEventListener('click', () => setEditMode(!editMode));
document.getElementById('btn-delete-project').addEventListener('click', deleteProject);

/* =====================
   Helpers
   ===================== */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function badgeClass(status) {
  const map = {
    'Planning': 'badge-planning',
    'Active': 'badge-active',
    'On Hold': 'badge-on-hold',
    'Completed': 'badge-completed',
    'Cancelled': 'badge-cancelled'
  };
  return map[status] || 'badge-default';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g,'&quot;');
}

function normalizeISODate(val) {
  if (!val) return '';
  val = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  const ymd = val.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return val;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const iso = normalizeISODate(dateStr);
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return dateStr;
  return `${m}/${d}/${y}`;
}

function fmt(num) {
  return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

init();
