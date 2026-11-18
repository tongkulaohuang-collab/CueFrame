import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';import {chromium} from 'playwright-core';import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {buildAnatomy} from './anatomy.mjs';import {localSpec} from '../../shared/local-process.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const [input,folder,mode]=process.argv.slice(2);const raw=JSON.parse(fs.readFileSync(input)),cfg={...localSpec(raw),...('index'in raw?{index:raw.index}:{})};const out=path.resolve(folder);fs.mkdirSync(out,{recursive:true});
const frames=Math.round(cfg.duration*cfg.fps);const conf=path.join(out,'config.json');fs.writeFileSync(conf,JSON.stringify(cfg,null,2));
const run=(bin,args)=>new Promise((resolve,reject)=>{const p=spawn(bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let tail='';p.stdout.on('data',d=>{tail=(tail+d).slice(-3000);if(String(d).includes('PROGRESS'))console.log(String(d).trim())});p.stderr.on('data',d=>tail=(tail+d).slice(-3000));p.on('error',reject);p.on('exit',c=>c?reject(Error(tail)):resolve());});
if(cfg.engine==='blender'){
 const rt=path.resolve(root,'../视频制作/工具/science-mcp/runtime');const found=fs.readdirSync(rt).find(n=>n.startsWith('blender-'));if(!found)throw Error('本机 Blender 尚未安装');
 await run(path.join(rt,found,'blender.exe'),['--background','--factory-startup','--python',path.join(here,cfg.template==='sine-plotter'?'blender-plotter.py':'blender-science.py'),'--',conf,out,...(mode==='--stills'?['--stills']:[])]);
 if(mode!=='--stills')await run(ffmpeg.path,['-y','-loglevel','error','-framerate',String(cfg.fps),'-i',path.join(out,'frames/%06d.png'),'-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'silent.mp4')]);
}else{
 const file=buildAnatomy(cfg,out);const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{const page=await browser.newPage({viewport:{width:cfg.width,height:cfg.height},deviceScaleFactor:1});await page.goto(pathToFileURL(file).href);await page.evaluate(()=>document.fonts.ready);let errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(mode==='--stills'){for(const [i,t]of[0,cfg.duration/2,cfg.duration-1/cfg.fps].entries()){await page.evaluate(t=>window.renderAt(t),t);await page.screenshot({path:path.join(out,`proof-${i}.png`)});}}
 else{const p=spawn(ffmpeg.path,['-y','-loglevel','error','-f','image2pipe','-framerate',String(cfg.fps),'-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'silent.mp4')],{windowsHide:true,stdio:['pipe','ignore','pipe']});let err='';p.stderr.on('data',d=>err+=d);const done=new Promise((res,rej)=>{p.on('error',rej);p.on('exit',c=>c?rej(Error(err)):res())});for(let i=0;i<frames;i++){await page.evaluate(t=>window.renderAt(t),i/cfg.fps);const buf=await page.screenshot();if(!p.stdin.write(buf))await new Promise(r=>p.stdin.once('drain',r));if(i%120===0)console.log('PROGRESS',i,frames)}p.stdin.end();await done;}
 if(errors.length)throw Error(errors.join(';'));fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify(await page.evaluate(()=>window.model),null,2));
 }finally{await browser.close()}
}
fs.writeFileSync(path.join(out,'render.json'),JSON.stringify({engine:cfg.engine,frames,...cfg,completed:new Date().toISOString()},null,2));console.log('DONE',out);
