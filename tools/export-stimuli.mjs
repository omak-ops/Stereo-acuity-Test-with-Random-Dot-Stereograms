// Writes every stimulus of a stereo test session as PNG files, with a spec sheet and an answer key.
// Usage: node tools/export-stimuli.mjs ["<experiment.html link or #hash>"] [output folder]
// With no link it uses experiment.html's defaults. Needs Node 22 or later, no packages.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {crc32, deflateSync} from 'node:zlib';
import {join} from 'node:path';
import RDS from '../rds.js';

const MARGIN = 32;
const DEFAULTS = {p: '', diag: '15.3', nw: '2880', nh: '1864', dist: '50', bar: '', eye: 'left', bg: 'black', w: '1280', h: '960', d: '3', cov: '50', size: '250', lv: '1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 21', reps: '3', ct: '6', cr: '3', cc: '6', s: '20261026'};

const link = process.argv[2] || '';
const params = {...DEFAULTS, ...Object.fromEntries(new URLSearchParams(link.includes('#') ? link.slice(link.indexOf('#') + 1) : link))};
const s = {
  diagonal: Number(params.diag), nativeWidth: Number(params.nw), nativeHeight: Number(params.nh), distance: Number(params.dist), measured: params.bar,
  redEye: params.eye, background: params.bg, width: Number(params.w), height: Number(params.h), diameter: Number(params.d),
  covered: Number(params.cov) / 100, size: Number(params.size),
  levels: [...new Set(params.lv.split(/[\s,]+/).filter(Boolean).map(Number))].sort((a, b) => a - b),
  reps: Number(params.reps), catchTrials: Number(params.ct), controlReps: Number(params.cr), controlCatch: Number(params.cc), seed: params.s,
};
const out = process.argv[3] || join('stimuli', `seed-${s.seed.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

// Assumes the screen shows image pixels 1:1, as experiment.html asks for. A ruler measurement in the
// link is used only if it was taken in that 1:1 mode.
const oneToOneMode = `${s.nativeWidth}x${s.nativeHeight}`;
const pitch = s.measured !== '' && params.barat === oneToOneMode ? Number(s.measured) / 1000 : RDS.pixelPitchCm(s.diagonal, s.nativeWidth, s.nativeHeight);
const arcsec = px => RDS.visualAngle(px * pitch, s.distance);

// Minimal PNG encoder: 8-bit RGB (colorType 2) or grayscale (colorType 0), no filtering. The pHYs chunk
// marks the images as 144 dpi so Retina-aware viewers show one image pixel per screen pixel. Colour images
// carry the Display P3 profile (as experiment.html draws them), so a P3 Mac shows pure red and cyan.
const P3_PROFILE = '/System/Library/ColorSync/Profiles/Display P3.icc';
const iccp = existsSync(P3_PROFILE) ? Buffer.concat([Buffer.from('Display P3\0\0', 'latin1'), deflateSync(readFileSync(P3_PROFILE))]) : null;
if (!iccp) console.warn(`No ${P3_PROFILE}: colour PNGs will be untagged sRGB.`);
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(rgba, width, height, gray = false) {
  const channels = gray ? 1 : 3, raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0, o = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (gray) raw[o++] = rgba[i];
      else { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = gray ? 0 : 2;
  const density = Buffer.alloc(9);
  density.writeUInt32BE(5669, 0); density.writeUInt32BE(5669, 4); density[8] = 1;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...(iccp && !gray ? [chunk('iCCP', iccp)] : []), chunk('pHYs', density), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const blocks = {
  glasses: RDS.buildTrials({seed: s.seed, condition: 'glasses', levels: s.levels, reps: s.reps, catchTrials: s.catchTrials}),
  control: RDS.buildTrials({seed: s.seed, condition: 'control', levels: s.levels, reps: s.controlReps, catchTrials: s.controlCatch}),
  practice: RDS.buildTrials({seed: s.seed, condition: 'practice', levels: s.levels.slice(-3), reps: 1, catchTrials: 1}),
};

const specs = [];
for (const [condition, trials] of Object.entries(blocks)) {
  mkdirSync(join(out, condition, 'parts'), {recursive: true});
  for (const t of trials) {
    const st = RDS.stereogram({width: s.width, height: s.height, margin: MARGIN, diameter: s.diameter, covered: s.covered, disparity: t.disparity, offset: t.offset, shape: t.shape, size: s.size, seed: t.seed});
    const name = `trial-${String(t.trial).padStart(2, '0')}_${t.shape}_${t.disparity}px`;
    const files = {anaglyph: join(condition, `${name}.png`), left: join(condition, 'parts', `${name}_left.png`), right: join(condition, 'parts', `${name}_right.png`), leftColour: join(condition, 'parts', `${name}_left_${s.redEye === 'left' ? 'red' : 'cyan'}.png`), rightColour: join(condition, 'parts', `${name}_right_${s.redEye === 'left' ? 'cyan' : 'red'}.png`), mask: join(condition, 'parts', `${name}_shape.png`)};
    writeFileSync(join(out, files.anaglyph), png(RDS.anaglyph(st, s), st.width, st.height));
    writeFileSync(join(out, files.left), png(RDS.grayscale(st.left, st.width, st.height), st.width, st.height, true));
    writeFileSync(join(out, files.right), png(RDS.grayscale(st.right, st.width, st.height), st.width, st.height, true));
    writeFileSync(join(out, files.mask), png(RDS.grayscale(st.mask, st.width, st.height), st.width, st.height, true));
    writeFileSync(join(out, files.leftColour), png(RDS.eyeImage(st, 'left', s), st.width, st.height));
    writeFileSync(join(out, files.rightColour), png(RDS.eyeImage(st, 'right', s), st.width, st.height));
    specs.push({
      condition, trial: t.trial, shape: t.shape, disparity_px: t.disparity, disparity_arcsec: Math.round(arcsec(t.disparity) * 10) / 10,
      right_eye_shape_left_px: t.shape === 'none' ? '' : st.shapeShift, right_eye_background_right_px: -st.backgroundShift,
      dot_seed: t.seed, fill_seed: `${t.seed}:fill`,
      dots: st.count, dot_diameter_px: s.diameter, field: `${st.fieldWidth}x${st.height}`, field_crop_x: MARGIN, image: `${st.width}x${st.height}`,
      file: files.anaglyph, left: files.left, right: files.right, left_colour: files.leftColour, right_colour: files.rightColour, shape_mask: files.mask,
      dot_studio_base: st.links.base || '', dot_studio_fill: st.links.fill || '',
    });
    process.stdout.write(`\r${specs.length} stimuli`);
  }
}

const columns = Object.keys(specs[0]);
writeFileSync(join(out, 'specs.csv'), [columns.join(','), ...specs.map(r => columns.map(c => JSON.stringify(r[c])).join(','))].join('\n') + '\n');
writeFileSync(join(out, 'specs.json'), JSON.stringify({settings: {...s, margin: MARGIN, pixel_pitch_mm: pitch * 10, arcsec_per_px: arcsec(1), color_space: iccp ? 'display-p3' : 'srgb', assumes: `1 image px = 1 panel px (${s.nativeWidth / 2} x ${s.nativeHeight / 2} display mode on a Retina Mac)`}, stimuli: specs}, null, 2));

const esc = text => String(text).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const cards = condition => specs.filter(r => r.condition === condition).map(r => `<figure><a href="${esc(r.file)}"><img src="${esc(r.file)}" alt="" loading="lazy"></a><figcaption><b>${r.trial}. ${r.shape === 'none' ? 'no shape' : r.shape}</b> · ${r.disparity_px} px · ${r.disparity_arcsec}″<br>seed ${esc(r.dot_seed)} · ${r.dots.toLocaleString('en-US')} dots<br><a href="${esc(r.shape_mask)}">shape</a> · <a href="${esc(r.left)}">dots</a> · <a href="${esc(r.left_colour)}">left</a> · <a href="${esc(r.right_colour)}">right</a> · <a href="${esc(r.right)}">right B/W</a>${r.dot_studio_base ? ` · <a href="${esc(r.dot_studio_base)}">Dot studio</a>` : ''}</figcaption></figure>`).join('');
const levelRows = s.levels.map(px => `<tr><td>${px} px</td><td>${arcsec(px).toFixed(1)}</td><td>${(arcsec(px) / 60).toFixed(2)}</td></tr>`).join('');
writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stimuli — seed ${esc(s.seed)}</title>
<style>body{margin:0;padding:32px 40px;background:#fafbf6;color:#23392f;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}h1{font-size:28px;letter-spacing:-1px;margin:0 0 6px}h2{font-size:16px;margin:32px 0 12px}p{color:#68766d;max-width:820px}table{border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{padding:4px 14px 4px 0;text-align:left;border-bottom:1px solid #dde2d8}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}figure{margin:0;background:#fff;border:1px solid #dde2d8;border-radius:10px;padding:8px}img{width:100%;display:block;border-radius:4px}figcaption{font-size:11px;color:#68766d;margin-top:6px;word-break:break-all}a{color:#2b634b}.warn{color:#a33028;font-weight:600}</style></head><body>
<h1>Stereo test stimuli · seed ${esc(s.seed)}</h1>
<p class="warn">Answer key — experimenter only. Do not show this page to the participant.</p>
<p>${s.width} × ${s.height} px images for a ${s.diagonal}″ ${s.nativeWidth} × ${s.nativeHeight} screen at ${s.distance} cm: one pixel is ${(pitch * 10).toFixed(4)} mm = ${arcsec(1).toFixed(1)} arcsec. ${s.diameter} px dots covering ${Math.round(s.covered * 100)}% of the image, shapes with the area of a ${s.size} px-radius circle. In the right-eye image the shape moves left by half the disparity and the background right by half. Red lens over the ${s.redEye} eye, ${s.background} background. Colour images are tagged Display P3, the colour space experiment.html draws in.</p>
<p><b>Present the trials with experiment.html</b>, which draws each image pixel on exactly one screen pixel. Thumbnails here are scaled down. A PNG opened at 100% in a browser on a Retina Mac is shown at 2× and every disparity doubles; to preview one at 1:1 there, set browser zoom to 50%. The arcsec values assume the ${s.nativeWidth / 2} × ${s.nativeHeight / 2} display mode.</p>
<table><thead><tr><th>Disparity</th><th>arcsec</th><th>arcmin</th></tr></thead><tbody>${levelRows}</tbody></table>
<h2>Test with glasses (${blocks.glasses.length} trials, in presentation order)</h2><div class="grid">${cards('glasses')}</div>
<h2>Control without glasses (${blocks.control.length} trials)</h2><div class="grid">${cards('control')}</div>
<h2>Practice (${blocks.practice.length} trials)</h2><div class="grid">${cards('practice')}</div>
</body></html>
`);
console.log(`\nWrote ${specs.length} stimuli to ${out}`);
