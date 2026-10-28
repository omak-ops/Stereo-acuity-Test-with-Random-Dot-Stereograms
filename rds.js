// Random dot stereograms, shared by experiment.html (in the browser) and tools/export-stimuli.mjs (in Node).
// Dot centres are drawn exactly as in Dot studio (index.html), so every dot field can be reopened there.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RDS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const ARCSEC_PER_RADIAN = 180 / Math.PI * 3600;
const DOT_STUDIO = 'https://kefangpsych.github.io/random-dot-generator/';

// Same seeded generator as index.html, with rejection sampling to avoid integer-range bias.
function randomSource(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let state = h >>> 0;
  const uint32 = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return (t ^ t >>> 14) >>> 0;
  };
  return max => {
    const limit = Math.floor(4294967296 / max) * max;
    let value;
    do { value = uint32(); } while (value >= limit);
    return value % max;
  };
}

function shuffle(items, randomInt) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// VA = 2 * arctan(size / (2 * distance)), in arcseconds.
const visualAngle = (sizeCm, distanceCm) => 2 * Math.atan(sizeCm / (2 * distanceCm)) * ARCSEC_PER_RADIAN;

// Pixel pitch from the screen's diagonal and native resolution.
const pixelPitchCm = (diagonalInches, nativeWidth, nativeHeight) => diagonalInches * 2.54 / Math.hypot(nativeWidth, nativeHeight);

// Shapes in unit coordinates, y pointing down. None is a square or rectangle.
const STAR = Array.from({length: 10}, (_, i) => {
  const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.5 : 1;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
});
function inPolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const SHAPE_TESTS = {
  circle: (x, y) => x * x + y * y <= 1,
  triangle: (x, y) => y <= 0.5 && Math.sqrt(3) * Math.abs(x) <= y + 1,
  star: (x, y) => inPolygon(STAR, x, y),
  heart: (x, y) => { const a = x * x + y * y - 1; return a * a * a + x * x * y * y * y <= 0; },
  cross: (x, y) => (Math.abs(x) <= 1 && Math.abs(y) <= 0.3) || (Math.abs(x) <= 0.3 && Math.abs(y) <= 1),
};
const SHAPES = Object.keys(SHAPE_TESTS);

// Each shape is centred on its bounding box and scaled to the area of a circle of radius `size`,
// so no shape is easier just because it is bigger.
const SHAPE_FRAMES = {};
for (const name of SHAPES) {
  const steps = 600, span = 3, cell = span / steps;
  let hits = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
    const x = -span / 2 + (i + .5) * cell, y = -span / 2 + (j + .5) * cell;
    if (!SHAPE_TESTS[name](x, y)) continue;
    hits++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  SHAPE_FRAMES[name] = {scale: Math.sqrt(Math.PI / (hits * cell * cell)), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2};
}

// (x, y) => true when the dot centred on pixel (x, y) is inside the shape.
function shapeTest(shape, centerX, centerY, size) {
  if (shape === 'none') return () => false;
  const test = SHAPE_TESTS[shape], {scale, cx, cy} = SHAPE_FRAMES[shape], unit = size * scale;
  return (x, y) => test((x + .5 - centerX) / unit + cx, (y + .5 - centerY) / unit + cy);
}

// Pixel offsets covered by one dot centred on a pixel, using the same diameter as Dot studio.
function dotFootprint(diameter) {
  const r = diameter / 2, reach = Math.ceil(r), offsets = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    if (dx * dx + dy * dy <= r * r) offsets.push([dx, dy]);
  }
  return offsets;
}

// Number of dots that leaves `covered` (0-1) of the field covered on average, allowing for overlaps.
const dotCount = (fieldWidth, height, diameter, covered) =>
  Math.round(-Math.log(1 - covered) * fieldWidth * height / dotFootprint(diameter).length);

// Dot centres in Dot studio's order: x then y, each uniform over the field's pixels.
function dotField(seed, width, height, count) {
  const randomInt = randomSource(seed), xs = new Int32Array(count), ys = new Int32Array(count);
  for (let i = 0; i < count; i++) { xs[i] = randomInt(width); ys[i] = randomInt(height); }
  return {xs, ys};
}

