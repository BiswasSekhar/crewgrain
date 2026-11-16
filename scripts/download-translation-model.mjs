import {createHash} from 'node:crypto';
// Authoring cache only. These weights are never imported by or bundled into Crewgrain.
import fs from 'node:fs';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
const repo='hari31416/indictrans2-en-indic-dist-200M-ONNX-int8';
const directory=path.join(process.env.LOCALAPPDATA,'CrewgrainLocalizationCache','indictrans2-int8');
fs.mkdirSync(directory,{recursive:true});
const files=await(await fetch('https://huggingface.co/api/models/'+repo+'/tree/main',{signal:AbortSignal.timeout(15000)})).json();
const selected=files.filter(f=>/^(encoder_model|decoder_model|decoder_with_past_model|decoder_shared).*\.onnx(\.data)?$/.test(f.path)||/^(tokenizer_(src|tgt|meta)|generation_config)\.json$/.test(f.path));
let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<selected.length){const file=selected[cursor++],destination=path.join(directory,file.path);if(fs.existsSync(destination)&&fs.statSync(destination).size===file.size)continue;console.log('Downloading',file.path,Math.round(file.size/1024/1024)+' MB');const response=await fetch('https://huggingface.co/'+repo+'/resolve/main/'+file.path,{signal:AbortSignal.timeout(300000)});if(!response.ok)throw Error('Model download HTTP '+response.status);await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(destination));if(fs.statSync(destination).size!==file.size)throw Error('Incomplete model file '+file.path);console.log('Ready',file.path);}}));
console.log('Authoring model cache:',directory);

// Reviewed inference helper; reject upstream changes until reviewed again.
const helperPath=path.join(directory,'translate.py');
const helperSha="b57fcc732d77b8c0d66b0b87b4b85e8513996e81d418ca9a68bb7f3c3d55035b";
if(!fs.existsSync(helperPath)||createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex')!==helperSha){
 const response=await fetch('https://huggingface.co/'+repo+'/resolve/main/translate.py');
 if(!response.ok)throw Error('Inference helper download failed');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==helperSha)throw Error('Inference helper changed; review it before use');
 fs.writeFileSync(helperPath,bytes);
}
