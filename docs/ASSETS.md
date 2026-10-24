# 关卡素材与生成流程

## 第二关「汪汪表情集」（默认，9 块）

第二关先确定大狗头外轮廓，再切成 9 个较宽、平滑、可辨认的狗头区域，然后用各区域轮廓逐块生成手绘风格素材。狗头特写、侧脸和歪头姿态不要求完整身体；区域仍然共享边界并完整覆盖大轮廓，不靠移动素材或留白解决拼接问题。

- 几何源：`src/contour-geometry.js`。外部轮廓和内部切线先于图片定义，每条共享贝塞尔曲线只存储一次，由相邻拼片反向引用。
- 生图来源：经用户授权的 site-imagegen 自有站点 API，使用当前激活的本机 provider。每个区域以固定轮廓参考图单独调用编辑生成，共 9 张最终源图；另对边牧补足边缘毛色，并对柴犬、边牧调整朝向，避免口鼻被切线裁掉。
- 请求参数：模型 `gpt-image-2.5-sunburst`，质量 `max`，尺寸 1024 × 1024，格式 PNG。9 张最终源图实际尺寸均为 1254 × 1254，记录在 `docs/contour-source-manifest.json`；组装脚本始终按真实尺寸映射坐标。
- 提示词：实际使用的初始提示词及局部修正提示词保存在 `docs/contour-image-prompts/`（`s03-bleed.txt` 补边；`s01-face.txt`、`s03-face.txt` 将口鼻移入安全区域）。轮廓参考限定画布、位置、缩放和比例，要求耳朵对应上方凸起、五官留在宽阔内部、毛色填满区域并延伸到参考图的窄出血带。
- 模型名是向站点请求的名称，不据此推断服务内部的模型映射。项目不保存站点凭据或请求认证信息。

### 准备、生成与组装

`npm run generate:contour -- --prepare` 执行本地准备：`scripts/generate-contour-level.mjs` 输出几何和分区图，再由 `scripts/prepare-contour-art.py` 写出 `work/contour-v2/guides/s01.png` 至 `s09.png` 以及对应提示词。本地脚本不调用图片 API。

随后通过 site-imagegen 对 9 张轮廓参考分别生成素材。例如本机安装位置的单块命令：

```sh
python3 "$HOME/.codex/skills/site-imagegen/scripts/site_imagegen.py" edit \
  --image work/contour-v2/guides/s01.png \
  --prompt-file work/contour-v2/prompts/s01.txt \
  --model gpt-image-2.5-sunburst --quality max --size 1024x1024 \
  --output-format png --out public/assets/contour-source-v2/s01.png
```

其余区域使用各自参考、提示词和同名输出。源图齐备后运行 `npm run generate:contour`，按照固定轮廓创建透明蒙版并组装预览。准备和组装需要 Pillow、NumPy；默认 Python 为 `python3`，可设置 `PAWZZLE_PYTHON=/path/to/python`。

| 文件 | 内容 |
| --- | --- |
| `public/assets/contour-blueprint.svg` | 大狗头外轮廓、9 块内部切线与区域编号 |
| `public/assets/contour-source-v2/s01.png` 至 `s09.png` | 站点生成的原始图片，保留返回尺寸 |
| `public/assets/contour-dogs-v2/s01.png` 至 `s09.png` | 按原定轮廓裁切的透明 PNG 拼片 |
| `public/assets/contour-dogs-v2.png` | 1800 × 1800 的完整组装预览 |
| `public/assets/contour-contact-v2.png` | 1536 × 1536 的独立拼片总览 |
| `src/contour-data.js` | 名称、配色、素材路径与几何数据的映射，`pixelScale: 3` |

所有拼片使用同一个 600 × 600 游戏坐标系；透明 PNG 的尺寸为各自边界框宽、高的 3 倍。源图按实际尺寸和准备阶段的参考坐标映射到边界框，不从图片像素提取轮廓，不自动裁掉背景后重新定位。

源图如果含原生透明边缘，裁切脚本只在窄边带内延伸已有毛色，避免覆盖透明度后露出透明像素的黑色 RGB；超过安全补边范围会报错，不改变五官或切线。拼片透明度由几何区域生成，完整预览使用同一批拼片颜色。组装时归一化共享边的颜色覆盖权重，并应用统一的外轮廓蒙版，避免抗锯齿透明度逐层叠加形成细缝。最终可拖动路径和底板仍来自 SVG 几何；源图改变不了拼片覆盖关系。

新版第二关 ID 为 `dog-expressions-painted-v2`，独立保存进度，不读取此前第二关的拼片状态。第一关素材与存档保留。

## 第一关「汪汪，集合！」（保留，14 块）

第一关保留原有的「先完整插画，再分割轮廓」方案，可从关卡选择器或 `/?level=01` 进入。

- 原画：`public/assets/dog-mosaic.png`。
- 来源：经用户授权的 site-imagegen 自有站点 API（生成时使用本机配置的代理）。
- 请求模型：`gpt-image-2.5-sunburst`；质量：`max`；请求尺寸：1024 × 1024；返回 PNG 实际尺寸：1254 × 1254。
- 原始提示词：`docs/image-prompt.txt`。模型名称是向站点请求的名称，不据此推断服务内部的模型映射。
- 原画包含 14 只紧密嵌合的小狗；`scripts/segment-mosaic.py` 按人工校准的区域分割，内部花纹、眼睛与鼻子保留在对应拼片中。
- 几何数据：`src/mosaic-data.js`；透明裁切素材：`public/assets/pieces/p01.png` 至 `p14.png`。原画、路径、底板和参考图使用 600 × 600 的游戏坐标。

旧切割脚本依赖 Pillow 和 NumPy，人工标记仅适用于原画。第二关生成流程不使用该脚本，也不覆盖第一关素材或存档。
