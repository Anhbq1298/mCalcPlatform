import { assess, geometry, initial } from './schedule.mjs';
import { notchChecks } from './notched-beam.mjs';

export const notchDefaults = {gap:10, clearance:10, minTop:40, step:5, bottomHorizontalClearance:10,
  maxTopLength:130, maxTopDepth:50, maxBottomLength:130, maxBottomDepth:180,
  loads:[100,200,300], supports:[], beams:[]};

const up = (value, step) => Math.ceil((value-1e-9)/step)*step;
const down = (value, step) => Math.floor((value+1e-9)/step)*step;

export function resolveCope(main, secondary, c) {
  const projection = (main.b-main.tw)/2;
  const root = Math.max(0, main.r-c.gap);
  const fillet = main.r-Math.sqrt(Math.max(0, main.r**2-root**2));
  const lower = main.h-main.tf-fillet;
  const length = c.gap >= projection+c.clearance ? 0 : up(projection+c.clearance-c.gap,c.step);
  const Lt = length;
  const horizontalBottom = c.bottomHorizontalClearance ?? c.clearance;
  const bottomReach = projection+horizontalBottom-c.gap;
  const Lb = bottomReach>1e-8 && secondary.h+c.clearance>lower ? up(bottomReach,c.step) : 0;
  const dt = Lt ? up(Math.max(c.minTop,main.tf+fillet+c.clearance,secondary.tf+secondary.r),c.step) : 0;
  const db = Lb ? secondary.h-Math.min(down(lower-c.clearance,c.step),
    secondary.h-up(secondary.tf+secondary.r,c.step)) : 0;
  const limits = [[Lt,c.maxTopLength,'Top cope length'],[dt,c.maxTopDepth,'Top cope depth'],
    [Lb,c.maxBottomLength,'Bottom cope length'],[db,c.maxBottomDepth,'Bottom cope depth']];
  const exceeded = limits.filter(([actual,max]) => actual>max+1e-8);
  const issues = exceeded.map(([actual,max,name])=>name+' requires '+Number(actual.toFixed(2))+' mm, limit '+max+' mm.');
  if(dt+db>=secondary.h) issues.push('No web remains between the copes.');
  return {Lt,dt,Lb,db,issues};
}

export function holeClearance(g,c,beam,cope,plateTop) {
  const failures=[];
  const minimum=2*c.diameter; // P358 §5.5 recommended geometry for nominally pinned fin plates.
  const toolRadius=c.toolDiameter/2;
  const check=(hole,part,edge,actual,required=minimum)=>{
    if(actual+1e-8<required)failures.push({hole,part,edge,actual,required});
  };
  for(let row=0;row<g.nr;row++) for(let column=0;column<g.nc;column++){
    const id=row*g.nc+column+1, x=g.zp+column*c.gauge, y=c.end+row*c.pitch, z=plateTop+y;
    const end=x-c.gap;
    check(id,'Fin plate','top',y);
    check(id,'Fin plate','bottom',g.hp-y);
    check(id,'Fin plate','free edge',g.bp-x);
    check(id,'Supported web','beam end',end);
    for(const [length,depth,fromEdge,side] of [[cope.Lt,cope.dt,z,'top'],[cope.Lb,cope.db,beam.h-z,'bottom']]){
      if(!depth)continue;
      if(end<=length) check(id,'Supported web',side+' cope edge',fromEdge-depth,Math.max(minimum,toolRadius));
      else {
        check(id,'Supported web',side+' cope shoulder',Math.hypot(end-length,Math.max(0,fromEdge-depth)),Math.max(minimum,toolRadius));
        check(id,'Supported web',side+' flange root',fromEdge-beam.tf-beam.r,toolRadius);
      }
    }
    if(!cope.dt)check(id,'Supported web','top flange root',z-beam.tf-beam.r,toolRadius);
    if(!cope.db)check(id,'Supported web','bottom flange root',beam.h-z-beam.tf-beam.r,toolRadius);
  }
  return failures;
}

