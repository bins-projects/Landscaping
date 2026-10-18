const assert = require('node:assert/strict');
const { regionMask, contourFromMask } = require('../site-segmentation.js');

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
console.log('site segmentation tests passed');
