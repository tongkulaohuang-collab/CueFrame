import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture as legacyMotionFixture} from './fixtures/motion.mjs';
const motionFixture=()=>legacyMotionFixture({presentation:true});
import {sceneProps} from '../shared/scene-props.mjs';
import {bindingIssues,projectImageGallery,shotImagePlan} from '../shared/shot-images.mjs';
import {currentMaterialPlan,imagePlanInputs,materialInputs,planForMaterial} from '../shared/material-plan.mjs';
import {scienceInputs} from '../shared/science-flow.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-shot-images-'));
const {get,job,write}=await import('../server/store.mjs');
const {prepare,approve,applyJob}=await import('../server/codex.mjs');
const {applyShotImage,importShotImage}=await import('../server/shot-images.mjs');
const {validateMaterialPlan,materialImagePrompt,materialPrompt}=await import('../server/materials.mjs');
const {projectResearchPrompt}=await import('../server/topic-research.mjs');
const {segmentFingerprint}=await import('../server/segment-fingerprint.mjs');
const {materialAttachments,motionAttachments}=await import('../server/material-frames.mjs');
const {framesForShots,shotImageResults,writeShotImageSchema}=await import('../server/shot-image-analysis.mjs');
const {upload}=await import('../server/media.mjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6H8AAAAASUVORK5CYII=','base64');
const source={kind:'图片',title:'粒子彩色示意',url:'https://example.org/particle',locator:'图 1',publisher:'示例图集',
  mediaUrl:'https://example.org/particle.png',rights:'作者署名使用'};
const request={url:source.url,locator:source.locator,confirmed:true,license:source.rights};
const download=async mediaUrl=>({bytes:png,finalUrl:mediaUrl});
const box={x:-12,y:3,width:38,height:52};
function fixture(animated=true){
  const {p,raw}=motionFixture();
  if(animated)p.shots[0].motionPlan=raw.motion;
  p.researchSources=[source];
  return write(p,0);
}

test('最终动画收到已采用对象的真实图片，未核实图片不能作为已采用对象附件',()=>{
 const {p}=motionFixture();
 const asset={...upload('对象.png',png),kind:'image',confirmed:true,source:'本项目测试图片',license:'测试许可'};
 p.assets.push(asset);p.shots[0].imageBindings=[{nodeId:'particle',assetId:asset.id}];
 const attached=motionAttachments(p,p.shots[0].id).find(a=>a.kind==='adopted-object');
 assert.equal(attached.assetId,asset.id);assert.ok(fs.existsSync(attached.file));
 asset.confirmed=false;assert.equal(motionAttachments(p,p.shots[0].id).some(a=>a.kind==='adopted-object'),false);
});
function suggestion(p,mode='generate'){
  const shotId=p.shots[0].id;
  return {summary:'粒子的造型可以换图。',items:[{mode,title:'粒子纹理',priority:'recommended',reason:'增强可辨识度',
    usage:'对照风格参考的青色材质',checks:'保留运动朝向',prompt:mode==='generate'?'透明背景的青色粒子':'',
    shotIds:[shotId],assetIds:[],claimIds:[],imageTargets:[{shotId,nodeId:'particle',label:'粒子',time:.8,styleMatch:'青色、侧光、边缘清晰'}]}]};
}

test('图片参考按镜头显示，复用图跨镜去重，镜头用图以最终对象绑定为准',()=>{
  const assets=['style','master','layout','body','book','old','candidate'].map(id=>({
    id,kind:'image',name:id+'.png',src:'/media/'+id+'.png',role:'reference',
  }));
  const [style,master,layout,body,book,old,candidate]=assets;
  master.generation={reference:{kind:'character',shotIds:['one','two']}};
  layout.imageSource={reference:{kind:'composition',shotIds:['two']}};
  for(const asset of [body,book,old,candidate])asset.generation={itemId:asset.id};
  const p={assets,shots:[
    {id:'one',imageBindings:[{nodeId:'shopper',assetId:'body'}],motionPlan:{nodes:[
      {id:'shopper',media:{assetId:'old'}},{id:'prop',media:{assetId:'book'}},
    ]}},
    {id:'two',imageBindings:[{nodeId:'item',assetId:'book'}]},
    {id:'three',processVideoId:'clip',motionPlan:{nodes:[{id:'item',media:{assetId:'candidate'}}]}},
  ]};
  const all=projectImageGallery(p);
  assert.deepEqual(all.references.map(r=>[r.url,r.numbers]),[[style.src,[]],[master.src,[1,2]],[layout.src,[2]]]);
  assert.deepEqual(all.used.map(r=>[r.url,r.numbers]),[[body.src,[1]],[book.src,[1,2]]]);
  assert.deepEqual(projectImageGallery(p,'one').references.map(r=>r.url),[style.src,master.src]);
  assert.deepEqual(projectImageGallery(p,'two').used.map(r=>r.url),[book.src]);
  assert.deepEqual(projectImageGallery(p,'three').used,[]);
});

