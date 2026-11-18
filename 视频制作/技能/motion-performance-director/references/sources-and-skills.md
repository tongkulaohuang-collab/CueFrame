# 专业来源与技能筛选

## 本轮优先：图片、文字与图形（2026-11-16）

本轮重新读取下列作者原文。没有安装第三方 skill 或运行上游代码，没有观看文档中的演示视频。建议是源码/文档适配判断，不是不同 skill 的成片效果排行榜。

| 推荐 | 实际核对的内容 | 如何用于本工作区 |
|---|---|---|
| **GSAP 官方：gsap-timeline、gsap-plugins** | [时间线 skill 原文](https://github.com/greensock/gsap-skills/blob/main/skills/gsap-timeline/SKILL.md) 支持标签、相对位置与嵌套；[插件 skill 原文](https://github.com/greensock/gsap-skills/blob/main/skills/gsap-plugins/SKILL.md) 覆盖 SplitText、DrawSVG、MorphSVG、Flip 等。 | 最适合作编排与图文能力参考。先以关键事件组织时间，再选择文字分组、路径揭示、形变或布局转换；引入实际运行库需单独核对本地版本和离线帧驱动。 |
| **Remotion 官方：remotion-best-practices** | [官方说明](https://www.remotion.dev/docs/ai/skills)；[当前入口源码](https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/SKILL.md) 为按任务路由的技能，包含 markup、字幕、渲染等入口；本次读取标注 4.0.544。 | 做影片实现与导出基础。当前项目依赖 4.0.484，不默认升级。须核对具体子文档与本机 API，不能把上游新功能当作当前工程已具备。 |
| **Emil Kowalski：choreograph、animate** | [choreograph 原文](https://github.com/emilkowalski/skills/blob/main/skills/choreograph/SKILL.md) 明确多对象的角色、同步/重叠/先后关系，并让次级变化依附关键时刻；[animate 原文](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md) 从目的、属性、曲线到退出。 | 重点借鉴编排决策；用途是 UI，不能把其高频交互限制、固定毫秒预算、仅 transform/opacity 或禁止均匀 stagger 等硬规则原样套到影片。视频依实际语义、声音和可读性判断。 |

如果只选一组外部技能，优先 **GSAP timeline/plugins + Remotion 官方技能**。若要训练“多个东西怎样一起动”的决策，再按需看 choreograph。外部 skill 不会自动扩展 Frameboard 的 schema 或修复其 JSX 分支；本地 skill 负责将方法映射到真实能力。

## 专业设计依据与本地推导

[IBM Animation Overview](https://www.ibm.com/design/language/animation/overview/) 把动效视为传递含义与注意力的方式；[Classic Principles](https://www.ibm.com/design/language/animation/classic-principles/) 明确将动画原则应用于图形形式，强调按顺序引导视线；[Tips and Techniques](https://www.ibm.com/design/language/animation/tips-and-techniques/) 讨论焦点交接及受控运镜。这支持以信息目的决定动作与观察位置，但不要求照搬 IBM 的品牌审美。

本地归纳是：**信息意图 → 可见前后状态 → 素材可控制层 → 实际语音事件 → 通道编排 → 最终状态求值 → 连续观看**。这是一套针对本工程的综合方案，不冒称上述任一来源给出了完整架构。

本次查阅了 [SplitText 文档](https://gsap.com/docs/v3/Plugins/SplitText/) 与 [MorphSVG 文档](https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/) 作为特定能力入口；并未验证这些插件在当前 Frameboard 渲染器中可直接使用。图片换图不能冒称路径形变，安装 skill 也不等于安装或接入插件。

本地 [图文动效语法](graphics-motion.md) 是自行整理的执行指导；[诊断与接入计划](graphics-engine-plan-2026-11-16.md) 给出真实链路缺口和只读复现证据。没有复制第三方引擎代码。若后续复制代码，另记录固定提交、许可证和修改范围。

## 较早一轮研究记录（保留来源，不作为本轮默认方向）

核查日期：2026-11-16。这里是适配判断，不是下载量榜单；外部技能以源码和作者文档为准。本次未安装第三方技能、未运行它们的制作管线。工作区已有的测试结果单独注明。

## 专业方法

Shawn Kelly 的工作方法先明确人物目标，再从动作参考标出姿态和帧号，建立 blocking 后调整时序，最后细化表演。这支持先设计关键动作、再润色曲线的顺序；不是要求每个科普物体都按角色表演处理。[Animation Mentor 原文](https://www.animationmentor.com/blog/5-key-steps-for-effective-blocking/)

Jason Martinsen 的行走教学把接触、下沉、经过等姿态、上身反向运动、手臂跟随与根节点前进分开处理。工作区“人物只有整体位移”的修正，应把内部步态与前进运动协调起来。[行走流程原文](https://www.animationmentor.com/blog/tutorial-animating-human-walk-cycle/)

Rive 的官方骨骼文档将根节点位置、子骨骼相对长度/角度、图形绑定分开。这是“素材需要动作结构”的工程依据；采用这种分层思想并不要求更换现有渲染引擎。[Rive Bones](https://github.com/rive-app/help-center/blob/master/editor/manipulating-shapes/bones/README.md)

GSAP Timeline 提供标签、相对位置和嵌套时间线，避免各处手写独立延迟。可借鉴事件编排方式；影片仍需要把所有状态归到确定性帧时钟。[官方 Timeline 文档](https://gsap.com/docs/v3/GSAP/Timeline/) · [Remotion 帧驱动要求](https://www.remotion.dev/docs/animating-properties#always-animate-using-usecurrentframe)

## 值得采用的技能和资料

| 候选 | 已核内容和适用位置 | 本工作区建议 |
|---|---|---|
| [remotion-dev/skills](https://github.com/remotion-dev/skills) | 官方技能；入口 remotion-best-practices，按 markup、timing、字幕、渲染等主题路由 | 作为 API 与渲染基础。不能替代人物表演设计。当前工程为 4.0.484，本机研究副本标注 4.0.541，本次上游入口为 4.0.544；按实际工程核对接口，暂不盲目升级。 |
| [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | 官方技能；已读 gsap-timeline、gsap-plugins，覆盖编排、路径和形变工具 | 优先学习 timeline 的事件标签与嵌套；需要 GSAP 实现时再选 core/plugins/react。其常规播放循环不能原样塞进 Remotion 的离线逐帧渲染。 |
| [alchaincyf/huashu-art-motion](https://github.com/alchaincyf/huashu-art-motion) | 已读当前 SKILL 1.3.1 与本地 1.2.0 的视频语法；涵盖语义选型、画风约束、镜头目的和交付检查 | 选择性吸收。其强制镜长、标题限制、配色偏好和运动阈值不能覆盖本工作区允许页面形式、紧凑表达和按内容运镜的规则。 |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | 已读 animate、improve-animations；面向交互界面的目的、缓动、连续性及代码审查 | 适合工作台 UI。其交互频次、短时长、transform/opacity 等偏好不适合作为人物和机制影片的通用约束。 |
| [animation-techniques-kit](https://github.com/platan821/animation-techniques-kit) | 已读 METHOD 和 camera-moves，提供参考拆解与 Remotion 技术配方 | 它是资料/组件库，不是标准 SKILL 包。借鉴对照复核方法；不照搬宣传片切镜密度、BGM 驱动节奏或持续微漂。 |
| [remotion-video-director](https://github.com/BayramAnnakov/remotion-video-director) | 本地已读导演入口，关注概念、叙事与审片；本次未验证上游更新 | 可作策划补充；已有制作单与用户偏好足够时不重复询问。无法补出单张人物图片缺失的关节与步态。 |

较合适的组合是：本地对象表演方法负责设计和验收，Remotion 官方技能负责执行正确，GSAP/花叔的相关章节提供有选择的编排参考。没有证据表明“多装几个技能”本身会让现有生成链增加内部动作能力。

## 既有试跑的边界

工作区 2026-11-06 已试跑过多项候选，记录位于 `science-video-audit-2026-11-06/test-results.json`。花叔测试有独立审片推动返修的记录，同时原门禁仍为黄灯；WTT 的素材/时间线锁和四帧绑定有技术验证，但视听验收没有冒填；Director 与官方 Remotion 共用基础机制，不能据此证明 Director 单独优胜。本次引用这些既有记录，没有宣称重新制作或观看了那些样片。

## 采用边界

上面是方法归纳与链接，没有复制第三方引擎或素材。以后复制代码再记录固定提交、许可证、修改范围和可运行证据。技能许可与运行时、模型服务、图片和音乐许可分别核对。

本次专业来源以文章和代码文档为主，没有完整观看来源中的嵌入视频。它们支持方法研究，不构成本期视觉参考视频已分析完毕的记录。
