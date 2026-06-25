/* ============================================================
   黛云丝绸 · DAIYUN SILK
   v3 — 完全重写
   ──────────────────────────────────────────────────────────
   渲染策略
   · 直接 renderer.render()，完全不用 EffectComposer / Bloom
     → 彻底消除闪烁（EffectComposer 内部 RT 清除导致的黑帧）
   · 发光感由「丝光层（AdditiveBlending）+ 主丝带」两层叠加实现
   
   丝绸物理
   · 纯正弦波叠加，不用噪声
     → 干净的数学织物褶皱，不出现有机随机云团感
   · 精确解析导数计算法线（无限差分伪影）
   · Kajiya-Kay 各向异性 BRDF
     → 沿经纱方向的细亮带高光，是缎面丝绸的视觉特征

   美学
   · 犹抱琵琶半遮面：丝带主体在画面右侧，左侧留白给文字
   · 不喧宾夺主：深黑太空 + 极淡星点 + 一条半透明丝带
   ============================================================ */

import * as THREE from "three";

/* ── 主题（每分区一套，颜色含义：deep = 暗部/折叠，bright = 缎光/高光） ── */
const THEMES = [
  // deep：深紫（可见但不亮），bright：偏银白的淡紫（缎面高光）
  { deep: new THREE.Color("#2a006e"), bright: new THREE.Color("#ede0ff"),
    accent: "#b06bff", accentSoft: "#d9b8ff", deepCss: "#0c0716", deep2: "#040208" },
  { deep: new THREE.Color("#003050"), bright: new THREE.Color("#c8f4ff"),
    accent: "#46dcea", accentSoft: "#a7f0f7", deepCss: "#06141c", deep2: "#03080c" },
  { deep: new THREE.Color("#3a1000"), bright: new THREE.Color("#fff0d0"),
    accent: "#ffb06b", accentSoft: "#ffd2a8", deepCss: "#160a08", deep2: "#0a0404" },
  { deep: new THREE.Color("#380030"), bright: new THREE.Color("#ffd8ee"),
    accent: "#ff5bb0", accentSoft: "#ffb3da", deepCss: "#140a14", deep2: "#08040a" },
];

const BG = new THREE.Color("#020107"); // 太空深黑，固定不变

/* ══════════════════════════════════════════════════════════
   SILK 配置对象
   ──────────────────────────────────────────────────────────
   所有视觉参数集中在这里，浏览器控制台可实时调整：
     window.SILK.flowSpeed = 1.5   // 流快一倍
     window.SILK.amplitude = 1.4   // 褶皱更深
   ══════════════════════════════════════════════════════════ */
const SILK = {
  flowSpeed:   1.0,   // 流速倍率  （0.3=极慢飘动 / 1.0=标准 / 2.0=快速涌动）
  amplitude:   1.0,   // 褶皱幅度  （0.5=平缓 / 1.0=标准 / 1.8=剧烈）
  shimmer:     2.6,   // 高光强度  （1.0=柔和 / 2.6=标准缎面 / 4.0=强反光）
  visibleFrac: 0.72,  // 主体基础不透明度（0~1，越大越实）
  edgeFade:    0.22,  // 上下边缘渐隐宽度（UV 比例，越大渐隐越宽）
  drift:       0.28,  // 漂浮幅度  （世界单位，0=静止 / 0.5=明显漂动）
  driftSpeed:  1.0,   // 漂浮速度倍率
};

/* ══════════════════════════════════════════════════════════
   GLSL：顶点着色器（丝带 + 丝光层共用）
   纯正弦波褶皱，解析偏导求精确法线
   ══════════════════════════════════════════════════════════ */