test('网上原图保留来源、署名和使用条件；重复导入、异常正文和版本冲突均不写入第二张图',async()=>{
  let p=fixture();
  const before=p.assets.length;
  await assert.rejects(importShotImage(p,{...request,confirmed:false},download),/使用条件/);
  await assert.rejects(importShotImage(p,{...request,url:'https://example.org/other'},download),/出处/);
  await assert.rejects(importShotImage(p,request,async()=>({bytes:Buffer.from('<html>')})),/原图/);
  p=await importShotImage(p,request,download);
  const a=p.assets.at(-1);
  assert.equal(a.license,source.rights);assert.equal(a.credit,source.publisher);
  assert.deepEqual(a.imageSource,{url:source.url,locator:source.locator,mediaUrl:source.mediaUrl,finalUrl:source.mediaUrl,publisher:source.publisher,rights:source.rights});
  assert.equal(a.width,1);assert.equal(a.height,1);
  assert.equal(await importShotImage(p,request,()=>assert.fail('不应重复下载')),p);
  assert.equal(get(p.id).assets.length,before+1);
  const other=fixture(),newer=write({...other,title:'并发编辑'},other.version);
  await assert.rejects(importShotImage(other,request,download),/项目已更新/);
  assert.equal(get(other.id).version,newer.version);
  assert.equal(scienceInputs({...p,researchSources:[]}),scienceInputs(p));
});

test('图片按对象局部坐标入镜，同镜其余节点、机位、声音与字幕延续；解除图片恢复原图形',async()=>{
  let p=await importShotImage(fixture(),request,download);
  const shot=p.shots[0],id=shot.id,asset=p.assets.at(-1);
  p=write({...p,shots:[shot,{...structuredClone(shot),id:'other'}]},p.version);
  const take=sceneProps(p,id),other=segmentFingerprint(p,'other',p.voice);
  const action={shotId:id,nodeId:'particle',assetId:asset.id,label:'粒子',box};
  assert.throws(()=>applyShotImage(p,{...action,nodeId:'absent'}),/可替换对象/);
  assert.throws(()=>applyShotImage(p,{...action,box:{...box,width:0}}),/尺寸/);
  p=applyShotImage(p,action);
  assert.equal(applyShotImage(p,action),p);
  const now=sceneProps(p,id);
  const n=now.shot.motionPlan.nodes.find(n=>n.id==='particle');
  assert.deepEqual(n.media,{assetId:asset.id,...box,fit:'contain'});assert.deepEqual(n.paths,[]);
  assert.deepEqual(n.frames,take.shot.motionPlan.nodes[1].frames);
  assert.equal(now.shot.motionPlan.nodes[0],p.shots[0].motionPlan.nodes[0]);
  for(const key of ['camera','cameraShots','annotations'])assert.deepEqual(take.shot.motionPlan[key],now.shot.motionPlan[key]);
  for(const key of ['voices','music','captionCues'])assert.deepEqual(now[key],take[key]);
  assert.ok(now.assets.some(a=>a.id===asset.id));assert.equal(segmentFingerprint(p,'other',p.voice),other);
  assert.ok(p.shots[0].motionPlan.nodes[1].paths.length);
  p=applyShotImage(p,{...action,remove:true});
  assert.deepEqual(sceneProps(p,id).shot.motionPlan,take.shot.motionPlan);
  assert.equal(applyShotImage(p,{...action,remove:true}),p);
});

