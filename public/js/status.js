/* =============================
   ProDash – Status Page
   ============================= */

const STATUS_COLORS = {
  'Planning':    '#3B82F6',
  'Active':      '#22C55E',
  'On Hold':     '#EAB308',
  'Completed':   '#94A3B8',
  'Cancelled':   '#EF4444',
  'Not Started': '#CBD5E1'
};

const PALETTE = [
  '#6366F1','#EC4899','#14B8A6','#F59E0B',
  '#8B5CF6','#10B981','#F97316','#06B6D4',
  '#3B82F6','#22C55E','#EF4444','#84CC16'
];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartTheme() {
  return {
    text:   cssVar('--text')   || '#1E293B',
    grid:   cssVar('--border') || '#E2E8F0',
    subtext: cssVar('--gray-600') || '#64748B'
  };
}

async function init() {
  const projects = await fetch('/api/projects').then(r => r.json());
  renderStatCards(projects);
  renderStatusChart(projects);
  renderDivisionChart(projects);
  renderPMChart(projects);
}

/* ---- Summary cards ---- */
function renderStatCards(projects) {
  const total    = projects.length;
  const active   = projects.filter(p => p.status === 'Active').length;
  const onHold   = projects.filter(p => p.status === 'On Hold').length;
  const complete = projects.filter(p => p.status === 'Completed').length;

  document.getElementById('stat-cards').innerHTML = `
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
  `;
}

/* ---- Status doughnut ---- */
function renderStatusChart(projects) {
  const counts = {};
  projects.forEach(p => {
    const s = p.status || 'Unknown';
    counts[s] = (counts[s] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const data   = Object.values(counts);
  const colors = labels.map(l => STATUS_COLORS[l] || '#94A3B8');
  const { text } = chartTheme();

  document.querySelector('#chart-status').closest('.chart-body').style.height = '160px';
  new Chart(document.getElementById('chart-status'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: 'transparent',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: text, padding: 8, font: { size: 11 }, boxWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} project${ctx.parsed !== 1 ? 's' : ''}`
          }
        }
      }
    }
  });
}

/* ---- Division horizontal bar ---- */
function renderDivisionChart(projects) {
  const counts = {};
  projects.forEach(p => {
    const d = p.division || 'Unassigned';
    counts[d] = (counts[d] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const data   = sorted.map(e => e[1]);
  const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

  const wrap = document.getElementById('wrap-division');
  wrap.style.height = Math.max(130, labels.length * 28 + 40) + 'px';

  const { text, grid } = chartTheme();

  new Chart(document.getElementById('chart-division'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} project${ctx.parsed.x !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: text, stepSize: 1, precision: 0 },
          grid: { color: grid }
        },
        y: {
          ticks: { color: text },
          grid: { display: false }
        }
      }
    }
  });
}

/* ---- Project Manager horizontal bar ---- */
function renderPMChart(projects) {
  const counts = {};
  projects.forEach(p => {
    const pm = p.projectManager || 'Unassigned';
    counts[pm] = (counts[pm] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const data   = sorted.map(e => e[1]);
  const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

  const wrap = document.getElementById('wrap-pm');
  wrap.style.height = Math.max(130, labels.length * 28 + 40) + 'px';

  const { text, grid } = chartTheme();

  new Chart(document.getElementById('chart-pm'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} project${ctx.parsed.x !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: text, stepSize: 1, precision: 0 },
          grid: { color: grid }
        },
        y: {
          ticks: { color: text },
          grid: { display: false }
        }
      }
    }
  });
}

init();
