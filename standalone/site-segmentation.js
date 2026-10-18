((root) => {
  'use strict';

  function regionMask(data, width, height, seedX, seedY, tolerance = 42) {
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
    let head = 0, tail = 0;
    mask[start] = 1; queue[tail++] = start;
    const enqueue = (n, p) => {
      if (n >= 0 && !mask[n] && seedMatches(n) && edgeMatches(p, n)) {
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

  function contourFromMask(mask, width, height) {
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
    return simplify(best, 2);
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

  function segmentDistanceSquared(p, a, b) {
    let x = a.x, y = a.y, dx = b.x - x, dy = b.y - y;
    if (dx || dy) {
      const t = Math.max(0, Math.min(1, ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)));
      x += dx * t; y += dy * t;
    }
    dx = p.x - x; dy = p.y - y;
    return dx * dx + dy * dy;
  }

  const api = { regionMask, contourFromMask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SiteSegmentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
