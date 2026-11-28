import { createStore } from '../../../packages/design-sdk/src/index.mjs';

export function markDefinition(criteria, plate) {
  return {
    columns: plate.nc, rows: plate.nr, height: plate.hp, width: plate.bp, thickness: plate.tp,
    fy: criteria.plateFy, fu: criteria.plateFu, diameter: criteria.diameter, grade: criteria.grade,
    threaded: criteria.threaded, hole: criteria.hole, firstColumn: plate.zp,
    end: criteria.end, pitch: criteria.pitch, gauge: plate.nc === 1 ? 0 : criteria.gauge,
    weldLeg: plate.sw, weld: 'double fillet',
  };
}

const signature = detail => JSON.stringify(Object.keys(detail).sort().map(key => [
  key, typeof detail[key] === 'number' ? Number(detail[key].toFixed(7)) : detail[key],
]));

export function allocateMarks(records, details, preferred = []) {
  const entries = new Map(records.map(record => [signature(record.detail), record]));
  const used = new Set(records.map(record => record.mark));
  const next = prefix => {
    let highest = 0;
    for (const mark of used) if (mark.startsWith(prefix)) highest = Math.max(highest, Number(mark.slice(1)));
    return prefix + (highest + 1);
  };
  const marks = details.map((detail, index) => {
    const key = signature(detail);
    if (!entries.has(key)) {
      const prefix = detail.columns === 1 ? 'S' : 'D';
      const proposal = preferred[index];
      const mark = typeof proposal === 'string' && new RegExp('^'+prefix+'[1-9]\\d*$').test(proposal)
        && !used.has(proposal) ? proposal : next(prefix);
      used.add(mark);
      entries.set(key, {mark, detail});
    }
    return entries.get(key).mark;
  });
  return {marks, records:[...entries.values()]};
}

export function projectMarks() {
  const db = createStore();
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('mcalc-fin-plate-marks'):null;
  let records = [];
  async function projectId() {
    const params=new URL(location.href).searchParams;
    const explicit=params.get('project');
    if(explicit)return explicit;
    const design=params.get('design');
    if(!design)return null;
    const owning=(await db.listProjects()).filter(project=>project.folders.some(folder=>folder.designs.includes(design)));
    if(owning.length>1)throw Error('Open this design from the intended project to allocate project marks.');
    return owning[0]?.id??null;
  }
  async function reload(){
    const id=await projectId();
    if(id){
      const project=await db.getProject(id);
      if(!project)throw Error('This project is no longer available.');
      records=project.settings.finPlateMarks??[];
    }
    return structuredClone(records);
  }
  return {
    restore(saved) { records = Array.isArray(saved) ? saved : []; },
    reload,
    listen(show){
      if(!channel)return;
      channel.onmessage=async event=>{
        try {if(await projectId()===event.data)show(await reload());}
        catch { /* Allocation will report stale or unavailable project context. */ }
      };
    },
    snapshot() { return structuredClone(records); },
    async assign(details, preferred) {
      let result;
      const id=await projectId();
      if (id) {
        await db.updateProject(id, project => {
          result = allocateMarks(project.settings.finPlateMarks ?? [], details, preferred);
          return {...project, settings:{...project.settings, finPlateMarks:result.records}};
        });
        channel?.postMessage(id);
      } else result = allocateMarks(records, details, preferred);
      records = result.records;
      return result;
    },
  };
}
