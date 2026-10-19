# Florida-Friendly Site Mapper

This folder is an offline-first mapping prototype for the independent planner.
It runs as a static browser app and has no Claude, AI, account, server, or map
provider dependency.

## Use it

1. Open `index.html` in a current desktop browser.
2. Name the property and load an aerial or map screenshot (PNG, JPG, or WebP).
3. Choose a distance visible in the image, mark its two endpoints, and enter
   that distance in feet. Prefer a long, reliable reference measurement.
4. Trace boundaries and site features. Use the feature list to review or delete
   traces. Estimated features are drawn with dashed outlines.
5. Save the project as a `.siteplan` file. That file includes the aerial and the
   map traces, so keep it private if the image shows a private property.

Click **Select**, then click inside a pond or another feature. Choose its type in
the fixed inspector beside the map. Water outlines start simplified to suppress
small shoreline and canopy noise. Move the **Outline detail** slider toward
either more detail or fewer points; the point count updates with the preview.
Detected objects have an advanced color sensitivity control for cases where
the first detection spills into nearby colors or misses part of the feature.
Sidewalks and paths become editable centerlines; paved areas remain filled
outlines. Drag, add, or remove points for final corrections. The source image is
unchanged, and the map stays visible while the inspector controls remain in one
place. Scale is optional until you need real-world measurements.

Scroll to zoom; drag with the middle mouse button or hold Space and drag to pan.
Use “Export map PNG” for an annotated image. The app stores project data only in
the file you download; it does not upload the aerial or project.

## Current limits

- Scale and most features are traced manually. Water tracing is assisted and
  should be reviewed. Accuracy depends on the source image, reference distance,
  and trace quality.
- Coordinates use image pixels converted to local feet from the image's top-left
  corner. North and geographic coordinates are not known.
- GIS/GeoTIFF georeferencing, automatic aerial feature recognition, and direct
  connection to the planting-plan generator are not implemented yet.
- This prototype creates a site map and measurements, not a finished planting
  design or construction plan.

## Check the geometry helpers

```sh
node tests/test-site-geometry.js
node tests/test-site-segmentation.js
```
