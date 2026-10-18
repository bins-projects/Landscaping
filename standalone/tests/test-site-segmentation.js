const assert = require('node:assert/strict');
const { regionMask, contourFromMask, simplifyContour, detectWater, cleanBuildingMask } = require('../site-segmentation.js');

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

// Building cleanup removes thin color spurs and fills small gaps without wiping the roof footprint.
const roofWidth = 40, roofHeight = 30;
const roof = new Uint8Array(roofWidth * roofHeight);
for (let y = 8; y < 22; y++) for (let x = 10; x < 30; x++) roof[y * roofWidth + x] = 1;
for (let y = 5; y < 8; y++) roof[y * roofWidth + 19] = 1;
roof[14 * roofWidth + 10] = 0;
const cleanedRoof = cleanBuildingMask(roof, roofWidth, roofHeight, 1);
const cleanedRoofArea = [...cleanedRoof].reduce((sum, pixel) => sum + pixel, 0);
assert.ok(cleanedRoofArea >= 278 && cleanedRoofArea <= 282, 'cleanup preserves the main building footprint');
assert.equal(cleanedRoof[6 * roofWidth + 19], 0, 'cleanup removes a narrow roof-color spur');
assert.equal(cleanedRoof[14 * roofWidth + 10], 1, 'cleanup fills a one-pixel gap in the roof edge');

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
const detailedContour = contourFromMask(automatic.mask, autoWidth, autoHeight, 1.25);
const coarseContour = contourFromMask(automatic.mask, autoWidth, autoHeight, 15);
assert.ok(detailedContour.length >= 4);
assert.ok(detailedContour.length > coarseContour.length, 'fine contour keeps curved boundary detail');
const cleanBuildingContour = simplifyContour(detailedContour, 2.5);
assert.ok(cleanBuildingContour.length < detailedContour.length, 'building profile reduces tiny roof-edge changes');
const contourArea = points => Math.abs(points.reduce((sum, point, i) => {
  const next = points[(i + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);
assert.ok(contourArea(cleanBuildingContour) / contourArea(detailedContour) > .94, 'building cleanup preserves the detected footprint');

// A seed click can isolate and outline a winding sidewalk-like color region.
const walkWidth = 100, walkHeight = 80;
const walkPixels = new Uint8ClampedArray(walkWidth * walkHeight * 4);
for (let y = 0; y < walkHeight; y++) for (let x = 0; x < walkWidth; x++) {
  const centerX = 36 + .01 * (y - 40) ** 2;
  const onWalk = Math.abs(x - centerX) <= 3;
  const color = onWalk ? [190, 190, 180] : [90, 145, 86];
  const i = (y * walkWidth + x) * 4;
  walkPixels[i] = color[0]; walkPixels[i + 1] = color[1]; walkPixels[i + 2] = color[2]; walkPixels[i + 3] = 255;
}
const walkRegion = regionMask(walkPixels, walkWidth, walkHeight, 36, 40, 30);
assert.ok(walkRegion.count > 400, 'seeded selection follows the continuous sidewalk region');
assert.ok(contourFromMask(walkRegion.mask, walkWidth, walkHeight, 1.25).length > 10, 'winding sidewalk outline retains curved detail');

console.log('site segmentation tests passed');
