# Frameboard 已接入的动作契约 v1

## 当前图文动效任务的适用边界

2026-11-16 最新范围是图片、文字与图形。下文的 locomotion、人物接触/支撑与关节条款仅保留兼容旧工程，不构成新影片的人物表演要求。新内容按实际信息使用刚体、停留或确有必要的物体部件；rigid 不等于只有整体平移，仍需落实语义需要的显现、描线、数值或局部变化。

当前库已有 mask、draw、typewriter、text、text-rise、counter、bar、highlight 等。2026-11-16 图文引擎 v1 已接入原生 `node.graphics`：出现/退出、局部强调、图片裁切焦点、同构 SVG 路径形变和文字状态替换。effectSelections 仍仅使用真实库 ID；`graphics` 是原生状态结构，不是新增的 effectId，不能虚构 MorphSVG、Flip 或 SplitText 组件。

统一排版现保留多行 glyph/run 的显现、动态值和渐变；完整行位先固定，隐藏字仍占位。相机字号保护保留，显式强调使用 `graphics.scale`，不再被保护抵消。旧 `frames.scaleX/Y` 对文字的补偿语义保留，迁移时不能把旧字段改名后不检查画面。主体默认持续可见，需要入退场时提供 `subjectWindows`，实际机制/阅读窗口仍须完整可见。不要增加假主体或把文字冒充机制。

当前加载器自动拼接 SKILL.md、本契约与 graphics-motion.md，并将三份内容纳入任务指纹。其余参考仍需按任务实际读取。图文引擎实现、回归与同版样片见 `remotion/examples/graphics-motion-2026-11-16/`；历史诊断和范围见 [图文动效诊断](graphics-engine-plan-2026-11-16.md)。

## 图文状态 v1

`graphics={version:1,pivot:null,tracks:[],reveal:null,morphs:[],textStates:[]}`。轨道各自包含 `channel,frames`，frame 为 `time,value,easing`，覆盖 0 至镜尾、最多 64 点。channel：opacity 0–1、scale .05–10、reveal 0–1、mediaZoom 1–8、focusX/focusY 0–100。pivot 为局部坐标；文字以排版基线 (0,0) 强调。mediaZoom/focus 需要真实媒体，图片裁切保持对象外框稳定，不是相机推进。

reveal 必须与同名轨道配套，结构 `{direction:'right'|'left'|'up'|'down',bounds:{x,y,width,height}}`。边界来自对象局部几何；校验采用实际裁切区域，未露出的部分不能算作覆盖。`subjectWindows=[{from,until,reason}]` 定义主体完整可见的阅读/机制窗口，不能通过极短窗口逃避事件覆盖。

morphs 每项为 `{pathIndex,from,to,frames}`，frames 的 value 是 0–1 进度，实际插值路径坐标。限 M/L/C/Q/Z、相同命令顺序/大小写/参数数量；from 必须等于基础路径。不支持复杂拓扑匹配、弧命令自动转换或照片语义变形；需要时先预制对应矢量或明确用对位替换。多路径可同步变化；当前节点级 morph 证据读第一条轨道，其他路径需与其语义阶段同步，不能声称已独立证明所有路径。绑定整张图片会拒绝覆盖形变路径。

textStates 每项为 `{from,lines}`，按语音事件替换实际文字，1–3 行。与 counter/typewriter/text 不争用同一内容轨道。同一通道只能有明确归属，末态持续的库效果不能靠重复添加来模拟二次进入，改用完整原生轨道或新状态。允许布局运动与显隐、强调分开组合。

信息显现用 explanation intent=reveal，真实文字替换用 replace 或 establish，证据可读取 textValue/textProgress/opacity/reveal。物理、统计及数据机制仍使用 change/compare/result，必须改变实际几何、位置、描线或形变；不能把标签或遮罩进度当作乘法。校验与渲染共用 graphics-state 和 content-visibility，兼顾排版显隐、字素进度与焦点层级。素材、schema、输入指纹和可携工程均保留原生轨道。

## 既有结构与事件字段

2026-11-16 起用于节奏、分镜、图版和动画任务。运行时支持刚性分层/关节；不支持柔性网格。提示词提供的当前 schema 和实际语音为数据依据。

## 节奏要求先于动画证据

