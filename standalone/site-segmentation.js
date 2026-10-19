((root) => {
  'use strict';

  function regionMask(data, width, height, seedX, seedY, tolerance = 42, allowedMask = null) {
    const w = Math.floor(width), h = Math.floor(height);
    const sx = Math.floor(seedX), sy = Math.floor(seedY);
    if (!data || data.length < w * h * 4 || w < 3 || h < 3) throw new TypeError('A valid image is required.');
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) throw new RangeError('Choose a point inside the image.');
    const tol = Math.max(8, Math.min(140, Number(tolerance) || 42));
    const seed = [0, 0, 0];
    let samples = 0;
    for (let y = Math.max(0, sy - 2); y <= Math.min(h - 1, sy + 2); y++) {
      for (let x = Math.max(0, sx - 2); x <= Math.min(w - 1, sx + 2); x++) {
        const i = (y * w + x) * 4;
        seed[0] += data[i]; seed[1] += data[i + 1]; seed[2] += data[i + 2]; samples++;
      }
    }
    seed.forEach((_, i) => seed[i] /= samples);
    const mask = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    const maxColorDistance2 = tol * tol * 3;
    const maxEdgeDistance2 = Math.max(48, tol * 1.7) ** 2 * 3;
    const seedMatches = index => {
      const p = index * 4;
      const dr = data[p] - seed[0], dg = data[p + 1] - seed[1], db = data[p + 2] - seed[2];
      return dr * dr + dg * dg + db * db <= maxColorDistance2;
    };
    const edgeMatches = (a, b) => {
      const p = a * 4, q = b * 4;
      const dr = data[p] - data[q], dg = data[p + 1] - data[q + 1], db = data[p + 2] - data[q + 2];
      return dr * dr + dg * dg + db * db <= maxEdgeDistance2;
    };
    const start = sy * w + sx;
    if (allowedMask && !allowedMask[start]) throw new RangeError('Choose a point inside the mapped area.');
    let head = 0, tail = 0;
    mask[start] = 1; queue[tail++] = start;
    const enqueue = (n, p) => {
      if (n >= 0 && (!allowedMask || allowedMask[n]) && !mask[n] && seedMatches(n) && edgeMatches(p, n)) {
        mask[n] = 1; queue[tail++] = n;
      }
    };
    while (head < tail) {
      const p = queue[head++], x = p % w;
      enqueue(x > 0 ? p - 1 : -1, p);
      enqueue(x + 1 < w ? p + 1 : -1, p);
      enqueue(p >= w ? p - w : -1, p);
      enqueue(p + w < w * h ? p + w : -1, p);
    }
    return { mask, count: tail, seed: { x: sx, y: sy }, tolerance: tol };
  }

  function morphologyPass(mask, width, height, radius, dilate, horizontal) {
    const output = new Uint8Array(mask.length);
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const indexAt = (position, line) => horizontal ? line * width + position : position * width + line;
    const windowSize = radius * 2 + 1;
    for (let line = 0; line < lines; line++) {
      let count = 0;
      for (let p = 0; p <= radius && p < length; p++) count += mask[indexAt(p, line)];
      for (let position = 0; position < length; position++) {
        output[indexAt(position, line)] = dilate ? Number(count > 0) : Number(count === windowSize);
        const leaving = position - radius;
        const entering = position + radius + 1;
        if (leaving >= 0) count -= mask[indexAt(leaving, line)];
        if (entering < length) count += mask[indexAt(entering, line)];
      }
    }
    return output;
  }

  function cleanBuildingMask(mask, width, height, radius = 3) {
    const r = Math.max(1, Math.min(8, Math.round(Number(radius) || 3)));
    let cleaned = mask;
    // Opening removes tiny roof-color spurs; closing fills narrow gaps between roof shades.
    cleaned = morphologyPass(cleaned, width, height, r, false, true);
    cleaned = morphologyPass(cleaned, width, height, r, false, false);
    cleaned = morphologyPass(cleaned, width, height, r, true, true);
    cleaned = morphologyPass(cleaned, width, height, r, true, false);
    cleaned = morphologyPass(cleaned, width, height, r, true, true);
    cleaned = morphologyPass(cleaned, width, height, r, true, false);
    cleaned = morphologyPass(cleaned, width, height, r, false, true);
    cleaned = morphologyPass(cleaned, width, height, r, false, false);
    return cleaned;
  }

  function cleanWaterMask(mask, width, height) {
    // Suppress small canopy/shadow flecks and shallow one-pixel shoreline noise,
    // while leaving the original image available for manual point corrections.
    let cleaned = morphologyPass(mask, width, height, 1, false, true);
    cleaned = morphologyPass(cleaned, width, height, 1, false, false);
    cleaned = morphologyPass(cleaned, width, height, 1, true, true);
    cleaned = morphologyPass(cleaned, width, height, 1, true, false);
    cleaned = morphologyPass(cleaned, width, height, 2, true, true);
    cleaned = morphologyPass(cleaned, width, height, 2, true, false);
    cleaned = morphologyPass(cleaned, width, height, 2, false, true);
    cleaned = morphologyPass(cleaned, width, height, 2, false, false);
    return cleaned;
  }

  function polygonMask(width, height, polygon) {
    const w = Math.floor(width), h = Math.floor(height);
    if (!Array.isArray(polygon) || polygon.length < 3) return null;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const scanY = y + .5, intersections = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) {
          intersections.push(a.x + (scanY - a.y) * (b.x - a.x) / (b.y - a.y));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const left = Math.max(0, Math.ceil(intersections[i] - .5));
        const right = Math.min(w - 1, Math.floor(intersections[i + 1] - .5));
        for (let x = left; x <= right; x++) mask[y * w + x] = 1;
      }
    }
    return mask;
  }

  function detectWater(data, width, height, allowedPolygon = null) {
    const w = Math.floor(width), h = Math.floor(height);
    if (!data || data.length < w * h * 4 || w < 3 || h < 3) throw new TypeError('A valid image is required.');
    const allowedMask = polygonMask(w, h, allowedPolygon);
    const inArea = i => !allowedMask || allowedMask[i] === 1;
    let allowedCount = 0;
    if (allowedMask) for (const v of allowedMask) allowedCount += v;
    else allowedCount = w * h;
    if (allowedCount < 100) throw new Error('The mapped boundary is too small to search.');

    // Rank possible seed pixels by darkness, local color consistency, and blue water color.
    // The user no longer needs to guess a point inside the pond.
    const candidates = [];
    const step = Math.max(1, Math.floor(Math.max(w, h) / 500));
    for (let y = 2; y < h - 2; y += step) for (let x = 2; x < w - 2; x += step) {
      const index = y * w + x;
      if (!inArea(index)) continue;
      const p = index * 4, r = data[p], g = data[p + 1], b = data[p + 2];
      let variation = 0, neighbors = 0;
      for (const n of [index - 1, index + 1, index - w, index + w]) {
        if (!inArea(n)) continue;
        const q = n * 4;
        variation += (Math.abs(r - data[q]) + Math.abs(g - data[q + 1]) + Math.abs(b - data[q + 2])) / 3;
        neighbors++;
      }
      if (!neighbors) continue;
      variation /= neighbors;
      const luminance = .2126 * r + .7152 * g + .0722 * b;
      const blueBonus = Math.max(0, b - r - 8) * .18;
      candidates.push({ x, y, rank: luminance + variation * 1.1 - blueBonus });
    }
    candidates.sort((a, b) => a.rank - b.rank);

    const seeds = [];
    const spacing = Math.max(8, Math.floor(Math.min(w, h) * .025));
    for (const c of candidates) {
      if (seeds.every(s => (s.x - c.x) ** 2 + (s.y - c.y) ** 2 > spacing ** 2)) seeds.push(c);
      if (seeds.length === 7) break;
    }
    if (!seeds.length) throw new Error('No suitable water colors were found inside the mapped area.');

    let best = null, bestScore = -Infinity;
    for (const seed of seeds) for (const tolerance of [30, 45, 60, 78]) {
      let result;
      try { result = regionMask(data, w, h, seed.x, seed.y, tolerance, allowedMask); }
      catch (_) { continue; }
      const ratio = result.count / allowedCount;
      if (ratio < .012 || ratio > .78) continue;
      let luminance = 0, edge = 0, samples = 0;
      for (let i = 0; i < result.mask.length; i++) if (result.mask[i]) {
        const p = i * 4;
        luminance += .2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2];
        const x = i % w, y = Math.floor(i / w);
        for (const n of [x > 0 ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y > 0 ? i - w : -1, y + 1 < h ? i + w : -1]) {
          if (n < 0 || (allowedMask && !allowedMask[n])) continue;
          const q = n * 4;
          edge += (Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2])) / 3;
          samples++;
        }
      }
      luminance /= result.count;
      const texture = samples ? edge / samples : 255;
      const score = Math.sqrt(ratio) * (1 + Math.max(0, 150 - luminance) / 260) / (1 + texture / 220) / (1 + tolerance / 35);
      if (score > bestScore) { bestScore = score; best = { ...result, coverage: ratio, confidence: score > .5 ? 'likely' : 'low' }; }
    }
    if (!best) throw new Error('Could not isolate a clear water region. Try tracing the water manually.');
    return best;
  }

  function contourFromMask(mask, width, height, simplificationTolerance = 2) {
    const w = Math.floor(width), h = Math.floor(height);
    const vertexWidth = w + 1;
    const edgeStarts = [];
    const edgeEnds = [];
    const outgoing = new Map();
    const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    const add = (x1, y1, x2, y2) => {
      const start = y1 * vertexWidth + x1, end = y2 * vertexWidth + x2;
      const id = edgeStarts.length;
      edgeStarts.push(start); edgeEnds.push(end);
      if (!outgoing.has(start)) outgoing.set(start, []);
      outgoing.get(start).push(id);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!has(x, y)) continue;
      if (!has(x, y - 1)) add(x, y, x + 1, y);
      if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!has(x - 1, y)) add(x, y + 1, x, y);
    }
    const used = new Uint8Array(edgeStarts.length);
    let best = [], bestArea = 0;
    for (let first = 0; first < edgeStarts.length; first++) {
      if (used[first]) continue;
      const loop = [];
      let edge = first, steps = 0;
      const start = edgeStarts[first];
      while (!used[edge] && steps++ <= edgeStarts.length) {
        used[edge] = 1;
        const v = edgeStarts[edge];
        loop.push({ x: v % vertexWidth, y: Math.floor(v / vertexWidth) });
        const end = edgeEnds[edge];
        if (end === start) break;
        const options = (outgoing.get(end) || []).filter(id => !used[id]);
        if (!options.length) { loop.length = 0; break; }
        const prev = edgeStarts[edge];
        const dx = (end % vertexWidth) - (prev % vertexWidth);
        const dy = Math.floor(end / vertexWidth) - Math.floor(prev / vertexWidth);
        const direction = dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
        const priority = [1, 0, 3, 2];
        options.sort((a, b) => {
          const da = directionOf(end, edgeEnds[a], vertexWidth);
          const db = directionOf(end, edgeEnds[b], vertexWidth);
          return priority.indexOf((da - direction + 4) % 4) - priority.indexOf((db - direction + 4) % 4);
        });
        edge = options[0];
      }
      const area = Math.abs(loopArea(loop));
      if (area > bestArea) { bestArea = area; best = loop; }
    }
    return simplifyContour(best, simplificationTolerance);
  }

  function directionOf(from, to, vertexWidth) {
    const dx = (to % vertexWidth) - (from % vertexWidth);
    const dy = Math.floor(to / vertexWidth) - Math.floor(from / vertexWidth);
    return dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
  }

  function loopArea(points) {
    let twice = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      twice += a.x * b.y - b.x * a.y;
    }
    return twice / 2;
  }

  function simplify(points, tolerance) {
    if (points.length < 4) return points;
    const sqTol = tolerance * tolerance;
    const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop();
      let max = sqTol, index = -1;
      const a = points[first], b = points[last];
      for (let i = first + 1; i < last; i++) {
        const d = segmentDistanceSquared(points[i], a, b);
        if (d > max) { max = d; index = i; }
      }
      if (index !== -1) { keep[index] = 1; stack.push([first, index], [index, last]); }
    }
    return points.filter((_, i) => keep[i]);
  }

  function simplifyContour(points, tolerance) {
    if (points.length < 5) return points.slice();
    let opposite = 1, farthest = -1;
    for (let i = 1; i < points.length; i++) {
      const d = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
      if (d > farthest) { farthest = d; opposite = i; }
    }
    const firstArc = simplify(points.slice(0, opposite + 1), tolerance);
    const secondArc = simplify([...points.slice(opposite), points[0]], tolerance);
    return [...firstArc, ...secondArc.slice(1, -1)];
  }

  function segmentDistanceSquared(p, a, b) {
    let x = a.x, y = a.y, dx = b.x - x, dy = b.y - y;
    if (dx || dy) {
      const t = Math.max(0, Math.min(1, ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)));
      x += dx * t; y += dy * t;
    }
    dx = p.x - x; dy = p.y - y;
    return dx * dx + dy * dy;
  }

  const api = { regionMask, contourFromMask, simplifyContour, detectWater, polygonMask, cleanBuildingMask, cleanWaterMask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SiteSegmentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
