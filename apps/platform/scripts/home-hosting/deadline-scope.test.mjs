import {test} from 'node:test';import assert from 'node:assert/strict';import {assertNoForeignDeadline} from './deadline-scope.mjs';
test('a new writer generation cannot overlap another rehearsal deadline, while renewal retains its own armed timer',()=>{
 const id='abcdef123456';assert.equal(assertNoForeignDeadline('',id),0);
 assert.equal(assertNoForeignDeadline('ats-crm-deadline-'+id+'-1.timer loaded active waiting\n',id),1);
 assert.throws(()=>assertNoForeignDeadline('ats-crm-deadline-111111111111-3.timer loaded active waiting\n',id),/Another source generation/);
 assert.throws(()=>assertNoForeignDeadline('ats-crm-watch-111111111111.service loaded active running\n',id),/Another source generation/);
 assert.equal(assertNoForeignDeadline('ats-crm-watch-'+id+'.service loaded active running\n',id),1);
 assert.throws(()=>assertNoForeignDeadline('unexpected.timer',id));
});
