import {createSpeechService} from '../vendor/doubao-speech/service.mjs';
export const workbenchSpeech=createSpeechService();
export async function callWorkbenchSpeech(name,args) {
  if(name==='doubao_speech_status')return workbenchSpeech.status();
  if(name==='doubao_prepare_speech')return workbenchSpeech.prepare('speech',args);
  if(name==='doubao_get_request')return workbenchSpeech.getRequest(args.request_id);
  if(name==='doubao_execute_request')return workbenchSpeech.execute(args.request_id,args);
  throw Error('未知的工作台配音操作');
}
