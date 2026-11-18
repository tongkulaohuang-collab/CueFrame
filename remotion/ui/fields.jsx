import {IssueNotice} from './IssueNotice';
import React from "react";
import { Sparkles, X } from "lucide-react";
import {ScienceTaskReceipt} from './ScienceStepIssues';
import {removeAsset} from '../shared/assets.mjs';
import {
  locks,
  productChecks,
  sourceChecked,
  sourceTypes,
  emptyClaim,
  graphics,
  emptyShot,
  resizeShots,
} from "../shared/model.mjs";
export const Label = ({ title, children }) => (
  <label className="field">
    <span>{title}</span>
    {children}
  </label>
);
export const Input = ({
  title,
  value,
  onChange,
  area = false,
  type = "text",
  ...props
}) => (
  <Label title={title}>
    {area ? (
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    ) : (
      <input
        value={value ?? ""}
        type={type}
        onChange={(e) =>
          onChange(type === "number" ? Number(e.target.value) : e.target.value)
        }
        {...props}
      />
    )}
  </Label>
);
export const Select = ({ title, value, options, onChange, ...props }) => (
  <Label title={title}>
    <select aria-label={title} value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {options.map((o) => (
        <option
          key={Array.isArray(o) ? o[0] : o}
          value={Array.isArray(o) ? o[0] : o}
        >
          {Array.isArray(o) ? o[1] : o}
        </option>
      ))}
    </select>
  </Label>
);
export const Check = ({ text, checked, onChange }) => (
  <label className="check">
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    {text}
  </label>
);
export const toggle = (xs, x, on) =>
  on ? [...new Set([...xs, x])] : xs.filter((i) => i !== x);
