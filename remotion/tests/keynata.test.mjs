import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMusicCache,library,trackFor} from '../server/keynata-library.mjs';

test('203 个曲号均有独立授权条目；有导唱的曲目默认使用伴奏',()=>{
  assert.equal(library.tracks.length,203);
  assert.equal(new Set(library.tracks.map(t=>t.id)).size,203);
  const all=library.tracks.map(t=>trackFor(t.id));
  assert.equal(all.filter(t=>t.file.endsWith('_karaoke.mp3')).length,31);
  assert.ok(all.every(t=>t.bpm>0 && t.seconds>0 && t.entry.includes(library.revision) && t.bytes>0 && t.sha256.length===64));
  assert.throws(()=>trackFor('../private'),e=>e.status===404);
});
test('并发试听共用一次下载，损坏的音频不入库，下次点击可重试',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'frameboard-keynata-test-'));
  let calls=0;
  const resolve=createMusicCache(dir,async()=>{calls++;return new Response('不是音乐');});
  try{
    const id='classical_piano_6134',a=resolve(id),b=resolve(id);
    assert.equal(a,b);
    await assert.rejects(a,e=>e.status===502);
    assert.equal(calls,2); // Both trusted hosts were tried once.
    assert.deepEqual(await fs.readdir(dir),[]);
    await assert.rejects(resolve(id),e=>e.status===502);
    assert.equal(calls,4);
  } finally {await fs.rmdir(dir);}
});
