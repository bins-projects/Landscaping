(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('mapCanvas');
  const ctx = canvas.getContext('2d');
  const stage = $('mapStage');
  // The object editor is docked in its own column so it never covers the map.
  $('inspectorEditorHost').appendChild($('objectEditor'));
  const state = {
    projectName: 'Untitled Florida site', location: '', imageName: '', imageData: '',
    image: null, imageWidth: 0, imageHeight: 0, ftPerPixel: null,
    calibrationPoints: [], features: [], draft: [], activeMode: null,
    viewScale: 1, offsetX: 0, offsetY: 0, dpr: 1, panning: null,
    navigationLocked: true,
    noticeTimer: null, spaceDown: false, suppressClick: false,
    draggingPreviewVertex: null, selectedPreviewVertex: null, previewEditStart: null, previewUndoRecorded: false,
    simplifySectionMode: false, sectionPoints: [], editingFeatureId: null, manualTraceFromPopup: false, manualTraceName: '',
    undoStack: [], objectAnchor: null
  };

  const TYPES = {
    parcel: { label: 'Property boundary', color: '#e05b4d', shape: 'polygon' },
    building: { label: 'Building or structure', color: '#497bb6', shape: 'polygon' },
    hardscape: { label: 'Driveway or paved area', color: '#aa7e48', shape: 'polygon' },
    water: { label: 'Water body', color: '#38a5bb', shape: 'polygon' },
    'existing-bed': { label: 'Existing planting bed', color: '#9271b5', shape: 'polygon' },
    'no-plant': { label: 'Utility or no-plant area', color: '#d29737', shape: 'polygon' },
    path: { label: 'Existing path or walk', color: '#766b5c', shape: 'line' },
    tree: { label: 'Tree canopy', color: '#4b9b63', shape: 'circle' },
    point: { label: 'Point feature', color: '#de7d4e', shape: 'point' }
  };

  const OBJECT_KINDS = [
    { group: 'Buildings and structures', items: [
      ['house', 'House', 'building'], ['office', 'Office', 'building'], ['outbuilding', 'Outbuilding', 'building'],
      ['shed', 'Shed', 'building'], ['garage', 'Garage', 'building'], ['pool-house', 'Pool house', 'building'],
      ['pool-restroom', 'Pool restroom / bathroom', 'building'], ['clubhouse', 'Clubhouse', 'building'], ['pavilion', 'Pavilion', 'building'], ['other-building', 'Other building', 'building']
    ]},
    { group: 'Water', items: [
      ['pond', 'Pond', 'water'], ['pool', 'Pool', 'water'], ['lake', 'Lake', 'water'], ['canal', 'Canal', 'water'],
      ['stream', 'Stream', 'water'], ['fountain', 'Fountain', 'water'], ['other-water', 'Other water', 'water']
    ]},
    { group: 'Paths and paved areas', items: [
      ['sidewalk', 'Sidewalk', 'hardscape'], ['path', 'Path or walkway', 'path'], ['footbridge', 'Footbridge', 'path'],
      ['driveway', 'Driveway', 'hardscape'], ['patio', 'Patio or deck', 'hardscape'], ['parking', 'Parking area', 'hardscape'], ['other-paved', 'Other paved area', 'hardscape']
    ]},
    { group: 'Planting and vegetation', items: [
      ['tree-canopy', 'Tree canopy', 'tree'], ['palm-canopy', 'Palm canopy', 'tree'], ['planting-bed', 'Planting bed', 'existing-bed'],
      ['shoreline-plants', 'Shoreline planting', 'existing-bed'], ['lawn', 'Lawn or grass', 'existing-bed'], ['other-vegetation', 'Other vegetation', 'existing-bed']
    ]},
    { group: 'Boundaries and utilities', items: [
      ['property-line', 'Property boundary', 'parcel'], ['fence', 'Fence', 'path'], ['shoreline-edge', 'Shoreline edge', 'parcel'],
      ['utility-box', 'Utility box', 'no-plant'], ['drain', 'Drain or culvert', 'no-plant'], ['gate', 'Gate', 'point'], ['other-object', 'Other object', 'point']
    ]}
  ];

  function showNotice(message) {
    const el = $('mapNotice');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function copyPoints(points) { return (points || []).map(p => ({ x: p.x, y: p.y })); }

  function updateUndoButton() {
    $('undoAction').disabled = state.undoStack.length === 0;
    $('undoAction').title = state.undoStack.length ? `Undo ${state.undoStack.at(-1).label} (Ctrl+Z)` : 'Nothing to undo';
  }

  function pushUndo(label) {
    state.undoStack.push({
      label,
      features: state.features.map(f => ({ ...f, points: copyPoints(f.points) })),
      draft: copyPoints(state.draft),
      autoPreview: state.autoPreview ? { ...state.autoPreview, points: copyPoints(state.autoPreview.points) } : null,
      calibrationPoints: copyPoints(state.calibrationPoints),
      calibration: state.calibration ? { ...state.calibration, points: copyPoints(state.calibration.points) } : null,
      ftPerPixel: state.ftPerPixel,
      activeMode: state.activeMode,
      editingFeatureId: state.editingFeatureId,
      selectedPreviewVertex: state.selectedPreviewVertex,
      simplifySectionMode: state.simplifySectionMode,
      sectionPoints: copyPoints(state.sectionPoints),
      manualTraceFromPopup: state.manualTraceFromPopup,
      manualTraceName: state.manualTraceName,
      featureType: $('featureType').value,
      featureName: $('featureName').value,
      confidence: $('confidence').value,
      objectKind: $('objectKind').value,
      objectName: $('objectName').value,
      outlineDetail: $('outlineDetail').value,
      buildingCleanup: $('buildingCleanup').value
    });
    if (state.undoStack.length > 40) state.undoStack.shift();
    updateUndoButton();
  }

  function undoLastAction() {
    const snapshot = state.undoStack.pop();
    if (!snapshot) return;
    state.manualTraceFromPopup = snapshot.manualTraceFromPopup;
    state.manualTraceName = snapshot.manualTraceName;
    setMode(snapshot.activeMode);
    state.features = snapshot.features;
    state.draft = snapshot.draft;
    state.autoPreview = snapshot.autoPreview;
    state.editingFeatureId = snapshot.editingFeatureId || null;
    state.calibrationPoints = snapshot.calibrationPoints;
    state.calibration = snapshot.calibration;
    state.ftPerPixel = snapshot.ftPerPixel;
    state.selectedPreviewVertex = snapshot.selectedPreviewVertex;
    state.simplifySectionMode = snapshot.simplifySectionMode;
    state.sectionPoints = snapshot.sectionPoints;
    $('featureType').value = snapshot.featureType;
    $('featureName').value = snapshot.featureName;
    $('confidence').value = snapshot.confidence;
    $('objectKind').value = snapshot.objectKind;
    $('objectName').value = snapshot.objectName;
    $('outlineDetail').value = snapshot.outlineDetail;
    $('buildingCleanup').value = snapshot.buildingCleanup;
    $('buildingCleanupValue').textContent = `${snapshot.buildingCleanup} px`;
    $('buildingCleanupControl').hidden = selectedObjectKind()?.type !== 'building';
    $('advancedDetection').hidden = selectedObjectKind()?.type !== 'water' || Boolean(state.editingFeatureId);
    $('outlineDetail').disabled = Boolean(state.autoPreview?.edited);
    $('straightenSection').textContent = state.simplifySectionMode ? 'Cancel border edit' : 'Simplify border';
    $('acceptFeature').disabled = !selectedObjectKind();
    $('acceptFeature').textContent = state.editingFeatureId ? 'Save changes' : 'Add to map';
    $('objectEditorTitle').textContent = state.editingFeatureId ? `Editing ${state.autoPreview?.name || 'feature'}` : 'Outline found — what is it?';
    $('objectEditor').hidden = !state.autoPreview || state.manualTraceFromPopup;
    $('manualTracePanel').hidden = !state.manualTraceFromPopup || state.activeMode !== 'draw';
    $('removeOutlinePoint').disabled = state.selectedPreviewVertex === null;
    updateUndoButton();
    updateScaleDisplay();
    updateFeatureList();
    updateNavigationUI();
    render();
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
    state.viewScale = Math.max(.001, Math.min(state.viewScale, 8));
    state.offsetX = (w - state.imageWidth * state.viewScale) / 2;
    state.offsetY = (h - state.imageHeight * state.viewScale) / 2;
    state.hasFit = true;
    updateZoomLabel(); updateNavigationUI();
    render();
  }

  function updateZoomLabel() {
    $('zoomLabel').textContent = `${Math.round(state.viewScale * 100)}%`;
  }

  function updateNavigationUI() {
    const button = $('mapLock');
    button.textContent = state.navigationLocked ? 'Unlock map' : 'Lock map';
    button.setAttribute('aria-pressed', String(state.navigationLocked));
    button.title = state.navigationLocked ? 'Unlock to pan and zoom; clicks still outline objects' : 'Lock the map position while you trace';
    button.disabled = !state.image;
    $('zoomIn').disabled = !state.image || state.navigationLocked;
    $('zoomOut').disabled = !state.image || state.navigationLocked;
    canvas.style.cursor = state.panning ? 'grabbing' : (state.navigationLocked || ['draw', 'calibrate', 'auto-review'].includes(state.activeMode)) ? 'crosshair' : 'grab';
  }

  function clampOffset() {
    if (!state.image) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const imageW = state.imageWidth * state.viewScale, imageH = state.imageHeight * state.viewScale;
    const margin = 64;
    if (imageW <= w - margin * 2) state.offsetX = (w - imageW) / 2;
    else state.offsetX = Math.max(margin - imageW, Math.min(w - margin, state.offsetX));
    if (imageH <= h - margin * 2) state.offsetY = (h - imageH) / 2;
    else state.offsetY = Math.max(margin - imageH, Math.min(h - margin, state.offsetY));
  }

  function zoomAt(factor, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
    if (!state.image || state.navigationLocked) return;
    const old = state.viewScale;
    const next = Math.max(.01, Math.min(8, old * factor));
    const ratio = next / old;
    state.offsetX = x - (x - state.offsetX) * ratio;
    state.offsetY = y - (y - state.offsetY) * ratio;
    state.viewScale = next;
    clampOffset();
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
    if (state.autoPreview) $('outlinePointCount').textContent = `${state.autoPreview.points.length} points`;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!state.image) return;
    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.viewScale, state.viewScale);
    ctx.drawImage(state.image, 0, 0, state.imageWidth, state.imageHeight);
    state.features.forEach(feature => { if (feature.id !== state.editingFeatureId) drawFeature(feature); });
    if (state.autoPreview) drawFeature({ ...state.autoPreview, geometry: state.autoPreview.geometry || 'polygon' });
    if (state.autoPreview) drawPreviewVertices();
    if (state.activeMode === 'draw' && state.draft.length) drawDraft();
    if (state.activeMode === 'calibrate' && state.calibrationPoints.length) drawCalibrationDraft();
    ctx.restore();
  }

  function drawFeature(feature) {
    const spec = feature.type ? (TYPES[feature.type] || TYPES.point) : { label: 'Detected outline', color: '#43896d', shape: 'polygon' };
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
    const at = featureLabelPoint(feature);
    if (at && feature.name) {
      const fontSize = 12 / state.viewScale;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      const label = feature.name;
      const pad = 4 / state.viewScale;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(at.x - tw / 2 - pad, at.y - fontSize / 2 - pad / 2, tw + pad * 2, fontSize + pad);
      ctx.fillStyle = '#26382d';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, at.x, at.y);
    }
    ctx.restore();
  }

  function featureLabelPoint(feature) {
    const points = feature.points || [];
    if (!points.length) return null;
    if (feature.geometry !== 'polygon' || points.length < 3) {
      if (feature.geometry === 'line') return points[Math.floor(points.length / 2)];
      return points[0];
    }
    let areaTwice = 0, cx = 0, cy = 0;
    points.forEach((p, i) => {
      const next = points[(i + 1) % points.length];
      const cross = p.x * next.y - next.x * p.y;
      areaTwice += cross; cx += (p.x + next.x) * cross; cy += (p.y + next.y) * cross;
    });
    const centroid = Math.abs(areaTwice) > 1e-7 ? { x: cx / (3 * areaTwice), y: cy / (3 * areaTwice) } : null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
    let best = null, bestClearance = -1;
    const candidates = centroid ? [centroid] : [];
    for (let gy = 1; gy < 12; gy++) for (let gx = 1; gx < 12; gx++) {
      candidates.push({ x: minX + (maxX - minX) * gx / 12, y: minY + (maxY - minY) * gy / 12 });
    }
    candidates.forEach(candidate => {
      if (!pointInPolygon(candidate, points)) return;
      const clearance = distanceToPolygonEdge(candidate, points);
      if (clearance > bestClearance) { best = candidate; bestClearance = clearance; }
    });
    return best || centroid || points[0];
  }

  function pointInPolygon(point, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function distanceToPolygonEdge(point, points) {
    let nearest = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      nearest = Math.min(nearest, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
    }
    return nearest;
  }

  function drawPreviewVertices() {
    const points = state.autoPreview?.points || [];
    ctx.save();
    points.forEach((point, index) => {
      const selected = index === state.selectedPreviewVertex;
      ctx.beginPath();
      ctx.arc(point.x, point.y, (selected ? 6 : 4) / state.viewScale, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#ffffff' : '#38a5bb';
      ctx.fill();
      ctx.lineWidth = 1.5 / state.viewScale;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
    if (state.sectionPoints.length === 2) {
      ctx.beginPath(); ctx.moveTo(state.sectionPoints[0].x, state.sectionPoints[0].y);
      ctx.lineTo(state.sectionPoints[1].x, state.sectionPoints[1].y);
      ctx.strokeStyle = '#f6b544'; ctx.lineWidth = 2 / state.viewScale;
      ctx.setLineDash([6 / state.viewScale, 4 / state.viewScale]); ctx.stroke(); ctx.setLineDash([]);
    }
    state.sectionPoints.forEach(point => {
      ctx.beginPath(); ctx.arc(point.x, point.y, 7 / state.viewScale, 0, Math.PI * 2);
      ctx.fillStyle = '#f6b544'; ctx.fill(); ctx.lineWidth = 2 / state.viewScale;
      ctx.strokeStyle = '#fff'; ctx.stroke();
    });
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
    $('scaleReadout').textContent = ready ? `Scale: 1 ft = ${formatNumber(1 / state.ftPerPixel)} px · 1 acre = 43,560 sq ft` : 'Scale optional · measurements shown in image pixels';
    $('calibrateButton').disabled = !state.image || (state.activeMode && state.activeMode !== 'calibrate');
    $('exportMap').disabled = !state.image;
    $('saveProject').disabled = !state.image;
    $('drawButton').disabled = !state.image || (state.activeMode !== 'draw' && !$('featureType').value) || (state.activeMode && state.activeMode !== 'draw');
    if (!state.image) $('drawHelp').textContent = 'Load an image to start mapping. Scale is optional.';
    else if (!state.activeMode) $('drawHelp').textContent = ready ? 'Click an object for an automatic outline, or choose a type below for manual tracing.' : 'Click an object for an automatic outline, or choose a type below for manual tracing. Scale is optional.';
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
      if (f.geometry === 'polygon' && f.points.length >= 3) measure = `${formatNumber(polygonArea(f.points))} ${state.ftPerPixel ? 'sq ft' : 'px²'}`;
      else if (f.geometry === 'line') measure = `${formatNumber(lengthFeet(f.points))} ${state.ftPerPixel ? 'ft' : 'px'}`;
      else if (f.geometry === 'circle' && f.points.length >= 2) {
        const scale = state.ftPerPixel || 1;
        const r = Math.hypot(f.points[1].x - f.points[0].x, f.points[1].y - f.points[0].y) * scale;
        measure = `Ø ${formatNumber(2 * r)} ${state.ftPerPixel ? 'ft' : 'px'}`;
      } else if (f.geometry === 'point') measure = 'Point';
      return `<div class="feature-row"><span class="feature-swatch" style="background:${spec.color}"></span><div class="feature-meta"><b>${escapeHtml(f.name || spec.label)}</b><small>${spec.label} · ${f.confidence === 'estimated' ? 'estimated' : 'confirmed'}</small></div><span class="feature-area">${measure}</span><button class="delete-feature" data-delete="${i}" aria-label="Delete ${escapeHtml(f.name || spec.label)}" title="Delete">×</button></div>`;
    }).join('');
    list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => {
      pushUndo(`delete ${state.features[Number(button.dataset.delete)]?.name || 'object'}`);
      state.features.splice(Number(button.dataset.delete), 1); updateFeatureList();
    }));
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function setMode(mode) {
    if (mode !== 'draw') { state.manualTraceFromPopup = false; state.manualTraceName = ''; }
    if (mode !== 'auto-review') {
      state.autoPreview = null; state.editingFeatureId = null;
      $('acceptFeature').textContent = 'Add to map';
      $('objectEditorTitle').textContent = 'Outline found — what is it?';
    }
    if (mode !== 'auto-review') { state.simplifySectionMode = false; state.sectionPoints = []; }
    if (mode !== 'auto-review') {
      state.selectedPreviewVertex = null;
      state.draggingPreviewVertex = null;
      state.previewEditStart = null;
      $('removeOutlinePoint').disabled = true;
    }
    state.activeMode = mode;
    state.draft = [];
    $('selectTool').classList.toggle('active', !mode || mode === 'auto-select' || mode === 'auto-review');
    $('drawTool').classList.toggle('active', mode === 'draw');
    $('scaleTool').classList.toggle('active', mode === 'calibrate');
    $('selectTool').setAttribute('aria-pressed', String(!mode || mode === 'auto-select' || mode === 'auto-review'));
    $('drawTool').setAttribute('aria-pressed', String(mode === 'draw'));
    $('scaleTool').setAttribute('aria-pressed', String(mode === 'calibrate'));
    $('objectEditor').hidden = mode !== 'auto-review' || state.manualTraceFromPopup;
    $('inspectorEmpty').hidden = Boolean(state.autoPreview);
    $('manualTracePanel').hidden = !state.manualTraceFromPopup || mode !== 'draw';
    state.calibrationPoints = [];
    const drawing = mode === 'draw';
    $('drawButton').textContent = drawing ? 'Cancel manual tracing' : 'Start manual tracing';
    $('finishShape').disabled = !drawing;
    $('undoPoint').disabled = !drawing;
    $('calibrateButton').textContent = mode === 'calibrate' ? 'Cancel scale marking' : 'Mark scale on image';
    updateNavigationUI();
    if (mode === 'draw') $('drawHelp').textContent = getDrawHelp();
    else if (mode === 'calibrate') $('drawHelp').textContent = 'Click the first and second ends of your known distance.';
    else if (mode === 'auto-select') $('drawHelp').textContent = 'Click an object on the map to outline it.';
    else if (mode === 'auto-review') $('drawHelp').textContent = 'Choose the object type from the pop-up on the map.';
    else $('drawHelp').textContent = state.image ? 'Click an object for an automatic outline, or choose a type below for manual tracing.' : 'Load an image to start mapping. Scale is optional.';
    updateScaleDisplay();
    if (state.manualTraceFromPopup && mode === 'draw') {
      const kind = OBJECT_KINDS.flatMap(group => group.items).find(item => item[0] === state.manualTraceName);
      $('manualTraceTitle').textContent = `Trace ${kind?.[1] || 'feature'}`;
      $('manualTraceHelp').textContent = TYPES[$('featureType').value]?.shape === 'line'
        ? 'Click along the bridge or path. Finish when the line follows its center.'
        : 'Click around the feature boundary, then finish the outline.';
    }
    render();
  }

  function getDrawHelp() {
    if (!$('featureType').value) return 'Choose a feature label, then start manual tracing.';
    const shape = TYPES[$('featureType').value].shape;
    if (shape === 'polygon') return 'Click around the feature boundary; double-click or press Finish to close it.';
    if (shape === 'line') return 'Click along the curve or path; double-click or press Finish to end the line.';
    if (shape === 'circle') return 'Click the tree center, then click the canopy edge.';
    return 'Click the feature location once to place a marker.';
  }

  function outlineTolerance(type) {
    // Start with a deliberately simple sketch while leaving room to add detail.
    return ({ building: 8, water: 14, path: 4, hardscape: 8, parcel: 8, 'existing-bed': 8, 'no-plant': 8, tree: 8 })[type] ?? 10;
  }

  function populateObjectKinds() {
    const select = $('objectKind');
    OBJECT_KINDS.forEach(group => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.group;
      group.items.forEach(([value, label, type]) => {
        const option = document.createElement('option');
        option.value = value; option.textContent = label; option.dataset.type = type;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
  }

  function selectedObjectKind() {
    const option = $('objectKind').selectedOptions[0];
    return option?.dataset.type ? { value: option.value, label: option.textContent, type: option.dataset.type } : null;
  }

  function savedFeatureAt(point) {
    for (let i = state.features.length - 1; i >= 0; i--) {
      const feature = state.features[i];
      if (feature.geometry === 'polygon' && pointInPolygon(point, feature.points)) return feature;
    }
    return null;
  }

  function openSavedFeature(feature) {
    state.editingFeatureId = feature.id;
    state.autoPreview = {
      ...feature,
      points: copyPoints(feature.points),
      contourSource: null,
      activeContourSource: null,
      edited: true,
      pixel_count: null
    };
    const kindOptions = OBJECT_KINDS.flatMap(group => group.items);
    const matchedKind = kindOptions.find(item => item[1].toLowerCase() === String(feature.name || '').toLowerCase() && item[2] === feature.type)
      || kindOptions.find(item => item[2] === feature.type);
    $('objectKind').value = matchedKind?.[0] || '';
    $('objectName').value = feature.name || matchedKind?.[1] || '';
    $('featureName').value = feature.name || '';
    $('confidence').value = feature.confidence || 'estimated';
    $('objectEditorTitle').textContent = `Editing ${feature.name || 'feature'}`;
    $('acceptFeature').textContent = 'Save changes';
    $('acceptFeature').disabled = !matchedKind;
    $('outlineDetail').disabled = true;
    $('buildingCleanupControl').hidden = selectedObjectKind()?.type !== 'building';
    $('advancedDetection').hidden = selectedObjectKind()?.type !== 'water' || Boolean(state.editingFeatureId);
    setMode('auto-review');
    updateInspectorState();
    showNotice(`Editing ${feature.name || 'saved feature'}. Its saved outline is loaded.`);
    render();
  }

  function updateObjectKind() {
    const kind = selectedObjectKind();
    $('acceptFeature').disabled = !kind;
    $('buildingCleanupControl').hidden = !kind || kind.type !== 'building';
    $('advancedDetection').hidden = !kind || kind.type !== 'water' || Boolean(state.editingFeatureId);
    if (!state.autoPreview || !kind) return;
    state.autoPreview.type = kind.type;
    state.autoPreview.name = $('objectName').value.trim() || kind.label;
    $('buildingCleanupControl').hidden = kind.type !== 'building';
    if (!state.autoPreview.edited) {
      if (kind.type === 'water' && state.autoPreview.pixels) rerunDetection(Number($('detectionSensitivity').value));
      const tolerance = outlineTolerance(kind.type);
      $('outlineDetail').value = String(tolerance);
      $('outlineDetailValue').textContent = 'Balanced';
      refreshPreviewOutline();
    }
    if (!$('objectName').value.trim()) $('objectName').value = kind.label;
    render();
  }

  function refreshPreviewOutline() {
    if (!state.autoPreview || state.autoPreview.edited) return;
    const kind = selectedObjectKind();
    let source = state.autoPreview.contourSource;
    if (kind?.type === 'water' && state.autoPreview.mask) {
      const cleaned = SiteSegmentation.cleanWaterMask(state.autoPreview.mask, state.autoPreview.workWidth, state.autoPreview.workHeight);
      source = SiteSegmentation.contourFromMask(cleaned, state.autoPreview.workWidth, state.autoPreview.workHeight, .5)
        .map(p => ({ x: p.x * state.imageWidth / state.autoPreview.workWidth, y: p.y * state.imageHeight / state.autoPreview.workHeight }));
    }
    if (kind?.type === 'building' && state.autoPreview.mask) {
      const cleaned = SiteSegmentation.cleanBuildingMask(state.autoPreview.mask, state.autoPreview.workWidth, state.autoPreview.workHeight, Number($('buildingCleanup').value));
      source = SiteSegmentation.contourFromMask(cleaned, state.autoPreview.workWidth, state.autoPreview.workHeight, .5)
        .map(p => ({ x: p.x * state.imageWidth / state.autoPreview.workWidth, y: p.y * state.imageHeight / state.autoPreview.workHeight }));
    }
    state.autoPreview.activeContourSource = source;
    state.autoPreview.points = SiteSegmentation.simplifyContour(source, Number($('outlineDetail').value));
    $('outlinePointCount').textContent = `${state.autoPreview.points.length} points`;
  }

  function updateInspectorState() {
    $('inspectorEmpty').hidden = Boolean(state.autoPreview);
    $('objectEditor').hidden = !state.autoPreview || state.manualTraceFromPopup;
  }

  function rerunDetection(sensitivity) {
    const preview = state.autoPreview;
    if (!preview?.pixels || preview.edited) return;
    const result = SiteSegmentation.regionMask(preview.pixels.data, preview.workWidth, preview.workHeight,
      preview.seed.x, preview.seed.y, sensitivity, preview.allowedMask);
    preview.mask = result.mask;
    preview.pixel_count = result.count;
    preview.contourSource = SiteSegmentation.contourFromMask(result.mask, preview.workWidth, preview.workHeight, .5)
      .map(p => ({ x: p.x * state.imageWidth / preview.workWidth, y: p.y * state.imageHeight / preview.workHeight }));
    $('detectionSensitivityValue').textContent = String(sensitivity);
    refreshPreviewOutline();
    render();
  }

  function runAutoFeatureTrace(seedPoint) {
    if (!state.image || !seedPoint) return;
    try {
      const maxDimension = 1600;
      const ratio = Math.min(1, maxDimension / Math.max(state.imageWidth, state.imageHeight));
      const workCanvas = document.createElement('canvas');
      workCanvas.width = Math.max(3, Math.round(state.imageWidth * ratio));
      workCanvas.height = Math.max(3, Math.round(state.imageHeight * ratio));
      const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
      workCtx.drawImage(state.image, 0, 0, workCanvas.width, workCanvas.height);
      const pixels = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
      const parcel = state.features.find(feature => feature.type === 'parcel' && feature.geometry === 'polygon');
      const allowedPolygon = parcel?.points.map(p => ({
        x: p.x * workCanvas.width / state.imageWidth,
        y: p.y * workCanvas.height / state.imageHeight
      })) || null;
      const allowedMask = SiteSegmentation.polygonMask(workCanvas.width, workCanvas.height, allowedPolygon);
      const seed = { x: seedPoint.x * workCanvas.width / state.imageWidth, y: seedPoint.y * workCanvas.height / state.imageHeight };
      const result = SiteSegmentation.regionMask(pixels.data, workCanvas.width, workCanvas.height, seed.x, seed.y, 24, allowedMask);
      const contourSource = SiteSegmentation.contourFromMask(result.mask, workCanvas.width, workCanvas.height, .5)
        .map(p => ({ x: p.x * state.imageWidth / workCanvas.width, y: p.y * state.imageHeight / workCanvas.height }));
      const type = null;
      const tolerance = outlineTolerance(type);
      $('outlineDetail').value = String(tolerance);
      $('outlineDetailValue').textContent = 'Balanced';
      $('outlineDetail').disabled = false;
      const points = SiteSegmentation.simplifyContour(contourSource, tolerance);
      if (result.count < 24 || points.length < 3) throw new Error('Could not find a clear color boundary there. Try clicking farther inside the feature.');
      state.editingFeatureId = null;
      $('acceptFeature').textContent = 'Add to map';
      state.autoPreview = {
        points, contourSource, mask: result.mask, pixels, allowedMask, seed, workWidth: workCanvas.width, workHeight: workCanvas.height,
        activeContourSource: contourSource, edited: false, geometry: 'polygon', type,
        name: '', confidence: $('confidence').value, pixel_count: result.count
      };
      state.objectAnchor = seedPoint;
      $('objectKind').value = '';
      $('objectName').value = '';
      $('acceptFeature').disabled = true;
      $('objectEditorTitle').textContent = 'Outline found — what is it?';
      setMode('auto-review');
      $('removeOutlinePoint').disabled = true;
      $('detectionSensitivity').value = '24'; $('detectionSensitivityValue').textContent = '24';
      updateInspectorState();
      $('outlinePointCount').textContent = `${points.length} points`;
      showNotice('Outline found. Choose its type in the inspector.');
    } catch (error) {
      state.autoPreview = null;
      setMode(null);
      showNotice(error.message || 'Automatic detection could not isolate that feature. Try another point.');
    }
  }

  function acceptAutoFeature() {
    if (!state.autoPreview) return;
    const kind = selectedObjectKind();
    if (!kind) { showNotice('Choose what the object is in the map pop-up.'); return; }
    const type = kind.type;
    const name = $('objectName').value.trim() || kind.label;
    const editIndex = state.editingFeatureId ? state.features.findIndex(feature => feature.id === state.editingFeatureId) : -1;
    pushUndo(`${editIndex >= 0 ? 'edit' : 'add'} ${name}`);
    if (editIndex >= 0) {
      state.features[editIndex] = {
        ...state.features[editIndex], name, type, geometry: state.autoPreview.geometry || 'polygon',
        confidence: $('confidence').value, points: copyPoints(state.autoPreview.points)
      };
    } else {
      state.features.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `feature-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name, type, geometry: state.autoPreview.geometry || 'polygon', confidence: $('confidence').value,
        points: copyPoints(state.autoPreview.points)
      });
    }
    state.editingFeatureId = null;
    state.autoPreview = null; $('featureName').value = ''; $('objectName').value = '';
    $('acceptFeature').textContent = 'Add to map'; $('objectEditorTitle').textContent = 'Outline found — what is it?';
    setMode(null); updateFeatureList(); showNotice(editIndex >= 0 ? `${name} changes saved.` : `${name} added to this site.`);
  }

  function cancelAutoFeature() {
    state.editingFeatureId = null;
    state.autoPreview = null;
    $('acceptFeature').textContent = 'Add to map'; $('objectEditorTitle').textContent = 'Outline found — what is it?';
    setMode(null); render();
  }

  function closestPreviewVertex(point, maxDistance) {
    const points = state.autoPreview?.points || [];
    let nearest = -1, distance = maxDistance;
    points.forEach((p, i) => {
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < distance) { nearest = i; distance = d; }
    });
    return nearest;
  }

  function addPreviewVertex(event) {
    if (!state.autoPreview) return;
    const point = imagePoint(event), points = state.autoPreview.points;
    if (!insideImage(point)) return;
    let best = { distance: Infinity, index: -1, point: null };
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const projected = { x: a.x + t * dx, y: a.y + t * dy };
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance < best.distance) best = { distance, index: i + 1, point: projected };
    }
    if (best.distance > 72 / state.viewScale) return;
    pushUndo('add outline point');
    state.autoPreview.edited = true;
    $('outlineDetail').disabled = true;
    state.autoPreview.points.splice(best.index, 0, point);
    state.selectedPreviewVertex = best.index;
    $('removeOutlinePoint').disabled = false;
    render();
  }

  function removeSelectedPreviewVertex() {
    if (!state.autoPreview || state.selectedPreviewVertex === null) return;
    const minimum = state.autoPreview.geometry === 'line' ? 2 : 3;
    if (state.autoPreview.points.length <= minimum) { showNotice(`This feature needs at least ${minimum} points.`); return; }
    pushUndo('remove outline point');
    state.autoPreview.edited = true;
    $('outlineDetail').disabled = true;
    state.autoPreview.points.splice(state.selectedPreviewVertex, 1);
    state.selectedPreviewVertex = null;
    $('removeOutlinePoint').disabled = true;
    render();
  }

  function nearestContourLocation(point, points) {
    let best = { distance: Infinity, edge: -1, t: 0, point: null };
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const projected = { x: a.x + t * dx, y: a.y + t * dy };
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance < best.distance) best = { distance, edge: i, t, point: projected };
    }
    return best;
  }

  function arcBetween(ring, from, to) {
    const arc = [ring[from]];
    let index = from;
    while (index !== to && arc.length <= ring.length) {
      index = (index + 1) % ring.length;
      arc.push(ring[index]);
    }
    return arc;
  }

  function arcLength(ring, from, to) {
    let length = 0;
    const arc = arcBetween(ring, from, to);
    for (let i = 1; i < arc.length; i++) {
      length += Math.hypot(arc[i].x - arc[i - 1].x, arc[i].y - arc[i - 1].y);
    }
    return length;
  }

  function finishStraightenSection() {
    if (!state.autoPreview || state.sectionPoints.length !== 2) return;
    const points = state.autoPreview.points;
    const locations = state.sectionPoints.map(p => nearestContourLocation(p, points));
    const entries = [];
    for (let i = 0; i < points.length; i++) {
      entries.push({ point: points[i], t: 0, edge: i });
      locations.forEach((location, endpoint) => {
        if (location.edge === i && location.t > 1e-5 && location.t < 1 - 1e-5) {
          entries.push({ point: location.point, t: location.t, edge: i, endpoint });
        }
      });
    }
    entries.sort((a, b) => a.edge - b.edge || a.t - b.t);
    locations.forEach((location, endpoint) => {
      const exactVertex = location.t <= 1e-5 ? location.edge : (location.t >= 1 - 1e-5 ? (location.edge + 1) % points.length : -1);
      if (exactVertex >= 0) entries.find(entry => entry.edge === exactVertex && entry.t === 0).endpoint = endpoint;
    });
    const ids = locations.map((_, endpoint) => entries.findIndex(entry => entry.endpoint === endpoint));
    if (ids.some(index => index < 0) || ids[0] === ids[1]) {
      state.sectionPoints = [];
      showNotice('Choose two different points on the outline.'); render(); return;
    }
    const ring = entries.map(entry => entry.point);
    const firstLength = arcLength(ring, ids[0], ids[1]);
    const secondLength = arcLength(ring, ids[1], ids[0]);
    const removedLength = Math.min(firstLength, secondLength);
    const kept = firstLength <= secondLength
      ? arcBetween(ring, ids[1], ids[0])
      : arcBetween(ring, ids[0], ids[1]);
    if (kept.length < 3) {
      state.sectionPoints = [];
      showNotice('Those points are too close together. Choose two points farther apart.'); render(); return;
    }
    if (removedLength < 4 / state.viewScale) {
      state.sectionPoints = [];
      showNotice('Those points are almost touching. Choose points on either side of the extra dots.'); render(); return;
    }
    state.sectionPoints = [];
    pushUndo('straighten outline section');
    state.autoPreview.points = copyPoints(kept);
    state.autoPreview.edited = true;
    $('outlineDetail').disabled = true;
    $('straightenSection').textContent = 'Cancel border edit';
    showNotice('Border simplified. Click two points to clean another section, or cancel border edit.');
    render();
  }

  function handleSectionClick(point) {
    const nearest = nearestContourLocation(point, state.autoPreview?.points || []);
    if (nearest.distance > 80 / state.viewScale) {
      showNotice('Click on the outline to mark both ends of the messy section.'); return;
    }
    state.sectionPoints.push(nearest.point);
    if (state.sectionPoints.length === 2) finishStraightenSection();
    else { showNotice('First end marked. Click the other end of the messy section.'); render(); }
  }

  function startManualTraceFromPopup() {
    const kind = selectedObjectKind();
    if (!kind || !state.autoPreview) { showNotice('Choose what the object is first.'); return; }
    state.manualTraceFromPopup = true;
    state.manualTraceName = kind.value;
    $('featureType').value = kind.type;
    $('featureName').value = $('objectName').value.trim() || kind.label;
    setMode('draw');
    $('manualTracePanel').hidden = false;
    updateScaleDisplay();
    showNotice(`Trace the ${kind.label.toLowerCase()} directly on the map.`);
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
    pushUndo(`add ${name}`);
    state.features.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `feature-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name, type, geometry: shape, confidence: $('confidence').value,
      points: state.draft.map(p => ({ x: p.x, y: p.y }))
    });
    $('featureName').value = '';
    state.manualTraceFromPopup = false;
    state.manualTraceName = '';
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
    pushUndo('set scale');
    const imagePixels = measured.pixelDistance;
    state.ftPerPixel = measured.feetPerPixel;
    state.calibration = { points: [a, b], distance_ft: distance, pixel_distance: +imagePixels.toFixed(3) };
    $('mapHint').textContent = state.location || 'Scale calibrated · ready to trace';
    setMode(null); updateScaleDisplay(); updateFeatureList(); render();
    showNotice(`Scale set: ${formatNumber(imagePixels / distance)} px per foot.`);
  }

  function onMapClick(event) {
    if (state.suppressClick) { state.suppressClick = false; return; }
    if (!state.image || state.panning) return;
    const p = imagePoint(event);
    if (!insideImage(p)) return;
    if (state.activeMode === 'auto-review' && state.simplifySectionMode) { handleSectionClick(p); return; }
    if (state.activeMode === 'calibrate') {
      pushUndo('mark scale point');
      state.calibrationPoints.push(p);
      if (state.calibrationPoints.length === 2) completeCalibration();
      else render();
      return;
    }
    if (state.activeMode === 'auto-select') {
      const savedFeature = savedFeatureAt(p);
      if (savedFeature) { openSavedFeature(savedFeature); return; }
      runAutoFeatureTrace(p);
      return;
    }
    if (!state.activeMode) {
      const savedFeature = savedFeatureAt(p);
      if (savedFeature) { openSavedFeature(savedFeature); return; }
      runAutoFeatureTrace(p);
      return;
    }
    if (state.activeMode !== 'draw' || event.detail > 1) return;
    const type = $('featureType').value;
    const shape = TYPES[type].shape;
    pushUndo('add trace point');
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
        state.features = []; state.draft = []; state.activeMode = null; state.autoPreview = null; state.editingFeatureId = null; state.hasFit = false; state.navigationLocked = true; state.undoStack = [];
        setMode(null);
        $('emptyState').hidden = true;
        $('imageStatus').textContent = `${file.name} · ${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px`;
        $('mapHint').textContent = 'Image loaded · click any object to outline it';
        resizeCanvas(); updateScaleDisplay(); updateFeatureList(); updateUndoButton(); showNotice('Image loaded. Click an object to outline it; scale is optional.');
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
      points_local_ft: state.ftPerPixel ? f.points.map(localFeet) : null
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
    if (!state.image) { showNotice('Load an image before saving.'); return; }
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
          state.activeMode = null; state.draft = []; state.autoPreview = null; state.editingFeatureId = null; state.hasFit = false; state.navigationLocked = true; state.undoStack = [];
          setMode(null);
          $('emptyState').hidden = true;
          $('siteName').dispatchEvent(new Event('input'));
          $('imageStatus').textContent = `${state.imageName} · ${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px`;
          resizeCanvas(); updateScaleDisplay(); updateFeatureList(); updateUndoButton(); showNotice('Site project opened.');
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
      if (f.name && pts[0]) {
        const at=featureLabelPoint(f), size=Math.max(16,out.width/100), pad=Math.max(5,size/3);
        outCtx.setLineDash([]); outCtx.font=`600 ${size}px system-ui`; outCtx.textAlign='center'; outCtx.textBaseline='middle';
        const labelWidth=outCtx.measureText(f.name).width;
        outCtx.fillStyle='rgba(255,255,255,.9)'; outCtx.fillRect(at.x-labelWidth/2-pad,at.y-size/2-pad/2,labelWidth+pad*2,size+pad);
        outCtx.fillStyle='#203128'; outCtx.fillText(f.name,at.x,at.y);
      }
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
    state.ftPerPixel = null; state.calibration = null; state.calibrationPoints = []; state.features = []; state.draft = []; state.autoPreview = null; state.editingFeatureId = null;
    state.activeMode = null; state.hasFit = false; state.offsetX = 0; state.offsetY = 0; state.navigationLocked = true; state.undoStack = [];
    $('siteName').value = 'Untitled Florida site'; $('siteLocation').value = '';
    $('imageStatus').textContent = 'No image loaded yet.'; $('emptyState').hidden = false;
    setMode(null); updateProjectHeading(); updateScaleDisplay(); updateFeatureList(); updateUndoButton(); render();
  }

  $('siteName').addEventListener('input', updateProjectHeading);
  $('siteLocation').addEventListener('input', updateProjectHeading);
  $('chooseImage').addEventListener('click', () => $('imageFile').click());
  $('emptyChooseImage').addEventListener('click', () => $('imageFile').click());
  $('imageFile').addEventListener('change', e => openImage(e.target.files[0]));
  $('calibrateButton').addEventListener('click', () => setMode(state.activeMode === 'calibrate' ? null : 'calibrate'));
  $('drawButton').addEventListener('click', () => setMode(state.activeMode === 'draw' ? null : 'draw'));
  $('selectTool').addEventListener('click', () => setMode('auto-select'));
  $('drawTool').addEventListener('click', () => setMode(state.activeMode === 'draw' ? 'auto-select' : 'draw'));
  $('scaleTool').addEventListener('click', () => setMode(state.activeMode === 'calibrate' ? 'auto-select' : 'calibrate'));
  $('finishShape').addEventListener('click', finishDrawing);
  $('undoPoint').addEventListener('click', undoLastAction);
  $('featureType').addEventListener('change', () => {
    if (state.activeMode === 'draw') $('drawHelp').textContent = getDrawHelp();
    updateScaleDisplay();
  });
  $('objectKind').addEventListener('change', () => {
    const kind = selectedObjectKind();
    $('objectName').value = kind?.label || '';
    updateObjectKind();
  });
  $('objectName').addEventListener('input', () => {
    if (state.autoPreview) {
      state.autoPreview.name = $('objectName').value.trim();
      if (state.editingFeatureId) $('objectEditorTitle').textContent = `Editing ${state.autoPreview.name || 'feature'}`;
      render();
    }
  });
  $('outlineDetail').addEventListener('input', () => {
    if (!state.autoPreview || state.autoPreview.edited) return;
    refreshPreviewOutline();
    $('outlineDetailValue').textContent = `${state.autoPreview.points.length} points`;
    render();
  });
  $('detectionSensitivity').addEventListener('input', () => {
    if (!state.autoPreview || selectedObjectKind()?.type !== 'water') return;
    try { rerunDetection(Number($('detectionSensitivity').value)); }
    catch (error) { showNotice(error.message || 'Could not update water detection.'); }
  });
  $('buildingCleanup').addEventListener('input', () => {
    $('buildingCleanupValue').textContent = `${$('buildingCleanup').value} px`;
    refreshPreviewOutline();
    render();
  });
  $('removeOutlinePoint').addEventListener('click', removeSelectedPreviewVertex);
  $('straightenSection').addEventListener('click', () => {
    if (!state.autoPreview) return;
    state.simplifySectionMode = !state.simplifySectionMode;
    state.sectionPoints = [];
    $('straightenSection').textContent = state.simplifySectionMode ? 'Cancel border edit' : 'Simplify border';
    showNotice(state.simplifySectionMode ? 'Click two points around the extra dots. That stretch will become a straight line.' : 'Border edit canceled.');
    render();
  });
  $('traceManually').addEventListener('click', startManualTraceFromPopup);
  $('finishManualTrace').addEventListener('click', finishDrawing);
  $('cancelManualTrace').addEventListener('click', () => {
    state.manualTraceFromPopup = false; state.manualTraceName = ''; $('featureName').value = ''; setMode(null);
  });
  $('acceptFeature').addEventListener('click', acceptAutoFeature);
  $('cancelFeature').addEventListener('click', cancelAutoFeature);
  $('cancelFeatureText').addEventListener('click', cancelAutoFeature);
  $('saveProject').addEventListener('click', saveProject);
  $('loadProject').addEventListener('click', () => $('projectFile').click());
  $('projectFile').addEventListener('change', e => { loadProject(e.target.files[0]); e.target.value = ''; });
  $('newProject').addEventListener('click', startNewSite);
  $('exportMap').addEventListener('click', exportMap);
  $('fitMap').addEventListener('click', fitImage);
  $('zoomIn').addEventListener('click', () => zoomAt(1.2));
  $('zoomOut').addEventListener('click', () => zoomAt(1/1.2));
  $('undoAction').addEventListener('click', undoLastAction);
  populateObjectKinds();
  updateUndoButton();
  $('mapLock').addEventListener('click', () => {
    state.navigationLocked = !state.navigationLocked;
    state.panning = null;
    state.suppressClick = false;
    updateNavigationUI();
    showNotice(state.navigationLocked ? 'Map position locked. Clicks still trace and edit.' : 'Map unlocked. Drag or scroll to navigate; clicks still trace.');
  });
  canvas.addEventListener('click', onMapClick);
  canvas.addEventListener('dblclick', event => {
    event.preventDefault();
    if (state.activeMode === 'auto-review') { addPreviewVertex(event); return; }
    if (state.activeMode === 'draw') finishDrawing();
  });
  canvas.addEventListener('pointerdown', event => {
    if (state.activeMode === 'auto-review' && !state.simplifySectionMode && event.button === 0) {
      const point = imagePoint(event);
      const index = closestPreviewVertex(point, 12 / state.viewScale);
      if (index >= 0) {
        state.selectedPreviewVertex = index;
        $('removeOutlinePoint').disabled = false;
        state.draggingPreviewVertex = index;
        state.previewEditStart = state.autoPreview.points.map(p => ({ x: p.x, y: p.y }));
        state.previewUndoRecorded = false;
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = 'grabbing';
        event.preventDefault();
        render();
        return;
      }
    }
    if (!state.navigationLocked && (event.button === 0 || event.button === 1 || state.spaceDown)) {
      state.panning = { x: event.clientX, y: event.clientY, ox: state.offsetX, oy: state.offsetY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (state.draggingPreviewVertex !== null && state.autoPreview) {
      const point = imagePoint(event);
      point.x = Math.max(0, Math.min(state.imageWidth, point.x));
      point.y = Math.max(0, Math.min(state.imageHeight, point.y));
      const original = state.previewEditStart?.[state.draggingPreviewVertex];
      if (!state.previewUndoRecorded && original && (point.x !== original.x || point.y !== original.y)) {
        pushUndo('reshape outline');
        state.previewUndoRecorded = true;
      }
      state.autoPreview.points[state.draggingPreviewVertex] = point;
      render(); return;
    }
    if (state.panning) {
      const dx = event.clientX - state.panning.x, dy = event.clientY - state.panning.y;
      if (!state.panning.moved && Math.hypot(dx, dy) < 4) return;
      state.panning.moved = true;
      canvas.style.cursor = 'grabbing';
      state.offsetX = state.panning.ox + event.clientX - state.panning.x;
      state.offsetY = state.panning.oy + event.clientY - state.panning.y;
      clampOffset();
      render(); return;
    }
    if (state.image) {
      const p = imagePoint(event);
      $('coordinatesReadout').textContent = insideImage(p) ? `Image: ${Math.round(p.x)} px, ${Math.round(p.y)} px` : 'Image coordinates appear here';
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (state.panning?.moved) state.suppressClick = true;
    state.panning = null;
    if (state.draggingPreviewVertex !== null) {
      const start = state.previewEditStart || [];
      const end = state.autoPreview?.points || [];
      if (state.previewUndoRecorded && start.length && start.some((p, i) => p.x !== end[i]?.x || p.y !== end[i]?.y)) {
        state.autoPreview.edited = true;
        $('outlineDetail').disabled = true;
      }
      state.draggingPreviewVertex = null;
      state.previewEditStart = null;
      state.previewUndoRecorded = false;
    }
    updateNavigationUI();
  });
  canvas.addEventListener('wheel', event => {
    if (!state.image) return;
    event.preventDefault();
    if (state.navigationLocked) return;
    const units = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * units));
    const factor = Math.exp(-delta * .0015);
    const p = canvasPoint(event); zoomAt(factor, p.x, p.y);
  }, { passive: false });
  stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drag-over'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag-over'));
  stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('drag-over'); const file=e.dataTransfer.files[0]; if(file?.type.startsWith('image/')) openImage(file); else if(file) loadProject(file); });
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { state.spaceDown = true; event.preventDefault(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); undoLastAction(); }
    if (event.key === 'Escape') setMode(null);
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.activeMode === 'auto-review' && state.selectedPreviewVertex !== null && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault(); removeSelectedPreviewVertex();
    }
    if (event.key === 'Enter' && state.activeMode === 'draw' && document.activeElement.tagName !== 'INPUT') finishDrawing();
    if ((event.key === 'Backspace' || event.key === 'Delete') && state.activeMode === 'draw' && document.activeElement.tagName !== 'INPUT') { state.draft.pop(); render(); }
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') state.spaceDown = false; });
  window.addEventListener('blur', () => { state.spaceDown = false; state.panning = null; updateNavigationUI(); });
  updateProjectHeading(); updateScaleDisplay(); updateNavigationUI(); resizeCanvas();
})();
