// ZeroGap 3D scene: a grainy particle "rock" (the reserves), an optional glass cube (the proof) and a rippling
// particle floor. `progress` (0..1, usually scroll) drives the camera, rotation and the cube.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Compact 3D value noise for the rock's surface.
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z) => noise(x, y, z) * 0.55 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.15;

const POINT_VS = `
  attribute float aSeed; attribute float aShade;
  uniform float uTime; uniform float uSize; uniform float uPixel;
  varying float vShade; varying float vSeed;
  void main() {
    vShade = aShade; vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, uSize * uPixel * 0.0025 * (0.6 + aSeed * 0.8) / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const POINT_FS = `
  uniform float uTime; uniform float uOpacity;
  varying float vShade; varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
    float flicker = 0.75 + 0.25 * sin(uTime * (1.5 + vSeed * 3.0) + vSeed * 40.0);
    float a = smoothstep(0.5, 0.0, d) * vShade * flicker * uOpacity;
    gl_FragColor = vec4(vec3(0.92, 0.92, 0.95) * (0.55 + vShade * 0.6), a);
  }`;

function pointsMaterial(size, pixel) {
  return new THREE.ShaderMaterial({
    vertexShader: POINT_VS, fragmentShader: POINT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: size }, uPixel: { value: pixel }, uOpacity: { value: 1 } },
  });
}

function makeRock(count) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count), shade = new Float32Array(count);
  const light = new THREE.Vector3(-0.5, 0.8, 0.6).normalize();
  for (let i = 0; i < count; i++) {
    // Random direction, pushed out by fractal noise: a lumpy, faceted stone.
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const n = new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t));
    const r = 0.85 + fbm(n.x * 1.6 + 3, n.y * 1.6, n.z * 1.6) * 0.75;
    const inner = Math.random() < 0.18 ? Math.pow(Math.random(), 0.5) : 1; // a few particles inside give depth
    const p = n.clone().multiplyScalar(r * inner);
    p.y *= 0.82; p.x *= 1.08;
    pos.set([p.x, p.y, p.z], i * 3);
    seed[i] = Math.random();
    // Brighter on the lit side and on ridges (crisp highlights like polished stone).
    const ridge = Math.pow(Math.abs(fbm(n.x * 6, n.y * 6, n.z * 6) - 0.5) * 2, 3);
    const lit = Math.max(0, n.dot(light));
    shade[i] = inner < 1 ? 0.1 : 0.06 + Math.pow(lit, 1.6) * 0.85 + ridge * 1.1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  return g;
}

function makeCube(perFace) {
  const pts = [], seeds = [], shades = [];
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  for (const [axis, sign] of faces) for (let i = 0; i < perFace; i++) {
    const p = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]; p[axis] = sign;
    const edge = Math.max(...p.map((v, k) => (k === axis ? 0 : Math.abs(v))));
    pts.push(p[0] * 1.9, p[1] * 1.9, p[2] * 1.9); seeds.push(Math.random()); shades.push(0.1 + Math.pow(edge, 10) * 1.4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shades, 1));
  return g;
}

function makeFloor(side) {
  const pts = [], seeds = [], shades = [];
  for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
    const x = (i / side - 0.5) * 16, z = (j / side - 0.5) * 16;
    pts.push(x, 0, z); seeds.push(Math.random()); shades.push(Math.max(0, 1 - Math.hypot(x, z) / 8));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shades, 1));
  return g;
}

/**
 * Mounts the scene on `canvas`. opts.mode: 'landing' (scroll-driven story) or 'banner' (floor + rock, gentle motion).
 * Returns { setProgress(p) }.
 */
export function mountScene(canvas, opts = {}) {
  const mode = opts.mode ?? 'landing';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const pixel = (canvas.clientHeight || innerHeight) * dpr;

  const rockMat = pointsMaterial(small ? 7.0 : 5.6, pixel);
  const rock = new THREE.Points(makeRock(small ? 22000 : 60000), rockMat);
  const cubeMat = pointsMaterial(6.0, pixel);
  const cube = new THREE.Points(makeCube(small ? 1500 : 4000), cubeMat);
  const floorMat = pointsMaterial(6.0, pixel);
  const floor = new THREE.Points(makeFloor(small ? 110 : 170), floorMat);
  floor.position.y = -2.2;
  scene.add(rock, cube, floor);
  const floorBase = floor.geometry.attributes.position.array.slice();

  let target = 0, p = 0;
  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    for (const m of [rockMat, cubeMat, floorMat]) m.uniforms.uPixel.value = h * dpr;
  }
  resize(); addEventListener('resize', resize);

  const ease = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
  const seg = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    p += (target - p) * (reduce ? 1 : 0.06);
    for (const m of [rockMat, cubeMat, floorMat]) m.uniforms.uTime.value = t;

    if (mode === 'banner') {
      camera.position.set(0, 1.2, 7.5); camera.lookAt(0, -0.6, 0);
      rock.position.set(1.6, -0.2, 0); rock.scale.setScalar(1.15); rock.rotation.set(0.3, t * 0.15, 0.1);
      cube.visible = false; floor.visible = true; floor.position.y = -1.6; floorMat.uniforms.uOpacity.value = 0.9;
    } else {
      // Scroll story: hero (big rock behind the text) → close-up → glass cube closes in → rock + ripple floor.
      // Rock sits beside the text of each story section (text left → rock right, and so on).
      const KEYS = [[0, 0], [0.14, 1.5], [0.28, -1.5], [0.42, 1.5], [0.55, 0], [1, 0]];
      let side = 0; for (let k = 1; k < KEYS.length; k++) if (p <= KEYS[k][0]) { const [a0, v0] = KEYS[k - 1], [a1, v1] = KEYS[k]; const tt = (p - a0) / (a1 - a0); side = v0 + (v1 - v0) * (tt * tt * (3 - 2 * tt)); break; }
      const zoom = seg(p, 0.12, 0.32), cubeIn = seg(p, 0.33, 0.5), cubeOut = seg(p, 0.66, 0.8), end = seg(p, 0.72, 0.95);
      camera.position.set(mouse.x * 0.4, -mouse.y * 0.3 + end * 0.8, ease(7.2, 4.6, zoom) + cubeIn * 3.2 + end * 1.5);
      camera.lookAt(0, end * -0.6, 0);
      rock.rotation.set(0.25 + p * 1.4, t * 0.08 + p * 5.5, 0.1 + p * 0.6);
      rock.position.set(side, ease(0, -0.2, cubeIn) * (1 - end) + end * 1.25, 0);
      rock.scale.setScalar(ease(1.25, 0.95, cubeIn) * ease(1, 0.7, end));
      rockMat.uniforms.uOpacity.value = ease(0.95, 1, zoom);
      cube.visible = cubeIn > 0 && cubeOut < 1;
      cube.position.copy(rock.position);
      cube.rotation.set(0.5 + p * 1.2, 0.6 + p * 2.2 + t * 0.05, 0.2);
      cube.scale.setScalar(ease(1.6, 1, cubeIn) * ease(1, 1.8, cubeOut));
      cubeMat.uniforms.uOpacity.value = cubeIn * (1 - cubeOut);
      floor.visible = end > 0; floorMat.uniforms.uOpacity.value = end;
      floor.position.y = -2.2;
    }
    if (floor.visible) {
      const a = floor.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        const x = floorBase[i], z = floorBase[i + 2], r = Math.hypot(x, z);
        a[i + 1] = Math.sin(r * 2.4 - t * 1.6) * 0.16 / (1 + r * 0.35);
      }
      floor.geometry.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (!reduce || mode === 'landing') requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { setProgress: (x) => { target = x; } };
}
