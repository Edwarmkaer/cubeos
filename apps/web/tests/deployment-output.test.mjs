import {test} from 'node:test';import assert from 'node:assert/strict';
test('Vercel uses native output while Docker retains standalone',async()=>{
 const previous=process.env.VERCEL;
 try{
  process.env.VERCEL='1';assert.equal((await import('../next.config.ts?target=vercel')).default.output,undefined);
  delete process.env.VERCEL;assert.equal((await import('../next.config.ts?target=docker')).default.output,'standalone');
 }finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
