import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {kitScript} from '../../vendor/anatomy/scripts/inline-kit.mjs';
export function buildAnatomy(config,out){
 const dir=path.dirname(fileURLToPath(import.meta.url));
 const scene=fs.readFileSync(path.join(dir,'anatomy-scene.js'),'utf8');
 const color='--anatomy-paper:#101f2c;--anatomy-top:#293e50;--anatomy-shade-0:#122333;--anatomy-shade-1:#1a2e40;--anatomy-shade-2:#213749;--anatomy-shade-3:#2a4255;--anatomy-hi:#bacbd5;--anatomy-mid:#7e99ad;--anatomy-lo:#4b687e;--anatomy-lit:#f6c771;--anatomy-lit-top:#c99542;--anatomy-lit-shade:#735226';
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'scene.html'),`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>机械正弦绘图仪 · Anatomy</title><style>html,body{margin:0;background:#101f2c;overflow:hidden}svg{width:100vw;height:100vh;display:block}.iso{--anatomy-weight:1px}</style><body class="iso" data-theme="dark" style="${color}"><svg viewBox="0 0 1280 720" role="img" aria-label="横槽架把圆周运动的高度传给笔尖，匀速纸带记录正弦曲线"></svg><script>const CONFIG=${JSON.stringify(config)};${kitScript().replace(/<\/script/gi,'<\\/script')}\n${scene}</script></body></html>`);return path.join(out,'scene.html');
}
