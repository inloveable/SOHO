/* ============================================================
   黛云丝绸 · DAIYUN SILK — 太空中的一抹幻紫丝绸
   - 深黑太空背景 + 星点 + 极淡星云
   - 单条半透明丝带，随“慢风”有机起伏，边缘羽化成“一抹”
   - 缎面幻彩（紫 / 蓝 / 品红之间流转）
   - 主题色随分区切换平滑过渡，但整体克制、不喧宾夺主
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ---------- 主题定义：每个分区一套丝绸幻彩三色 ---------- */
// deep = 暗部, bright = 缎面主光, shift = 幻彩偏移色（制造游移光泽）
const THEMES = [
  { // 序章 — 幻紫（主色）
    deep: new THREE.Color("#2a0a52"), bright: new THREE.Color("#b06bff"), shift: new THREE.Color("#6a5cff"),
    accent: "#b06bff", accentSoft: "#d9b8ff", deepCss: "#0c0716", deep2: "#040208",
  },
  { // 织品 — 靛青
    deep: new THREE.Color("#062b40"), bright: new THREE.Color("#46dcea"), shift: new THREE.Color("#4f7bff"),
    accent: "#46dcea", accentSoft: "#a7f0f7", deepCss: "#06141c", deep2: "#03080c",
  },
  { // 匠艺 — 绯金
    deep: new THREE.Color("#3a0f1c"), bright: new THREE.Color("#ffb06b"), shift: new THREE.Color("#ff5bd0"),
    accent: "#ffb06b", accentSoft: "#ffd2a8", deepCss: "#160a08", deep2: "#0a0404",
  },
  { // 洽谈 — 品红
    deep: new THREE.Color("#36103a"), bright: new THREE.Color("#ff5bb0"), shift: new THREE.Color("#9b6bff"),
    accent: "#ff5bb0", accentSoft: "#ffb3da", deepCss: "#140a14", deep2: "#08040a",
  },
];
const SPACE_BG = new THREE.Color("#030208"); // 太空深黑（带极淡冷紫）

/* ---------- 顶点着色器：慢风丝带 ---------- */
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  varying float vElevation;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  #include <fog_pars_vertex>

  // —— Ashima 3D Simplex Noise ——
  vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // 丝带高度场：缓慢的风波 + 柔软褶皱（时间系数都很小 → 自然、慢）
  float windField(vec2 p, float t){
    float h = 0.0;
    // 沿长度方向缓慢传播的风
    h += sin(p.x * 0.30 - t * 0.45) * 0.55;
    h += sin(p.x * 0.62 + t * 0.30) * 0.20;
    // 竖直方向的轻微鼓荡，让丝带像被托起
    h += sin(p.y * 0.55 + t * 0.25) * 0.28;
    // 有机软褶皱（多octave 噪声，慢速）
    h += snoise(vec3(p * 0.22, t * 0.07)) * 1.05;
    h += snoise(vec3(p * 0.55 + 7.0, t * 0.11)) * 0.42;
    return h;
  }

  void main(){
    vUv = uv;
    vec2 p = position.xy;
    float t = uTime;

    // 端部摆动更大、中部较稳，像被一端牵引的丝绸
    float sway = mix(0.55, 1.25, smoothstep(0.0, 1.0, abs(uv.x - 0.4)));
    float e = windField(p, t) * uAmplitude * sway;

    // 有限差分求法线，使缎面光泽随褶皱流转
    float eps = 0.4;
    float ex = windField(p + vec2(eps, 0.0), t) * uAmplitude * sway;
    float ey = windField(p + vec2(0.0, eps), t) * uAmplitude * sway;
    vec3 tangent   = normalize(vec3(eps, 0.0, ex - e));
    vec3 bitangent = normalize(vec3(0.0, eps, ey - e));
    vec3 nrm = normalize(cross(tangent, bitangent));

    vElevation = e;
    vec3 displaced = position + vec3(0.0, 0.0, e);
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * nrm);
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/* ---------- 片元着色器：半透明缎面幻彩 ---------- */
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColorDeep;
  uniform vec3 uColorBright;
  uniform vec3 uColorShift;
  uniform float uTime;
  uniform float uOpacity;
  varying float vElevation;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  void main(){
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if (!gl_FrontFacing) N = -N;
    vec3 L = normalize(vec3(0.25, 0.7, 0.85)); // 柔和侧逆光

    float diff = max(dot(N, L), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);

    // 缎面高光（收紧的半程高光）
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0);

    // —— 幻彩：随角度与褶皱在 deep→bright→shift 间游移 ——
    float phase = fres * 1.4 + vElevation * 0.25 + uTime * 0.05;
    float m1 = smoothstep(0.0, 0.7, fres + diff * 0.3);
    vec3 col = mix(uColorDeep, uColorBright, m1);
    float m2 = sin(phase * 3.14159) * 0.5 + 0.5; // 周期游移
    col = mix(col, uColorShift, m2 * fres * 0.65);

    // 基础受光 + 高光
    col *= 0.45 + 0.8 * diff;
    col += uColorBright * spec * 1.1;
    col += uColorShift * fres * 0.35;

    // —— 透明度：边缘羽化成“一抹”，亮部更实、暗褶更透 ——
    float edgeX = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
    float edgeY = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
    float mask = edgeX * edgeY;
    float a = mask * clamp(0.18 + diff * 0.45 + spec * 0.7 + fres * 0.5, 0.0, 1.0);
    a *= uOpacity;

    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }
