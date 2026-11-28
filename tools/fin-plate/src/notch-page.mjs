import { notchDefaults } from './notch-schedule.mjs';
import { markDefinition } from './project-marks.mjs';
import { notchTypical, pairPlan, pairSection, plateTypical } from './notch-drawings.mjs';
import { generateNotchFamilies, notchFamilies } from './notch-families.mjs';
import { family, initial } from './schedule.mjs';
import { worksheet } from './report.mjs';

const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
const $=id=>document.getElementById(id);
const fmt=x=>typeof x==='number'?Number(x.toFixed(3)):x;

function table(host,headers,rows){
  const t=el('table');
  const top=t.createTHead().insertRow();
  for(const name of headers){const th=el('th',name);th.scope='col';top.append(th);}
  const body=t.createTBody();
  for(const row of rows){
    const tr=body.insertRow();
    for(const value of row)tr.insertCell().append(value instanceof Node?value:String(fmt(value)));
  }
  host.replaceChildren(t);
}

export function showProjectMarks(records){
  const host=$('project-fin-plates'), select=$('project-plate-detail');
  const active=select.value;
  host.hidden=!records.length;
  table($('project-plate-table'),['Mark','nr × nc','Bolt','Hole d₀','H','B','t','Grade','x₁','pv','ph','et / eb','ef','Weld w'],
    records.map(({mark,detail:d})=>[mark,d.rows+' × '+d.columns,d.grade+' M'+d.diameter,d.hole,d.height,d.width,
      d.thickness,'S'+d.fy,d.firstColumn,d.pitch,d.gauge||'–',d.end+' / '+d.end,
      d.width-d.firstColumn-(d.columns-1)*d.gauge,d.weldLeg]));
  select.replaceChildren(...records.map(({mark})=>new Option(mark,mark)));
  if(records.some(item=>item.mark===active))select.value=active;
  const draw=()=>plateTypical($('project-plate-svg'),records.find(item=>item.mark===select.value)?.detail);
  select.onchange=draw;
  if(records.length)draw();
}

const fields=[
  ['gap','Setback from support web (mm)'],['clearance','Clearance (mm)'],['minTop','Minimum top cope (mm)'],
  ['step','Rounding increment (mm)'],['bottomHorizontalClearance','Lower shoulder horizontal clearance (mm)'],['maxTopLength','Top length limit (mm)'],['maxTopDepth','Top depth limit (mm)'],
  ['maxBottomLength','Bottom length limit (mm)'],['maxBottomDepth','Bottom depth limit (mm)'],
];
const boltFields=[['thickness','Plate thickness (mm)'],['weldLeg','Weld leg (mm)'],['end','Plate top/bottom end distance (mm)'],
  ['beamEnd','Bolt setback from beam end (mm)'],['plateEdge','Plate free-edge distance (mm)'],['pitch','Vertical pitch (mm)'],
  ['gauge','Horizontal pitch (mm)'],['toolDiameter','Installation tool diameter (mm)'],['maxRows','Maximum bolt rows']];

