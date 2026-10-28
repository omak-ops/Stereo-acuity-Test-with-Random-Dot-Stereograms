// Draws the app icon: a red/cyan random dot stereogram with a heart, as a 1024 x 1024 PNG.
// Usage: make-icon <output.png>
import AppKit

let size = 1024
guard CommandLine.arguments.count > 1,
      let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                                    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
      let context = NSGraphicsContext(bitmapImageRep: bitmap) else { exit(1) }
NSGraphicsContext.current = context
let cg = context.cgContext

// macOS icon grid: an 824 px rounded square centred in the canvas.
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = CGPath(roundedRect: tile, cornerWidth: 185, cornerHeight: 185, transform: nil)
cg.addPath(shape)
cg.setFillColor(CGColor(red: 0.07, green: 0.10, blue: 0.09, alpha: 1))
cg.fillPath()
cg.addPath(shape)
cg.clip()

// Same heart test as rds.js, in unit coordinates with y pointing up.
func inHeart(_ x: CGFloat, _ y: CGFloat) -> Bool {
  let u = (x - 512) / 250, v = (y - 470) / 250
  let a = u * u + v * v - 1
  return a * a * a - u * u * v * v * v <= 0
}

var state: UInt32 = 20261026
func random() -> CGFloat {
  state = state &* 1664525 &+ 1013904223
  return CGFloat(state >> 8) / CGFloat(1 << 24)
}

cg.setBlendMode(.screen)
let dot: CGFloat = 22
for _ in 0..<2600 {
  let x = 90 + random() * 844, y = 90 + random() * 844
  let shift: CGFloat = inHeart(x, y) ? 9 : -9
  cg.setFillColor(CGColor(red: 1, green: 0.16, blue: 0.16, alpha: 0.95))
  cg.fillEllipse(in: CGRect(x: x - shift - dot / 2, y: y - dot / 2, width: dot, height: dot))
  cg.setFillColor(CGColor(red: 0.1, green: 0.95, blue: 1, alpha: 0.95))
  cg.fillEllipse(in: CGRect(x: x + shift - dot / 2, y: y - dot / 2, width: dot, height: dot))
}

NSGraphicsContext.current = nil
guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
