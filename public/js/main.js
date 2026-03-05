/* =============================
   ProDash – App Shell (index)
   ============================= */

/* ---- State ---- */
let settings = {};
let projects = [];
let activeProjectId = null;
let activeProject = null;
let editMode = false;
let sidebarFilter = '';
let activeView = 'board';
let expandedTimelineProjects = new Set();
let sortColumn = null;
let sortDir = 'asc';
let columnFilters = {};
let _boardCols = [];
let editingMilestoneId = null;
let timelineEditMode = false;
let tlDragState = null;
let tlFilters = {};
let tlSort = { col: null, dir: 'asc' };
let tlFilterBarOpen = false;

/* ---- Init ---- */
async function init() {
  [settings, projects] = await Promise.all([
    fetch('/api/admin/settings').then(r => r.json()),
    fetch('/api/projects').then(r => r.json())
  ]);
  sortColumn = settings.boardSortColumn || null;
  sortDir    = settings.boardSortDir    || 'asc';
  populateNewProjectForm();
  renderSidebar();
  renderLaunchBoard();
  setupModal();

  document.getElementById('nav-brand').addEventListener('click', e => {
    e.preventDefault();
    if (editMode) setEditMode(false);
    activeProjectId = null;
    activeProject = null;
    activeView = 'board';
    renderSidebar();
    renderLaunchBoard();
  });

  document.getElementById('sidebar-search').addEventListener('input', e => {
    sidebarFilter = e.target.value;
    renderSidebar();
  });

  document.getElementById('csv-import-input').addEventListener('change', e => {
    if (e.target.files[0]) {
      importCSV(e.target.files[0]);
      e.target.value = '';
    }
  });
}

