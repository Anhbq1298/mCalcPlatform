import { generateNotched, notchDefaults, resolveCope } from './notch-schedule.mjs';
import { family, initial } from './schedule.mjs';

const series=['UB','UC','IPE','HEA','HEB'];
const axes=['Lt','dt','Lb','db'];
const label=pair=>pair.support.name+' → '+pair.beam.name;

export function notchFamilies(sections){
  const groups=new Map();
  for(const section of sections){
    if(!series.includes(section.family))continue;
    const name=family(section);
    if(!groups.has(name))groups.set(name,[]);
    groups.get(name).push(section);
  }
  return new Map([...groups].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})));
}

function worstFailure(combinations,index){
  const clash=combinations.find(pair=>pair.cells[index].status==='Clash');
  const noLayout=combinations.find(pair=>!pair.cells[index].passing?.size&&pair.cells[index].status==='No passing layout');
  const unknown=combinations.find(pair=>!pair.cells[index].passing?.size&&pair.cells[index].status==='Not verified');
  const pair=clash??noLayout??unknown??combinations[0];
  const cell=pair.cells[index];
  return {...cell,governingPair:pair,reason:clash||noLayout||unknown
    ? label(pair)+' · '+cell.reason : 'No single bolt layout passes every profile pair in these families.'};
}

function choose(combinations,index){
  const cells=combinations.map(pair=>pair.cells[index]);
  for(const key of cells[0].passing?.keys()??[]){
    const sameLayout=cells.map(row=>row.passing?.get(key));
    if(sameLayout.some(row=>!row))continue;
    const worstIndex=sameLayout.reduce((best,row,i)=>row.worst.ratio>sameLayout[best].worst.ratio?i:best,0);
    const governing=sameLayout[worstIndex], {passing,capacityAt,...output}=governing;
    const capacities=sameLayout.map(row=>row.capacityAt());
    const capacity=Math.min(...capacities);
    return {...output,capacity,governingPair:combinations[worstIndex],
      capacityPair:combinations[capacities.indexOf(capacity)],reason:label(combinations[worstIndex])+' · '+governing.worst.name};
  }
  return worstFailure(combinations,index);
}

export function generateNotchFamilies(input,sections){
  const c={...initial,...notchDefaults,...input};
  const catalogue=notchFamilies(sections);
  const families=names=>[...new Set(names)].map(name=>({name,profiles:catalogue.get(name)}));
  const supports=families(c.supportFamilies??[]),beams=families(c.beamFamilies??[]);
  if(!supports.length||!beams.length||[...supports,...beams].some(group=>!group.profiles)){
    throw Error('Select supporting and supported beam families.');
  }
  if(!Number.isFinite(c.step)||c.step<=0)throw Error('Enter a positive rounding increment.');
  const pairs=[],notches=new Map();
  let combinationsChecked=0;
  for(const beam of beams) for(const support of supports){
    const combinations=beam.profiles.flatMap(b=>support.profiles.map(s=>({support:s,beam:b,cope:resolveCope(s.values,b.values,c)})));
    const envelope=Object.fromEntries(axes.map(key=>[key,Math.max(...combinations.map(pair=>pair.cope[key]))]));
    const dimensions=Object.fromEntries(axes.map(key=>[key,combinations.find(pair=>Math.abs(pair.cope[key]-envelope[key])<1e-8)]));
    const commonPlateTop=Math.max(envelope.dt,...combinations.map(({support:s,beam:b})=>Math.max(
      s.values.tf+s.values.r+c.weldLeg,b.values.tf+b.values.r+c.clearance)));
    const result=generateNotched({...c,supports:support.profiles.map(s=>s.id),beams:beam.profiles.map(s=>s.id),
      commonCope:envelope,commonPlateTop,collectLayouts:true},sections);
    combinationsChecked+=result.pairs.length;
    const key=axes.map(axis=>Number(envelope[axis].toFixed(7))).join('/');
    const cells=c.loads.map((_,i)=>choose(result.pairs,i));
    const fits=result.pairs.every(pair=>!pair.cope.issues.length);
    if(fits&&!notches.has(key))notches.set(key,{...envelope,mark:envelope.dt||envelope.db?
      'N'+(1+[...notches.values()].filter(n=>n.mark!=='N0').length):'N0'});
    pairs.push({support,beam,cope:envelope,dimensions,notchMark:fits?notches.get(key).mark:undefined,
      count:result.pairs.length,cells});
  }
  return {pairs,notches:[...notches.values()],supports,beams,criteria:c,combinationsChecked};
}
