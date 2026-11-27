import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../../../vendor/calccanvas/src/engineering/steel/data/catalogue.json' with {type:'json'};
import { assess, family, generate, geometry, initial } from '../src/schedule.mjs';

test('all scheduled family/profile actions meet the reported component limit',()=>{
  const r=generate(initial,data);
  assert.equal(r.cells.length,66);
  for(const {choice,V,f} of r.cells.filter(x=>x.choice)){
    assert.equal(choice.profiles.length,data.filter(x=>family(x)===f).length);
    assert.ok(choice.capacity>=V-1e-8);
    for(const profile of choice.profiles){
      const x=assess(initial,choice.g,profile,choice.capacity);
      assert.ok(x.checks.every(q=>q.ratio<=1+1e-8));
      const b=profile.values;
      assert.ok(Math.abs(x.r.height-x.r.beamCentre-b.h/2+b.tf+b.r+initial.clearance)<1e-8);
    }
  }
  for(const prefix of ['S','D']){
    const keys=r.details.map(g=>g.mark).filter(x=>x.startsWith(prefix));
    assert.deepEqual(keys,keys.map((_,i)=>prefix+(i+1)));
  }
});
test('long plate scope, tool envelope, weld and accidental tie prevent automatic selection',()=>{
  for(const edit of [{restraint:'unknown'},{toolDiameter:200},{tie:5000},{weldLeg:2}]){
    const r=generate({...initial,families:['UB406'],loads:[50],...edit},data);
    assert.equal(Boolean(r.cells[0].choice),false);
  }
});
test('SCI P358 Example 2 p.155–156 component tie for four M20 bolts',()=>{
  const c={...initial,beamFy:275,beamFu:410,gap:10,weldLeg:8};
  const p=data.find(x=>x.name.includes('406x178x74')&&x.values.tw===9.5);
  assert.ok(p);
  const x=assess(c,geometry(c,4,1),p,50);
  // Bolt shear 428 kN, plate bearing 560 kN, beam web bearing governs at about 430 kN or bolt shear at 428 kN.
  assert.ok(Math.abs(x.tie-428)<2);
});
test('P358 Example 2 Check 14, 305x305x137 UKC web governs tying at 412 kN',()=>{
  const section=data.find(s=>s.name==='UB 406x178x74');
  const supportProfile={values:{h:246.7,tf:0,r:0,tw:13.8}}; // Published clear web depth and web thickness, p.157.
  const c={...initial,gap:10,weldLeg:8,plateFu:410,beamFy:275,beamFu:410,supportFy:275,supportFu:410,supportProfile};
  const x=assess(c,geometry(c,4,1),section,50);
  assert.ok(Math.abs(x.tie-412)<2, String(x.tie));
});
