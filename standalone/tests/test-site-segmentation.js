const assert = require('node:assert/strict');
const { regionMask, contourFromMask, detectWater } = require('../site-segmentation.js');

function makeImage(width, height, water, land = [100, 155, 85]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = x >= water.left && x < water.right && y >= water.top && y < water.bottom ? water.color : land;
    const i = (y * width + x) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
  }
  return pixels;
}

const width = 20, height = 16;
const pixels = makeImage(width, height, { left: 4, top: 3, right: 15, bottom: 12, color: [45, 55, 65] });
const result = regionMask(pixels, width, height, 8, 7, 24);
assert.equal(result.count, 99);
assert.equal(result.mask[7 * width + 8], 1);
assert.equal(result.mask[0], 0);

const outline = contourFromMask(result.mask, width, height);
assert.ok(outline.length >= 4);
const area = Math.abs(outline.reduce((sum, point, i) => {
  const next = outline[(i + 1) % outline.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);
assert.equal(area, 99);

assert.throws(() => regionMask(pixels, width, height, -1, 7, 24), /inside the image/);

// The automatic detector must find the large, distinct pond without a user-provided seed.
const autoWidth = 120, autoHeight = 100;
const autoPixels = new Uint8ClampedArray(autoWidth * autoHeight * 4);
for (let y = 0; y < autoHeight; y++) for (let x = 0; x < autoWidth; x++) {
  const inPond = ((x - 62) / 29) ** 2 + ((y - 51) / 22) ** 2 < 1;
  const inSmallRoof = x >= 17 && x < 26 && y >= 20 && y < 28;
  const noise = (x * 13 + y * 7) % 13 - 6;
  const color = inPond ? [50 + noise, 48 + noise, 65 + noise] : inSmallRoof ? [28, 27, 30] : [146 + noise, 156 + noise, 93 + noise];
  const i = (y * autoWidth + x) * 4;
  autoPixels[i] = color[0]; autoPixels[i + 1] = color[1]; autoPixels[i + 2] = color[2]; autoPixels[i + 3] = 255;
}
const parcel = [{ x: 8, y: 8 }, { x: 112, y: 8 }, { x: 112, y: 92 }, { x: 8, y: 92 }];
const automatic = detectWater(autoPixels, autoWidth, autoHeight, parcel);
assert.equal(automatic.mask[51 * autoWidth + 62], 1);
assert.equal(automatic.mask[12 * autoWidth + 12], 0);
assert.ok(automatic.coverage > .12 && automatic.coverage < .5);
assert.ok(contourFromMask(automatic.mask, autoWidth, autoHeight).length >= 4);

console.log('site segmentation tests passed');
