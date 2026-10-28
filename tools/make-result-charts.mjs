// Usage: node tools/make-result-charts.mjs "<results CSV>" <Name> <output prefix>
// Writes "<prefix> summary by disparity.csv", <prefix>-chart.html and <prefix>-table.html. To get PNGs, open each
// .html in Chrome, or run Chrome headless: --headless=new --force-device-scale-factor=2 --window-size=1200,675 --screenshot=<file>.png <file>.html
// From a results CSV: a per-disparity summary CSV, a slide chart page and a slide table page.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const RDS = createRequire(import.meta.url)('../rds.js');
const [,, csvPath, name, outPrefix] = process.argv;
const lines = readFileSync(csvPath, 'utf8').trim().split('\n');
const columns = lines[0].split(',');
const rows = lines.slice(1).map(l => { const v = JSON.parse('[' + l + ']'); const r = Object.fromEntries(columns.map((c, i) => [c, v[i]])); r.disparity = Number(r.disparity); r.arcsec = Number(r.arcsec); r.correct = r.correct === true || r.correct === 'true'; return r; });
const levels = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 21];
const plan = c => RDS.buildTrials({seed: '20261026', condition: c, levels, reps: 3, catchTrials: 6});
const sum = {glasses: RDS.summarize(rows.filter(r => r.condition === 'glasses'), plan('glasses')), control: RDS.summarize(rows.filter(r => r.condition === 'control'), plan('control'))};
const lvl = (c, d) => sum[c].levels.find(l => l.disparity === d);
// Exact visual angle of each level on this screen (15.3-inch 2880 x 1864 at 50 cm), not the CSV's rounded value.
const pitch = RDS.pixelPitchCm(15.3, 2880, 1864), arc = d => RDS.visualAngle(d * pitch, 50);
const pct = l => l.n ? Math.round(100 * l.correct / l.n) : null;
const fmt1 = x => x.toFixed(1);
const th = sum.glasses.threshold, lowest = th && th.disparity === levels[0];
const thText = th ? `${lowest ? '≤ ' : ''}${th.disparity} px (${lowest ? '≤ ' : ''}${fmt1(arc(th.disparity))}″)` : 'none';

// Summary CSV
const csv = [['disparity_px', 'disparity_arcsec', 'glasses_correct', 'glasses_trials', 'glasses_pct', 'glasses_said_shape', 'control_correct', 'control_trials', 'control_pct', 'control_said_shape'].join(',')];
for (const d of [0, ...levels]) { const g = lvl('glasses', d), c = lvl('control', d); csv.push([d === 0 ? 'no shape' : d, d === 0 ? '' : fmt1(arc(d)), g.correct, g.n, pct(g), g.saw, c.correct, c.n, pct(c), c.saw].join(',')); }
writeFileSync(`${outPrefix} summary by disparity.csv`, csv.join('\n') + '\n');

// Chart
const W = 1200, H = 675, L = 92, R = 210, T = 150, B = 104;
const lx = a => L + (Math.log10(a) - Math.log10(40)) / (Math.log10(1100) - Math.log10(40)) * (W - L - R);
const y = p => T + (1 - p / 100) * (H - T - B);
const series = [['glasses', 'With glasses', 'var(--s1)'], ['control', 'Without glasses', 'var(--s2)']];
const grid = [0, 25, 50, 75, 100].map(p => `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${L - 14}" y="${y(p) + 5}" class="tick" text-anchor="end">${p}%</text>`).join('');
const xticks = levels.map(d => { const a = arc(d); return `<line x1="${lx(a)}" x2="${lx(a)}" y1="${H - B}" y2="${H - B + 6}" class="axis"/><text x="${lx(a)}" y="${H - B + 26}" class="tick" text-anchor="middle">${Math.round(a)}</text>`; }).join('');
const lines2 = series.map(([c, label, color]) => {
  const pts = levels.map(d => [lx(arc(d)), y(pct(lvl(c, d)))]);
  const end = pts.at(-1);
  return `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
    pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="5.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`).join('') +
    `<text x="${W - R + 12}" y="${end[1] + 6}" class="direct">${label}</text>`;
}).join('');
// Selective value labels: glasses points below 100%, control points above 0%.
const notes = levels.flatMap(d => { const out = []; const g = lvl('glasses', d), c = lvl('control', d), a = arc(d);
  if (pct(g) < 100) out.push(`<text x="${lx(a) + 12}" y="${y(pct(g)) + 22}" class="value">${pct(g)}%</text>`);
  if (pct(c) > 0) out.push(`<text x="${lx(a)}" y="${y(pct(c)) - 14}" class="value" text-anchor="middle">${pct(c)}%</text>`);
  return out; }).join('');
