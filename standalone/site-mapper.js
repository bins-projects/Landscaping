(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('mapCanvas');
  const ctx = canvas.getContext('2d');
  const stage = $('mapStage');
  const state = {
    projectName: 'Untitled Florida site', location: '', imageName: '', imageData: '',
    image: null, imageWidth: 0, imageHeight: 0, ftPerPixel: null,
    calibrationPoints: [], features: [], draft: [], activeMode: null,
    viewScale: 1, offsetX: 0, offsetY: 0, dpr: 1, panning: null,
    noticeTimer: null, spaceDown: false, suppressClick: false
  };

  const TYPES = {
    parcel: { label: 'Property boundary', color: '#e05b4d', shape: 'polygon' },
    building: { label: 'Building or structure', color: '#497bb6', shape: 'polygon' },
    hardscape: { label: 'Driveway or paved area', color: '#aa7e48', shape: 'polygon' },
    water: { label: 'Pool or water feature', color: '#38a5bb', shape: 'polygon' },
    'existing-bed': { label: 'Existing planting bed', color: '#9271b5', shape: 'polygon' },
    'no-plant': { label: 'Utility or no-plant area', color: '#d29737', shape: 'polygon' },
    path: { label: 'Existing path or walk', color: '#766b5c', shape: 'line' },
    tree: { label: 'Tree canopy', color: '#4b9b63', shape: 'circle' },
    point: { label: 'Point feature', color: '#de7d4e', shape: 'point' }
  };

  function showNotice(message) {
    const el = $('mapNotice');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function updateProjectHeading() {
    state.projectName = $('siteName').value.trim() || 'Untitled Florida site';
    state.location = $('siteLocation').value.trim();
    $('mapProjectTitle').textContent = state.projectName;
    $('mapHint').textContent = state.location || 'Aerial workspace';
    $('saveProject').disabled = !state.image;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.image && !state.hasFit) fitImage();
    render();
  }

  function fitImage() {
    if (!state.image) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const pad = 48;
    state.viewScale = Math.min((w - pad * 2) / state.imageWidth, (h - pad * 2) / state.imageHeight);
    state.viewScale = Math.max(.025, Math.min(state.viewScale, 8));
    state.offsetX = (w - state.imageWidth * state.viewScale) / 2;
    state.offsetY = (h - state.imageHeight * state.viewScale) / 2;
    state.hasFit = true;
    updateZoomLabel();
    render();
  }

  function updateZoomLabel() {
    $('zoomLabel').textContent = `${Math.round(state.viewScale * 100)}%`;
  }

  function zoomAt(factor, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
    if (!state.image) return;
    const old = state.viewScale;
    const next = Math.max(.025, Math.min(12, old * factor));
    const ratio = next / old;
    state.offsetX = x - (x - state.offsetX) * ratio;
    state.offsetY = y - (y - state.offsetY) * ratio;
    state.viewScale = next;
    updateZoomLabel();
    render();
  }

  function imagePoint(event) {
    const r = canvas.getBoundingClientRect();
    const x = (event.clientX - r.left - state.offsetX) / state.viewScale;
    const y = (event.clientY - r.top - state.offsetY) / state.viewScale;
    return { x, y };
  }

  function canvasPoint(event) {
    const r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  function insideImage(p) {
    return p.x >= 0 && p.y >= 0 && p.x <= state.imageWidth && p.y <= state.imageHeight;
  }

  function localFeet(p) {
    return SiteGeometry.toLocalFeet(p, state.ftPerPixel || 1);
  }

  function polygonArea(points) {
    return SiteGeometry.polygonArea(points, state.ftPerPixel || 1);
  }

  function lengthFeet(points) {
    return SiteGeometry.polylineLength(points, state.ftPerPixel || 1);
  }

  function formatNumber(n) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
  }

  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!state.image) return;
    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.viewScale, state.viewScale);
    ctx.drawImage(state.image, 0, 0, state.imageWidth, state.imageHeight);
    state.features.forEach(drawFeature);
    if (state.autoPreview) drawFeature({ ...state.autoPreview, geometry: 'polygon' });
    if (state.activeMode === 'draw' && state.draft.length) drawDraft();
    if (state.activeMode === 'calibrate' && state.calibrationPoints.length) drawCalibrationDraft();
    ctx.restore();
  }

  function drawFeature(feature) {
    const spec = TYPES[feature.type] || TYPES.point;
    const pts = feature.points;
    ctx.save();
    ctx.lineWidth = 2.25 / state.viewScale;
    ctx.strokeStyle = spec.color;
    ctx.fillStyle = `${spec.color}30`;
    ctx.setLineDash(feature.confidence === 'estimated' ? [7 / state.viewScale, 4 / state.viewScale] : []);
    if (feature.geometry === 'polygon' && pts.length >= 3) {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (feature.geometry === 'line' && pts.length >= 2) {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    } else if (feature.geometry === 'circle' && pts.length >= 2) {
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (feature.geometry === 'point' && pts.length) {
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 5 / state.viewScale, 0, Math.PI * 2); ctx.fillStyle = spec.color; ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([]);
    const at = pts[0];
    if (at && feature.name) {
      const fontSize = 12 / state.viewScale;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      const label = feature.name;
      const pad = 4 / state.viewScale;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(at.x + 7 / state.viewScale, at.y - 9 / state.viewScale, tw + pad * 2, fontSize + pad);
      ctx.fillStyle = '#26382d';
      ctx.fillText(label, at.x + 7 / state.viewScale + pad, at.y + 1 / state.viewScale);
    }
    ctx.restore();
  }

  function drawDraft() {
    const type = $('featureType').value;
    const spec = TYPES[type];
    ctx.save(); ctx.strokeStyle = spec.color; ctx.fillStyle = `${spec.color}28`;
    ctx.lineWidth = 2.5 / state.viewScale; ctx.setLineDash([6 / state.viewScale, 4 / state.viewScale]);
    const pts = state.draft;
    if (pts.length) {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      if (spec.shape === 'polygon' && pts.length >= 3) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 / state.viewScale, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); });
      if (spec.shape === 'circle' && pts.length === 1) {
        ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 6 / state.viewScale, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCalibrationDraft() {
    ctx.save(); ctx.strokeStyle = '#e59b32'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2 / state.viewScale;
    ctx.setLineDash([6 / state.viewScale, 4 / state.viewScale]);
    const points = state.calibrationPoints;
    if (points.length) {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      if (points.length > 1) ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5 / state.viewScale, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    }
    ctx.restore();
  }

  function updateScaleDisplay() {
    const status = $('scaleStatus');
    const ready = Number.isFinite(state.ftPerPixel) && state.ftPerPixel > 0;
    status.classList.toggle('ready', ready);
    status.innerHTML = ready ? `<span class="status-dot"></span>Calibrated · ${formatNumber(1 / state.ftPerPixel)} image pixels per foot` : '<span class="status-dot"></span>Scale not set';
    $('scaleReadout').textContent = ready ? `Scale: 1 ft = ${formatNumber(1 / state.ftPerPixel)} px · 1 acre = 43,560 sq ft` : 'Set a scale to calculate site dimensions';
    $('drawButton').disabled = !state.image || !ready;
    $('calibrateButton').disabled = !state.image;
    $('exportMap').disabled = !state.image;
    $('saveProject').disabled = !state.image;
    const canStartWaterTrace = Boolean(state.image && ready && (!state.activeMode || state.activeMode === 'auto-water'));
    $('autoWaterButton').disabled = !canStartWaterTrace;
    const choosingWaterSeed = state.activeMode === 'auto-water';
    $('autoWaterButton').textContent = choosingWaterSeed ? 'Cancel water selection' : 'Auto-trace water · click pond';
    $('autoWaterButton').classList.toggle('button-primary', choosingWaterSeed);
    $('autoWaterButton').classList.toggle('button-outline', !choosingWaterSeed);
    $('autoWaterButton').title = !state.image ? 'Load an aerial image first.' : !ready ? 'Calibrate the image scale first.' : state.activeMode && state.activeMode !== 'auto-water' ? 'Finish or cancel the current map action first.' : 'Choose Pool or water feature, then click this and click inside the water.';
    if (!ready) $('drawHelp').textContent = state.image ? 'Calibrate the image scale before tracing so dimensions are real.' : 'Load an image and set its scale to begin.';
    else if (!state.activeMode) $('drawHelp').textContent = 'Choose a feature, then trace it on the map. Double-click or press Finish to close polygons.';
  }

  function updateFeatureList() {
    $('featureCount').textContent = String(state.features.length);
    const list = $('featureList');
    if (!state.features.length) {
      list.innerHTML = '<p class="empty-list">Your traced shapes will appear here.</p>';
      render(); return;
    }
    list.innerHTML = state.features.map((f, i) => {
      const spec = TYPES[f.type] || TYPES.point;
      let measure = '';
      if (f.geometry === 'polygon' && f.points.length >= 3) measure = `${formatNumber(polygonArea(f.points))} sq ft`;
      else if (f.geometry === 'line') measure = `${formatNumber(lengthFeet(f.points))} ft`;
      else if (f.geometry === 'circle' && f.points.length >= 2) {
        const r = Math.hypot(f.points[1].x - f.points[0].x, f.points[1].y - f.points[0].y) * state.ftPerPixel;
        measure = `Ø ${formatNumber(2 * r)} ft`;
      } else if (f.geometry === 'point') measure = 'Point';
      return `<div class="feature-row"><span class="feature-swatch" style="background:${spec.color}"></span><div class="feature-meta"><b>${escapeHtml(f.name || spec.label)}</b><small>${spec.label} · ${f.confidence === 'estimated' ? 'estimated' : 'confirmed'}</small></div><span class="feature-area">${measure}</span><button class="delete-feature" data-delete="${i}" aria-label="Delete ${escapeHtml(f.name || spec.label)}" title="Delete">×</button></div>`;
    }).join('');
    list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => {
      state.features.splice(Number(button.dataset.delete), 1); updateFeatureList();
    }));
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function setMode(mode) {
    if (mode !== 'auto-review') state.autoPreview = null;
    if (mode !== 'auto-review' && mode !== 'auto-water') state.autoSeed = null;
    state.activeMode = mode;
    state.draft = [];
    $('autoWaterControls').hidden = mode !== 'auto-review';
    state.calibrationPoints = [];
    const drawing = mode === 'draw';
    $('drawButton').textContent = drawing ? 'Cancel tracing' : 'Start tracing';
    $('finishShape').disabled = !drawing;
    $('undoPoint').disabled = !drawing;
    $('calibrateButton').textContent = mode === 'calibrate' ? 'Cancel scale marking' : 'Mark scale on image';
    $('mapCanvas').style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
    if (mode === 'draw') $('drawHelp').textContent = getDrawHelp();
    else if (mode === 'calibrate') $('drawHelp').textContent = 'Click the first and second ends of your known distance.';
    else if (mode === 'auto-water') $('drawHelp').textContent = 'Click once inside the water on the aerial to generate its outline preview.';
    else if (mode === 'auto-review') $('drawHelp').textContent = 'Review the dashed outline. Adjust tolerance if needed, then accept it.';
    else if (!state.ftPerPixel) $('drawHelp').textContent = state.image ? 'Calibrate the image scale before tracing so dimensions are real.' : 'Load an image and set its scale to begin.';
    else $('drawHelp').textContent = 'Choose a feature, then trace it on the map. Double-click or press Finish to close polygons.';
    updateScaleDisplay();
    render();
  }

  function getDrawHelp() {
    const shape = TYPES[$('featureType').value].shape;
    if (shape === 'polygon') return 'Click around the feature boundary; double-click or press Finish to close it.';
    if (shape === 'line') return 'Click along the feature; double-click or press Finish to end the line.';
    if (shape === 'circle') return 'Click the tree center, then click the canopy edge.';
    return 'Click the feature location once to place a marker.';
  }

  function runAutoWaterTrace(seed, tolerance) {
    if (!state.image || !seed) return;
    try {
      const maxDimension = 1200;
      const ratio = Math.min(1, maxDimension / Math.max(state.imageWidth, state.imageHeight));
      const workCanvas = document.createElement('canvas');
      workCanvas.width = Math.max(3, Math.round(state.imageWidth * ratio));
      workCanvas.height = Math.max(3, Math.round(state.imageHeight * ratio));
      const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
      workCtx.drawImage(state.image, 0, 0, workCanvas.width, workCanvas.height);
      const pixels = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
      const result = SiteSegmentation.regionMask(
        pixels.data, workCanvas.width, workCanvas.height,
        seed.x * workCanvas.width / state.imageWidth,
        seed.y * workCanvas.height / state.imageHeight,
        tolerance
      );
      const points = SiteSegmentation.contourFromMask(result.mask, workCanvas.width, workCanvas.height)
        .map(p => ({ x: p.x * state.imageWidth / workCanvas.width, y: p.y * state.imageHeight / workCanvas.height }));
      if (result.count < 24 || points.length < 3) throw new Error('That spot produced a very small region. Try a point farther inside the water.');
      state.autoSeed = seed;
      state.autoPreview = {
        points, type: 'water', name: $('featureName').value.trim() || 'Water feature',
        confidence: $('confidence').value, pixel_count: result.count,
        tolerance: result.tolerance, coverage: result.count / (workCanvas.width * workCanvas.height)
      };
      $('waterTolerance').value = String(result.tolerance);
      $('waterToleranceValue').textContent = String(result.tolerance);
      setMode('auto-review');
      if (state.autoPreview.coverage > .8) showNotice('This outline covers most of the image. Lower tolerance or choose a point deeper in the water.');
      else showNotice('Water outline ready to review.');
    } catch (error) {
      showNotice(error.message || 'Could not trace that area. Try another point or trace it manually.');
    }
  }

  function acceptAutoWater() {
    if (!state.autoPreview) return;
    const name = $('featureName').value.trim() || 'Water feature';
    state.features.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `feature-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name, type: 'water', geometry: 'polygon', confidence: $('confidence').value,
      points: state.autoPreview.points
    });
    state.autoPreview = null; state.autoSeed = null; $('featureName').value = '';
    setMode(null); updateFeatureList(); showNotice(`${name} added to this site.`);
  }

  function cancelAutoWater() {
    state.autoPreview = null; state.autoSeed = null;
    setMode(null); render();
  }

  function finishDrawing() {
    if (state.activeMode !== 'draw') return;
    const type = $('featureType').value;
    const shape = TYPES[type].shape;
    const min = shape === 'polygon' ? 3 : shape === 'line' || shape === 'circle' ? 2 : 1;
    if (state.draft.length < min) {
      showNotice(shape === 'polygon' ? 'A boundary needs at least 3 points.' : 'Add another point to finish this feature.');
      return;
    }
    const name = $('featureName').value.trim() || TYPES[type].label;
    state.features.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `feature-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name, type, geometry: shape, confidence: $('confidence').value,
      points: state.draft.map(p => ({ x: p.x, y: p.y }))
    });
    $('featureName').value = '';
    setMode(null); updateFeatureList(); showNotice(`${name} added to this site.`);
  }

  function completeCalibration() {
    const distance = Number($('distanceFeet').value);
    const [a, b] = state.calibrationPoints;
    if (!Number.isFinite(distance) || distance <= 0 || !a || !b) {
      showNotice('Enter a positive distance and mark both ends.'); return;
    }
    let measured;
    try { measured = SiteGeometry.calibrate(a, b, distance); }
    catch (error) { showNotice(error.message); return; }
    const imagePixels = measured.pixelDistance;
    state.ftPerPixel = measured.feetPerPixel;
    state.calibration = { points: [a, b], distance_ft: distance, pixel_distance: +imagePixels.toFixed(3) };
    $('mapHint').textContent = state.location || 'Scale calibrated · ready to trace';
    setMode(null); updateScaleDisplay(); render();
    showNotice(`Scale set: ${formatNumber(imagePixels / distance)} px per foot.`);
  }

  function onMapClick(event) {
    if (state.suppressClick) { state.suppressClick = false; return; }
    if (!state.image || state.panning) return;
    const p = imagePoint(event);
    if (!insideImage(p)) return;
    if (state.activeMode === 'calibrate') {
      state.calibrationPoints.push(p);
      if (state.calibrationPoints.length === 2) completeCalibration();
      else render();
      return;
    }
    if (state.activeMode === 'auto-water') {
      runAutoWaterTrace(p, Number($('waterTolerance').value));
      return;
    }
    if (state.activeMode !== 'draw' || event.detail > 1) return;
    const type = $('featureType').value;
    const shape = TYPES[type].shape;
    state.draft.push(p);
    if (shape === 'point') finishDrawing();
    else if (shape === 'circle' && state.draft.length === 2) finishDrawing();
    else render();
  }

  function openImage(file) {
    if (!file || !file.type.startsWith('image/')) { showNotice('Choose a PNG, JPG, or WebP image.'); return; }
    if (hasSiteWork() && !confirm('Replace the current site image? Unsaved work in this tab will be cleared.')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        state.image = image; state.imageData = reader.result; state.imageName = file.name;
        state.imageWidth = image.naturalWidth; state.imageHeight = image.naturalHeight;
        state.ftPerPixel = null; state.calibration = null; state.calibrationPoints = [];
        state.features = []; state.draft = []; state.activeMode = null; state.autoPreview = null; state.autoSeed = null; state.hasFit = false;
        setMode(null);
        $('emptyState').hidden = true;
        $('imageStatus').textContent = `${file.name} · ${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px`;
        $('mapHint').textContent = 'Image loaded · calibrate scale to start tracing';
        resizeCanvas(); updateScaleDisplay(); updateFeatureList(); showNotice('Image loaded. Set the scale before tracing.');
      };
      image.onerror = () => showNotice('This image could not be opened. Try a PNG or JPG.');
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function projectObject() {
    const features = state.features.map(f => ({
      id: f.id, name: f.name, type: f.type, geometry: f.geometry, confidence: f.confidence,
      points_image_px: f.points.map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) })),
      points_local_ft: f.points.map(localFeet)
    }));
    return {
      format: 'florida-friendly-site-project', schema_version: 1,
      project: { name: $('siteName').value.trim() || 'Untitled Florida site', location: $('siteLocation').value.trim(), saved_at: new Date().toISOString() },
      image: { filename: state.imageName, mime_type: state.imageData.slice(5, state.imageData.indexOf(';')), width_px: state.imageWidth, height_px: state.imageHeight, data_url: state.imageData },
      calibration: state.calibration ? { ...state.calibration, feet_per_pixel: state.ftPerPixel, coordinate_origin: 'top-left of original image', axes: 'x east/right, y south/down; north orientation is not georeferenced' } : null,
      features
    };
  }

  function saveProject() {
    if (!state.image || !state.ftPerPixel) { showNotice('Load an image and set the scale before saving.'); return; }
    const data = JSON.stringify(projectObject(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeFilename($('siteName').value || 'florida-site')}.siteplan`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showNotice('Site project saved to your device.');
  }

  function safeFilename(s) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'florida-site'; }

  function hasSiteWork() {
    return Boolean(state.image || state.features.length || state.calibration || state.draft.length);
  }

  function loadProject(file) {
    if (!file) return;
    if (hasSiteWork() && !confirm('Open another site? Unsaved work in this tab will be cleared.')) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.format !== 'florida-friendly-site-project' || data.schema_version !== 1 || !data.image?.data_url || !data.image.data_url.startsWith('data:image/') || !Array.isArray(data.features)) throw new Error('format');
        const image = new Image();
        image.onload = () => {
          $('siteName').value = data.project?.name || 'Untitled Florida site';
          $('siteLocation').value = data.project?.location || '';
          state.imageName = data.image.filename || file.name;
          state.imageData = data.image.data_url; state.image = image;
          state.imageWidth = image.naturalWidth; state.imageHeight = image.naturalHeight;
          state.ftPerPixel = Number(data.calibration?.feet_per_pixel) || null;
          state.calibration = data.calibration ? { points: data.calibration.points, distance_ft: data.calibration.distance_ft, pixel_distance: data.calibration.pixel_distance } : null;
          state.features = data.features.map(f => ({ id: f.id || `feature-${Date.now()}`, name: f.name, type: f.type, geometry: f.geometry, confidence: f.confidence, points: (f.points_image_px || []).map(p => ({ x: Number(p.x), y: Number(p.y) })) }));
          state.activeMode = null; state.draft = []; state.autoPreview = null; state.autoSeed = null; state.hasFit = false;
          setMode(null);
          $('emptyState').hidden = true;
          $('siteName').dispatchEvent(new Event('input'));
          $('imageStatus').textContent = `${state.imageName} · ${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px`;
          resizeCanvas(); updateScaleDisplay(); updateFeatureList(); showNotice('Site project opened.');
        };
        image.onerror = () => showNotice('The project image could not be restored.');
        image.src = data.image.data_url;
      } catch (err) { showNotice('That file is not a valid site project.'); }
    };
    reader.readAsText(file);
  }

  function exportMap() {
    if (!state.image) return;
    const out = document.createElement('canvas');
    out.width = state.imageWidth; out.height = state.imageHeight;
    const outCtx = out.getContext('2d');
    outCtx.drawImage(state.image, 0, 0);
    state.features.forEach(f => {
      const spec = TYPES[f.type] || TYPES.point, pts = f.points;
      outCtx.save(); outCtx.strokeStyle = spec.color; outCtx.fillStyle = `${spec.color}30`; outCtx.lineWidth = Math.max(2, state.imageWidth / 1600); outCtx.setLineDash(f.confidence === 'estimated' ? [8, 5] : []);
      if (f.geometry === 'polygon' && pts.length >= 3) { outCtx.beginPath(); outCtx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => outCtx.lineTo(p.x,p.y)); outCtx.closePath(); outCtx.fill(); outCtx.stroke(); }
      if (f.geometry === 'line' && pts.length >= 2) { outCtx.beginPath(); outCtx.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(p=>outCtx.lineTo(p.x,p.y)); outCtx.stroke(); }
      if (f.geometry === 'circle' && pts.length >= 2) { outCtx.beginPath(); outCtx.arc(pts[0].x,pts[0].y,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),0,Math.PI*2); outCtx.fill(); outCtx.stroke(); }
      if (f.geometry === 'point' && pts.length) { outCtx.beginPath(); outCtx.arc(pts[0].x,pts[0].y,8,0,Math.PI*2); outCtx.fillStyle=spec.color; outCtx.fill(); }
      if (f.name && pts[0]) { const size=Math.max(16, out.width/100); outCtx.setLineDash([]); outCtx.font=`600 ${size}px system-ui`; outCtx.fillStyle='#fff'; outCtx.fillText(f.name,pts[0].x+10,pts[0].y-10); outCtx.strokeStyle='rgba(0,0,0,.3)'; outCtx.lineWidth=2; outCtx.strokeText(f.name,pts[0].x+10,pts[0].y-10); outCtx.fillStyle='#203128'; outCtx.fillText(f.name,pts[0].x+10,pts[0].y-10); }
      outCtx.restore();
    });
    out.toBlob(blob => {
      if (!blob) { showNotice('Could not export the map.'); return; }
      const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=`${safeFilename($('siteName').value)}-map.png`; a.click(); URL.revokeObjectURL(url);
      showNotice('Annotated map exported as PNG.');
    },'image/png');
  }

  function startNewSite() {
    if (hasSiteWork() && !confirm('Start a new site? Unsaved work in this tab will be cleared.')) return;
    state.image = null; state.imageData = ''; state.imageName = ''; state.imageWidth = 0; state.imageHeight = 0;
    state.ftPerPixel = null; state.calibration = null; state.calibrationPoints = []; state.features = []; state.draft = []; state.autoPreview = null; state.autoSeed = null;
    state.activeMode = null; state.hasFit = false; state.offsetX = 0; state.offsetY = 0;
    $('siteName').value = 'Untitled Florida site'; $('siteLocation').value = '';
    $('imageStatus').textContent = 'No image loaded yet.'; $('emptyState').hidden = false;
    setMode(null); updateProjectHeading(); updateScaleDisplay(); updateFeatureList(); render();
  }

  $('siteName').addEventListener('input', updateProjectHeading);
  $('siteLocation').addEventListener('input', updateProjectHeading);
  $('chooseImage').addEventListener('click', () => $('imageFile').click());
  $('emptyChooseImage').addEventListener('click', () => $('imageFile').click());
  $('imageFile').addEventListener('change', e => openImage(e.target.files[0]));
  $('calibrateButton').addEventListener('click', () => setMode(state.activeMode === 'calibrate' ? null : 'calibrate'));
  $('drawButton').addEventListener('click', () => setMode(state.activeMode === 'draw' ? null : 'draw'));
  $('finishShape').addEventListener('click', finishDrawing);
  $('undoPoint').addEventListener('click', () => { if (state.draft.length) { state.draft.pop(); render(); } });
  $('featureType').addEventListener('change', () => {
    if (state.activeMode === 'draw') $('drawHelp').textContent = getDrawHelp();
    updateScaleDisplay();
  });
  $('autoWaterButton').addEventListener('click', () => {
    if (state.activeMode === 'auto-water') { cancelAutoWater(); return; }
    if ($('featureType').value !== 'water') { showNotice('Choose “Pool or water feature” first.'); return; }
    if (!state.ftPerPixel) { showNotice('Set the image scale before tracing.'); return; }
    state.autoPreview = null;
    setMode('auto-water');
  });
  $('waterTolerance').addEventListener('input', e => { $('waterToleranceValue').textContent = e.target.value; });
  $('retryWater').addEventListener('click', () => runAutoWaterTrace(state.autoSeed, Number($('waterTolerance').value)));
  $('acceptWater').addEventListener('click', acceptAutoWater);
  $('cancelWater').addEventListener('click', cancelAutoWater);
  $('saveProject').addEventListener('click', saveProject);
  $('loadProject').addEventListener('click', () => $('projectFile').click());
  $('projectFile').addEventListener('change', e => { loadProject(e.target.files[0]); e.target.value = ''; });
  $('newProject').addEventListener('click', startNewSite);
  $('exportMap').addEventListener('click', exportMap);
  $('fitMap').addEventListener('click', fitImage);
  $('zoomIn').addEventListener('click', () => zoomAt(1.2));
  $('zoomOut').addEventListener('click', () => zoomAt(1/1.2));
  canvas.addEventListener('click', onMapClick);
  canvas.addEventListener('dblclick', event => { event.preventDefault(); if (state.activeMode === 'draw') finishDrawing(); });
  canvas.addEventListener('pointerdown', event => {
    if (event.button === 1 || state.spaceDown) {
      state.panning = { x: event.clientX, y: event.clientY, ox: state.offsetX, oy: state.offsetY };
      state.suppressClick = true;
      canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing'; event.preventDefault();
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (state.panning) {
      state.offsetX = state.panning.ox + event.clientX - state.panning.x;
      state.offsetY = state.panning.oy + event.clientY - state.panning.y;
      render(); return;
    }
    if (state.image) {
      const p = imagePoint(event);
      $('coordinatesReadout').textContent = insideImage(p) ? `Image: ${Math.round(p.x)} px, ${Math.round(p.y)} px` : 'Image coordinates appear here';
    }
  });
  canvas.addEventListener('pointerup', () => { state.panning = null; canvas.style.cursor = state.activeMode === 'pan' ? 'grab' : 'crosshair'; });
  canvas.addEventListener('wheel', event => {
    if (!state.image) return;
    event.preventDefault();
    const p = canvasPoint(event); zoomAt(event.deltaY < 0 ? 1.12 : 1/1.12, p.x, p.y);
  }, { passive: false });
  stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drag-over'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag-over'));
  stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('drag-over'); const file=e.dataTransfer.files[0]; if(file?.type.startsWith('image/')) openImage(file); else if(file) loadProject(file); });
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { state.spaceDown = true; event.preventDefault(); }
    if (event.key === 'Escape') setMode(null);
    if (event.key === 'Enter' && state.activeMode === 'draw' && document.activeElement.tagName !== 'INPUT') finishDrawing();
    if ((event.key === 'Backspace' || event.key === 'Delete') && state.activeMode === 'draw' && document.activeElement.tagName !== 'INPUT') { state.draft.pop(); render(); }
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') state.spaceDown = false; });
  window.addEventListener('blur', () => { state.spaceDown = false; state.panning = null; });
  updateProjectHeading(); updateScaleDisplay(); resizeCanvas();
})();
