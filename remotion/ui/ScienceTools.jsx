import {IssueNotice} from './IssueNotice';
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Atom, Box, CheckCircle2, CircleAlert, RefreshCw, Play, Download } from "lucide-react";
import "./science.css";

async function api(route, body) {
  const response = await fetch("/api/science/" + route, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "请求失败");
  return result;
}

export function ScienceTools({ project, onImport, onClose }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const heading = useRef(null);
  const refresh = async () => setState(await api("status"));
  useEffect(() => { heading.current?.focus(); refresh().catch(e => setError(e.message)); }, []);
  const running = state?.jobs?.some(j => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => refresh().catch(e => setError(e.message)), 3000);
    return () => clearInterval(timer);
  }, [running]);
  async function act(key, fn) {
    if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try { await fn(); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(""); }
  }
  const engines = [
    { id: "manim", name: "Manim", Icon: Atom, category: "数学 · 物理", text: "公式推导、函数变化、波动与运动关系。用同一组数值驱动画面和图表。", ready: state?.modules?.manim && state?.modules?.mcp, url: "https://github.com/abhiemj/manim-mcp-server" },
    { id: "blender", name: "14 · Blender", Icon: Box, category: "材质 · 空间 · 特写", text: "新增本地后台渲染。在镜头设计中选择 Blender、机位和连续时间，生成纯画面后沿用现有旁白与字幕。", ready: state?.blenderInstalled, url: "https://github.com/ahujasid/mcp-for-blender" },
    { id: "anatomy", name: "15 · Anatomy", Icon: Box, category: "结构 · 剖解 · 运动关系", text: "原版 iso-kit 已接入。在镜头设计中生成可编辑结构动画；与 Blender 共用机械模型的尺寸、周期和连续时间。当前内置正弦绘图仪。", ready: true, url: "https://github.com/wheresryan22/anatomy" },
  ];
  return <main className="science-tools" id="main-content" tabIndex={-1}>
    <button onClick={onClose}><ArrowLeft size={16} aria-hidden="true" /> 返回{project ? "当前项目" : "工作区"}</button>
    <div className="science-heading"><div><p className="science-kicker">SCIENCE PRODUCTION</p><h1 ref={heading} tabIndex={-1}>科普工具</h1><p>先核对原理，再制作动画，最后回到工作台配音与成片。</p></div>
      <button disabled={!!busy} onClick={() => act("refresh", async () => setMessage("已刷新本机安装状态"))}><RefreshCw size={16} aria-hidden="true" /> {busy === "refresh" ? "检查中…" : "刷新状态"}</button>
    </div>
    {error && <IssueNotice area="科普制作工具" error={error}/>}
    {message && <p className="science-notice" role="status">{message}</p>}
    {!state ? <p role="status">{error?'工具状态读取失败，可点「刷新状态」重新检查。':'正在检查本机工具…'}</p> : <>
      <section className="science-engines" aria-label="动画工具">
        {engines.map(({ id, name, Icon, category, text, ready, url }) => {
          const checked = state.checks[id];
          return <article className="science-card" key={id}>
            <div className="science-card-top"><Icon size={27} aria-hidden="true" /><span>{category}</span></div>
            <h2>{name}</h2><p>{text}</p>
            <div className={"science-state " + (ready && checked?.ok ? "ready" : "pending")}>
              {ready && checked?.ok ? <CheckCircle2 size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}
              {id==='anatomy'?'本地模板已接入':id==='blender'&&ready?'本地后台渲染已就绪':ready ? checked?.ok ? "最近连接检查通过" : "已安装 · 待连接检查" : "源码已下载 · 运行依赖待安装"}
            </div>
            {id === "manim" && ready && <p className="science-check-detail">{state.texInstalled ? "数学公式排版环境已安装" : "普通图形可用；数学公式需要补装 TeX"}</p>}
            {checked && (checked.ok?<p className="science-check-detail">{checked.message}<br />检查于 {new Date(checked.checkedAt).toLocaleString("zh-CN")}</p>:<IssueNotice area={name+'连接'} error={checked.message}/>)}
            <div className="science-actions">
              {id!=='anatomy'&&<button disabled={!!busy || !ready} onClick={() => act(id, async () => { const result = await api("check", { engine: id }); if (!result.ok) throw Error(result.message); setMessage(name + "：" + result.message); })}>{busy === id ? "连接中…" : "检查 MCP 连接"}</button>}
              {id!=='manim'&&project&&<button onClick={onClose}>返回项目制作画面</button>}
              {id === "blender" && <button disabled={!!busy || !state.blenderInstalled} onClick={() => act("blender-open", async () => setMessage((await api("blender", {})).message))}>启动 Blender</button>}
              <a href={url} target="_blank" rel="noreferrer">项目来源 ↗</a>
            </div>
          </article>;
        })}
      </section>
      {!engines.every(e => e.ready) && <section className="science-notice" aria-label="安装状态">
        <strong>运行环境尚未就绪</strong><p>网络恢复后，双击下面的续装脚本。它会安装 Python 依赖、下载并校验 Blender 官方便携版，再启用这两个 MCP。</p><code>{state.installCommand}</code>
        <p>当前 Codex 配置：{state.registered ? "已登记；缺少依赖的服务保持停用" : "尚未登记"}。完整安装后，在 Codex 设置中重启 MCP 连接。</p>
      </section>}
      <section className="science-workflow" aria-labelledby="science-flow"><h2 id="science-flow">制作分工</h2>
        <div className="science-flow-grid">
          <article><strong>01 · 资料与依据</strong><p>Firecrawl MCP 在 Codex 中检索原始资料；工作台已有 Crossref 论文检索。逐条记录结论与出处。</p><span>复用现有接入</span></article>
          <article><strong>02 · 原理与场景</strong><p>Blender 负责三维材质和机位，Anatomy 负责结构与运动关系，Manim 负责数学过程。可在本机生成和导入。</p><span>本地免费画面流程</span></article>
          <article><strong>03 · 旁白与成片</strong><p>复用本地中英文配音、Remotion 时间线与 FFmpeg 合成；无需新增配音或剪辑 MCP。</p><span>{state.voiceInstalled ? "本地配音已安装" : "本地配音待检查"} · {state.ffmpegInstalled ? "合成工具已安装" : "合成工具待检查"}</span></article>
        </div>
      </section>
      <section className="science-results" aria-labelledby="science-results"><div className="science-heading"><div><h2 id="science-results">动画结果</h2><p>{project ? "当前项目：" + (project.title || project.topic || "未命名项目") + "。导入后记得保存草稿，并核对科学依据。" : "从项目中打开科普工具，可将生成结果直接加入该项目素材。"}</p></div>
        <button disabled={!!busy || running || !engines[0].ready} onClick={() => act("demo", async () => { await api("demo", {}); setMessage("本地简谐运动样片已开始渲染，不调用付费服务"); })}><Play size={16} aria-hidden="true" /> {running ? "本地渲染中…" : "生成简谐运动测试片"}</button>
      </div>
        {state.jobs.map(j => <div className="science-job" key={j.id}><p>{j.title} · {{ running: "渲染中", done: "完成", failed: "失败", interrupted: "已中断" }[j.status]}</p>{j.error&&<IssueNotice area="本地动画制作" job={j} error={j.error}/>}</div>)}
        {!state.outputs.length ? <div className="science-empty">还没有动画结果。运行测试片，或让 Codex 将动画保存到工具目录下的 outputs/manim 或 outputs/blender。</div> : <div className="science-output-grid">{state.outputs.map(file => {
          const src = "/api/science/output?id=" + encodeURIComponent(file.id);
          return <article className="science-card" key={file.id}>{file.name.endsWith(".png") ? <img src={src} alt={file.name} /> : <video controls preload="metadata" src={src} aria-label={file.name} />}
            <strong>{file.name}</strong><p>{file.id}</p><div className="science-actions"><a href={src} download={file.name}><Download size={16} aria-hidden="true" /> 下载</a><button disabled={!project || !!busy} onClick={() => act(file.id, async () => { const asset = await api("import", { id: file.id }); onImport(asset); setMessage("已加入当前项目素材，请保存草稿并关联镜头"); })}>加入当前项目</button></div></article>;
        })}</div>}
      </section>
    </>}
  </main>;
}
