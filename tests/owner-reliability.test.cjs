const {test}=require('node:test');
const assert=require('node:assert/strict');
const {visibleOfferings}=require('../public/owner/owner-reliability');
test('95 historical MZ rows remain five visible rooms after repeated refreshes',()=>{
  const rooms=['커피빈','엔제리너스','이디야','스타벅스','투썸'].flatMap((name,n)=>Array.from({length:19},(_,i)=>({id:`${n}-${i}`,name,is_active:i===0})));
  for(let i=0;i<5;i++)assert.equal(visibleOfferings(rooms,'stay').length,5);
});
test('active namesakes, genuinely hidden rooms and market variants remain intact',()=>{
  const rooms=[{id:'a',name:'101',is_active:true},{id:'b',name:'101',is_active:true},{id:'c',name:'102',is_active:false},{id:'d',name:'103',retired_at:'2026-11-18'}];
  assert.deepEqual(visibleOfferings(rooms,'stay').map(row=>row.id),['a','b','c']);
  assert.equal(visibleOfferings([{id:'a',name:'고기',is_active:true},{id:'b',name:'고기',is_active:false}],'market').length,2);
});