export function generateNotched(input, sections) {
  const c={...initial,...notchDefaults,...input};
  const keys=['gap','clearance','minTop','step','bottomHorizontalClearance','maxTopLength','maxTopDepth','maxBottomLength','maxBottomDepth'];
  const dimensions=['thickness','weldLeg','end','beamEnd','plateEdge','pitch','gauge','toolDiameter'];
  if(dimensions.some(k=>!Number.isFinite(c[k])||c[k]<=0)||!Number.isInteger(c.minRows)||!Number.isInteger(c.maxRows)
    ||c.minRows<2||c.maxRows>30||c.minRows>c.maxRows)throw Error('Check plate and bolt-grid dimensions. Bolt rows are limited to 2–30.');
  if(keys.some(k=>!Number.isFinite(c[k])||c[k]<0)||!c.step||!c.loads.length
    || c.loads.some((v,i)=>!Number.isFinite(v)||v<=0||(i>0&&v<=c.loads[i-1]))) throw Error('Enter valid cope limits and increasing positive shear bands.');
  const profiles=ids=>[...new Set(ids)].map(id=>sections.find(s=>s.id===id));
  const supports=profiles(c.supports), beams=profiles(c.beams);
  if(!supports.length||!beams.length||[...supports,...beams].includes(undefined))throw Error('Select supporting and supported catalogue profiles.');
  const pairs=[], notches=new Map();
  for(const beam of beams) for(const support of supports){
    const b=beam.values, main=support.values, cope=resolveCope(main,b,c);
    const {Lt,dt,Lb,db}=cope;
    const occupied=dt||db;
    const tuple=[Lt,dt,Lb,db].map(v=>Number(v.toFixed(7))).join('/');
    if(!cope.issues.length && !notches.has(tuple))notches.set(tuple,{...cope,mark:occupied?'N'+(1+[...notches.values()].filter(n=>n.mark!=='N0').length):'N0'});
    const plateTop=Math.max(main.tf+main.r+c.weldLeg, dt, b.tf+b.r+c.clearance);
    const plateBottom=Math.min(main.h-main.tf-main.r-c.weldLeg,b.h-Math.max(db,b.tf+b.r));
    const variants=[], capacityByPlate=new Map();
    for(const nc of [...c.columns].sort((a,b)=>a-b)) for(let nr=c.minRows;nr<=c.maxRows;nr++){
      const g=geometry(c,nr,nc);
      if(plateTop+g.hp>plateBottom || g.hp<Math.max(.6,c.heightRatio)*b.h)continue;
      variants.push({g,edge:holeClearance(g,c,b,cope,plateTop)});
    }
    const cells=c.loads.map(V=>{
      const row={V, status:'No passing layout',reason:'No plate height fits the clear supporting web',edge:[]};
      if(cope.issues.length)return {...row,status:'Clash',reason:cope.issues.join(' ')};
      let openReason;
      for(const {g,edge} of variants){
        if(edge.length){if(!row.edge.length){row.edge=edge;row.reason='Minimum edge distance or installation clearance';}continue;}
        const deep=Number(beam.name.match(/\d+/)?.[0])>610;
        const unsupportedMaterial=c.E!==210000||c.rotation>0||c.axial!==0||c.hole!==22||c.diameter!==20
          ||c.grade!=='8.8'||c.plateFy!==275||!c.threaded||g.tp>16
          ||(g.tp>.5*c.diameter&&b.tw>.42*c.diameter);
        if(unsupportedMaterial||deep&&(c.gap<20||(g.nr-1)*c.pitch>530||
          (c.span?c.span/b.h:c.spanRatio)>20||(!c.span&&!c.spanRatio))){
          openReason='Material or deep-beam configuration outside the implemented P358 scope.';continue;
        }
        if(c.pitch<c.toolDiameter||(g.nc===2&&c.gauge<c.toolDiameter)||g.zp<c.toolDiameter/2+g.sw){
          row.reason='Installation tool envelope intersects the weld or adjacent bolts';continue;
        }
        const unsupportedCope=occupied&&(db&&(Math.abs(Lt-Lb)>1e-8||db>b.h/5||dt>b.h/5)
          ||c.restraint!=='restrained'||g.tp/g.zp<.15||c.tie>0
          ||g.zp+(g.nc-1)*c.gauge>c.gap+Math.min(...[Lt,Lb].filter(Boolean))
          ||c.gamma0!==1||c.gammaNet!==1.1);
        if(unsupportedCope||g.tp/g.zp<.15&&c.restraint!=='restrained'){
          openReason='Cope geometry or design conditions are outside the benchmarked resistance method.';continue;
        }
        const webEdge=Math.min(dt?plateTop+c.end-dt:Infinity,db?b.h-db-(plateTop+g.hp-c.end):Infinity);
        const criteria={...c,supportFace:'web',supportProfile:support,notchPlateTop:plateTop,
          notchWebEdge:webEdge,omitUnnotchedWeb:Boolean(occupied)};
        function checksAt(shear){
          const calc=assess(criteria,g,beam,shear);
          if(!occupied)return calc.checks;
          const notch={top:dt,bottom:db,length:Lt||Lb,shoulder:c.gap+(Lt||Lb),
            lower:plateTop+g.hp-(b.h-db),upper:plateTop+g.hp-dt};
          const checks=notchChecks(calc.input,b,notch,calc.r.bolt,calc.r.group).checks;
          return [...calc.checks,...checks.map(q=>({...q,action:q.demand,ref:'SCI P358 §5.5 Checks 4–6'}))];
        }
        let checks;
        try { checks=checksAt(V); } catch(error){openReason=error.message;continue;}
        const worst=checks.reduce((a,b)=>a.ratio>=b.ratio?a:b);
        if(!Number.isFinite(worst.ratio)||worst.ratio>c.maxUR){row.reason=worst.name;row.checks=checks;continue;}
        if(!capacityByPlate.has(g)){
          let low=V,high=checks.find(q=>q.name==='Bolt shear').resistance;
          for(let i=0;i<26;i++){
            const middle=(low+high)/2;
            if(checksAt(middle).every(q=>q.ratio<=1))low=middle;else high=middle;
          }
          capacityByPlate.set(g,low);
        }
        return {...row,g,checks,worst,capacity:Math.max(V,capacityByPlate.get(g)),edge:[],reason:worst.name,status:'Component screening'};
      }
      if(openReason)return {...row,status:'Not verified',reason:openReason};
      return row;
    });
    pairs.push({support,beam,cope,notchMark:notches.get(tuple)?.mark,plateTop,cells});
  }
  return {pairs,notches:[...notches.values()],supports,beams,criteria:c};
}
