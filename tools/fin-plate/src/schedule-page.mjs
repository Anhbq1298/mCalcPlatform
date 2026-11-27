import { assess, family, generate, initial } from './schedule.mjs';
import { drawBoltGroup } from './drawing.mjs';
import { typical } from './typical.mjs';
import { worksheet } from './report.mjs';

const $=id=>document.getElementById(id);
const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
const fmt=v=>typeof v==='number'?Number(v.toFixed(3)):v;
const labels={E:'Elastic modulus (MPa)',hole:'Hole diameter (mm)',gamma0:'γM0',gamma1:'γM1',gammaNet:'γM2 net section',gammaFastener:'γM2 bolts',gammaTie:'γMu accidental',supportFy:'Support fy (MPa)',supportFu:'Support fu (MPa)',span:'Actual span (mm, 0 uses ratio)',rotation:'Required rotation (rad)',axial:'Concurrent axial force (kN)',boltCost:'Cost / bolt',plateCost:'Cost / kg',weldCost:'Cost / m of weld',toolDiameter:'Installation tool envelope Ø (mm)',thickness:'Plate thickness (mm)',weldLeg:'Weld leg (mm)',gap:'Setback (mm)',beamEnd:'Beam end distance (mm)',
  plateEdge:'Outer edge distance (mm)',end:'Vertical end distance (mm)',pitch:'Vertical pitch (mm)',gauge:'Horizontal pitch (mm)',
  clearance:'Root clearance (mm)',heightRatio:'Minimum plate height / beam depth',diameter:'Bolt diameter (mm)',
  plateFy:'Plate fy (MPa)',plateFu:'Plate fu (MPa)',beamFy:'Beam web fy (MPa)',beamFu:'Beam web fu (MPa)',
  minRows:'Minimum rows',maxRows:'Maximum rows',maxUR:'Maximum UR',spanRatio:'Span / depth',tie:'Accidental tying demand (kN)'};
