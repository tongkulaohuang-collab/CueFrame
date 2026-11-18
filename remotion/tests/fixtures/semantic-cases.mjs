export const semanticAssets=['fixture-one','fixture-two','fixture-text'].map(id=>({id,kind:'image',src:'/media/'+id+'.png',width:1200,height:900,confirmed:true,source:'本地验证用图片',license:'测试专用'}));
export function semanticCase(family,variant=0,style='editorial') {
  const names=variant?['步行','骑行','地铁']:['检索','比较','理解'];
  const items=names.map((label,i)=>({id:'entity-'+i,label,value:(i+1)*(variant?7:12),to:(i+2)*(variant?9:17)}));
  const result={version:1,family,style,title:variant?'第二组验证数据':'第一组验证数据',unit:'',items,
    edges:[{from:'entity-0',to:'entity-1'},{from:'entity-1',to:'entity-2'}],
    series:variant?[{x:2,y:-3},{x:4,y:7},{x:9,y:2},{x:10,y:12}]:[{x:0,y:4},{x:1,y:2},{x:4,y:8}],parameters:{}};
  if(family==='ratio')result.items=items.slice(0,2);
  if(family==='product')result.items=items.slice(0,2).map((v,i)=>({...v,assetId:semanticAssets[i].id}));
  if(family==='image-text')result.items=[{id:'layered-diagram',label:variant?'气体交换':'节点名称',assetId:'fixture-one',imageText:{version:1,sourceAssetId:'fixture-one',cleanAssetId:'fixture-two',confirmed:true,note:'固定分层测试素材，不宣称已自动拆字',regions:[{id:'text',label:'文字',assetId:'fixture-text',from:variant?1:0,until:5.5,fade:.25,scale:variant?1.1:1,pivot:{x:50,y:50}}]}}];
  if(family==='probability')result.parameters={probability:variant?.72:.3,count:variant?72:48,seed:variant?91:11};
  if(family==='optimization')result.parameters={initial:variant?-8:5,rate:variant?.13:.22,steps:variant?9:5};
  if(family==='physical')result.parameters={initial:variant?12:0,speed:variant?-2:3};
  return result;
}
