import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {motionFixture,explanationFixture,performanceRequirementsFixture} from './fixtures/motion.mjs';
import {motionReferences,referenceMotionKey,currentReferenceReports,referenceAnalysisNeeds,referenceScriptNeeds,referenceMotionContext} from '../shared/reference-motion.mjs';
import {scienceStepIssues} from '../shared/science-task-status.mjs';
import {LIBRARY_VERSION} from '../shared/motion-library.mjs';
import {referenceAppearanceFixture} from './fixtures/reference-style.mjs';
import {referenceStyleStatus} from '../shared/visual-style.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-reference-motion-'));
const {save,write,db,job,data,persistJob,get}=await import('../server/store.mjs');
const {prepare,approve,applyJob,prompt,jobHelp}=await import('../server/codex.mjs');
const {validateScienceResult,sciencePrompt}=await import('../server/science-ai.mjs');
const {motionPrompt}=await import('../server/motion.mjs');
const {prepareReferenceEvidence,validateReferenceAnalysis,analyzeReferences}=await import('../server/reference-motion.mjs');
const {reviewMedia,decideReferenceSegment}=await import('../server/reference-review.mjs');
const {downloadVideo}=await import('../server/reference-reader.mjs');
const {saveLibrary,libraryState}=await import('../server/motion-library.mjs');
const source=path.resolve('examples/motion-library/preview-v2.mp4');
const rawReport=duration=>({complete:true,summary:'文字显现后渐变衔接，粒子随主体运动',limitations:'4 帧/秒时序采样；没有听辨音轨，快速变化只能估计。',segments:[{from:0,until:duration,motion:'圆形沿水平路径运动',rhythm:'文字逐步显示后短暂停留，粒子分阶段变化',camera:'固定全景看清路径',transition:'柔边渐变衔接下一画面',typography:'文字逐字出现并上浮',effectIds:['typewriter','gradient','particles'],customMotion:'',confidence:'observed'}]});
test('长参考按全片时间覆盖并只重试缺失分段',async()=>{
 const p=fixture(),j={id:'long-reference-resume',project:p.id,version:p.version};
 const evidence={duration:244,mediaHash:'test-long-hash',sampleFps:4,method:'测试时序',images:Array.from({length:61},(_,i)=>'sheet-'+i),sheets:Array.from({length:61},(_,i)=>({from:i*4,until:(i+1)*4,cells:[i*4]}))};
 let calls=0,failOnce=true;
 const run=async prompt=>{calls++;if(calls===2&&failOnce){failOnce=false;throw Error('测试中断');}const context=JSON.parse(prompt.split('\n').at(-1));const r=rawReport(context.evidence.range.until);r.segments[0].from=context.evidence.range.from;return r;};
 await assert.rejects(()=>analyzeReferences(p,j,run,()=>{},async()=>evidence),/测试中断/);
 const reports=await analyzeReferences(p,j,run,()=>{},async()=>evidence);
 assert.equal(calls,7);assert.equal(reports.length,2);
 for(const r of reports)assert.deepEqual(r.segments.map(s=>[s.from,s.until]),[[0,120],[120,240],[240,244]]);
});
test('完整分析后可以有理由地不采用参考，不能省略判断或伪造采用',()=>{
 const p=fixture();p.scienceFlow.referenceMotion=motionReferences(p).map(ref=>validateReferenceAnalysis(rawReport(24),ref,{duration:24,mediaHash:'test',sampleFps:4,method:'测试'}));
 const raw={text:'有效的节奏设计',libraryVersion:LIBRARY_VERSION,referenceApplications:[],referenceDecisions:motionReferences(p).map(ref=>({referenceId:ref.id,status:'not_applicable',reason:'参考为粒子装饰，本片要解释同尺度数值比较，不采用该运动机制。'}))};
 assert.deepEqual(validateScienceResult(raw,p,'rhythm'),[raw.text]);
 assert.throws(()=>validateScienceResult({...raw,referenceDecisions:raw.referenceDecisions.slice(1)},p,'rhythm'),/逐一/);
 raw.referenceDecisions[0].status='applied';assert.throws(()=>validateScienceResult(raw,p,'rhythm'),/不一致/);
});
function fixture(){const {p}=motionFixture();p.script=p.shots.map(s=>s.zh).join('\n');p.scienceFlow.proofs=undefined;p.assets.push(...['ref-one','ref-two'].map(id=>({id,name:id+'.mp4',kind:'video',role:'reference',src:'/media/'+id+'.mp4',confirmed:true,source:'原创测试视频',license:'本地测试'})));for(const id of ['ref-one','ref-two'])fs.copyFileSync(source,path.join(data,'uploads',id+'.mp4'));for(const a of p.assets)db.prepare('INSERT OR REPLACE INTO uploads VALUES (?,?)').run(a.id,JSON.stringify(a));return write(p,0);}
async function finish(j,run){approve(j.id,run);for(let n=0;n<1500&&job(j.id).status==='running';n++)await new Promise(r=>setTimeout(r,10));assert.equal(job(j.id).status,'ready',job(j.id).error);return applyJob(j.id);}
test('未分析时阻止脚本；逐个真实抽取全片，传入图集，采用后脚本读取库与分析',async()=>{
 let p=fixture();assert.equal(referenceAnalysisNeeds(p).length,2);assert.throws(()=>prepare(p,null,'rhythm'),/逐一完成参考视频分析/);
 const requests=[];let active=0;const analysis=prepare(p,null,'reference-motion');
 p=await finish(analysis,async(input,sub)=>{
  active++;assert.equal(active,1);assert.equal(sub.task,'reference-motion-item');
  assert.ok(sub.referenceImages.length>=6);assert.ok(sub.referenceImages.every(file=>fs.statSync(file).size>1000));
  const evidence=JSON.parse(fs.readFileSync(path.join(sub.outputDir,'evidence.json')));assert.equal(evidence.sampleFps,4);assert.ok(evidence.sheets.at(-1).until>=24);
  assert.ok(evidence.ending.cells.at(-1)>evidence.sheets.at(-1).cells.at(-1));
  assert.ok(evidence.ending.cells.at(-1)<evidence.duration);
  assert.equal(path.basename(sub.referenceImages.at(-1)),'ending.jpg');
  assert.match(input,/autoMotionLibrary/);assert.match(input,/0.25秒/);requests.push(sub);active--;return rawReport(evidence.duration);
 });
 assert.equal(requests.length,2);assert.equal(currentReferenceReports(p).length,2);assert.equal(p.shots.length,1);assert.equal(referenceAnalysisNeeds(p).length,0);
 saveLibrary({version:libraryState().version,action:'preset',itemId:'typewriter',name:'我的文字节奏',params:{from:0,until:1.2}});
 const rhythm=prepare(p,null,'rhythm'),input=prompt(p,rhythm);
 for(const value of ['referenceMotion','typewriter','particles','gradient','我的文字节奏','customMotion'])assert.ok(input.includes(value),value);
 const reportIds=currentReferenceReports(p).map(r=>r.referenceId);
 const result={text:'• 0–2｜cueId=design｜对象=粒子｜动作=通过通道｜形式=motion',libraryVersion:LIBRARY_VERSION,referenceApplications:reportIds.map(referenceId=>({referenceId,from:0,until:2,scriptFrom:0,scriptUntil:2,effectIds:['particles'],customMotion:'',adaptation:'保留连续主体路径，参照分阶段粒子强调；沿用当前配音时间'}))};
 assert.throws(()=>validateScienceResult({...result,libraryVersion:0},p,'rhythm'),/动效库版本/);
 assert.throws(()=>validateScienceResult({...result,referenceApplications:result.referenceApplications.slice(1)},p,'rhythm'),/逐一/);
 const invalid=structuredClone(result);invalid.referenceApplications[0].effectIds=['虚构效果'];assert.throws(()=>validateScienceResult(invalid,p,'rhythm'),/无效/);
 result.explanationBeats=explanationFixture(p);
 result.visualStyle=referenceAppearanceFixture();
 result.performanceRequirements=performanceRequirementsFixture(p,result.text);
 p=await finish(rhythm,async()=>result);assert.deepEqual(referenceScriptNeeds(p),[]);assert.equal(p.scienceFlow.referenceScript.applications.length,2);
 assert.equal(referenceStyleStatus(p).ready,true);assert.equal(referenceStyleStatus(p).appearance.background,'#101827');
 assert.match(motionPrompt(p,{shotId:p.shots[0].id}),/referenceMotion/);assert.match(motionPrompt(p,{shotId:p.shots[0].id}),/参照分阶段/);
 const forged=save({...p,scienceFlow:{...p.scienceFlow,referenceMotion:[],referenceScript:{inputs:'伪造'}}});assert.equal(currentReferenceReports(forged).length,2);assert.deepEqual(referenceScriptNeeds(forged),[]);
 p=save({...p,version:forged.version,scienceFlow:{...p.scienceFlow,referenceVideoUrls:'https://example.com/new.mp4'}});assert.equal(referenceAnalysisNeeds(p).length,1);assert.throws(()=>prepare(p,null,'rhythm'),/参考视频分析/);
});
test('分析拒绝遗漏片尾、空白区间、虚构效果与未确定动态',()=>{
 const ref={id:'r',name:'测试'},evidence={duration:10,mediaHash:'abc',sampleFps:4,method:'采样'};
 assert.equal(validateReferenceAnalysis(rawReport(10),ref,evidence).inputKey,referenceMotionKey(ref));
 for(const mutate of [r=>r.complete=false,r=>r.segments[0].until=5,r=>r.segments[0].from=1,r=>r.segments[0].effectIds=['假的动效'],r=>r.segments[0].confidence='uncertain']){const r=rawReport(10);mutate(r);assert.throws(()=>validateReferenceAnalysis(r,ref,evidence));}
});
test('镜头目录中的跟随保留为镜头参考；未登记名称和不确定画面仍拒绝',async()=>{
 const {writeReferenceSchema}=await import('../server/reference-motion.mjs');
 const {autoMotionContext}=await import('../shared/auto-motion.mjs');
 const enumFile=path.join(data,'reference-enum.json'),schema=JSON.parse(fs.readFileSync(writeReferenceSchema(enumFile),'utf8'));
 assert.deepEqual(schema.properties.segments.items.properties.effectIds.items.enum,autoMotionContext().effects.map(e=>e.id));
 const ref={id:'r',name:'跟拍'},ev={duration:10,mediaHash:'abc',sampleFps:4,method:'采样'};
 const r=rawReport(10);r.segments[0].effectIds=['draw','follow'];
 const result=validateReferenceAnalysis(r,ref,ev).segments[0];
 assert.deepEqual(result.effectIds,['draw']);assert.deepEqual(result.cameraReferenceIds,['follow']);
 assert.deepEqual(r.segments[0].effectIds,['draw','follow']);
 r.segments[0].effectIds.push('invented');assert.throws(()=>validateReferenceAnalysis(r,ref,ev),/不存在/);
});
test('相同来源与文件的已核完整分析跨新项目复用，换片或明确重分析须重新读取',async()=>{
 const p={id:'cache-first',assets:[],scienceFlow:{referenceVideoUrls:'https://example.com/same.mp4'}};
 const q={...p,id:'cache-second'};let calls=0;
 const e={duration:10,mediaHash:'1'.repeat(64),sampleFps:4,method:'完整采样',sheets:[],images:[]};
 const run=async()=>{calls++;return rawReport(10);},evidence=async()=>e;
 const execute=(project,id,force=false)=>analyzeReferences(project,{id,forceReferences:force},run,()=>{},evidence);
 await execute(p,'cache-a');const result=await execute(q,'cache-b');
 assert.equal(calls,1);assert.equal(result[0].reusedFromJob,'cache-a');
 await execute(q,'cache-c',true);assert.equal(calls,2);
 e.mediaHash='2'.repeat(64);await execute(q,'cache-d');assert.equal(calls,3);
});
test('旧回执从已提交版本和本地分段返回精确时间，读取不写入任务或采用报告',()=>{
 const p=fixture(),ref=motionReferences(p)[1],raw=rawReport(53.25);
 raw.segments.push({...raw.segments[0],from:53.25,until:53.504,confidence:'uncertain'});
 const j={id:'legacy-ref-status',type:'codex',project:p.id,version:p.version,task:'reference-motion',status:'failed',error:'分段校验失败',referenceProgress:{current:ref.name}};
 const folder=path.join(data,'jobs',j.id,'reference-1');fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,'evidence.json'),JSON.stringify({duration:53.504}));fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(raw));
 const receipt=jobHelp(j);
 assert.match(receipt.error,/第 2 段（53\.25–53\.504 秒）.*未能确认/);
 assert.equal(receipt.referenceIssue.segmentCount,2);assert.equal(receipt.referenceIssue.inputKey,referenceMotionKey(ref));
 assert.equal(j.error,'分段校验失败');assert.deepEqual(currentReferenceReports(p),[]);
});
function failedReference(p,raw,suffix,mediaHash=createHash('sha256').update(fs.readFileSync(source)).digest('hex')) {
 const [first,ref]=motionReferences(p);
 const evidence={duration:24,sampleFps:4,method:'时序采样',mediaHash};
 const j={id:p.id+'-'+suffix,project:p.id,version:p.version,type:'codex',task:'reference-motion',status:'failed',created:new Date().toISOString(),
  referenceProgress:{current:ref.name},referenceReports:[validateReferenceAnalysis(rawReport(24),first,evidence)],error:'分析失败'};
 const dir=path.join(data,'jobs',j.id,'reference-1');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(evidence));
 if(raw)fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(raw));
 persistJob(j);return jobHelp(j);
}
test('逐段人工复核保留其余参考、跨刷新保存，脚本不可跨越排除区间',()=>{
 const p=fixture(),raw=rawReport(24),s=raw.segments[0];
 raw.complete=false;
 raw.segments=[{...s,until:5},{...s,from:5,until:9,confidence:'uncertain',motion:'只出现在被排除区间的文字'},{...s,from:10}];
 const receipt=failedReference(p,raw,'partial'),review=receipt.referenceIssue.review;
 assert.deepEqual(review.segments.map(s=>[s.from,s.until]),[[5,9],[9,10]]);
 assert.ok(fs.statSync(reviewMedia(p.id,receipt.id).file).size);
 assert.throws(()=>reviewMedia('other',receipt.id));
 const pick=(project,seg,decision,extra)=>decideReferenceSegment(p.id,{jobId:receipt.id,version:project.version,key:review.key,segmentId:seg,decision,...extra});
 const id=review.segments[0].id,gap=review.segments[1].id;
 assert.throws(()=>pick(p,id,'approved',{key:'stale'}),/变化/);
 const partial=pick(p,id,'excluded');
 assert.equal(referenceAnalysisNeeds(partial).length,1);
 assert.equal(pick(p,id,'excluded').version,partial.version);
 assert.throws(()=>pick(p,gap,'approved'),/已更新/);
 const done=pick(partial,gap,'approved'),ref=currentReferenceReports(done)[1];
 assert.equal(referenceAnalysisNeeds(done).length,0);
 assert.deepEqual(ref.segments.map(s=>[s.from,s.until]),[[0,5],[9,10],[10,24]]);
 assert.deepEqual(ref.excluded,[{from:5,until:9}]);
 assert.equal(ref.segments[1].confidence,'manual');
 assert.doesNotMatch(JSON.stringify(referenceMotionContext(done)),/只出现在被排除区间/);
 assert.equal(scienceStepIssues(done,[receipt]).length,0);
 const apps=currentReferenceReports(done).map(r=>({referenceId:r.referenceId,from:0,until:5,scriptFrom:0,scriptUntil:1,adaptation:'采用节奏',effectIds:[],customMotion:''}));
 let text={text:'参考脚本',referenceApplications:apps,libraryVersion:LIBRARY_VERSION};
 assert.deepEqual(validateScienceResult(text,done,'rhythm'),['参考脚本']);
 assert.throws(()=>validateScienceResult({...text,referenceApplications:[apps[0],{...apps[1],from:4,until:11}]},done,'rhythm'),/已去掉/);
 const persisted=save({...done,scienceFlow:{...done.scienceFlow,referenceReviews:[],referenceMotion:[]}});
 assert.deepEqual(get(p.id).scienceFlow.referenceReviews,done.scienceFlow.referenceReviews);
 const changed=pick(persisted,id,'approved');
 assert.deepEqual(currentReferenceReports(changed)[1].excluded,[]);
 assert.equal(job(receipt.id).status,'failed');
});
test('全部去掉不要求脚本引用；重分析保留排除时段，更换参考后旧按钮不能写入',async()=>{
 const p=fixture(),raw=rawReport(24);raw.segments[0].confidence='uncertain';
 const r=failedReference(p,raw,'all'),review=r.referenceIssue.review;
 const body={version:p.version,jobId:r.id,key:review.key,segmentId:review.segments[0].id,decision:'excluded'};
 const done=decideReferenceSegment(p.id,body);
 assert.equal(referenceAnalysisNeeds(done).length,0);
 const remaining=referenceMotionContext(done).references;
 assert.equal(remaining.length,1);
 const app={referenceId:remaining[0].referenceId,from:0,until:1,scriptFrom:0,scriptUntil:1,adaptation:'使用保留的参考',effectIds:[],customMotion:''};
 assert.deepEqual(validateScienceResult({text:'只引用保留片段',libraryVersion:LIBRARY_VERSION,referenceApplications:[app]},done,'rhythm'),['只引用保留片段']);
 const evidence=async ref=>({duration:24,mediaHash:currentReferenceReports(done).find(r=>r.referenceId===ref.id).mediaHash,sampleFps:4,method:'测试',images:[]});
 const again=await analyzeReferences(done,{id:'fresh',forceReferences:true},async()=>rawReport(24),()=>{},evidence);
 assert.deepEqual(again[1].segments,[]);assert.deepEqual(again[1].excluded,[{from:0,until:24}]);
 const latest=failedReference(done,raw,'new');
 assert.throws(()=>decideReferenceSegment(p.id,{...body,version:done.version,decision:'approved'}),/更新的参考分析/);
 const next=save({...done,assets:done.assets.filter(a=>a.id!=='ref-two')});
 assert.throws(()=>decideReferenceSegment(p.id,{...body,jobId:latest.id,version:next.version,decision:'approved'}),/当前参考范围/);
});
test('中途失败保留已完成参考，明确重试时复用，不执行后续参考或脚本',async()=>{
 const p=fixture(),refs=motionReferences(p),j={id:'partial-analysis'};let calls=0;
 const evidence=async()=>({duration:10,mediaHash:'abc',sampleFps:4,method:'测试',images:[],sheets:[]});
 await assert.rejects(analyzeReferences(p,j,async()=>{calls++;if(calls===2)throw Error('第二个视频无法分析');return rawReport(10);},()=>{},evidence),/第二个/);
 assert.equal(j.referenceReports.length,1);assert.equal(calls,2);
 const resumed=await analyzeReferences(p,j,async()=>{calls++;return rawReport(10);},()=>{},evidence);assert.equal(resumed.length,refs.length);assert.equal(calls,3);
});
test('整条复核可用已保存原片，错误校验值不提供播放或采用入口',()=>{
 const p=fixture(),r=failedReference(p,null,'no-response'),review=r.referenceIssue.review;
 assert.deepEqual(review.segments.map(s=>s.id),['whole']);assert.ok(review.videoUrl);
 const body={version:p.version,jobId:r.id,key:review.key,segmentId:'whole',decision:'approved'};
 const approved=decideReferenceSegment(p.id,body);
 assert.equal(currentReferenceReports(approved)[1].segments[0].confidence,'manual');
 const mismatch=failedReference(approved,null,'wrong-checksum','0'.repeat(64));
 assert.equal(mismatch.referenceIssue.review.videoUrl,null);
 assert.throws(()=>decideReferenceSegment(p.id,{...body,jobId:mismatch.id,key:mismatch.referenceIssue.review.key,version:approved.version}),/原片或分析记录已变化/);
});
test('视频下载拒绝内网跳转和网页伪装，不把分享页当作已看过',async()=>{
 const lookup=async()=>[{address:'8.8.8.8',family:4}];
 const response=(statusCode,headers,body='x')=>Object.assign(Readable.from([Buffer.from(body)]),{statusCode,headers});
 await assert.rejects(downloadVideo('https://example.com/video',{lookup,request:async()=>response(302,{location:'http://127.0.0.1/private'})}),/公开网页/);
 await assert.rejects(downloadVideo('https://example.com/watch',{lookup,request:async()=>response(200,{'content-type':'text/html'})}),/不是可直接读取的视频/);
});

