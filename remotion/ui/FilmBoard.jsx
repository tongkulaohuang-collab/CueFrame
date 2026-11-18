import {isAuthoredProcess} from '../shared/production-mode.mjs';
import {IssueNotice} from './IssueNotice';
import React, { useEffect, useMemo, useState } from "react";
import { Preview } from "./Preview";
import { filmIssues, filmProps, locateNote } from "../shared/film.mjs";
import { filmLayouts, qualityFor, emptyShot, shotIssues } from "../shared/model.mjs";
import { Input, Select } from "./fields";
import {KeynataLibrary} from './KeynataLibrary';
import {exportStatus} from './export-status.mjs';

const seconds = (frames, fps) => (frames / fps).toFixed(2) + " s";
export function FilmBoard({
  p,
  set,
  sel,
  select,
  variant,
  busy,
  dirty,
  act,
  saved,
  load,
  run,
  request,
  tasks,
  goEdit,
  goSettings,
  goRoom,
  musicLibraryProps,
  notice,
  trackExport,
}) {
  const [seek, seekTo] = useState(null),
    [notes, setNotes] = useState([]),
    [notesError,setNotesError] = useState(''),
    [undo, setUndo] = useState(null);
  const props = useMemo(() => filmProps(p, variant), [p, variant]);
  const [motionDraft, setMotionDraft] = useState('');
  const [showControls, setShowControls] = useState(false);
  const rows = props.rows,
    selected = p.shots.find((s) => s.id === sel);
  useEffect(()=>setMotionDraft(selected?.motionReview||''),[selected?.id,selected?.motionReview]);
  const ready = filmIssues(p, variant, false),
    problems = filmIssues(p, variant, true);
  if (p.language === "separate")
    for (const reason of filmIssues(p, variant === "zh" ? "en" : "zh", true))
      if (!problems.includes(reason)) problems.push(reason);
  const relevant = tasks.filter((j) => ["film", "rough"].includes(j.scope));
  const localMode = isAuthoredProcess(p);
  const delivered = relevant.find(j => j.status === 'done' && j.output && j.variant === variant && j.version===p.version);
  useEffect(() => {
    let active = true;
    const get = () =>
      request("/api/projects/" + p.id + "/notes")
        .then((n) => {
          if (active) {setNotes(n);setNotesError('');}
        })
        .catch(e=>{if(active&&p.kind==='science')setNotesError(e.message);});
    if (p.version) {
      get();
      const t = setInterval(get, 4000);
      return () => {
        active = false;
        clearInterval(t);
      };
    }
  }, [p.id, p.version]);
  function edit(attrs) {
    set({ shots: p.shots.map((s) => (s.id === sel ? { ...s, ...attrs } : s)) });
  }
  function rearrange(action) {
    const index = p.shots.findIndex((s) => s.id === sel),
      shots = p.shots.slice();
    if (action === "insert") {
      const n = emptyShot();
      shots.splice(index + 1, 0, n);
      select(n.id);
    }
    if (action === "remove") {
      if (p.kind!=='science' && !window.confirm("从当前版本移除此镜？历史版本和批注会保留。")) return;
      shots.splice(index, 1);
      select(shots[Math.min(index, shots.length - 1)]?.id || "");
    }
    if (action === "up" || action === "down") {
      const next = index + (action === "up" ? -1 : 1);
      [shots[index], shots[next]] = [shots[next], shots[index]];
    }
    setUndo({ shots: p.shots, selected: sel });
    set({ shots });
  }
  async function submit(scope) {
    const q = await saved();
    const submitted=await request("/api/projects/" + q.id + "/" + scope, {
      version: q.version,
      variant,
    });
    trackExport(submitted);
  }
  async function check(item, pass) {
    const q = await saved();
    load(
      await request("/api/projects/" + q.id + "/review", {
        version: q.version,
        kind: "visual",
        id: sel,
        check: item,
        pass,
      }),
    );
  }
  async function score() {
    const q = await saved(),
      a = await request("/api/projects/" + q.id + "/score", {
        version: q.version,
        lang: variant,
      });
    const musicIds = new Set(
      q.assets.filter((x) => x.role === "music").map((x) => x.id),
    );
    load(
      await request("/api/projects", {
        ...q,
        assets: [...q.assets.filter((x) => x.id !== a.id), a],
        shots: q.shots.map((s) => ({
          ...s,
          assetIds: [...s.assetIds.filter((id) => !musicIds.has(id)), a.id],
        })),
      }),
    );
    notice("已生成并关联跨镜配乐，请复核修改后的音画");
  }
  const selectedIndex = p.shots.findIndex((s) => s.id === sel);
  return (
    <>
      {localMode && delivered && <section className="panel">
        <h2>{delivered.title || '完整科普视频'}</h2>
        <p className="muted">导出版本 v{delivered.version}</p>
        <video controls preload="metadata" style={{width:'100%',display:'block',borderRadius:12}} src={delivered.output+'film.mp4'}/>
        <div className="links inline">
          <a href={delivered.output+'film.mp4'} download>下载 MP4</a>
          <a href={delivered.output+'subtitles.srt'} download>下载字幕 SRT</a>
          {delivered.packaged && <a href={delivered.output+'editable-project.zip'} download>下载可编辑工程</a>}
        </div>
        <button aria-expanded={showControls} onClick={()=>setShowControls(v=>!v)}>{showControls?'收起':'展开'}镜头编排与重新导出</button>
      </section>}
      {(!localMode || !delivered || showControls) && <>
      <section className="panel film-board">
        <header>
          <div>
            <small>FILM / TIMELINE</small>
            <h2>整片分镜板</h2>
          </div>
          <span className="film-stat">
            {rows.length} 镜 · {seconds(props.canvas.frames, p.fps)}
          </span>
        </header>
        <div className="film-list">
          {rows.map((r, i) => (
            <button
              key={r.id}
              aria-pressed={sel === r.id}
              onClick={() => {
                select(r.id);
                seekTo({ frame: r.from });
              }}
            >
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span>
                <strong>{r.scene.shot.title}</strong>
                <small>
                  {seconds(r.from, p.fps)} – {seconds(r.from + r.frames, p.fps)}
                  {r.overlap > 0 ? " · 叠化 " + r.overlap + " 帧" : ""}
                  {r.padding ? " · 阅读余量 " + seconds(r.padding, p.fps) : ""}
                  {r.padding > p.fps * 1.5 ? " · 请复核停留" : ""}
                </small>
              </span>
              <em>{p.kind==='science' ? (shotIssues(p,r.scene.shot).length?'待补资料':'资料齐备') : r.scene.shot.reviewed ? "已核对" : "待核对"}</em>
            </button>
          ))}
        </div>
        <div className="inline">
          <button onClick={() => rearrange("insert")}>插入一镜</button>
          <button disabled={selectedIndex <= 0} onClick={() => rearrange("up")}>
            上移
          </button>
          <button
            disabled={selectedIndex < 0 || selectedIndex === rows.length - 1}
            onClick={() => rearrange("down")}
          >
            下移
          </button>
          <button disabled={!selected} onClick={() => rearrange("remove")}>
            移除本镜
          </button>
          <button
            disabled={!undo}
            onClick={() => {
              set({ shots: undo.shots });
              select(undo.selected);
              setUndo(null);
            }}
          >
            撤销排序或移除
          </button>
        </div>
        {selected && (
          <>
            <div className="grid2">
              {p.kind!=='science'&&<Select
                title="本镜构图"
                value={selected.layout || ""}
                options={[
                  ["", "沿用镜头场景"],
                  ...Object.entries(filmLayouts).filter(([key]) =>
                    p.kind === "science"
                      ? key !== "product"
                      : key === "product",
                  ),
                ]}
                onChange={(layout) => edit({ layout })}
              />}
              <Select
                title="入镜转场"
                value={selected.transition || "cut"}
                options={[
                  ["cut", "直切"],
                  ["dissolve", "短叠化 · 利用前镜无旁白尾段"],
                ]}
                onChange={(transition) => edit({ transition })}
              />
              {p.kind!=='science'&&<Input
                title="英文镜头标题"
                value={selected.titleEn || ""}
                onChange={(titleEn) => edit({ titleEn })}
              />}
            </div>
            <button onClick={goEdit}>编辑本镜脚本、素材与秒数</button>
          </>
        )}
      </section>
      <section className="panel">
        <header>
          <div>
            <small>SCREENING / MASTER</small>
            <h2>连续有声预览</h2>
          </div>
          <button onClick={goSettings}>语言与暂停节点</button>
        </header>
        {rows.length > 0 && !ready.length && !dirty ? (
          <Preview key={p.id + variant} scene={props} whole seek={seek} />
        ) : (
          <div className="gate">
            {dirty ? "先保存草稿，重新检查改动。" : ready.join(" · ")}
          </div>
        )}
        <div className="inline">
          <button disabled={!rows.length || busy} onClick={() => run(score)}>
            生成本地全片配乐
          </button>
          <button
            disabled={busy || ready.length > 0 || dirty}
            onClick={() => run(() => submit("rough"))}
          >
            导出有声粗剪
          </button>
          <button onClick={goRoom}>打开审片室 ↗</button>
        </div>
        {p.kind!=='science' && <KeynataLibrary {...musicLibraryProps}/>}
      </section>
      {selected && (
        <section className="panel">
          <small>
            SHOT CHECK / {String(selectedIndex + 1).padStart(2, "0")}
          </small>
          <h2>本镜画面核检</h2>
          <p>{selected.title}</p>
          <div className="checks">
            {qualityFor(p).map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  disabled={busy || dirty || (p.kind==='science' ? shotIssues(p,selected).length>0 : !selected.reviewed)}
                  checked={selected.filmQA?.includes(item) || false}
                  onChange={(e) => {
                    const pass = e.target.checked;
                    run(() => check(item, pass));
                  }}
                />
                {item}
              </label>
            ))}
          </div>
        </section>
      )}
      {selected&&p.kind==='science'&&<section className="panel">
        <Input area title="连续动作实看片记录（版本、时间码、实际观察）" value={motionDraft} onChange={setMotionDraft}/>
        <button disabled={busy||dirty||shotIssues(p,selected).length>0||!motionDraft.trim()} onClick={()=>run(async()=>{const q=await saved();load(await request('/api/projects/'+q.id+'/review',{version:q.version,kind:'motion',id:sel,check:motionDraft}));})}>保存连续片段检查</button>
        <p className="muted">按正常速度观看完整过程。仅有静帧、解码成功或删掉标题，不代表连续镜头合格。</p>
      </section>}
      <section className="panel">
        <header>
          <div>
            <small>DELIVERY</small>
            <h2>整片导出</h2>
          </div>
          <button
            className="primary"
            disabled={busy || dirty || problems.length > 0}
            onClick={() => run(() => submit("film"))}
          >
            {p.language === "separate" ? "导出两种语言的整片" : "导出完整成片"}
          </button>
        </header>
        {problems.length ? (
          <div className="gate">
            <b>整片待放行</b>
            <ul>
              {problems.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p>全部镜头已放行，可导出成片与独立工程。</p>
        )}
        {relevant.map((j) => (
          <div className="detail film-job" key={j.id}>
            <b>
              {j.title || (j.scope === "rough" ? "有声粗剪" : "完整成片")} · v{j.version} ·{" "}
              {j.variant.toUpperCase()}
            </b>
            <p>{exportStatus(j)}</p>
            {j.error && <IssueNotice area="整片制作" job={j} error={j.error}/>}
            {j.status === "failed" && (
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => trackExport(await request("/api/jobs/" + j.id + "/retry", {})))
                }
              >
                从原版本重试
              </button>
            )}
            {j.output && (
              <div className="links">
                {[
                  ["film.mp4", "播放 MP4"],
                  ["subtitles.srt", "字幕"],
                  ...(j.scope === "film" || j.packaged
                    ? [
                        ["editable-project.zip", "可编辑工程"],
                        ["storyboard.csv", "分镜表"],
                        ["sources.json", "来源清单"],
                      ]
                    : []),
                  ["evidence.json", "渲染记录"],
                ].map(([f, t]) => (
                  <a
                    key={f}
                    href={j.output + f}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
      {notesError&&<IssueNotice area="读取版本批注" error={notesError} summary={notesError}/>}
      {notes.length > 0 && (
        <section className="panel">
          <small>REVIEW / ANCHORS</small>
          <h2>版本批注</h2>
          {notes
            .filter((n) => !n.variant || n.variant === variant)
            .map((n) => {
              const frame = locateNote(rows, n, p.fps);
              return (
                <div className="detail" key={n.id}>
                  <b>
                    v{n.version} · {n.text}
                  </b>
                  <p>
                    {n.t == null ? (
                      "整片批注"
                    ) : frame == null ? (
                      "原镜头已移除或被剪短，需重新定位"
                    ) : (
                      <button
                        onClick={() => {
                          select(n.shotId);
                          seekTo({ frame });
                        }}
                      >
                        定位第 {frame} 帧 · 镜内 {n.localFrame} 帧
                      </button>
                    )}
                  </p>
                </div>
              );
            })}
        </section>
      )}
      </>}
    </>
  );
}