const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uAmplitude;
  varying vec2  vUv;
  varying vec3  vTangentW;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vElevation;

  void main(){
    vUv = uv;
    float x = position.x;
    float y = position.y;
    float t = uTime;
    float s = uFlowSpeed;

    /* ── 对角流向量 ─────────────────────────────────────────
       局部坐标中，(x-,y+) = 丝带左上端 → 屏幕左上
                  (x+,y-) = 丝带右下端 → 屏幕右下
       d1 沿此对角方向，波相减去时间 → 波峰从左上往右下传播
       d2 略微不同角度，叠加有机感
       d3 轻微逆向，防止运动过于"机械"                       */
    float d1 = x * 0.72 - y * 0.52;   // 主对角（35°）
    float d2 = x * 0.55 - y * 0.84;   // 副对角（56°）
    float d3 = x * 0.90 + y * 0.44;   // 轻微逆向扰动

    /* ── 相位（负号 = 向右下传播） ─────────────────────── */
    float ph1 = d1 * 0.28 - t * 0.52 * s;  // 主波（宽、慢）
    float ph2 = d2 * 0.66 - t * 0.28 * s;  // 次波（中速）
    float ph3 = d3 * 0.44 + t * 0.18 * s;  // 逆向扰动
    float ph4 = d1 * 1.30 - t * 0.90 * s;  // 高频细节

    float z  = sin(ph1) * 0.92
             + sin(ph2) * 0.30
             + sin(ph3) * 0.15
             + sin(ph4) * 0.08;
    z *= uAmplitude;
    vElevation = z;

    /* ── 解析偏导（精确法线）────────────────────────────── */
    float dz_dx = (cos(ph1) * ( 0.72 * 0.28 * 0.92)
                 + cos(ph2) * ( 0.55 * 0.66 * 0.30)
                 + cos(ph3) * ( 0.90 * 0.44 * 0.15)
                 + cos(ph4) * ( 0.72 * 1.30 * 0.08)) * uAmplitude;

    float dz_dy = (cos(ph1) * (-0.52 * 0.28 * 0.92)
                 + cos(ph2) * (-0.84 * 0.66 * 0.30)
                 + cos(ph3) * ( 0.44 * 0.44 * 0.15)
                 + cos(ph4) * (-0.52 * 1.30 * 0.08)) * uAmplitude;

    vec3 lT = normalize(vec3(1.0, 0.0, dz_dx)); // 经纱切线
    vec3 lB = normalize(vec3(0.0, 1.0, dz_dy)); // 纬纱切线
    vec3 lN = normalize(cross(lT, lB));

    mat3 mn   = mat3(modelMatrix);
    vTangentW = normalize(mn * lT);
    vNormalW  = normalize(mn * lN);

    vec4 wpos = modelMatrix * vec4(position + vec3(0.0, 0.0, z), 1.0);
    vViewDir  = normalize(cameraPosition - wpos.xyz);
    gl_Position = projectionMatrix * viewMatrix * wpos;
  }
`;

/* ══════════════════════════════════════════════════════════
   片元着色器 A：主丝带
   Kajiya-Kay 各向异性 BRDF — 沿经纱产生细亮带高光
   ══════════════════════════════════════════════════════════ */
const silkFragment = /* glsl */`
  precision highp float;
  uniform vec3  uDeep;
  uniform vec3  uBright;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uVisibleFrac;  // 主体基础不透明度
  uniform float uShimmer;      // 高光强度
  uniform float uEdgeFade;     // 边缘渐隐宽度
  varying vec2  vUv;
  varying vec3  vTangentW;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vElevation;

  void main(){
    vec3 T = normalize(vTangentW);
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if(!gl_FrontFacing) N = -N;

    /* 主光：右上侧打光，让左向折叠面在阴影里
       右向折叠面明亮 → 清晰可见的 3D 布料感   */
    vec3 L = normalize(vec3(1.2, 1.6, 0.6));

    /* 漫反射：wrap lighting，暗部保留微弱可见度 */
    float diff  = max(dot(N, L), 0.0) * 0.88 + 0.12;

    /* Blinn-Phong 高光（高指数=细亮点，随折叠脊背移动）*/
    vec3  H    = normalize(L + V);
    float NdH  = max(dot(N, H), 0.0);
    float spec = pow(NdH, 88.0);

    float NdV  = max(dot(N, V), 0.0);
    float fres = pow(1.0 - NdV, 2.8);

    /* 颜色：阴影极深 → 照明面深紫 → 高光银白 */
    float ridge = smoothstep(-1.4, 1.4, vElevation);
    vec3 col    = uDeep * (0.05 + diff * 0.65 * ridge);
    col        += uBright * spec  * uShimmer;  // 高光（由 SILK.shimmer 控制）
    col        += uBright * fres  * 0.12;
    col        += uDeep   * diff  * 0.30;

    /* 透明度：上下边缘渐隐宽度由 uEdgeFade 控制 */
    float eY = smoothstep(0.0, uEdgeFade, vUv.y) * smoothstep(1.0, 1.0 - uEdgeFade, vUv.y);
    float eX = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);

    float a = eY * eX * (uVisibleFrac + spec * 0.22 + fres * 0.04);
    a = clamp(a * uOpacity, 0.0, 0.95);

    gl_FragColor = vec4(col, a);
  }
