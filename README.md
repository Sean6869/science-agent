# 凸透镜探究智能实验平台

面向初中学生的 Web 实验应用：左侧直接嵌入 PhET 中文“几何光学”实验，右侧提供六阶段探究引导与对话式智能学伴“小科”。

当前已包含一个轻量 Web 应用骨架：左侧嵌入 PhET 实验，右侧提供六阶段进度、阶段开场白和对话式智能学伴“小科”。

## 本地运行

```bash
npm run dev
```

默认访问地址：

- http://127.0.0.1:4173

运行检查：

```bash
npm run check
```

## 环境变量

参考 [.env.example](.env.example)。服务启动时会尝试读取本地 `.env.local`，该文件已被 Git 忽略；生产环境建议通过部署平台或进程管理器注入环境变量。

- `PORT`：服务端口，默认 `4173`。
- `PUBLIC_PHET_GEOMETRIC_OPTICS_URL`：公开的 PhET iframe 地址，不是密钥。
- `DEEPSEEK_API_KEY`：DeepSeek API key，只在 `server.mjs` 中读取，不下发浏览器。
- `DEEPSEEK_MODEL`：DeepSeek 模型，默认 `deepseek-flash`（V4.1 Flash），也支持 `deepseek-v4-pro`。
- `DEEPSEEK_THINKING`：`disabled`（默认）或 `enabled`。课堂短反馈默认关闭思考模式。
- `DEEPSEEK_REASONING_EFFORT`：开启思考时使用 `low`（默认）、`high` 或 `max`。

接入按 [2026-09-10 更新日志](https://api-docs.deepseek.com/zh-cn/updates/)及[思考模式文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)调整，继续使用 Chat Completions 接口。旧模型名自动迁移到 `deepseek-flash`；旧 `deepseek-reasoner` 在未明确设置模式时保留思考模式。非思考模式最多输出 700 token、超时 25 秒；思考模式使用 8192 token、超时 60 秒，浏览器等待上限 65 秒。只展示完整的最终回答，不展示推理内容；截断、空回答或接口故障均返回明确的自查提示。旧的 `AGENT_API_URL` / `AGENT_API_KEY` 未被实现，已从配置模板移除。

本地配置示例：

```bash
cp .env.example .env.local
# 然后只在 .env.local 中填写 DEEPSEEK_API_KEY
npm run dev
```

## 设计交付物

- [产品需求文档](docs/PRD.md)：目标、范围、功能、验收、数据与迭代路线。
- [前端设计说明](docs/FRONTEND_DESIGN.md)：页面结构、组件、状态、交互、响应式与工程建议。
- [Agent 提示词规范](docs/AGENT_PROMPTS.md)：元认知自评协议、分环节量规、三次提交上限与回复约束。

## 输入材料与实验来源

右侧结构和整体布局参考用户提供的 HTML 文件：

- [/Users/gresonkwan/Downloads/deepseek_html_20260527_520198.html](/Users/gresonkwan/Downloads/deepseek_html_20260527_520198.html)

左侧实验不基于该 HTML 编写或拆分，直接嵌入 PhET 第三方页面：

- 用户提供的资源入口：[PhET 中文模拟平台](https://phet.colorado.edu/zh_CN/)
- 默认嵌入的实验：[几何光学（中文透镜屏幕）](https://phet.colorado.edu/sims/html/geometric-optics/latest/geometric-optics_zh_CN.html?screens=1)

课堂页面直接加载“几何光学”的透镜屏幕，跳过平台首页和实验检索步骤；页面右上角仍保留“新页面打开”作为嵌入失败时的恢复入口。

## 已确定的产品方向

- 面向学生的文案使用“试验者/小组信息”，不沿用原型中的“教师填写小组信息”。
- 第 1、2、3、5、6 环节使用分维度星级量规反馈；第 4 环节继续采用页面内小组自评，不调用智能体评分。
- 每环节最多评价三次正式内容提交，学生回答星级自评问题不计次数。
- Agent 由后端代理调用模型服务，前端不存放 API 密钥。
- PhET 为跨域第三方页面；MVP 不假定可以自动读取其操作状态。Agent 根据学生在对话中报告的观察和数据进行引导。

## 后续实现建议

当前实现刻意保持零前端构建依赖，方便迁移到任意 Node 运行环境。DeepSeek 已通过服务端适配层接入；未配置 `DEEPSEEK_API_KEY` 时会自动使用本地规则兜底。

六个阶段的固定开场白使用随应用部署的“小晓”自然女声 MP3。浏览器直接播放 `/public/audio/stage-1.mp3` 至 `stage-6.mp3`，因此不会因操作系统或浏览器内置语音不同而改变音色，也不会在课堂播放时调用外部语音服务。

六个阶段各有独立倒计时，默认 5 分钟。教师可在阶段进度条下方展开设置栏，将每个环节设为 1 至 60 分钟；切换环节会暂停上一环节并启动当前环节，最后 1 分钟以铃声和醒目状态提醒。
