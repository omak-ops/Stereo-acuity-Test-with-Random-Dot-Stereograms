// Writes the five recipe images for the Inspect panel's default example (heart, 10 px, seed "example").
// Usage: node tools/export-recipe-images.mjs <output folder>
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {crc32, deflateSync} from 'node:zlib';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const RDS = createRequire(import.meta.url)('../rds.js');
const out = process.argv[2];
mkdirSync(out, {recursive: true});
const iccp = Buffer.concat([Buffer.from('Display P3\0\0', 'latin1'), deflateSync(readFileSync('/System/Library/ColorSync/Profiles/Display P3.icc'))]);
const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc32(body)); return Buffer.concat([l, body, c]); };
function png(rgba, w, h, gray) {
  const ch = gray ? 1 : 3, raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0, o = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (gray) raw[o++] = rgba[i]; else { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; } } }
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = gray ? 0 : 2;
  const dpi = Buffer.alloc(9); dpi.writeUInt32BE(5669, 0); dpi.writeUInt32BE(5669, 4); dpi[8] = 1;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), ...(gray ? [] : [chunk('iCCP', iccp)]), chunk('pHYs', dpi), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const st = RDS.stereogram({width: 1280, height: 960, margin: 32, diameter: 3, covered: 0.5, disparity: 10, offset: 0, shape: 'heart', size: 250, seed: 'example'});
const o = {background: 'black', redEye: 'left'};
writeFileSync(join(out, '1_shape_black-and-white.png'), png(RDS.grayscale(st.mask, 1280, 960), 1280, 960, true));
writeFileSync(join(out, '2_random-dot-pattern_black-and-white.png'), png(RDS.grayscale(st.left, 1280, 960), 1280, 960, true));
writeFileSync(join(out, '3_left-eye-image_red.png'), png(RDS.eyeImage(st, 'left', o), 1280, 960));
writeFileSync(join(out, '4_right-eye-image_cyan.png'), png(RDS.eyeImage(st, 'right', o), 1280, 960));
writeFileSync(join(out, '5_combined-stereogram_red-cyan.png'), png(RDS.anaglyph(st, o), 1280, 960));
writeFileSync(join(out, 'about-these-images.txt'), `Recipe images for one example stereogram, the same one the app's Inspect panel shows by default.
Shape: heart. Disparity: 10 px = 467 arcsec on a 15.3-inch 2880 x 1864 screen at 50 cm (1440 x 932 display mode).
In the right-eye image the shape is shifted 5 px left and the background 5 px right.
Dots: ${st.count} dots of 3 px, about 50% coverage, on a ${st.fieldWidth} x 960 field cropped to 1280 x 960. Dot seed: "example".
Red lens over the left eye, black background. Colour images are Display P3.
To see depth, view 5_combined at 1:1 (the app's View 1:1 button) with red/cyan glasses.
`);
console.log('dots', st.count);
