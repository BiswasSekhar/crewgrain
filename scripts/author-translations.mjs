// Build-time copy authoring only. No runtime translation service or factory data.
// Only canonical, non-sensitive interface strings from en.json are submitted.
// The resulting JSON is committed with the app and works offline.
import fs from 'node:fs';
const selected=process.argv.find(x=>x.startsWith('--languages='))?.split('=')[1].split(',');
const all=fs.readdirSync('src/locales').filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5));
const languages=selected??all.filter(code=>!['en','brx','ks'].includes(code));
const canonical=JSON.parse(fs.readFileSync('src/locales/en.json','utf8'));
const context=JSON.parse(fs.readFileSync('scripts/translation-context.json','utf8'));
const source=Object.fromEntries(Object.entries(canonical).map(([key,value])=>[key, context[value] ?? value.replace(/\boperations\b/g,'sewing operations').replace(/\boperation\b/g,'sewing operation')]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const blocks=[0x0660,0x06f0,0x0966,0x09e6,0x0a66,0x0ae6,0x0b66,0x0be6,0x0c66,0x0ce6,0x0d66,0xabf0,0x1c50];
function digits(text){return text.replace(/\p{Nd}/gu,char=>{const n=char.codePointAt(0),base=blocks.find(b=>n>=b&&n<b+10);return base===undefined?char:String(n-base);});}
const clean=(value,source)=>!/[⟦⟧【】]|QZX|crewgrainvalue\d@example/.test(value)&&(source.includes("\n")||!value.includes("\n"));
const placeholders=text=>[...text.matchAll(/\{\{[^}]+\}\}/g)].map(m=>m[0]).sort().join('|');
async function translate(code,entries){
 const protect=text=>text.replace(/\{\{value([0-9]+)\}\}/g,(_,n)=>`QZX${String(n).padStart(4,'0')}XZQ`);
 const restore=text=>text.replace(/QZX\s*([0-9]+)\s*XZQ/gi,(_,n)=>`{{value${Number(n)}}}`);
 if(entries.length===1){const [key,text]=entries[0];if(!/[A-Za-z]/.test(text.replace(/\{\{[^}]+\}\}/g,'')))return {[key]:text};const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl='+encodeURIComponent(code)+'&dt=t&q='+encodeURIComponent(protect(text)),{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`Translator HTTP ${r.status}`);const p=await r.json();const value=restore(p[0]?.map(x=>x[0]).join('')??'');return value&&clean(value,text)&&placeholders(text)===placeholders(value)?{[key]:value}:{};}
 const query=entries.map(([,text],index)=>`⟦${String(index).padStart(4,'0')}⟧ ${protect(text)}`).join('\n');
 const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl='+encodeURIComponent(code)+'&dt=t&q='+encodeURIComponent(query);
 const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error(`Translator HTTP ${response.status}`);
 const payload=await response.json();
 const output=payload[0]?.map(part=>part[0]).join('')??'';
 const chunks=[...output.matchAll(/[⟦\[【]\s*([\p{Nd}]{4})\s*[⟧\]】]\s*([\s\S]*?)(?=[⟦\[【]\s*[\p{Nd}]{4}\s*[⟧\]】]|$)/gu)];
 const result={};
 for(const chunk of chunks){const index=Number(digits(chunk[1]));if(!entries[index])continue;const [key,text]=entries[index];let value=restore(chunk[2].trim());
  value=value.replace(/\{\s*\{\s*value\s*([0-9]+)\s*\}\s*\}/gi,(_,n)=>`{{value${n}}}`);
  if(value&&clean(value,text)&&placeholders(value)===placeholders(text))result[key]=value;
 }
 return result;
}
const errors=[];let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<languages.length){const code=languages[cursor++],file='src/locales/'+code+'.json';
 let catalog=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const entries=Object.entries(source).filter(([key])=>!catalog[key]);
 const batches=[];let batch=[],size=0;for(const entry of entries){if(size+entry[1].length>1800&&batch.length){batches.push(batch);batch=[];size=0;}batch.push(entry);size+=entry[1].length+10;}if(batch.length)batches.push(batch);
 console.log(`${code}: ${entries.length} strings / ${batches.length} batches`);
 for(let index=0;index<batches.length;index++){
  const chunk=batches[index];let result={};
  for(let attempt=0;attempt<3;attempt++){try{result=await translate(code,chunk);break;}catch(error){if(attempt===2)errors.push({code,batch:index,error:error.message});await sleep(700*(attempt+1));}}
  Object.assign(catalog,result);
  // Retry individual phrases only when a batch delimiter/placeholder was altered.
  for(const entry of chunk.filter(([key])=>!catalog[key])){try{Object.assign(catalog,await translate(code,[entry]));}catch(error){errors.push({code,key:entry[0],error:error.message});}await sleep(100);}
  fs.writeFileSync(file+'.tmp',JSON.stringify(catalog,null,2)+'\n');
  let written=false;for(let retry=0;retry<10&&!written;retry++){try{fs.renameSync(file+'.tmp',file);written=true;}catch(error){if(error.code!=='EPERM')throw error;await sleep(100);}}
  if(!written){fs.copyFileSync(file+'.tmp',file);try{fs.unlinkSync(file+'.tmp')}catch{}}
  if(index%5===0||index===batches.length-1)console.log(`${code}: batch ${index+1}/${batches.length}, ${Object.keys(catalog).length}/${Object.keys(source).length}`);
  await sleep(180);
 }
}}));
fs.mkdirSync('outputs/i18n',{recursive:true});fs.writeFileSync('outputs/i18n/authoring-errors.json',JSON.stringify(errors,null,2));
if(errors.length)console.log('Authoring errors:',errors.length);
