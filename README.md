# 拼汪 PAWZZLE

一个原生 JavaScript + SVG 的网页异形拼图原型。包含三个关卡，默认打开第三关「汪汪游乐园」：沿用第二关的大狗轮廓和 30 块曲线分区，让狗狗的脸、身体、爪子或毛发直接铺满每块拼片。图片混合摄影质感、写实绘画和少量漫画／像素风，不使用“彩色底板上摆一只小狗”的构图。第二关的 9 块犬形拼图和第一关的 14 块插画拼图均保留。

后续新增关卡或更换美术，请先阅读 [关卡设计与开发交接文档](docs/LEVEL_DESIGN_GUIDE.md)。文档包含关卡设计、共享边界几何、不同风格图片制作、生图接口自主准备、SVG 绘制方案、代码接入与验收要求，供接手开发的 AI 直接执行。

## 启动与构建

游戏运行需要 Node.js 20 或以上，无第三方运行依赖，不需要安装 npm 包。已经生成的素材可直接使用，启动和构建不调用图片 API。

```sh
npm run dev
```

打开终端输出的 `http://127.0.0.1:5187`。端口可通过 `PORT=5174 npm run dev` 修改。页面顶部可切换关卡，也可直接访问 `/?level=01`、`/?level=02` 或 `/?level=03`。

```sh
npm test
npm run build
```

构建产物在 `dist/`，可部署到普通静态网站服务的根目录。浏览器需要通过 HTTP 加载 ES modules，不支持直接以 `file://` 打开。开发服务器仅监听本机。

## 玩法

- 拖动拼片，可在桌面的空白位置自由放下。
- 相邻拼片在正确相对位置靠近时，会吸附成一组；整组仍可移动，可先在底板外拼好再放回。
- 拼片或拼片组靠近底板上的对应位置时自动归位，归位后锁定。
- 工具栏提供暂停、查看原图、计时／自由模式和音效开关。
- 「整理碎片」帮助找回散落的拼片，「帮我一块」放置一个拼片组，重新开始可重置当前关卡。
- 三关分别保存进度，切换后可继续。新增第三关不改变第一、第二关的现有存档键；第三关使用独立存档。清除浏览器网站数据会清除存档。
- 键盘操作：Tab 选择拼片，方向键移动，Shift + 方向键加速，回车吸附；空格暂停，P 查看原图。

## 第三关：满版图片，按轮廓裁切

`src/party-geometry.js` 复用第二关外轮廓，以错落分布的点生成 30 个区域，再为共享边加入不同的曲线。每条边由相邻拼片反向使用，完整覆盖大轮廓；内部不采用规则行列切分。

第三关有 30 张独立生成的不透明满版源图：17 张摄影风格、10 张写实绘画／素描／版画、3 张漫画或像素画。既有脸部与半身，也有蜷卧的身体、胸口、脚掌、卷毛和眼睛等局部。提示词要求狗狗或其局部延伸到画面四角，不留下背景、白边或贴纸底板。

素材方向保存在 `docs/party-art-direction-v2.json`，逐张提示词在 `docs/party-image-prompts-v2/`，原始图片在 `public/assets/party-source-v2/p01.png` 至 `p30.png`。组装时以等比例覆盖方式裁取源图，再应用固定异形蒙版；图片铺满整个区域，不再缩进安全矩形，也不填充彩色衬底。可在方向文件中用 `cropAnchor`、`cropZoom` 调整裁取中心和放大倍率。

```sh
npm run generate:party

# 指定已有 Pillow、NumPy 的 Python 环境
PAWZZLE_PYTHON=/path/to/python npm run generate:party

# 素材生成途中，只输出本地检查图，不替换运行中的关卡
npm run generate:party -- --partial
```

本地组装不调用图片 API，默认使用 `python3`，需要 Pillow、NumPy。输出 30 张 `public/assets/party-dogs-v2/` 透明拼片、1800 × 1800 的 `party-dogs-v2.png` 完整预览和 1800 × 1500 的 `party-contact-v2.png` 总览。真实源图尺寸、裁取坐标和媒介记录在 `docs/party-source-manifest-v2.json`。几何与关卡存档键保持不变，画面版本通过 `artRevision` 和新图片路径标识。

## 第二关：先轮廓，再逐块生图

几何数据决定切割线，图片模型只为固定区域绘制素材。区域采用较大的狗头、侧脸或歪头轮廓，减少狭窄碎片和细小凸起；每条共享曲线只存储一次，相邻拼片反向使用同一条边。素材不会反过来改变区域或制造间隙。

本地准备、裁切和组装需要装有 Pillow、NumPy 的 Python，默认执行 `python3`；可通过 `PAWZZLE_PYTHON` 指定解释器。这些本地步骤不调用图片 API。

```sh
# 输出轮廓分区图、9 张轮廓参考图及逐块提示词
npm run generate:contour -- --prepare

# 可选：指定已有依赖的 Python 环境
PAWZZLE_PYTHON=/path/to/python npm run generate:contour -- --prepare
```

