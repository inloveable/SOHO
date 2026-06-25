/* ============================================================
   黛云丝绸 · DAIYUN SILK — 3D 丝绸波浪背景
   - 自定义 GLSL 着色器：分层噪声 + 正弦波，营造上下起伏的丝绸光泽
   - 主题色随分区切换平滑过渡（uniform 与 CSS 变量同步插值）
   - 鼠标 / 陀螺仪视差，滚轮 / 滑动 / 方向键切换分区
   - EffectComposer + Bloom 制造柔焦、朦胧的高级光感
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ---------- 主题定义：每个分区一套丝绸配色 ---------- */
// deep = 暗部基色, bright = 丝光高光, css = 页面强调色
const THEMES = [
  { // 序章 — 深紫（主色）
    deep: new THREE.Color("#2a0d52"),
    bright: new THREE.Color("#b06bff"),
    fog: new THREE.Color("#0a0414"),
    accent: "#b06bff", accentSoft: "#d9b8ff", deepCss: "#1a0930", deep2: "#0a0414",
  },
  { // 织品 — 靛青
    deep: new THREE.Color("#06283d"),
    bright: new THREE.Color("#43d9e8"),
    fog: new THREE.Color("#03101a"),
    accent: "#43d9e8", accentSoft: "#a7f0f7", deepCss: "#062430", deep2: "#03101a",
  },
  { // 匠艺 — 绯金
    deep: new THREE.Color("#3a0d1c"),
    bright: new THREE.Color("#ff9b5b"),
    fog: new THREE.Color("#160407"),
    accent: "#ff9b5b", accentSoft: "#ffd2a8", deepCss: "#2a0a12", deep2: "#160407",
  },
  { // 洽谈 — 品红
    deep: new THREE.Color("#3a0d3a"),
    bright: new THREE.Color("#ff5bb0"),
    fog: new THREE.Color("#140414"),
    accent: "#ff5bb0", accentSoft: "#ffb3da", deepCss: "#2a0a26", deep2: "#140414",
  },
];

/* ---------- 顶点着色器 ---------- */
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

  // 丝绸高度场：多层噪声叠加缓慢的正弦推进
  float silk(vec2 p, float t){
    float h = 0.0;
    h += snoise(vec3(p * 0.22, t * 0.10)) * 1.00;
    h += snoise(vec3(p * 0.55 + 11.3, t * 0.16)) * 0.42;
    h += snoise(vec3(p * 1.10 + 4.7, t * 0.22)) * 0.18;
    h += sin(p.x * 0.35 + t * 0.5) * 0.22;
    h += sin(p.y * 0.5 - t * 0.35) * 0.18;
    return h;
  }

  void main(){
    vUv = uv;
    vec2 p = position.xy;
    float t = uTime;
    float e = silk(p, t) * uAmplitude;

    // 用有限差分求法线，保证光照随波浪起伏
    float eps = 0.35;
    float ex = silk(p + vec2(eps, 0.0), t) * uAmplitude;
    float ey = silk(p + vec2(0.0, eps), t) * uAmplitude;
    vec3 tangent  = normalize(vec3(eps, 0.0, ex - e));
    vec3 bitangent= normalize(vec3(0.0, eps, ey - e));
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

/* ---------- 片元着色器 ---------- */
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColorDeep;
  uniform vec3 uColorBright;
  uniform float uTime;
  varying float vElevation;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  void main(){
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(vec3(0.35, 0.9, 0.5)); // 柔和顶光

    // 主漫反射 + 高度梯度上色
    float grad = clamp(vElevation * 0.45 + 0.5, 0.0, 1.0);
    vec3 base = mix(uColorDeep, uColorBright, grad);

    float diff = max(dot(N, L), 0.0);
    base *= 0.45 + 0.75 * diff;

    // 丝绸缎面高光（半程向量 + 收紧的高光）
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 36.0);
    base += uColorBright * spec * 0.9;

    // 菲涅尔丝光描边
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    base += uColorBright * fres * 0.55;

    // 缎面的彩虹微光（随法线轻微偏移色相）
    float irid = sin(vElevation * 3.0 + uTime * 0.3) * 0.5 + 0.5;
    base += mix(vec3(0.0), uColorBright * 0.18, irid * fres);

    // 上下纵向渐变，底部沉入暗色，营造景深
    float vgrad = smoothstep(0.0, 0.85, vUv.y);
    base = mix(uColorDeep * 0.35, base, vgrad * 0.85 + 0.15);

    gl_FragColor = vec4(base, 1.0);
    #include <fog_fragment>
  }
