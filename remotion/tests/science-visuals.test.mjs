import test from 'node:test';import assert from 'node:assert/strict';
import {localSpec} from '../shared/local-process.mjs';
import {pipeMetrics,pipeSpeed} from '../shared/science-scenes.mjs';
import {validateImageTextLayers,imageTextLayerState,shotVisualAssetIds} from '../shared/image-text-layers.mjs';
import {compileSemanticScene} from '../shared/semantic-scenes.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {draft,emptyShot} from '../shared/model.mjs';
import {removeAsset} from '../shared/assets.mjs';
const assets=['original','base','oxygen','carbon'].map(id=>({id,name:id,kind:'image',width:1200,height:900,src:'/media/'+id+'.png',source:'本项目分层源图',license:'原创',confirmed:true}));
const spec={version:1,sourceAssetId:'original',cleanAssetId:'base',confirmed:true,note:'按原图核对底图与透明字形一致',regions:[{id:'oxygen',label:'氧气',assetId:'oxygen',from:1,until:4,fade:.25,scale:1.1,pivot:{x:60,y:30}}]};
const scene={version:1,family:'image-text',style:'technical',items:[{id:'diagram',label:'交换示意',assetId:'original',imageText:spec}]};
test('local scientific scenes reject wrong engines, arbitrary templates and non-laminar parameters',()=>{
 for(const template of ['cubic-lattice','alveolar-exchange','laminar-pipe'])assert.equal(localSpec({engine:'blender',template}).template,template);
 assert.throws(()=>localSpec({engine:'anatomy',template:'alveolar-exchange'}));
 assert.throws(()=>localSpec({engine:'blender',template:'cubic-lattice',parameters:{layers:8}}));
 assert.throws(()=>localSpec({engine:'blender',template:'laminar-pipe',parameters:{radius:.02,meanSpeed:.2}}),/1500/);
});
test('pipe model obeys no-slip, center-to-mean ratio and integrated volumetric flow',()=>{
 const p=localSpec({engine:'blender',template:'laminar-pipe'}).parameters,m=pipeMetrics(p);
 assert.equal(pipeSpeed(p,p.radius),0);assert.equal(pipeSpeed(p,0),2*p.meanSpeed);assert.ok(Math.abs(m.reynolds-80)<1e-10);
 const N=10000;let flux=0;for(let i=0;i<N;i++){const r=p.radius*(i+.5)/N;flux+=pipeSpeed(p,r)*2*Math.PI*r*p.radius/N;}
 assert.ok(Math.abs(flux/m.flowRate-1)<1e-7);
});
test('real image layers require complete, source-bound and same-sized assets',()=>{
 assert.doesNotThrow(()=>validateImageTextLayers(spec,'original',assets,5));
 for(const mutation of [{sourceAssetId:'other'},{cleanAssetId:'original'},{confirmed:false},{regions:[{...spec.regions[0],until:7}]}])assert.throws(()=>validateImageTextLayers({...spec,...mutation},'original',assets,5));
 assert.throws(()=>validateImageTextLayers(spec,'original',assets.map(a=>a.id==='oxygen'?{...a,width:600}:a),5));
});
test('independent text disappears outside its own reading window and state is order-independent',()=>{
 const r=spec.regions[0];assert.equal(imageTextLayerState(r,.5).opacity,0);assert.equal(imageTextLayerState(r,2).opacity,1);assert.equal(imageTextLayerState(r,4.1).opacity,0);
 const times=[2.7,.3,3.9,1.2];const states=times.map(t=>imageTextLayerState(r,t));assert.deepEqual(times.map(t=>imageTextLayerState(r,t)),states);
});
test('horizontal and vertical production compilation preserves image layers and every export asset',()=>{
 for(const [width,height]of[[1280,720],[720,1280]]){
  const plan=compileSemanticScene(scene,{width,height,duration:5,fps:24,assets});validateMotion(plan);
  const shot={...emptyShot(),seconds:5,semanticScene:scene,assetIds:[]};const p={...draft('science'),productionMode:'model-process',filmStyle:null,width,height,shots:[shot],assets};
  const props=sceneProps(p,shot.id);assert.deepEqual(props.assets.map(a=>a.id),['original','base','oxygen']);
  assert.equal(props.shot.motionPlan.nodes[0].media.imageText.sourceAssetId,'original');
  assert.deepEqual(shotVisualAssetIds(shot),['original','base','oxygen']);
 }
});
test('removing an indirectly used text layer invalidates review and blocks rendering until repaired',()=>{
 const shot={...emptyShot(),seconds:5,semanticScene:scene,assetIds:[],reviewed:true,filmQA:['旧审片'],motionReview:'00:00–00:05'};
 const p={...draft('science'),productionMode:'model-process',assets,shots:[shot]};
 const next={...p,...removeAsset(p,'oxygen')};assert.equal(next.shots[0].reviewed,false);assert.deepEqual(next.shots[0].filmQA,[]);
 assert.throws(()=>sceneProps(next,shot.id),/文字层/);assert.equal(p.assets.length,4);
});
