import React, { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Clapperboard,
  HardDrive,
  FolderOpen,
  LayoutDashboard,
  Layers3,
  Monitor,
  Orbit,
  Plus,
  Search,
  X,
} from "lucide-react";

const kinds = { product: "产品宣传", science: "科普讲解" };
const navigation = [
  ["all", "全部项目", LayoutDashboard],
  ["product", "产品宣传", Clapperboard],
  ["science", "科普讲解", Orbit],
];

export function Home({ list, open, start }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const recentRef = useRef(null);
  const projects = list.filter(
    (p) =>
      (filter === "all" || p.kind === filter) &&
      `${p.title || ""} ${p.topic || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const jumpToProjects = () => {
    recentRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    recentRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="workspace home-workspace">
      <aside className="studio-rail" aria-label="工作区导航">
        <div className="rail-space">
          <span className="space-icon">
            <Monitor size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>我的工作区</strong>
            <span>个人创作空间</span>
          </div>
          <span className="online-dot" />
        </div>
        <small>WORKSPACE</small>
        <nav className="rail-nav" aria-label="项目分类">
          {navigation.map(([key, label, Icon]) => (
            <button
              key={key}
              className={filter === key ? "on" : ""}
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key);
                jumpToProjects();
              }}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              <span className="nav-count">
                {key === "all"
                  ? list.length
                  : list.filter((p) => p.kind === key).length}
              </span>
            </button>
          ))}
        </nav>
        <small>QUICK ACCESS</small>
        <button onClick={jumpToProjects}>
          <FolderOpen size={18} aria-hidden="true" />
          <span>最近草稿</span>
        </button>
        <div className="rail-note">
          <Layers3 size={20} aria-hidden="true" />
          <strong>专注下一帧。</strong>
          <p>
            从一个想法开始，
            <br />
            让每个镜头都有表达。
          </p>
          <button onClick={() => start("product")}>
            <Plus size={15} aria-hidden="true" /> 新建项目
          </button>
        </div>
        <div className="asidefoot">
          <span className="online-dot" /> 本机存储
          <div>CUEFRAME / LOCAL STUDIO</div>
        </div>
      </aside>
      <main className="home" id="main-content" tabIndex={-1}>
        <div className="dashboard-toolbar">
          <div className="breadcrumb">
            工作区 <span>/</span> <strong>创作概览</strong>
          </div>
          <label className="project-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="搜索项目"
              placeholder="搜索项目或主题…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="清空搜索" onClick={() => setQuery("")}>
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </label>
        </div>
        <div className="welcome">
          <div>
            <small>YOUR CREATIVE SPACE</small>
            <h1>
              把想法，变成画面<span>。</span>
            </h1>
            <p>欢迎回到工作台，继续你的下一部作品。</p>
          </div>
          <button className="quiet-button" onClick={jumpToProjects}>
            继续创作 <ArrowDown size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="overview-stats" aria-label="工作区概览">
          {[
            [FolderOpen, "本地项目", list.length, "部作品，持续打磨"],
            [
              Clapperboard,
              "产品宣传",
              list.filter((p) => p.kind === "product").length,
              "用画面讲清产品价值",
            ],
            [
              Orbit,
              "科普讲解",
              list.filter((p) => p.kind === "science").length,
              "让原理清晰可见",
            ],
          ].map(([Icon, label, value, note]) => (
            <section className="stat-card" key={label}>
              <span className="stat-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <div>
                <span>{label}</span>
                <strong>{String(value).padStart(2, "0")}</strong>
              </div>
              <p>{note}</p>
            </section>
          ))}
        </div>
        <div className="sectionhead">
          <h2>开始新的创作</h2>
          <span>选择一种方式，让故事发生</span>
        </div>
        <div className="creation-grid">
          <button
            className="creation-card science"
            onClick={() => start("science")}
          >
            <div className="creation-top">
              <span className="creation-icon">
                <Orbit size={24} aria-hidden="true" />
              </span>
              <small>SCIENCE NOTES</small>
              <ArrowUpRight size={19} aria-hidden="true" />
            </div>
            <h3>让复杂，变得清楚。</h3>
            <p>
              从选题和音乐出发，审核节奏脚本，
              <br />
              看过三张效果图，再做有声样片。
            </p>
            <span className="creation-action">
              <Plus size={16} aria-hidden="true" /> 新建科普讲解片
            </span>
          </button>
          <section className="workflow-card">
            <small>YOUR WORKFLOW</small>
            <h3>创作，有条不紊。</h3>
            <ol>
              {[
                ["项目与素材", "收集灵感，整理素材"],
                ["分镜与依据", "编排故事，核对来源"],
                ["样镜与审片", "预览画面，打磨细节"],
                ["整片与交付", "串联镜头，完成作品"],
              ].map(([title, caption], i) => (
                <li key={title}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{caption}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <section
          className="projects-section"
          ref={recentRef}
          tabIndex={-1}
          aria-label="最近草稿"
        >
          <div className="sectionhead">
            <div className="project-heading">
              <h2>最近草稿</h2>
              <span className="count-pill">{projects.length}</span>
            </div>
            <div className="filter-tabs" aria-label="筛选项目">
              {[
                ["all", "全部"],
                ["product", "产品宣传"],
                ["science", "科普讲解"],
              ].map(([key, title]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  className={filter === key ? "active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
          {(query || filter !== "all") && (
            <p className="filter-summary" role="status">
              找到 {projects.length} 个{filter === "all" ? "" : kinds[filter]}
              项目{query ? `，搜索“${query}”` : ""}
            </p>
          )}
          <div className="project-grid">
            {projects.map((p) => {
              const Icon = p.kind === "science" ? Orbit : Clapperboard;
              return (
                <button
                  className="project-card"
                  key={p.id}
                  onClick={() => open(p.id)}
                >
                  <div className="project-card-top">
                    <span className={`project-icon ${p.kind}`}>
                      <Icon size={21} aria-hidden="true" />
                    </span>
                    <span className="project-kind">{kinds[p.kind]}</span>
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </div>
                  <h3>{p.title || p.topic || "未命名草稿"}</h3>
                  <p>{p.topic || "打开草稿，继续编排你的故事。"}</p>
                  <div className="project-card-footer">
                    <span>
                      <HardDrive size={14} aria-hidden="true" /> 本地草稿
                    </span>
                    <span>
                      v{p.version} <span className="metadata-divider">/</span>{" "}
                      {p.updated
                        ? new Date(p.updated).toLocaleDateString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "本地草稿"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {!projects.length && (
            <div className="empty-projects">
              <FolderOpen size={30} aria-hidden="true" />
              <h3>
                {list.length
                  ? "没有找到匹配的项目"
                  : "你的第一部作品，从这里开始"}
              </h3>
              <p>
                {list.length
                  ? "试试其他关键词，或查看全部项目。"
                  : "选择上方制作场景，创建并保存你的第一个草稿。"}
              </p>
              {list.length > 0 && (
                <button
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  清除筛选
                </button>
              )}
            </div>
          )}
        </section>
        <footer className="home-footer">
          <span>每一个好故事，始于下一帧。</span>
          <span>CUEFRAME STUDIO</span>
        </footer>
      </main>
    </div>
  );
}