/* ---- Sidebar ---- */
function renderSidebar() {
  const list = document.getElementById('sidebar-list');
  const filter = sidebarFilter.toLowerCase();
  let filtered = projects.filter(p => p.name.toLowerCase().includes(filter));

  const sortKey = settings.sidebarSort || 'name';
  const loePriority = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
  filtered = [...filtered].sort((a, b) => {
    if (sortKey === 'startDate') {
      return (a.startDate || '').localeCompare(b.startDate || '');
    }
    if (sortKey === 'status') {
      return (a.status || '').localeCompare(b.status || '');
    }
    if (sortKey === 'levelOfEffort') {
      const ap = loePriority[a.levelOfEffort] ?? 99;
      const bp = loePriority[b.levelOfEffort] ?? 99;
      return ap !== bp ? ap - bp : (a.name || '').localeCompare(b.name || '');
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  const allItem = `
    <li class="sidebar-item ${activeView === 'board' && !activeProjectId ? 'active' : ''}" id="sidebar-all">
      <span>📋</span><span>All Projects</span>
    </li>
    <li class="sidebar-item ${activeView === 'timeline' ? 'active' : ''}" id="sidebar-timeline">
      <span>📅</span><span>Timeline</span>
    </li>
    <li class="sidebar-item ${activeView === 'status' ? 'active' : ''}" id="sidebar-status">
      <span>📊</span><span>Status</span>
    </li>
    <li class="sidebar-divider"></li>
  `;

  const projectItems = filtered.map(p => `
    <li class="sidebar-item ${p.id === activeProjectId ? 'active' : ''}" data-id="${escAttr(p.id)}">
      <span class="sidebar-status-dot ${statusDotClass(p.status)}"></span>
      <span>${escHtml(p.name)}</span>
    </li>
  `).join('');

  list.innerHTML = allItem + projectItems;

  list.querySelector('#sidebar-all').addEventListener('click', () => {
    if (editMode) setEditMode(false);
    activeProjectId = null;
    activeProject = null;
    activeView = 'board';
    renderSidebar();
    renderLaunchBoard();
  });

  list.querySelector('#sidebar-timeline').addEventListener('click', () => {
    if (editMode) setEditMode(false);
    activeProjectId = null;
    activeProject = null;
    activeView = 'timeline';
    renderSidebar();
    renderTimeline();
  });

  list.querySelector('#sidebar-status').addEventListener('click', () => {
    if (editMode) setEditMode(false);
    activeProjectId = null;
    activeProject = null;
    activeView = 'status';
    renderSidebar();
    renderStatusView();
  });

  list.querySelectorAll('[data-id]').forEach(item => {
    item.addEventListener('click', () => selectProject(item.dataset.id));
  });
}

/* ---- Launch Board ---- */
function getBoardVal(p, col) {
  if (col.customName) return (p.customFields || {})[col.customName] || '';
  switch (col.key) {
    case 'name':          return p.name || '';
    case 'status':        return p.status || '';
    case 'division':      return p.division || '';
    case 'fundingSources':return (p.fundingSources || []).join(', ');
    case 'projectManager':return p.projectManager || '';
    case 'team':          return (p.team || []).join(', ');
    case 'startDate':     return p.startDate || '';
    case 'levelOfEffort': return p.levelOfEffort || '';
    default:              return '';
  }
}

function renderBoardTbody() {
  const tbody = document.getElementById('board-tbody');
  if (!tbody) return;
  const customCols = (settings.customFieldDefinitions || []).filter(f => f.showInList);

  let result = projects.filter(p =>
    _boardCols.every(col => {
      const fv = (columnFilters[col.key] || '').toLowerCase().trim();
      return !fv || getBoardVal(p, col).toLowerCase().includes(fv);
    })
  );

  if (sortColumn) {
    const col = _boardCols.find(c => c.key === sortColumn);
    if (col) {
      result = [...result].sort((a, b) => {
        const av = getBoardVal(a, col), bv = getBoardVal(b, col);
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
  }

  if (!result.length) {
    tbody.innerHTML = `
      <tr><td colspan="${_boardCols.length}">
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>${projects.length ? 'No projects match your filters.' : 'No projects yet. Click <strong>+ New</strong> to get started.'}</p>
        </div>
      </td></tr>`;
  } else {
    tbody.innerHTML = result.map(p => `
      <tr data-id="${escAttr(p.id)}">
        <td class="project-name-cell">${escHtml(p.name)}</td>
        <td><span class="badge ${badgeClass(p.status)}">${escHtml(p.status)}</span></td>
        <td>${escHtml(p.division) || '<span class="text-muted">—</span>'}</td>
        <td>${escHtml((p.fundingSources || []).join(', ')) || '<span class="text-muted">—</span>'}</td>
        <td>${escHtml(p.projectManager) || '<span class="text-muted">—</span>'}</td>
        <td>${escHtml((p.team || []).join(', ')) || '<span class="text-muted">—</span>'}</td>
        <td>${p.startDate ? formatDate(p.startDate) : '<span class="text-muted">—</span>'}</td>
        <td>${escHtml(p.levelOfEffort) || '<span class="text-muted">—</span>'}</td>
        ${customCols.map(c => `<td>${escHtml((p.customFields || {})[c.name] || '') || '<span class="text-muted">—</span>'}</td>`).join('')}
      </tr>
    `).join('');
  }

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => selectProject(row.dataset.id));
  });
}

function renderLaunchBoard() {
  activeView = 'board';
  timelineEditMode = false;
  const pane = document.getElementById('main-pane');
  const customCols = (settings.customFieldDefinitions || []).filter(f => f.showInList);

  _boardCols = [
    { key: 'name',           label: 'Project Name' },
    { key: 'status',         label: 'Status' },
    { key: 'division',       label: 'Division' },
    { key: 'fundingSources', label: 'Funding Source(s)' },
    { key: 'projectManager', label: 'Project Manager' },
    { key: 'team',           label: 'Team' },
    { key: 'startDate',      label: 'Start Date' },
    { key: 'levelOfEffort',  label: 'Level of Effort' },
    ...customCols.map(c => ({ key: `cf_${c.name}`, label: c.label, customName: c.name }))
  ];

  const headCols = _boardCols.map(col => {
    const isSorted = sortColumn === col.key;
    const arrow = isSorted ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="sortable-th" data-col="${escAttr(col.key)}">${escHtml(col.label)}${arrow}</th>`;
  }).join('');

  const filterCols = _boardCols.map(col => `
    <th class="filter-th">
      <input type="text" class="col-filter" data-col="${escAttr(col.key)}"
        placeholder="Filter…" value="${escAttr(columnFilters[col.key] || '')}" />
    </th>
  `).join('');

  pane.innerHTML = `
    <div class="csv-toolbar">
      <button class="btn btn-ghost btn-sm" id="btn-export-csv">&#8595; Export CSV</button>
      <button class="btn btn-ghost btn-sm" id="btn-import-csv">&#8593; Import CSV</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>${headCols}</tr>
          <tr>${filterCols}</tr>
        </thead>
        <tbody id="board-tbody"></tbody>
      </table>
    </div>
  `;

  renderBoardTbody();

  pane.querySelectorAll('.sortable-th').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortColumn === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortColumn = col; sortDir = 'asc'; }
      renderLaunchBoard();
    });
  });

  pane.querySelectorAll('.col-filter').forEach(input => {
    input.addEventListener('input', () => {
      columnFilters[input.dataset.col] = input.value;
      renderBoardTbody();
    });
    input.addEventListener('click', e => e.stopPropagation());
  });

  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-import-csv').addEventListener('click', () => {
    document.getElementById('csv-import-input').click();
  });
}

/* ---- Project Detail ---- */
async function selectProject(id) {
  if (editMode) setEditMode(false);
  timelineEditMode = false;
  activeProjectId = id;
  activeView = 'project';
  activeProject = await fetch(`/api/projects/${id}`).then(r => r.json());
  renderSidebar();
  renderProjectDetail();
}

function renderProjectDetail() {
  activeView = 'project';
  editingMilestoneId = null;
  const pane = document.getElementById('main-pane');
  pane.innerHTML = buildProjectHTML();
  attachProjectListeners();
  recalcBudget();
}

function buildProjectHTML() {
  const p = activeProject;
  return `
    <div class="project-detail-header">
      <div style="flex:1;min-width:0;">
        <div class="view-only">
          <h1 style="font-size:24px;font-weight:800;">${escHtml(p.name)}</h1>
        </div>
        <div class="edit-only" style="display:none;max-width:480px;">
          <input type="text" id="edit-name" value="${escAttr(p.name)}" style="font-size:18px;font-weight:700;" />
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <a href="/project.html?id=${escAttr(p.id)}" target="_blank" class="btn btn-secondary btn-sm" title="Open full page">&#8599;</a>
        <button id="btn-delete-project" class="btn btn-danger btn-sm hidden">Delete</button>
        <button id="btn-edit-toggle" class="gear-btn">&#9881; Edit</button>
      </div>
    </div>

    <!-- TOP 3-COLUMN GRID: Details | Notes | Links -->
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
                    `<option value="${escAttr(o)}" ${p.status === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-division">Division</label>
                <select id="e-division">
                  <option value="">— Select —</option>
                  ${(settings.divisionOptions || []).map(o =>
                    `<option value="${escAttr(o)}" ${p.division === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-loe">Level of Effort</label>
                <select id="e-loe">
                  <option value="">— Select —</option>
                  ${(settings.levelOfEffortOptions || []).map(o =>
                    `<option value="${escAttr(o)}" ${p.levelOfEffort === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-funding">Funding Source</label>
                <select id="e-funding">
                  <option value="">— Select —</option>
                  ${(settings.fundingSourceOptions || []).map(o =>
                    `<option value="${escAttr(o)}" ${(p.fundingSources || [])[0] === o ? 'selected' : ''}>${escHtml(o)}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group mb-0">
                <label for="e-pm">Project Manager</label>
                <input type="text" id="e-pm" value="${escAttr(p.projectManager)}" />
              </div>
              <div class="form-group mb-0">
                <label for="e-start">Start Date</label>
                <input type="date" id="e-start" value="${escAttr(p.startDate)}" />
              </div>
              <div class="form-group mb-0">
                <label for="e-end">End Date</label>
                <input type="date" id="e-end" value="${escAttr(p.endDate || '')}" />
              </div>
              <div class="form-group mb-0">
                <label for="e-team">Team (comma-separated)</label>
                <input type="text" id="e-team" value="${escAttr((p.team || []).join(', '))}" />
              </div>
              ${buildCustomFieldEditors()}
              <div class="form-group mb-0" style="grid-column:1/-1;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:normal;text-transform:none;letter-spacing:0;font-size:13px;">
                  <input type="checkbox" id="e-hide-tl" ${p.hideFromTimeline ? 'checked' : ''} style="width:auto;" />
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
            <div class="view-only" id="notes-view">${renderNotes(p.notes)}</div>
            <div class="edit-only" style="display:none;">
              <textarea id="e-notes" style="min-height:120px;width:100%;">${escHtml(p.notes)}</textarea>
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
          <input type="number" id="e-budget-total" value="${p.budget.total || 0}"
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
  const val = (activeProject.customFields || {})[f.name] || '';
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
  const p = activeProject;
  const customFields = settings.customFieldDefinitions || [];
  el.innerHTML = `
    <div class="field-item">
      <label>Status</label>
      <div class="field-value"><span class="badge ${badgeClass(p.status)}">${escHtml(p.status)}</span></div>
    </div>
    <div class="field-item">
      <label>Division</label>
      <div class="field-value ${!p.division ? 'empty' : ''}">${p.division || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Project Manager</label>
      <div class="field-value ${!p.projectManager ? 'empty' : ''}">${p.projectManager || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Start Date</label>
      <div class="field-value ${!p.startDate ? 'empty' : ''}">${p.startDate ? formatDate(p.startDate) : 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>End Date</label>
      <div class="field-value ${!p.endDate ? 'empty' : ''}">${p.endDate ? formatDate(p.endDate) : 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Level of Effort</label>
      <div class="field-value ${!p.levelOfEffort ? 'empty' : ''}">${p.levelOfEffort || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Funding Source(s)</label>
      <div class="field-value ${!(p.fundingSources || []).length ? 'empty' : ''}">${(p.fundingSources || []).join(', ') || 'Not set'}</div>
    </div>
    <div class="field-item">
      <label>Team</label>
      <div class="field-value ${!(p.team || []).length ? 'empty' : ''}">${(p.team || []).join(', ') || 'Not set'}</div>
    </div>
    ${customFields.map(f => `
      <div class="field-item">
        <label>${escHtml(f.label)}</label>
        <div class="field-value ${!(p.customFields || {})[f.name] ? 'empty' : ''}">${(p.customFields || {})[f.name] || 'Not set'}</div>
      </div>
    `).join('')}
    ${p.hideFromTimeline ? `<div class="field-item"><label>Timeline</label><div class="field-value empty">Hidden from Timeline</div></div>` : ''}
  `;
}

function renderCostItems() {
  const tbody = document.getElementById('cost-items-tbody');
  const tfoot = document.getElementById('cost-tfoot');
  if (!tbody) return;

  const items = activeProject.budget.costItems || [];

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
  const links = activeProject.links || [];

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

function renderMilestones() {
  const list = document.getElementById('milestones-list');
  if (!list) return;
  const milestones = activeProject.milestones || [];

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
                    <button class="btn btn-primary btn-sm btn-save-ms" data-id="${m.id}" title="Save">&#10003;</button>
                    <button class="btn btn-ghost btn-sm btn-cancel-ms" title="Cancel">&#10005;</button>
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

async function saveMilestone(mid) {
  const row = document.querySelector(`tr[data-ms-id="${mid}"]`);
  if (!row) return;
  const name = row.querySelector('.ms-edit-name').value.trim();
  if (!name) return;

  const updated = await api('PUT', `/api/projects/${activeProjectId}/milestones/${mid}`, {
    name,
    startDate: row.querySelector('.ms-edit-start').value,
    endDate: row.querySelector('.ms-edit-end').value,
    status: row.querySelector('.ms-edit-status').value
  });

  const idx = (activeProject.milestones || []).findIndex(m => m.id === mid);
  if (idx !== -1) activeProject.milestones[idx] = updated;
  editingMilestoneId = null;
  renderMilestones();
  showToast('Milestone updated');
}

async function addMilestone() {
  const nameEl = document.getElementById('ms-new-name');
  if (!nameEl) return;
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }

  const ms = await api('POST', `/api/projects/${activeProjectId}/milestones`, {
    name,
    startDate: document.getElementById('ms-new-start').value,
    endDate: document.getElementById('ms-new-end').value,
    status: document.getElementById('ms-new-status').value
  });

  if (!activeProject.milestones) activeProject.milestones = [];
  activeProject.milestones.push(ms);

  renderMilestones();
  const fresh = document.getElementById('ms-new-name');
  if (fresh) fresh.focus();
  showToast('Milestone added');
}

async function deleteMilestone(mid) {
  await api('DELETE', `/api/projects/${activeProjectId}/milestones/${mid}`);
  activeProject.milestones = (activeProject.milestones || []).filter(m => m.id !== mid);
  renderMilestones();
  showToast('Milestone removed');
}

function renderNotes(notes) {
  if (!notes || !notes.trim()) return '<span class="text-muted" style="font-style:italic;">No notes yet.</span>';
  return escHtml(notes).replace(/\n/g, '<br>');
}

function recalcBudget() {
  const summary = document.getElementById('budget-summary');
  if (!summary) return;

  const total = activeProject.budget.total || 0;
  const spent = (activeProject.budget.costItems || []).reduce((s, i) => s + (i.amount || 0), 0);
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

/* ---- Edit Mode ---- */
function setEditMode(on) {
  editMode = on;
  document.body.classList.toggle('edit-mode', on);

  const editToggle = document.getElementById('btn-edit-toggle');
  const deleteBtn = document.getElementById('btn-delete-project');

  if (editToggle) editToggle.classList.toggle('active', on);
  if (deleteBtn) deleteBtn.classList.toggle('hidden', !on);

  if (editToggle) {
    if (!on) {
      renderFieldsView();
      renderCostItems();
      renderLinks();
      renderMilestones();
      const notesView = document.getElementById('notes-view');
      if (notesView) notesView.innerHTML = renderNotes(activeProject.notes);
    } else {
      renderCostItems();
      renderLinks();
      renderMilestones();
    }
  }
}

/* ---- Save Actions ---- */
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

  activeProject = await api('PUT', `/api/projects/${activeProjectId}`, {
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

  // Update projects array so sidebar reflects name/status changes
  const idx = projects.findIndex(p => p.id === activeProjectId);
  if (idx !== -1) projects[idx] = { ...projects[idx], ...activeProject };

  renderFieldsView();
  renderSidebar();
  showToast('Project details saved');
}

async function saveBudgetTotal() {
  const val = parseFloat(document.getElementById('e-budget-total').value) || 0;
  activeProject = await api('PUT', `/api/projects/${activeProjectId}`, { budgetTotal: val });
  recalcBudget();
  showToast('Budget updated');
}

async function saveNotes() {
  const notes = document.getElementById('e-notes').value;
  activeProject = await api('PUT', `/api/projects/${activeProjectId}`, { notes });
  document.getElementById('notes-view').innerHTML = renderNotes(notes);
  showToast('Notes saved');
}

async function addCostItem() {
  const amount = parseFloat(document.getElementById('ci-amount').value);
  if (!amount && amount !== 0) return;

  const item = await api('POST', `/api/projects/${activeProjectId}/costItems`, {
    date: document.getElementById('ci-date').value,
    description: document.getElementById('ci-desc').value.trim(),
    category: document.getElementById('ci-category').value,
    amount
  });

  activeProject.budget.costItems.push(item);

  document.getElementById('ci-amount').value = '';
  document.getElementById('ci-desc').value = '';
  document.getElementById('ci-date').value = '';
  document.getElementById('ci-category').value = '';

  renderCostItems();
  recalcBudget();
  showToast('Cost item added');
}

async function deleteCostItem(itemId) {
  await api('DELETE', `/api/projects/${activeProjectId}/costItems/${itemId}`);
  activeProject.budget.costItems = activeProject.budget.costItems.filter(i => i.id !== itemId);
  renderCostItems();
  recalcBudget();
  showToast('Cost item removed');
}

async function addLink() {
  const url = document.getElementById('link-url').value.trim();
  if (!url) return;
  const title = document.getElementById('link-title').value.trim();

  const link = await api('POST', `/api/projects/${activeProjectId}/links`, { url, title });
  activeProject.links.push(link);

  document.getElementById('link-url').value = '';
  document.getElementById('link-title').value = '';

  renderLinks();
  showToast('Link added');
}

async function deleteLink(linkId) {
  await api('DELETE', `/api/projects/${activeProjectId}/links/${linkId}`);
  activeProject.links = activeProject.links.filter(l => l.id !== linkId);
  renderLinks();
  showToast('Link removed');
}

async function exportCSV() {
  const a = document.createElement('a');
  a.href = '/api/projects/export';
  a.download = 'projects.csv';
  a.click();
}

async function importCSV(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) { showToast('No data rows found'); return; }
  const [headerLine, ...dataLines] = lines;
  const headers = parseCSVRow(headerLine);
  const projectsToImport = dataLines.map(line => {
    const vals = parseCSVRow(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (vals[i] || '').trim());
    return {
      name: obj.name,
      status: obj.status,
      fundingSources: obj.fundingSources ? obj.fundingSources.split(';').filter(Boolean) : [],
      projectManager: obj.projectManager,
      team: obj.team ? obj.team.split(';').filter(Boolean) : [],
      startDate: normalizeISODate(obj.startDate),
      endDate: normalizeISODate(obj.endDate),
      levelOfEffort: obj.levelOfEffort,
      budgetTotal: parseFloat(obj.budgetTotal) || 0,
      notes: obj.notes || '',
      links: obj.links || '',
      milestones: obj.milestones || '',
      costItems: obj.costItems || '',
      customFields: obj.customFields || ''
    };
  }).filter(p => p.name);

  if (!projectsToImport.length) { showToast('No valid rows to import'); return; }

  const result = await api('POST', '/api/projects/import', { projects: projectsToImport });
  projects = await fetch('/api/projects').then(r => r.json());
  renderSidebar();
  renderLaunchBoard();
  showToast(`Imported ${result.created} project${result.created !== 1 ? 's' : ''}`);
}

function parseCSVRow(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

async function deleteProject() {
  if (!confirm(`Delete "${activeProject.name}"? This cannot be undone.`)) return;
  await api('DELETE', `/api/projects/${activeProjectId}`);

  projects = projects.filter(p => p.id !== activeProjectId);
  activeProjectId = null;
  activeProject = null;
  editMode = false;
  document.body.classList.remove('edit-mode');

  renderSidebar();
  renderLaunchBoard();
  showToast('Project deleted');
}

/* ---- Attach Project Listeners ---- */
function attachProjectListeners() {
  renderFieldsView();
  renderCostItems();
  renderLinks();
  renderMilestones();

  document.getElementById('btn-edit-toggle').addEventListener('click', () => setEditMode(!editMode));
  document.getElementById('btn-delete-project').addEventListener('click', deleteProject);
  document.getElementById('btn-save-fields').addEventListener('click', saveFields);
  document.getElementById('btn-cancel-fields').addEventListener('click', () => setEditMode(false));
  document.getElementById('btn-save-budget-total').addEventListener('click', saveBudgetTotal);
  document.getElementById('btn-save-notes').addEventListener('click', saveNotes);
  document.getElementById('btn-add-cost-item').addEventListener('click', addCostItem);
  document.getElementById('btn-add-link').addEventListener('click', addLink);
}

/* ---- Modal ---- */
function setupModal() {
  document.getElementById('btn-new-project').addEventListener('click', openModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('btn-create-project').addEventListener('click', createProject);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && document.getElementById('modal-overlay').classList.contains('open')) {
      createProject();
    }
  });
}

function openModal() {
  document.getElementById('new-name').value = '';
  document.getElementById('new-pm').value = '';
  document.getElementById('new-start').value = '';
  document.getElementById('new-end').value = '';
  document.getElementById('new-team').value = '';
  document.querySelectorAll('#new-funding-checkboxes input').forEach(cb => cb.checked = false);
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('new-name').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function populateNewProjectForm() {
  const statusSel = document.getElementById('new-status');
  statusSel.innerHTML = (settings.statusOptions || []).map(o =>
    `<option value="${escAttr(o)}">${escHtml(o)}</option>`).join('');

  const divisionSel = document.getElementById('new-division');
  divisionSel.innerHTML = `<option value="">— Select —</option>` +
    (settings.divisionOptions || []).map(o =>
      `<option value="${escAttr(o)}">${escHtml(o)}</option>`).join('');

  const loeSel = document.getElementById('new-loe');
  loeSel.innerHTML = `<option value="">— Select —</option>` +
    (settings.levelOfEffortOptions || []).map(o =>
      `<option value="${escAttr(o)}">${escHtml(o)}</option>`).join('');

  const container = document.getElementById('new-funding-checkboxes');
  container.innerHTML = (settings.fundingSourceOptions || []).map(o => `
    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;">
      <input type="checkbox" value="${escAttr(o)}" style="width:auto;" />
      ${escHtml(o)}
    </label>
  `).join('');
}

async function createProject() {
  const name = document.getElementById('new-name').value.trim();
  if (!name) {
    document.getElementById('new-name').focus();
    return;
  }

  const fundingSources = [...document.querySelectorAll('#new-funding-checkboxes input:checked')]
    .map(cb => cb.value);

  const team = document.getElementById('new-team').value
    .split(',').map(s => s.trim()).filter(Boolean);

  const body = {
    name,
    status: document.getElementById('new-status').value,
    division: document.getElementById('new-division').value,
    levelOfEffort: document.getElementById('new-loe').value,
    projectManager: document.getElementById('new-pm').value.trim(),
    startDate: document.getElementById('new-start').value,
    endDate: document.getElementById('new-end').value,
    team,
    fundingSources
  };

  const project = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());

  projects.push(project);
  closeModal();
  renderSidebar();
  selectProject(project.id);
  showToast('Project created');
}

/* ---- Status View ---- */
const STATUS_COLORS = {
  'Planning':    '#3B82F6',
  'Active':      '#22C55E',
  'On Hold':     '#EAB308',
  'Completed':   '#94A3B8',
  'Cancelled':   '#EF4444',
  'Not Started': '#CBD5E1'
};
const CHART_PALETTE = [
  '#6366F1','#EC4899','#14B8A6','#F59E0B',
  '#8B5CF6','#10B981','#F97316','#06B6D4',
  '#3B82F6','#22C55E','#EF4444','#84CC16'
];

let _statusCharts = [];

function renderStatusView() {
  activeView = 'status';
  timelineEditMode = false;

  // Destroy any previously created charts to avoid canvas reuse errors
  _statusCharts.forEach(c => c.destroy());
  _statusCharts = [];

  const total    = projects.length;
  const active   = projects.filter(p => p.status === 'Active').length;
  const onHold   = projects.filter(p => p.status === 'On Hold').length;
  const complete = projects.filter(p => p.status === 'Completed').length;

  const pane = document.getElementById('main-pane');
  pane.innerHTML = `
    <div style="padding:16px 20px 20px;">
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value">${total}</div>
          <div class="stat-label">Total Projects</div>
        </div>
        <div class="stat-card stat-card-active">
          <div class="stat-value">${active}</div>
          <div class="stat-label">Active</div>
        </div>
        <div class="stat-card stat-card-hold">
          <div class="stat-value">${onHold}</div>
          <div class="stat-label">On Hold</div>
        </div>
        <div class="stat-card stat-card-done">
          <div class="stat-value">${complete}</div>
          <div class="stat-label">Completed</div>
        </div>
      </div>

      <div class="status-charts-grid">
        <div class="card">
          <div class="section-header"><h2>By Status</h2></div>
          <div class="section-body chart-body" id="wrap-status">
            <canvas id="chart-status"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="section-header"><h2>By Division</h2></div>
          <div class="section-body chart-body" id="wrap-division">
            <canvas id="chart-division"></canvas>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="section-header"><h2>By Project Manager</h2></div>
        <div class="section-body chart-body" id="wrap-pm">
          <canvas id="chart-pm"></canvas>
        </div>
      </div>
    </div>
  `;

  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1E293B';
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#E2E8F0';

  // Status doughnut
  const statusCounts = {};
  projects.forEach(p => { const s = p.status || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  const sLabels = Object.keys(statusCounts);
  document.getElementById('wrap-status').style.height = '160px';
  _statusCharts.push(new Chart(document.getElementById('chart-status'), {
    type: 'doughnut',
    data: {
      labels: sLabels,
      datasets: [{ data: Object.values(statusCounts),
        backgroundColor: sLabels.map(l => STATUS_COLORS[l] || '#94A3B8'),
        borderWidth: 2, borderColor: 'transparent', hoverOffset: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: textColor, padding: 8, font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} project${ctx.parsed !== 1 ? 's' : ''}` } }
      }
    }
  }));

  // Division bar
  const divCounts = {};
  projects.forEach(p => { const d = p.division || 'Unassigned'; divCounts[d] = (divCounts[d] || 0) + 1; });
  const divSorted = Object.entries(divCounts).sort((a, b) => b[1] - a[1]);
  const divWrap = document.getElementById('wrap-division');
  divWrap.style.height = Math.max(130, divSorted.length * 28 + 40) + 'px';
  _statusCharts.push(new Chart(document.getElementById('chart-division'), {
    type: 'bar',
    data: {
      labels: divSorted.map(e => e[0]),
      datasets: [{ data: divSorted.map(e => e[1]),
        backgroundColor: divSorted.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderRadius: 4, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} project${ctx.parsed.x !== 1 ? 's' : ''}` } }
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: textColor, stepSize: 1, precision: 0 }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { display: false } }
      }
    }
  }));

  // PM bar
  const pmCounts = {};
  projects.forEach(p => { const pm = p.projectManager || 'Unassigned'; pmCounts[pm] = (pmCounts[pm] || 0) + 1; });
  const pmSorted = Object.entries(pmCounts).sort((a, b) => b[1] - a[1]);
  const pmWrap = document.getElementById('wrap-pm');
  pmWrap.style.height = Math.max(130, pmSorted.length * 28 + 40) + 'px';
  _statusCharts.push(new Chart(document.getElementById('chart-pm'), {
    type: 'bar',
    data: {
      labels: pmSorted.map(e => e[0]),
      datasets: [{ data: pmSorted.map(e => e[1]),
        backgroundColor: pmSorted.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderRadius: 4, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} project${ctx.parsed.x !== 1 ? 's' : ''}` } }
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: textColor, stepSize: 1, precision: 0 }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { display: false } }
      }
    }
  }));
}

/* ---- Timeline / Gantt ---- */
function dateToMonthIdx(dateStr) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-').map(Number);
  return (y - 2025) * 12 + (m - 1);
}

function statusBarClass(status) {
  const map = {
    'Planning':  'bar-planning',
    'Active':    'bar-active',
    'On Hold':   'bar-on-hold',
    'Completed': 'bar-completed',
    'Cancelled': 'bar-cancelled'
  };
  return map[status] || 'bar-default';
}

const TL_CELL_W = 36;  // px per month column
const TL_MONTHS = 96;  // Jan 2025 – Dec 2032

function renderTimeline() {
  activeView = 'timeline';
  const pane = document.getElementById('main-pane');

  const now = new Date();
  const todayIdx = Math.min(TL_MONTHS - 1, Math.max(0, (now.getFullYear() - 2025) * 12 + now.getMonth()));

  // FY rows: Jul-Jun fiscal year; timeline starts Jan 2025 (mid FY 24-25)
  const fyRows = [{ label: 'FY 24-25', start: 0, span: 6 }];
  for (let fy = 25, s = 6; s < TL_MONTHS; fy++, s += 12) {
    fyRows.push({ label: `FY ${fy}-${fy + 1}`, start: s, span: Math.min(12, TL_MONTHS - s) });
  }

  // Quarter rows: Jan 2025 = Q3 in a Jul-Jun FY; pattern repeats Q3,Q4,Q1,Q2
  const qtrLabels = ['Q3', 'Q4', 'Q1', 'Q2'];
  const qtrRows = [];
  for (let i = 0; i < TL_MONTHS; i += 3) {
    qtrRows.push({ label: qtrLabels[Math.floor(i / 3) % 4], start: i, span: Math.min(3, TL_MONTHS - i) });
  }

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const months = [];
  for (let i = 0; i < TL_MONTHS; i++) months.push(monthNames[i % 12]);

  function isAltCol(idx) { return Math.floor(idx / 3) % 2 === 0; }

  const yearDefs = [];
  for (let y = 0; y * 12 < TL_MONTHS; y++) {
    yearDefs.push({ label: String(2025 + y), start: y * 12, span: Math.min(12, TL_MONTHS - y * 12) });
  }
  const yearHtml = yearDefs.map(y => {
    const todayCls = (todayIdx >= y.start && todayIdx < y.start + y.span) ? ' mc-today' : '';
    return `<th class="year-cell${todayCls}" colspan="${y.span}">${y.label}</th>`;
  }).join('');
  const fyHtml = fyRows.map(fy => {
    const todayCls = (todayIdx >= fy.start && todayIdx < fy.start + fy.span) ? ' mc-today' : '';
    return `<th class="fy-cell${todayCls}" colspan="${fy.span}">${fy.label}</th>`;
  }).join('');
  const qtrHtml = qtrRows.map(q => {
    const todayCls = (todayIdx >= q.start && todayIdx < q.start + q.span) ? ' mc-today' : '';
    return `<th class="qtr-cell${todayCls}" colspan="${q.span}">${q.label}</th>`;
  }).join('');
  const monthHtml = months.map((m, i) => {
    const cls = ['mc'];
    if (i === todayIdx) cls.push('mc-today');
    else if (isAltCol(i)) cls.push('mc-alt');
    return `<th class="${cls.join(' ')}" style="font-size:10px;font-weight:${i === todayIdx ? 800 : 500};color:${i === todayIdx ? 'var(--accent)' : 'var(--gray-600)'};text-align:center;">${m}</th>`;
  }).join('');

  // ---- Row builder helpers ----

  function buildNormalCells(barStart, barEnd, hasEndDate, barCls) {
    return months.map((_, i) => {
      const cls = ['mc'];
      if (i === todayIdx) cls.push('mc-today');
      else if (isAltCol(i)) cls.push('mc-alt');
      let barHtml = '';
      if (barStart !== null && i >= barStart && i <= barEnd) {
        const isFirst = i === barStart, isLast = i === barEnd;
        const ic = ['bar-inner', barCls];
        if (isFirst && isLast) ic.push('bar-single');
        else if (isFirst) ic.push('bar-s');
        else if (isLast && hasEndDate) ic.push('bar-e');
        barHtml = `<div class="${ic.join(' ')}"></div>`;
      }
      return `<td class="${cls.join(' ')}">${barHtml}</td>`;
    }).join('');
  }

  function buildEditCell(id, type, pid, startDate, endDate, barCls, isMilestone) {
    const bgDivs = months.map((_, i) => {
      let bg = '';
      if (i === todayIdx) bg = 'background:rgba(37,99,235,.05);';
      else if (isAltCol(i)) bg = 'background:var(--gray-50);';
      return `<div class="tl-mbg" style="${bg}"></div>`;
    }).join('');

    let barHtml = '';
    if (startDate) {
      const startPx = tlDateToPx(startDate);
      if (startPx !== null) {
        let endPx;
        if (endDate) {
          const ep = tlDateToPx(endDate);
          endPx = ep !== null ? ep + TL_CELL_W : (todayIdx + 1) * TL_CELL_W;
        } else {
          endPx = (todayIdx + 1) * TL_CELL_W;
        }
        const w = Math.max(endPx - startPx, 8);
        const msClass = isMilestone ? ' tl-bar-ms' : '';
        barHtml = `
          <div class="tl-drag-bar ${barCls}${msClass}"
               data-id="${escAttr(id)}" data-type="${type}" data-pid="${escAttr(pid)}"
               data-start="${escAttr(startDate)}" data-end="${escAttr(endDate || '')}"
               style="left:${startPx.toFixed(1)}px;width:${w.toFixed(1)}px;">
            <div class="tl-rh tl-rh-l"></div>
            <div class="tl-dc"></div>
            <div class="tl-rh tl-rh-r"></div>
          </div>`;
      }
    }
    return `<td class="tl-months-td" colspan="${TL_MONTHS}"><div class="tl-months-bg">${bgDivs}</div>${barHtml}</td>`;
  }

  // ---- Build rows ----

  const tlProjects = filterSortTlProjects();
  const rowsHtml = tlProjects.map(p => {
    const startIdx = dateToMonthIdx(p.startDate);
    const endDateIdx = dateToMonthIdx(p.endDate);
    let barStart = null, barEnd = null, hasEndDate = false;
    if (startIdx !== null && startIdx <= TL_MONTHS - 1) {
      barStart = Math.max(0, startIdx);
      if (endDateIdx !== null) { barEnd = Math.min(TL_MONTHS - 1, endDateIdx); hasEndDate = true; }
      else { barEnd = Math.min(TL_MONTHS - 1, todayIdx); }
      if (barEnd < barStart) barEnd = barStart;
    }
    const barCls = statusBarClass(p.status);
    const hasMilestones = (p.milestones || []).length > 0;
    const expanded = expandedTimelineProjects.has(p.id);

    const projectCells = timelineEditMode
      ? buildEditCell(p.id, 'project', p.id, p.startDate, p.endDate, barCls, false)
      : buildNormalCells(barStart, barEnd, hasEndDate, barCls);

    const msRows = (p.milestones || []).map(m => {
      const msStartIdx = dateToMonthIdx(m.startDate);
      const msEndIdx = dateToMonthIdx(m.endDate);
      let msBarStart = null, msBarEnd = null, msHasEnd = false;
      if (msStartIdx !== null && msStartIdx <= TL_MONTHS - 1) {
        msBarStart = Math.max(0, msStartIdx);
        if (msEndIdx !== null) { msBarEnd = Math.min(TL_MONTHS - 1, msEndIdx); msHasEnd = true; }
        else { msBarEnd = Math.min(TL_MONTHS - 1, todayIdx); }
        if (msBarEnd < msBarStart) msBarEnd = msBarStart;
      }
      const msCls = statusBarClass(m.status || p.status);
      const msCells = timelineEditMode
        ? buildEditCell(m.id, 'milestone', p.id, m.startDate, m.endDate, msCls, true)
        : (() => {
            const c = months.map((_, i) => {
              const cls = ['mc'];
              if (i === todayIdx) cls.push('mc-today');
              else if (isAltCol(i)) cls.push('mc-alt');
              let bh = '';
              if (msBarStart !== null && i >= msBarStart && i <= msBarEnd) {
                const isFirst = i === msBarStart, isLast = i === msBarEnd;
                const ic = ['bar-inner', 'bar-ms', msCls];
                if (isFirst && isLast) ic.push('bar-single');
                else if (isFirst) ic.push('bar-s');
                else if (isLast && msHasEnd) ic.push('bar-e');
                bh = `<div class="${ic.join(' ')}"></div>`;
              }
              return `<td class="${cls.join(' ')}">${bh}</td>`;
            }).join('');
            return c;
          })();

      return `
        <tr class="ms-row${expanded ? '' : ' ms-hidden'}" data-project="${escAttr(p.id)}">
          <td class="timeline-name-col ms-indent">
            <div class="tl-name-wrap">
              <span class="ms-name">${escHtml(m.name)}</span>
              ${m.status ? `<span class="badge ${badgeClass(m.status)} badge-tl">${escHtml(m.status)}</span>` : ''}
            </div>
          </td>
          ${msCells}
        </tr>`;
    }).join('');

    return `
      <tr class="tl-row" data-id="${escAttr(p.id)}">
        <td class="timeline-name-col">
          <div class="tl-name-wrap">
            ${hasMilestones ? `<button class="ms-toggle" data-id="${escAttr(p.id)}">${expanded ? '▼' : '▶'}</button>` : ''}
            <span class="tl-name" title="${escAttr(p.name)}">${escHtml(p.name)}</span>
            <span class="badge ${badgeClass(p.status)} badge-tl">${escHtml(p.status)}</span>
          </div>
        </td>
        ${projectCells}
      </tr>
      ${msRows}`;
  }).join('');

  const emptyRow = !tlProjects.length
    ? `<tr><td colspan="${TL_MONTHS + 1}" style="padding:40px;text-align:center;color:var(--gray-400);font-style:italic;">${projects.length ? 'No projects match your filters.' : 'No projects yet.'}</td></tr>`
    : '';

  const customFieldDefs = settings.customFieldDefinitions || [];
  const tlCfFilters = tlFilters.customFields || {};

  pane.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <h1 style="font-size:20px;font-weight:800;color:var(--gray-800);">Timeline</h1>
      <button id="btn-tl-edit" class="gear-btn${timelineEditMode ? ' active' : ''}" title="Toggle drag-edit mode">&#9881; ${timelineEditMode ? 'Editing' : 'Edit'}</button>
      <button id="btn-tl-filter-toggle" class="btn btn-ghost btn-sm">${tlFilterBarOpen ? '▲ Filters' : '▼ Filters'}</button>
      ${timelineEditMode ? '<span style="font-size:12px;color:var(--gray-400);">Drag bars to shift &middot; drag edges to resize &middot; snaps to week</span>' : ''}
    </div>
    <div class="tl-filter-bar" id="tl-filter-bar" style="${tlFilterBarOpen ? '' : 'display:none;'}">
      <select id="tl-f-status" title="Filter by status">
        <option value="">All Statuses</option>
        ${(settings.statusOptions || []).map(o =>
          `<option value="${escAttr(o)}" ${tlFilters.status === o ? 'selected' : ''}>${escHtml(o)}</option>`
        ).join('')}
      </select>
      <input type="text" id="tl-f-team" placeholder="Team member…" value="${escAttr(tlFilters.team || '')}" style="width:130px;" title="Filter by team member" />
      ${customFieldDefs.filter(f => f.type === 'select').map(f => `
        <select id="tl-f-cf-${escAttr(f.name)}" data-cf="${escAttr(f.name)}" title="Filter by ${escHtml(f.label)}" class="tl-f-cf">
          <option value="">All ${escHtml(f.label)}s</option>
          ${(f.options || []).map(o =>
            `<option value="${escAttr(o)}" ${(tlCfFilters[f.name] || '') === o ? 'selected' : ''}>${escHtml(o)}</option>`
          ).join('')}
        </select>
      `).join('')}
      <select id="tl-sort-col" title="Sort by">
        <option value="">Sort by…</option>
        <option value="name" ${tlSort.col === 'name' ? 'selected' : ''}>Name</option>
        <option value="status" ${tlSort.col === 'status' ? 'selected' : ''}>Status</option>
        <option value="startDate" ${tlSort.col === 'startDate' ? 'selected' : ''}>Start Date</option>
        <option value="team" ${tlSort.col === 'team' ? 'selected' : ''}>Team</option>
        ${customFieldDefs.map(f =>
          `<option value="cf_${escAttr(f.name)}" ${tlSort.col === 'cf_'+f.name ? 'selected' : ''}>${escHtml(f.label)}</option>`
        ).join('')}
      </select>
      <button id="tl-sort-dir" class="btn btn-ghost btn-sm" title="Toggle sort direction">${tlSort.dir === 'asc' ? '↑ Asc' : '↓ Desc'}</button>
      <button id="tl-filter-clear" class="btn btn-ghost btn-sm">Clear</button>
    </div>
    <div class="timeline-scroll${timelineEditMode ? ' tl-edit-active' : ''}">
      <table class="timeline-table" style="width:${200 + TL_MONTHS * TL_CELL_W}px">
        <thead>
          <tr>
            <th class="timeline-name-col" rowspan="4" style="font-size:12px;font-weight:700;color:var(--gray-600);text-align:left;padding:8px 12px;">Project</th>
            ${yearHtml}
          </tr>
          <tr>${fyHtml}</tr>
          <tr>${qtrHtml}</tr>
          <tr>${monthHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${emptyRow}
        </tbody>
      </table>
    </div>
    <div class="timeline-legend">
      Today's column is highlighted in blue.
      Bars extend from Start Date to End Date (or today if no End Date set).
    </div>
  `;

  document.getElementById('btn-tl-edit').addEventListener('click', () => {
    timelineEditMode = !timelineEditMode;
    renderTimeline();
  });

  // Name column click navigates to project (not whole row)
  pane.querySelectorAll('.tl-row[data-id] .timeline-name-col').forEach(nameCol => {
    nameCol.addEventListener('click', e => {
      if (e.target.closest('.ms-toggle')) return;
      selectProject(nameCol.closest('.tl-row').dataset.id);
    });
  });

  // Filter bar toggle
  pane.querySelector('#btn-tl-filter-toggle').addEventListener('click', () => {
    tlFilterBarOpen = !tlFilterBarOpen;
    const bar = pane.querySelector('#tl-filter-bar');
    const btn = pane.querySelector('#btn-tl-filter-toggle');
    bar.style.display = tlFilterBarOpen ? '' : 'none';
    btn.textContent = tlFilterBarOpen ? '▲ Filters' : '▼ Filters';
  });

  // Filter/sort wiring
  pane.querySelector('#tl-f-status').addEventListener('change', e => {
    tlFilters.status = e.target.value; renderTimeline();
  });
  pane.querySelector('#tl-f-team').addEventListener('input', e => {
    tlFilters.team = e.target.value;
    renderTimeline();
    const el = document.getElementById('tl-f-team');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });
  pane.querySelectorAll('.tl-f-cf').forEach(sel => {
    sel.addEventListener('change', () => {
      if (!tlFilters.customFields) tlFilters.customFields = {};
      tlFilters.customFields[sel.dataset.cf] = sel.value;
      renderTimeline();
    });
  });
  pane.querySelector('#tl-sort-col').addEventListener('change', e => {
    tlSort.col = e.target.value; renderTimeline();
  });
  pane.querySelector('#tl-sort-dir').addEventListener('click', () => {
    tlSort.dir = tlSort.dir === 'asc' ? 'desc' : 'asc'; renderTimeline();
  });
  pane.querySelector('#tl-filter-clear').addEventListener('click', () => {
    tlFilters = {}; tlSort = { col: null, dir: 'asc' }; renderTimeline();
  });

  pane.querySelectorAll('.ms-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const wasExpanded = expandedTimelineProjects.has(id);
      if (wasExpanded) expandedTimelineProjects.delete(id);
      else expandedTimelineProjects.add(id);
      pane.querySelectorAll(`.ms-row[data-project="${id}"]`).forEach(r => r.classList.toggle('ms-hidden'));
      btn.textContent = wasExpanded ? '▶' : '▼';
    });
  });

  if (timelineEditMode) {
    pane.addEventListener('mousedown', onTlBarMousedown);
  }
}

/* ---- Timeline filter/sort ---- */

function filterSortTlProjects() {
  let result = projects.filter(p => !p.hideFromTimeline);

  if (tlFilters.status) {
    result = result.filter(p => p.status === tlFilters.status);
  }
  if (tlFilters.team) {
    const t = tlFilters.team.toLowerCase();
    result = result.filter(p => (p.team || []).some(m => m.toLowerCase().includes(t)));
  }
  if (tlFilters.customFields) {
    Object.entries(tlFilters.customFields).forEach(([name, val]) => {
      if (val) result = result.filter(p => (p.customFields || {})[name] === val);
    });
  }

  if (tlSort.col) {
    result = [...result].sort((a, b) => {
      let av, bv;
      if (tlSort.col.startsWith('cf_')) {
        const cfName = tlSort.col.slice(3);
        av = (a.customFields || {})[cfName] || '';
        bv = (b.customFields || {})[cfName] || '';
      } else if (tlSort.col === 'team') {
        av = (a.team || []).join(', ');
        bv = (b.team || []).join(', ');
      } else {
        av = a[tlSort.col] || '';
        bv = b[tlSort.col] || '';
      }
      return tlSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  return result;
}

/* ---- Timeline drag ---- */

function tlDateToPx(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3 || !parts[0]) return null;
  const [y, m, d] = parts;
  const monthIdx = (y - 2025) * 12 + (m - 1);
  if (monthIdx < 0 || monthIdx > TL_MONTHS - 1) return null;
  const dim = new Date(y, m, 0).getDate();
  return (monthIdx + (d - 1) / dim) * TL_CELL_W;
}

function tlPxToDate(px) {
  const total = Math.max(0, Math.min(TL_MONTHS - 0.001, px / TL_CELL_W));
  const monthIdx = Math.floor(total);
  const frac = total - monthIdx;
  const y = 2025 + Math.floor(monthIdx / 12);
  const m = (monthIdx % 12) + 1;
  const dim = new Date(y, m, 0).getDate();
  const d = Math.max(1, Math.min(dim, Math.round(frac * dim) + 1));
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function tlSnapToWeek(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  const anchor = new Date('2025-01-06T00:00:00'); // Monday
  const diffDays = (d - anchor) / 86400000;
  const snapped = new Date(anchor);
  snapped.setDate(snapped.getDate() + Math.round(diffDays / 7) * 7);
  return snapped.toISOString().split('T')[0];
}

function tlAddDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Math.round(days));
  if (d < new Date('2025-01-01')) return '2025-01-01';
  if (d > new Date('2032-12-31')) return '2032-12-31';
  return d.toISOString().split('T')[0];
}

function tlDaysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function onTlBarMousedown(e) {
  const bar = e.target.closest('.tl-drag-bar');
  if (!bar) return;
  const isLeft  = e.target.classList.contains('tl-rh-l');
  const isRight = e.target.classList.contains('tl-rh-r');
  const action  = isLeft ? 'resize-left' : isRight ? 'resize-right' : 'move';

  tlDragState = {
    action,
    bar,
    id:         bar.dataset.id,
    type:       bar.dataset.type,
    pid:        bar.dataset.pid,
    origStart:  bar.dataset.start,
    origEnd:    bar.dataset.end,
    startX:     e.clientX,
    origLeft:   parseFloat(bar.style.left)  || 0,
    origWidth:  parseFloat(bar.style.width) || TL_CELL_W,
    currentStart: bar.dataset.start,
    currentEnd:   bar.dataset.end
  };

  document.addEventListener('mousemove', onTlBarMousemove);
  document.addEventListener('mouseup',   onTlBarMouseup);
  e.preventDefault();
}

function onTlBarMousemove(e) {
  if (!tlDragState) return;
  const { action, origStart, origEnd, origLeft, origWidth } = tlDragState;
  const dx = e.clientX - tlDragState.startX;
  const deltaDays = dx / TL_CELL_W * 30.4375;

  let newLeft  = origLeft;
  let newWidth = origWidth;
  let newStart = origStart;
  let newEnd   = origEnd;

  if (action === 'move') {
    newStart = tlSnapToWeek(tlAddDays(origStart, deltaDays));
    const actualDelta = tlDaysBetween(origStart, newStart);
    newEnd = origEnd ? tlAddDays(origEnd, actualDelta) : origEnd;

    const snapPx = tlDateToPx(newStart);
    if (snapPx !== null) {
      newLeft = snapPx;
      if (origEnd) {
        const ep = tlDateToPx(newEnd);
        newWidth = ep !== null ? Math.max(ep + TL_CELL_W - newLeft, 8) : origWidth;
      }
    } else {
      newLeft = origLeft + dx;
    }

  } else if (action === 'resize-left') {
    newStart = tlSnapToWeek(tlAddDays(origStart, deltaDays));
    const snapPx = tlDateToPx(newStart);
    if (snapPx !== null) {
      const endEdge = origEnd ? (tlDateToPx(origEnd) || origLeft + origWidth - TL_CELL_W) + TL_CELL_W : origLeft + origWidth;
      newLeft  = Math.min(snapPx, endEdge - 8);
      newWidth = Math.max(endEdge - newLeft, 8);
    } else {
      newLeft  = Math.min(origLeft + dx, origLeft + origWidth - 8);
      newWidth = Math.max(origWidth - dx, 8);
    }

  } else { // resize-right
    const baseEnd = origEnd || tlPxToDate(origLeft + origWidth - TL_CELL_W);
    newEnd = tlSnapToWeek(tlAddDays(baseEnd, deltaDays));
    const ep = tlDateToPx(newEnd);
    newWidth = ep !== null ? Math.max(ep + TL_CELL_W - origLeft, 8) : Math.max(origWidth + dx, 8);
  }

  tlDragState.bar.style.left  = `${newLeft.toFixed(1)}px`;
  tlDragState.bar.style.width = `${newWidth.toFixed(1)}px`;
  tlDragState.currentStart = newStart;
  tlDragState.currentEnd   = newEnd;
}

async function onTlBarMouseup() {
  document.removeEventListener('mousemove', onTlBarMousemove);
  document.removeEventListener('mouseup',   onTlBarMouseup);
  if (!tlDragState) return;

  const state = tlDragState;
  tlDragState = null;
  if (state.currentStart === state.origStart && state.currentEnd === state.origEnd) return;

  const { id, type, pid, currentStart, currentEnd, origEnd, action } = state;

  if (type === 'project') {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    const body = { startDate: currentStart };
    if (origEnd || action === 'resize-right') body.endDate = currentEnd;
    const updated = await api('PUT', `/api/projects/${id}`, body);
    Object.assign(p, { startDate: updated.startDate, endDate: updated.endDate });
    if (activeProject && activeProject.id === id) {
      activeProject.startDate = updated.startDate;
      activeProject.endDate   = updated.endDate;
    }
  } else {
    const p = projects.find(x => x.id === pid);
    if (!p) return;
    const m = (p.milestones || []).find(x => x.id === id);
    if (!m) return;
    const body = { name: m.name, startDate: currentStart, status: m.status };
    if (origEnd || action === 'resize-right') body.endDate = currentEnd;
    else body.endDate = m.endDate;
    const updated = await api('PUT', `/api/projects/${pid}/milestones/${id}`, body);
    const idx = p.milestones.findIndex(x => x.id === id);
    if (idx !== -1) p.milestones[idx] = updated;
    if (activeProject && activeProject.id === pid) {
      const ai = (activeProject.milestones || []).findIndex(x => x.id === id);
      if (ai !== -1) activeProject.milestones[ai] = updated;
    }
  }
  showToast('Dates updated');
}

/* ---- Helpers ---- */
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
    'Planning':  'badge-planning',
    'Active':    'badge-active',
    'On Hold':   'badge-on-hold',
    'Completed': 'badge-completed',
    'Cancelled': 'badge-cancelled'
  };
  return map[status] || 'badge-default';
}

function statusDotClass(status) {
  const map = {
    'Planning':  'dot-planning',
    'Active':    'dot-active',
    'On Hold':   'dot-on-hold',
    'Completed': 'dot-completed',
    'Cancelled': 'dot-cancelled'
  };
  return map[status] || 'dot-default';
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
