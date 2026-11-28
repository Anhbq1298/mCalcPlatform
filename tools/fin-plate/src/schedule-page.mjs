import { markDefinition, projectMarks } from './project-marks.mjs';
import { notchPage, showProjectMarks } from './notch-page.mjs';
import { assess, family, generate, initial } from './schedule.mjs';
import { drawBoltGroup } from './drawing.mjs';
import { scheduleTypicals } from './schedule-typicals.mjs';
import { boltSizes } from './bolt-group.mjs';
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
  let c,result,current,saved,serial=0;
  const register=projectMarks(), notched=notchPage(sections,register);
  let tab;
  register.listen(records=>{if(tab)showProjectMarks(records);});
  const start=$('schedule-start'), app=$('schedule-app');

  function invalidate(){
    serial++;
    $('schedule').hidden=true;
    result=current=null;
    $('inspection').replaceChildren();
    $('schedule-error').textContent='';
    const scope=$('schedule-input-scope');
    scope.hidden=c.diameter===20 && c.grade==='8.8' && c.plateFy===275 && c.hole===22 && c.threaded;
    scope.textContent='Automatic marking currently covers M20 class 8.8, Ø22 normal holes, threads in shear, and S275 fin plates.';
  }
  function fields(){
    const host=$('schedule-fields'), basics=$('schedule-basics');
    host.replaceChildren();basics.replaceChildren();
    function field(title,input,target=host){const label=el('label',title+' ');label.append(input);target.append(label);}
    for(const [key,title] of Object.entries(labels)){
      if(['diameter','plateFy','plateFu'].includes(key))continue;
      const input=el('input');input.type='number';input.step='any';input.value=c[key];input.oninput=()=>{c[key]=input.valueAsNumber;invalidate();};field(title,input,['thickness','weldLeg','gap'].includes(key)?basics:host);
    }
    function list(key,title,choices,target=host,update=value=>{c[key]=value;}){
      const s=el('select');for(const [value,text] of choices)s.add(new Option(text,value));s.value=c[key];
      s.onchange=()=>{update(s.value);invalidate();};field(title,s,target);
    }
    list('restraint','Permanent lateral restraint',[['restrained','Restrained'],['unknown','Unknown'],['unrestrained','Unrestrained']]);
    list('objective','Selection priority',[['single','Single column first'],['bolts','Fewest bolts'],['area','Smallest plate area'],['weld','Minimum weld length'],['cost','Estimated fabrication cost']]);
    list('diameter','Bolt size',[...boltSizes.keys()].map(d=>[d,'M'+d]),basics,value=>{
      c.diameter=Number(value);c.hole=boltSizes.get(c.diameter)[0];fields();
    });
    list('grade','Bolt class',['4.6','5.6','8.8','10.9'].map(x=>[x,x]),basics);
    list('plateFy','Fin plate grade',[[275,'S275'],[355,'S355']],basics,value=>{
      c.plateFy=Number(value);c.plateFu=c.plateFy===275?410:470;
    });
    const threaded=el('input');threaded.type='checkbox';threaded.checked=c.threaded;
    threaded.onchange=()=>{c.threaded=threaded.checked;invalidate();};field('Threads in shear plane',threaded);
    list('supportFace','Supporting face',[['web','I-section web'],['flange','I-section flange']]);
    const support=el('select');support.add(new Option('Unspecified','0'));
    for(const s of sections)support.add(new Option(s.name,s.id));
    support.value=c.supportId;support.onchange=()=>{c.supportId=Number(support.value);invalidate();};field('Supporting section',support);
    const allowed=el('select');for(const val of ['1,2','1','2'])allowed.add(new Option(val,val));allowed.value=c.columns.join(',');
    allowed.onchange=()=>{c.columns=allowed.value.split(',').map(Number);invalidate();};field('Permitted bolt columns',allowed);
    const familyFields=$('schedule-families');
    familyFields.replaceChildren();
    const updateCount=()=>{$('family-count').textContent='('+c.families.length+' selected)';};
    updateCount();
    const otherFamilies=el('details');
    otherFamilies.append(el('summary','Other beam families'));
    host.append(otherFamilies);
    const profileOptions=el('details');
    profileOptions.append(el('summary','Included sections by family'));
    host.append(profileOptions);
    function checkbox(name,checked,change){
      const label=el('label'), input=el('input');
      input.type='checkbox';input.checked=checked;
      input.onchange=()=>{change(input.checked);invalidate();};
      label.append(input,name);
      return label;
    }
    for(const f of [...new Set(sections.map(family))].filter(Boolean)
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
      const profiles=sections.filter(s=>family(s)===f), group=el('details');
      group.append(el('summary',f));
      const picker=f.startsWith('UB')?familyFields:otherFamilies;
      picker.append(checkbox(f,c.families.includes(f),on=>{
        c.families=on?[...c.families,f].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})):c.families.filter(x=>x!==f);
        updateCount();
      }));
      for(const p of profiles)group.append(checkbox(p.name,!c.excluded.includes(p.id),on=>{
        c.excluded=on?c.excluded.filter(id=>id!==p.id):[...c.excluded,p.id];
      }));
      profileOptions.append(group);
    }
  }
  const count=$('threshold-count'), step=$('threshold-step'), custom=$('custom-thresholds');
  function renderThresholds(){
    const host=$('threshold-values');
    host.hidden=!custom.checked;
    step.disabled=custom.checked;
    host.replaceChildren();
    if(!custom.checked)return;
    for(const [index,value] of c.loads.entries()){
      const label=el('label','Threshold '+(index+1)+' (kN)'), input=el('input');
      Object.assign(input,{type:'number',min:0.01,step:'any',required:true,value:Number.isFinite(value)?value:''});
      input.oninput=()=>{c.loads[index]=input.valueAsNumber;invalidate();};
      label.append(input);host.append(label);
    }
  }
  function resizeThresholds(){
    if(!count.validity.valid || (!custom.checked&&!step.validity.valid)){invalidate();return;}
    const spacing=step.valueAsNumber>0?step.valueAsNumber:50;
    c.loads=Array.from({length:count.valueAsNumber},(_,i)=>custom.checked?(c.loads[i]??(c.loads.at(-1)??0)+(i-c.loads.length+1)*spacing):(i+1)*spacing);
    renderThresholds();
    invalidate();
  }
  count.oninput=step.oninput=custom.onchange=resizeThresholds;
  function drawings(){
    scheduleTypicals($('typical-drawings'),c,result,sections,$('symbolic').checked);
  }
  function inspect(cell){
    const host=$('inspection');host.replaceChildren(el('h3',cell.f+' · '+cell.V+' kN · '+(cell.mark??cell.status)));
    current=null;
    if(!cell.choice){host.append(el('p',cell.reason));return;}
    current=cell;const {profiles,g,worst,tie}=cell.choice;
    const criteria={...c,supportProfile:sections.find(s=>s.id===c.supportId)};
    const profile=profiles.find(s=>s.name===worst.profile), x=assess(criteria,g,profile,cell.V);
    host.append(el('p','Governing '+worst.profile+' · '+worst.name+' · UR '+fmt(worst.ratio)+' · family component shear resistance '+fmt(cell.choice.capacity)+' kN · minimum component tying resistance '+fmt(tie)+' kN'));
    const deriv=el('div');host.append(deriv);table(deriv,[['Calculation','Substitution','Value','Unit'],...x.derivation]);
    const rows=[['Profile','Check','Reference','Action','Resistance','Unit','UR']];
    for(const s of profiles)for(const q of assess(criteria,g,s,cell.V).checks)rows.push([s.name,q.name,q.ref,q.action,q.resistance,q.unit,q.ratio]);
    const div=el('div');div.className='fin-table';host.append(div);table(div,rows);
    const bolts=el('details');bolts.append(el('summary','Bolt group forces and geometry'));
    const diagram=document.createElementNS('http://www.w3.org/2000/svg','svg');diagram.setAttribute('class','fin-drawing');bolts.append(diagram);
    drawBoltGroup(diagram,x.r,x.r.checks[0].bolt);const forces=el('div');bolts.append(forces);
    table(forces,[['Bolt','X (mm)','Y from beam top (mm)','Fx (kN)','Fy (kN)','Resultant (kN)'],...x.r.group.bolts.map(b=>[b.id,b.x,profile.values.tf+profile.values.r+c.clearance+g.hp-b.y,b.fx,b.fy,b.force])]);
    host.append(bolts);
    host.append(el('p','LTB · λLT '+fmt(x.stability.slenderness??0)+' · χLT '+fmt(x.stability.reduction??1)+' · zp '+g.zp+' mm · zg '+g.zg+' mm. Overall joint, supporting member stability and rotation: NOT_VERIFIED.'));

  }
  async function run(){
    const request=++serial;
    try{
      const next=generate(c,sections);
      const details=next.details.map(g=>markDefinition(c,g));
      const previous=next.details.map(g=>g.mark);
      const assigned=await register.assign(details,previous);
      showProjectMarks(assigned.records);
      if(request!==serial)return;
      result=next;
      result.details.forEach((g,i)=>{g.mark=assigned.marks[i];});
      const projectMark=new Map(previous.map((mark,i)=>[mark,assigned.marks[i]]));
      for(const cell of result.cells)if(cell.choice)cell.mark=projectMark.get(cell.mark);
      const remap=previous.map((mark,i)=>[mark,assigned.marks[i]]).filter(([a,b])=>a!==b);
      $('schedule-error').textContent=remap.length?'Project marks applied: '+remap.map(([a,b])=>a+' → '+b).join(', '):'';

      const rows=[['Beam family',...c.loads.map(v=>'≤'+v+' kN')]];
      for(const f of c.families)rows.push([f,...result.cells.filter(x=>x.f===f).map(x=>button(x.mark??(x.status==='Infeasible'?'–':x.status),()=>inspect(x)))]);
      table($('matrix'),rows);
      const d=result.details, params=[['Parameter',...d.map(g=>g.mark)]];
      for(const key of ['nr','nc','n','hp','bp','tp','sw','aw','zp','zg'])params.push([key,...d.map(g=>g[key])]);
      for(const [symbol,key] of [['d','diameter'],['d0','hole'],['p1','pitch'],['p2','gauge'],['e1','end'],['e2','plateEdge'],['eb','beamEnd'],['g','gap']])params.push([symbol,...d.map(g=>symbol==='p2'&&g.nc===1?'–':c[key])]);
      table($('params'),params);
      $('inspection').replaceChildren();
      current=null;
      drawings();
      $('schedule').hidden=false;
    }catch(e){if(request===serial){invalidate();$('schedule-error').textContent=e.message;}}
  }
  $('symbolic').onchange=()=>{if(result)drawings();};
  $('criteria').onsubmit=event=>{event.preventDefault();run();};
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
  function select(name){
    tab=name;
    app.hidden=name!=='plain';
    $('notch-app').hidden=name!=='notch';
    for(const [id,value] of [['open-schedule','plain'],['open-notch','notch']])$(id).setAttribute('aria-pressed',String(value===name));
  }
  function open(data={}){
    saved=data;c={...structuredClone(initial),...structuredClone(data.criteria??{})};invalidate();
    $('joint-template').hidden=true;start.hidden=false;fields();
    count.value=c.loads.length;
    step.value=data.thresholdSpacing ?? (c.loads[0] || 50);
    custom.checked=data.customThresholds ?? c.loads.some((v,i)=>Math.abs(v-c.loads[0]*(i+1))>1e-8);
    renderThresholds();
    register.restore(data.finPlateMarks);showProjectMarks(register.snapshot());
    register.reload().then(records=>{if(tab&&saved===data)showProjectMarks(records);})
      .catch(error=>{if(tab&&saved===data)$('schedule-error').textContent=error.message;});
    notched.open(data.notchCriteria);
    select(data.scheduleTab==='notch'?'notch':'plain');
  }
  function hide(){
    select(undefined);start.hidden=true;$('project-fin-plates').hidden=true;
  }
  for(const [id,name] of [['open-schedule','plain'],['open-notch','notch']])$(id).onclick=()=>{
    if(!tab)open();
    select(name);
  };
  return {open,get active(){return Boolean(tab);},reset(){hide();$('joint-template').hidden=true;start.hidden=false;},
    hide,snapshot(){return {...saved,workflow:'schedule',criteria:structuredClone(c),notchCriteria:notched.snapshot(),
      scheduleTab:tab,finPlateMarks:register.snapshot(),customThresholds:custom.checked,thresholdSpacing:step.valueAsNumber};},
    report(){return tab==='notch'?notched.report():worksheet('No-notch fin plate schedule',reportLines());}};
}
