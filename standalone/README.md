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

For a pond or other water body, choose **Pool or water feature · polygon**, then
click **Auto-trace water · click pond** and click inside the water. Review the
preview, adjust the tolerance if the outline is too tight or spills outside the
shoreline, then apply and accept it. The selection runs locally using pixel
color and edge differences. Reflections, deep shadows, or vegetation can still
confuse it, so inspect the preview; manual tracing remains available.

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