function dotStudioLink(seed, width, height, count, diameter) {
  if (width > 4096 || height > 4096 || count > 100000) return null;
  return DOT_STUDIO + '#' + new URLSearchParams({w: width, h: height, n: count, d: diameter, o: 100, bg: '000000', c: 'ffffff', s: seed});
}

// Builds one stereogram. The left-eye image is the base dot field. In the right-eye image the background
// moves right by disparity/2 and the shape left by disparity/2 (crossed, so the shape sits in front of
// the background), so red and cyan copies are offset by the same amount everywhere and look alike
// without glasses. `offset` moves both by the same amount (used for no-shape trials). Odd disparities
// need half-pixel shifts, drawn with half-intensity edge columns. Background dots the shape now hides
// are dropped, and background that only the right eye sees gets dots from an independent fill field.
// Images hold 0 (no dot), 1 (half-pixel edge) or 2 (dot).
function stereogram({width, height, margin, diameter, covered, disparity, offset = 0, shape, size, seed}) {
  const shapeShift = disparity / 2 + offset, backgroundShift = -disparity / 2 + offset;
  if (Math.max(Math.abs(shapeShift), Math.abs(backgroundShift)) + Math.ceil(diameter) > margin) throw new Error(`Half the disparity plus the dot diameter must be at most ${margin} px.`);
  const fieldWidth = width + 2 * margin;
  const count = dotCount(fieldWidth, height, diameter, covered);
  const base = dotField(seed, fieldWidth, height, count);
  const fill = dotField(seed + ':fill', fieldWidth, height, count);
  const inShape = shapeTest(shape, margin + width / 2 + shapeShift / 2, height / 2, size);
  const footprint = dotFootprint(diameter);
  const left = new Uint8Array(width * height), right = new Uint8Array(width * height), mask = new Uint8Array(width * height);
  const halves = new Uint8Array(2 * width * height);
  const stampLeft = (x, y) => {
    for (const [dx, dy] of footprint) {
      const px = x - margin + dx, py = y + dy;
      if (px >= 0 && px < width && py >= 0 && py < height) left[py * width + px] = 2;
    }
  };
  // The right eye is drawn on half-pixel columns, then each pair is summed into one pixel.
  const stampRight = (x, y, shift) => {
    for (const [dx, dy] of footprint) {
      const column = 2 * (x - margin + dx - shift), py = y + dy;
      if (py < 0 || py >= height) continue;
      for (const c of [column, column + 1]) if (c >= 0 && c < 2 * width) halves[py * 2 * width + c] = 1;
    }
  };
  for (let i = 0; i < count; i++) {
    const x = base.xs[i], y = base.ys[i];
    stampLeft(x, y);
    if (inShape(x, y)) stampRight(x, y, shapeShift);
    else if (!inShape(x + disparity, y)) stampRight(x, y, backgroundShift);
  }
  for (let i = 0; i < count; i++) {
    const x = fill.xs[i], y = fill.ys[i];
    if (inShape(x, y) && !inShape(x + disparity, y)) stampRight(x, y, backgroundShift);
  }
  for (let i = 0; i < right.length; i++) right[i] = halves[2 * i] + halves[2 * i + 1];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask[y * width + x] = inShape(x + margin, y) ? 2 : 0;
  return {
    width, height, fieldWidth, count, left, right, mask, shapeShift, backgroundShift,
    links: {base: dotStudioLink(seed, fieldWidth, height, count, diameter), fill: dotStudioLink(seed + ':fill', fieldWidth, height, count, diameter)},
  };
}

// sRGB values for 0, half and full dot intensity; the half value is 50% of the light, not 50% of the code.
const LEVELS = [0, 188, 255];

// Red/cyan anaglyph as RGBA. The eye behind the red lens sees only the red channel and the other eye
// only green + blue. On black its dots are lit in red; on white they are holes in the red channel.
function anaglyph(st, {background = 'black', redEye = 'left'} = {}) {
  const red = redEye === 'left' ? st.left : st.right, cyan = redEye === 'left' ? st.right : st.left;
  const out = new Uint8ClampedArray(st.width * st.height * 4), lit = background === 'black';
  for (let i = 0, j = 0; i < red.length; i++, j += 4) {
    out[j] = lit ? LEVELS[red[i]] : LEVELS[2 - red[i]];
    out[j + 1] = out[j + 2] = lit ? LEVELS[cyan[i]] : LEVELS[2 - cyan[i]];
    out[j + 3] = 255;
  }
  return out;
}

