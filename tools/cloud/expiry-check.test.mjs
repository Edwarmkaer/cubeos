import {test} from 'node:test';import assert from 'node:assert/strict';
const module=await import('./expiry-check.mjs').catch(()=>({}));
test('expiry evidence requires an opened subscription and expected denial after deadline',()=>{
 assert.equal(typeof module.isExpectedExpiry,'function');const check=module.isExpectedExpiry;
 const denied=Object.assign(Error('Server error'),{data:{code:'ACCESS_UNAVAILABLE'}});
 assert.ok(check(denied,true,100,101));
 assert.equal(check(denied,true,100,99),false);
 assert.equal(check(Error('Network error'),true,100,101),false);
 assert.equal(check(denied,false,100,101),false);
});
