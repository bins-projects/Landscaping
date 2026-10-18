((root) => {
  'use strict';

  function distancePixels(a, b) {
    if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite)) throw new TypeError('Calibration points must have finite image coordinates.');
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function calibrate(a, b, distanceFeet) {
    const realDistance = Number(distanceFeet);
    if (!Number.isFinite(realDistance) || realDistance <= 0) throw new RangeError('Known distance must be greater than zero feet.');
    const pixels = distancePixels(a, b);
    if (pixels < 3) throw new RangeError('Choose calibration points at least 3 image pixels apart.');
    return { feetPerPixel: realDistance / pixels, pixelDistance: pixels, pixelsPerFoot: pixels / realDistance };
  }

  function toLocalFeet(point, feetPerPixel) {
    const scale = Number(feetPerPixel);
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Image scale is not calibrated.');
    if (![point?.x, point?.y].every(Number.isFinite)) throw new TypeError('Image point must have finite coordinates.');
    return { x: +(point.x * scale).toFixed(2), y: +(point.y * scale).toFixed(2) };
  }

  function polygonArea(points, feetPerPixel) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    const scale = Number(feetPerPixel);
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Image scale is not calibrated.');
    let twiceArea = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      twiceArea += a.x * b.y - b.x * a.y;
    }
    return Math.abs(twiceArea) * scale * scale / 2;
  }

  function polylineLength(points, feetPerPixel) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    const scale = Number(feetPerPixel);
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Image scale is not calibrated.');
    let length = 0;
    for (let i = 1; i < points.length; i++) length += distancePixels(points[i - 1], points[i]) * scale;
    return length;
  }

  const api = { calibrate, toLocalFeet, polygonArea, polylineLength };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SiteGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
