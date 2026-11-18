import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
const run=promisify(execFile);
export function parseAudioSilences(log,duration) {
  const spans=[];let from=null;
  for(const m of log.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)){
    const value=Math.max(0,Math.min(duration,Number(m[2])));
    if(m[1]==='start')from=value;
    else if(from!==null){if(value>from)spans.push({from,until:value});from=null;}
  }
  if(from!==null&&duration>from)spans.push({from,until:duration});
  return spans;
}
export async function inspectAudioContinuity(file,duration) {
  const {stderr}=await run(ffmpeg.path,['-nostdin','-hide_banner','-i',file,'-vn','-af','silencedetect=noise=-45dB:d=0.5','-f','null','-'],{windowsHide:true,maxBuffer:4*1024*1024,timeout:180000});
  return {method:'ffmpeg silencedetect',thresholdDB:-45,minimumSeconds:.5,silences:parseAudioSilences(stderr,duration),
    interpretation:'低电平区间，可能是自然停顿；不是丢字、噪声或语义断裂结论。仍须听辨。'};
}
