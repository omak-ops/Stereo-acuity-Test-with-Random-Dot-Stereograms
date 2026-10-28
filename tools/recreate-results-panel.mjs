// Usage: node tools/recreate-results-panel.mjs experiment.html "<results CSV>" <Name> "<CSV file name to cite>" <output.html>
// Open the output in Chrome (or screenshot it headless at --window-size=900,2600) to see the app's Results panel for that CSV.
// Builds recreate-<name>.html: experiment.html showing only its Results panel, fed from a results CSV.
import {readFileSync, writeFileSync} from 'node:fs';
const [,, experiment, csvPath, label, source, out] = process.argv;
const lines = readFileSync(csvPath, 'utf8').trim().split('\n');
const columns = lines[0].split(',');
const rows = lines.slice(1).map(line => {
  const values = JSON.parse('[' + line + ']');
  const r = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  for (const k of ['trial', 'disparity', 'arcsec', 'offset', 'rt', 'distance_cm', 'pixel_mm', 'arcsec_per_px', 'dpr', 'dot_px', 'coverage_pct', 'shape_size_px']) r[k] = Number(r[k]);
  r.correct = r.correct === true || r.correct === 'true';
  r.one_to_one = r.one_to_one === true || r.one_to_one === 'true';
  r.participant = label;
  return r;
});
let html = readFileSync(experiment, 'utf8');
const style = `<style>
body.recreate header, body.recreate .intro, body.recreate #setup, body.recreate footer, body.recreate .workspace > div > section:not(#results), body.recreate #results .buttons { display: none !important; }
body.recreate main { max-width: 860px; padding: 24px 24px 8px; }
body.recreate .workspace { grid-template-columns: 1fr; }
body.recreate #results { margin-bottom: 8px; }
.recreated-note { font-size: 11px; color: #68766d; margin: 2px 0 0; }
</style>`;
html = html.replace('</head>', style + '</head>');
const inject = `
;(() => {
  const rows = ${JSON.stringify(rows)};
  results = {glasses: rows.filter(r => r.condition === 'glasses'), control: rows.filter(r => r.condition === 'control'), meta: {}};
  renderResults();
  document.body.classList.add('recreate');
  const note = document.createElement('p'); note.className = 'recreated-note';
  note.textContent = ${JSON.stringify('Recreated from ' + source + ' with the Stereo Test app\'s own results code.')};
  document.querySelector('#results .result-head').after(note);
})();
`;
const at = html.lastIndexOf('</script>');
html = html.slice(0, at) + inject + html.slice(at);
writeFileSync(out, html);
console.log(out, rows.length, 'rows');
