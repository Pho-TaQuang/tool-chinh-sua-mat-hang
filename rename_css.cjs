const fs = require('fs');
let c = fs.readFileSync('src/content/styles.css', 'utf8');
let t = fs.readFileSync('src/content/index.tsx', 'utf8');

const r = [
  ['sapo-float-launcher', 'spx-float-launcher'],
  ['sl-', 'spx-'],
  ['sync-progress-group', 'spx-sync-progress-group'],
  ['sync-progress-label', 'spx-sync-progress-label'],
  ['sync-item', 'spx-sync-item'],
  ['stat-card', 'spx-stat-card'],
  ['stat-icon-wrapper', 'spx-stat-icon-wrapper'],
  ['stat-info', 'spx-stat-info'],
  ['stat-label', 'spx-stat-label'],
  ['stat-value', 'spx-stat-value'],
  ['table-section', 'spx-table-section'],
  ['cards-header', 'spx-cards-header'],
  ['card-title', 'spx-card-title'],
  ['header-tools', 'spx-header-tools'],
  ['tool-btn', 'spx-tool-btn'],
  ['filter-btn', 'spx-filter-btn'],
  ['table-container', 'spx-table-container'],
  ['page-btn', 'spx-page-btn'],
  ['page-input-group', 'spx-page-input-group']
];

for (let [o, n] of r) {
  if (o === 'sl-') {
    c = c.replace(/sl-/g, n);
    t = t.replace(/sl-/g, n);
  } else {
    let re = new RegExp('\\b' + o + '\\b', 'g');
    c = c.replace(re, n);
    t = t.replace(re, n);
  }
}

// Map generic colors/tones classes carefully
const genericClasses = ['danger', 'warning', 'green', 'yellow', 'error', 'warn', 'info', 'idle', 'pending', 'processing', 'success', 'failed', 'skipped'];
for (const cls of genericClasses) {
  let re = new RegExp('\\b' + cls + '\\b', 'g');
  c = c.replace(re, 'spx-' + cls);
}

// In TSX, we specifically look for our class string templates and static assignments
t = t.replace(/{`spx-row-status \\${status\.tone}`}/g, '{`spx-row-status spx-${status.tone}`}');
t = t.replace(/{`spx-log-entry \\${log\.level}`}/g, '{`spx-log-entry spx-${log.level}`}');
t = t.replace(/"spx-icon-btn danger"/g, '"spx-icon-btn spx-danger"');
t = t.replace(/"spx-big-btn danger"/g, '"spx-big-btn spx-danger"');
t = t.replace(/"spx-big-btn warning"/g, '"spx-big-btn spx-warning"');
t = t.replace(/"spx-big-btn green"/g, '"spx-big-btn spx-green"');
// Fix any other possible places where "danger", "warning" might be hardcoded as classes
t = t.replace(/className="([^"]*\b)danger(\b[^"]*)"/g, 'className="$1spx-danger$2"');
t = t.replace(/className="([^"]*\b)warning(\b[^"]*)"/g, 'className="$1spx-warning$2"');
t = t.replace(/className="([^"]*\b)green(\b[^"]*)"/g, 'className="$1spx-green$2"');
t = t.replace(/className="([^"]*\b)idle(\b[^"]*)"/g, 'className="$1spx-idle$2"');
t = t.replace(/className="([^"]*\b)pending(\b[^"]*)"/g, 'className="$1spx-pending$2"');
t = t.replace(/className="([^"]*\b)processing(\b[^"]*)"/g, 'className="$1spx-processing$2"');
t = t.replace(/className="([^"]*\b)success(\b[^"]*)"/g, 'className="$1spx-success$2"');
t = t.replace(/className="([^"]*\b)failed(\b[^"]*)"/g, 'className="$1spx-failed$2"');
t = t.replace(/className="([^"]*\b)skipped(\b[^"]*)"/g, 'className="$1spx-skipped$2"');

fs.writeFileSync('src/content/styles.css', c);
fs.writeFileSync('src/content/index.tsx', t);

console.log('Renaming finished');
