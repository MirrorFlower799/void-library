# 书库阅读器重构：代码审查、实现与验证

日期：2026-10-12。范围限定在书库及资料集复用的阅读器、书籍 HTTP 服务、压缩包图片读取；**不更改存储字段、书库数据、按钮功能、文件格式或 Electron IPC 对外接口**。

## 一、审查结论

| 严重度 | 已发现的问题 | 源码位置 | 处置 |
| --- | --- | --- | --- |
| 高 | ZIP/CBZ 每次读取漫画页面都 `readFile(整个压缩包) → 解压所有条目`；目录打开和提取封面也如此，成本随整本漫画增长 | `app/lib/protocols.js`、`art-reader.js` | 已修复：新增 `zip-index.js`，仅解析中央目录、按需读取和解压单页；索引有容量限制及文件变更失效机制 |
| 高 | 非 PDF 电子书打开时完整 `fetch → blob → File` 后才能解析；电子书越大，等待和瞬时内存越多 | `app/book/viewer.html` | 已修复：所有支持的书籍用分块 HTTP Range File-like 源；原 `PDF.js` 按需读取保留 |
| 高 | EPUB 修复每次对所有压缩条目完整解压，即使 XML 完全合法 | `app/lib/epub-repair-worker.js` | 已修复：只随机访问和检查 XML 条目；无须修复直接读取原始文件，保留原有错误 XML 的修复流程 |
| 高 | 修复后的 EPUB 超过缓存限额时，下一个 Range 请求可能再次整本修复 | `app/lib/epub-repair.js` | 已修复：超过 64 MiB 的修复结果由 worker 写入临时文件，后续请求按同一字节版本读取，缓存逐出延迟清理；进程退出尝试清理临时文件 |
| 中 | iframe 打开后，先默认初始化再收字体、翻页布局、断点信息，可能触发重复布局且写入临时的错误进度 | `app/book/viewer.html`、`app/src/renderer.js` | 已修复：`ready → configure → init → opened` 握手；初次布局前恢复配置与 CFI；`opened` 前不持久化初始 relocate |
| 中 | 大 TXT 一次性构建全部节点，会阻塞界面操作 | `app/src/renderer.js` | 已缓解：每帧分批追加，保留完整文本节点、选择、原生滚动和现有字体主题设置；支持关闭或切换时中止 |
| 中 | PDF 离线 CSS/字体/CMap、画布容量及缩放取消是性能和兼容风险 | `app/book/vendor/foliate-js/pdf.js` | 保留现有本地 PDF.js 5.5.207 资源、按需读取、可见页绘制、画布像素上限、渲染任务取消和 URL 缓存上限；本轮没有冒险跨版本替换内核 |
| 中 | ZIP 库的 Web Worker 被关闭，解压仍可能影响渲染线程 | `app/book/vendor/foliate-js/view.js` | 本次未擅自启用：现有打包未包含其对应版本的 worker 脚本，直接修改开关会造成解压失败。后续可在真实 Electron 上配置并验证同版本 worker |

## 二、设计与兼容性

- 原本的 Foliate 阅读器继续负责 EPUB、MOBI、FB2 等格式；PDF 仍由 PDF.js 渲染；TXT、目录、主题、翻页、字号、图集与阅读时长维持原有 UI。
- `remote-file.mjs` 的读缓存容量仍为 8 × 256 KiB，请求会合并同分块的并发读取，页面销毁时取消请求。ZIP 格式由 foliate-js 的 `BlobReader` 接受这个带 `size`、`slice()`、`arrayBuffer()` 的类文件对象，不再为了中央目录先加载整本。
- `zip-index.js` 每次只读取尾部 EOCD 和中央目录，按中央目录定位某张图的数据范围。文件大小、修改时间及状态变化时索引自动失效。无须解压当前图片以外的内容；原有 ZIP 源文件及 `media://` URL 结构不变。
- `epub-repair-worker.js` 的健康 EPUB 返回 `null` 表示直接从磁盘流式读取；存在未转义 `&` 的书仍输出修复后的完整 EPUB，并在缓存期保证 HEAD、Range 和普通 GET 返回同一内容版本；大修复结果用临时文件承载。
- 阅读器持久化接口仍为 `{ fraction, cfi, label }`，书库 JSON 格式不变。父窗口只接受当前 iframe 发送的消息；创建新阅读器后旧 iframe 消息会被忽略。

## 三、测试和基准

执行命令：

```bash
npm run check
npm test
node scripts/benchmark-comic.cjs
node scripts/benchmark-reader.cjs
npm run build
```

本环境 Node.js 22.16.0 的观测值，仅作为重复运行的参考，不代表所有设备的通用提升率：

- 40 页、约 20 MiB 的本地未压缩漫画 ZIP，读取第 20 页，5 次中位数：原来读取全 ZIP **15.98 ms**，改为单页随机读取 **1.53 ms**。这是相同数据两条代码路径的局部基准；不包含显示、图像解码或 Electron 内存统计。
- 48 MiB 的带非法 XML 的 EPUB，通过 localhost 修复后传输：请求耗时约 **418 ms**、主事件循环最大采样延迟约 **28 ms**（10 ms 采样器）。XML 需要修复时仍需完整重建，不能以此保证所有大书秒开。
- JavaScript 语法检查通过；Node 端回归、ZIP 测试和 `test-renderer.js` 界面回归通过；`dist/app.asar` 中每个已打包应用文件与源码逐字节校验通过。完整测试和打包在交付前又执行了一次。

## 四、残余风险与建议的人工验收

由于当前运行环境没有 Windows 图形桌面，本次无法完成真实 Electron GUI 下的 20 次开关书、多本连续切换以及用户真实大型 EPUB/PDF 渲染 FPS/内存采样。Windows 便携包已由原始上传包的同版 Electron 运行时组装，但未宣称已在 Windows 实机启动验收。

1. 用真实的大 EPUB、MOBI、FB2、文字 PDF、扫描 PDF、1000 页 CBZ/ZIP、数十 MiB TXT 测试冷启动、快速翻页、目录跳转、缩放和阅读位置恢复。
2. Windows 上检查高 DPI PDF 缩放、复杂 PDF 字体、不同 EPUB 编码、断网状态下的资源是否全部本地加载；压力测试一小时，观察 worker、临时 EPUB、图片内存能否回落。
3. 旧 ZIP `readZip()` 仍用于备份和导入模块；这些属于阅读器以外的流程，未改动。
4. PDF 内核本身针对少数超复杂矢量页面仍可能耗时；若有卡顿书籍样本，再按真实 Profile 优化 PDF.js 页渲染与字体层。

参考实现思路： [Foliate-js 归档文件接口](https://github.com/johnfactotum/foliate-js/blob/main/README.md)、[zip.js 工作线程配置](https://gildas-lormeau.github.io/zip.js/api/interfaces/Configuration.html)、[Mozilla PDF.js](https://mozilla.github.io/pdf.js/)。没有直接复制存在许可不兼容风险的应用代码。