`;

/* ============================================================
   渲染器 / 场景 / 相机
   ============================================================ */
const canvas = document.getElementById("silk-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(SPACE_BG, 1); // 固定清除色，避免 EffectComposer 内部帧缓冲产生透明黑闪
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const T0 = THEMES[0];
scene.background = SPACE_BG.clone();
scene.fog = new THREE.FogExp2(SPACE_BG.clone(), 0.022);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 15);
camera.lookAt(0, 0, 0);

/* ---------- 星点（柔和圆形 + 缓慢漂移/闪烁） ---------- */
function makeStarTexture() {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const starTex = makeStarTexture();

function makeStars(count, spread, size, color, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread - 10;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size, map: starTex, color: new THREE.Color(color),
    transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}
const starsFar = makeStars(900, 90, 0.16, "#cdd3ff", 0.7);
const starsNear = makeStars(220, 60, 0.34, "#e9d8ff", 0.9);
scene.add(starsFar, starsNear);

/* ---------- 极淡星云（衬托幻紫氛围，不抢戏） ---------- */
function makeGlowTexture() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.4, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const nebula = new THREE.Mesh(
  new THREE.PlaneGeometry(48, 30),
  new THREE.MeshBasicMaterial({
    map: makeGlowTexture(), color: T0.bright.clone(),
    transparent: true, opacity: 0.14, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  })
);
nebula.position.set(1, -0.5, -14);
scene.add(nebula);

/* ---------- 丝带 ---------- */
const geometry = new THREE.PlaneGeometry(42, 9, 320, 80);
const uniforms = THREE.UniformsUtils.merge([
  THREE.UniformsLib.fog,
  {
    uTime: { value: 0 },
    uAmplitude: { value: 1.0 },
    uOpacity: { value: 0.92 },
    uColorDeep: { value: T0.deep.clone() },
    uColorBright: { value: T0.bright.clone() },
    uColorShift: { value: T0.shift.clone() },
  },
]);
const material = new THREE.ShaderMaterial({
  vertexShader, fragmentShader, uniforms,
  fog: true, transparent: true, depthWrite: false,
  side: THREE.DoubleSide, blending: THREE.NormalBlending,
});
const silk = new THREE.Mesh(geometry, material);
silk.rotation.set(0.12, 0.55, -0.12); // 斜向横贯，借透视产生纵深
silk.position.set(0.5, -0.2, 0);
silk.renderOrder = 2;
scene.add(silk);

/* ============================================================
   后期：克制的柔焦泛光（只让缎面亮部发光，不washout）
   ============================================================ */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
renderPass.clearColor = SPACE_BG;
renderPass.clearAlpha = 1;
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength（克制）
  0.7,  // radius（柔）
  0.2   // threshold（仅高光发光）
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ============================================================
   主题过渡：目标色与当前色逐帧插值
   ============================================================ */
const target = { deep: T0.deep.clone(), bright: T0.bright.clone(), shift: T0.shift.clone() };

function applyTheme(index) {
  const th = THEMES[index];
  target.deep.copy(th.deep);
  target.bright.copy(th.bright);
  target.shift.copy(th.shift);
  const root = document.documentElement.style;
  root.setProperty("--accent", th.accent);
  root.setProperty("--accent-soft", th.accentSoft);
  root.setProperty("--deep", th.deepCss);
  root.setProperty("--deep-2", th.deep2);
}

/* ============================================================
   分区切换逻辑
   ============================================================ */
const panels = [...document.querySelectorAll(".panel")];
const navButtons = [...document.querySelectorAll("[data-go]")];
const dotButtons = [...document.querySelectorAll(".dots button")];
const topButtons = [...document.querySelectorAll(".topnav button")];
const hintCur = document.getElementById("hint-cur");
const TOTAL = panels.length;

let current = 0;
let locked = false;

function goTo(index) {
  index = (index + TOTAL) % TOTAL;
  if (index === current || locked) return;
  locked = true;

  panels[current].classList.remove("is-active");
  panels[index].classList.add("is-active");
  dotButtons.forEach((b, i) => b.classList.toggle("is-active", i === index));
  topButtons.forEach((b, i) => b.classList.toggle("is-active", i === index));

  current = index;
  if (hintCur) hintCur.textContent = String(index + 1).padStart(2, "0");
  applyTheme(index);

  windGust = 0.5; // 切换时来一阵更明显的“风”
  setTimeout(() => { locked = false; }, 850);
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", (e) => { e.preventDefault(); goTo(parseInt(btn.dataset.go, 10)); });
});

let wheelCooldown = 0;
window.addEventListener("wheel", (e) => {
  const now = performance.now();
  if (now < wheelCooldown) return;
  if (Math.abs(e.deltaY) < 18) return;
  wheelCooldown = now + 900;
  goTo(current + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

let touchY = null, touchX = null;
window.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; }, { passive: true });
window.addEventListener("touchend", (e) => {
  if (touchY === null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) goTo(current + (dy < 0 ? 1 : -1));
  else if (Math.abs(dx) > 50) goTo(current + (dx < 0 ? 1 : -1));
  touchY = touchX = null;
}, { passive: true });

window.addEventListener("keydown", (e) => {
  if (["ArrowDown", "ArrowRight", "PageDown"].includes(e.key)) goTo(current + 1);
  if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) goTo(current - 1);
});

/* ============================================================
   鼠标视差（轻微，营造空间纵深）
   ============================================================ */
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener("pointermove", (e) => {
  pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
  pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
});

/* ============================================================
   渲染循环
   ============================================================ */
const clock = new THREE.Clock();
let windGust = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = (uniforms.uTime.value += dt);

  // 风阵衰减
  windGust *= 0.985;
  uniforms.uAmplitude.value = 1.0 + windGust;

  // 颜色平滑插值
  uniforms.uColorDeep.value.lerp(target.deep, 0.045);
  uniforms.uColorBright.value.lerp(target.bright, 0.045);
  uniforms.uColorShift.value.lerp(target.shift, 0.045);
  nebula.material.color.lerp(target.bright, 0.045);
  // 同步清除色与场景背景，保证 EffectComposer 不露底
  scene.background.lerp(SPACE_BG, 0.12);
  renderer.setClearColor(scene.background, 1);

  // 丝带在空间中缓慢漂浮、轻摆
  silk.position.y = -0.2 + Math.sin(t * 0.18) * 0.4;
  silk.position.x = 0.5 + Math.sin(t * 0.11) * 0.3; // 收窄漂移，始终居中偏右
  silk.rotation.z = -0.12 + Math.sin(t * 0.09) * 0.05;
  silk.rotation.y = 0.55 + Math.sin(t * 0.07) * 0.07;

  // 星空缓慢自转，增强空间感
  starsFar.rotation.z += dt * 0.004;
  starsNear.rotation.z -= dt * 0.006;

  // 视差
  pointer.x += (pointer.tx - pointer.x) * 0.04;
  pointer.y += (pointer.ty - pointer.y) * 0.04;
  camera.position.x = pointer.x * 0.9;
  camera.position.y = -pointer.y * 0.6;
  camera.lookAt(0, 0, 0);

  composer.render();
  requestAnimationFrame(tick);
}

/* ============================================================
   自适应
   ============================================================ */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener("resize", onResize);

/* ============================================================
   启动
   ============================================================ */
applyTheme(0);
tick();

const loader = document.getElementById("loader");
window.addEventListener("load", () => { setTimeout(() => loader && loader.classList.add("is-done"), 500); });
setTimeout(() => loader && loader.classList.add("is-done"), 2500);
