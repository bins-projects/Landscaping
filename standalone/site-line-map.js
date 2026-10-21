(() => {
  'use strict';
  function build(image, width, height, detail) {
    const scale = Math.min(1, 1300 / Math.max(width, height));
    const w = Math.max(2, Math.round(width * scale)), h = Math.max(2, Math.round(height * scale));
    const source = document.createElement('canvas'); source.width = w; source.height = h;
    const sctx = source.getContext('2d', { willReadFrequently: true }); sctx.drawImage(image, 0, 0, w, h);
    const pixels = sctx.getImageData(0, 0, w, h).data, gray = new Float32Array(w * h);
    for (let i = 0; i < gray.length; i++) { const p = i * 4; gray[i] = .299 * pixels[p] + .587 * pixels[p + 1] + .114 * pixels[p + 2]; }
    const smooth = new Float32Array(gray.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      smooth[i] = (gray[i-w-1] + 2*gray[i-w] + gray[i-w+1] + 2*gray[i-1] + 4*gray[i] + 2*gray[i+1] + gray[i+w-1] + 2*gray[i+w] + gray[i+w+1]) / 16;
    }
    const output = document.createElement('canvas'); output.width = w; output.height = h;
    const octx = output.getContext('2d'), result = octx.createImageData(w, h);
    const threshold = 88 - Math.max(0, Math.min(100, Number(detail) || 50)) * .62;
    let edgeCount = 0;
    const magnitude = i => {
      const gx = -smooth[i-w-1] + smooth[i-w+1] - 2*smooth[i-1] + 2*smooth[i+1] - smooth[i+w-1] + smooth[i+w+1];
      const gy = -smooth[i-w-1] - 2*smooth[i-w] - smooth[i-w+1] + smooth[i+w-1] + 2*smooth[i+w] + smooth[i+w+1];
      return Math.hypot(gx, gy) / 4;
    };
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, strength = magnitude(i); if (strength < threshold) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && magnitude((y+dy)*w+x+dx) >= threshold*.62) neighbors++;
      if (neighbors < 2) continue;
      const p = i*4; result.data[p]=31; result.data[p+1]=48; result.data[p+2]=40; result.data[p+3]=235; edgeCount++;
    }
    octx.putImageData(result, 0, 0);
    return { canvas: output, width: w, height: h, edgeCount };
  }
  window.SiteLineMap = { build };
})();
