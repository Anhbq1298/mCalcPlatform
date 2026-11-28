import { defaults } from './inputs.mjs';
import { calculate } from './connection.mjs';
import { bearingTerms, sciBoltChecks, sciPlateChecks, sciPlateStability, sciWeldThickness } from './sci-p358.mjs';

export const initial = {
  families: [406,457,533,610,686,762].map(n => 'UB'+n), excluded: [],
  loads: Array.from({length:11}, (_,i)=>50*(i+1)), thickness:10, weldLeg:10, gap:50,
  beamEnd:40, plateEdge:50, end:40, pitch:70, gauge:60, clearance:10, heightRatio:0.6,
  diameter:20, plateFy:275, plateFu:410, beamFy:355, beamFu:470,
  minRows:2, maxRows:30, maxUR:1, restraint:'restrained', spanRatio:20, tie:0,
  columns:[1,2], objective:'single', threaded:true, grade:'8.8', toolDiameter:44, hole:22, E:210000,
  gamma0:1,gamma1:1,gammaNet:1.1,gammaFastener:1.25,gammaTie:1.1,
  supportId:0,supportFace:'web',supportFy:355,supportFu:470, rotation:0,axial:0,span:0,
  boltCost:1,plateCost:1,weldCost:1,
};
export function family(s) {
  const n=s.name.match(/\d+/);
  return n ? s.family+n[0] : '';
}
export function geometry(c,rows,columns) {
  const hp=2*c.end+(rows-1)*c.pitch, zp=c.gap+c.beamEnd;
  return {nr:rows,nc:columns,n:rows*columns,hp,bp:zp+(columns-1)*c.gauge+c.plateEdge,
    zp,zg:zp+(columns-1)*c.gauge/2,tp:c.thickness,sw:c.weldLeg,aw:c.weldLeg/Math.SQRT2};
}
export function assess(c,g,section,V) {
  const b=section.values, top=c.notchPlateTop??(b.tf+b.r+c.clearance);
  // EN 10025-2 Table 7, web-specific yield strength for standard rolled grades.
  if ([275,355].includes(c.beamFy)) {
    const drop=b.tw<=16?0:b.tw<=40?10:b.tw<=63?20:b.tw<=80?30:b.tw<=100?40:null;
    if(drop===null)throw Error("Web exceeds the supported material thickness range");
    c={...c,beamFy:c.beamFy-drop};
  }
  const input={...defaults,...c,support:'rigid',top:c.end,bottom:c.end,vertical:V,
    columns:g.nc,rows:g.nr,offset:top+g.hp/2-b.h/2, restrained:c.restraint==='restrained'};
  const r=calculate(input,b), bolt={...r.bolt,hole:c.hole}, d0=c.hole, checks=[];
  function add(name,action,resistance,ref,unit='kN') {
    if(!Number.isFinite(action)||!(resistance>0)||!Number.isFinite(resistance))throw Error('Invalid resistance: '+name);
    checks.push({checkId:name.toLowerCase().replaceAll(' ','-'),checkName:name,name,action,resistance,ref,unit,
      codeReference:ref,designAction:action,designResistance:resistance,utilizationRatio:action/resistance,
      applicability:'Applicable',governingSection:section.name,failureReason:action>resistance?'Action exceeds resistance':null,
      equation:'UR = Ed / Rd',inputParameters:{V,rows:g.nr,columns:g.nc},intermediateResults:{zp:g.zp,zg:g.zg},
      ratio:action/resistance,profile:section.name,
      verificationStatus:action<=resistance?'PASS':'FAIL'});
  }
  const args={group:r.group,bolt,shearResistance:r.shearResistance*1.25/c.gammaFastener,z:g.zg,pitch:c.pitch,
    gauge:g.nc===1?Infinity:c.gauge,plateEnd:c.end,plateEdge:c.plateEdge,beamVerticalEnd:c.notchWebEdge??Infinity,
    beamEnd:c.beamEnd,plateThickness:g.tp,beamThickness:b.tw,plateFu:c.plateFu,beamFu:c.beamFu};
  const bolts=sciBoltChecks(args), plate=sciPlateChecks({height:g.hp,thickness:g.tp,rows:g.nr,columns:g.nc,
    gauge:c.gauge,edge:c.plateEdge,end:c.end,d0,fy:c.plateFy,fu:c.plateFu,z:g.zg});
  for (const [name,rd] of [['Bolt shear',bolts.bolt],['Plate bearing',bolts.plate.resistance*1.25/c.gammaFastener],['Web bearing',bolts.web.resistance*1.25/c.gammaFastener]])
    add(name,V,rd,'P358 §5.5 Check 2');
  plate.gross/=c.gamma0;plate.net*=1.1/c.gammaNet;
  plate.block=(.5*c.plateFu*plate.netTension/c.gammaNet+c.plateFy*plate.netShear/(Math.sqrt(3)*c.gamma0))/1000;
  if(plate.bending!==null)plate.bending/=c.gamma0;
  for (const key of ['gross','net','block','bending']) if(plate[key]!==null) add('Plate '+key,V,plate[key],'P358 §5.5 Check 3');
  const stability=sciPlateStability({height:g.hp,thickness:g.tp,fy:c.plateFy,z:g.zg,firstBolt:g.zp,restrained:input.restrained});
  if(stability.resistance!==null){
    const elastic=g.tp*g.hp**2*c.plateFy/(6000*g.zg);
    stability.resistance=stability.type==='short'?elastic/c.gamma0:Math.min(elastic/c.gamma0,elastic*stability.reduction/(.6*c.gamma1));
  }
  if(stability.resistance!==null) add('Plate stability',V,stability.resistance,'P358 §5.5 Check 3');
  const L=(g.nr-1)*c.pitch, last=(g.nc-1)*c.gauge;
  let A;
  if(!c.omitUnnotchedWeb){
    A=Math.max(b.A-2*b.b*b.tf+(b.tw+2*b.r)*b.tf,(b.h-2*b.tf)*b.tw);
    add('Gross web shear',V,A*c.beamFy/Math.sqrt(3)/c.gamma0/1000,'P358 §5.5 Check 4');
    add('Net web shear',V,(A-g.nr*d0*b.tw)*c.beamFu/(c.gammaNet*Math.sqrt(3))/1000,'P358 §5.5 Check 4');
    if(stability.type==='long'){
      const shear=V*L/b.h, bc=b.tw*L*c.beamFy/Math.sqrt(3)/c.gamma0/1000;
      const rho=Math.max(0,2*shear/bc-1)**2;
      const ab=b.tw*(c.beamEnd+last)*c.beamFy/Math.sqrt(3)/c.gamma0/1000;
      add('BC shear',shear,bc,'P358 §5.5 Check 4 p.123');
      add('ABCD web interaction',V*(g.zp+last)/1000,
        (Math.max(0,1-rho)*c.beamFy*b.tw*L**2/(6000*c.gamma0)+ab*L)/1000,'P358 §5.5 Check 4 p.123','kNm');
    }
  }
  const weld=sciWeldThickness(c.plateFy,g.tp,g.sw);
  if(weld) add('Full strength weld throat',weld.minimum,weld.throat,'P358 §5.5 Check 8','mm');
  // EN 1993-1-8:2005 §4.5.3.2. Two equal effective throats at the support face.
  // Deduct start and stop lengths unless full-size returns are confirmed.
  const le=g.hp-2*g.aw, area=2*g.aw*le, modulus=g.aw*le**2/3;
  if(le<Math.max(30,6*g.aw))throw Error('Effective weld length below EN 1993-1-8 §4.5.1');
  const sigma=V*1000*g.zg/modulus/Math.SQRT2, tau=V*1000/area;
  const weldFu=Math.min(c.plateFu,c.supportProfile?c.supportFu:c.plateFu);
  add('Weld directional stress',Math.sqrt(4*sigma**2+3*tau**2),weldFu/(.85*c.gammaFastener),'EN 1993-1-8 §4.5.3.2 (4.1)','MPa');
  add('Weld normal stress',sigma,.9*weldFu/c.gammaFastener,'EN 1993-1-8 §4.5.3.2 (4.1)','MPa');
  const ties=[g.n*bolt.coefficient*bolt.fub*bolt.area/c.gammaTie/1000];
  for(const [t,fy,fu,edge,end] of [[g.tp,c.plateFy,c.plateFu,c.plateEdge,c.end],[b.tw,c.beamFy,c.beamFu,c.beamEnd,top+c.end]]){
    const shearPath=t*(edge+last-(g.nc-0.5)*d0);
    const block=(tension,shear)=>t*tension*fu/c.gammaTie/1000+shear*fy/Math.sqrt(3)/c.gamma0/1000;
    ties.push(block(L-(g.nr-1)*d0,2*shearPath),block(L+end-(g.nr-0.5)*d0,shearPath),
      0.9*t*(g.hp-g.nr*d0)*fu/c.gammaTie/1000,
      g.n*bearingTerms(bolt,t,fu,edge,args.gauge,end,c.pitch).resistance*1.25/c.gammaTie);
  }
  if(c.supportProfile && c.supportFace==='web'){
    const s=c.supportProfile.values, dc=s.h-2*(s.tf+s.r), beta=(g.tp+2*g.sw)/dc;
    add('Support web local shear',V,2*g.hp*s.tw*c.supportFy/(Math.sqrt(3)*c.gamma0)/1000,'P358 §5.5 Check 10');
    add('Support web punching',g.tp,s.tw*c.supportFu/(c.plateFy*c.gammaFastener),'P358 §5.5 Check 10','mm');
    if(beta<1)ties.push(2*c.supportFu*s.tw**2*(g.hp/dc+1.5*Math.sqrt(1-beta))/(c.gammaTie*(1-beta))/1000);
  }
  ties.push(weldFu*area/(Math.SQRT2*.85*c.gammaTie*1000));
  const tie=Math.min(...ties);
  if(c.tie>0)add('Component tying',c.tie,tie,'P358 §5.5 Checks 11–13');
  return {input,r,checks,tie,stability,le,area,modulus,sigma,tau,
    derivation:[
      ['Plate height', '2 × '+c.end+' + ('+g.nr+' − 1) × '+c.pitch, g.hp,'mm'],
      ['Bolt shear resistance per shear plane',bolt.coefficient+' × '+bolt.fub+' × '+bolt.area+' × '+r.longJoint+' / ('+c.gammaFastener+' × 1000)',args.shearResistance,'kN'],
      ['Plate gross shear',g.hp+' × '+g.tp+' × '+c.plateFy+' / (1.27 × √3 × '+c.gamma0+' × 1000)',plate.gross,'kN'],
      ['Plate net shear area',g.tp+' × ('+g.hp+' − '+g.nr+' × '+d0+')',g.tp*(g.hp-g.nr*d0),'mm²'],
      ...(A===undefined?[]:[['Web gross shear area','max(A − 2btf + (tw + 2r)tf, hw tw)',A,'mm²']]),
      ['Web BC design shear',V+' × '+L+' / '+b.h,V*L/b.h,'kN'],
      ['Weld throat',g.sw+' / √2',g.aw,'mm'],
      ['Effective weld length',g.hp+' − 2 × '+g.aw,le,'mm'],
      ['Weld shear',V+' × 1000 / '+area,tau,'MPa'],
      ['Weld normal stress',V+' × 1000 × '+g.zg+' / ('+modulus+' × √2)',sigma,'MPa'],
    ]};
}

