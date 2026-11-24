import { calculate } from './connection.mjs';

// A sensitivity comparison. Each layout retains the active input constraints.
export function compareColumns(input, beam) {
  return [1, 2, 3].map(columns => {
    const result = calculate({ ...input, coordinates: null, columns }, beam);
    const [shear, web, plate] = result.checks;
    return {
      columns, width: result.width, eccentricity: result.z,
      shear: shear.ratio, web: web.ratio, plate: plate.ratio, details: result.details,
    };
  });
}
