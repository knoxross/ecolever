/* 영상뚝딱 — 화질 향상 (GPU)
 * 장면마다 켤 수 있는 '화질 향상':
 *  - 자동 밝기·대비 (사진/영상의 밝기 분포를 분석해 어두운 부분·밝은 부분을 펴줌)
 *  - 노이즈 줄이기 (가장자리를 지키는 부드럽게 하기)
 *  - 선명하게 (언샤프 마스크) — 작은 사진을 크게 키울 때 특히 효과적
 *  - 색 생동감
 * 출력 크기(화면에 그려질 크기)에서 처리하므로 저화질 원본을 키울 때 업스케일 효과가 납니다.
 */
'use strict';

const Enhancer = (() => {
  let gl = null, cv = null, prog = null, tex = null, failed = false, loc = {};

  const VS = `attribute vec2 p; varying vec2 uv;
    void main(){ uv = vec2((p.x+1.0)*0.5, 1.0-(p.y+1.0)*0.5); gl_Position = vec4(p,0.0,1.0); }`;
  const FS = `precision mediump float;
    varying vec2 uv; uniform sampler2D img; uniform vec2 px;
    uniform float lo, hi, gam, sat, sharp, denoise;
    vec3 t(vec2 o){ return texture2D(img, uv + o*px).rgb; }
    void main(){
      vec3 c = t(vec2(0.0));
      // 주변 8픽셀
      vec3 n1=t(vec2(-1.0,0.0)), n2=t(vec2(1.0,0.0)), n3=t(vec2(0.0,-1.0)), n4=t(vec2(0.0,1.0));
      vec3 n5=t(vec2(-1.0,-1.0)), n6=t(vec2(1.0,1.0)), n7=t(vec2(1.0,-1.0)), n8=t(vec2(-1.0,1.0));
      vec3 blur = (c*4.0 + (n1+n2+n3+n4)*2.0 + (n5+n6+n7+n8)) / 16.0;
      // 노이즈 줄이기: 차이가 작은(평평한) 곳만 부드럽게
      float d = length(c - blur);
      float flatness = 1.0 - smoothstep(0.02, 0.09, d);
      c = mix(c, blur, denoise * flatness);
      // 선명하게
      c = c + sharp * (c - blur) * (1.0 - flatness * denoise);
      // 자동 밝기·대비
      c = clamp((c - vec3(lo)) / max(0.05, hi - lo), 0.0, 1.0);
      c = pow(c, vec3(gam));
      // 생동감
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;

  function init() {
    if (gl || failed) return !!gl;
    try {
      cv = document.createElement('canvas');
      gl = cv.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
      if (!gl) throw new Error('webgl 없음');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const p = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(p);
      gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      for (const n of ['img', 'px', 'lo', 'hi', 'gam', 'sat', 'sharp', 'denoise']) loc[n] = gl.getUniformLocation(prog, n);
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); gl = null; failed = true; });
      return true;
    } catch (e) {
      console.warn('화질 향상을 쓸 수 없습니다:', e);
      failed = true; gl = null;
      return false;
    }
  }

  /** 미디어의 밝기 분포 분석 (한 번만) */
  function stats(m, src, sw, sh) {
    if (m._stats) return m._stats;
    const c = document.createElement('canvas');
    const sc = 96 / Math.max(sw, sh);
    c.width = Math.max(1, Math.round(sw * sc)); c.height = Math.max(1, Math.round(sh * sc));
    const g = c.getContext('2d', { willReadFrequently: true });
    try { g.drawImage(src, 0, 0, c.width, c.height); } catch (e) { return null; }
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const hist = new Uint32Array(256);
    let sum = 0, satSum = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const l = Math.round(0.299 * r + 0.587 * gg + 0.114 * b);
      hist[l]++; sum += l;
      satSum += (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
    }
    const pct = q => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * q) return i / 255; } return 1; };
    const lo = Math.min(0.15, pct(0.006)), hi = Math.max(0.8, pct(0.994));
    const mean = (sum / n / 255 - lo) / Math.max(0.05, hi - lo);
    const gam = clamp(Math.log(0.47) / Math.log(clamp(mean, 0.05, 0.95)), 0.7, 1.45);
    const avgSat = satSum / n;
    // 비디오는 첫 장면만 보고 정하므로 조금 보수적으로
    m._stats = { lo, hi, gam, avgSat, video: m.type === 'video' };
    return m._stats;
  }

  /** 결과 캔버스(출력 크기) 반환. 실패하면 null */
  function process(src, sw, sh, dw, dh, m, amount) {
    if (!init()) return null;
    const st = stats(m, src, sw, sh);
    if (!st) return null;
    const a = clamp(amount, 0, 1);
    const maxSide = 2560;
    let w = Math.round(dw), h = Math.round(dh);
    const k = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    } catch (e) { return null; }
    const up = Math.max(1, Math.max(w / sw, h / sh)); // 확대 배율
    const vf = st.video ? 0.6 : 1;
    gl.uniform1i(loc.img, 0);
    gl.uniform2f(loc.px, 1 / w * Math.min(up, 2), 1 / h * Math.min(up, 2));
    gl.uniform1f(loc.lo, st.lo * a * vf);
    gl.uniform1f(loc.hi, 1 - (1 - st.hi) * a * vf);
    gl.uniform1f(loc.gam, 1 + (st.gam - 1) * a * vf);
    gl.uniform1f(loc.sat, 1 + a * (st.avgSat < 0.25 ? 0.22 : 0.1));
    gl.uniform1f(loc.sharp, a * (0.55 + Math.min(1, (up - 1)) * 0.6));
    gl.uniform1f(loc.denoise, a * (up > 1.3 ? 0.75 : 0.45));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return cv;
  }
  return { process, available: () => init() };
})();
window.Enhancer = Enhancer;
