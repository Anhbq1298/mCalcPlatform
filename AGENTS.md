# mCalc Platform

Use English for source, UI, reports, and repository documentation.

- Run `npm test`, `npm run check-boundaries`, and `npm run build`.
- Run upstream typecheck, lint, unit, and browser suites when changing an imported tool.
- Keep engineering calculations with the owning tool. The platform owns design, project, and report lifecycles.
- Treat tool manifests and SDK exports as the public contract. Preserve stable IDs and use sequential schema migrations.
- Preserve unknown input fields. Protect newer schemas from writes.
- Verify code clauses, reference examples, and National Annex values before introducing engineering content.
- Keep new source files to 300 lines. Read [architecture](docs/ARCHITECTURE.md) and the [tool guide](docs/TOOL_GUIDE.md).
