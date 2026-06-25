# 黛云丝绸 · DAIYUN SILK

一个以 **three.js** 打造的高级真丝品牌着陆页。背景是一片**动态流动、朦胧柔焦的丝绸波浪 3D 场景**，主色为**深紫渐变暗调**，并可在分区间滑动切换主题色——类似 Visual Studio 启动屏，但带有更深的 3D 质感。

## 特性

- **3D 丝绸波浪**：自定义 GLSL 着色器（Simplex 噪声 + 多层正弦波）模拟上下起伏的丝绸光泽，配合菲涅尔丝光描边与缎面高光。
- **柔焦朦胧感**：`EffectComposer` + `UnrealBloom` 泛光 + 指数雾，营造高级胶片光感。
- **动态主题色**：四个分区（序章 / 织品 / 匠艺 / 洽谈），每个分区一套丝绸配色，切换时着色器 uniform 与页面 CSS 变量同步平滑插值过渡。
- **多种交互**：滚轮、触摸滑动、方向键、导航与右侧指示点皆可切换分区；鼠标移动带来轻微视差。
- **零构建**：纯 HTML/CSS/JS，three.js 通过 ESM importmap 从 CDN 加载。

## 本地预览

需要 Node.js（>= 16）。

```bash
npm start
# 然后浏览器打开 http://localhost:8080
```

也可自定义端口：

```bash
PORT=3000 npm start
```

> 任何静态服务器都可托管，例如 `python3 -m http.server 8080`。
> 注意：因使用 ES Module，请通过 HTTP 访问，不要直接 `file://` 打开。

## 文件结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面结构、内容分区、importmap |
| `styles.css` | 排版、暗色渐变、主题变量与过渡动画 |
| `main.js` | three.js 场景、丝绸着色器、主题切换与交互逻辑 |
| `server.js` | 零依赖静态预览服务器 |

## 自定义主题色

在 `main.js` 顶部的 `THEMES` 数组中调整每个分区的 `deep`（暗部基色）、`bright`（丝光高光）、`fog`（雾/背景色）以及对应的页面 CSS 强调色即可。
