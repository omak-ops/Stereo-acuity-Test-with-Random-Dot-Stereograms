# Dot studio

A small web app for making random dot images. Set the canvas size, the dot diameter, how many dots (either a count or a percentage coverage of the image), the dot color and opacity, and a background color or transparency. Then download the result as a full-resolution PNG.

**Live app:** https://kefangpsych.github.io/random-dot-generator/

## How it works

- Each dot's center is drawn independently and uniformly from the canvas pixels, so dots can overlap and dots at the edges are cropped.
- **Coverage** is the dots' total area as a share of the image, ignoring overlaps: `count × π(d/2)² / (width × height)`. Because dots overlap at random, the share of the image actually covered is on average about `1 − e^(−coverage)`; the app shows this estimate.
- The **seed** makes patterns repeatable: the same settings and seed always give the same image.
- All settings are kept in the page URL, so **Copy link** shares the exact pattern.

Everything runs in the browser in a single `index.html` with no dependencies, and it works offline.

## Stereo test

`experiment.html` measures stereoacuity with red/cyan random dot stereograms (RDS). Enter the screen's diagonal, native resolution and viewing distance, and the page works out the visual angle of one pixel and of each disparity. It runs a randomised block of trials (every disparity three times with a different shape, plus trials with no shape), a practice block with feedback, and a control block without glasses. The experimenter types what the participant reports, and the page shows the threshold, a plot and a CSV download.

Disparities are whole screen pixels, so the screen has to show image pixels 1:1. On a Retina Mac, choose the scaled resolution that is exactly half the native one (for example 1440 × 932 on a 2880 × 1864 panel). The page checks this.

`rds.js` holds the generator and is shared with `tools/export-stimuli.mjs`, which writes every stimulus of a session as PNG files with a spec sheet:

```
node tools/export-stimuli.mjs "<experiment.html link>"
```

### Mac app

`tools/build-mac-app.sh` builds `dist/Stereo Test.app`, a native macOS app (Apple silicon and Intel, macOS 13 or later) that runs the stereo test in its own window with no browser or server. It needs the Xcode command line tools (`xcode-select --install`). Responses and settings are kept by the app between launches; **Download CSV** asks where to save the file.

The app has an ad-hoc signature and is not notarized, so another Mac blocks it the first time:

1. Send it zipped (Finder › Compress, or `ditto -c -k --keepParent "Stereo Test.app" "Stereo Test.zip"`) or by AirDrop. Don't upload the bare `.app` to the Google Drive website.
2. macOS 15 and later: double-click it, click **Done**, then open System Settings › Privacy & Security, click **Open Anyway** next to "Stereo Test" and enter the Mac's password. The button only appears for about an hour after the blocked attempt.
3. macOS 13 and 14: right-click › Open, then **Open**.