节奏输出 `performanceRequirements`：每条动作行对应至少一条，字段为 `id, shotId, actionId, kind, actorId, partIds, cueId, from, until, dependsOn, note`。`from/until` 是镜内秒数。kind 为 rigid、hold、state、articulated、locomotion、contact、hinge。state 必须点名真正改变的图形部件，可用描线、形状或局部变化，不能只靠根位移；articulated 必须点名变化部件。actorId、partIds 使用稳定 ASCII 标识。cueId 必须来自实际语音，不从音乐或估计词点冒充语义锚点。note 写清准备、作用、结果及时间精度；有供应方词级数据时按对应词点编排，未听辨不能声称人工对齐。

`actionId` 与工作台解析动作行后的 ID 对齐；生成节奏时允许填写动作行原文到 `actionId`，接收端将逐字匹配后换成稳定 ID，不接受不存在的动作行。不要将行走或拿取改写成 rigid 来逃避动作要求；能力不足应要求分层图版。仅从文字猜类型不作为硬检查依据，脚本和正常速度审片共同负责语义复核。

## 部件与素材

`motion.actors` 保存主体设计及部件目录；项目保存跨镜 `actorCatalog`，相同 designId/version 的几何、材质、枢轴及结构必须一致。帧姿态可以变化。设计发生修改需增加版本并重新审片。

新生成设计声明 contentType：object、text、person-image 或 person-symbol。按用户偏好，人物只可作为单层 rigid 静态图片/符号，允许淡入淡出；禁止关节、姿态变化、附着和人物视频。不要把人物标成 object 绕过偏好。旧工程仍可读取；旧人物动作测试仅验证底层数学，不是新影片模板。

`node.rig={actorId,partId,parentId,pivot:{x,y}}`。根的 parentId=null。frames.x/y 是枢轴在父坐标中的位置，路径在部件坐标绘制；旋转和缩放围绕 pivot 发生。父子合成保持完整仿射矩阵。节点数组仍决定绘制前后次序，不按父子树自动改变遮挡。根节点应有实际可见几何，例如躯干；不要输出空骨架节点。

只对 replaceable=true 的部件换图。绑定须给 `scope=part,actorId,partId,designVersion` 及该部件局部 box；整人物图不能覆盖关节主体。绑定后重新检查事件。图版须沿用相同 rig 与目录，旧扁平图版与关节结构不兼容时更新图版，不复制整人物轮廓当躯干。

## 事件

`performance={version:1,events:[...]}`。每个事件包含 `requirementId,from,at,until,rootId,partIds,contacts,supports,coverage`。at 是实际作用时刻，位于所引用语音句段；准备可以提前。contacts 的 a/b 都是 `{nodeId,x,y}` 局部点，另有 at/until/tolerance。行走 supports 包含 nodeId/x/y/from/until/groundY/tolerance；支撑时脚底世界位置固定，摆动阶段离地。

道具可给 `attachments:[{parentId,from,until}]`。from 发生接触后保持原世界姿态跟随 parent；until 释放并回到自身轨迹，必须无跳变。附着期间自身姿态轨迹不另叠加，透明度仍可按轨迹求值。不以播放顺序积累变换。

coverage 给 `{nodeId,x,y,width,height,minPixels}`，代表真实局部图形中的观察区域。每个关键部件和接触双方都须列入。检查从事件开始至结束的每一帧；放大手部时可以只选择手的区域，不要求整个角色在画面内。实际浏览器再次测量，拒绝空区域、裁切、过小、字幕区和大型前景遮挡。文字、局部遮挡是否容易理解仍需连续审片。

揭示型图形可为 coverage 指定镜内 `from/until`（默认 null，使用整个事件区间），以区分准备状态和结果的可读区间；关键部件仍须覆盖实际作用时刻。隐藏的图形不会仅凭包围框被算作可见。

cameraShots.eventIds 列此镜头覆盖的 requirementId。reason 写具体观察目的，固定构图合法，没有切镜配额。不同动作可共享镜头；相机和对象不重置时间。

## 有效性与局限

模型接收、最终素材绑定、渲染入口均验证动作契约。保存保留设计目录，输入签名包含动作要求、素材绑定和设计，声音或设计变化使旧验证过期。旧平面影片可读取；新动作任务缺少类型化节奏时先补节奏。

几何门禁不代表表演或艺术质量合格。交付须给同版编辑数据、关键帧、有声预览和 SRT，并记录正常速度连续复看时间码。没有捕获音轨时不得声称听审完成。
