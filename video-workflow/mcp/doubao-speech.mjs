import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createSpeechService } from '../lib/doubao-speech.mjs';
import { safeError } from '../lib/settings.mjs';

const service=createSpeechService();
const server=new McpServer({name:'doubao-speech',version:'1.0.0'},{instructions:'豆包语音用于视频旁白。按完整语意段配音。Frameboard 默认配底部小号同步字幕，并另交付 SRT。先 prepare 获取具体文案、音色或录音摘要，确认该次免费额度或费用后 execute。复刻须取得本人录音上传至豆包的明确授权。网页免费额度不等于 API 免费额度。结果待核对时不得自动重新提交。配音改变后，用新音频时长和字级时间戳重新对齐动画；时间戳缺失时不得编造。API Key 只在本机设置页配置，工具参数中不要传秘密。'});
const ro={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const localWrite={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false};
const remote={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true};
const id=z.string().uuid();
function tool(name,description,schema,annotations,fn){server.registerTool(name,{description,inputSchema:schema,annotations},async input=>{try{return {content:[{type:'text',text:JSON.stringify(await fn(input),null,2)}]};}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:safeError(e),code:e.code||'ERROR'})}]};}});}
tool('doubao_speech_status','查看豆包语音配置是否就绪、当前音色及本机设置地址；不返回 API Key。',{},ro,()=>service.status());
tool('doubao_list_voices','列出常用预设音色和在本机登记的本人音色。这不是云端完整音色列表。',{},ro,()=>service.listVoices());
tool('doubao_register_voice','登记控制台已有的 S_ 本人音色 ID 和名称到本机。不上传录音、不创建或购买音色、不调用合成。',{speaker_id:z.string(),name:z.string()},localWrite,i=>service.registerVoice(i));
tool('doubao_select_voice','设置视频工作流的默认配音音色，自动选择语音合成或声音复刻资源。只修改本机配置。',{speaker_id:z.string()},localWrite,i=>service.selectVoice(i.speaker_id));
tool('doubao_get_voice','查询指定已有音色的训练状态、剩余训练次数和短期有效的试听地址。不重新训练。',{speaker_id:z.string()},{...ro,openWorldHint:true},i=>service.getVoice(i.speaker_id));
tool('doubao_prepare_speech','准备一条完整语意段的配音，返回具体请求编号和摘要。不调用云端。先核对该请求免费额度或预计费用，再执行。最多2000字。',{text:z.string().min(1).max(2000),speaker_id:z.string().optional(),direction:z.string().max(500).optional(),speech_rate:z.number().int().min(-50).max(100).optional(),loudness_rate:z.number().int().min(-50).max(100).optional(),format:z.enum(['mp3','wav']).optional(),tone_fidelity:z.boolean().optional()},localWrite,i=>service.prepare('speech',i));
tool('doubao_prepare_voice_clone','准备本人音色复刻，读取当前工作区内的5–60秒录音并计算摘要；不上传。必须使用已有 S_ 槽位，避免自动创建后付费音色。执行前取得这段录音上传至豆包及更新该音色的授权。',{speaker_id:z.string(),name:z.string(),audio_path:z.string(),reference_text:z.string().optional(),demo_text:z.string().min(4).max(300).optional(),language:z.number().int().min(0).max(21).optional()},localWrite,i=>service.prepare('clone',i));
tool('doubao_execute_request','仅执行一个已经准备且已获确认的具体请求。配音可能按字数及音色槽位计费；复刻上传本人录音并消耗训练机会。确认与 request_id 绑定，只提交一次，网络结果不明不重发。billing_note须记录本次免费额度核实情况或用户批准的费用。',{request_id:id,confirmed:z.literal(true),billing_mode:z.enum(['free_quota','paid_approved']),billing_note:z.string().min(1).max(500),voice_consent:z.boolean().optional()},remote,i=>service.execute(i.request_id,i));
tool('doubao_get_request','读取本机请求状态和已生成的音频、字幕、时间标记文件。没有云端提交副作用。',{request_id:id},ro,i=>service.getRequest(i.request_id));
tool('doubao_speech_history','列出最近50条配音及复刻请求，用于恢复、定位待核对请求，避免重复收费。',{},ro,()=>service.history());
await server.connect(new StdioServerTransport());