`src/contour-geometry.js` 是外轮廓和内部共享边的源文件。准备阶段由 `scripts/generate-contour-level.mjs` 与 `scripts/prepare-contour-art.py` 输出 `public/assets/contour-blueprint.svg`，并在 `work/contour-v2/guides/`、`work/contour-v2/prompts/` 生成每块的固定轮廓参考和提示词。

图片生成是单独步骤：使用已配置、已授权的 site-imagegen 站点，以每块轮廓参考图进行一次编辑生成。例如在本机技能安装位置生成 `s01`：

```sh
python3 "$HOME/.codex/skills/site-imagegen/scripts/site_imagegen.py" edit \
  --image work/contour-v2/guides/s01.png \
  --prompt-file work/contour-v2/prompts/s01.txt \
  --model gpt-image-2.5-sunburst --quality max --size 1024x1024 \
  --output-format png --out public/assets/contour-source-v2/s01.png
```

其余区域分别使用对应的 `s02` 至 `s09` 参考图和提示词，输出到同名源文件。每张都要检查五官是否完整、头部是否填满轮廓，以及构图是否保持参考的位置和比例。最终提示词保存在 `docs/contour-image-prompts/`；站点配置与凭据由技能读取，不写入项目。

备齐 9 张源图后运行：

```sh
npm run generate:contour
```

组装阶段按原先的 SVG 区域生成透明蒙版，以每画布单位 3 像素（`pixelScale: 3`）输出 `public/assets/contour-dogs-v2/s01.png` 至 `s09.png`。图片坐标按实际源图尺寸归一化，不根据可见内容自动裁边或重定位。由相同拼片组装 1800 × 1800 的 `public/assets/contour-dogs-v2.png` 完整预览，同时输出 1536 × 1536 的 `public/assets/contour-contact-v2.png` 拼片总览和 `src/contour-data.js`。

底板、拖动拼片、透明蒙版和完整预览均使用同一套几何。完整预览合并共享边的覆盖权重，并使用统一外轮廓透明蒙版，避免相邻抗锯齿边叠加产生透明细缝。改变几何后应重新准备轮廓参考，并按新轮廓重新生成相应素材。

第一关仍使用 `public/assets/dog-mosaic.png`、`public/assets/pieces/` 和 `src/mosaic-data.js`。如需重建旧切割数据，可在装有 Pillow、NumPy 的 Python 环境运行 `python scripts/segment-mosaic.py`；其人工校准标记仅适用于该原画。三关素材来源详见 [docs/ASSETS.md](docs/ASSETS.md)。

## 实现结构

| 文件 | 职责 |
| --- | --- |
| `src/main.js` | SVG 渲染、鼠标／触控／键盘交互、计时、弹窗与本地存档 |
| `src/level.js` | 三关注册、默认关卡、URL 选择与独立存档键 |
| `src/puzzle-engine.js` | 不依赖 DOM 的移动、相邻吸附、分组合并、归位、提示与存档校验 |
| `src/packing.js` | 按拼片边界框排列散片，保留间距，不旋转、不缩放 |
| `src/party-geometry.js` | 第三关 30 块曲线分区、共享边、邻接关系和插画安全区域 |
| `src/party-data.js` | 第三关角色名称、姿态、画风、配色与素材路径 |
| `scripts/generate-party-level.mjs`、`scripts/prepare-party-art.py` | 从独立满版源图裁切第三关拼片和预览 |
| `src/contour-geometry.js` | 第二关外轮廓、共享曲线、拼片路径、边界与相邻关系 |
| `scripts/generate-contour-level.mjs` | 输出分区图、调用本地素材处理、生成第二关元数据 |
| `scripts/prepare-contour-art.py` | 准备生图参考和提示词，或按固定轮廓裁切、组装源图 |
| `src/contour-data.js` | 生成的第二关素材与几何映射 |
| `src/mosaic-data.js`、`scripts/segment-mosaic.py` | 第一关的插画分割数据与旧生成脚本 |
| `src/style.css` | 桌面、移动端布局与视觉反馈 |
| `scripts/build.mjs` | 将页面、模块与素材复制成静态发布目录 |

模型中的 `x`、`y` 是应用到原始路径的平移量。同组拼片共享平移量，相邻拼片平移量足够接近即可合并，因此在底板外也能拼接。归位后，平移量统一为底板原点。模型默认吸附阈值为 18 个画布单位，界面使用 20。

## 验证

`npm test` 覆盖拼图模型、三关完成与恢复、存档隔离、桌面／手机散片排列以及第二、第三关共享边和几何覆盖。素材尺寸、透明蒙版、完整预览与浏览器实测结果见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

界面回归可依次验证：切换关卡、场外拼接及整组移动、底板归位、暂停与原图预览、刷新恢复，最后使用帮助完成关卡。

## 当前范围

目前有三个固定关卡，拼片无需旋转或翻面。窄屏将散片排列在底板下方并随页面滚动。存档仅保存在本机浏览器，没有账号或云同步。第二关使用轮廓参考逐块生图，第三关使用独立满版源图与曲线分区裁切；尚未提供可视化出题编辑器或全自动出题能力。
