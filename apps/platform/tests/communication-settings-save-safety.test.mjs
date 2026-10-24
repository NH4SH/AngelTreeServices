import assert from 'node:assert/strict';
import test from 'node:test';
import {settingsForm,settingsSaveFixture} from './communication-settings-save-fixture.mjs';

test('owners and admins save the exact requested values and receive a confirmed version without running a sender',async()=>{
  for(const role of ['owner','admin']) {
    const f=settingsSaveFixture({roles:[role]}),form=settingsForm();form.set('business_timezone','America/Chicago');
    const result=await f.save(form);assert.equal(result.status,'success');assert.equal(result.settingsVersion,f.row.updated_at);
    assert.equal(f.row.business_timezone,'America/Chicago');assert.equal(f.row.automated_sending_enabled,false);
    assert.equal(f.writes,1);assert.ok(f.revalidated.includes('/admin/communications'));
  }
});
test('an old form cannot overwrite newer defaults or re-enable a switch another operator disabled',async()=>{
  const f=settingsSaveFixture({row:{automated_sending_enabled:true}}),old=settingsForm(f.row);
  const disable=settingsForm(f.row);disable.delete('automated_sending_enabled');assert.equal((await f.save(disable)).status,'success');
  const current=structuredClone(f.row),result=await f.save(old);assert.equal(result.status,'error');assert.match(result.message,/Reload/);
  assert.deepEqual(f.row,current);assert.equal(f.writes,1);
});
test('competing saves of the same version confirm one writer',async()=>{
  const f=settingsSaveFixture(),one=settingsForm(),two=settingsForm();one.set('minimum_send_interval_hours','12');two.set('minimum_send_interval_hours','36');
  const results=await Promise.all([f.save(one),f.save(two)]);assert.equal(results.filter(r=>r.status==='success').length,1);assert.equal(f.writes,1);
});
test('zero-row and missing singleton results never claim a successful save',async()=>{
  for(const options of [{zero:true},{missing:true}]){const f=settingsSaveFixture(options);assert.equal((await f.save(settingsForm())).status,'error');assert.equal(f.writes,0);assert.equal(f.revalidated.length,0);}
});
test('returned, thrown and data-plus-error writes expose no backend diagnostics and never confirm a save',async()=>{
  for(const options of [{writeError:true},{writeThrows:true},{clientThrows:true},{dataAndError:true}]){const f=settingsSaveFixture(options),result=await f.save(settingsForm());assert.notEqual(result.status,'success');assert.equal(result.settingsVersion,undefined);assert.doesNotMatch(result.message,/PRIVATE_SYNTHETIC/);assert.equal(f.revalidated.length,0);}
});
test('lost acknowledgement leaves an old-version retry safely rejected without a second write',async()=>{
  const f=settingsSaveFixture({lostAcknowledgement:true}),form=settingsForm();assert.equal((await f.save(form)).status,'warning');assert.equal(f.writes,1);
  assert.notEqual((await f.save(form)).status,'success');assert.equal(f.writes,1);
});
test('malformed acknowledgements do not advance the form version',async()=>{
  for(const badAcknowledgement of [{},{singleton:false,updated_at:'2026-10-24T01:00:00Z'},{singleton:true,updated_at:'bad'},{singleton:true}]) {
    const f=settingsSaveFixture({badAcknowledgement}),result=await f.save(settingsForm());assert.equal(result.status,'warning');assert.equal(result.settingsVersion,undefined);
  }
});
test('staff roles, disabled accounts, signed-out callers and missing clients cannot write defaults',async()=>{
  for(const options of [{roles:['estimator']},{roles:['crew']},{roles:['payroll_admin']},{roles:['customer']},{roles:['property_manager']},{roles:[]},{disabled:true},{anonymous:true},{noClient:true}]){
    const f=settingsSaveFixture(options),before=structuredClone(f.row);assert.equal((await f.save(settingsForm())).status,'error');assert.deepEqual(f.row,before);assert.equal(f.writes,0);
  }
});
test('missing and invalid form versions are rejected before writing',async()=>{
  for(const value of ['', 'invalid','2026-10-23','infinity','2026-99-99T12:00:00Z']){const f=settingsSaveFixture(),form=settingsForm();form.set('expected_updated_at',value);assert.equal((await f.save(form)).status,'error');assert.equal(f.writes,0);}
});
test('blank, missing, fractional and out-of-range offsets cannot silently become zero or a fallback',async()=>{
  for(const value of ['', ' ', '-1','1.5','1e1','0x10','91']){const f=settingsSaveFixture(),form=settingsForm();form.set('invoice_first_reminder_days',value);assert.equal((await f.save(form)).status,'error');assert.equal(f.writes,0);}
  const f=settingsSaveFixture(),form=settingsForm();form.delete('invoice_first_reminder_days');assert.equal((await f.save(form)).status,'error');assert.equal(f.writes,0);
});
test('zero-day invoice offset and valid boundary values remain available',async()=>{
  const f=settingsSaveFixture(),form=settingsForm();form.set('invoice_first_reminder_days','0');form.set('minimum_send_interval_hours','168');form.set('estimate_reminder_hours_before','336');
  assert.equal((await f.save(form)).status,'success');assert.equal(f.row.invoice_first_reminder_days,0);assert.equal(f.row.minimum_send_interval_hours,168);
});
test('invalid timezone fails without changing a stored control',async()=>{
  const f=settingsSaveFixture(),form=settingsForm();form.set('business_timezone','invalid/zone');assert.equal((await f.save(form)).status,'error');assert.equal(f.writes,0);
});
