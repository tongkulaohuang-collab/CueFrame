import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {wave} from './wave.mjs';
const exec=promisify(execFile);

// Speech is the timing master. Sentence/ASR boundaries are NOT safe waveform
// splice points. Music cues guide the visuals; they must never cut the voice.
export async function alignVoiceToMusic(bytes,segments,plan) {
  if(!plan)return {bytes,segments};
  const task=exec(ffmpeg.path,['-v','error','-i','pipe:0','-vn','-ac','1','-ar','24000','-f','s16le','pipe:1'],
    {encoding:'buffer',windowsHide:true,maxBuffer:180*1024*1024,timeout:60000});
  task.child.stdin.on('error',()=>{});task.child.stdin.end(bytes);
  const {stdout}=await task;
  const result=alignPCM(stdout,segments,plan);
  // Keep the supplier's container, channels, sample rate and samples intact.
  return {...result,bytes:Buffer.from(bytes)};
}
export function alignPCM(pcm,segments,plan) {
  const rate=24000,frames=Math.floor(pcm.length/2),duration=frames/rate;
  const valid=Array.isArray(segments)&&segments.length&&segments.every((s,i)=>s.from>=0&&s.until>s.from&&s.until<=duration+.02&&(!i||s.from>=segments[i-1].until));
  const bytes=wave(new Float32Array(frames),rate);
  pcm.copy(bytes,44,0,frames*2);
  return {bytes,segments:valid?structuredClone(segments):undefined,
    voiceMusic:{...plan,alignedDuration:duration,mode:'preserve-speech',processingVersion:2,insertions:[]}};
}
