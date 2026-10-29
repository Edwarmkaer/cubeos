import {readFile,writeFile} from 'node:fs/promises';
import {Ajv2020} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standalone from 'ajv/dist/standalone/index.js';
const ajv=new Ajv2020({allErrors:true,code:{source:true,esm:true}});
addFormats(ajv);
const read=async name=>JSON.parse(await readFile(new URL('../schemas/'+name,import.meta.url),'utf8'));
ajv.addSchema(await read('snapshot-v2.json'));
const validate=ajv.compile(await read('cloud-replica-v1.json'));
const imports=[];
const code=standalone(ajv,validate).replace(/require\("([^"]+)"\)(\.default)?/g,(_,path,hasDefault)=>{
 const name='dependency'+imports.length;
 imports.push(`import * as ${name} from ${JSON.stringify(path+'.js')};`);
 return hasDefault?`(${name}.default?.default ?? ${name}.default)`:`(${name}.default ?? ${name})`;
});
await writeFile(new URL('../src/cloud-validator.mjs',import.meta.url),'// Generated from canonical JSON schemas. Do not edit.\n'+imports.join('\n')+'\n'+code+'\n');
