import assert from 'node:assert/strict';
export function assertNoForeignDeadline(listing,id){
 assert.match(id,/^[a-f0-9]{12}$/);const names=listing.split('\n').map(line=>line.trim().split(/\s+/)[0]).filter(Boolean);
 for(const name of names){const match=name.match(/^ats-crm-(?:deadline-([a-f0-9]{12})-[1-9][0-9]*\.timer|watch-([a-f0-9]{12})\.service)$/);assert.ok(match,'Unknown recovery control unit');
  assert.equal(match[1]??match[2],id,'Another source generation still has an active deadline or watchdog; retire its positively fenced run first');}
 return names.length;
}
