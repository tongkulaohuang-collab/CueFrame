import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from './store.mjs';
const files={
  '/voice':['vendor/voice-manager-ui/voice.html','text/html'],
  '/voice.js':['vendor/voice-manager-ui/voice.js','text/javascript'],
  '/voice.css':['vendor/voice-manager-ui/voice.css','text/css'],
  '/voice-issue-help.mjs':['shared/issue-help.mjs','text/javascript'],
  '/voice-issue-client.mjs':['shared/issue-client.mjs','text/javascript']
};
export async function voiceManagerUi(req,res,url){
  if(!['GET','HEAD'].includes(req.method)||!files[url.pathname])return false;
  const [file,type]=files[url.pathname];
  if(url.pathname==='/voice'){
    const ancestor=url.searchParams.get('frameboard')==='voices'?"'self'":"'none'";
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob: https:; connect-src 'self'; frame-ancestors ${ancestor}; base-uri 'self'; form-action 'self'`);
  }
  res.setHeader('Content-Type',type+'; charset=utf-8');res.setHeader('Cache-Control','no-store');
  res.end(req.method==='HEAD'?'':await fs.readFile(path.join(root,file)));return true;
}