`;

/* ============================================================
   场景搭建
   ============================================================ */
const canvas = document.getElementById("silk-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const T0 = THEMES[0];
scene.fog = new THREE.FogExp2(T0.fog.clone(), 0.026);
scene.background = T0.fog.clone();

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4.2, 9.5);
camera.lookAt(0, 0.4, -2);

/* 丝绸平面：水平铺开，低角度俯视，呈现绵延的丝绸海面 */
const geometry = new THREE.PlaneGeometry(80, 80, 280, 280);
// 合并 three.js 的雾 uniform，使 ShaderMaterial 支持 scene.fog
const uniforms = THREE.UniformsUtils.merge([
  THREE.UniformsLib.fog,
  {
    uTime: { value: 0 },
    uAmplitude: { value: 1.35 },
    uColorDeep: { value: T0.deep.clone() },
    uColorBright: { value: T0.bright.clone() },
  },
]);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  fog: true,
  side: THREE.DoubleSide,
});
const silk = new THREE.Mesh(geometry, material);
silk.rotation.x = -Math.PI / 2;
silk.position.y = -1.2;
scene.add(silk);

/* 后期：Bloom 制造柔焦朦胧的丝光 */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.85, // strength
  0.85, // radius（偏大 → 更朦胧）
  0.2   // threshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ============================================================
   主题过渡：在目标色与当前色之间逐帧插值
   ============================================================ */
const target = {
  deep: T0.deep.clone(),
  bright: T0.bright.clone(),
  fog: T0.fog.clone(),
};

function applyTheme(index) {
  const th = THEMES[index];
  target.deep.copy(th.deep);
  target.bright.copy(th.bright);
  target.fog.copy(th.fog);
  // 同步页面 CSS 变量（由 CSS transition 平滑过渡）
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

  // 切换瞬间给丝绸一个“涌动”脉冲
  ampPulse = 0.9;

  setTimeout(() => { locked = false; }, 850);
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    goTo(parseInt(btn.dataset.go, 10));
  });
});

/* 滚轮切换（带节流，避免触控板惯性误触） */
let wheelCooldown = 0;
window.addEventListener("wheel", (e) => {
  const now = performance.now();
  if (now < wheelCooldown) return;
  if (Math.abs(e.deltaY) < 18) return;
  wheelCooldown = now + 900;
  goTo(current + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

/* 触摸滑动切换 */
let touchY = null, touchX = null;
window.addEventListener("touchstart", (e) => {
  touchY = e.touches[0].clientY;
  touchX = e.touches[0].clientX;
}, { passive: true });
window.addEventListener("touchend", (e) => {
  if (touchY === null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
    goTo(current + (dy < 0 ? 1 : -1));
  } else if (Math.abs(dx) > 50) {
    goTo(current + (dx < 0 ? 1 : -1));
  }
  touchY = touchX = null;
}, { passive: true });

/* 键盘方向键切换 */
window.addEventListener("keydown", (e) => {
  if (["ArrowDown", "ArrowRight", "PageDown"].includes(e.key)) goTo(current + 1);
  if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) goTo(current - 1);
});

/* ============================================================
   鼠标 / 设备视差
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
let ampPulse = 0; // 切换时的额外振幅，逐渐衰减

function tick() {
  const dt = clock.getDelta();
  uniforms.uTime.value += dt;

  // 振幅脉冲衰减
  ampPulse *= 0.96;
  uniforms.uAmplitude.value = 1.35 + ampPulse;

  // 颜色平滑插值
  uniforms.uColorDeep.value.lerp(target.deep, 0.05);
  uniforms.uColorBright.value.lerp(target.bright, 0.05);
  scene.fog.color.lerp(target.fog, 0.05);
  scene.background.lerp(target.fog, 0.05);

  // 视差：相机随指针轻微浮动
  pointer.x += (pointer.tx - pointer.x) * 0.04;
  pointer.y += (pointer.ty - pointer.y) * 0.04;
  camera.position.x = pointer.x * 1.1;
  camera.position.y = 4.2 - pointer.y * 0.6;
  camera.lookAt(0, 0.4, -2);

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
   启动：等待首帧后隐藏加载层
   ============================================================ */
applyTheme(0);
tick();

const loader = document.getElementById("loader");
window.addEventListener("load", () => {
  setTimeout(() => loader && loader.classList.add("is-done"), 600);
});
// 兜底：即使 load 事件因缓存未触发，也在 2.5s 后隐藏
setTimeout(() => loader && loader.classList.add("is-done"), 2500);
