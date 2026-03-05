const THEMES = ['light', 'dark', 'synthwave'];
const THEME_META = {
  light:     { icon: '☀️', label: 'Light' },
  dark:      { icon: '🌙', label: 'Dark' },
  synthwave: { icon: '🎹', label: 'Synth' }
};

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('prodash-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    const m = THEME_META[theme];
    btn.textContent = m.icon + ' ' + m.label;
  }
}

function cycleTheme() {
  const cur = localStorage.getItem('prodash-theme') || 'light';
  applyTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
}

// Run immediately to prevent FOUC
applyTheme(localStorage.getItem('prodash-theme') || 'light');

document.addEventListener('DOMContentLoaded', () => {
  // Re-apply now that DOM is ready so button text reflects stored theme
  applyTheme(localStorage.getItem('prodash-theme') || 'light');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.addEventListener('click', cycleTheme);
});
