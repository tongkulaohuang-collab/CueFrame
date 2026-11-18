import {createHash} from 'node:crypto';
import {sceneProps} from '../shared/scene-props.mjs';
const reviewFields=new Set(['base','reviewed','approvedLook','filmQA','motionReview']);
export function segmentFingerprint(p,id,variant) {
  const scene=JSON.stringify(sceneProps(p,id,variant),(key,value)=>{
    if(reviewFields.has(key))return undefined;
    // Saving restores measured fields from the upload record; their key order
    // may change. Array order still determines timing, layers and composition.
    if(value && typeof value==='object' && !Array.isArray(value))
      return Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]]));
    return value;
  });
  return createHash('sha256').update(scene).digest('hex');
}
