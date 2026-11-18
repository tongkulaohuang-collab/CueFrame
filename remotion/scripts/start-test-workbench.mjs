import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {semanticCase} from '../tests/fixtures/semantic-cases.mjs';
process.env.FRAMEBOARD_ENV='test';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-ui-'));
process.env.PORT=process.env.FRAMEBOARD_TEST_PORT||'4197';
process.env.FRAMEBOARD_REVIEW_PORT=process.env.FRAMEBOARD_TEST_REVIEW_PORT||'4497';
const {write}=await import('../server/store.mjs');
const {draft,emptyShot,emptyClaim}=await import('../shared/model.mjs');
const p={...draft('science'),id:'system-model-verification',title:'公共能力验证 · 数据比较',topic:'不同输入下的数值比较',language:'bilingual',productionMode:'model-process',
  contentBrief:{audience:'工作台验证人员',question:'同一数据能否准确驱动画面与数字',takeaway:'比较数值变化与结果',prerequisites:'这些是测试输入',boundaries:'不把测试数据用作现实结论'},scienceFlow:{style:'纸本图解'}};
const claim={...emptyClaim(),id:'test-data',text:'本地软件验证数据，不代表现实统计',title:'确定性模型测试',url:'https://example.com/test-fixture',original:'测试输入',locator:'tests/fixtures/semantic-cases.mjs',verified:true};
p.claims=[claim];
p.shots=[{...emptyShot(),id:'model-shot',title:'数值比较',purpose:'核对输入、几何与输出一致',visual:'同尺度展示对象的数值变化',silentOK:true,zh:'工作台验证：比较同一尺度下的三组输入，数字随图形同步变化。',seconds:6,claimIds:[claim.id],semanticScene:semanticCase('comparison'),
  continuity:{subject:'三组数值',path:'起始数值变为目标数值，几何与标签同步',camera:'固定相机保留相同尺度',handoff:'单段验证，不伪造外部连续事件'}}];
write(p,0);
const out=path.resolve(fileURLToPath(new URL('../examples/workbench-system-2026-11-17',import.meta.url)));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'isolated-server.json'),JSON.stringify({pid:process.pid,data:process.env.FRAMEBOARD_DATA,port:Number(process.env.PORT),project:p.id},null,2));
console.log('独立测试工作台：http://127.0.0.1:'+process.env.PORT+'/#'+p.id);
await import('../server/main.mjs');