test('全片与分镜分析独立保存，选中对象及实际参考会传递给生成和找图',async()=>{
  let p=fixture();
  const uploaded={...upload('用户风格图.png',png),confirmed:true,source:'自制参考',license:'本片使用'};
  p=write({...p,assets:[...p.assets,uploaded]},p.version);
  const attachments=materialAttachments(p);
  assert.ok(attachments.some(f=>f.kind==='reference-image'&&f.url===uploaded.src&&fs.existsSync(f.file)));
  const id=p.shots[0].id;
  async function analyze(scope){
    const j=prepare(p,scope,'materials');
    approve(j.id,async()=>suggestion(p));
    for(let n=0;n<200&&job(j.id).status==='running';n++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(job(j.id).status,'ready',job(j.id).error);
    p=applyJob(j.id);
  }
  await analyze(null);
  const full=currentMaterialPlan(p).id;
  await analyze(id);
  const focus=currentMaterialPlan(p,id),item=focus.items[0];
  assert.equal(currentMaterialPlan(p).id,full);assert.notEqual(focus.id,full);
  assert.equal(planForMaterial(p,item.id).id,focus.id);
  const frame={kind:'reference',label:'视频参考 8–12 秒',file:'style.jpg'};
  const image=materialImagePrompt(p,{materialId:item.id,materialFrames:[frame]});
  assert.match(image,/视频参考 8–12 秒/);assert.match(image,/青色、侧光、边缘清晰/);
  assert.match(projectResearchPrompt(p,'visuals',item.id),/只找本项可直接入镜/);
  assert.equal(prepare(p,null,'research',{researchScope:'visuals',materialId:item.id}).planId,focus.id);
  p.shots[0].motionPlan.nodes[0].paths[0].fill='#101010';
  assert.equal(currentMaterialPlan(p,id),null);
});

test('尚无动画可先指定替换图；缺少尺寸时不能渲染，有实际占位即可合成',async()=>{
  let p=await importShotImage(fixture(false),request,download);
  const shot=p.shots[0],asset=p.assets.at(-1);
  const raw=suggestion(p),plan=validateMaterialPlan(raw,p,shot.id);
  assert.throws(()=>validateMaterialPlan({...raw,items:[{...raw.items[0],imageTargets:[]}]},p,shot.id),/具体/);
  Object.assign(plan,{focusShotId:shot.id,imageInputs:imagePlanInputs(p,shot.id),inputs:materialInputs(p)});
  p=write({...p,scienceFlow:{...p.scienceFlow,imagePlans:{[shot.id]:plan}}},p.version);
  const action={shotId:shot.id,nodeId:'particle',itemId:plan.items[0].id,assetId:asset.id};
  p=applyShotImage(p,action);
  const s=p.shots[0],motion=motionFixture().raw.motion;
  assert.equal(s.imageBindings[0].box,null);
  assert.match(bindingIssues(p,s,motion).join(''),/取景/);
  motion.nodes[1].media={assetId:asset.id,width:26,height:18,fit:'contain'};
  assert.deepEqual(bindingIssues(p,s,motion),[]);
  assert.deepEqual(shotImagePlan(motion,s.imageBindings).nodes[1].media,{assetId:asset.id,x:-13,y:-9,width:26,height:18,fit:'contain'});
});

function manyShots(count) {
  const p=fixture();
  const shots=Array.from({length:count},(_,i)=>({...structuredClone(p.shots[0]),id:'scene-'+(i+1),title:'分镜 '+(i+1)}));
  p.shots=shots;
  p.scienceFlow.materialPlan=validateMaterialPlan({summary:'整期原有的素材建议',items:[]},p);
  return write(p,p.version);
}
const noImage=shotId=>({shotId,summary:'曲线与标注清楚，无需补图。',items:[]});
async function settled(id) {
  for(let i=0;i<100&&job(id).status==='running';i++)await new Promise(resolve=>setTimeout(resolve,10));
  return job(id);
}
test('一次分析覆盖全部镜头，分批校验并按时间线保存；空建议也计入完成',async()=>{
  const p=manyShots(10),ids=p.shots.map(s=>s.id);
  const task=prepare(p,ids[7],'shot-images');
  assert.equal(task.shotId,null);assert.equal(task.shotCount,10);
  assert.equal(prepare(p,null,'shot-images').id,task.id);
  const calls=[];
  approve(task.id,async(input,child)=>{
    calls.push(child.shotIds);
    assert.match(input,/每一镜均须/);assert.match(input,/选定风格参考/);
    const payload=JSON.parse(input.split('\n').at(-1));
    assert.deepEqual(payload.shots.map(s=>s.id),child.shotIds);
    const rows=child.shotIds.map(id=>id===ids[0]?{...suggestion(p),shotId:id}:noImage(id));
    return {shots:rows.reverse()};
  });
  assert.equal(approve(task.id).id,task.id);
  assert.equal((await settled(task.id)).status,'ready');
  assert.deepEqual(calls.flat(),ids);assert.ok(calls.length>1);
  assert.equal(prepare(p,null,'shot-images').id,task.id);
  const saved=applyJob(task.id);
  assert.deepEqual(saved.scienceFlow.materialPlan,p.scienceFlow.materialPlan);
  assert.deepEqual(Object.keys(saved.scienceFlow.imagePlans),ids);
  assert.equal(currentMaterialPlan(saved,ids[0]).items[0].imageTargets[0].shotId,ids[0]);
  assert.equal(currentMaterialPlan(saved,ids.at(-1)).items.length,0);
  assert.equal(applyJob(task.id).version,saved.version);
  assert.throws(()=>prepare({...p,shots:[]},null,'shot-images'),/添加镜头/);
});

test('全片覆盖须无缺镜、重号和跨镜建议；每个有样镜的段均随附参考图',()=>{
  const p=manyShots(3),ids=p.shots.map(s=>s.id);
  assert.throws(()=>shotImageResults({shots:ids.slice(1).map(noImage)},p,ids),/全部镜头/);
  assert.throws(()=>shotImageResults({shots:ids.map(()=>noImage(ids[0]))},p,ids),/镜头编号重复/);
  assert.throws(()=>shotImageResults({shots:[noImage(ids[0]),{...suggestion(p),shotId:ids[1]},noImage(ids[2])]},p,ids),/只能关联/);
  const schemaFile=path.join(process.env.FRAMEBOARD_DATA,'all-shot-schema.json');
  const row=JSON.parse(fs.readFileSync(writeShotImageSchema(schemaFile))).properties.shots.items;
  assert.deepEqual(row.required,['summary','items','shotId']);
  assert.ok(!row.properties.items.items.properties.mode.enum.includes('procedural'));
  const group=Array.from({length:8},(_,i)=>'scene-'+i);
  const refs=group.map(id=>({kind:'reference',label:id}));
  const samples=group.flatMap(shotId=>[0,1,2].map(time=>({kind:'sample',shotId,time})));
  const attachments=framesForShots([...refs,...samples],group);
  assert.equal(attachments.length,16);assert.deepEqual(attachments.slice(8).map(f=>f.shotId),group);
  assert.ok(attachments.slice(8).every(f=>f.time===1));
});
test('关联的动画素材不锁定镜头，效果图按镜内时间传给图像分析',()=>{
  const p=manyShots(3);
  p.shots[0].assetIds.push('candidate-video');
  p.shots[1].motionPlan=null;
  p.shots[2].processVideoId='actual-video';
  p.scienceFlow.proofs=[{time:2.5,caption:'人物正在递单',scene:{nodes:[{id:'shopper'}]}}];
  const {shots}=JSON.parse(materialPrompt(p,[],p.shots.map(s=>s.id)).split('\n').at(-1));
  assert.deepEqual(shots.map(s=>s.imageLayerMode),['editable-nodes','planned-nodes','rendered-video']);
  assert.deepEqual(shots[1].storyboardFrames,[{time:.5,description:'人物正在递单',objects:['shopper']}]);
  assert.deepEqual(shots[0].storyboardFrames,[]);
});

test('后续批次不完整时不写入半套结果，同版本显式重试只处理未完成镜头；过期结果不会覆盖新稿',async()=>{
  const p=manyShots(10),task=prepare(p,null,'shot-images');
  let count=0;
  approve(task.id,async(_,child)=>({shots:++count===1?child.shotIds.map(noImage):[]}));
  const failed=await settled(task.id);
  assert.equal(failed.status,'failed');assert.ok(failed.result.length>0&&failed.result.length<10);
  assert.equal(get(p.id).version,p.version);assert.throws(()=>applyJob(task.id));
  const previous=failed.result.map(r=>r.focusShotId),submitted=[];
  const retry=prepare(p,null,'shot-images');
  approve(retry.id,async(_,child)=>{submitted.push(...child.shotIds);return {shots:child.shotIds.map(noImage)};});
  assert.equal((await settled(retry.id)).status,'ready');
  assert.deepEqual([...previous,...submitted],p.shots.map(s=>s.id));
  const newer=write({...p,title:'新稿'},p.version);
  assert.throws(()=>applyJob(retry.id),/旧版本/);
  assert.equal(get(p.id).version,newer.version);assert.equal(get(p.id).scienceFlow.imagePlans,undefined);
});
