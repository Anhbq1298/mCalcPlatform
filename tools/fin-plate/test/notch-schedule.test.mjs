import assert from 'node:assert/strict';
import test from 'node:test';
import catalogue from '../../../vendor/calccanvas/src/engineering/steel/data/catalogue.json' with {type:'json'};
import { generateNotched, holeClearance, notchDefaults, resolveCope } from '../src/notch-schedule.mjs';
import { allocateMarks, markDefinition } from '../src/project-marks.mjs';
import { geometry, initial } from '../src/schedule.mjs';

const profile=name=>catalogue.find(section=>section.name===name);
const a=profile('UB 533x210x92'), b=profile('UB 406x178x74');
const c=profile('UB 610x229x101'), d=profile('UB 457x191x74');

test('four reviewed cases preserve the top datum and independently dimension the lower cope',()=>{
  for(const [main,beam,topLength,bottomLength,bottomDepth] of [[a,b,100,0,0],[c,a,110,0,0],[b,a,85,85,148.1],[d,c,95,95,172.6]]){
    const shape=resolveCope(main.values,beam.values,notchDefaults);
    assert.equal(shape.Lt,topLength);
    assert.equal(shape.dt,40);
    assert.equal(shape.Lb,bottomLength);
    assert.ok(Math.abs(shape.db-bottomDepth)<1e-8);
    assert.deepEqual(shape.issues,[]);
  }
  assert.ok(resolveCope(a.values,b.values,{...notchDefaults,maxTopLength:99}).issues.length);
  assert.deepEqual(resolveCope(a.values,b.values,{...notchDefaults,maxTopLength:100,maxTopDepth:40}).issues,[]);
  assert.equal(resolveCope(a.values,b.values,{...notchDefaults,gap:120}).Lt,0);
  const unequal=resolveCope(b.values,a.values,{...notchDefaults,bottomHorizontalClearance:20});
  assert.equal(unequal.Lt,85);
  assert.equal(unequal.Lb,95);
});

test('bolt edge screening keeps the fin plate and web independent',()=>{
  const config={...initial,...notchDefaults};
  const g=geometry(config,4,1);
  const checks=holeClearance(g,config,b.values,{Lt:100,dt:60,Lb:0,db:0},40);
  assert.ok(checks.some(x=>x.hole===1&&x.part==='Supported web'&&x.actual===20));
  assert.ok(checks.every(x=>x.part!=='Fin plate'));
});

test('100 beam pairs retain independent results and every selected point passes component screening',()=>{
  const choices=[a,b,c,d,...catalogue.filter(s=>s.family==='UB'&&s.values.h<380).slice(0,6)];
  const ids=choices.map(s=>s.id);
  const result=generateNotched({supports:ids,beams:ids,loads:[100,200],restraint:'restrained'},catalogue);
  assert.equal(result.pairs.length,100);
  assert.ok(result.pairs.some(p=>p.cells.some(cell=>cell.g)));
  for(const p of result.pairs)for(const cell of p.cells.filter(x=>x.g)){
    assert.ok(cell.capacity>=cell.V);
    assert.ok(cell.worst.ratio<=1);
  }
  const outside=generateNotched({supports:[a.id],beams:[b.id],loads:[100],restraint:'unknown'},catalogue);
  assert.equal(outside.pairs[0].cells[0].status,'Not verified');
});

test('project marks are reused by fabrication identity with explicit legacy collisions',()=>{
  const criteria={...initial,gap:10};
  const s=markDefinition(criteria,geometry(criteria,4,1));
  const d=markDefinition(criteria,geometry(criteria,4,2));
  const first=allocateMarks([], [s,d]);
  assert.deepEqual(first.marks,['S1','D1']);
  const second=allocateMarks(first.records,[{...s,hole:24},s,d],['S1','S2','D2']);
  assert.deepEqual(second.marks,['S2','S1','D1']);
  assert.deepEqual(allocateMarks(second.records,[d,s]).marks,['D1','S1']);
});

test('family schedule checks every real pair with a common cope and bolt layout',async()=>{
  const {generateNotchFamilies,notchFamilies}=await import('../src/notch-families.mjs');
  const groups=notchFamilies(catalogue);
  const options={supportFamilies:['UB533'],beamFamilies:['UB406'],loads:[100,200,300],restraint:'restrained'};
  const m=generateNotchFamilies(options,catalogue), pair=m.pairs[0];
  assert.equal(m.combinationsChecked,72);
  assert.deepEqual(pair.cope,{Lt:100,dt:40,Lb:0,db:0});
  assert.notEqual(pair.cells[0].governingPair.support.id,pair.cells[1].governingPair.support.id);
  const all=generateNotched({...options,supports:groups.get('UB533').map(s=>s.id),
    beams:groups.get('UB406').map(s=>s.id),commonCope:pair.cope,
    commonPlateTop:pair.cells[0].governingPair.plateTop,collectLayouts:true},catalogue);
  for(const [i,cell] of pair.cells.entries()){
    const key=cell.g.nc+'/'+cell.g.nr;
    assert.ok(all.pairs.every(p=>p.cells[i].passing.has(key)));
    assert.equal(cell.worst.ratio,Math.max(...all.pairs.map(p=>p.cells[i].passing.get(key).worst.ratio)));
    assert.equal(cell.capacity,Math.min(...all.pairs.map(p=>p.cells[i].passing.get(key).capacityAt())));
  }
  const clash=generateNotchFamilies({...options,supportFamilies:['UB610'],beamFamilies:['UB533']},catalogue);
  assert.equal(clash.combinationsChecked,216);
  assert.equal(clash.pairs[0].cope.Lt,160);
  assert.ok(clash.pairs[0].cells.every(cell=>cell.status==='Clash'&&!cell.g));
});
