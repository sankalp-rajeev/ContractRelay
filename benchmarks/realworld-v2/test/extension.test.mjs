import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mechanicalOracle} from '../oracle.mjs';
import {cases} from '../cases.mjs';
import {assertProtected} from '../integrity.mjs';
const entry=cases.find(entry=>entry.id==='mapbox');
test('independent ray casting distinguishes inside, outside and holes',async()=>{
  assert(await mechanicalOracle(entry,entry.gate[0],{inside:true,point:entry.gate[0].point}));
  const expected=[false,false,true];
  for(const [index,input] of entry.sealed.entries()) {
    assert(await mechanicalOracle(entry,input,{inside:expected[index],point:input.point}));
    assert.equal(await mechanicalOracle(entry,input,{inside:!expected[index],point:input.point}),false);
  }
});
test('geometry oracle refuses an output that substitutes the input point',async()=>{
  assert.equal(await mechanicalOracle(entry,entry.gate[0],{inside:true,point:{longitude:0,latitude:0}}),false);
});
test('original core, benchmark and v1 artifacts retain their captured hashes',async()=>{
  const result=await assertProtected();assert.equal(result.protected_files,321);assert.equal(result.unchanged,true);
});