export function generate(c,catalogue) {
  for(const key of Object.keys(initial).filter(k=>typeof initial[k]==='number'))
    if(!Number.isFinite(c[key]) || c[key]<0)throw Error('Invalid '+key);
  if(!c.loads.length || c.loads.some((v,i)=>!Number.isFinite(v)||v<=0||(i&&v<=c.loads[i-1]))
    || !c.families.length || !c.columns.length || c.columns.some(n=>![1,2].includes(n))
    || !Number.isInteger(c.minRows)||!Number.isInteger(c.maxRows)||c.minRows<2||c.maxRows>30||c.minRows>c.maxRows
    || c.pitch<=0 || c.maxUR<=0||c.maxUR>1)throw Error('Check shear boundaries, families, rows, columns and UR limit.');
  if ([c.gamma0,c.gamma1,c.gammaNet,c.gammaFastener,c.gammaTie,c.E,c.hole,c.toolDiameter].some(v=>v<=0))throw Error('Factors and dimensions must be positive');
  c={...c,supportProfile:catalogue.find(s=>s.id===c.supportId)};
  if(c.supportId&&!c.supportProfile)throw Error('Unknown supporting section');
  const cells=[],marks=new Map(), capacities=new Map();
  for(const f of c.families){
    const profiles=catalogue.filter(s=>family(s)===f&&!c.excluded.includes(s.id));
    if(!profiles.length)throw Error('No included profiles for '+f);
    const candidates=[];
    for(const nc of c.columns)for(let nr=c.minRows;nr<=c.maxRows;nr++){
      const g=geometry(c,nr,nc);
      if(profiles.every(({values:b})=>g.hp<=b.h-2*(b.tf+b.r+c.clearance)&&g.hp>=Math.max(.6,c.heightRatio)*b.h)) candidates.push(g);
    }
    const cost=g=>g.n*c.boltCost+g.hp*g.bp*g.tp*7.85e-6*c.plateCost+2*g.hp/1000*c.weldCost;
    candidates.sort((a,b)=>(c.objective==='bolts'?a.n-b.n:c.objective==='area'?a.bp*a.hp-b.bp*b.hp:c.objective==='weld'?a.hp-b.hp:c.objective==='cost'?cost(a)-cost(b):0)||a.nc-b.nc||a.nr-b.nr);
    for(const V of c.loads){
      let unverified=false;
      let choice, reason='No common plate height', pending=false;
      for(const g of candidates){
        const deep=Number(f.match(/\d+/)[0])>610;
        if(deep&&(c.gap<20||(g.nr-1)*c.pitch>530||(c.span?profiles.some(p=>c.span/p.values.h>20):c.spanRatio>20))){reason='Deep beam detailing outside P358';pending=true;continue;}
        if((deep&&!c.span&&!c.spanRatio)||(g.tp/g.zp<.15&&c.restraint==='unknown')){
          unverified=true;reason='Required restraint or span information missing';continue;
        }
        if((deep&&!c.span&&!c.spanRatio)||c.E!==210000||c.axial!==0||c.rotation>0||c.hole!==22||g.tp>16||!['UB','UC','IPE','HEA','HEB'].includes(profiles[0].family)||c.diameter!==20||c.grade!=='8.8'||c.plateFy!==275||!c.threaded||
          (g.tp/g.zp<.15 && c.restraint!=='restrained')){
          reason='Outside verified material, restraint or detailing scope';pending=true;continue;
        }
        if(Math.min(c.end,c.plateEdge,c.beamEnd)<2*c.diameter || (g.tp>.5*c.diameter && profiles.some(s=>s.values.tw>.42*c.diameter))){
          reason='P358 Check 1 detailing';continue;
        }
        const radius=c.toolDiameter/2;
        if (radius>c.clearance+c.end || radius+g.sw>g.zp || c.toolDiameter>c.pitch || (g.nc>1&&c.toolDiameter>c.gauge)){
          reason='Tool envelope intersects adjacent hardware, weld or flange root';continue;
        }
        if(c.supportProfile&&c.supportFace==='web'){
          const s=c.supportProfile.values;
          if(profiles.some(p=>p.values.b+2*c.clearance>s.h-2*(s.tf+s.r)) || (g.tp+2*g.sw)>=s.h-2*(s.tf+s.r)){
            reason='Support web clear depth or load patch outside scope';continue;
          }
        }
        const evaluated=profiles.map(s=>assess(c,g,s,V));
        if(evaluated.some(x=>x.r.details.length)){reason='Detailing failure';continue;}
        const worst=evaluated.flatMap(x=>x.checks).sort((a,b)=>b.ratio-a.ratio)[0];
        if(!Number.isFinite(worst.ratio)||worst.ratio>c.maxUR){reason=worst.profile+' · '+worst.name;continue;}
        const key=f+'/'+g.nc+'/'+g.nr;
        if(!capacities.has(key)){
          const passes=v=>profiles.every(p=>assess(c,g,p,v).checks.every(q=>q.ratio<=1));
          let low=V, high=Math.min(...evaluated.map(x=>x.checks.find(q=>q.name==='Bolt shear').resistance));
          for(let i=0;i<38;i++){const mid=(low+high)/2;if(passes(mid))low=mid;else high=mid;}
          if(!passes(low))throw Error('Component capacity verification failed');
          capacities.set(key,low);
        }
        choice={g,worst,capacity:capacities.get(key),tie:Math.min(...evaluated.map(x=>x.tie)),profiles};
        marks.set(g.nc+'/'+g.nr,g);break;
      }
      cells.push({f,V,choice,status:choice?'Component screening':unverified?'Not verified':pending?'Outside scope':'Infeasible',reason});
    }
  }
  const details=[...marks.values()].sort((a,b)=>a.nc-b.nc||a.nr-b.nr), count=[0,0,0];
  for(const g of details)g.mark=(g.nc===1?'S':'D')+(++count[g.nc]);
  for(const cell of cells)if(cell.choice)cell.mark=marks.get(cell.choice.g.nc+'/'+cell.choice.g.nr).mark;
  return {cells,details};
}
