/*
 * ルミナ・フロンティア — ゲーム本体
 * three.js r128（CDN）に依存します。index.html から読み込まれます。
 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const UNITS = ['K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];
function fmt(n){
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  let i = -1; while (n >= 1000 && i < UNITS.length-1){ n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + UNITS[i];
}
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const smooth = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

// ================= セーブ =================
const SAVE_KEY = 'lumina_fps_v1';
const freshSave = () => ({crystals:0, stardust:0, up:{}, wave:1, maxWave:1, bestWave:1, quality:'high', sens:1, t:0,
  stats:{}, chapter:0, active:[], nextM:0, mstart:{}});
const save = freshSave();
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) Object.assign(save, s); } catch(e){}
save.stats = save.stats || {}; save.mstart = save.mstart || {}; save.active = save.active || [];
save.bestWave = Math.max(save.bestWave || 1, save.maxWave || 1);
function persist(){ save.t = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch(e){} }
const lv = id => save.up[id] || 0;

// ================= 強化定義 =================
const pm = () => 1 + 0.1*save.stardust;
const fireInt = l => Math.max(0.06, 0.28/(1+0.1*l));
const reloadT = l => Math.max(0.35, 1.5*Math.pow(0.9,l));
const critC = l => Math.min(0.77, 0.05+0.03*l);
const gainOf = l => Math.pow(1.2,l)*pm();
const passiveOf = l => l === 0 ? 0 : 0.5*l*Math.pow(1.3,l)*pm();
const UPS = [
  {id:'dmg',    name:'攻撃力',     base:15,  g:1.42, eff:l=>fmt(10*Math.pow(1.25,l)*pm())+' ダメージ'},
  {id:'rate',   name:'連射速度',   base:25,  g:1.55, eff:l=>(1/fireInt(l)).toFixed(1)+' 発/秒'},
  {id:'mag',    name:'弾倉',       base:20,  g:1.5,  eff:l=>(12+3*l)+' 発'},
  {id:'reload', name:'リロード',   base:30,  g:1.6,  eff:l=>reloadT(l).toFixed(2)+' 秒'},
  {id:'hp',     name:'最大HP',     base:20,  g:1.45, eff:l=>fmt(100*Math.pow(1.18,l))+' HP'},
  {id:'regen',  name:'自然回復',   base:80,  g:1.9,  max:10, eff:l=>l+'% /秒'},
  {id:'crit',   name:'会心率',     base:50,  g:1.65, max:24, eff:l=>Math.round(critC(l)*100)+'%（×2.5）'},
  {id:'gain',   name:'結晶獲得',   base:40,  g:1.6,  eff:l=>'×'+gainOf(l).toFixed(2)},
  {id:'turret', name:'守護オーブ', base:200, g:3.2,  max:6,  eff:l=>l+' 個（自動攻撃）'},
  {id:'skill',  name:'スキル威力', base:60,  g:1.6,  eff:l=>'×'+Math.pow(1.3,l).toFixed(2)+'（チャージ・ノヴァ・落下）'},
  {id:'passive',name:'結晶採掘',   base:60,  g:1.65, eff:l=>fmt(passiveOf(l))+' /秒（放置でも）'},
];
const costOf = u => Math.ceil(u.base*Math.pow(u.g, lv(u.id)));
let ST = {};
function computeStats(){
  ST = {
    dmg: 10*Math.pow(1.25,lv('dmg'))*pm(),
    interval: fireInt(lv('rate')),
    mag: 12+3*lv('mag'),
    reload: reloadT(lv('reload')),
    maxhp: 100*Math.pow(1.18,lv('hp')),
    regen: 0.01*lv('regen'),
    crit: critC(lv('crit')),
    gain: gainOf(lv('gain')),
    turrets: Math.min(6, lv('turret')),
    passive: passiveOf(lv('passive')),
    skill: Math.pow(1.3, lv('skill')),
  };
}
computeStats();

// オフライン報酬
let offlineGain = 0;
if (save.t && ST.passive > 0){
  const secs = Math.min(8*3600, (Date.now()-save.t)/1000);
  offlineGain = ST.passive*secs*0.5;
  save.crystals += offlineGain;
}
if (offlineGain >= 1) $('offline').textContent = '留守の間に結晶を採掘しました：◆ ' + fmt(offlineGain);
if (save.t) $('start').textContent = 'つづきから（WAVE ' + save.wave + '）';

// ================= レンダラー =================
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0.70, 0.84, 0.95);
scene.fog = new THREE.Fog(HORIZON, 55, 230);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

const SUN_DIR = new THREE.Vector3(0.45, 0.62, -0.65).normalize();
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5d7f45, 0.42));
const sun = new THREE.DirectionalLight(0xfff0d8, 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-38, right:38, top:38, bottom:-38, near:1, far:160});
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

// ---- トゥーン素材（3段階の陰影＋リムライト）----
const gradMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95,95,95,255, 175,175,175,255, 255,255,255,255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
})();
function toon(color, opts, rim){
  const m = new THREE.MeshToonMaterial(Object.assign({color, gradientMap:gradMap}, opts||{}));
  const r = rim === undefined ? 0.3 : rim;
  if (r > 0){
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n{ float rr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);\n gl_FragColor.rgb += vec3(1.0,0.96,0.88) * smoothstep(0.6, 0.66, rr) * ' + r.toFixed(2) + '; }');
    };
    m.customProgramCacheKey = () => 'rim' + r.toFixed(2);
  }
  return m;
}
const outlineMat = new THREE.MeshBasicMaterial({color:0x1e2440, side:THREE.BackSide});
const noRay = () => {};
function outline(mesh, s){
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(s || 1.06); o.raycast = noRay; mesh.add(o); return o;
}
const glow = (r,g,b) => new THREE.MeshBasicMaterial({color:new THREE.Color(r,g,b)});

// ================= 空 =================
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
  side:THREE.BackSide, depthWrite:false, fog:false,
  uniforms:{uTop:{value:new THREE.Color(0.20,0.47,0.88)}, uHor:{value:HORIZON}, uBot:{value:new THREE.Color(0.55,0.68,0.72)}, uSun:{value:SUN_DIR}, uTime:{value:0}},
  vertexShader:'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:`
    uniform vec3 uTop,uHor,uBot,uSun; uniform float uTime; varying vec3 vDir;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 col = mix(uHor, uTop, pow(clamp(h,0.0,1.0), 0.55));
      col = mix(col, uBot, smoothstep(0.0, -0.2, h));
      float s = max(dot(d, uSun), 0.0);
      col += vec3(1.0,0.82,0.55) * pow(s, 16.0) * 0.3;
      col += vec3(1.0,0.95,0.82) * smoothstep(0.9982, 0.9992, s) * 2.2;
      if (h > 0.0){
        vec2 uv = d.xz/(h+0.18)*1.1 + vec2(uTime*0.006, uTime*0.002);
        float c = fbm(uv);
        float edge = smoothstep(0.52, 0.56, c);
        float shade = smoothstep(0.56, 0.72, fbm(uv*1.3+2.0));
        vec3 cc = mix(vec3(0.74,0.80,0.93), vec3(0.97,0.97,1.0), shade);
        cc += vec3(1.0,0.85,0.6) * pow(s, 6.0) * 0.25;
        col = mix(col, cc, edge * smoothstep(0.0, 0.15, h) * 0.95);
      }
      gl_FragColor = vec4(col, 1.0);
    }`
}));
sky.renderOrder = -1;
scene.add(sky);

// ================= 地形 =================
const ARENA = 46;
function terrainH(x, z){
  const d = Math.hypot(x, z);
  const hills = Math.sin(x*0.08)*Math.cos(z*0.07)*2.0 + Math.sin(x*0.21+z*0.13)*0.6 + Math.sin(z*0.16-x*0.05)*1.0;
  const flat = 0.35 + 0.65*smooth(10, 40, d);
  const rim = Math.pow(Math.max(0, d-ARENA)/14, 2)*2.2;
  return hills*flat + Math.min(rim, 28);
}
const blockers = []; // 弾を遮るもの
const props = [];    // 当たり判定の円 {x,z,r}
{
  const geo = new THREE.PlaneGeometry(300, 300, 180, 180);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3);
  const c = new THREE.Color(), grassA = new THREE.Color(0.30,0.56,0.22), grassB = new THREE.Color(0.42,0.66,0.26), dirt = new THREE.Color(0.66,0.56,0.38), rock = new THREE.Color(0.52,0.56,0.52);
  for (let i=0;i<pos.count;i++){
    const x = pos.getX(i), z = pos.getZ(i), y = terrainH(x,z);
    pos.setY(i, y);
    const n = Math.sin(x*0.3)*Math.sin(z*0.27)*0.5+0.5;
    c.copy(grassA).lerp(grassB, n);
    const d = Math.hypot(x,z);
    // 小道
    const path = Math.abs(Math.sin(Math.atan2(z,x)*2 + d*0.05)) * d;
    if (d < 4.5) c.lerp(dirt, smooth(4.5, 2.5, d));
    else if (path < 1.6 && d < ARENA) c.lerp(dirt, 0.75*smooth(1.6, 0.6, path));
    if (y > 16) c.lerp(rock, 0.6*smooth(16, 28, y));
    cols[i*3]=c.r; cols[i*3+1]=c.g; cols[i*3+2]=c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  var terrain = new THREE.Mesh(geo, toon(0xffffff, {vertexColors:true}, 0));
  terrain.receiveShadow = true;
  scene.add(terrain);
  blockers.push(terrain);
}

// ---- 草（風になびく・プレイヤーで倒れる）----
const GRASS_N = 32000;
const grassMat = new THREE.ShaderMaterial({
  side:THREE.DoubleSide,
  uniforms:{uTime:{value:0}, uPlayer:{value:new THREE.Vector3()}, uBase:{value:new THREE.Color(0.16,0.40,0.15)}, uTip:{value:new THREE.Color(0.58,0.82,0.33)}, fogColor:{value:HORIZON}, fogNear:{value:55}, fogFar:{value:230}},
  vertexShader:`
    uniform float uTime; uniform vec3 uPlayer; varying float vH; varying float vDepth; varying vec3 vW;
    void main(){
      vH = uv.y;
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      float wind = sin(uTime*1.6 + w.x*0.18 + w.z*0.11)*0.6 + sin(uTime*2.7 + w.x*0.5)*0.2;
      vec2 away = w.xz - uPlayer.xz; float d = length(away);
      float push = smoothstep(1.6, 0.0, d);
      vec2 off = vec2(wind*0.25, wind*0.12) + (d > 0.001 ? away/d : vec2(0.0)) * push * 0.6;
      w.xz += off * vH * vH; w.y -= push * vH * 0.25;
      vW = w.xyz;
      vec4 mv = viewMatrix * w; vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader:`
    uniform vec3 uBase, uTip, fogColor; uniform float fogNear, fogFar; varying float vH; varying float vDepth; varying vec3 vW;
    void main(){
      float n = sin(vW.x*0.35)*sin(vW.z*0.29)*0.5 + 0.5;
      vec3 tip = mix(uTip, uTip*vec3(1.18,1.05,0.65), n);
      vec3 c = mix(uBase, tip, smoothstep(0.0, 1.0, vH));
      c *= 0.82 + 0.3*vH;
      gl_FragColor = vec4(mix(c, fogColor, smoothstep(fogNear, fogFar, vDepth)), 1.0);
    }`
});
const grass = (() => {
  const g = new THREE.PlaneGeometry(0.1, 0.75, 1, 3);
  g.translate(0, 0.375, 0);
  const p = g.attributes.position;
  for (let i=0;i<p.count;i++) p.setX(i, p.getX(i) * (1 - p.getY(i)/0.8));
  const m = new THREE.InstancedMesh(g, grassMat, GRASS_N);
  const o = new THREE.Object3D();
  for (let i=0;i<GRASS_N;i++){
    const r = Math.sqrt(Math.random())*58, a = Math.random()*Math.PI*2;
    const x = Math.cos(a)*r, z = Math.sin(a)*r;
    o.position.set(x, terrainH(x,z)-0.03, z);
    o.rotation.set((Math.random()-0.5)*0.3, Math.random()*Math.PI, (Math.random()-0.5)*0.3);
    const s = 0.7 + Math.random()*0.8; o.scale.set(1, s * (Math.hypot(x,z) < 4 ? 0.4 : 1), 1);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
  }
  m.frustumCulled = false;
  scene.add(m); return m;
})();

// ---- 花 ----
{
  const N = 1400, geo = new THREE.IcosahedronGeometry(0.09, 0);
  const m = new THREE.InstancedMesh(geo, toon(0xffffff, {}, 0), N);
  const o = new THREE.Object3D(), c = new THREE.Color(), cs = [0xffffff, 0xfff07a, 0xffa8d2, 0xb9c8ff, 0xffc27a];
  for (let i=0;i<N;i++){
    const r = 5 + Math.sqrt(Math.random())*50, a = Math.random()*Math.PI*2, x = Math.cos(a)*r, z = Math.sin(a)*r;
    o.position.set(x, terrainH(x,z)+0.28+Math.random()*0.15, z); o.scale.setScalar(0.8+Math.random()*0.7); o.updateMatrix();
    m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(cs[i%cs.length]));
  }
  scene.add(m);
}

// ---- 木と岩 ----
let seed = 11; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;
const trunkMat = toon(0x7a5236, {}, 0.15);
const leafMats = [toon(0x4f9a3c), toon(0x63b04a), toon(0x3d8436)];
const pinkMats = [toon(0xf5a7c4), toon(0xffc4d9), toon(0xe98bb0)];
const rockMat = toon(0x8c96a3, {}, 0.25), mossMat = toon(0x6e9b4b, {}, 0.2);
function addTree(x, z, collide, pink){
  const g = new THREE.Group(), s = 0.9 + rnd()*0.7;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 2.8, 7), trunkMat);
  trunk.position.y = 1.4; trunk.castShadow = true; outline(trunk, 1.1); g.add(trunk); blockers.push(trunk);
  const mats = pink ? pinkMats : leafMats;
  const blobs = [[0,3.3,0,1.5],[0.9,2.8,0.3,1.0],[-0.8,2.9,-0.4,1.05],[0.1,4.2,0.1,1.0]];
  for (let i=0;i<blobs.length;i++){
    const b = blobs[i];
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(b[3], 1), mats[i%3]);
    f.position.set(b[0], b[1], b[2]); f.castShadow = true; outline(f, 1.05); g.add(f); blockers.push(f);
  }
  g.position.set(x, terrainH(x,z) - 0.1, z); g.scale.setScalar(s); g.rotation.y = rnd()*6.28;
  scene.add(g);
  if (collide) props.push({x, z, r:0.45*s});
}
function addRock(x, z, scale){
  const r = scale || (0.8 + rnd()*1.8);
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
  m.scale.set(r*(0.9+rnd()*0.5), r*(0.6+rnd()*0.5), r*(0.9+rnd()*0.5));
  m.rotation.set(rnd(), rnd()*6, rnd()*0.4);
  m.position.set(x, terrainH(x,z) + m.scale.y*0.35, z);
  m.castShadow = m.receiveShadow = true; outline(m, 1.05);
  const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mossMat);
  moss.scale.set(0.85, 0.35, 0.85); moss.position.y = 0.72; m.add(moss);
  scene.add(m); blockers.push(m);
  props.push({x, z, r:Math.max(m.scale.x, m.scale.z)*0.9});
}
for (let i=0;i<34;i++){
  const a = rnd()*6.28, r = 10 + rnd()*34, x = Math.cos(a)*r, z = Math.sin(a)*r;
  if (props.some(p => Math.hypot(p.x-x, p.z-z) < 4)) continue;
  addTree(x, z, true, rnd() < 0.3);
}
for (let i=0;i<26;i++){
  const a = rnd()*6.28, r = 8 + rnd()*37, x = Math.cos(a)*r, z = Math.sin(a)*r;
  if (props.some(p => Math.hypot(p.x-x, p.z-z) < 3.5)) continue;
  addRock(x, z);
}
for (let i=0;i<70;i++){ // 外周の森（景観用）
  const a = rnd()*6.28, r = 50 + rnd()*40, x = Math.cos(a)*r, z = Math.sin(a)*r;
  addTree(x, z, false, rnd() < 0.25);
}

// ---- 遠景：山と浮島 ----
{
  const mMat = toon(0x5d8c84, {}, 0.2), snow = toon(0xf4f7ff, {}, 0.2), far = toon(0x7e9fb5, {}, 0);
  for (let i=0;i<16;i++){
    const a = i/16*6.28 + rnd()*0.3, r = 140 + rnd()*60, h = 45 + rnd()*55, w = 30 + rnd()*25;
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7), i%2 ? mMat : far);
    m.position.set(Math.cos(a)*r, h/2 - 4, Math.sin(a)*r); m.rotation.y = rnd()*6; scene.add(m);
    if (h > 65){ const s = new THREE.Mesh(new THREE.ConeGeometry(w*0.32, h*0.3, 7), snow); s.position.y = h*0.36; m.add(s); }
  }
}
const islands = [];
function addIsland(x, y, z, s){
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.ConeGeometry(6, 9, 8), rockMat); rock.rotation.x = Math.PI; rock.position.y = -4.5; outline(rock, 1.04);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(6.3, 6, 1.2, 8), toon(0x5aa646)); outline(top, 1.04);
  g.add(rock, top);
  const t = new THREE.Group();
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3, 7), trunkMat); tr.position.y = 2; t.add(tr);
  const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 1), pinkMats[0]); lf.position.y = 4.2; outline(lf, 1.05); t.add(lf);
  g.add(t);
  const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 14, 8, 1, true), new THREE.MeshBasicMaterial({color:new THREE.Color(0.85,0.95,1.0), transparent:true, opacity:0.55}));
  fall.position.set(4.8, -6, 0); g.add(fall);
  g.position.set(x, y, z); g.scale.setScalar(s); scene.add(g);
  islands.push({g, y, p:rnd()*6});
}
addIsland(70, 38, -130, 1.6); addIsland(-110, 52, -60, 1.2); addIsland(-40, 30, 140, 1.0);

// ---- 舞う光（花粉・蛍）----
const pollen = (() => {
  const N = 450, g = new THREE.BufferGeometry(), p = new Float32Array(N*3), base = [];
  for (let i=0;i<N;i++){
    const r = Math.sqrt(Math.random())*55, a = Math.random()*6.28, x = Math.cos(a)*r, z = Math.sin(a)*r;
    base.push([x, terrainH(x,z)+0.6+Math.random()*7, z, Math.random()*6.28]);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.25,'rgba(255,250,210,.8)'); gr.addColorStop(1,'rgba(255,240,180,0)');
  x.fillStyle = gr; x.fillRect(0,0,64,64);
  const mat = new THREE.PointsMaterial({size:0.32, map:new THREE.CanvasTexture(c), color:new THREE.Color(1.6,1.45,1.0), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  return {g, p, base};
})();

// ================= 武器 =================
const gun = new THREE.Group();
{
  const white = toon(0xd9d4ca, {}, 0.2), gold = toon(0xdcb453, {}, 0.35), dark = toon(0x2d3456, {}, 0.15);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.44), white); outline(body, 1.07);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.32), gold); rail.position.set(0, 0.08, -0.02);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.3, 12), gold); barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.015, -0.34); outline(barrel, 1.12);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), gold); ring.position.set(0, 0.015, -0.44);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.19, 0.09), dark); grip.position.set(0, -0.13, 0.1); grip.rotation.x = 0.3;
  const wing = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), gold); wing.rotation.set(Math.PI/2, 0, 0); wing.position.set(0.07, 0.03, 0.05);
  gun.add(body, rail, barrel, ring, grip, wing);
  var gunCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), glow(0.6, 1.7, 2.3)); gunCore.position.set(0, 0.13, -0.05); gun.add(gunCore);
  var flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), glow(3.0, 2.4, 1.2)); flash.position.set(0, 0.015, -0.52); flash.visible = false; gun.add(flash);
  var flashLight = new THREE.PointLight(0xffd480, 0, 7); flashLight.position.copy(flash.position); gun.add(flashLight);
}
const GUN_BASE = new THREE.Vector3(0.19, -0.18, -0.4);
gun.position.copy(GUN_BASE); gun.scale.setScalar(0.62);
camera.add(gun);

// ================= ポストエフェクト =================
let composer = null, gradePass = null;
const GradeShader = {
  uniforms:{tDiffuse:{value:null}, uAb:{value:0}, uZoom:{value:0}, uTint:{value:new THREE.Color(1.0,0.72,0.25)}, uTintAmt:{value:0}},
  vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:`uniform sampler2D tDiffuse; uniform float uAb, uZoom, uTintAmt; uniform vec3 uTint; varying vec2 vUv;
    void main(){ vec2 d = vUv - 0.5; vec3 c;
      if (uZoom > 0.001){ c = vec3(0.0); for (int i=0;i<6;i++){ float s = 1.0 - uZoom*float(i)*0.022; c += texture2D(tDiffuse, 0.5 + d*s).rgb; } c /= 6.0; }
      else c = texture2D(tDiffuse, vUv).rgb;
      if (uAb > 0.001){ vec2 o = d*uAb*0.025; c.r = texture2D(tDiffuse, vUv + o).r; c.b = texture2D(tDiffuse, vUv - o).b; }
      c = c / (1.0 + max(c - 1.0, 0.0) * 0.5);
      float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, 1.14);
      c = (c - 0.5)*1.04 + 0.52;
      c += uTint*uTintAmt*smoothstep(0.05, 0.3, dot(d,d)); c *= 1.0 - dot(d,d)*0.5;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`
};
function buildComposer(){
  try {
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(innerWidth*pr, innerHeight*pr, {type:THREE.HalfFloatType, format:THREE.RGBAFormat, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter});
    composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 1.35));
    gradePass = new THREE.ShaderPass(GradeShader); composer.addPass(gradePass);
  } catch(e){ console.warn('composer disabled', e); composer = null; }
}
function applyQuality(){
  const high = save.quality === 'high';
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 2) : 1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = high; sun.castShadow = high;
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  grass.count = high ? GRASS_N : Math.floor(GRASS_N*0.3);
  composer = null;
  if (high && THREE.EffectComposer) buildComposer();
  $('qHigh').className = high ? 'on' : ''; $('qLow').className = high ? '' : 'on';
}

// ================= サウンド =================
let actx = null;
function sound(type, pitch){
  if (!actx) return;
  const t = actx.currentTime;
  if (['nova','explode','beam','dash','plunge'].includes(type)){
    const len = type === 'dash' ? 0.22 : 0.5, buf = actx.createBuffer(1, actx.sampleRate*len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/d.length, 2);
    const s = actx.createBufferSource(); s.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = type === 'dash' ? 'highpass' : 'lowpass'; f.frequency.value = type === 'dash' ? 1400 : 700;
    const g = actx.createGain(); g.gain.value = type === 'dash' ? 0.14 : 0.45;
    s.connect(f).connect(g).connect(actx.destination); s.start(t);
  }
  if (type === 'shot'){
    const len = 0.1, buf = actx.createBuffer(1, actx.sampleRate*len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/d.length, 3);
    const s = actx.createBufferSource(); s.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(220, t+0.08);
    const g = actx.createGain(); g.gain.value = 0.35; const g2 = actx.createGain(); g2.gain.setValueAtTime(0.12, t); g2.gain.exponentialRampToValueAtTime(0.001, t+0.09);
    s.connect(f).connect(g).connect(actx.destination); o.connect(g2).connect(actx.destination);
    s.start(t); o.start(t); o.stop(t+0.1);
    return;
  }
  const cfg = {hit:[1250,0.05,'triangle',0.06], crit:[1700,0.08,'triangle',0.08], kill:[520,0.22,'sine',0.12], hurt:[140,0.2,'sawtooth',0.15], reload:[660,0.08,'triangle',0.08], pick:[1900,0.05,'sine',0.035], buy:[880,0.15,'sine',0.1], wave:[440,0.5,'triangle',0.12], summon:[300,0.35,'sine',0.05], pop:[700,0.12,'sine',0.08], quest:[660,0.45,'triangle',0.13], charge:[220,0.3,'square',0.03], lunge:[180,0.18,'sawtooth',0.06], slam:[90,0.4,'sawtooth',0.2], cast:[1000,0.2,'sine',0.06], roar:[110,0.8,'sawtooth',0.2], dash:[900,0.2,'sine',0.05], djump:[520,0.16,'triangle',0.08], nova:[90,0.7,'sawtooth',0.18], beam:[260,0.5,'sawtooth',0.14], burst:[330,1.0,'triangle',0.15], explode:[80,0.3,'sawtooth',0.12], combo:[880,0.09,'sine',0.06], chargeT:[400,0.05,'sine',0.025], evade:[1400,0.14,'sine',0.06], plunge:[120,0.4,'sawtooth',0.18]}[type];
  if (!cfg) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = cfg[2]; o.frequency.setValueAtTime(cfg[0]*(pitch||1), t);
  if (['kill','buy','wave','summon','quest','charge','pop','djump','burst','combo','chargeT','evade'].includes(type)) o.frequency.exponentialRampToValueAtTime(cfg[0]*2, t+cfg[1]);
  if (['slam','roar','lunge','cast','nova','beam','explode','dash','plunge'].includes(type)) o.frequency.exponentialRampToValueAtTime(cfg[0]*0.4, t+cfg[1]);
  if (type === 'hurt') o.frequency.exponentialRampToValueAtTime(60, t+cfg[1]);
  g.gain.setValueAtTime(cfg[3], t); g.gain.exponentialRampToValueAtTime(0.0001, t+cfg[1]);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t+cfg[1]+0.02);
}

// ================= プレイヤー =================
const P = {pos:new THREE.Vector3(0,0,0), vel:new THREE.Vector3(), yaw:0, pitch:0, onGround:true, hp:100, r:0.4, height:1.65};
let mag = ST.mag, reloading = 0, fireCd = 0, recoil = 0, bob = 0;
let jumps = 0, dashN = 2, dashRe = 0, dashT = 0, iframe = 0, plunging = false, novaCd = 0, chargeT = 0, charging = false;
let burstG = 0, odT = 0, combo = 0, comboT = 0, hitstop = 0, slowT = 0, fovKick = 0, abFx = 0, zoomFx = 0, flashA = 0, speedA = 0, crossK = 0, evadeT = 0;
const dashDir = new THREE.Vector3();
const DASH_RE = 1.1, NOVA_CD = 8, OD_TIME = 7;
let state = 'title';
const keys = {};
function collideProps(pos, r){
  for (const p of props){
    const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), m = r + p.r;
    if (d < m && d > 1e-6){ pos.x += dx/d*(m-d); pos.z += dz/d*(m-d); }
  }
  const d = Math.hypot(pos.x, pos.z), lim = ARENA + 2;
  if (d > lim){ pos.x *= lim/d; pos.z *= lim/d; }
}

// ================= 敵 =================
const enemies = [];
const KINDS = {
  normal:{name:'ルミナスピリット', color:0x5ec8e8, hp:1,   spd:3.3, rew:1,   size:1,   dmg:1,   cd:1.6},
  fast:  {name:'疾風スピリット',   color:0xf2a65a, hp:0.6, spd:5.4, rew:0.8, size:0.8, dmg:0.7, cd:1.3},
  tank:  {name:'岩殻スピリット',   color:0x8a6fd6, hp:3.2, spd:2.1, rew:2.5, size:1.4, dmg:1.5, cd:2.6},
  mage:  {name:'星詠みスピリット', color:0x9be07a, hp:0.8, spd:3.0, rew:1.6, size:0.9, dmg:0.9, cd:2.4},
  boss:  {name:'結晶の守護獣',     color:0xff7096, hp:28,  spd:2.2, rew:25,  size:3.0, dmg:2.2, cd:2.2},
};
const BOSSES = [
  {name:'結晶の守護獣',   color:0xff7096},
  {name:'疾風の守護獣',   color:0xffa24c},
  {name:'岩殻の守護獣',   color:0x9b7bff},
  {name:'星詠みの守護獣', color:0x6fe0a8},
  {name:'大結晶ルミナ・コア', color:0xfff08a},
];
const bossOf = w => BOSSES[(Math.floor(w/10)-1) % BOSSES.length];
const bodyGeo = new THREE.SphereGeometry(0.7, 28, 18);
const bellyGeo = new THREE.SphereGeometry(0.42, 18, 12);
const scleraGeo = new THREE.SphereGeometry(0.14, 14, 10), pupilGeo = new THREE.SphereGeometry(0.075, 10, 8), hiGeo = new THREE.SphereGeometry(0.03, 8, 6);
const handGeo = new THREE.SphereGeometry(0.17, 14, 10), browGeo = new THREE.BoxGeometry(0.2, 0.04, 0.03), mouthGeo = new THREE.SphereGeometry(0.08, 12, 8), cheekGeo = new THREE.SphereGeometry(0.07, 10, 8);
const white = new THREE.MeshBasicMaterial({color:0xffffff}), ink = new THREE.MeshBasicMaterial({color:0x1b1f38}), mouthMat = new THREE.MeshBasicMaterial({color:0x5a1a2c});
const cheekMat = new THREE.MeshBasicMaterial({color:0xff8fb1, transparent:true, opacity:0.7});
const crysGeo = new THREE.OctahedronGeometry(0.26);
const barGeo = new THREE.PlaneGeometry(1.2, 0.12), fillGeo = new THREE.PlaneGeometry(1.2, 0.12); fillGeo.translate(0.6, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({color:0x111428, transparent:true, opacity:0.6, depthWrite:false});
const barFillMat = new THREE.MeshBasicMaterial({color:new THREE.Color(1.0,0.45,0.55), depthWrite:false});
const RED = new THREE.Color(2.6, 0.35, 0.4);
// 吹き出し「!」
const emoteTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#1d2340'; x.lineWidth = 8;
  x.beginPath(); x.arc(64, 56, 44, 0, Math.PI*2); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(52, 96); x.lineTo(64, 122); x.lineTo(76, 96); x.fill();
  x.fillStyle = '#ff5a6e'; x.font = 'bold 72px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 64, 60);
  return new THREE.CanvasTexture(c);
})();
// 召喚陣
const circleTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.translate(128, 128); x.strokeStyle = 'rgba(190,240,255,1)'; x.lineWidth = 5;
  x.beginPath(); x.arc(0, 0, 118, 0, Math.PI*2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 96, 0, Math.PI*2); x.stroke();
  for (let i=0;i<6;i++){ const a = i/6*Math.PI*2, b = a + Math.PI*2/3; x.beginPath(); x.moveTo(Math.cos(a)*96, Math.sin(a)*96); x.lineTo(Math.cos(b)*96, Math.sin(b)*96); x.stroke(); }
  for (let i=0;i<24;i++){ const a = i/24*Math.PI*2; x.beginPath(); x.moveTo(Math.cos(a)*100, Math.sin(a)*100); x.lineTo(Math.cos(a)*114, Math.sin(a)*114); x.stroke(); }
  return new THREE.CanvasTexture(c);
})();
const circleGeo = new THREE.PlaneGeometry(1, 1);
const teleDiskGeo = new THREE.CircleGeometry(1, 48), teleRingGeo = new THREE.RingGeometry(0.94, 1, 48);
function makeTelegraph(x, z, r){
  const g = new THREE.Group();
  const disk = new THREE.Mesh(teleDiskGeo, new THREE.MeshBasicMaterial({color:0xff3050, transparent:true, opacity:0.18, depthTest:false, depthWrite:false}));
  const ringM = new THREE.Mesh(teleRingGeo, new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,0.4,0.5), transparent:true, opacity:0.9, depthTest:false, depthWrite:false}));
  const fill = new THREE.Mesh(teleDiskGeo, new THREE.MeshBasicMaterial({color:0xff5060, transparent:true, opacity:0.3, depthTest:false, depthWrite:false}));
  g.add(disk, ringM, fill); g.rotation.x = -Math.PI/2; g.renderOrder = 5;
  g.position.set(x, terrainH(x, z) + 0.08, z); g.scale.setScalar(r);
  scene.add(g); return {g, fill, r};
}
function removeTele(e){ if (e.tele){ scene.remove(e.tele.g); e.tele = null; } }

function waveScale(w){ return {hp:30*Math.pow(1.17, w-1), dmg:8*Math.pow(1.09, w-1), rew:3*Math.pow(1.15, w-1)}; }

let flankCounter = 0;
const ELITE_KEYS = ['swift', 'guard', 'split', 'bomb'];
const ELITES = {
  swift:{name:'俊敏', color:new THREE.Color(0.6, 1.8, 2.6), css:'#7fe7ff'},
  guard:{name:'堅牢', color:new THREE.Color(0.8, 1.1, 2.8), css:'#9fb6ff'},
  split:{name:'分裂', color:new THREE.Color(0.8, 2.4, 0.9), css:'#8dff9a'},
  bomb: {name:'爆発', color:new THREE.Color(2.8, 1.3, 0.4), css:'#ffb067'},
};
const eliteFillMat = new THREE.MeshBasicMaterial({color:new THREE.Color(2.0, 1.6, 0.5), depthWrite:false});
function labelTex(text, css){
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 34px "M PLUS Rounded 1c", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = '#1d2340'; x.strokeText(text, 128, 34); x.fillStyle = css; x.fillText(text, 128, 34);
  return new THREE.CanvasTexture(c);
}
function spawnEnemy(kind, opts){
  opts = opts || {};
  const base = KINDS[kind], W = waveScale(save.wave);
  const K = Object.assign({}, base);
  if (kind === 'boss'){ const b = bossOf(save.wave); K.name = b.name; K.color = b.color; }
  const elite = opts.small || kind === 'boss' ? null : (opts.elite || (save.wave >= 6 && save.wave % 10 !== 0 && Math.random() < 0.12 ? ELITE_KEYS[Math.floor(Math.random()*4)] : null));
  if (opts.small){ K.size *= 0.6; K.hp *= 0.3; K.rew *= 0.3; K.dmg *= 0.6; }
  if (elite){ K.size *= 1.15; K.hp *= 2.5; K.rew *= 3; K.dmg *= 1.2; }
  const g = new THREE.Group(), pivot = new THREE.Group(), bodyG = new THREE.Group();
  g.add(pivot); pivot.add(bodyG);
  const mat = toon(K.color, {emissive:0x000000}, 0.45);
  const light = new THREE.Color(K.color).lerp(new THREE.Color(1,1,1), 0.55);
  const body = new THREE.Mesh(bodyGeo, mat); body.scale.set(1, 0.86, 1); body.position.y = 0.66; body.castShadow = true; outline(body, 1.06);
  const belly = new THREE.Mesh(bellyGeo, toon(light.getHex(), {}, 0.2)); belly.position.set(0, 0.5, -0.36); belly.scale.set(1, 0.85, 0.55);
  bodyG.add(body, belly);
  // 顔
  const face = new THREE.Group(); face.position.set(0, 0.8, -0.55); bodyG.add(face);
  const eyes = [], brows = [];
  for (const sx of [-1, 1]){
    const eye = new THREE.Group(); eye.position.set(0.22*sx, 0.02, 0);
    const sclera = new THREE.Mesh(scleraGeo, white); sclera.scale.set(0.85, 1.15, 0.5);
    const pupil = new THREE.Mesh(pupilGeo, ink); pupil.position.z = -0.06; pupil.scale.set(0.9, 1.2, 0.6);
    const hi = new THREE.Mesh(hiGeo, white); hi.position.set(0.025*sx, 0.035, -0.04); pupil.add(hi);
    eye.add(sclera, pupil); face.add(eye);
    eyes.push({eye, sclera, pupil});
    const brow = new THREE.Mesh(browGeo, ink); brow.position.set(0.22*sx, 0.2, -0.04); brow.rotation.z = -0.45*sx; brow.visible = false; face.add(brow); brows.push(brow);
    const cheek = new THREE.Mesh(cheekGeo, cheekMat); cheek.position.set(0.38*sx, -0.1, 0.04); cheek.scale.set(1, 0.6, 0.3); face.add(cheek);
  }
  const mouth = new THREE.Mesh(mouthGeo, mouthMat); mouth.position.set(0, -0.17, -0.02); mouth.scale.set(1, 0.3, 0.4); face.add(mouth);
  // 手
  const hands = [];
  for (const sx of [-1, 1]){
    const h = new THREE.Mesh(handGeo, mat); h.position.set(0.74*sx, 0.45, -0.1); h.castShadow = true; outline(h, 1.12);
    bodyG.add(h); hands.push(h);
  }
  // 弱点の結晶
  const crysMat = new THREE.MeshBasicMaterial({color:new THREE.Color(K.color).lerp(new THREE.Color(1,1,1), 0.35).multiplyScalar(2.2)});
  const crysBase = crysMat.color.clone();
  const crys = new THREE.Mesh(crysGeo, crysMat); crys.position.y = 1.65; crys.scale.set(1, 1.5, 1); pivot.add(crys);
  const extras = {};
  if (kind === 'fast'){
    extras.ears = [];
    for (const sx of [-1,1]){ const f = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 5), mat); f.position.set(0.38*sx, 1.15, 0.05); f.rotation.z = -0.5*sx; outline(f, 1.1); bodyG.add(f); extras.ears.push(f); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), mat); tail.position.set(0, 0.55, 0.7); tail.rotation.x = 1.9; outline(tail, 1.1); bodyG.add(tail); extras.tail = tail;
  } else if (kind === 'tank'){
    extras.rocks = [];
    for (const [x,y,z] of [[0.62,0.7,0.1],[-0.62,0.7,0.1],[0,0.6,0.62],[0,1.12,0.2]]){ const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32,0), rockMat); r.position.set(x,y,z); outline(r, 1.08); bodyG.add(r); extras.rocks.push(r); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshBasicMaterial({color:new THREE.Color(2.2, 1.8, 0.7), transparent:true, opacity:0.3, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false}));
    dome.rotation.x = -Math.PI/2; dome.position.set(0, 0.75, -0.75); dome.scale.set(1, 1, 1); dome.visible = false; pivot.add(dome); extras.dome = dome;
    for (const sx of [-1,1]){ const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), toon(0xf1e9d6)); h.position.set(0.3*sx, 1.28, -0.15); h.rotation.z = -0.4*sx; outline(h, 1.12); bodyG.add(h); }
    for (const h of hands) h.scale.setScalar(1.35);
  } else if (kind === 'mage'){
    extras.wings = [];
    const wm = new THREE.MeshBasicMaterial({color:new THREE.Color(1.3,1.8,1.4), transparent:true, opacity:0.75, side:THREE.DoubleSide});
    for (const sx of [-1,1]){
      const wg = new THREE.Group(); wg.position.set(0.25*sx, 0.95, 0.45);
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3), wm); w.position.x = 0.45*sx; w.scale.set(1, 0.5, 1); w.rotation.y = Math.PI/2;
      wg.add(w); bodyG.add(wg); extras.wings.push(wg);
    }
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 8), toon(0x3b3f7a)); hat.position.set(0, 1.35, 0.05); hat.rotation.x = 0.2; outline(hat, 1.06); bodyG.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16), toon(0x3b3f7a)); brim.position.set(0, 1.0, 0.0); bodyG.add(brim);
    crys.position.y = 2.0;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,0.9,2.4)})); orb.position.set(0, 0.55, -0.85); orb.visible = false; bodyG.add(orb); extras.orb = orb;
  } else if (kind === 'boss'){
    extras.crown = new THREE.Group(); extras.crown.position.y = 1.4; pivot.add(extras.crown);
    for (let i=0;i<6;i++){ const a = i/6*6.28; const c = new THREE.Mesh(crysGeo, crysMat); c.position.set(Math.cos(a)*0.42, 0, Math.sin(a)*0.42); c.scale.set(0.45, 1.1, 0.45); c.rotation.set(Math.cos(a)*0.5, 0, Math.sin(a)*0.5); extras.crown.add(c); }
    for (const sx of [-1,1]){ const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.45, 6), toon(0xfff3dc)); h.position.set(0.28*sx, 1.2, -0.3); h.rotation.set(-0.4, 0, -0.5*sx); outline(h, 1.12); bodyG.add(h); }
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.1, 10, 1, true), toon(0x3a2a5a, {side:THREE.DoubleSide}, 0.1)); cape.position.set(0, 0.6, 0.25); bodyG.add(cape);
  }
  g.scale.setScalar(0.01);
  let x, z, tries = 0;
  if (opts.at){ x = opts.at.x; z = opts.at.z; }
  else {
    do { const a = Math.random()*6.28, r = 20 + Math.random()*20; x = P.pos.x + Math.cos(a)*r; z = P.pos.z + Math.sin(a)*r; tries++; }
    while ((Math.hypot(x,z) > ARENA-2 || props.some(p => Math.hypot(p.x-x,p.z-z) < p.r+1)) && tries < 40);
  }
  if (Math.hypot(x,z) > ARENA-2){ const d = Math.hypot(x,z); x *= (ARENA-3)/d; z *= (ARENA-3)/d; }
  g.position.set(x, terrainH(x,z) - 1.5, z);
  scene.add(g);
  // 召喚陣
  const circle = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({map:circleTex, color:new THREE.Color(1.4,1.8,2.2).multiply(new THREE.Color(K.color).lerp(new THREE.Color(1,1,1),0.5)), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
  circle.rotation.x = -Math.PI/2; circle.position.set(x, terrainH(x,z)+0.07, z); circle.scale.setScalar(2.6*K.size);
  scene.add(circle);
  // HPバー
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(barGeo, barBgMat), fill = new THREE.Mesh(fillGeo, barFillMat);
  fill.position.set(-0.6, 0, 0.002); bar.add(bg, fill); bar.visible = false; scene.add(bar);
  const hp = W.hp*K.hp;
  const e = {g, pivot, bodyG, body, belly, face, eyes, brows, mouth, hands, crys, crysMat, crysBase, extras, mat, kind, K, circle,
    hp, maxhp:hp, speed:K.spd*(1+Math.min(0.5, save.wave*0.01)), dmg:W.dmg*K.dmg, rew:W.rew*K.rew,
    r:0.6*K.size, state:'spawn', st:0, cd:1 + Math.random(), wt:0, atk:null, phase:Math.random()*6, t:Math.random()*6,
    tilt:0, tiltV:0, sq:0, kb:new THREE.Vector3(), lv:new THREE.Vector3(), flash:0, blink:2+Math.random()*3, mouthT:0, yaw:0,
    strafe:Math.random()<0.5?1:-1, bar, fill, tele:null, emote:null, stars:null, enraged:false, hitDone:false, from:null, to:null};
  Object.assign(e, {flank:(flankCounter++ % 2) ? 1 : -1, vx:0, vz:0, pvx:0, pvz:0, jF:0, jFv:0, jS:0, jSv:0, bank:0,
    dodgeCd:1 + Math.random()*2, teleCd:2, barrierCd:3 + Math.random()*4, rage:0, fled:false, guarding:false, guardT:0, armorBroken:false,
    comboLeft:0, zig:1, stuckT:0, shield:0, shieldMax:0, shieldIdle:0, shieldHitT:0, bubble:null, dome:extras.dome || null,
    elite, aura:null, label:null, tauntNext:false, spinHit:0, vy:0, airRot:0, spin:0, hopAir:false, awakened:false, wavesN:0, dodgeSide:1});
  for (const m of [body, belly, crys, ...hands]) m.userData.e = e;
  crys.userData.weak = true;
  e.hitMeshes = [body, belly, crys, ...hands];
  if (e.dome){ e.dome.userData.e = e; e.dome.userData.part = 'guard'; }
  if (elite){
    const E = ELITES[elite];
    e.aura = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({map:circleTex, color:E.color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
    e.aura.rotation.x = -Math.PI/2; e.aura.scale.setScalar(2.4*K.size); scene.add(e.aura);
    e.label = new THREE.Sprite(new THREE.SpriteMaterial({map:labelTex('精鋭・' + E.name, E.css), transparent:true, depthTest:false}));
    e.label.scale.set(1.5, 0.375, 1); e.label.renderOrder = 6; scene.add(e.label);
    e.fill.material = eliteFillMat;
    if (elite === 'swift') e.speed *= 1.45;
    if (elite === 'guard') giveShield(e, e.maxhp*0.5);
  }
  if (opts.small){
    if (circle){ scene.remove(circle); e.circle = null; }
    e.g.scale.setScalar(K.size); e.g.position.y = terrainH(x, z) + 0.6;
    e.state = 'air'; e.vy = 7; e.hopAir = true; e.spin = 10*(opts.dir || 1);
    e.kb.set((opts.dir || 1)*4, 0, (Math.random()-0.5)*4);
  }
  enemies.push(e);
  sound('summon');
  if (kind === 'boss'){ $('boss').style.display = 'block'; $('bossname').textContent = K.name + '　WAVE ' + save.wave; }
  return e;
}
function bubbleTex(draw){
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#1d2340'; x.lineWidth = 8;
  x.beginPath(); x.arc(64, 56, 44, 0, Math.PI*2); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(52, 96); x.lineTo(64, 122); x.lineTo(76, 96); x.fill();
  draw(x); return new THREE.CanvasTexture(c);
}
const EMOTES = {
  '!': emoteTex,
  shock: bubbleTex(x => { x.fillStyle = '#ff9a3c'; x.font = 'bold 60px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?!', 64, 58); }),
  anger: bubbleTex(x => { x.strokeStyle = '#ff3b55'; x.lineWidth = 9; x.lineCap = 'round';
    for (let i=0;i<4;i++){ const a = i*Math.PI/2 + Math.PI/4; const cx = 64 + Math.cos(a)*15, cy = 56 + Math.sin(a)*15; x.beginPath(); x.arc(cx + Math.cos(a)*14, cy + Math.sin(a)*14, 14, a + Math.PI*0.75, a + Math.PI*1.25); x.stroke(); } }),
  sweat: bubbleTex(x => { x.fillStyle = '#4aa8ff'; x.beginPath(); x.moveTo(64, 22); x.bezierCurveTo(90, 56, 88, 84, 64, 84); x.bezierCurveTo(40, 84, 38, 56, 64, 22); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(56, 66, 6, 0, 7); x.fill(); }),
  happy: bubbleTex(x => { x.fillStyle = '#ff6fae'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♪', 64, 58); }),
};
function emote(e, kind){
  if (e.emote){ scene.remove(e.emote.s); e.emote = null; }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:EMOTES[kind || '!'] || emoteTex, transparent:true, depthTest:false}));
  s.scale.setScalar(0.7*Math.max(1, e.K.size*0.6)); s.renderOrder = 6; scene.add(s);
  e.emote = {s, life:1.1};
}
function makeStars(e){
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,2.0,0.6)});
  for (let i=0;i<3;i++){ const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), m); const a = i/3*6.28; s.position.set(Math.cos(a)*0.45, 0, Math.sin(a)*0.45); g.add(s); }
  g.position.y = 1.55; e.pivot.add(g); e.stars = g;
}
let spawnQueue = [], spawnT = 0, waveDelay = 0, waveActive = false, waveHurt = false;
function startWave(){
  const w = save.wave, n = Math.min(4 + Math.floor(w*1.3), 28);
  spawnQueue = [];
  if (w % 10 === 0){ spawnQueue.push('boss'); for (let i=0;i<Math.floor(n/3);i++) spawnQueue.push(i%3===2 && w>=20 ? 'mage' : 'normal'); }
  else for (let i=0;i<n;i++){
    const r = Math.random();
    spawnQueue.push(w >= 4 && r < 0.15 ? 'tank' : w >= 3 && r < 0.32 ? 'mage' : w >= 2 && r < 0.55 ? 'fast' : 'normal');
  }
  spawnT = 0; waveActive = true; waveHurt = false;
  showMsg(w % 10 === 0 ? '— BOSS WAVE ' + w + ' —' : 'WAVE ' + w);
  sound('wave');
  updateHUD();
}
function disposeEnemy(e){
  scene.remove(e.g); scene.remove(e.bar); removeTele(e);
  if (e.aura) scene.remove(e.aura); if (e.label) scene.remove(e.label);
  if (e.circle) scene.remove(e.circle);
  if (e.emote) scene.remove(e.emote.s);
}
function clearEnemies(){
  for (const e of enemies) disposeEnemy(e);
  enemies.length = 0; spawnQueue = [];
  for (const s of shots) scene.remove(s.m); shots.length = 0;
  clearHazards();
  $('boss').style.display = 'none';
}

// ================= 敵の弾 =================
const shots = [];
const shotGeo = new THREE.SphereGeometry(0.22, 14, 10), shotHaloGeo = new THREE.SphereGeometry(0.36, 14, 10);
const shotMat = new THREE.MeshBasicMaterial({color:new THREE.Color(2.4, 0.9, 2.2)});
const shotHaloMat = new THREE.MeshBasicMaterial({color:new THREE.Color(1.0, 0.3, 0.9), transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, depthWrite:false});
const homingMat = new THREE.MeshBasicMaterial({color:new THREE.Color(0.9, 2.4, 1.0)});
const homingHaloMat = new THREE.MeshBasicMaterial({color:new THREE.Color(0.3, 1.0, 0.4), transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, depthWrite:false});
function fireShot(from, dir, speed, dmg, homing){
  const m = new THREE.Mesh(shotGeo, homing ? homingMat : shotMat); m.add(new THREE.Mesh(shotHaloGeo, homing ? homingHaloMat : shotHaloMat));
  m.position.copy(from); scene.add(m);
  const s = {m, v:dir.clone().normalize().multiplyScalar(speed), dmg, life:homing ? 6 : 5, homing, speed};
  m.userData.shot = s; shots.push(s);
}
function popShot(s, byPlayer){
  burst(s.m.position, new THREE.Color(2.2, 0.9, 2.2), 10, 4);
  scene.remove(s.m); const i = shots.indexOf(s); if (i >= 0) shots.splice(i, 1);
  if (byPlayer){
    stat('shotDown');
    const v = waveScale(save.wave).rew*0.3*ST.gain; save.crystals += v;
    dmgNum(s.m.position, '撃墜 ◆' + fmt(v), 'gain'); sound('pop');
  }
}
function updateShots(dt){
  const chest = tmpV2.set(P.pos.x, P.pos.y + 1.1, P.pos.z);
  for (let i=shots.length-1;i>=0;i--){
    const s = shots[i]; s.life -= dt;
    if (s.homing && s.life > 1){ _a.copy(chest).sub(s.m.position).normalize().multiplyScalar(s.speed); s.v.lerp(_a, Math.min(1, dt*1.6)).setLength(s.speed); }
    s.m.position.addScaledVector(s.v, dt);
    s.m.rotation.y += dt*5;
    s.m.scale.setScalar(1 + Math.sin(time*20)*0.08);
    if (Math.random() < 0.3) burst(s.m.position, s.homing ? new THREE.Color(0.6, 1.8, 0.7) : new THREE.Color(1.6, 0.6, 1.6), 1, 0.8);
    if (s.m.position.distanceTo(chest) < 0.75){ playerHurt(s.dmg, s.m.position); if (!shots.includes(s)) return; popShot(s, false); if (state !== 'play') return; continue; }
    if (s.life <= 0 || s.m.position.y < terrainH(s.m.position.x, s.m.position.z)) popShot(s, false);
  }
}

// ================= エフェクト =================
const fx = [];
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const UP = new THREE.Vector3(0,1,0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
function beam(from, to, color, width, life){
  const dir = to.clone().sub(from), len = dir.length();
  const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({color, transparent:true, opacity:1, blending:THREE.AdditiveBlending, depthWrite:false}));
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  m.scale.set(width, len, width);
  scene.add(m); fx.push({m, life, max:life, type:'beam'});
}
const sparkGeo = new THREE.TetrahedronGeometry(0.07);
function burst(pos, color, n, speed){
  for (let i=0;i<n;i++){
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({color, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
    m.position.copy(pos);
    const v = new THREE.Vector3(Math.random()-0.5, Math.random()*0.8, Math.random()-0.5).normalize().multiplyScalar((speed||5)*(0.4+Math.random()));
    scene.add(m); fx.push({m, v, life:0.4+Math.random()*0.4, max:0.8, type:'spark'});
  }
}
const dustGeo = new THREE.IcosahedronGeometry(0.25, 0), dustMat = toon(0xd8c9a8, {transparent:true}, 0);
function dust(pos, n, spread){
  for (let i=0;i<n;i++){
    const a = Math.random()*6.28, m = new THREE.Mesh(dustGeo, dustMat.clone());
    m.position.set(pos.x + Math.cos(a)*spread*0.3, pos.y + 0.2, pos.z + Math.sin(a)*spread*0.3);
    scene.add(m); fx.push({m, v:new THREE.Vector3(Math.cos(a)*spread*1.5, 1.5+Math.random()*2, Math.sin(a)*spread*1.5), life:0.7, max:0.7, type:'dust'});
  }
}
const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
function ring(pos, color, size){
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color, transparent:true, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false}));
  m.position.copy(pos); m.rotation.x = -Math.PI/2;
  scene.add(m); fx.push({m, life:0.5, max:0.5, type:'ring', size});
}
let shake = 0;
function addShake(a){ shake = Math.min(1.2, shake + a); }
// 結晶ドロップ
const drops = [];
const dropGeo = new THREE.OctahedronGeometry(0.16);
const dropMat = new THREE.MeshBasicMaterial({color:new THREE.Color(0.7, 1.8, 2.2)});
function dropCrystals(pos, value){
  const n = Math.min(6, 1 + Math.floor(Math.log10(value+1)*1.5));
  for (let i=0;i<n;i++){
    const m = new THREE.Mesh(dropGeo, dropMat); m.position.copy(pos); m.scale.set(1,1.5,1);
    scene.add(m);
    drops.push({m, v:new THREE.Vector3((Math.random()-0.5)*5, 4+Math.random()*3, (Math.random()-0.5)*5), val:value/n, t:0});
  }
}
// ダメージ数字
const nums = [];
function dmgNum(pos, text, cls){
  const el = document.createElement('div'); el.className = 'num ' + cls; el.textContent = text;
  $('nums').appendChild(el);
  nums.push({el, pos:pos.clone(), life:0.9, vx:(Math.random()-0.5)*0.8});
  if (nums.length > 60) nums.shift().el.remove();
}
function updateNums(dt){
  for (let i=nums.length-1;i>=0;i--){
    const n = nums[i]; n.life -= dt; n.pos.y += dt*1.6; n.pos.x += n.vx*dt;
    if (n.life <= 0){ n.el.remove(); nums.splice(i,1); continue; }
    tmpV.copy(n.pos).project(camera);
    if (tmpV.z > 1){ n.el.style.display = 'none'; continue; }
    n.el.style.display = '';
    n.el.style.left = ((tmpV.x*0.5+0.5)*innerWidth) + 'px';
    n.el.style.top = ((-tmpV.y*0.5+0.5)*innerHeight) + 'px';
    n.el.style.opacity = Math.min(1, n.life*2.5);
  }
}

// ================= 守護オーブ =================
const turrets = [];
const orbMat = new THREE.MeshBasicMaterial({color:new THREE.Color(1.8, 1.5, 2.4)});
function syncTurrets(){
  while (turrets.length > ST.turrets){ scene.remove(turrets.pop().m); }
  while (turrets.length < ST.turrets){
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), orbMat);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 24), orbMat); m.add(halo);
    scene.add(m); turrets.push({m, halo, cd:Math.random()});
  }
}

// ================= 目標（章とミッション） =================
const CHAPTERS = [
  {title:'第1章　森の目覚め',   boss:10, dust:3,  goal:'WAVE 10 の「結晶の守護獣」を倒す'},
  {title:'第2章　風鳴りの丘',   boss:20, dust:5,  goal:'WAVE 20 の「疾風の守護獣」を倒す'},
  {title:'第3章　岩殻の砦',     boss:30, dust:8,  goal:'WAVE 30 の「岩殻の守護獣」を倒す'},
  {title:'第4章　星詠みの塔',   boss:40, dust:12, goal:'WAVE 40 の「星詠みの守護獣」を倒す'},
  {title:'終章　ルミナ・コア',  boss:50, dust:20, goal:'WAVE 50 の「大結晶ルミナ・コア」を砕く'},
];
const MISSIONS = [
  {stat:'moved',  n:25,  t:'WASD で歩き回ろう', r:0, min:15},
  {stat:'kills',  n:3,   t:'スピリットを倒そう', r:0, min:25},
  {stat:'upg',    n:1,   t:'B キーで強化メニューを開き、何か強化しよう', r:0, min:30},
  {stat:'dash',   n:3,   t:'E でダッシュしよう（一瞬無敵）', r:0, min:30},
  {stat:'djump',  n:3,   t:'空中でもう一度 Space で二段ジャンプ', r:0, min:30},
  {stat:'charge', n:2,   t:'右クリック長押し→離してチャージショット（貫通）', r:0, min:40},
  {stat:'nova',   n:2,   t:'Q でノヴァ — 周りの敵を吹き飛ばす', r:0, min:40},
  {stat:'plunge', n:2,   t:'ジャンプ中に C で落下攻撃', r:0, min:40},
  {stat:'burst',  n:1,   t:'F ゲージが溜まったらオーバードライブ', r:5, min:60},
  {stat:'comboMax', n:15, t:'コンボを 15 まで繋げよう', r:8, abs:true},
  {stat:'weak',   n:10,  t:'頭上の結晶（弱点）を撃とう — ダメージ2倍', r:6},
  {stat:'kills',  n:25,  t:'スピリットを倒そう', r:8},
  {stat:'wave',   n:5,   t:'WAVE 5 に到達しよう', r:10, abs:true},
  {stat:'shotDown', n:5, t:'星詠みの魔法弾を撃ち落とそう', r:10},
  {stat:'dodge',  n:3,   t:'赤い円の衝撃波をジャンプでかわそう', r:12},
  {stat:'crits',  n:40,  t:'会心ヒットを出そう', r:10},
  {stat:'upg',    n:12,  t:'強化を重ねよう', r:10},
  {stat:'stagger',n:5,   t:'会心で敵をよろめかせよう（ボス以外）', r:12},
  {stat:'noHit',  n:1,   t:'ノーダメージでウェーブをクリアしよう', r:15},
  {stat:'boss',   n:1,   t:'守護獣（ボス）を倒そう', r:20},
  {stat:'airKills', n:5, t:'ジャンプ中に敵を倒そう', r:12},
  {stat:'rushStun', n:2, t:'岩殻の突進を岩や木にぶつけてスタンさせよう', r:20},
  {stat:'shieldBreak', n:3, t:'星詠みのバリアを撃ち破ろう', r:15},
  {stat:'elite',  n:3,   t:'オーラをまとった「精鋭」を倒そう', r:25},
  {stat:'kills',  n:150, t:'スピリットを倒そう', r:20},
  {stat:'wave',   n:15,  t:'WAVE 15 に到達しよう（転生が解放）', r:25, abs:true},
  {stat:'prestige', n:1, t:'転生して星屑を手に入れよう', r:0, min:100, abs:true},
  {stat:'weak',   n:200, t:'弱点を撃ち抜こう', r:25},
  {stat:'noHit',  n:3,   t:'ノーダメージでウェーブをクリアしよう', r:30},
  {stat:'wave',   n:25,  t:'WAVE 25 に到達しよう', r:30, abs:true},
  {stat:'boss',   n:3,   t:'守護獣を倒そう', r:40},
  {stat:'comboMax', n:60, t:'コンボを 60 まで繋げよう', r:40, abs:true},
  {stat:'evade',  n:20,  t:'ダッシュの無敵で攻撃を回避しよう', r:30},
];
const ENDLESS = [
  {stat:'kills', base:300, t:'スピリットを倒そう', r:30},
  {stat:'weak',  base:150, t:'弱点を撃ち抜こう', r:30},
  {stat:'crits', base:200, t:'会心ヒットを出そう', r:30},
  {stat:'noHit', base:2,   t:'ノーダメージでウェーブをクリアしよう', r:40},
];
function missionDef(i){
  if (i < MISSIONS.length) return MISSIONS[i];
  const k = i - MISSIONS.length, tpl = ENDLESS[k % ENDLESS.length], tier = Math.floor(k / ENDLESS.length);
  return {stat:tpl.stat, n:Math.ceil(tpl.base*Math.pow(1.6, tier)), t:tpl.t, r:tpl.r*(1+tier*0.5)};
}
function statVal(m){ return m.stat === 'wave' ? save.bestWave : (save.stats[m.stat] || 0); }
function activateMission(i){ save.mstart[i] = statVal(missionDef(i)); }
function missionProg(i){ const m = missionDef(i); return m.abs ? statVal(m) : statVal(m) - (save.mstart[i] || 0); }
if (!save.active.length){ save.active = [0, 1, 2]; save.nextM = 3; save.active.forEach(activateMission); }
let goalsDirty = true;
function checkMissions(){
  for (let k=0;k<save.active.length;k++){
    const i = save.active[k], m = missionDef(i);
    if (missionProg(i) >= m.n){
      const reward = Math.max(m.min || 0, waveScale(Math.max(1, save.wave)).rew*m.r*ST.gain);
      save.crystals += reward;
      toast('目標達成！', m.t + '　◆+' + fmt(reward));
      sound('quest');
      save.active[k] = save.nextM; activateMission(save.nextM); save.nextM++;
      goalsDirty = true; persist();
    }
  }
}
function chapterBossKilled(w){
  const ch = CHAPTERS[save.chapter];
  if (!ch || w < ch.boss) return;
  save.stardust += ch.dust; computeStats();
  save.chapter++;
  const next = CHAPTERS[save.chapter];
  toast(ch.title + ' クリア！', '星屑 ✧+' + ch.dust + (next ? '　次の目標：' + next.goal : '　すべての章を制覇！'), true);
  showMsg(next ? ch.title.split('　')[0] + ' クリア！' : '— 全章制覇 —');
  goalsDirty = true; persist();
}
function renderGoals(){
  goalsDirty = false;
  const ch = CHAPTERS[save.chapter];
  if (ch){
    $('gch').textContent = ch.title;
    $('ggoal').textContent = ch.goal;
    const p = Math.min(1, (save.bestWave - 1)/(ch.boss - 1));
    $('gbar').style.width = (p*100) + '%';
    $('gsub').textContent = '最高到達 WAVE ' + save.bestWave + ' / ' + ch.boss + '　報酬 ✧' + ch.dust;
  } else {
    $('gch').textContent = 'エンドレス';
    $('ggoal').textContent = '最高ウェーブを更新し続けよう';
    $('gbar').style.width = '100%';
    $('gsub').textContent = '最高到達 WAVE ' + save.bestWave;
  }
  const el = $('gms'); el.innerHTML = '';
  for (const i of save.active){
    const m = missionDef(i), pr = Math.min(m.n, missionProg(i));
    const d = document.createElement('div'); d.className = 'm';
    d.innerHTML = '<div class="mt"><span>' + m.t + '</span><b>' + fmt(pr) + '/' + fmt(m.n) + '</b></div><div class="mb"><i style="width:' + (pr/m.n*100) + '%"></i></div>';
    el.appendChild(d);
  }
}
let toastQ = [], toastBusy = false;
function toast(title, body, big){
  toastQ.push({title, body, big});
  if (!toastBusy) nextToast();
}
function nextToast(){
  const t = toastQ.shift(); if (!t){ toastBusy = false; return; }
  toastBusy = true;
  const el = $('toast'); el.className = 'glass show' + (t.big ? ' big' : '');
  el.innerHTML = '<b>' + t.title + '</b><span>' + t.body + '</span>';
  setTimeout(() => { el.className = 'glass' + (t.big ? ' big' : ''); setTimeout(nextToast, 350); }, t.big ? 3600 : 2400);
}
function stat(name, n){ save.stats[name] = (save.stats[name] || 0) + (n || 1); goalsDirty = true; }

// ================= 戦闘 =================
const ray = new THREE.Raycaster();
const center = new THREE.Vector2();
function damageEnemy(e, amount, cls, point, dir, heavy, part){
  if (e.state === 'dying') return;
  const pt = point || e.g.position.clone().add(new THREE.Vector3(0, 1.5*e.K.size, 0));
  if (part === 'guard'){
    amount *= 0.25; cls = 'guard';
    burst(pt, new THREE.Color(2.4, 2.0, 0.9), 6, 5); sound('hit', 0.6);
    e.dome.scale.setScalar(1.15); setTimeout(() => e.dome && e.dome.scale.setScalar(1), 60);
  }
  e.shieldIdle = 0;
  if (e.shield > 0){
    const ab = Math.min(e.shield, amount);
    e.shield -= ab; amount -= ab; e.shieldHitT = 0.12;
    dmgNum(pt, fmt(ab), 'shield');
    if (e.shield <= 0) breakShield(e);
    if (amount <= 0){ e.tiltV -= 1.5; return; }
  }
  e.hp -= amount; e.flash = 0.08;
  dmgNum(pt, fmt(amount), cls);
  // 被弾リアクション
  const resist = e.kind === 'boss' ? 0.2 : e.kind === 'tank' ? 0.5 : 1;
  e.tiltV -= (heavy ? 7 : 4)*resist; e.sq = Math.max(e.sq, 0.18*resist + 0.05); e.mouthT = 0.25;
  if (dir) e.kb.addScaledVector(tmpV3.copy(dir).setY(0).normalize(), (heavy ? 3.5 : 1.6)*resist);
  if (heavy && e.kind !== 'boss' && part !== 'guard' && (e.state === 'chase' || e.state === 'windup') && Math.random() < 0.6){
    e.state = 'stagger'; e.st = 0; removeTele(e); stat('stagger'); setGuard(e, false);
    if (e.extras.orb) e.extras.orb.visible = false;
  }
  if (e.hp <= 0){ killEnemy(e); return; }
  if (e.kind === 'boss' && !e.enraged && e.hp < e.maxhp*0.6) enrage(e);
  if (e.kind === 'boss' && !e.awakened && e.hp < e.maxhp*0.25 && e.state !== 'jump') awaken(e);
  if (e.kind === 'tank' && !e.armorBroken && e.hp < e.maxhp*0.5) breakArmor(e);
  if (!e.fled && (e.kind === 'normal' || e.kind === 'fast' || e.kind === 'mage') && e.hp < e.maxhp*0.3 && (e.state === 'chase' || e.state === 'recover' || e.state === 'stagger')) startFlee(e);
}
function killEnemy(e){
  e.state = 'dying'; e.st = 0; e.bar.visible = false; removeTele(e); setGuard(e, false); setBubble(e, false); e.shield = 0;
  if (e.label){ scene.remove(e.label); e.label = null; } if (e.aura){ scene.remove(e.aura); e.aura = null; }
  onEnemyDeath(e);
  const c = e.g.position.clone().add(new THREE.Vector3(0, 0.8*e.K.size, 0));
  combo++; comboT = 3.2; if (combo > (save.stats.comboMax || 0)){ save.stats.comboMax = combo; goalsDirty = true; }
  bumpCombo();
  if (odT <= 0) burstG = Math.min(100, burstG + 5);
  dropCrystals(c, e.rew*ST.gain*comboMult());
  hitMarker(true, true);
  if (e.lastCrit) hitstop = Math.max(hitstop, 0.045);
  stat('kills');
  if (!P.onGround) stat('airKills');
  if (e.kind === 'boss'){
    $('boss').style.display = 'none'; stat('boss'); addShake(1); slowT = 1.6; flashA = 0.6; abFx = 1.2;
    chapterBossKilled(save.wave);
  }
  sound('kill');
}
function shoot(){
  if (state !== 'play' || reloading > 0 || fireCd > 0) return;
  if (mag <= 0){ startReload(); return; }
  if (odT <= 0) mag--; fireCd = ST.interval*(odT > 0 ? 0.45 : 1); recoil = 1; crossK = 1;
  flash.visible = true; flashLight.intensity = 3;
  setTimeout(() => { flash.visible = false; flashLight.intensity = 0; }, 45);
  sound('shot');
  const spread = P.onGround ? 0.006 : 0.025;
  center.set((Math.random()-0.5)*spread, (Math.random()-0.5)*spread);
  ray.setFromCamera(center, camera);
  const targets = blockers.slice();
  for (const e of enemies) if (e.state !== 'dying') targets.push(...e.hitMeshes);
  for (const s of shots) targets.push(s.m);
  const hits = ray.intersectObjects(targets, false);
  const muzzle = new THREE.Vector3(); flash.getWorldPosition(muzzle);
  const end = hits.length ? hits[0].point : ray.ray.at(120, new THREE.Vector3());
  if (odT > 0) beam(muzzle, end, new THREE.Color(2.0, 1.4, 0.5), 0.03, 0.09);
  else beam(muzzle, end, new THREE.Color(1.6, 1.9, 2.4), 0.018, 0.07);
  burst(muzzle, odT > 0 ? new THREE.Color(1.8,1.3,0.5) : new THREE.Color(1.6,1.5,1.1), 2, 2.5);
  if (hits.length){
    const h = hits[0], e = h.object.userData.e, s = h.object.userData.shot;
    if (s){ popShot(s, true); hitMarker(false); }
    else if (e){
      let amt = ST.dmg, cls = '';
      if (h.object.userData.weak){ amt *= 2; cls = 'weak'; stat('weak'); }
      const crit = Math.random() < ST.crit;
      if (crit){ amt *= 2.5; cls = 'crit'; stat('crits'); }
      e.lastCrit = crit;
      if (odT <= 0) burstG = Math.min(100, burstG + (cls === 'weak' ? 2.5 : 1.5));
      damageEnemy(e, amt, cls, h.point, ray.ray.direction, crit, h.object.userData.part);
      if (odT > 0) splash(h.point, 2.4, ST.dmg*0.5, e);
      burst(h.point, new THREE.Color(2, 1.6, 0.8), crit ? 12 : 6, 4);
      hitMarker(crit || cls === 'weak'); sound(crit ? 'crit' : 'hit');
    } else { burst(h.point, new THREE.Color(1.2, 1.2, 1.1), 4, 3); if (odT > 0) splash(h.point, 2.4, ST.dmg*0.5, null); }
  }
  if (mag === 0) startReload();
  updateHUD();
}
function startReload(){
  if (reloading > 0 || mag >= ST.mag || odT > 0) return;
  reloading = ST.reload; sound('reload');
  $('reload').textContent = 'リロード中…';
}
function playerHurt(amount, from){
  if (state !== 'play') return;
  if (iframe > 0){
    if (evadeT <= 0){ evadeT = 0.4; stat('evade'); sound('evade'); dmgNum(camera.position.clone().addScaledVector(fwdOf(), 2.5).add(new THREE.Vector3(0,-0.3,0)), '回避！', 'evade'); }
    return;
  }
  P.hp -= amount; damageFlash(); sound('hurt'); waveHurt = true; addShake(0.35);
  if (from){ const d = P.pos.clone().sub(from).setY(0).normalize(); P.vel.addScaledVector(d, 7); }
  if (P.hp <= 0){
    const back = Math.max(1, save.wave - 3);
    clearEnemies();
    save.wave = back; P.hp = ST.maxhp; mag = ST.mag; reloading = 0;
    P.pos.set(0, terrainH(0,0), 0); P.vel.set(0,0,0);
    showMsg('倒れた… WAVE ' + back + ' から再開');
    toast('ヒント', '強化メニュー（B）で攻撃力や最大HPを上げよう。倒れても結晶と強化は残ります。');
    waveActive = false; waveDelay = 2.5; persist();
  }
  updateHUD();
}
function aoe(cx, cz, r, dmg){
  const gy = terrainH(cx, cz);
  ring(new THREE.Vector3(cx, gy + 0.15, cz), new THREE.Color(2.4, 1.6, 1.0), r);
  dust(new THREE.Vector3(cx, gy, cz), 14, r*0.6);
  sound('slam');
  const d = Math.hypot(P.pos.x - cx, P.pos.z - cz);
  addShake(Math.max(0.15, 0.9 - d/25));
  if (d < r){
    const air = P.pos.y - terrainH(P.pos.x, P.pos.z) > 0.45 || iframe > 0;
    if (air){ stat('dodge'); dmgNum(P.pos.clone().add(new THREE.Vector3(0, 2, 0)).addScaledVector(fwdOf(), 2), 'かわした！', 'weak'); }
    else playerHurt(dmg, new THREE.Vector3(cx, gy, cz));
  }
}
function fwdOf(){ return new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); }

// ---- プレイヤーのアクション ----
const comboMult = () => 1 + Math.min(1, combo*0.02);
const TIERS = [[10,'Nice!'],[25,'Great!'],[50,'Excellent!'],[100,'LUMINOUS!!'],[200,'GODLIKE!!!']];
let tierT;
function bumpCombo(){
  const el = $('combo'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  sound('combo', 1 + Math.min(1.5, combo*0.03));
  for (const [n, label] of TIERS) if (combo === n){
    const t = $('tier'); t.textContent = label; t.className = 'on'; clearTimeout(tierT); tierT = setTimeout(() => t.className = '', 1300);
    flashA = Math.max(flashA, 0.15); sound('quest');
  }
}
function launch(e, dx, dz, force, up){
  if (e.state === 'dying' || e.state === 'spawn') return;
  const k = e.kind === 'boss' ? 0.08 : e.kind === 'tank' ? 0.55 : 1;
  e.kb.x += dx*force*k; e.kb.z += dz*force*k;
  if (e.kind === 'boss') return;
  removeTele(e); if (e.extras.orb) e.extras.orb.visible = false;
  e.state = 'air'; e.st = 0; e.vy = up*k; e.airRot = 0; e.spin = (Math.random() < 0.5 ? -1 : 1)*(8 + Math.random()*6);
  if (e.g.position.y < terrainH(e.g.position.x, e.g.position.z)) e.g.position.y = terrainH(e.g.position.x, e.g.position.z);
}
function splash(point, r, dmg, except){
  burst(point, new THREE.Color(2.6, 1.6, 0.6), 10, 6);
  ring(point.clone(), new THREE.Color(2.6, 1.7, 0.7), r);
  sound('explode', 1.4);
  for (const e of enemies){
    if (e === except || e.state === 'dying' || e.state === 'spawn') continue;
    const c = tmpV.copy(e.g.position); c.y += 0.7*e.K.size;
    const d = c.distanceTo(point);
    if (d < r + e.r) damageEnemy(e, dmg*(1 - d/(r+e.r)*0.5), '', c.clone(), c.clone().sub(point), false);
  }
}
function doDash(){
  if (dashN <= 0) return;
  dashN--; dashT = 0.17; iframe = 0.32;
  dashDir.copy(wish.lengthSq() > 0 ? wish : fwdOf()).setY(0).normalize();
  if (!P.onGround) P.vel.y = Math.max(P.vel.y, 1.5);
  fovKick = 12; zoomFx = 0.8; speedA = 1;
  sound('dash'); stat('dash');
}
function doJump(){
  if (P.onGround){ P.vel.y = 7.5; P.onGround = false; jumps = 1; return; }
  if (jumps < 2 && !plunging){
    jumps = 2; P.vel.y = 8;
    const f = P.pos.clone(); f.y += 0.1;
    ring(f, new THREE.Color(1.6, 2.0, 2.4), 2.2);
    burst(f, new THREE.Color(1.8, 2, 2.4), 10, 4);
    fovKick = Math.max(fovKick, 4);
    sound('djump'); stat('djump');
  }
}
function doPlunge(){
  if (P.onGround || plunging) return;
  if (P.pos.y - terrainH(P.pos.x, P.pos.z) < 0.6) return;
  plunging = true; P.vel.y = -32; P.vel.x *= 0.3; P.vel.z *= 0.3; fovKick = 8; speedA = 1;
  sound('lunge');
}
function plungeImpact(){
  plunging = false;
  const c = P.pos.clone(), R = 4.8;
  ring(c.clone().setY(c.y + 0.15), new THREE.Color(1.8, 1.4, 0.7), R);
  ring(c.clone().setY(c.y + 0.25), new THREE.Color(1.1, 1.4, 1.8), R*0.6);
  dust(c, 16, 2.5); burst(c.clone().setY(c.y + 0.3), new THREE.Color(1.7, 1.4, 0.8), 16, 8);
  addShake(0.8); abFx = 0.6; hitstop = 0.05; iframe = Math.max(iframe, 0.25);
  sound('plunge'); sound('nova', 1.3); stat('plunge');
  for (const e of enemies){
    if (e.state === 'dying' || e.state === 'spawn') continue;
    const dx = e.g.position.x - c.x, dz = e.g.position.z - c.z, d = Math.hypot(dx, dz) || 0.01;
    if (d < R + e.r){
      damageEnemy(e, ST.dmg*4*ST.skill*(1 - d/(R+e.r)*0.4), 'big', e.g.position.clone().add(new THREE.Vector3(0, 1.2*e.K.size, 0)), new THREE.Vector3(dx, 0, dz), true);
      launch(e, dx/d, dz/d, 4, 8);
    }
  }
}
const novaGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
function doNova(){
  if (novaCd > 0) return;
  novaCd = NOVA_CD;
  const c = P.pos.clone(), R = 7.5;
  const m = new THREE.Mesh(novaGeo, new THREE.MeshBasicMaterial({color:new THREE.Color(1.3, 1.05, 0.5), transparent:true, opacity:0.5, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}));
  m.position.copy(c).setY(c.y + 0.9); scene.add(m); fx.push({m, life:0.5, max:0.5, type:'nova', size:R});
  ring(c.clone().setY(c.y + 0.15), new THREE.Color(1.8, 1.4, 0.6), R*1.15);
  dust(c, 20, 3); burst(c.clone().setY(c.y + 0.6), new THREE.Color(1.8, 1.5, 0.7), 26, 10);
  addShake(0.9); abFx = 0.8; zoomFx = 1.1; flashA = 0.12; hitstop = 0.07;
  sound('nova'); stat('nova');
  for (const e of enemies){
    if (e.state === 'dying' || e.state === 'spawn') continue;
    const dx = e.g.position.x - c.x, dz = e.g.position.z - c.z, d = Math.hypot(dx, dz) || 0.01;
    if (d < R + e.r){
      damageEnemy(e, ST.dmg*6*ST.skill*(1 - d/(R+e.r)*0.4), 'big', e.g.position.clone().add(new THREE.Vector3(0, 1.2*e.K.size, 0)), new THREE.Vector3(dx, 0, dz), true);
      launch(e, dx/d, dz/d, 11*(1 - d/R*0.5), 9);
    }
  }
  for (const s of shots.slice()) if (s.m.position.distanceTo(c) < R + 1.5) popShot(s, true);
}
function startCharge(){ if (mag > 0 && reloading <= 0){ charging = true; chargeT = 0; } }
function releaseCharge(){
  if (!charging) return;
  charging = false;
  const c = Math.min(1, chargeT/1.1); chargeT = 0;
  if (c < 0.2 || mag <= 0 || state !== 'play') return;
  if (odT <= 0) mag = Math.max(0, mag - 3);
  ray.setFromCamera(center.set(0, 0), camera);
  const targets = blockers.slice();
  for (const e of enemies) if (e.state !== 'dying') targets.push(...e.hitMeshes);
  for (const s of shots) targets.push(s.m);
  const hits = ray.intersectObjects(targets, false);
  const muzzle = new THREE.Vector3(); flash.getWorldPosition(muzzle);
  let end = ray.ray.at(120, new THREE.Vector3());
  const done = new Set(); let pierced = 0;
  for (const h of hits){
    const e = h.object.userData.e, s = h.object.userData.shot;
    if (s){ popShot(s, true); continue; }
    if (e){
      if (done.has(e) || e.state === 'dying') continue;
      done.add(e); pierced++;
      let amt = ST.dmg*(2 + 5*c)*ST.skill, cls = 'big';
      if (h.object.userData.weak){ amt *= 2; stat('weak'); }
      const crit = Math.random() < ST.crit; if (crit){ amt *= 2.5; cls = 'crit'; stat('crits'); }
      e.lastCrit = true;
      damageEnemy(e, amt, cls, h.point, ray.ray.direction, true, h.object.userData.part);
      burst(h.point, new THREE.Color(2.6, 2.0, 0.8), 14, 7);
      launch(e, ray.ray.direction.x, ray.ray.direction.z, 6*c, 3 + 4*c);
      continue;
    }
    end = h.point; break;
  }
  const w = 0.05 + 0.12*c;
  beam(muzzle, end, new THREE.Color(2.6, 1.9, 0.8), w, 0.3);
  beam(muzzle, end, new THREE.Color(3, 3, 3), w*0.35, 0.22);
  ring(muzzle.clone(), new THREE.Color(2.6, 2.0, 1.0), 0.6);
  splash(end, 2 + 1.5*c, ST.dmg*2*c*ST.skill, null);
  if (pierced >= 2) dmgNum(end.clone().add(new THREE.Vector3(0, 1, 0)), pierced + ' 体貫通！', 'weak');
  recoil = 2.5; crossK = 2; addShake(0.35 + 0.5*c); abFx = 0.9; zoomFx = 0.6; hitstop = 0.05; fovKick = 6;
  sound('beam'); stat('charge');
  updateHUD();
}
function doBurst(){
  if (burstG < 100 || odT > 0) return;
  odT = OD_TIME; burstG = 0; mag = ST.mag; reloading = 0; $('reload').textContent = '';
  flashA = 0.25; abFx = 0.8; zoomFx = 1; addShake(0.6); hitstop = 0.08;
  ring(P.pos.clone().setY(P.pos.y + 0.2), new THREE.Color(1.8, 1.3, 0.5), 9);
  burst(P.pos.clone().setY(P.pos.y + 0.6), new THREE.Color(1.8, 1.3, 0.5), 24, 9);
  for (const e of enemies){ const dx = e.g.position.x - P.pos.x, dz = e.g.position.z - P.pos.z, d = Math.hypot(dx, dz) || 0.01; if (d < 6) launch(e, dx/d, dz/d, 8, 6); }
  showMsg('— OVERDRIVE —'); sound('burst'); stat('burst');
  updateHUD();
}
function updateAbilities(dt){
  if (dashN < 2){ dashRe += dt; if (dashRe >= DASH_RE){ dashN++; dashRe = 0; } }
  iframe = Math.max(0, iframe - dt); evadeT -= dt;
  novaCd = Math.max(0, novaCd - dt);
  if (odT > 0){ odT -= dt; if (Math.random() < 0.3){ const m = new THREE.Vector3(); flash.getWorldPosition(m); burst(m, new THREE.Color(1.6,1.2,0.5), 1, 1); } if (odT <= 0){ odT = 0; showMsg('オーバードライブ終了'); } }
  if (comboT > 0){ comboT -= dt; if (comboT <= 0){ combo = 0; } }
  if (charging){
    if (mag <= 0 || reloading > 0){ charging = false; chargeT = 0; }
    else {
      const before = chargeT; chargeT += dt;
      const c = Math.min(1, chargeT/1.1);
      if (Math.floor(before*10) !== Math.floor(chargeT*10) && c < 1) sound('chargeT', 1 + c);
      if (c >= 1 && before/1.1 < 1){ sound('quest'); flashA = Math.max(flashA, 0.1); }
      const m = new THREE.Vector3(); flash.getWorldPosition(m);
      if (Math.random() < 0.6 + c*0.4){
        const p = m.clone().add(new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).multiplyScalar(0.8));
        const sp = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({color:new THREE.Color(2.6, 2.0, 0.8), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
        sp.position.copy(p); scene.add(sp);
        fx.push({m:sp, v:m.clone().sub(p).multiplyScalar(5), life:0.2, max:0.2, type:'spark', nograv:true});
      }
    }
  }
  if (dashT > 0 && Math.random() < 0.9){
    const p = camera.position.clone().addScaledVector(dashDir, 4).add(new THREE.Vector3((Math.random()-0.5)*4, (Math.random()-0.5)*2.5, (Math.random()-0.5)*4));
    const sp = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({color:new THREE.Color(1.6, 2.0, 2.6), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
    sp.position.copy(p); sp.scale.set(0.6, 0.6, 6); sp.lookAt(p.clone().add(dashDir)); scene.add(sp);
    fx.push({m:sp, v:dashDir.clone().multiplyScalar(-30), life:0.18, max:0.18, type:'spark', nograv:true});
  }
}
function updateSkillHUD(dt){
  const set = (id, p, ready, active) => { const el = $(id); el.querySelector('.cdv').style.setProperty('--p', p); el.classList.toggle('ready', !!ready && !active); el.classList.toggle('active', !!active); };
  set('skE', dashN < 2 ? 1 - dashRe/DASH_RE : 0, dashN > 0, dashT > 0); $('dashN').textContent = dashN;
  set('skR', 0, mag > 0 && reloading <= 0, charging);
  set('skQ', novaCd/NOVA_CD, novaCd <= 0, false);
  set('skC', 0, !P.onGround && !plunging, plunging);
  if (odT > 0){ set('skF', 1 - odT/OD_TIME, false, true); $('burstP').textContent = odT.toFixed(1); }
  else { set('skF', 1 - burstG/100, burstG >= 100, false); $('burstP').textContent = Math.floor(burstG) + '%'; }
  const cEl = $('combo');
  cEl.style.opacity = combo >= 2 ? 1 : 0;
  if (combo >= 2){ $('cn').textContent = combo; $('cm').textContent = '結晶 ×' + comboMult().toFixed(2); $('cbar').style.width = (comboT/3.2*100) + '%'; }
  const c = charging ? Math.min(1, chargeT/1.1) : 0;
  const ring = $('chargeRing'); ring.style.opacity = charging ? 1 : 0; ring.style.setProperty('--c', c);
  crossK = Math.max(0, crossK - dt*8);
  $('cross').style.transform = 'translate(-50%,-50%) scale(' + (1 + crossK*0.35 + c*0.4) + ')';
  speedA = Math.max(dashT > 0 || plunging ? 1 : 0, speedA - dt*4);
  const sprintA = (keys.ShiftLeft || keys.ShiftRight) && P.vel.lengthSq() > 30 ? 0.3 : 0;
  $('speed').style.opacity = Math.max(speedA, sprintA);
  $('speed').style.transform = 'rotate(' + (time*40 % 360) + 'deg)';
  $('tint').style.opacity = odT > 0 ? 0.4 + Math.sin(time*6)*0.12 : 0;
  flashA = Math.max(0, flashA - dt*3); $('flashov').style.opacity = flashA;
  abFx = Math.max(0, abFx - dt*2.5); zoomFx = Math.max(0, zoomFx - dt*3);
  if (composer && gradePass){
    gradePass.uniforms.uAb.value = abFx + c*0.3 + (odT > 0 ? 0.1 : 0);
    gradePass.uniforms.uZoom.value = zoomFx + (dashT > 0 ? 0.8 : 0);
    gradePass.uniforms.uTintAmt.value = odT > 0 ? 0.22 + Math.sin(time*6)*0.06 : 0;
  }
}

// ---- 敵の行動 ----
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function playerAiming(e, cosLim){
  _a.copy(e.g.position); _a.y += 0.8*e.K.size; _a.sub(camera.position);
  const d = _a.length(); if (d > 40) return false;
  _a.divideScalar(d); camera.getWorldDirection(_b);
  return _a.dot(_b) > (cosLim || 0.992);
}
const firing = () => mouseDown || charging;
// 突進の予告（直線）
function makeLineTele(e, len){
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(2.2, len); geo.rotateX(-Math.PI/2); geo.translate(0, 0, -len/2);
  const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:0xff3050, transparent:true, opacity:0.2, depthTest:false, depthWrite:false}));
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:0xff5060, transparent:true, opacity:0.35, depthTest:false, depthWrite:false}));
  g.add(base, fill); g.renderOrder = 5; scene.add(g);
  return {g, fill, line:true};
}
// 時間差の危険地帯（隕石・自爆）
const hazards = [];
const meteorGeo = new THREE.IcosahedronGeometry(0.9, 1);
function addHazard(x, z, r, dmg, delay, kind){
  const tele = makeTelegraph(x, z, r);
  const h = {x, z, r, dmg, t:0, delay, tele, kind, m:null};
  if (kind === 'meteor'){
    h.m = new THREE.Mesh(meteorGeo, new THREE.MeshBasicMaterial({color:new THREE.Color(2.6, 1.2, 0.5)}));
    h.m.add(new THREE.Mesh(shotHaloGeo, new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,0.5,0.2), transparent:true, opacity:0.5, blending:THREE.AdditiveBlending, depthWrite:false})));
    h.m.children[0].scale.setScalar(4);
    scene.add(h.m);
  }
  hazards.push(h);
}
function updateHazards(dt){
  for (let i=hazards.length-1;i>=0;i--){
    const h = hazards[i]; h.t += dt;
    const p = Math.min(1, h.t/h.delay);
    h.tele.fill.scale.setScalar(p);
    if (h.kind === 'bomb') h.tele.g.children[1].material.opacity = 0.5 + Math.sin(h.t*30)*0.4;
    if (h.m){
      const gy = terrainH(h.x, h.z);
      h.m.position.set(h.x + (1-p)*6, gy + (1-p)*32, h.z - (1-p)*3);
      h.m.rotation.x += dt*6; h.m.rotation.y += dt*4;
      if (Math.random() < 0.7) burst(h.m.position, new THREE.Color(2.4, 1.0, 0.3), 1, 1);
    }
    if (p >= 1){
      scene.remove(h.tele.g); if (h.m) scene.remove(h.m);
      const c = new THREE.Vector3(h.x, terrainH(h.x, h.z) + 0.4, h.z);
      burst(c, h.kind === 'bomb' ? new THREE.Color(2.6, 1.3, 0.4) : new THREE.Color(2.6, 1.0, 0.3), 22, 9);
      aoe(h.x, h.z, h.r, h.dmg);
      const j = hazards.indexOf(h); if (j < 0) return; hazards.splice(j, 1);
    }
  }
}
// 衝撃波リング（ボス覚醒後）
const waves = [];
const waveGeo = new THREE.CylinderGeometry(1, 1, 0.7, 72, 1, true);
function addWave(x, z, dmg){
  const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({color:new THREE.Color(2.4, 0.7, 1.2), transparent:true, opacity:0.85, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false}));
  m.position.set(x, terrainH(x, z) + 0.35, z); scene.add(m);
  waves.push({m, x, z, R:1.5, dmg, hit:false, passed:false});
  sound('slam');
}
function updateWaves(dt){
  for (let i=waves.length-1;i>=0;i--){
    const w = waves[i]; w.R += dt*10;
    w.m.scale.set(w.R, 1, w.R);
    w.m.material.opacity = Math.max(0, 0.85 - w.R/45);
    const d = Math.hypot(P.pos.x - w.x, P.pos.z - w.z);
    if (!w.passed && Math.abs(d - w.R) < 0.55){
      const air = P.pos.y - terrainH(P.pos.x, P.pos.z) > 0.4 || iframe > 0;
      if (air){ w.passed = true; stat('dodge'); dmgNum(camera.position.clone().addScaledVector(fwdOf(), 2.5), 'かわした！', 'weak'); }
      else if (!w.hit){ w.hit = true; w.passed = true; playerHurt(w.dmg, new THREE.Vector3(w.x, 0, w.z)); if (state !== 'play' || !waves.includes(w)) return; }
    }
    if (w.R > 45){ scene.remove(w.m); waves.splice(i, 1); }
  }
}
function clearHazards(){
  for (const h of hazards){ scene.remove(h.tele.g); if (h.m) scene.remove(h.m); } hazards.length = 0;
  for (const w of waves) scene.remove(w.m); waves.length = 0;
  pendingSpawns.length = 0;
}
const pendingSpawns = [];

// ---- 特殊状態 ----
function setBubble(e, on){
  if (!e.bubble) return;
  e.bubble.visible = on;
  const i = e.hitMeshes.indexOf(e.bubble);
  if (on && i < 0) e.hitMeshes.unshift(e.bubble);
  if (!on && i >= 0) e.hitMeshes.splice(i, 1);
}
function giveShield(e, amount){
  if (!e.bubble){
    e.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({color:new THREE.Color(0.5, 1.4, 2.2), transparent:true, opacity:0.28, blending:THREE.AdditiveBlending, depthWrite:false}));
    e.bubble.position.y = 0.95; e.bubble.scale.set(1.25, 1.35, 1.25);
    e.bubble.userData.e = e; e.bubble.userData.part = 'bubble';
    e.g.add(e.bubble);
  }
  e.shield = e.shieldMax = Math.max(e.shieldMax, amount); e.shieldIdle = 0;
  setBubble(e, true);
}
function breakShield(e){
  e.shield = 0; setBubble(e, false);
  const c = e.g.position.clone().add(new THREE.Vector3(0, 0.9*e.K.size, 0));
  burst(c, new THREE.Color(0.8, 1.8, 2.6), 20, 7);
  ring(c, new THREE.Color(0.8, 1.8, 2.6), 2*e.K.size);
  dmgNum(c.clone().add(new THREE.Vector3(0, 0.8, 0)), 'ブレイク！', 'weak');
  sound('pop', 1.5); stat('shieldBreak');
  e.state = e.state === 'dying' ? 'dying' : 'stagger'; e.st = 0;
}
function setGuard(e, on){
  if (!e.dome) return;
  if (e.guarding === on) return;
  e.guarding = on; e.dome.visible = on;
  const i = e.hitMeshes.indexOf(e.dome);
  if (on && i < 0) e.hitMeshes.unshift(e.dome);
  if (!on && i >= 0) e.hitMeshes.splice(i, 1);
}
function breakArmor(e){
  e.armorBroken = true; setGuard(e, false);
  for (const r of (e.extras.rocks || [])){
    const wp = new THREE.Vector3(); r.getWorldPosition(wp);
    r.parent.remove(r);
    const m = new THREE.Mesh(r.geometry, rockMat); m.position.copy(wp); m.scale.setScalar(e.K.size*0.9); scene.add(m);
    const v = wp.clone().sub(e.g.position).setY(0).normalize().multiplyScalar(5 + Math.random()*3); v.y = 5 + Math.random()*3;
    fx.push({m, v, life:1.4, max:1.4, type:'debris', spinv:new THREE.Vector3(Math.random()*8, Math.random()*8, Math.random()*8)});
  }
  e.speed *= 1.45; e.rage = 999;
  emote(e, 'anger'); addShake(0.4); sound('roar');
  dmgNum(e.g.position.clone().add(new THREE.Vector3(0, 2*e.K.size, 0)), '鎧が砕けた！', 'weak');
}
function startFlee(e){
  e.fled = true; e.state = 'flee'; e.st = 0; removeTele(e);
  if (e.extras.orb) e.extras.orb.visible = false;
  emote(e, 'sweat');
}
function enrage(e){ // ボス第2段階
  e.enraged = true; e.speed *= 1.3;
  showMsg(e.K.name + 'が怒った！');
  $('bossname').textContent = e.K.name + '　— 怒り —';
  addShake(0.8); sound('roar'); emote(e, 'anger');
  ring(e.g.position.clone().add(new THREE.Vector3(0,0.2,0)), new THREE.Color(2.4,0.6,0.8), 9);
  for (let i=0;i<3;i++) spawnQueue.unshift('normal');
}
function awaken(e){ // ボス第3段階
  e.awakened = true; e.state = 'awaken'; e.st = 0; removeTele(e);
  showMsg(e.K.name + 'が覚醒した！');
  $('bossname').textContent = e.K.name + '　— 覚醒 —';
  sound('roar'); addShake(1);
  for (let i=0;i<2;i++) spawnQueue.unshift('mage');
}
function onEnemyDeath(e){
  const pos = e.g.position;
  if (e.elite){ stat('elite'); }
  if (e.elite === 'split'){
    for (let i=0;i<2;i++) pendingSpawns.push({kind:e.kind === 'boss' ? 'normal' : e.kind, x:pos.x, z:pos.z, dir:i ? 1 : -1});
  }
  if (e.elite === 'bomb'){
    addHazard(pos.x, pos.z, 3.4, e.dmg*1.6, 1.0, 'bomb');
    dmgNum(pos.clone().add(new THREE.Vector3(0, 2, 0)), '離れて！', 'crit');
  }
  // 仲間の反応
  for (const o of enemies){
    if (o === e || o.state === 'dying' || o.state === 'spawn' || o.kind === 'boss') continue;
    const d = o.g.position.distanceTo(pos);
    if (d > 11) continue;
    if (!o.fled && o.kind !== 'tank' && Math.random() < 0.25){ o.fleeShort = true; startFlee(o); o.st = 1.3; }
    else { o.rage = Math.max(o.rage, 5); emote(o, Math.random() < 0.5 ? 'shock' : 'anger'); }
  }
}

function beginWindup(e, atk, t){
  e.state = 'windup'; e.st = 0; e.atk = atk; e.wt = t*(e.rage > 0 ? 0.75 : 1);
  sound('charge');
  if (atk === 'slam') e.tele = makeTelegraph(e.g.position.x, e.g.position.z, e.kind === 'boss' ? 5.5 : 3.6);
  if (atk === 'charge') e.tele = makeLineTele(e, 16);
  if (atk === 'shoot' || atk === 'volley' || atk === 'homing' || atk === 'barrier'){ if (e.extras.orb) e.extras.orb.visible = true; }
  if (atk === 'meteor' || atk === 'waves') emote(e, 'anger');
}
function toRecover(e, t){ e.state = 'recover'; e.st = 0; e.wt = t; e.cd = e.K.cd*(0.7 + Math.random()*0.6)*(e.enraged ? 0.6 : 1)*(e.rage > 0 ? 0.6 : 1)*(e.awakened ? 0.8 : 1); }
function execAttack(e, tx, tz, dist){
  const pos = e.g.position;
  if (e.atk === 'lunge'){
    e.state = 'attack'; e.st = 0; e.hitDone = false;
    let ax = tx, az = tz;
    if (e.kind === 'fast' && e.comboLeft < 3){ const a = e.zig*0.55, c = Math.cos(a), s = Math.sin(a); ax = tx*c - tz*s; az = tx*s + tz*c; }
    e.lv.set(ax, 0, az).multiplyScalar(e.kind === 'fast' ? 14 : 10 + (e.comboLeft < 2 ? 2 : 0));
    sound('lunge');
  } else if (e.atk === 'slam'){
    removeTele(e);
    aoe(pos.x, pos.z, e.kind === 'boss' ? 5.5 : 3.6, e.dmg*1.3);
    e.sq = 0.45;
    toRecover(e, 0.8);
  } else if (e.atk === 'shoot' || e.atk === 'volley' || e.atk === 'homing'){
    const from = new THREE.Vector3(); (e.extras.orb || e.crys).getWorldPosition(from);
    if (e.extras.orb) e.extras.orb.visible = false;
    const target = new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z);
    const dir = target.sub(from).normalize();
    if (e.atk === 'homing'){
      for (let i=0;i<3;i++){ const d = dir.clone().applyAxisAngle(UP, (i-1)*0.9); d.y += 0.5; fireShot(from, d, 6.5, e.dmg*0.7, true); }
    } else {
      const n = e.atk === 'volley' ? (e.enraged ? 7 : 5) : (save.wave >= 12 ? 3 : 1);
      for (let i=0;i<n;i++){ const d = dir.clone().applyAxisAngle(UP, (i - (n-1)/2)*0.16); fireShot(from, d, e.kind === 'boss' ? 12 : 10, e.dmg*0.8); }
    }
    sound('cast');
    toRecover(e, 0.5);
  } else if (e.atk === 'barrier'){
    if (e.extras.orb) e.extras.orb.visible = false;
    const ally = e.barrierTarget;
    if (ally && ally.state !== 'dying' && enemies.includes(ally)){
      const from = new THREE.Vector3(); e.crys.getWorldPosition(from);
      const to = ally.g.position.clone().add(new THREE.Vector3(0, 0.9*ally.K.size, 0));
      beam(from, to, new THREE.Color(0.8, 2.2, 1.4), 0.05, 0.4);
      giveShield(ally, ally.maxhp*0.35);
      dmgNum(to.clone().add(new THREE.Vector3(0, 1, 0)), 'バリア', 'orb');
      sound('quest', 0.7);
    }
    e.barrierCd = 9; toRecover(e, 0.6);
  } else if (e.atk === 'jump'){
    e.state = 'jump'; e.st = 0;
    e.from = pos.clone();
    const lead = Math.min(ARENA - 3, Math.hypot(P.pos.x, P.pos.z));
    const ang = Math.atan2(P.pos.z, P.pos.x);
    e.to = new THREE.Vector3(Math.cos(ang)*lead, 0, Math.sin(ang)*lead);
    e.tele = makeTelegraph(e.to.x, e.to.z, 5.5);
    sound('lunge');
  } else if (e.atk === 'charge'){
    removeTele(e);
    e.state = 'rush'; e.st = 0; e.hitDone = false;
    e.rushDir = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    sound('roar', 1.6); addShake(0.2);
  } else if (e.atk === 'spin'){
    e.state = 'spin'; e.st = 0; e.spinHit = 0; sound('lunge', 0.7);
  } else if (e.atk === 'meteor'){
    const n = 7;
    for (let i=0;i<n;i++){
      let x, z;
      if (i === 0){ x = P.pos.x; z = P.pos.z; }
      else { const a = Math.random()*6.28, r = 3 + Math.random()*8; x = P.pos.x + Math.cos(a)*r; z = P.pos.z + Math.sin(a)*r; }
      const d = Math.hypot(x, z); if (d > ARENA - 1){ x *= (ARENA-1)/d; z *= (ARENA-1)/d; }
      addHazard(x, z, 2.4, e.dmg*1.2, 1.1 + i*0.14, 'meteor');
    }
    sound('roar', 1.3);
    toRecover(e, 1.2);
  } else if (e.atk === 'waves'){
    e.state = 'waves'; e.st = 0; e.wavesN = 0;
  }
}
function chooseAttack(e, dist){
  if (e.cd > 0) return false;
  switch (e.kind){
    case 'normal': if (dist < 3.4){ e.comboLeft = Math.random() < 0.6 ? 2 : 1; beginWindup(e, 'lunge', 0.5); return true; } break;
    case 'fast':   if (dist < 4.8){ e.comboLeft = 3; e.zig = 1; beginWindup(e, 'lunge', 0.32); return true; } break;
    case 'tank':
      if (dist < 3.0){ beginWindup(e, 'slam', 0.95); return true; }
      if (dist > 6 && dist < 18 && Math.random() < 0.5){ beginWindup(e, 'charge', 0.85); return true; }
      break;
    case 'mage': {
      if (e.barrierCd <= 0){
        let best = null, bd = 13;
        for (const o of enemies){ if (o === e || o.state === 'dying' || o.state === 'spawn' || o.shield > 0) continue; const d = o.g.position.distanceTo(e.g.position); if (d < bd){ bd = d; best = o; } }
        if (best){ e.barrierTarget = best; beginWindup(e, 'barrier', 0.7); return true; }
      }
      if (dist < 22){ beginWindup(e, Math.random() < 0.4 ? 'homing' : 'shoot', 0.75); return true; }
      break;
    }
    case 'boss': {
      const r = Math.random();
      if (e.awakened && r < 0.3){ beginWindup(e, 'meteor', 0.9); return true; }
      if (e.awakened && r < 0.55){ beginWindup(e, 'waves', 0.7); return true; }
      if (e.enraged && dist < 11 && r < 0.75){ beginWindup(e, 'spin', 0.7); return true; }
      if (dist < 4.8){ beginWindup(e, 'slam', 0.85); return true; }
      if (Math.random() < 0.5){ beginWindup(e, 'jump', 0.55); return true; }
      beginWindup(e, 'volley', 0.85); return true;
    }
  }
  return false;
}
function angLerp(a, b, t){ let d = b - a; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2; return a + d*t; }
function angDiff(a, b){ let d = b - a; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2; return d; }
// 障害物を避ける舵取り
function steer(e, mx, mz){
  const pos = e.g.position;
  let sx = mx, sz = mz;
  for (const p of props){
    const ox = pos.x - p.x, oz = pos.z - p.z, d = Math.hypot(ox, oz), R = p.r + e.r + 1.4;
    if (d > R || d < 0.001) continue;
    const ahead = -(ox*mx + oz*mz)/d;
    if (ahead <= 0) continue;
    const k = (1 - d/R)*2.2*ahead;
    const side = (ox*mz - oz*mx) > 0 ? 1 : -1;
    sx += -mz*side*k + ox/d*k*0.5; sz += mx*side*k + oz/d*k*0.5;
  }
  const l = Math.hypot(sx, sz) || 1;
  return [sx/l, sz/l];
}

function updateEnemy(e, dt, idx){
  const K = e.K, pos = e.g.position;
  e.t += dt; e.st += dt; e.cd -= dt; e.dodgeCd -= dt; e.teleCd -= dt; e.barrierCd -= dt;
  if (e.rage > 0 && e.rage < 900) e.rage -= dt;
  const dx = P.pos.x - pos.x, dz = P.pos.z - pos.z, dist = Math.hypot(dx, dz) || 0.001, tx = dx/dist, tz = dz/dist;
  let ground = terrainH(pos.x, pos.z);
  const rageK = e.rage > 0 ? 1.3 : 1;
  let move = 0, mx = tx, mz = tz, lean = -0.12, crouch = 0, stretch = 0, angry = e.rage > 0, hopOn = true, faceP = true, charge = 0, mouthOpen = 0;
  let handsMode = 'walk', rollZ = 0, flipX = 0, spinY = 0, faceYawTarget = null;
  const ox0 = pos.x, oz0 = pos.z;

  // 出現
  if (e.state === 'spawn'){
    const p = Math.min(1, e.st/0.9), ease = 1 - Math.pow(1-p, 3);
    e.g.scale.setScalar(K.size*(0.25 + 0.75*ease));
    pos.y = ground - (1 - ease)*1.6*K.size + (e.kind === 'mage' ? ease*1.5 : 0);
    e.pivot.rotation.y = (1 - ease)*8;
    if (e.circle){ e.circle.rotation.z += dt*3; e.circle.material.opacity = 1 - p*0.2; }
    if (p >= 1){
      e.state = 'chase'; e.st = 0; e.pivot.rotation.y = 0; e.g.scale.setScalar(K.size); e.sq = 0.35; e.spawnDone = true;
      if (e.circle){ fx.push({m:e.circle, life:0.4, max:0.4, type:'fade'}); e.circle = null; }
      emote(e); dust(pos, 6, 1);
      // 仲間に知らせる
      for (const o of enemies) if (o !== e && o.state === 'chase' && !o.emote && o.g.position.distanceTo(pos) < 8 && Math.random() < 0.3) emote(o, 'shock');
    }
    updateEliteFx(e, dt, ground);
    return;
  }
  if (e.state === 'dying'){
    const p = e.st/0.55;
    e.pivot.rotation.y += dt*18;
    const s = p < 0.3 ? 1 + p*0.8 : Math.max(0.01, (1 - (p-0.3)/0.7)*1.24);
    e.g.scale.setScalar(K.size*s);
    pos.y += dt*(p < 0.3 ? 4 : 1);
    for (const ey of e.eyes){ ey.sclera.scale.y = 0.15; ey.pupil.visible = false; }
    e.mouth.scale.y = 0.9;
    if (p >= 1){
      const c = pos.clone().add(new THREE.Vector3(0, 0.6*K.size, 0));
      burst(c, new THREE.Color(K.color).multiplyScalar(2), 24, 7);
      ring(pos.clone().setY(ground + 0.1), new THREE.Color(1.5,1.6,2.0), K.size*2.5);
      sound('pop');
      disposeEnemy(e); enemies.splice(idx, 1); updateHUD();
    }
    return;
  }

  if (!e.spawnDone){ e.spawnDone = true; e.g.scale.setScalar(K.size); e.pivot.rotation.y = 0; if (e.circle){ fx.push({m:e.circle, life:0.4, max:0.4, type:'fade'}); e.circle = null; } }
  const aimed = playerAiming(e, e.kind === 'tank' ? 0.97 : 0.993);
  switch (e.state){
    case 'chase': {
      move = e.speed*rageK;
      if (e.kind === 'mage'){
        const want = dist < 9 ? -1 : dist > 15 ? 1 : 0;
        mx = tx*want - tz*e.strafe*0.9; mz = tz*want + tx*e.strafe*0.9; hopOn = false;
        if (Math.random() < dt*0.3) e.strafe *= -1;
        // 瞬間移動で逃げる
        if (e.teleCd <= 0 && ((aimed && firing()) || dist < 5.5)){ e.state = 'blink'; e.st = 0; e.teleCd = 4 + Math.random()*2; sound('cast', 1.6); }
      } else {
        // 包囲：左右に回り込みながら接近
        const ang = Math.atan2(pos.z - P.pos.z, pos.x - P.pos.x);
        const fl = Math.min(1, Math.max(0, (dist - 3)/10))*0.95;
        const tAng = ang + e.flank*fl;
        const wantR = dist > 4 ? Math.max(1.6 + e.r, dist - 6) : 0;
        mx = P.pos.x + Math.cos(tAng)*wantR - pos.x; mz = P.pos.z + Math.sin(tAng)*wantR - pos.z;
        if (e.kind === 'fast'){ const zig = Math.sin(e.t*5 + e.phase)*0.9; const nx = mx - mz*zig, nz = mz + mx*zig; mx = nx; mz = nz; }
        const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
        // 狙われたら回避
        const rate = (e.kind === 'fast' ? 1.8 : e.kind === 'normal' ? 0.7 : 0)*(e.elite === 'swift' ? 2.5 : 1);
        if (rate > 0 && aimed && firing() && e.dodgeCd <= 0 && Math.random() < rate*dt){
          e.state = 'dodge'; e.st = 0; e.dodgeCd = 1.4 + Math.random()*1.2;
          const s = Math.random() < 0.5 ? 1 : -1;
          _a.copy(pos).sub(camera.position).setY(0).normalize();
          e.lv.set(-_a.z*s, 0, _a.x*s).multiplyScalar(e.kind === 'fast' ? 12 : 9);
          e.dodgeSide = s; sound('dash', 1.4); dust(pos, 4, 0.8);
        }
        // 岩殻はガード
        if (e.kind === 'tank' && !e.armorBroken){ if (aimed && firing()) e.guardT = 0.7; }
      }
      if (e.kind === 'tank'){ e.guardT -= dt; setGuard(e, e.guardT > 0 && !e.armorBroken); if (e.guarding){ move *= 0.35; handsMode = 'guard'; } }
      if (e.kind !== 'mage'){ const s = steer(e, mx, mz); mx = s[0]; mz = s[1]; }
      if (e.kind !== 'mage' && dist < 1.2 + e.r) move = 0;
      if (e.state === 'chase') chooseAttack(e, dist);
      if (e.state !== 'chase') setGuard(e, false);
      break;
    }
    case 'windup': {
      const p = Math.min(1, e.st/e.wt);
      angry = true; crouch = 0.28*p; lean = 0.25*p; charge = p; mouthOpen = 0.4;
      e.pivot.position.x = Math.sin(e.t*70)*0.02*p;
      if (e.kind === 'mage'){ hopOn = false; if (e.extras.orb) e.extras.orb.scale.setScalar(0.4 + p*1.2); }
      if (e.atk === 'barrier'){ handsMode = 'up'; if (e.barrierTarget) faceYawTarget = Math.atan2(-(e.barrierTarget.g.position.x - pos.x), -(e.barrierTarget.g.position.z - pos.z)); }
      if (e.atk === 'shoot' || e.atk === 'volley' || e.atk === 'homing') handsMode = 'cast';
      if (e.atk === 'jump'){ crouch = 0.4*p; }
      if (e.atk === 'meteor' || e.atk === 'waves'){ handsMode = 'up'; crouch = -0.1*p; lean = -0.2; mouthOpen = 1; }
      if (e.atk === 'spin'){ handsMode = 'out'; spinY = -p*1.2; }
      if (e.atk === 'charge'){ // 前足で地面をかく
        lean = -0.3; crouch = 0.15; handsMode = 'paw';
        if (Math.random() < dt*12) dust(pos, 1, 0.5);
        if (e.tele){ e.tele.g.position.set(pos.x, ground + 0.08, pos.z); e.tele.g.rotation.y = e.yaw; e.tele.fill.scale.setScalar(p); }
      } else if (e.tele && !e.tele.line){ e.tele.fill.scale.setScalar(p); e.tele.g.position.set(pos.x, terrainH(pos.x, pos.z)+0.08, pos.z); }
      if (e.atk === 'slam' && e.kind === 'tank') handsMode = 'slam';
      if (p >= 1){ e.pivot.position.x = 0; execAttack(e, tx, tz, dist); }
      break;
    }
    case 'attack': { // 突進（連撃）
      angry = true; lean = -0.5; stretch = 0.3; mouthOpen = 1; hopOn = false; faceP = false; handsMode = 'strike';
      pos.addScaledVector(e.lv, dt);
      e.lv.multiplyScalar(Math.pow(0.02, dt));
      if (!e.hitDone && dist < e.r + 0.9 && Math.abs(P.pos.y - pos.y) < 2){ e.hitDone = true; e.tauntNext = true; playerHurt(e.dmg, pos); if (state !== 'play' || !enemies.includes(e)) return; }
      if (e.st > (e.kind === 'fast' ? 0.22 : 0.3)){
        e.comboLeft--;
        if (e.comboLeft > 0 && dist < 7){ e.zig = -e.zig; beginWindup(e, 'lunge', e.kind === 'fast' ? 0.1 : 0.22); }
        else toRecover(e, 0.55);
      }
      break;
    }
    case 'rush': { // 岩殻の突進
      angry = true; lean = -0.45; stretch = 0.15; mouthOpen = 1; faceP = false; handsMode = 'strike';
      move = 0; e.phase += dt*22;
      pos.addScaledVector(e.rushDir, 15*dt);
      if (Math.random() < dt*20) dust(pos, 1, 0.6);
      if (!e.hitDone && dist < e.r + 1.0){ e.hitDone = true; e.tauntNext = true; playerHurt(e.dmg*1.6, pos); P.vel.addScaledVector(e.rushDir, 10); P.vel.y = 6; if (state !== 'play' || !enemies.includes(e)) return; }
      let bonk = Math.hypot(pos.x, pos.z) > ARENA;
      for (const p of props) if (Math.hypot(pos.x - p.x, pos.z - p.z) < p.r + e.r + 0.15){ bonk = true; break; }
      if (bonk){
        e.state = 'stagger'; e.st = -1.0; e.sq = 0.6; e.tiltV += 12;
        addShake(0.5); dust(pos, 12, 2); sound('slam'); stat('rushStun');
        dmgNum(pos.clone().add(new THREE.Vector3(0, 2.5*K.size, 0)), 'ゴツン！', 'crit');
      } else if (e.st > 1.5) toRecover(e, 0.7);
      break;
    }
    case 'jump': { // ボスの跳躍
      const p = Math.min(1, e.st/0.95);
      pos.x = e.from.x + (e.to.x - e.from.x)*p; pos.z = e.from.z + (e.to.z - e.from.z)*p;
      ground = terrainH(pos.x, pos.z);
      hopOn = false; angry = true; stretch = 0.25*(1-p); lean = 0; mouthOpen = 1; handsMode = 'up';
      if (e.tele) e.tele.fill.scale.setScalar(p);
      pos.y = ground + Math.sin(p*Math.PI)*7;
      if (p >= 1){ removeTele(e); pos.y = ground; e.sq = 0.5; aoe(pos.x, pos.z, 5.5, e.dmg*1.5); toRecover(e, 0.9); }
      break;
    }
    case 'spin': { // ボスの回転攻撃
      angry = true; hopOn = false; faceP = false; handsMode = 'out'; mouthOpen = 0.8;
      move = e.speed*1.4; spinY = e.st*22;
      e.spinHit -= dt;
      if (Math.random() < dt*25){ const a = Math.random()*6.28; burst(pos.clone().add(new THREE.Vector3(Math.cos(a)*2.4, 1.2, Math.sin(a)*2.4)), new THREE.Color(2.4, 1.2, 1.6), 1, 3); }
      if (e.spinHit <= 0 && dist < e.r + 1.8){ e.spinHit = 0.5; playerHurt(e.dmg*0.7, pos); if (state !== 'play' || !enemies.includes(e)) return; }
      if (e.st > 1.8){ toRecover(e, 1.0); e.sq = 0.3; }
      break;
    }
    case 'waves': { // 衝撃波を3連発
      hopOn = false; angry = true; handsMode = 'slam'; mouthOpen = 1;
      const tNext = e.wavesN*0.55;
      crouch = 0.3*Math.max(0, 1 - Math.abs(e.st - tNext)*6);
      if (e.st >= tNext && e.wavesN < 3){ e.wavesN++; e.sq = 0.45; addWave(pos.x, pos.z, e.dmg*0.9); addShake(0.3); dust(pos, 8, 3); }
      if (e.st > 1.6) toRecover(e, 0.8);
      break;
    }
    case 'awaken': { // 覚醒演出
      hopOn = false; faceP = false; angry = true; handsMode = 'up'; mouthOpen = 1;
      const p = Math.min(1, e.st/1.6);
      pos.y = ground + Math.sin(p*Math.PI)*3.5;
      spinY = p*Math.PI*4;
      if (Math.random() < dt*30) burst(pos.clone().add(new THREE.Vector3(0, 1.5*K.size, 0)), new THREE.Color(2.6, 0.8, 1.2), 2, 6);
      if (p >= 1){ ring(pos.clone().setY(ground + 0.2), new THREE.Color(2.6, 0.8, 1.2), 14); addShake(0.9); sound('slam'); toRecover(e, 0.5); e.cd = 0.3; }
      break;
    }
    case 'blink': { // 星詠みの瞬間移動
      hopOn = false; faceP = true;
      const p = e.st/0.5;
      if (p < 0.5){ e.g.scale.setScalar(K.size*Math.max(0.05, 1 - p*2)); if (Math.random() < 0.6) burst(pos.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Color(1.6, 2.2, 1.4), 2, 3); }
      else {
        if (!e.blinked){
          e.blinked = true;
          let nx, nz, tries = 0;
          do { const a = Math.random()*6.28, r = 10 + Math.random()*6; nx = P.pos.x + Math.cos(a)*r; nz = P.pos.z + Math.sin(a)*r; tries++; }
          while ((Math.hypot(nx, nz) > ARENA - 3 || props.some(q => Math.hypot(q.x-nx, q.z-nz) < q.r + 1)) && tries < 20);
          pos.x = nx; pos.z = nz; ground = terrainH(nx, nz);
          ring(new THREE.Vector3(nx, ground + 0.1, nz), new THREE.Color(1.4, 2.2, 1.4), 2);
        }
        e.g.scale.setScalar(K.size*Math.min(1, (p - 0.5)*2));
        if (Math.random() < 0.6) burst(pos.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Color(1.6, 2.2, 1.4), 2, 3);
      }
      if (p >= 1){ e.blinked = false; e.g.scale.setScalar(K.size); e.state = 'chase'; e.cd = Math.min(e.cd, 0.4); }
      break;
    }
    case 'dodge': { // 横っ飛び・バク宙
      hopOn = false; faceP = false;
      const p = Math.min(1, e.st/0.34);
      pos.addScaledVector(e.lv, dt); e.lv.multiplyScalar(Math.pow(0.05, dt));
      if (e.kind === 'fast') flipX = -p*Math.PI*2; else rollZ = e.dodgeSide*p*Math.PI*2;
      pos.y = terrainH(pos.x, pos.z) + Math.sin(p*Math.PI)*0.9*K.size;
      if (p >= 1){ e.state = 'chase'; e.sq = 0.3; dust(pos, 3, 0.6); }
      break;
    }
    case 'flee': { // 逃走して回復
      hopOn = true; faceP = false; mouthOpen = 1; handsMode = 'panic';
      move = e.speed*1.25;
      const w = Math.sin(e.t*6)*0.5;
      mx = -tx - tz*w; mz = -tz + tx*w; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      const s = steer(e, mx, mz); mx = s[0]; mz = s[1];
      faceYawTarget = Math.atan2(-mx, -mz);
      e.hp = Math.min(e.maxhp, e.hp + e.maxhp*0.03*dt);
      if (Math.random() < dt*3) burst(pos.clone().add(new THREE.Vector3(0, 1.2*K.size, 0)), new THREE.Color(0.6, 2.0, 0.8), 1, 1.5);
      if (e.st > 2.6){ e.state = 'chase'; e.rage = 6; emote(e, 'anger'); e.fleeShort = false; }
      break;
    }
    case 'taunt': { // 挑発ダンス
      hopOn = false; mouthOpen = 0.8; handsMode = 'wave';
      const p = e.st/0.9;
      pos.y = ground + Math.abs(Math.sin(p*Math.PI*2))*0.5*K.size;
      spinY = Math.sin(p*Math.PI*2)*0.5;
      if (p >= 1){ e.state = 'chase'; e.sq = 0.3; }
      break;
    }
    case 'air': { // 吹き飛ばされ中
      hopOn = false; faceP = false; mouthOpen = 1; angry = false;
      e.vy -= 22*dt; pos.y += e.vy*dt; e.airRot += dt*e.spin;
      if (pos.y <= ground && e.vy < 0){
        pos.y = ground; e.sq = 0.55; e.airRot = 0; dust(pos, 6, 1.2); sound('pop', 0.6);
        if (e.hopAir){ e.hopAir = false; e.state = 'chase'; }
        else { e.state = 'stagger'; e.st = 0.2; }
      }
      break;
    }
    case 'recover': {
      move = e.speed*0.25; lean = 0.05; mouthOpen = 0.2;
      if (e.st >= e.wt){
        if (e.tauntNext && Math.random() < 0.6 && e.kind !== 'boss'){ e.tauntNext = false; e.state = 'taunt'; e.st = 0; emote(e, 'happy'); }
        else { e.tauntNext = false; e.state = 'chase'; }
      }
      break;
    }
    case 'stagger': {
      hopOn = false; lean = Math.sin(e.st*14)*0.25; mouthOpen = 0.6;
      if (!e.stars) makeStars(e);
      e.stars.visible = true; e.stars.rotation.y += dt*8;
      if (e.st >= 0.9){ e.state = 'chase'; e.stars.visible = false; e.cd = Math.max(e.cd, 0.4); }
      break;
    }
  }
  if (e.stars && e.state !== 'stagger') e.stars.visible = false;

  // 移動と衝突
  if (move > 0){ pos.x += mx*move*dt; pos.z += mz*move*dt; }
  pos.addScaledVector(e.kb, dt*6); e.kb.multiplyScalar(Math.pow(0.004, dt));
  collideProps(pos, e.r);
  for (const o of enemies){
    if (o === e || o.state === 'dying' || o.state === 'spawn') continue;
    const ox = pos.x - o.g.position.x, oz = pos.z - o.g.position.z, d = Math.hypot(ox, oz), m = e.r + o.r;
    if (d > 0 && d < m){ pos.x += ox/d*(m-d)*0.5; pos.z += oz/d*(m-d)*0.5; }
  }
  ground = terrainH(pos.x, pos.z);
  // 詰まったら飛び越える
  if (move > 0 && e.state === 'chase' && e.kind !== 'mage'){
    const moved = Math.hypot(pos.x - ox0, pos.z - oz0);
    if (moved < move*dt*0.3) e.stuckT += dt; else e.stuckT = Math.max(0, e.stuckT - dt);
    if (e.stuckT > 0.6){ e.stuckT = 0; e.state = 'air'; e.hopAir = true; e.vy = 7; e.airRot = 0; e.spin = 0; e.kb.set(mx*3, 0, mz*3); e.sq = 0.4; }
  }

  // 跳ねる歩き＋伸び縮み
  let hop = 0;
  if (move > 0 && hopOn){ e.phase += dt*move*1.9; hop = Math.abs(Math.sin(e.phase)); }
  else e.phase += dt*2;
  if (!['jump','air','dodge','taunt','awaken'].includes(e.state)){
    if (e.kind === 'mage'){ const fy = ground + 1.5 + Math.sin(e.t*2.2)*0.25; pos.y += (fy - pos.y)*Math.min(1, dt*6); }
    else pos.y = ground + hop*0.32*K.size*(e.state === 'flee' ? 1.4 : 1);
  }
  const land = hopOn && move > 0 ? Math.pow(1 - hop, 4) : 0;
  e.sq *= Math.pow(0.002, dt);
  const sy = 1 - crouch - land*0.12 + hop*0.08*(hopOn ? 1 : 0) + stretch*0.2 - e.sq + (e.kind === 'mage' || move === 0 ? Math.sin(e.t*3)*0.03 : 0);
  const sxz = 1 + crouch*0.6 + land*0.1 + e.sq*0.6 - stretch*0.1;

  // 二次モーション：加速度で揺れる・曲がる方向に体を傾ける
  const ivx = (pos.x - ox0)/Math.max(dt, 1e-4), ivz = (pos.z - oz0)/Math.max(dt, 1e-4);
  e.vx += (ivx - e.vx)*Math.min(1, dt*12); e.vz += (ivz - e.vz)*Math.min(1, dt*12);
  const ax = (e.vx - e.pvx)/Math.max(dt, 1e-4), az = (e.vz - e.pvz)/Math.max(dt, 1e-4);
  e.pvx = e.vx; e.pvz = e.vz;
  const fx_ = -Math.sin(e.yaw), fz_ = -Math.cos(e.yaw), rx_ = Math.cos(e.yaw), rz_ = -Math.sin(e.yaw);
  const aF = clamp(ax*fx_ + az*fz_, -80, 80), aS = clamp(ax*rx_ + az*rz_, -80, 80);
  e.jFv += (-110*e.jF - 11*e.jFv + aF*0.012)*dt; e.jF += e.jFv*dt;
  e.jSv += (-110*e.jS - 11*e.jSv - aS*0.012)*dt; e.jS += e.jSv*dt;
  e.jF = clamp(e.jF, -0.5, 0.5); e.jS = clamp(e.jS, -0.5, 0.5);
  e.bodyG.scale.set(sxz*(1 + Math.abs(e.jS)*0.15), sy*(1 - Math.abs(e.jF)*0.1), sxz*(1 + stretch*0.6 + Math.abs(e.jF)*0.15));

  // 傾き（バネ）
  e.tiltV += (-70*e.tilt - 10*e.tiltV)*dt; e.tilt += e.tiltV*dt;
  e.pivot.rotation.x += (lean - e.pivot.rotation.x)*Math.min(1, dt*10);
  e.bodyG.rotation.x = (e.state === 'air' ? e.airRot : e.tilt) + e.jF + flipX;
  e.bodyG.rotation.z = e.jS + rollZ;

  // 向き（旋回で傾く）
  const prevYaw = e.yaw;
  if (faceYawTarget !== null) e.yaw = angLerp(e.yaw, faceYawTarget, Math.min(1, dt*8));
  else if (faceP) e.yaw = angLerp(e.yaw, Math.atan2(-tx, -tz), Math.min(1, dt*(e.state === 'windup' && e.atk === 'charge' ? 3 : 8)));
  const yawRate = angDiff(prevYaw, e.yaw)/Math.max(dt, 1e-4);
  e.bank += (clamp(-yawRate*0.07, -0.45, 0.45) - e.bank)*Math.min(1, dt*8);
  e.pivot.rotation.z = e.tilt*0.3 + (move > 0 && hopOn ? Math.sin(e.phase)*0.08 : 0) + e.bank;
  e.g.rotation.y = e.yaw;
  e.pivot.rotation.y = spinY;

  // 手（モードごとのポーズ＋遅れて付いてくる）
  for (let i=0;i<2;i++){
    const h = e.hands[i], sx = i ? 1 : -1, sw = Math.sin(e.phase + i*Math.PI);
    let hx = 0.74*sx, hy = 0.45, hz = -0.1;
    switch (handsMode){
      case 'walk':   hz = -0.1 + sw*0.22; hy = 0.45 + Math.abs(sw)*0.06; break;
      case 'cast':   hx = 0.3*sx; hz = -0.7; hy = 0.55; break;
      case 'strike': hx = 0.5*sx; hz = -0.78; hy = 0.55; break;
      case 'guard':  hx = 0.32*sx; hz = -0.8; hy = 0.75; break;
      case 'up':     hx = 0.62*sx; hy = 1.25 + Math.sin(e.t*14 + i)*0.08; hz = -0.1; break;
      case 'out':    hx = 1.05*sx; hy = 0.6; hz = 0; break;
      case 'slam':   hx = 0.5*sx; hy = 1.15; hz = -0.2; break;
      case 'paw':    hx = 0.55*sx; hz = -0.45 + (i ? Math.sin(e.t*16) : 0)*0.25; hy = 0.3; break;
      case 'panic':  hx = 0.7*sx; hy = 1.05 + Math.sin(e.t*22 + i*2)*0.18; hz = Math.cos(e.t*22 + i)*0.15; break;
      case 'wave':   hx = 0.66*sx; hy = 1.15 + Math.sin(e.t*16 + i*Math.PI)*0.2; hz = -0.2; break;
    }
    if (e.state === 'stagger') hy += 0.4;
    // 慣性で遅れる
    hz += clamp(aF*0.003, -0.25, 0.25); hx += clamp(-aS*0.003, -0.2, 0.2)*sx*sx;
    const k = Math.min(1, dt*12);
    h.position.x += (hx - h.position.x)*k; h.position.y += (hy - h.position.y)*k; h.position.z += (hz - h.position.z)*k;
  }

  // 顔：まばたき・視線・表情
  e.blink -= dt;
  let lid = 1;
  if (e.blink < 0){ lid = 0.12; if (e.blink < -0.12) e.blink = 1.8 + Math.random()*3.5; }
  if (e.state === 'stagger') lid = 0.5 + Math.sin(e.st*20)*0.4;
  if (e.state === 'flee' || e.state === 'taunt') lid = e.state === 'taunt' ? 0.25 : 1.25;
  tmpV.copy(camera.position); e.face.worldToLocal(tmpV); tmpV.normalize();
  for (const ey of e.eyes){
    ey.sclera.scale.y = 1.15*lid; ey.pupil.scale.y = 1.2*Math.min(1, lid);
    ey.pupil.scale.x = e.state === 'flee' ? 0.6 : 0.9;
    const px = clamp(-tmpV.x*0.06, -0.05, 0.05), py = clamp(tmpV.y*0.06, -0.05, 0.05);
    if (e.state === 'stagger'){ ey.pupil.position.x = Math.cos(e.st*12)*0.04; ey.pupil.position.y = Math.sin(e.st*12)*0.04; }
    else { ey.pupil.position.x += (px - ey.pupil.position.x)*Math.min(1, dt*10); ey.pupil.position.y += (py - ey.pupil.position.y)*Math.min(1, dt*10); }
  }
  for (const b of e.brows){ b.visible = angry || e.enraged || e.state === 'flee'; }
  if (e.state === 'flee'){ e.brows[0].rotation.z = -0.45; e.brows[1].rotation.z = 0.45; } else { e.brows[0].rotation.z = 0.45; e.brows[1].rotation.z = -0.45; }
  e.mouthT -= dt;
  const mo = Math.max(mouthOpen, e.mouthT > 0 ? 0.9 : 0);
  e.mouth.scale.y += ((0.3 + mo*0.9) - e.mouth.scale.y)*Math.min(1, dt*14);

  // 結晶
  e.crys.rotation.y += dt*(2 + charge*12);
  e.crys.position.y = (e.kind === 'mage' ? 2.0 : 1.65) + Math.sin(e.t*3)*0.06 + crouch*-0.3;
  e.crysMat.color.copy(e.crysBase).lerp(RED, e.enraged || e.rage > 0 ? 0.4 + Math.sin(e.t*8)*0.3 : charge);

  // 種族ごとの飾り
  if (e.extras.ears) for (let i=0;i<2;i++){ const sx = i ? 1 : -1; e.extras.ears[i].rotation.z = -0.5*sx + Math.sin(e.t*10 + i)*0.15*sx + (angry ? 0.5*sx : 0) - (e.state === 'flee' ? 0.9*sx : 0); }
  if (e.extras.tail) e.extras.tail.rotation.y = Math.sin(e.t*(e.state === 'flee' ? 25 : 12))*0.5;
  if (e.extras.wings) for (let i=0;i<2;i++){ const sx = i ? 1 : -1; e.extras.wings[i].rotation.y = sx*(0.3 + Math.sin(e.t*(e.state === 'blink' ? 30 : 14))*0.6); }
  if (e.extras.crown) e.extras.crown.rotation.y += dt*(e.awakened ? 6 : e.enraged ? 3 : 0.8);

  // 被弾フラッシュ・怒り
  if (e.flash > 0){ e.flash -= dt; e.mat.emissive.setRGB(0.9, 0.9, 0.9); }
  else if (e.awakened) e.mat.emissive.setRGB(0.45 + Math.sin(e.t*10)*0.25, 0.05, 0.25);
  else if (e.enraged || e.rage > 0) e.mat.emissive.setRGB(0.25 + Math.sin(e.t*8)*0.15, 0.02, 0.04);
  else if (e.state === 'windup') e.mat.emissive.setRGB(0.3*charge, 0.02*charge, 0.04*charge);
  else e.mat.emissive.setRGB(0, 0, 0);

  // シールド
  if (e.shield > 0 && e.bubble){
    e.shieldHitT -= dt;
    const s = 1 + Math.max(0, e.shieldHitT)*1.2 + Math.sin(e.t*4)*0.03;
    e.bubble.scale.set(1.25*s, 1.35*s, 1.25*s);
    e.bubble.material.opacity = 0.18 + Math.max(0, e.shieldHitT)*3 + (e.shield/e.shieldMax)*0.12;
  }
  if (e.elite === 'guard'){ e.shieldIdle += dt; if (e.shield <= 0 && e.shieldIdle > 6) giveShield(e, e.maxhp*0.5); }
  if (e.dome && e.guarding){ e.dome.material.opacity = 0.3 + Math.sin(e.t*12)*0.08; }

  // 吹き出し
  if (e.emote){
    e.emote.life -= dt;
    const top = pos.y + (e.kind === 'mage' ? 2.6 : 2.3)*K.size;
    e.emote.s.position.set(pos.x, top + Math.max(0, e.emote.life - 0.8)*2 + Math.sin(e.t*8)*0.05, pos.z);
    e.emote.s.material.opacity = Math.min(1, e.emote.life*3);
    if (e.emote.life <= 0){ scene.remove(e.emote.s); e.emote = null; }
  }
  updateEliteFx(e, dt, ground);
  // HPバー
  if ((e.hp < e.maxhp || e.shield > 0) && e.kind !== 'boss'){
    e.bar.visible = true;
    e.bar.position.set(pos.x, pos.y + (e.kind === 'mage' ? 2.5 : 2.2)*K.size, pos.z);
    e.bar.quaternion.copy(camera.quaternion);
    e.bar.scale.setScalar(Math.max(1, K.size*0.7));
    e.fill.scale.x = Math.max(0.001, e.hp/e.maxhp);
  }
  if (e.kind === 'boss') $('bossfill').style.width = Math.max(0, e.hp/e.maxhp*100) + '%';
}
function updateEliteFx(e, dt, ground){
  if (e.aura){ e.aura.position.set(e.g.position.x, ground + 0.07, e.g.position.z); e.aura.rotation.z += dt*2; e.aura.material.opacity = 0.7 + Math.sin(e.t*5)*0.2; }
  if (e.label){ e.label.position.set(e.g.position.x, e.g.position.y + (e.kind === 'mage' ? 2.9 : 2.6)*e.K.size, e.g.position.z); }
}

// ================= HUD =================
function updateHUD(){
  $('hp').textContent = fmt(Math.max(0, P.hp)) + ' / ' + fmt(ST.maxhp);
  const r = Math.max(0, P.hp/ST.maxhp);
  $('hpfill').style.width = (r*100) + '%';
  $('hpfill').style.background = r > 0.5 ? 'linear-gradient(90deg,#7ef0a1,#3ccf8e)' : r > 0.25 ? 'linear-gradient(90deg,#ffe27a,#f4b33f)' : 'linear-gradient(90deg,#ff8a8a,#ef4444)';
  $('mag').textContent = mag; $('magmax').textContent = ST.mag;
  $('wave').textContent = save.wave; $('maxw').textContent = save.maxWave;
  $('left').textContent = enemies.filter(e => e.state !== 'dying').length + spawnQueue.length;
  const nb = 10 - (save.wave % 10);
  $('nextb').textContent = save.wave % 10 === 0 ? 'ボスウェーブ！' : '次のボスまで ' + nb + ' ウェーブ';
  $('cry').textContent = fmt(save.crystals);
  $('ps').textContent = ST.passive > 0 ? '+' + fmt(ST.passive) + ' /秒' : '';
  $('dust').textContent = save.stardust + (save.stardust ? '（×' + pm().toFixed(1) + '）' : '');
}
let hitT; function hitMarker(big, kill){ const h = $('hit'); h.className = big ? 'crit' : ''; h.style.opacity = 1; h.style.transform = 'translate(-50%,-50%) rotate(45deg) scale(' + (kill ? 1.7 : 1) + ')'; clearTimeout(hitT); hitT = setTimeout(() => h.style.opacity = 0, kill ? 160 : 90); }
let msgT; function showMsg(t){ $('msg').textContent = t; $('msg').style.opacity = 1; clearTimeout(msgT); msgT = setTimeout(() => $('msg').style.opacity = 0, 1700); }
let dmgT; function damageFlash(){ $('dmg').style.opacity = 1; clearTimeout(dmgT); dmgT = setTimeout(() => $('dmg').style.opacity = 0, 140); }

// ================= 強化メニュー =================
function prestigeGain(){ return save.maxWave >= 15 ? Math.floor(Math.pow(save.maxWave/10, 2)*3) : 0; }
let prestArm = false, wipeArm = false;
function renderShop(){
  const el = $('shop');
  if (!el.children.length){
    for (const u of UPS){
      const c = document.createElement('div'); c.className = 'card';
      c.innerHTML = '<div class="t"><span>'+u.name+'</span><span class="lv"></span></div><div class="e"></div><button></button>';
      c.querySelector('button').addEventListener('click', () => buy(u));
      el.appendChild(c); u.el = c;
    }
  }
  for (const u of UPS){
    const l = lv(u.id), maxed = u.max !== undefined && l >= u.max, cost = costOf(u);
    u.el.querySelector('.lv').textContent = 'Lv ' + l + (u.max ? ' / ' + u.max : '');
    u.el.querySelector('.e').textContent = maxed ? u.eff(l) + '（最大）' : u.eff(l) + ' → ' + u.eff(l+1);
    const b = u.el.querySelector('button');
    b.textContent = maxed ? '最大レベル' : '◆ ' + fmt(cost);
    b.disabled = maxed || save.crystals < cost;
  }
  $('mcry').textContent = fmt(save.crystals); $('mdust').textContent = save.stardust;
  const g = prestigeGain();
  $('prestInfo').innerHTML = '最高 WAVE ' + save.maxWave + '。WAVE 15 以上で転生できます。<br>結晶・強化・ウェーブはリセットされ、星屑 1 つにつき攻撃力と結晶獲得が +10%（永続）。章の進行とミッションは残ります。<br>今転生すると：<b>✧ +' + g + '</b>';
  const pb = $('prest'); pb.disabled = g <= 0; pb.textContent = prestArm ? '本当に転生する？' : '転生する';
}
function buy(u){
  const cost = costOf(u);
  if (save.crystals < cost || (u.max !== undefined && lv(u.id) >= u.max)) return;
  save.crystals -= cost; save.up[u.id] = lv(u.id) + 1;
  const oldMax = ST.maxhp;
  computeStats();
  if (u.id === 'hp') P.hp += ST.maxhp - oldMax;
  if (u.id === 'mag') mag = ST.mag;
  stat('upg');
  syncTurrets(); sound('buy'); checkMissions(); renderShop(); updateHUD(); persist();
}
$('prest').addEventListener('click', () => {
  if (prestigeGain() <= 0) return;
  if (!prestArm){ prestArm = true; renderShop(); setTimeout(() => { prestArm = false; if (state === 'menu') renderShop(); }, 3000); return; }
  prestArm = false;
  save.stardust += prestigeGain(); stat('prestige');
  save.crystals = 0; save.up = {}; save.wave = 1; save.maxWave = 1;
  computeStats(); syncTurrets();
  clearEnemies(); P.hp = ST.maxhp; mag = ST.mag; P.pos.set(0, 0, 0);
  waveActive = false; waveDelay = 1.5;
  checkMissions(); persist(); renderShop(); updateHUD(); sound('wave');
});
$('qHigh').addEventListener('click', () => { save.quality = 'high'; applyQuality(); persist(); });
$('qLow').addEventListener('click', () => { save.quality = 'low'; applyQuality(); persist(); });
$('sens').value = save.sens;
$('sens').addEventListener('input', e => { save.sens = +e.target.value; persist(); });
$('wipe').addEventListener('click', e => {
  if (!wipeArm){ wipeArm = true; e.target.textContent = 'もう一度押すと消去'; setTimeout(() => { wipeArm = false; e.target.textContent = 'セーブを消去'; }, 3000); return; }
  try { localStorage.removeItem(SAVE_KEY); } catch(_){}
  { const q = save.quality; Object.assign(save, freshSave()); save.quality = q; }
  save.active = [0, 1, 2]; save.nextM = 3; save.active.forEach(activateMission);
  computeStats(); syncTurrets();
  clearEnemies(); P.hp = ST.maxhp; mag = ST.mag; waveActive = false; waveDelay = 1;
  wipeArm = false; e.target.textContent = 'セーブを消去'; renderShop(); updateHUD(); goalsDirty = true;
});
let shopTick = 0;
function openMenu(){
  if (state !== 'play') return;
  state = 'menu'; charging = false; chargeT = 0; persist(); renderShop();
  $('menu').style.display = 'flex';
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}
function closeMenu(){
  $('menu').style.display = 'none'; state = 'play'; lock();
}
$('resume').addEventListener('click', closeMenu);

// ================= 入力 =================
const canvas = renderer.domElement;
let locked = false, dragLook = false, dragging = false, mouseDown = false;
function lock(){
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { dragLook = true; });
  } catch(e){ dragLook = true; }
  setTimeout(() => { if (!locked) dragLook = true; }, 400);
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) dragLook = false;
  else if (state === 'play' && !dragLook) openMenu();
});
document.addEventListener('mousemove', e => {
  if (state !== 'play') return;
  if (locked || (dragLook && dragging)){
    const s = 0.0022 * save.sens;
    P.yaw -= e.movementX * s; P.pitch = clamp(P.pitch - e.movementY * s, -1.5, 1.5);
  }
});
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (state === 'play' && e.button === 2){ if (!locked && !dragLook) lock(); startCharge(); return; }
  if (state !== 'play' || e.button !== 0) return;
  if (!locked){ lock(); if (!dragLook) return; }
  mouseDown = true; dragging = true; shoot();
});
addEventListener('mouseup', e => { if (e.button === 2){ releaseCharge(); return; } mouseDown = false; dragging = false; });
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (state === 'play' && !e.repeat){
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Space') doJump();
    if (e.code === 'KeyE') doDash();
    if (e.code === 'KeyQ') doNova();
    if (e.code === 'KeyC') doPlunge();
    if (e.code === 'KeyF') doBurst();
  }
  if (e.code === 'KeyB' || (e.code === 'Escape' && dragLook)){
    if (state === 'play') openMenu(); else if (state === 'menu' && e.code === 'KeyB') closeMenu();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

$('start').addEventListener('click', () => {
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch(e){}
  $('title').style.display = 'none'; $('hud').style.display = 'block';
  P.hp = ST.maxhp; mag = ST.mag; P.pos.set(0, terrainH(0,0), 0); P.yaw = 0; P.pitch = 0;
  syncTurrets();
  state = 'play'; waveActive = false; waveDelay = 1.5;
  const ch = CHAPTERS[save.chapter];
  if (ch) toast(ch.title, '目標：' + ch.goal, true);
  goalsDirty = true; updateHUD(); lock();
});

// ================= 更新 =================
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
let passiveAcc = 0, saveT = 0, time = 0, missionT = 0;
function update(dt){
  if (keys.ArrowLeft) P.yaw += 2.2*dt;
  if (keys.ArrowRight) P.yaw -= 2.2*dt;
  if (keys.ArrowUp) P.pitch = Math.min(1.5, P.pitch + 1.5*dt);
  if (keys.ArrowDown) P.pitch = Math.max(-1.5, P.pitch - 1.5*dt);

  // 移動
  fwd.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  wish.set(0,0,0);
  if (keys.KeyW) wish.add(fwd);
  if (keys.KeyS) wish.sub(fwd);
  if (keys.KeyD) wish.add(right);
  if (keys.KeyA) wish.sub(right);
  const moving = wish.lengthSq() > 0; if (moving) wish.normalize();
  const sprint = keys.ShiftLeft || keys.ShiftRight, speed = sprint ? 9 : 5.6, acc = P.onGround ? 12 : 3;
  if (dashT > 0){ dashT -= dt; P.vel.x = dashDir.x*24; P.vel.z = dashDir.z*24; }
  else if (!plunging){
    P.vel.x += (wish.x*speed - P.vel.x)*Math.min(1, acc*dt);
    P.vel.z += (wish.z*speed - P.vel.z)*Math.min(1, acc*dt);
  }
  P.vel.y -= (dashT > 0 ? 4 : plunging ? 40 : 21)*dt;
  const ox = P.pos.x, oz = P.pos.z;
  P.pos.x += P.vel.x*dt; P.pos.z += P.vel.z*dt;
  collideProps(P.pos, P.r);
  if (moving) save.stats.moved = (save.stats.moved || 0) + Math.hypot(P.pos.x - ox, P.pos.z - oz);
  P.pos.y += P.vel.y*dt;
  const gh = terrainH(P.pos.x, P.pos.z);
  if (P.pos.y <= gh){
    if (!P.onGround){ if (plunging) plungeImpact(); else if (P.vel.y < -9){ addShake(0.12); dust(P.pos, 5, 1); } }
    P.pos.y = gh; P.vel.y = 0; P.onGround = true; jumps = 0;
  }
  else if (P.pos.y > gh + 0.08) P.onGround = false;
  else if (P.onGround) P.pos.y = gh;

  if (moving && P.onGround) bob += dt*(sprint ? 13 : 9);
  recoil = Math.max(0, recoil - dt*9);
  shake = Math.max(0, shake - dt*2.2);
  const sk = shake*shake*0.25;
  camera.position.set(P.pos.x + (Math.random()-0.5)*sk, P.pos.y + P.height + Math.sin(bob)*0.045 + (Math.random()-0.5)*sk, P.pos.z + (Math.random()-0.5)*sk);
  camera.rotation.set(P.pitch + recoil*0.022, P.yaw, (Math.random()-0.5)*sk*0.3);
  fovKick += (0 - fovKick)*Math.min(1, dt*5);
  const cz = charging ? Math.min(1, chargeT/1.1) : 0;
  camera.fov += ((sprint && moving ? 80 : 72) + fovKick - cz*12 - camera.fov)*Math.min(1, dt*10); camera.updateProjectionMatrix();
  const rp = reloading > 0 ? 1 - reloading/ST.reload : 0, spin = reloading > 0 ? -(rp*rp*(3 - 2*rp))*Math.PI*2 : 0;
  const shk = charging ? cz*0.006 : 0;
  gun.position.set(GUN_BASE.x + Math.cos(bob*0.5)*0.012 + (Math.random()-0.5)*shk, GUN_BASE.y + Math.abs(Math.sin(bob*0.5))*0.012 - (reloading > 0 ? 0.05 : 0) + (Math.random()-0.5)*shk, GUN_BASE.z + Math.min(recoil, 1.5)*0.06 + cz*0.04);
  gun.rotation.set(Math.min(recoil, 2)*0.14 + spin, dashT > 0 ? 0.25 : 0, dashT > 0 ? -0.3 : 0);
  gunCore.rotation.y += dt*(3 + cz*25 + (odT > 0 ? 10 : 0));
  gunCore.scale.setScalar(1 + cz*1.2 + (odT > 0 ? 0.5 + Math.sin(time*10)*0.2 : 0));
  gunCore.material.color.setRGB(odT > 0 || cz > 0 ? 2.6 : 0.6, odT > 0 || cz > 0 ? 1.8 : 1.7, odT > 0 || cz > 0 ? 0.6 : 2.3);

  // 射撃
  fireCd -= dt;
  if (mouseDown && fireCd <= 0) shoot();
  if (reloading > 0){ reloading -= dt; if (reloading <= 0){ reloading = 0; mag = ST.mag; $('reload').textContent = ''; updateHUD(); } }

  if (ST.regen > 0 && P.hp < ST.maxhp){ P.hp = Math.min(ST.maxhp, P.hp + ST.maxhp*ST.regen*dt); }
  updateAbilities(dt);
  updateSkillHUD(dt);

  // ウェーブ進行
  if (waveActive){
    spawnT -= dt;
    if (spawnQueue.length && spawnT <= 0 && enemies.filter(e => e.state !== 'dying').length < 14){ spawnEnemy(spawnQueue.shift()); spawnT = 0.5; updateHUD(); }
    if (!spawnQueue.length && !enemies.length){
      waveActive = false; waveDelay = 2.8;
      const bonus = waveScale(save.wave).rew*3*ST.gain;
      save.crystals += bonus;
      if (!waveHurt) stat('noHit');
      showMsg('WAVE ' + save.wave + ' クリア！ ◆+' + fmt(bonus) + (waveHurt ? '' : '　ノーダメージ！'));
      save.wave++; save.maxWave = Math.max(save.maxWave, save.wave); save.bestWave = Math.max(save.bestWave, save.wave);
      P.hp = Math.min(ST.maxhp, P.hp + ST.maxhp*0.3);
      goalsDirty = true; persist(); updateHUD();
    }
  } else {
    waveDelay -= dt;
    if (waveDelay <= 0) startWave();
  }

  for (let i=enemies.length-1;i>=0;i--){
    if (i >= enemies.length) continue;
    updateEnemy(enemies[i], dt, i);
    if (state !== 'play') return;
  }
  updateShots(dt);
  if (state !== 'play') return;
  updateHazards(dt); updateWaves(dt);
  while (pendingSpawns.length){ const p = pendingSpawns.shift(); spawnEnemy(p.kind, {small:true, at:{x:p.x, z:p.z}, dir:p.dir}); }

  // 守護オーブ
  for (let i=0;i<turrets.length;i++){
    const t = turrets[i], a = time*1.2 + i/turrets.length*6.28;
    t.m.position.set(P.pos.x + Math.cos(a)*1.3, P.pos.y + 2.1 + Math.sin(time*2+i)*0.12, P.pos.z + Math.sin(a)*1.3);
    t.halo.rotation.x = time*2; t.halo.rotation.y = time*1.3;
    t.cd -= dt;
    if (t.cd <= 0){
      let best = null, bd = 28;
      for (const e of enemies){ if (e.state === 'dying' || e.state === 'spawn') continue; const d = e.g.position.distanceTo(P.pos); if (d < bd){ bd = d; best = e; } }
      if (best){
        t.cd = 0.8;
        const tgt = best.g.position.clone().add(new THREE.Vector3(0, 0.7*best.K.size, 0));
        beam(t.m.position.clone(), tgt, new THREE.Color(1.6, 1.2, 2.4), 0.03, 0.12);
        const crit = Math.random() < ST.crit;
        if (crit) stat('crits');
        damageEnemy(best, ST.dmg*0.35*(crit ? 2.5 : 1), crit ? 'crit' : 'orb', tgt, tgt.clone().sub(t.m.position), false);
      } else t.cd = 0.2;
    }
  }

  // ドロップ回収
  for (let i=drops.length-1;i>=0;i--){
    const d = drops[i]; d.t += dt; d.m.rotation.y += dt*4;
    if (d.t < 0.55){
      d.v.y -= 14*dt; d.m.position.addScaledVector(d.v, dt);
      const gy = terrainH(d.m.position.x, d.m.position.z) + 0.3;
      if (d.m.position.y < gy){ d.m.position.y = gy; d.v.multiplyScalar(0.3); }
    } else {
      const target = tmpV.set(P.pos.x, P.pos.y + 1.0, P.pos.z);
      const dir = target.clone().sub(d.m.position), dl = dir.length();
      const sp = 6 + (d.t-0.55)*30;
      if (dl < 0.6 || d.t > 4){ save.crystals += d.val; scene.remove(d.m); drops.splice(i,1); sound('pick'); continue; }
      d.m.position.addScaledVector(dir.normalize(), Math.min(dl, sp*dt));
    }
  }

  missionT += dt;
  if (missionT > 0.25){ missionT = 0; checkMissions(); if (goalsDirty) renderGoals(); $('cry').textContent = fmt(save.crystals); }
}

function updateFx(dt){
  for (let i=fx.length-1;i>=0;i--){
    const f = fx[i]; f.life -= dt;
    if (f.life <= 0){ scene.remove(f.m); if (f.type !== 'fade' && f.type !== 'debris') f.m.material.dispose(); fx.splice(i,1); continue; }
    const k = f.life/f.max;
    if (f.type === 'beam'){ f.m.material.opacity = k; }
    else if (f.type === 'spark'){ if (!f.nograv) f.v.y -= 12*dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += dt*10; f.m.material.opacity = Math.min(1, k*2); }
    else if (f.type === 'ring'){ const s = f.size*(1-k*0.85); f.m.scale.set(s, s, s); f.m.material.opacity = k; }
    else if (f.type === 'dust'){ f.v.multiplyScalar(Math.pow(0.05, dt)); f.v.y -= 3*dt; f.m.position.addScaledVector(f.v, dt); f.m.scale.setScalar(0.6 + (1-k)*1.4); f.m.material.opacity = k; }
    else if (f.type === 'nova'){ const s = Math.max(1.5, f.size*(1 - k*k)); f.m.scale.set(s, 1.8*k + 0.3, s); f.m.material.opacity = k*0.5; }
    else if (f.type === 'debris'){ f.v.y -= 18*dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.spinv.x*dt; f.m.rotation.y += f.spinv.y*dt; const gy = terrainH(f.m.position.x, f.m.position.z) + 0.2; if (f.m.position.y < gy){ f.m.position.y = gy; f.v.multiplyScalar(0.4); f.v.y = Math.abs(f.v.y); } if (k < 0.3) f.m.scale.multiplyScalar(1 - dt*4); }
    else if (f.type === 'fade'){ f.m.material.opacity = k; f.m.scale.multiplyScalar(1 + dt*1.5); }
  }
}

// ================= ループ =================
const clock = new THREE.Clock();
function loop(){
  requestAnimationFrame(loop);
  let dt = Math.min(clock.getDelta(), 1/20);
  if (hitstop > 0){ hitstop -= dt; dt *= 0.04; }
  else if (slowT > 0){ slowT -= dt; dt *= 0.3; }
  time += dt;
  if (state === 'play') update(dt);
  if (state === 'title'){
    const a = time*0.06;
    camera.position.set(Math.cos(a)*14, terrainH(Math.cos(a)*14, Math.sin(a)*14) + 3.2, Math.sin(a)*14);
    camera.rotation.set(0.02, Math.atan2(Math.cos(a), -Math.sin(a)) + 0.6, 0);
    gun.visible = false;
  } else gun.visible = true;

  // 放置収入（メニュー中も進む）
  if (state !== 'title' && ST.passive > 0){
    passiveAcc += dt;
    if (passiveAcc >= 1){ save.crystals += ST.passive*passiveAcc; passiveAcc = 0; updateHUD(); }
  }
  if (state === 'menu'){ shopTick += dt; if (shopTick > 0.3){ shopTick = 0; renderShop(); } }
  saveT += dt; if (saveT > 8 && state !== 'title'){ saveT = 0; persist(); }

  // 環境
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = time;
  grassMat.uniforms.uTime.value = time;
  grassMat.uniforms.uPlayer.value.copy(state === 'title' ? camera.position.clone().setY(-99) : P.pos);
  sun.position.copy(camera.position).addScaledVector(SUN_DIR, 80);
  sun.target.position.copy(camera.position);
  for (const is of islands) is.g.position.y = is.y + Math.sin(time*0.4 + is.p)*1.2;
  const pp = pollen.p, pb = pollen.base;
  for (let i=0;i<pb.length;i++){
    const b = pb[i];
    pp[i*3] = b[0] + Math.sin(time*0.3 + b[3])*1.5;
    pp[i*3+1] = b[1] + Math.sin(time*0.7 + b[3]*2)*0.6;
    pp[i*3+2] = b[2] + Math.cos(time*0.25 + b[3])*1.5;
  }
  pollen.g.attributes.position.needsUpdate = true;
  for (const d of drops) d.m.position.y += Math.sin(time*6 + d.val)*0.002;

  updateFx(dt);
  updateNums(dt);
  if (composer) composer.render(); else renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});
addEventListener('beforeunload', () => { if (state !== 'title') persist(); });

applyQuality();
updateHUD();
loop();
})();
