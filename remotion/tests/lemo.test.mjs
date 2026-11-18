import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {draft,update} from '../shared/model.mjs';
import {lemoStyles,lemoLinks,hasVisualReference} from '../shared/lemo.mjs';
import {sciencePrompt} from '../server/science-ai.mjs';

test('66 unique Lemo entries all refer to local covers and their own official films',()=>{
  assert.equal(new Set(lemoStyles.map(s=>s.slug)).size,66);
  assert.equal(lemoStyles.length,66);
  for(const s of lemoStyles){
    const {preview,poster}=lemoLinks(s);
    assert.ok(s.cn&&s.guide&&s.dur>0);
    assert.equal(preview,'https://lemomo-ai.github.io/lemo-opuscar-films/'+s.slug+'.mp4');
    assert.ok(fs.existsSync(new URL('../public'+poster,import.meta.url)));
  }
});

test('changing a project style keeps manual notes and invalidates its previous approvals',()=>{
  const project=draft('science');
  project.scienceFlow={style:'手写配色',template:'手写参考',lemoStyleId:'circuit-board'};
  const previous=update(null,project);
  Object.assign(previous.scienceFlow,{scriptVersion:2,proofVersion:3});
  assert.equal(update(previous,previous).scienceFlow.proofVersion,3);
  const switched=structuredClone(previous);
  switched.scienceFlow.lemoStyleId='microscope';
  const next=update(previous,switched);
  assert.equal(next.scienceFlow.scriptVersion,undefined);
  assert.equal(next.scienceFlow.template,'手写参考');
  assert.equal(next.scienceFlow.style,'手写配色');
  for(const task of ['rhythm','proofs']){
    const prompt=sciencePrompt(next,task);
    assert.match(prompt,/Microscope Story/);
    assert.match(prompt,/microscope\.mp4/);
    assert.match(prompt,/手写参考/);
  }
  assert.ok(hasVisualReference({lemoStyleId:'microscope'}));
  next.scienceFlow.lemoStyleId='';
  assert.ok(hasVisualReference(update(switched,next).scienceFlow));
  assert.ok(!hasVisualReference({style:'只有说明'}));
  next.scienceFlow.lemoStyleId='missing';
  assert.throws(()=>update(switched,next),/找不到选定/);
});