// One eye's image on its own, in the colour it has in the anaglyph (red for the red-lens eye, cyan for the other).
function eyeImage(st, eye, options) {
  const blank = new Uint8Array(st.left.length);
  return anaglyph(eye === 'left' ? {...st, right: blank} : {...st, left: blank}, options);
}

// Black-on-white RGBA view of one eye's dots or the shape mask.
function grayscale(image, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < image.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = LEVELS[2 - image[i]];
    out[j + 3] = 255;
  }
  return out;
}

// A randomised block of trials: every disparity `reps` times, each time with a different shape,
// plus no-shape catch trials. A catch trial's whole field sits where a shape trial's background would
// (offset by minus half a randomly chosen level), so it looks the same without glasses. Each trial gets
// its own dot seed.
function buildTrials({seed, condition, levels, reps, catchTrials}) {
  const randomInt = randomSource(`${seed}:${condition}:order`);
  const trials = [];
  for (const disparity of levels) {
    const picks = [];
    while (picks.length < reps) picks.push(...shuffle([...SHAPES], randomInt));
    for (let r = 0; r < reps; r++) trials.push({shape: picks[r], disparity, offset: 0});
  }
  for (let i = 0; i < catchTrials; i++) trials.push({shape: 'none', disparity: 0, offset: -levels[randomInt(levels.length)] / 2});
  shuffle(trials, randomInt);
  return trials.map((t, i) => ({...t, condition, trial: i + 1, seed: `${seed}-${condition}-${String(i + 1).padStart(2, '0')}`}));
}

// P(at least k successes in n trials) when each succeeds with probability p.
function binomialTail(k, n, p) {
  let term = (1 - p) ** n, total = k <= 0 ? term : 0;
  for (let i = 1; i <= n; i++) {
    term *= (n - i + 1) / i * p / (1 - p);
    if (i >= k) total += term;
  }
  return Math.min(1, total);
}

// Per-disparity scores against the planned trials. The threshold is the smallest disparity from which
// every larger level was identified on at least 2/3 of its trials; it needs a complete block. Shape
// identification is also tested against guessing (1 in 5 shapes).
function summarize(results, planned, chance = 1 / SHAPES.length) {
  const byLevel = new Map();
  for (const t of planned) {
    if (!byLevel.has(t.disparity)) byLevel.set(t.disparity, {disparity: t.disparity, arcsec: null, planned: 0, n: 0, correct: 0, saw: 0});
    byLevel.get(t.disparity).planned++;
  }
  for (const r of results) {
    const level = byLevel.get(r.disparity);
    if (!level) continue;
    level.arcsec = r.arcsec; level.n++; level.correct += r.correct ? 1 : 0; level.saw += r.response !== 'none' ? 1 : 0;
  }
  const levels = [...byLevel.values()].sort((a, b) => a.disparity - b.disparity);
  const shapeLevels = levels.filter(l => l.disparity > 0);
  const complete = results.length >= planned.length && levels.every(l => l.n >= l.planned);
  const passes = l => l.n > 0 && l.correct >= Math.ceil(2 / 3 * l.n - 1e-9);
  let threshold = null;
  if (complete) for (let i = shapeLevels.length - 1; i >= 0 && passes(shapeLevels[i]); i--) threshold = shapeLevels[i];
  const shapeTrials = shapeLevels.reduce((sum, l) => sum + l.n, 0), shapeCorrect = shapeLevels.reduce((sum, l) => sum + l.correct, 0);
  return {
    levels, catch: levels.find(l => l.disparity === 0) || null, complete, threshold,
    shapeTrials, shapeCorrect, chance, p: shapeTrials ? binomialTail(shapeCorrect, shapeTrials, chance) : 1,
  };
}

return {SHAPES, randomSource, visualAngle, pixelPitchCm, dotCount, dotFootprint, stereogram, anaglyph, eyeImage, grayscale, buildTrials, binomialTail, summarize};
});
