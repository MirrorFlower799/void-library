# 阅读器内核与性能研究

研究日期：2026-10-12。以下现状依据本轮修改前的源码；建议并不代表已经实现或已经测得性能提升。

## 决策

保留 foliate-js 作为 EPUB/MOBI/AZW3/FB2 内核，优先修复加载、后台工作与生命周期；PDF 保留 PDF.js 并完善集成；TXT 和图集优先调整现有渲染方式。没有证据表明整体换成另一款应用便能解决目前的卡顿。

## 源码证据

- `app/book/viewer.html` 在打开前执行 `fetch → arrayBuffer → new File`，必须等待完整传输；没有利用分段读取。字体、布局消息各自触发渲染，连续输入可造成重复工作。
- `app/book/vendor/foliate-js/view.js` 的 ZIP loader 显式配置 `useWebWorkers: false`；压缩数据处理可能占用阅读器主线程。
- `app/lib/book-server.js` 的 EPUB 路径先全量读取、解压检查 XML，再返回数据；该分支位于 Range 处理之前。缓存没有容量上限。大书打开成本可能来自宿主集成而非排版内核。
- `app/book/vendor/foliate-js/pdf.js` 请求 `text_layer_builder.css`、`annotation_layer_builder.css`、`cmaps/`、`standard_fonts/`，但本地 PDF.js 目录仅有 `pdf.mjs`、`pdf.worker.mjs`。CSS 请求未检查 HTTP 状态；字体缺失会影响依赖这些资源的文档。PDF 页面 URL 缓存没有淘汰或 URL 撤销机制，缩放没有显式取消过期任务。
- `app/src/renderer.js` 的 TXT 阅读器把全文放入一个 `pre`；大文本的布局成本须实测。iframe 配置靠固定 500ms 定时发送，慢启动时存在配置时序风险。

以上属于可复查的代码事实或明确标注的性能假设，尚不能替代用户问题书籍上的采样结果。

## 候选比较

