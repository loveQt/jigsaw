# 第一关素材与切割

- 原画：`public/assets/dog-mosaic.png`
- 来源：经用户授权的 site-imagegen 自有站点 API（当前激活的本机代理）。
- 请求模型：`gpt-image-2.5-sunburst`；质量：`max`；请求尺寸：1024 × 1024；返回 PNG 实际尺寸：1254 × 1254。
- 原始提示词：`docs/image-prompt.txt`。
- 原画实际包含 14 只紧密嵌合的小狗，第一关据此使用 14 块。
- `scripts/segment-mosaic.py` 沿图中实际小狗的外轮廓分割；内部花纹、眼睛与鼻子属于对应小狗，不单独成为拼块。
- `src/mosaic-data.js` 保存真实轮廓、相邻关系与坐标。分割脚本也输出 `public/assets/pieces/p01.png` 至 `p14.png` 的原分辨率透明裁切；页面使用 SVG clipPath 对齐实际边缘；拖动时，轮廓与画面整体一起移动。
- 原画、路径、底板和参考图共用 600 × 600 的游戏坐标。没有在预设几何拼块中嵌入独立的狗头像。
- 模型名称是向站点请求的名称，不据此推断服务内部的模型映射。
