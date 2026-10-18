# Historical change

The old point_in_polygon_tool(point, polygon) was removed. The real replacement points_within_polygon_tool requires points=[point] and polygon; its response is points_within/count/total instead of inside/point. Preserving the old contract requires dynamic singleton-array construction and a count-to-boolean conversion, while retaining the original input point.

Old: v0.11.0, `7d2c0f323915ebd4aeb3ff6721cae51c81300941`
New: v0.12.3, `aae9e2fa777aab88809950032841675a844691df`

- https://github.com/mapbox/mcp-server/blob/aae9e2fa777aab88809950032841675a844691df/CHANGELOG.md
- https://github.com/mapbox/mcp-server/commit/85eb71d9b2283a42c5d6de2e33c93f748feeff82

Native source excerpts and hashes are retained in source-evidence. Both servers were executed before acceptance.
