# Florida Friendly Planting Planner

A [Claude](https://claude.com) plugin that turns a Florida property into a finished, shareable landscape plan set built on [Florida-Friendly Landscaping™](https://ffl.ifas.ufl.edu/) principles and Florida native plants.

Give Claude a property (a county GIS link, an address, photos or a site video) and it can:

1. **Measure the site** from your county property appraiser's GIS viewer: parcel lines, aerial features, older aerial years, and cross-checks against site photos or video.
2. **Design the planting**: a native / Florida-Friendly palette, drift-style beds, a permeable nature path, and a drip irrigation retrofit by hydrozone.
3. **Deliver an interactive HTML plan set**: a clickable planting plan, plant schedule, path and irrigation sheets, construction details and notes.
4. **Phase and price it**: a year-by-year buildout under an annual budget, with nursery pricing, labor allowances and a top-down render of each year.

It works for home yards, HOA common areas, pool grounds, school gardens and other small sites.

## Independent site mapper (prototype)

`standalone/` contains the first step toward a separate, local program. Open `standalone/index.html` in a modern browser to upload an aerial image, calibrate its scale from a known distance, trace site features, and save or reopen each property as its own `.siteplan` file. It runs on the device without Claude, an account, a server, or an AI service. You can also export an annotated PNG.

This is currently the mapping foundation, not the complete planting planner. It does not yet georeference GIS/GeoTIFF files, set north, automatically interpret aerials, or feed the traced site into the existing planting-plan generator. The feature traces are manual and dimensions depend on the accuracy of the chosen scale and trace. Desktop packaging and connecting site projects to the plan generator are next development steps.

To check its geometry code, run `node standalone/tests/test-site-geometry.js`.

## Skills

| Skill | What it does |
|---|---|
| `parcel-site-measurement` | Measures a property from a county GIS map viewer (ArcGIS-based viewers such as many Florida property appraisers use): parcel lines, aerial features, scale, and site-video cross-checks. |
| `native-landscape-plan` | Florida-native / Florida-Friendly design rules, drift layout, nature paths, drip irrigation, presentation drawings, and a clickable interactive planting plan delivered as an HTML page. |
| `phased-landscape-budget` | Local nursery pricing, materials, labor allowances, and a year-by-year buildout under an annual budget with top-down renders of each year. |

## Install

### Claude Code
```bash
claude plugin marketplace add MrArron/florida-friendly-planting-planner
```
```bash
claude plugin install florida-friendly-planting-planner@florida-friendly-planting-planner
```

Or inside an interactive `claude` session: `/plugin marketplace add MrArron/florida-friendly-planting-planner`, then `/plugin install florida-friendly-planting-planner`.

### Claude desktop / claude.ai
Download this repository as a ZIP (or grab a `.plugin` file from [Releases](https://github.com/MrArron/florida-friendly-planting-planner/releases)) and add it as a plugin from the app's plugin settings.

## Try it

> Design a Florida-Friendly planting plan for my front yard. Here's the parcel on my county property appraiser's map: <link>. I want a small nature path, no lawn in the side yard, and a budget of about $2,000 a year.

Claude will measure the site, research a native palette for your USDA zone, lay out the beds and path, and publish the plan set.

## Reference code

`skills/native-landscape-plan/references/project-code/` holds a complete Python reference build for a **fictional** example site ("Sample Community Pool Garden"): a shapely layout engine, SVG renderer, irrigation, construction details, scheduler, phase renders and the page builder. Claude copies and adapts it for a new site rather than starting from scratch. See its [README](skills/native-landscape-plan/references/project-code/README.md).

Requirements: Python 3 with `shapely` and `numpy`. Playwright with Chromium is optional, for checking renders.

## Important notes

- **Prices are illustrative.** The bundled plant prices are example figures from October 2026. Always re-price at a local native plant nursery (find one through the [Florida Association of Native Nurseries](https://www.plantrealflorida.org/)).
- **Check local rules.** Watering restrictions come from your water management district, and fertilizer ordinances vary by county and city.
- **Not professional services.** Plans produced with this plugin are concept designs. Confirm property lines, utilities (call 811 before you dig), right-of-way permissions, and HOA approvals before building. Florida Statute 373.185 protects Florida-Friendly Landscaping from HOA prohibition, but HOAs may still review designs.

## Contributing

Issues and pull requests are welcome, especially plant palette corrections, support for more county GIS viewers, and regional notes for North, Central and South Florida.

## License

[MIT](LICENSE) © 2026 Arron Lampkin
