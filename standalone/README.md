# Florida-Friendly Site Mapper

This folder is an offline-first mapping prototype for the independent planner.
It runs as a static browser app and has no Claude, AI, account, server, or map
provider dependency.

## Use it

1. Open `index.html` in a current desktop browser. The Country Walk example image
   loads automatically with an empty map each time the app starts.
2. Name the property and load another aerial or map screenshot (PNG, JPG, or WebP)
   when you want to test a different site. **New site** clears the example image;
   reopening the app starts with it again.
3. Scale is optional. When you need real measurements, choose a distance visible
   in the image, mark its two endpoints, and enter that distance in feet.
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
Sidewalks, walkways, trails, and footbridges share one editable path centerline;
driveways, patios, and other paved surfaces remain filled outlines. Drag, add,
or remove points for final corrections. The source image is
unchanged, and the map stays visible while the inspector controls remain in one
place. Scale is optional until you need real-world measurements.

For a path preview, choose **Path** and use **Guide path with a stroke** to drag
roughly down its middle. The prototype uses nearby image-edge contrast to align
the centerline; review it carefully where shadows or a bridge interrupt the edge.

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
