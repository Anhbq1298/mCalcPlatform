# Beam-to-beam notch schedule

The tab evaluates perpendicular, top-aligned catalogue beam pairs. Results are component screening to SCI P358 (2014), §5.5, with UK factors, on one supported beam acting on the supporting web. The 10 mm cover clearance, 5 mm increments and 40 mm minimum top depth are project detailing criteria. The available horizontal reach is measured from the supporting web face. A deep bottom cope starts at the supported beam bottom and extends to above the supporting lower flange.

The standard top cope limit is 130 × 50 mm and the extended limit is 160 × 50 mm. The editable lower limits start at 130 × 180 mm to permit geometry review of the four reference pairs. The solver explicitly excludes unequal-length, deep double, long-plate, unrestrained and tying cases from the notched resistance method until corresponding checks are verified. It can still provide the cope outline. Erection, supporting member stability and joint rotation remain project checks. Minimum centre distance to a cut or plate edge follows the P358 §5.5 recommended detailing criterion. The drawings show the resulting geometry with schematic cope corner detailing.

The numerical suite reproduces P358 §5.6 Example 1 Checks 4–6 for the single- and double-column top-cope cases, and checks the four catalogue geometry trials:

| Supporting → supported | Top cope (mm) | Bottom cope (mm) |
|---|---|---|
| UB533×210×92 → UB406×178×74 | 100 × 40 | — |
| UB610×229×101 → UB533×210×92 | 110 × 40 | — |
| UB406×178×74 → UB533×210×92 | 85 × 40 | 85 × 148.1 |
| UB457×191×74 → UB610×229×101 | 95 × 40 | 95 × 172.6 |

The project register stores fabrication signatures in project settings. It assigns marks inside a read/write project transaction, so two design tabs cannot claim the same number for different details. The standalone tool retains marks in its design snapshot until attached to a project. Existing No Notch numbering is preferred when a mark is free; conflicting numbers are remapped and reported in the schedule.

## Family selection

The notch schedule offers UB and UC catalogue families. Supporting families are the matrix rows and supported families are the matrix columns.

Each family pair evaluates the Cartesian product of its catalogue sections. A common fabrication detail uses the maximum required value of each cope dimension and one common plate top datum. Those dimensions are then checked on every actual profile pair, including effects of the deeper common cope on shallower supported sections. The schedule selects only a plate layout that passes every pair. It shows the maximum utilization and the minimum capacity with their respective governing profiles, along with the profile pair that governs each cope dimension. Former saved profile selections expand to their catalogue families when reopened.
