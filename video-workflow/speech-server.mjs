import http from 'node:http';
import { speechHandler } from './lib/speech-http.mjs';
const port=Number(process.env.SPEECH_PORT||8788);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('SPEECH_PORT 无效');
const route=speechHandler();
const server=http.createServer(async(req,res)=>{
  const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
  if(!hosts.includes(req.headers.host)||(req.headers.origin&&!hosts.map(h=>'http://'+h).includes(req.headers.origin))){res.writeHead(403);res.end('仅允许本机同源访问');return;}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(url.pathname==='/'){res.writeHead(302,{Location:'/voice'});res.end();return;}
  if(!await route(req,res,url)){res.writeHead(404);res.end('Not found');}
});
server.requestTimeout=240000;
server.listen(port,'127.0.0.1',()=>console.log(`豆包配音工作台：http://127.0.0.1:${port}/voice`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'配音工作台端口已占用。':e.message);process.exitCode=1;});
