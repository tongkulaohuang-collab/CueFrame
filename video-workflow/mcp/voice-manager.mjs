import { callSpeechTool } from "./client.mjs";
import { createSpeechService } from "../lib/doubao-speech.mjs";
import { speechHandler } from "../lib/speech-http.mjs";

const local = createSpeechService();
const manager = {
  status: () => callSpeechTool("doubao_speech_status", {}),
  history: async () => (await callSpeechTool("doubao_speech_history", {})).filter(r => r.kind === "clone"),
  registerVoice: input => callSpeechTool("doubao_register_voice", input),
  getVoice: speaker_id => callSpeechTool("doubao_get_voice", { speaker_id }),
  uploadAudio: local.uploadAudio,
  prepare(kind, input) {
    if (kind !== "clone") throw Error("请在当前镜头的试听面板准备配音");
    return callSpeechTool("doubao_prepare_voice_clone", input);
  },
  async getRequest(request_id) {
    const request = await callSpeechTool("doubao_get_request", { request_id });
    if (request.kind !== "clone") throw Error("这里仅处理声音复刻请求");
    return request;
  },
  async execute(request_id, approval) {
    await this.getRequest(request_id);
    return callSpeechTool("doubao_execute_request", { ...approval, request_id });
  },
};
export const handleVoiceManager = speechHandler(manager, { embedVoiceManager: true });
