// Offline catalog authoring for languages unavailable in the general translator.
// Calls a public IndicTrans2 demo with static UI copy only; no app/user records.
import fs from 'node:fs';
const source=JSON.parse(fs.readFileSync('src/locales/en.json','utf8'));
const languages=[['brx','brx_Deva'],['ks','kas_Arab']];
const placeholders=s=>[...s.matchAll(/\{\{[^}]+\}\}/g)].map(m=>m[0]).sort().join('|');
const protect=s=>s.replace(/\{\{value(\d+)\}\}/g,(_,n)=>`crewgrainvalue${n}@example.invalid`);
const restore=s=>s.replace(/crewgrainvalue\s*(\d+)\s*@\s*example\s*\.\s*invalid/gi,(_,n)=>`{{value${n}}}`);
const repairs=[];
async function translate(target,entries){
 const text=entries.map(([,value],index)=>`${protect(value)}${/[.!?।]$/.test(value)?' ':'. '}https://crewgrain.invalid/id${String(index).padStart(4,'0')} .`).join(' ');
 const r=await fetch('https://mukeshseera71-indictrans2-translator.hf.space/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,source_lang:'eng_Latn',target_lang:target}),signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw Error('IndicTrans2 HTTP '+r.status);
 const output=(await r.json()).translation??'';
 const marker=/https?:\/\/crewgrain\.invalid\/id(\d{4})/g;
 let start=0;const result={};for(const match of output.matchAll(marker)){
  const index=Number(match[1]);if(!entries[index])continue;
  const [key,value]=entries[index];let translated=restore(output.slice(start,match.index)).replace(/^[\s.।۔]+|[\s.।۔]+$/g,'');start=match.index+match[0].length;
  if(/[.!?]$/.test(value))translated+=target==='kas_Arab'?'۔':'।';
  if(translated&&placeholders(translated)===placeholders(value))result[key]=translated;
 }
 return result;
}
for(const[code,target]of languages){
 const file='src/locales/'+code+'.json',catalog=JSON.parse(fs.readFileSync(file,'utf8'));
 const entries=Object.entries(source).filter(([key])=>!catalog[key]);
 for(const[key,value]of entries)if(!/[A-Za-z]/.test(value.replace(/\{\{[^}]+\}\}/g,'')))catalog[key]=value;
 const remaining=entries.filter(([key])=>!catalog[key]);
 console.log(code+': '+remaining.length+' strings');
 for(let offset=0;offset<remaining.length;offset+=20){
  const batch=remaining.slice(offset,offset+20);let result={};
  try{result=await translate(target,batch);}catch(error){console.log(code,'batch retry',offset,error.message);try{result=await translate(target,batch);}catch(second){repairs.push({code,offset,error:second.message});}}
  Object.assign(catalog,result);
  for(const entry of batch.filter(([key])=>!catalog[key])){try{Object.assign(catalog,await translate(target,[entry]));}catch(error){repairs.push({code,key:entry[0],error:error.message});}}
  fs.writeFileSync(file,JSON.stringify(catalog,null,2)+'\n');
  console.log(code+': '+Math.min(offset+20,remaining.length)+'/'+remaining.length+' attempted; '+Object.keys(catalog).length+'/'+Object.keys(source).length+' stored');
 }
}
fs.writeFileSync('outputs/i18n/indic-authoring-errors.json',JSON.stringify(repairs,null,2));
