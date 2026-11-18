import {motionImageAsset} from './motion-dynamics.mjs';
import {actorBindingIssue,actorSkinIssues} from './actor-catalog.mjs';

export const imageNodeId = id => typeof id === 'string' && /^[\w-]{1,60}$/.test(id);
export const imageBoxOK = box => box && ['x','y','width','height'].every(k=>Number.isFinite(box[k])) &&
  Math.abs(box.x)<=16384 && Math.abs(box.y)<=16384 && box.width>=1 && box.width<=8192 && box.height>=1 && box.height<=8192;

export function mediaBox(media) {
  return media && {x:media.x ?? -media.width/2, y:media.y ?? -media.height/2, width:media.width, height:media.height};
}

// The original geometry and poses remain editable. Only the rendered appearance
// of the selected object changes, inside its animated local coordinate system.
export function shotImagePlan(plan, bindings) {
  if(!plan || !bindings?.length) return plan;
  const byId=new Map(bindings.map(b=>[b.nodeId,b]));
  return {...plan,nodes:plan.nodes.map(node=>{
    const binding=byId.get(node.id);
    if(!binding)return node;
    const issue=actorBindingIssue(plan,binding);if(issue)throw Error('素材动作能力：'+issue);
    if(node.graphics?.morphs?.length)throw Error('素材动作能力：'+node.id+' 使用路径形变，不能用整张图片抹掉几何轨道');
    const box=binding.box || mediaBox(node.media);
    if(!imageBoxOK(box))return node;
    return {...node,paths:[],media:{...node.media,assetId:binding.assetId,...box,fit:node.media?.fit||'contain'}};
  })};
}

export function bindingIssues(p,shot,plan=shot.motionPlan) {
  const issues=actorSkinIssues({...p,shots:(p.shots||[shot]).map(s=>s.id===shot.id?{...shot,motionPlan:plan}:s)});
  for(const binding of shot.imageBindings||[]) {
    const capability=actorBindingIssue(plan,binding);if(capability)issues.push('素材动作能力：'+capability);
    const node=plan?.nodes.find(n=>n.id===binding.nodeId);
    if(motionImageAsset(p,binding.assetId)?.kind!=='image')issues.push('请补齐并核对「'+binding.label+'」的图片');
    if(!node||!imageBoxOK(binding.box||mediaBox(node.media)))issues.push('请在本镜为「'+binding.label+'」安排图片对象 '+binding.nodeId+' 和取景尺寸');
  }
  return issues;
}

export function projectImageGallery(p, shotId = null) {
  const shots = p.shots.map((shot, index) => ({shot, number: index + 1}))
    .filter(({shot}) => !shotId || shot.id === shotId);
  const images = new Map(p.assets.filter(asset => asset.kind === 'image').map(asset => [asset.id, asset]));
  const imageTitle = asset => asset.name.replace(/\.(png|jpe?g|webp)$/i, '');
  const references = [];
  for (const asset of images.values()) {
    const reference = asset.generation?.reference || asset.imageSource?.reference;
    if (reference) {
      const numbers = shots.filter(({shot}) => reference.shotIds?.includes(shot.id)).map(row => row.number);
      if (shotId && !numbers.length) continue;
      references.push({url: asset.src, label: imageTitle(asset), kind: reference.kind, numbers});
    } else if (asset.role === 'reference' && !asset.generation && !asset.imageSource) {
      references.push({url: asset.src, label: imageTitle(asset), kind: 'reference-image', numbers: []});
    }
  }
  const used = new Map();
  for (const {shot, number} of shots) {
    if (shot.processVideoId) continue;
    const bindings = new Map((shot.imageBindings || []).map(b => [b.nodeId, b.assetId]));
    const ids = new Set(bindings.values());
    for (const node of shot.motionPlan?.nodes || []) {
      if (node.media && !bindings.has(node.id)) ids.add(node.media.assetId);
    }
    for (const id of ids) {
      const asset = images.get(id);
      if (!asset) continue;
      if (!used.has(id)) used.set(id, {url: asset.src, label: imageTitle(asset), kind: 'used', numbers: []});
      used.get(id).numbers.push(number);
    }
  }
  return {references, used: [...used.values()]};
}