export function notchPage(sections,register){
  let data,result,selected,serial=0;
  const panel=$('notch-app'), form=$('notch-criteria'), out=$('notch-result'), error=$('notch-error');
  const catalogue=notchFamilies(sections);
  for(const id of ['notch-supports','notch-beams']){
    $(id).append(...[...catalogue].map(([name,profiles])=>new Option(name+' ('+profiles.length+')',name)));
  }
  for(const [key,label] of [...fields,...boltFields]){
    const item=el('label',label+' '), input=el('input');
    Object.assign(input,{id:'notch-'+key,type:'number',min:key==='step'?0.01:0,step:'any',required:true});
    item.append(input);$(fields.some(([id])=>id===key)?'notch-limits':'notch-bolt-fields').append(item);
  }
  for(const [key,label,values] of [['beamFy','Supported beam grade',[275,355]],['supportFy','Supporting beam grade',[275,355]]]){
    const item=el('label',label+' '), select=el('select');
    select.id='notch-'+key;select.append(...values.map(value=>new Option('S'+value,value)));
    item.append(select);$('notch-limits').append(item);
  }
  function invalidate(){serial++;result=selected=null;out.hidden=true;error.textContent='';}
  form.addEventListener('input',invalidate);
  $('notch-standard').onclick=()=>{$('notch-maxTopLength').value=130;$('notch-maxTopDepth').value=50;invalidate();};
  $('notch-extended').onclick=()=>{$('notch-maxTopLength').value=160;$('notch-maxTopDepth').value=50;invalidate();};
  function values(){
    const number=key=>Number($('notch-'+key).value);
    const series=id=>[...$(id).selectedOptions].map(o=>o.value);
    const beamFy=number('beamFy'),supportFy=number('supportFy');
    return {...data,...Object.fromEntries([...fields,...boltFields].map(([key])=>[key,number(key)])),beamFy,supportFy,
      beamFu:beamFy===275?410:470,supportFu:supportFy===275?410:470,
      restraint:$('notch-restraint').value,loads:$('notch-loads').value.split(',').map(Number),
      supportFamilies:series('notch-supports'),beamFamilies:series('notch-beams')};
  }
  function inspect(pair,cell){
    selected=pair;
    $('notch-pair-label').textContent=pair.support.name+' → '+pair.beam.name;
    const example=cell.governingPair;
    $('notch-pair-geometry').textContent=pair.count+' profile pairs checked · '+(pair.notchMark??'Cope exceeds limits')
      +' · '+cell.status+' · Section shown: '+example.support.name+' → '+example.beam.name;
    table($('notch-pair-bands'),['Shear (kN)','Fin plate','Min. capacity (kN)','Max. UR','Status / governing check','Capacity-governing profiles'],
      pair.cells.map(row=>[row.V,row.mark??'–',row.capacity??'–',row.worst?.ratio??'–',row.reason||row.status,
        row.capacityPair?row.capacityPair.support.name+' → '+row.capacityPair.beam.name:'–']));
    table($('notch-cope-drivers'),['Cope dimension','Common size (mm)','Required by'],
      Object.entries(pair.dimensions).map(([key,p])=>[key,pair.cope[key],pair.cope[key] ? p.support.name+' → '+p.beam.name:'–']));
    pairSection($('notch-pair-svg'),example,cell,result.criteria);
    pairPlan($('notch-plan-svg'),example,cell,result.criteria);
    const checks=cell.checks??[];
    table($('notch-pair-checks'),['Check','Demand','Resistance','Unit','UR'],
      checks.map(q=>[q.name,q.action,q.resistance,q.unit,q.ratio]));
    table($('notch-edge-checks'),['Hole','Component','Edge','Actual (mm)','Required (mm)'],
      cell.edge.map(q=>[q.hole,q.part,q.edge,q.actual,q.required]));
    $('notch-pair-checks').hidden=!checks.length;
    $('notch-edge-checks').hidden=!cell.edge.length;
    $('notch-pair').hidden=false;
  }
  function matrix(){
    const index=Number($('notch-band').value);
    const rows=result.beams.map((b,i)=>[b.name,...result.supports.map((_,j)=>{
      const pair=result.pairs[i*result.supports.length+j], cell=pair.cells[index];
      const button=el('button',cell.mark?pair.notchMark+' / '+cell.mark:cell.status);
      button.type='button';button.onclick=()=>inspect(pair,cell);
      return button;
    })]);
    table($('notch-matrix'),['Supported ↓ / Supporting →',...result.supports.map(s=>s.name)],rows);
    if(selected)inspect(selected,selected.cells[index]);
  }
  $('notch-band').onchange=matrix;
  form.onsubmit=async event=>{
    event.preventDefault();invalidate();
    const request=serial;
    try{
      const next=generateNotchFamilies(values(),sections);
      const selectedCells=next.pairs.flatMap(pair=>pair.cells.filter(cell=>cell.g));
      const assigned=await register.assign(selectedCells.map(cell=>markDefinition(next.criteria,cell.g)));
      showProjectMarks(assigned.records);
      if(request!==serial)return;
      selectedCells.forEach((cell,i)=>{cell.mark=assigned.marks[i];});
      result=next;
      $('notch-family-count').textContent=result.pairs.length+' family pairs · '+result.combinationsChecked+' catalogue profile pairs checked';
      $('notch-band').replaceChildren(...result.criteria.loads.map((load,i)=>new Option('≤'+load+' kN',i)));
      matrix();
      table($('notch-marks'),['Mark','Lt','dt','Lb','db'],result.notches.map(n=>[n.mark,n.Lt,n.dt,n.Lb,n.db]));
      notchTypical($('notch-typical'));
      $('notch-pair').hidden=true;out.hidden=false;
    }catch(e){if(request===serial)error.textContent=e.message;}
  };
  $('notch-print').onclick=()=>window.print();
  return {
    open(saved={}){
      data={...initial,...notchDefaults,restraint:'unknown',beamFy:355,supportFy:355,...saved};
      for(const [key] of [...fields,...boltFields])$('notch-'+key).value=data[key];
      for(const key of ['beamFy','supportFy','restraint'])$('notch-'+key).value=data[key];
      $('notch-loads').value=data.loads.join(', ');
      for(const [key,field] of [['supports','supportFamilies'],['beams','beamFamilies']]){
        const migrated=sections.filter(section=>data[key]?.includes(section.id)).map(family);
        const selectedFamilies=data[field]??migrated;
        for(const option of $('notch-'+key).options)option.selected=selectedFamilies.includes(option.value);
      }
      invalidate();panel.hidden=false;
    },
    snapshot:values,
    report(){
      if(!result)throw Error('Generate the notched schedule first.');
      const lines=[['Beam-to-beam notch schedule',1],['Dimensions in mm · Preliminary component screening']];
      for(const p of result.pairs){
        lines.push([p.support.name+' → '+p.beam.name,2],[p.notchMark?'Cope '+p.notchMark+' · '+[p.cope.Lt,p.cope.dt,p.cope.Lb,fmt(p.cope.db)].join(' / '):p.cells[0].reason]);
        for(const c of p.cells)lines.push([c.V+' kN · '+(c.mark??c.status)+' · '+(c.reason||c.worst?.name||'')]);
      }
      return worksheet('Beam-to-beam notch schedule',lines);
    },
  };
}