function assetStatus(p, a) {
  const source = sourceChecked(a) ? "来源已核对" : "来源待核对";
  if (p.kind !== "product" || a.role !== "product" || a.originType === "generated") return source;
  const missing = productChecks(p.productType).filter(item => !a.checks?.includes(item));
  return source + (missing.length ? " · 待核对：" + missing.join("、") : " · 产品一致性已核对");
}
function AssetChecks({p, a, edit}) {
  return <div className="checks">
    {(p.kind === "product" ? productChecks(p.productType) : locks).map(item =>
      <Check key={item} text={item} checked={a.checks?.includes(item)}
        onChange={on => edit(a.id, {checks:toggle(a.checks || [], item, on)})}/>)}
  </div>;
}
function SourceFields({a, edit}) {
  return <><Input title="原始条目或出处" value={a.source} onChange={source => edit(a.id,{source,confirmed:false})}/>
    <Input title="许可或使用依据" value={a.license} onChange={license => edit(a.id,{license,confirmed:false})}/></>;
}
function ConfirmSource({a,edit}) {
  return <Check text="已对照原件并核实使用依据" checked={a.confirmed} onChange={confirmed=>edit(a.id,{confirmed})}/>;
}
export function Assets({ p, set, upload }) {
  const edit = (id, props) =>
    set({
      assets: p.assets.map((a) => (a.id === id ? { ...a, ...props } : a)),
    });
  return (
    <section className="panel">
      <header>
        <div>
          <small>INPUT LIBRARY</small>
          <h2>素材与授权</h2>
        </div>
        <label className="upload">
          ＋ 上传素材
          <input
            aria-label="上传素材"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,audio/*,video/mp4,video/webm,.pdf,.txt"
            onChange={async (e) => {
              const fs = Array.from(e.target.files);
              e.target.value = "";
              await upload(fs);
            }}
          />
        </label>
      </header>
      {!p.assets.length && (
        <p className="empty">
          可添加产品截图、实拍、录屏、音频或资料。只有一句话，也能先保存草稿。
        </p>
      )}
      {p.assets.map((a) => (
        <div key={a.id} className="asset-row">
        <details className="detail asset-details" open={!a.confirmed}>
          <summary>
            {a.name} <em>{a.generation ? "AI 生成 · " : ""}{assetStatus(p,a)}</em>
          </summary>
          {a.kind === "image" && (
            <img className="thumb" src={a.src} alt={a.name} />
          )}
          {a.generation&&<p className="muted">AI 示意素材，不作为科学证据。{a.generation.usage} 需留意：{a.generation.checks}</p>}
          {a.kind === "document" && (
            <p>
              <a href={a.src} target="_blank" rel="noreferrer">
                打开本地资料
              </a>{" "}
              · 出处可填 <code>{a.src}</code>
            </p>
          )}
          <div className="grid2">
            <Select
              title="素材用途"
              value={a.role}
              onChange={(role) => edit(a.id, { role, confirmed: false })}
              options={
                a.kind === "audio"
                  ? [
                      ["zh", "中文旁白"],
                      ["en", "英文旁白"],
                      ["music", "配乐"],
                    ]
                  : [
                      ["reference", "参考资料"],
                      ...(p.kind === "science" && a.kind === "video" ? [["animation", "动画素材"]] : []),
                      ...(p.kind === "science" && a.kind === "image"
                        ? [["surface", "月面纹理（月相图）"]]
                        : [["product", "真实产品参考"]]),
                    ]
              }
            />
            {["image", "video"].includes(a.kind) && (
              <Select
                title="素材来源形式"
                value={a.originType || "original"}
                options={[
                  ["original", "真实素材 / 自有作品"],
                  ["generated", "AI 生成素材"],
                ]}
                onChange={(originType) =>
                  edit(a.id, { originType, referenceId: "", confirmed: false })
                }
              />
            )}
            {a.role === "product" && a.originType === "generated" && (
              <Select
                title="生成所依据的真实参考（同时关联到本镜）"
                value={a.referenceId || ""}
                options={[
                  ["", "选择真实参考"],
                  ...p.assets
                    .filter(
                      (ref) =>
                        ref.id !== a.id &&
                        ref.role === "product" &&
                        ref.originType !== "generated" &&
                        ref.confirmed,
                    )
                    .map((ref) => [ref.id, ref.name]),
                ]}
                onChange={(referenceId) =>
                  edit(a.id, { referenceId, confirmed: false })
                }
              />
            )}
            <SourceFields a={a} edit={edit}/>
            <Input
              title="署名要求"
              value={a.credit}
              onChange={(credit) => edit(a.id, { credit, confirmed: false })}
            />
          </div>
          {a.role === "product" && (
            <AssetChecks p={p} a={a} edit={edit}/>
          )}
          {a.kind === "audio" && (
            <>
              <audio controls src={a.src} />
              <span className="muted">实测 {a.duration.toFixed(2)} 秒</span>
            </>
          )}
          <ConfirmSource a={a} edit={edit}/>
        </details>
        <button type="button" className="asset-delete" title="从当前项目移除素材"
          aria-label={`删除素材 ${a.name}`} onClick={() => set(removeAsset(p, a.id))}>
          <X size={20} aria-hidden="true" />
        </button>
        </div>
      ))}
    </section>
  );
}
export function Claims({ p, set, action, request }) {
  const [query, Q] = React.useState(""),
    [found, F] = React.useState([]),
    [msg, M] = React.useState("");
  const edit = (id, attrs) =>
    set({
      claims: p.claims.map((c) =>
        c.id === id ? { ...c, ...attrs, verified: false } : c,
      ),
    });
  async function search() {
    M("检索中…");
    try {
      const rows = await request("/api/search", { query });
      F(rows);
      M(rows.length ? "检索结果待人工核验" : "没有匹配的资料");
    } catch (e) {
      M({error:e.message + "；可手动补充权威出处"});
    }
  }
  return (
    <section className="panel">
      <header>
        <div>
          <small>EVIDENCE</small>
          <h2>结论与出处</h2>
        </div>
        <button onClick={() => set({ claims: [...p.claims, emptyClaim()] })}>
          ＋ 新结论
        </button>
      </header>
      <div className="inline">
        <input
          value={query}
          aria-label="资料检索关键词"
          placeholder="关键词或英文论文题目"
          onChange={(e) => Q(e.target.value)}
        />
        <button disabled={!query.trim()} onClick={search}>
          查找论文
        </button>
      </div>
      {msg?.error?<IssueNotice area="论文检索" error={msg.error}/>:<p role="status">{msg}</p>}
      {found.map((f) => (
        <div className="search" key={f.url}>
          <a href={f.url} target="_blank" rel="noreferrer">
            {f.title}
          </a>
          <button
            onClick={() =>
              set({
                claims: [
                  ...p.claims,
                  {
                    ...emptyClaim(),
                    type: "同行评审论文",
                    title: f.title,
                    url: f.url,
                  },
                ],
              })
            }
          >
            引入待核
          </button>
        </div>
      ))}
      {p.claims.map((c, i) => (
        <div className="detail" key={c.id}>
          <div className="claim-heading">
            <div>
              <b>结论 {String(i + 1).padStart(2, "0")}</b>{" "}
              <em>{c.verified ? "已核对" : "待核对"}</em>
            </div>
            <button
              type="button"
              className="claim-delete"
              aria-label={`删除结论 ${String(i + 1).padStart(2, "0")}`}
              title="删除这条结论"
              onClick={() =>
                set({
                  claims: p.claims.filter((x) => x.id !== c.id),
                  shots: p.shots.map((s) => ({
                    ...s,
                    reviewed: s.claimIds.includes(c.id) ? false : s.reviewed,
                    claimIds: s.claimIds.filter((x) => x !== c.id),
                  })),
                })
              }
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <Input
            title="结论原文"
            area
            value={c.text}
            onChange={(text) => edit(c.id, { text })}
          />
          <div className="grid2">
            <Select
              title="来源类别"
              value={c.type}
              options={sourceTypes}
              onChange={(type) => edit(c.id, { type })}
            />
            <Input
              title="资料标题"
              value={c.title}
              onChange={(title) => edit(c.id, { title })}
            />
            <Input
              title="来源 URL 或已上传资料路径"
              value={c.url}
              onChange={(url) => edit(c.id, { url })}
            />
            <Input
              title="具体章节、页码或段落"
              value={c.locator}
              onChange={(locator) => edit(c.id, { locator })}
            />
            {c.type === sourceTypes[4] && (
              <Input
                title="原始出处"
                value={c.original}
                onChange={(original) => edit(c.id, { original })}
              />
            )}
          </div>
          <div className="inline">
            <button onClick={() => action("claim", c.id)}>核对并通过</button>
          </div>
        </div>
      ))}
    </section>
  );
}
export function StoryboardButton({storyboard, shotId = null}) {
  if (!storyboard) return null;
  const active = storyboard.blocker?.job;
  const generating = active?.task === 'storyboard' && active.status === 'running' &&
    (!shotId || !active.shotId || active.shotId === shotId);
  return <button type="button" className={'storyboard-generate ' + (shotId ? 'secondary' : 'primary')}
    disabled={storyboard.busy || !!storyboard.blocker}
    aria-describedby={storyboard.blocker ? 'storyboard-help storyboard-blocker' : 'storyboard-help'}
    onClick={() => storyboard.generate(shotId)}>
    <Sparkles size={16} aria-hidden="true" />{' '}
    {generating ? '正在生成镜头设计…' : shotId ? 'AI 生成本镜设计' : 'AI 生成分镜与连续镜头设计'}
  </button>;
}

export function Shots({
  p,
  set,
  selected,
  select,
  action,
  prepare,
  storyboard,
  openBlocker,
  undo,
  setUndo,
}) {
  const s = p.shots.find((x) => x.id === selected);
  const blocker = storyboard?.blocker;
  const editAsset = (id, attrs) => set(curr => ({
    assets:curr.assets.map(a => a.id === id ? {...a,...attrs} : a)
  }));
  const edit = (attrs) =>
    set({
      shots: p.shots.map((x) =>
        x.id === selected ? { ...x, ...attrs, reviewed: false } : x,
      ),
    });
  return (
    <section id="storyboard-editor" className="panel">
      <header>
        <div>
          <small>STORYBOARD</small>
          <h2>分镜编辑</h2>
        </div>
        <div className="storyboard-actions">
          <StoryboardButton storyboard={storyboard}/>
          <button type="button" onClick={() => {
            const n = emptyShot();
            set({ shots: [...p.shots, n] });
            select(n.id);
          }}>
            ＋ 新镜头
          </button>
        </div>
      </header>
      {storyboard && <>
        <p id="storyboard-help" className="muted">按节奏脚本和参考片分析，一次生成{p.shots.length ? '全部 ' + p.shots.length + ' 镜' : '全部分镜'}，使用当前 Codex 账户额度。</p>
        {blocker && <div className="storyboard-guidance">
          <span id="storyboard-blocker">{blocker.message}</span>
          <button type="button" onClick={() => openBlocker(blocker)}>
            {{job:'查看原任务', rhythm:'查看节奏脚本', references:'查看参考视频分析', narration:'前往口播与音乐', claims:'查看科学依据'}[blocker.target]}
          </button>
        </div>}
        <ScienceTaskReceipt job={storyboard.latestJob} version={p.version}/>
      </>}
      <div className="tabs">
        {p.shots.map((x, i) => (
          <button
            className={s?.id === x.id ? "active" : ""}
            key={x.id}
            onClick={() => select(x.id)}
          >
            {String(i + 1).padStart(2, "0")} {x.title}
          </button>
        ))}
      </div>
      {s ? (
        <>
          <div className="grid2">
            <Input
              title="镜头标题"
              value={s.title}
              onChange={(title) => edit({ title })}
            />
            <Input
              title="这一镜要让观众理解什么"
              value={s.purpose}
              onChange={(purpose) => edit({ purpose })}
            />
          </div>
          <Input
            title="画面与关键动作"
            value={s.visual}
            area
            onChange={(visual) => edit({ visual })}
          />
          <div className="grid2">
            <Input
              title="中文旁白 / 字幕"
              area
              value={s.zh}
              onChange={(zh) => edit({ zh })}
            />
            <Input
              title="英文旁白 / 字幕"
              area
              value={s.en}
              onChange={(en) => edit({ en })}
            />
            <Select
              title="图形"
              value={s.graphic}
              options={graphics}
              onChange={(graphic) => edit({ graphic })}
            />
            <Input
              title="图形标签（以 | 分隔）"
              value={s.labels.join("|")}
              onChange={(v) => edit({ labels: v.split("|") })}
            />
          </div>
          <div className="inline">
            <Label title="镜头基础秒数">
              <input
                key={s.id + ":" + s.seconds}
                type="number"
                step=".25"
                min=".25"
                max="3600"
                defaultValue={s.seconds}
                onBlur={(e) => {
                  const sec = Number(e.target.value);
                  if (sec >= 0.25 && sec <= 3600 && sec !== s.seconds) {
                    const r = resizeShots(p, s.id, sec);
                    setUndo(r.undo);
                    set({ shots: r.shots });
                  }
                }}
              />
            </Label>
            <button
              disabled={!undo}
              onClick={() => {
                set({
                  shots: p.shots.map((x) => ({
                    ...x,
                    seconds:
                      undo.find((v) => v.id === x.id)?.seconds ?? x.seconds,
                  })),
                });
                setUndo(null);
              }}
            >
              撤销调时
            </button>
          </div>
          <div className="checks">
            {p.assets.map((a) => (
              <Check
                key={a.id}
                text={a.name}
                checked={s.assetIds.includes(a.id)}
                onChange={(on) =>
                  edit({ assetIds: toggle(s.assetIds, a.id, on) })
                }
              />
            ))}
            {p.claims.map((c, i) => (
              <Check
                key={c.id}
                text={"结论 " + (i + 1) + " · " + c.text}
                checked={s.claimIds.includes(c.id)}
                onChange={(on) =>
                  edit({ claimIds: toggle(s.claimIds, c.id, on) })
                }
              />
            ))}
          </div>
          <div className="inline">
            {p.kind==='product' && p.assets.filter(a => s.assetIds.includes(a.id) && ["image","video"].includes(a.kind)).map(a =>
              <fieldset key={a.id} className="detail"><legend>{a.name} · {assetStatus(p,a)}</legend>
                {a.role === "reference" && a.originType !== "generated" &&
                  <button onClick={()=>editAsset(a.id,{role:"product",confirmed:false})}>用作真实产品参考</button>}
                {!sourceChecked(a) && <><SourceFields a={a} edit={editAsset}/><ConfirmSource a={a} edit={editAsset}/></>}
                {a.role==="product" && a.originType!=="generated" && <AssetChecks p={p} a={a} edit={editAsset}/>}
              </fieldset>)}
            {p.kind!=='science'&&<button onClick={() => action("shot", s.id)}>
              核对本镜文字与图形
            </button>}
            {!storyboard && <button onClick={() => prepare(s.id)}>用 Codex 改这一镜</button>}
            {p.kind!=='science'&&<em>{s.reviewed ? "已核对" : "待核对"}</em>}
          </div>
        </>
      ) : (
        <p className="empty">
          先绑定真实素材或科学依据，然后生成分镜。也可以手动创建第一镜。
        </p>
      )}
      {!storyboard && <button className="secondary" onClick={() => prepare(null)}>
        提交 Codex 分镜任务
      </button>}
    </section>
  );
}