const thMark = th ? `<line x1="${lx(arc(th.disparity))}" x2="${lx(arc(th.disparity))}" y1="${T - 6}" y2="${H - B}" class="threshold"/><text x="${lx(arc(th.disparity)) + 10}" y="${y(45)}" class="thlabel">Threshold</text><text x="${lx(arc(th.disparity)) + 10}" y="${y(45) + 22}" class="thlabel">${thText}</text>` : '';
const chart = `<!doctype html><html><head><meta charset="utf-8"><style>
:root { --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --muted: #8a8984; --grid: #e7e6e2; --s1: #2a78d6; --s2: #eb6834; }
html, body { margin: 0; background: var(--surface); }
body { width: ${W}px; height: ${H}px; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); }
svg { display: block; }
.title { font-size: 30px; font-weight: 650; letter-spacing: -0.4px; fill: var(--ink); }
.subtitle { font-size: 17px; fill: var(--ink2); }
.tick { font-size: 15px; fill: var(--ink2); font-variant-numeric: tabular-nums; }
.axis-title { font-size: 15px; fill: var(--ink2); }
.grid { stroke: var(--grid); stroke-width: 1; }
.axis { stroke: var(--muted); stroke-width: 1; }
.direct { font-size: 17px; font-weight: 600; fill: var(--ink); }
.value { font-size: 15px; font-weight: 600; fill: var(--ink2); }
.guess { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 5 5; }
.guesslabel { font-size: 14px; fill: var(--muted); }
.threshold { stroke: var(--ink2); stroke-width: 1.5; stroke-dasharray: 3 4; }
.thlabel { font-size: 15px; font-weight: 600; fill: var(--ink); }
.legend { font-size: 15px; fill: var(--ink2); }
</style></head><body><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${name}: percent of shapes named correctly at each disparity, with and without glasses">
<text x="${L - 40}" y="52" class="title">${name}: shapes named correctly at each disparity</text>
<text x="${L - 40}" y="84" class="subtitle">Red/cyan random dot stereograms · 3 trials per disparity · 15.3″ MacBook Air at 50 cm · threshold ${thText}</text>
<g transform="translate(${L - 40}, 108)"><circle cx="8" cy="0" r="6" fill="var(--s1)"/><text x="22" y="5" class="legend">With glasses</text><circle cx="148" cy="0" r="6" fill="var(--s2)"/><text x="162" y="5" class="legend">Without glasses (control)</text><line x1="380" x2="408" y1="0" y2="0" class="guess"/><text x="416" y="5" class="legend">Guessing (1 in 5 shapes)</text></g>
${grid}
<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="axis"/>
${xticks}
<text x="${(L + W - R) / 2}" y="${H - 28}" class="axis-title" text-anchor="middle">Disparity (arcsec, log scale): 1 to 21 screen pixels</text>
<line x1="${L}" x2="${W - R}" y1="${y(20)}" y2="${y(20)}" class="guess"/>
${thMark}
${lines2}
${notes}
</svg></body></html>`;
writeFileSync(`${outPrefix}-chart.html`, chart);

// Table
const trs = [0, ...levels].map(d => { const g = lvl('glasses', d), c = lvl('control', d);
  return `<tr${d === (th && th.disparity) ? ' class="th"' : ''}><td>${d === 0 ? 'No shape' : d + ' px'}</td><td class="n">${d === 0 ? '—' : fmt1(arc(d)) + '″'}</td><td class="n">${g.correct} / ${g.n}</td><td class="n">${pct(g)}%</td><td class="n">${c.correct} / ${c.n}</td><td class="n">${pct(c)}%</td></tr>`; }).join('');
const g = sum.glasses, c = sum.control;
const table = `<!doctype html><html><head><meta charset="utf-8"><style>
:root { --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --line: #e7e6e2; --s1: #2a78d6; --s2: #eb6834; }
html, body { margin: 0; background: var(--surface); }
body { width: 1200px; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); padding: 34px 52px 30px; box-sizing: border-box; }
h1 { font-size: 30px; font-weight: 650; letter-spacing: -0.4px; margin: 0 0 6px; }
p { font-size: 17px; color: var(--ink2); margin: 0 0 18px; }
table { border-collapse: collapse; width: 100%; font-size: 17px; font-variant-numeric: tabular-nums; }
th, td { padding: 7px 12px; border-bottom: 1px solid var(--line); text-align: left; }
th { font-size: 13px; letter-spacing: 0.6px; text-transform: uppercase; color: var(--ink2); font-weight: 650; }
thead tr:first-child th { border-bottom: 0; padding-bottom: 0; } th.group span { display: inline-block; width: 10px; height: 10px; border-radius: 5px; margin-right: 6px; }
td.n, th.n { text-align: right; }
tr.th td { font-weight: 650; background: #eef4fc; }
.foot { font-size: 15px; color: var(--ink2); margin: 14px 0 0; }
</style></head><body>
<h1>${name}: results by disparity</h1>
<p>Shapes named correctly on <b>${g.shapeCorrect} of ${g.shapeTrials}</b> trials with glasses (${Math.round(100 * g.shapeCorrect / g.shapeTrials)}%) and <b>${c.shapeCorrect} of ${c.shapeTrials}</b> without (${Math.round(100 * c.shapeCorrect / c.shapeTrials)}%). Threshold: <b>${thText}</b>${lowest ? ' (the smallest level tested)' : ''}.</p>
<table><thead>
<tr><th></th><th></th><th class="group n" colspan="2"><span style="background:var(--s1)"></span>With glasses</th><th class="group n" colspan="2"><span style="background:var(--s2)"></span>Without glasses</th></tr>
<tr><th>Disparity</th><th class="n">Arcsec</th><th class="n">Correct</th><th class="n">%</th><th class="n">Correct</th><th class="n">%</th></tr></thead>
<tbody>${trs}</tbody></table>
<div class="foot">"No shape" rows count saying "nothing" as correct. Threshold rule: the smallest disparity at which that level and every larger one was named correctly on at least 2 of 3 trials. Highlighted row: the threshold level. 15.3″ MacBook Air (2880 × 1864, 1440 × 932 mode), 50 cm, 46.7″ per pixel.</div>
</body></html>`;
writeFileSync(`${outPrefix}-table.html`, table);
console.log(name, 'threshold', thText, 'glasses', g.shapeCorrect + '/' + g.shapeTrials, 'control', c.shapeCorrect + '/' + c.shapeTrials, 'catch FA', g.catch.saw + '/' + g.catch.n);
