# mCalc Platform

Use English for source, UI, reports, and repository documentation.

- Run `npm test`, `npm run check-boundaries`, `npm run build`, and `npm run test:browser` before publishing.
- Run upstream typecheck, lint, unit, and browser suites when changing an imported tool. Platform CI runs the full Canvas suite when its pinned revision or shared integration changes. Use manual Platform CI to run the full Canvas suite on demand.
- For formula or solver changes, verify the affected module against its reference examples before publishing.
- Keep engineering calculations with the owning tool. The platform owns design, project, and report lifecycles.
- Treat tool manifests and SDK exports as the public contract. Preserve stable IDs and use sequential schema migrations.
- Preserve unknown input fields. Protect newer schemas from writes.
- Verify code clauses, reference examples, and National Annex values before introducing engineering content.
- Keep new source files to 300 lines. Read [architecture](docs/ARCHITECTURE.md) and the [tool guide](docs/TOOL_GUIDE.md).
