# Add a tool

Read the [manifest schema](../schemas/tool.schema.json) and [Design SDK API](../packages/design-sdk/src/index.d.mts).

1. Add `tools/<id>/tool.json` with a stable purpose label, folder, and route. Set its library category to `concrete`, `steel`, `composite`, or `general`. Declare verified design standards in `designCodes` as entries with an `id` and a display `label`. Omit the field for general-purpose tools without a design standard.
2. Register a page adapter for snapshot, restore, and a Canvas report when supported.
3. Validate inputs before invoking the calculation. Preserve unknown fields and add a migration for each schema transition.
4. Register the route in the build. The hub automatically discovers its manifest.
5. Verify saving, reopening, duplication, portable import, and reports.