| 项目 | 官方支持与集成特点 | 许可与维护信息 | 建议 |
| --- | --- | --- | --- |
| [foliate-js](https://github.com/johnfactotum/foliate-js) | 纯 JS、多格式，提供 book 接口；PDF 集成被上游标记为实验性；设计允许避免全文件驻留内存 | MIT；仓库含测试和开发记录，未据搜索结果断言具体最新版本 | 保留并修复宿主接入，固定来源提交后再选择性升级 |
| [PDF.js](https://github.com/mozilla/pdf.js) | 专用 PDF 解析/渲染，worker、Range、文字及注释层 | [Apache-2.0](https://github.com/mozilla/pdf.js/blob/master/LICENSE)；有[发布记录](https://github.com/mozilla/pdf.js/releases) | 保留，补齐同版本离线资源；控制渲染与缓存生命周期 |
| [epub.js](https://github.com/futurepress/epub.js/) | EPUB 专用；默认单章节，continuous manager 会填满视口并预加载下一节 | [BSD 两条款](https://github.com/futurepress/epub.js/blob/master/license)；[发布页](https://github.com/futurepress/epub.js/releases)列出 0.3.88，不能据此推断没有后续源码维护 | 可作 EPUB 对照实验，但不覆盖目前多格式能力，没有实测优势前不迁移 |
| [Readest](https://github.com/readest/readest/blob/main/README.md) | 基于 Foliate 思路的完整阅读应用，采用 Next.js/Tauri；不是可直接替换 Electron iframe 的轻量库 | README 声明 AGPL-3.0-or-later | 参考交互与性能设计；整体移植会扩大技术栈和许可范围，不适合作本轮最小修复 |
| [zip.js](https://github.com/gildas-lormeau/zip.js/) | 现有解压链的可用升级点，支持 worker、大数据及流处理 | BSD-3-Clause；当前官方文档覆盖 worker 配置 | 先确认已打包版本的 worker 资源是否自包含，再启用并真实验证 |

## 可执行实施顺序

1. 修复已确认的资源缺失、重复渲染与异步竞态。阅读器使用 ready/opened 握手传递设置；新打开任务取消或忽略旧任务；关闭时销毁 renderer、worker、object URL。
2. 将大文件入口改为按需读取。ZIP 可用 [HttpRangeReader](https://gildas-lormeau.github.io/zip.js/api/classes/HttpRangeReader.html)；本地服务器必须正确处理 HEAD、普通 Range、后缀 Range 与 416。EPUB 修复不可在每次 Range 请求重新全量运行，修复前后字节必须属于同一稳定会话。
3. PDF 按可见页渲染，取消过期缩放任务，限制画布像素和页缓存。Mozilla 明确建议仅保留可见页画布；Range 可令首屏无需等待全文，实际收益取决于文件结构。[官方 FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
4. PDF 主库与 worker 必须严格同版；本地文件标注版本为 5.5.207。若升级，应一起固定主库、worker、CSS、字体、CMap 及需要的解码资源；不能仅替换一个脚本。[官方版本要求](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
5. TXT 按段或视口分批呈现，必须保持全文可阅读、查找、字体设置与位置恢复。图集限制预解码为当前页及少量邻页，避免整本图片常驻。
6. ZIP worker 应验证离线启动、CSP、worker URL 与 fallback；当前官方 [worker 配置](https://gildas-lormeau.github.io/zip.js/)与本地旧版接口可能不同，不能照抄最新参数。

PDF 的 `disableAutoFetch` 不是单独设置即可保证按需读取；官方 API 注明还需禁用 streaming 才能阻止预抓取。采用与否需以首屏耗时和来回翻页流量作权衡。[PDF.js API](https://mozilla.github.io/pdf.js/api/draft/api.js.html)

## PDF.js 5.5.207 资源的确定来源

已读取 [npm 官方 registry 元数据](https://registry.npmjs.org/pdfjs-dist/5.5.207)，版本为 5.5.207、repository 指向 `mozilla/pdf.js`。官方发布包为 [pdfjs-dist-5.5.207.tgz](https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-5.5.207.tgz)，registry 提供的完整性值：

```text
sha512-WMqqw06w1vUt9ZfT0gOFhMf3wHsWhaCrxGrckGs5Cci6ybDW87IvPaOd2pnBwT6BJuP/CzXDZxjFgmSULLdsdw==
```

已下载并检查包目录，确认包含 `cmaps/`、`standard_fonts/`、`wasm/`（含 JBIG2、OpenJPEG、QCMS 及 OpenJPEG JS fallback）。复制目录时一并保留目录内许可证：`cmaps/LICENSE`、`standard_fonts/LICENSE_FOXIT`、`standard_fonts/LICENSE_LIBERATION`、`wasm/LICENSE_*`，以及包根 `LICENSE`。字体等第三方资源不应被统称为 Apache-2.0。

两个缺失 CSS 可从同版本官方源码取得，已确认可以读取：[text_layer_builder.css](https://raw.githubusercontent.com/mozilla/pdf.js/v5.5.207/web/text_layer_builder.css)、[annotation_layer_builder.css](https://raw.githubusercontent.com/mozilla/pdf.js/v5.5.207/web/annotation_layer_builder.css)。保留 Apache-2.0 文件头；本地修改另外记录。上述来源是构建时获取地址，运行时应全部读取打包后的本地资源。

## 验证与不确定性

- 本研究没有运行各候选的同书同机基准，因此不宣称任何替代项目更快，也不承诺具体提升百分比。
- 维护判断只依据本次官方仓库、文档及发布页；部分 GitHub 提交历史获取失败，未使用星数代替维护或质量结论。
- 需要覆盖：大 TXT、含大图 EPUB、扫描 PDF、文字 PDF、CBZ/ZIP 图集；记录冷启动首屏、快速翻页/缩放长任务、峰值内存、关闭后内存与 worker 是否释放。
- 至少验证 20 次开关书、连续快速切换两本、断网启动、字体/主题/目录/进度恢复。全量渲染换成分批策略后，不能丢失文字、页数、目录、选择或原有操作。
- EPUB 中超长单章节、PDF 中复杂矢量或超大扫描页本身仍可能昂贵；这类问题需要具体样本后决定是否做章节级虚拟化或专门渲染调度。