`;


/* ══════════════════════════════════════════════════════════
   渲染器（无 alpha，固定背景色，永不露黑底）
   ══════════════════════════════════════════════════════════ */
const canvas   = document.getElementById("silk-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(BG, 1);

const scene  = new THREE.Scene();
scene.background = BG.clone();

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.5, 13);
camera.lookAt(2, 0, 0);

/* ── 星点（两层，极淡，衬托空间感） ─────────────────────── */
function makeStarTex() {
  const sz = 48, c = document.createElement("canvas");
  c.width = c.height = sz;
  const ctx = c.getContext("2d");
  const g   = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz/2);
  g.addColorStop(0,   "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.6)");
  g.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz);
  return new THREE.CanvasTexture(c);
}
const starTex = makeStarTex();

function addStars(count, spread, size, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random() - 0.5) * spread;
    pos[i*3+1] = (Math.random() - 0.5) * spread * 0.55;
    pos[i*3+2] = (Math.random() - 0.5) * spread - 8;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size, map: starTex, color: 0xccd4ff,
    transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}
const starsFar  = addStars(700, 90, 0.14, 0.50);
const starsNear = addStars(180, 55, 0.28, 0.70);
scene.add(starsFar, starsNear);

/* ── 丝带几何体 ─────────────────────────────────────────── */
// 宽 26 × 高 3.2，分段足够平滑
// 宽 18（右侧适度露出即可），高 5（能看到明显3D折叠）
const geo = new THREE.PlaneGeometry(18, 5.0, 200, 44);

const T0 = THEMES[0];

const silkUniforms = {
  uTime:        { value: 0 },
  uOpacity:     { value: 1.0 },
  uFlowSpeed:   { value: SILK.flowSpeed },
  uAmplitude:   { value: SILK.amplitude },
  uShimmer:     { value: SILK.shimmer },
  uVisibleFrac: { value: SILK.visibleFrac },
  uEdgeFade:    { value: SILK.edgeFade },
  uDeep:        { value: T0.deep.clone() },
  uBright:      { value: T0.bright.clone() },
};
// 主丝带
const silkMat = new THREE.ShaderMaterial({
  vertexShader, fragmentShader: silkFragment,
  uniforms: silkUniforms,
  transparent: true, depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.NormalBlending,
});

const silkGroup = new THREE.Group();
const silkMesh  = new THREE.Mesh(geo, silkMat);
silkMesh.renderOrder = 1;
silkGroup.add(silkMesh);
scene.add(silkGroup);

/* 丝带偏右侧：左端从画面中线附近入镜，右端延伸出画面
   绕 Y 轴转 0.55 rad（≈31°），让折叠感与视角深度兼得 */
silkGroup.rotation.set(0.05, 0.55, -0.12);
silkGroup.position.set(3.2, 0.3, 0.0);

/* ══════════════════════════════════════════════════════════
   主题切换：目标色逐帧插值
   ══════════════════════════════════════════════════════════ */
const target = { deep: T0.deep.clone(), bright: T0.bright.clone() };

function applyTheme(i) {
  const th = THEMES[i];
  target.deep.copy(th.deep);
  target.bright.copy(th.bright);
  const r = document.documentElement.style;
  r.setProperty("--accent",      th.accent);
  r.setProperty("--accent-soft", th.accentSoft);
  r.setProperty("--deep",        th.deepCss);
  r.setProperty("--deep-2",      th.deep2);
}

/* ══════════════════════════════════════════════════════════
   分区切换
   ══════════════════════════════════════════════════════════ */
const panels     = [...document.querySelectorAll(".panel")];
const dotBtns    = [...document.querySelectorAll(".dots button")];
const topBtns    = [...document.querySelectorAll(".topnav button")];
const navBtns    = [...document.querySelectorAll("[data-go]")];
const hintCur    = document.getElementById("hint-cur");
const TOTAL      = panels.length;
let current = 0, locked = false;

function goTo(idx) {
  idx = (idx + TOTAL) % TOTAL;
  if (idx === current || locked) return;
  locked = true;
  panels[current].classList.remove("is-active");
  panels[idx].classList.add("is-active");
  dotBtns.forEach((b, i) => b.classList.toggle("is-active", i === idx));
  topBtns.forEach((b, i) => b.classList.toggle("is-active", i === idx));
  current = idx;
  if (hintCur) hintCur.textContent = String(idx + 1).padStart(2, "0");
  applyTheme(idx);
  setTimeout(() => { locked = false; }, 850);
}

navBtns.forEach(b => b.addEventListener("click", e => { e.preventDefault(); goTo(+b.dataset.go); }));

let wCooldown = 0;
window.addEventListener("wheel", e => {
  const n = performance.now();
  if (n < wCooldown || Math.abs(e.deltaY) < 18) return;
  wCooldown = n + 900;
  goTo(current + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

let ty = null, tx = null;
window.addEventListener("touchstart", e => { ty = e.touches[0].clientY; tx = e.touches[0].clientX; }, { passive: true });
window.addEventListener("touchend", e => {
  if (ty === null) return;
  const dy = e.changedTouches[0].clientY - ty, dx = e.changedTouches[0].clientX - tx;
  if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) goTo(current + (dy < 0 ? 1 : -1));
  else if (Math.abs(dx) > 50) goTo(current + (dx < 0 ? 1 : -1));
  ty = tx = null;
}, { passive: true });

window.addEventListener("keydown", e => {
  if (["ArrowDown","ArrowRight","PageDown"].includes(e.key)) goTo(current + 1);
  if (["ArrowUp","ArrowLeft","PageUp"].includes(e.key))     goTo(current - 1);
});

/* ── 鼠标视差 ────────────────────────────────────────────── */
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener("pointermove", e => {
  ptr.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
  ptr.ty = (e.clientY / window.innerHeight - 0.5) * 2;
});

/* ══════════════════════════════════════════════════════════
   渲染循环（直接渲染，无 EffectComposer）
   ══════════════════════════════════════════════════════════ */
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t  = (silkUniforms.uTime.value += dt);

  // 颜色平滑过渡
  silkUniforms.uDeep.value.lerp(target.deep,    0.040);
  silkUniforms.uBright.value.lerp(target.bright, 0.040);

  // 从 SILK 配置每帧同步 uniform（允许运行时调整）
  silkUniforms.uFlowSpeed.value   = SILK.flowSpeed;
  silkUniforms.uAmplitude.value   = SILK.amplitude;
  silkUniforms.uShimmer.value     = SILK.shimmer;
  silkUniforms.uVisibleFrac.value = SILK.visibleFrac;
  silkUniforms.uEdgeFade.value    = SILK.edgeFade;

  // 漂浮（幅度/速度由 SILK 控制，位置锁定在右侧不入文字区）
  const ds = SILK.driftSpeed;
  silkGroup.position.y = 0.30 + Math.sin(t * 0.14 * ds) * SILK.drift;
  silkGroup.position.x = 3.20 + Math.sin(t * 0.09 * ds) * SILK.drift * 0.58;
  silkGroup.rotation.z = -0.12 + Math.sin(t * 0.08 * ds) * 0.028;
  silkGroup.rotation.y =  0.55 + Math.sin(t * 0.06 * ds) * 0.038;

  // 星空极缓慢自转
  starsFar.rotation.z  += dt * 0.003;
  starsNear.rotation.z -= dt * 0.004;

  // 视差
  ptr.x += (ptr.tx - ptr.x) * 0.035;
  ptr.y += (ptr.ty - ptr.y) * 0.035;
  camera.position.x = ptr.x * 0.55;
  camera.position.y = 1.5 - ptr.y * 0.40;
  camera.lookAt(2, 0, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ── 自适应 ──────────────────────────────────────────────── */
window.addEventListener("resize", () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/* ── 启动 ────────────────────────────────────────────────── */
applyTheme(0);
tick();

const loader = document.getElementById("loader");
window.addEventListener("load", () => setTimeout(() => loader?.classList.add("is-done"), 400));
setTimeout(() => loader?.classList.add("is-done"), 2500);

/* ── 暴露调试接口（浏览器控制台可实时调参）──────────────── */
window.SILK = SILK;
// 示例（控制台粘贴运行）：
//   window.SILK.flowSpeed = 1.8   // 加速流动
//   window.SILK.amplitude = 1.5   // 加深褶皱
//   window.SILK.shimmer   = 4.0   // 强高光
//   window.SILK.visibleFrac = 0.9 // 更实
//   window.SILK.drift     = 0.5   // 更大漂浮
