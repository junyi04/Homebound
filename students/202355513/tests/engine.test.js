import test from 'node:test';
import assert from 'node:assert/strict';
import {lane, obstacles, collision, score} from '../app/engine.js';

test('daily courses reproduce identical lanes from the same seed',()=>{
  for(let r=0;r<200;r++) assert.deepEqual(lane(123,r),lane(123,r));
  assert.notDeepEqual(lane(123,4),lane(124,4));
});
test('start and every fifth row are safe rest points',()=>{
  for(let seed=0;seed<20;seed++) for(let row=0;row<200;row++){
    const l=lane(seed,row);
    if(row<3||row%5===0) {assert.equal(l.type,'grass');assert.equal(collision(l,4,300),false);}
  }
});
test('moving hazards collide at their position and leave a passable gap',()=>{
  for(let row=3;row<100;row++){
    const l=lane(42,row);if(l.type==='grass')continue;
    const positions=obstacles(l,10);assert.ok(positions.length);
    assert.equal(collision(l,positions[0],10),true);
    assert.equal(collision(l,positions[0]+l.gap/2,10),false);
    assert.notDeepEqual(positions,obstacles(l,11));
  }
});
test('card spawn bound matches server acceptance and scoring',()=>{
  for(let seed=0;seed<20;seed++){let count=0;for(let row=0;row<500;row++){
    if(lane(seed,row).item==='card')count++;
    assert.ok(count<=Math.floor(row/7)+1);
  }}
  assert.equal(score(15,2),250);
});
