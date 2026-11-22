# Use per-tool file extensions

Each tool declares a lowercase `fileExtension` in its manifest. The master project package stays `.mcalc`, which is a ZIP container with `manifest.json`.

| Tool | Extension | Contents |
| --- | --- | --- |
| mCalcCanvas | `.mccv` | Export only: a report. It is not opened or imported. |
| mCompositeBeamDesign | `.mcb` | Inputs and results. |
| mConcreteRecCol | `.mrcol` | Inputs and results. Plain JSON. |
| mConcreteCircCol | `.mccol` | Inputs and results. |
| mSteelBeamColumn | `.msbc` | Inputs and results. |
| mPunchingShear | `.mpsh` | Inputs and results. |
| mConcBreakout | `.mcbo` | Inputs and results. |

Open accepts both upper and lower case extensions. Save writes lowercase.

Plain JSON files carry `format`, `version`, `tool`, `toolVersion`, `schema` and `inputs`. Readers preserve unknown input fields and refuse to overwrite a newer schema, as `AGENTS.md` requires. Each change uses a sequential migration.

Legacy `.mcmpb` (Composite Beam) and `.ms` (Steel Beam-Column) names are not in this repository. Compatibility for them is out of scope until their location is confirmed.
