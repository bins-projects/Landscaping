const assert = require('node:assert/strict');
const { calibrate, toLocalFeet, polygonArea, polylineLength } = require('../site-geometry.js');

const calibration = calibrate({ x: 100, y: 100 }, { x: 600, y: 100 }, 100);
assert.equal(calibration.pixelDistance, 500);
assert.equal(calibration.feetPerPixel, 0.2);
assert.equal(calibration.pixelsPerFoot, 5);

const rectangle = [
  { x: 100, y: 100 }, { x: 500, y: 100 },
  { x: 500, y: 400 }, { x: 100, y: 400 }
];
assert.equal(polygonArea(rectangle, calibration.feetPerPixel), 4800);
assert.deepEqual(toLocalFeet({ x: 500, y: 400 }, calibration.feetPerPixel), { x: 100, y: 80 });
assert.equal(polylineLength([{ x: 0, y: 0 }, { x: 300, y: 400 }], 0.2), 100);
assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 2, y: 2 }], 1), 0);
assert.equal(polylineLength([{ x: 0, y: 0 }], 1), 0);
assert.throws(() => calibrate({ x: 0, y: 0 }, { x: 2, y: 0 }, 100), /3 image pixels/);
assert.throws(() => calibrate({ x: 0, y: 0 }, { x: 3, y: 0 }, 0), /greater than zero/);
assert.throws(() => toLocalFeet({ x: 1, y: 1 }, null), /not calibrated/);

console.log('site geometry tests passed');