function table(target,rows){
  const t=el('table');
  rows.forEach((row,i)=>{const tr=t.insertRow();row.forEach(v=>{const td=el(i?'td':'th');td.append(v instanceof Node?v:String(fmt(v)));tr.append(td);});});
  target.replaceChildren(t);
}
function button(label,click){const b=el('button',label);b.type='button';b.onclick=click;return b;}
export function schedulePage(sections){
  let c,result,current,saved;
  const start=$('schedule-start'), app=$('schedule-app');
  const pane=id=>{for(const key of ['criteria','schedule','typical'])$(key).hidden=id!==key;};
  function invalidate(){result=current=null;$('inspection').replaceChildren();$('schedule-error').textContent='';}
  function fields(){
    const host=$('schedule-fields');host.replaceChildren();
    function field(title,input){const label=el('label',title+' ');label.append(input);host.append(label);}
    for(const [key,title] of Object.entries(labels)){
      const input=el('input');input.type='number';input.step='any';input.value=c[key];input.oninput=()=>{c[key]=input.valueAsNumber;invalidate();};field(title,input);
    }
    function list(key,title,choices){
      const s=el('select');for(const [value,text] of choices)s.add(new Option(text,value));s.value=c[key];
      s.onchange=()=>{c[key]=s.value;invalidate();};field(title,s);
    }
    list('restraint','Permanent lateral restraint',[['restrained','Restrained'],['unknown','Unknown'],['unrestrained','Unrestrained']]);
    list('objective','Selection priority',[['single','Single column first'],['bolts','Fewest bolts'],['area','Smallest plate area'],['weld','Minimum weld length'],['cost','Estimated fabrication cost']]);
    list('grade','Bolt class',['4.6','5.6','8.8','10.9'].map(x=>[x,x]));
    const threaded=el('input');threaded.type='checkbox';threaded.checked=c.threaded;
    threaded.onchange=()=>{c.threaded=threaded.checked;invalidate();};field('Threads in shear plane',threaded);
    list('supportFace','Supporting face',[['web','I-section web'],['flange','I-section flange']]);
    const support=el('select');support.add(new Option('Unspecified','0'));
    for(const s of sections)support.add(new Option(s.name,s.id));
    support.value=c.supportId;support.onchange=()=>{c.supportId=Number(support.value);invalidate();};field('Supporting section',support);
    const allowed=el('select');for(const val of ['1,2','1','2'])allowed.add(new Option(val,val));allowed.value=c.columns.join(',');
    allowed.onchange=()=>{c.columns=allowed.value.split(',').map(Number);invalidate();};field('Permitted bolt columns',allowed);
    const loads=el('input');loads.value=c.loads.join(', ');loads.oninput=()=>{c.loads=loads.value.split(',').map(Number);invalidate();};field('Upper shear boundaries (kN)',loads);
    const families=el('details');families.append(el('summary','Beam families and included profiles'));host.append(families);
    for(const f of [...new Set(sections.map(family))].filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
      const profiles=sections.filter(s=>family(s)===f), group=el('details'), heading=el('summary');
      const check=(name,checked,fn)=>{const l=el('label'),i=el('input');i.type='checkbox';i.checked=checked;i.onchange=()=>{fn(i.checked);invalidate();};l.append(i,name);return l;};
      heading.append(check(f,c.families.includes(f),on=>{c.families=c.families.filter(x=>x!==f);if(on)c.families.push(f);}));
      group.append(heading);for(const p of profiles)group.append(check(p.name,!c.excluded.includes(p.id),on=>{c.excluded=c.excluded.filter(id=>id!==p.id);if(!on)c.excluded.push(p.id);}));
      families.append(group);
    }
  }
  function inspect(cell){
    const host=$('inspection');host.replaceChildren(el('h3',cell.f+' · '+cell.V+' kN · '+(cell.mark??cell.status)));
    if(!cell.choice){host.append(el('p',cell.reason));return;}
    current=cell;const {profiles,g,worst,tie}=cell.choice;
    const criteria={...c,supportProfile:sections.find(s=>s.id===c.supportId)};
    const profile=profiles.find(s=>s.name===worst.profile), x=assess(criteria,g,profile,cell.V);
    host.append(el('p','Governing '+worst.profile+' · '+worst.name+' · UR '+fmt(worst.ratio)+' · family component shear resistance '+fmt(cell.choice.capacity)+' kN · minimum component tying resistance '+fmt(tie)+' kN'));
    const deriv=el('div');host.append(deriv);table(deriv,[['Calculation','Substitution','Value','Unit'],...x.derivation]);
    const rows=[['Profile','Check','Reference','Action','Resistance','Unit','UR']];
    for(const s of profiles)for(const q of assess(criteria,g,s,cell.V).checks)rows.push([s.name,q.name,q.ref,q.action,q.resistance,q.unit,q.ratio]);
    const div=el('div');div.className='fin-table';host.append(div);table(div,rows);
    for(const view of ['plan','elevation']){const svg=$('sheet-'+view);typical(svg,c,g,profile.values,x.r,view==='plan',$('symbolic').checked);}
    const bolts=el('details');bolts.append(el('summary','Bolt group forces and geometry'));
    const diagram=document.createElementNS('http://www.w3.org/2000/svg','svg');diagram.setAttribute('class','fin-drawing');bolts.append(diagram);
    drawBoltGroup(diagram,x.r,x.r.checks[0].bolt);const forces=el('div');bolts.append(forces);
    table(forces,[['Bolt','X (mm)','Y from beam top (mm)','Fx (kN)','Fy (kN)','Resultant (kN)'],...x.r.group.bolts.map(b=>[b.id,b.x,profile.values.tf+profile.values.r+c.clearance+g.hp-b.y,b.fx,b.fy,b.force])]);
    host.append(bolts);
    host.append(el('p','LTB · λLT '+fmt(x.stability.slenderness??0)+' · χLT '+fmt(x.stability.reduction??1)+' · zp '+g.zp+' mm · zg '+g.zg+' mm. Overall joint, supporting member stability and rotation: NOT_VERIFIED.'));
    $('mark').value=cell.mark;
  }
  function run(){
    try{
      result=generate(c,sections);
      const rows=[['Beam family',...c.loads.map(v=>'≤'+v+' kN')]];
      for(const f of c.families)rows.push([f,...result.cells.filter(x=>x.f===f).map(x=>button(x.mark??(x.status==='Infeasible'?'–':x.status),()=>inspect(x)))]);
      table($('matrix'),rows);
      const d=result.details, params=[['Parameter',...d.map(g=>g.mark)]];
      for(const key of ['nr','nc','n','hp','bp','tp','sw','aw','zp','zg'])params.push([key,...d.map(g=>g[key])]);
      for(const [symbol,key] of [['d','diameter'],['d0','hole'],['p1','pitch'],['p2','gauge'],['e1','end'],['e2','plateEdge'],['eb','beamEnd'],['g','gap']])params.push([symbol,...d.map(g=>symbol==='p2'&&g.nc===1?'–':c[key])]);
      table($('params'),params);$('mark').replaceChildren(...d.map(g=>new Option(g.mark,g.mark)));
      $('inspection').replaceChildren();for(const v of ['plan','elevation'])$('sheet-'+v).replaceChildren();
      current=null;const first=result.cells.find(x=>x.choice);if(first)inspect(first);pane('schedule');
    }catch(e){invalidate();pane('criteria');$('schedule-error').textContent=e.message;}
  }
  $('symbolic').onchange=()=>{if(current)inspect(current);};
  for(const view of ['plan','elevation'])$('save-'+view).onclick=()=>{
    if(!current)return;
    const a=el('a');a.download=current.mark+'-'+view+'.svg';
    a.href=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString($('sheet-'+view))],{type:'image/svg+xml'}));
    a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  $('apply-range').onclick=()=>{
    const [first,last,step]=['lo','hi','inc'].map(id=>$(id).valueAsNumber);
    if(![first,last,step].every(Number.isFinite)||first<=0||last<first||step<=0||(last-first)/step>500){$('schedule-error').textContent='Enter a positive range with at most 501 bands.';return;}
    c.loads=Array.from({length:Math.floor((last-first)/step)+1},(_,i)=>first+i*step);
    if(c.loads.at(-1)<last)c.loads.push(last);invalidate();fields();
  };
  $('generate').onclick=run;
  $('mark').onchange=()=>inspect(result.cells.find(x=>x.mark===$('mark').value));
  app.querySelectorAll('[data-pane]').forEach(b=>b.onclick=()=>{if(b.dataset.pane!=='criteria'&&!result)run();if(result||b.dataset.pane==='criteria')pane(b.dataset.pane);});
  $('print-results').onclick=()=>window.print();
  function reportLines(){
    if(!result)throw Error('Generate the schedule first.');
    const rows=[['No-notch fin plate schedule',1],['Preliminary component screening. Overall joint and rotation NOT_VERIFIED.'],
      ...Object.entries(c).map(([k,v])=>[k+' = '+v]),['Schedule',2]];
    for(const cell of result.cells){
      rows.push([cell.f+' · '+cell.V+' kN · '+(cell.mark??cell.status)+' · '+(cell.choice?cell.choice.worst.name+' · '+cell.choice.worst.profile:cell.reason)]);
      if(cell.choice)rows.push(['Component shear '+fmt(cell.choice.capacity)+' kN · tying '+fmt(cell.choice.tie)+' kN · UR '+fmt(cell.choice.worst.ratio)]);
    }
    for(const g of result.details)rows.push([g.mark+' · '+Object.entries(g).filter(([k])=>k!=='mark').map(([k,v])=>k+'='+fmt(v)).join(' ')]);
    if(current)for(const s of current.choice.profiles){
      const x=assess({...c,supportProfile:sections.find(p=>p.id===c.supportId)},current.choice.g,s,current.V);
      rows.push([s.name+' · '+current.mark,2]);
      for(const [name,expr,value,unit] of x.derivation)rows.push([name+' = '+expr+' = '+fmt(value)+' '+unit]);
      for(const q of x.checks)rows.push([q.ref+' · '+q.name+' · '+fmt(q.action)+' / '+fmt(q.resistance)+' = '+fmt(q.ratio)]);
    }
    return rows;
  }
  $('excel').onclick=()=>{
    const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const sheet=(name,rows)=>'<Worksheet ss:Name="'+name+'"><Table>'+rows.map(r=>'<Row>'+r.map(v=>'<Cell><Data ss:Type="String">'+escape(v)+'</Data></Cell>').join('')+'</Row>').join('')+'</Table></Worksheet>';
    const tables=['matrix','params'].map(id=>sheet(id,[...$(id).querySelectorAll('tr')].map(r=>[...r.cells].map(td=>td.textContent))));
    tables.push(sheet('Criteria',Object.entries(c)),sheet('Verification',reportLines()));
    const xml='<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+tables.join('')+'</Workbook>';
    const a=el('a');a.href=URL.createObjectURL(new Blob([xml],{type:'application/xml'}));a.download='fin-plate-schedule.xml';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  function open(data={}){saved=data;c={...structuredClone(initial),...structuredClone(data.criteria??{})};invalidate();
    $('joint-template').hidden=start.hidden=true;app.hidden=false;fields();pane('criteria');}
  $('open-schedule').onclick=()=>open();
  return {open,get active(){return !app.hidden;},reset(){app.hidden=$('joint-template').hidden=true;start.hidden=false;},
    hide(){app.hidden=start.hidden=true;},snapshot(){return {...saved,workflow:'schedule',criteria:structuredClone(c)};},
    report(){return worksheet('No-notch fin plate schedule',reportLines());}};
}
