// Edison drawn live on the TV: one solid ball in a single pass, no library, so it stays light, with very faint grid lines turning behind his eye.
// His rainbow is seven separate rings, slightly apart, with the colors flowing outward like his live icon. He blinks, looks around,
// and now and then his eye sinks back into the ball and comes forward. When he talks the panes push out with his voice.
// window.EdisonLive.start(canvas, report) runs him; report(fps, renderer) fires every 2 seconds.
(function () {
  const TAU = Math.PI * 2, FRAME_MS = 1000 / 31, TURN_S = 24, ROAM_FIRST_MS = 12000, ROAM_GAP_MS = 14000;
  const IDLE_FIRST_MS = 25000, IDLE_GAP_MS = 45000, CLOSE_FIRST_MS = 100000, CLOSE_GAP_MS = 70000, FAR_SIZE = 0.28, CLOSE_SIZE = 2.7, FAR_HOLD_MS = 14000, CLOSE_HOLD_MS = 4000, SMALL_RES = 330, CLOSE_RES = 560;
  const RAINBOW = [[1, .23, .23], [1, .54, .12], [1, .84, .04], [.24, .86, .35], [.18, .55, 1], [.36, .24, 1], [.69, .24, 1]];
  const VS = 'attribute vec2 aP; varying vec2 vP; void main() { vP = aP; gl_Position = vec4(aP, 0., 1.); }';
  const FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec2 vP; uniform mat3 uR; uniform vec3 uEye, uEyeU, uEyeV, uRing[7]; uniform float uOpen, uSize, uPush;
    const vec3 PALE = vec3(.93, .92, 1.), BODY = vec3(.1, .15, .42), LINE = vec3(.72, .78, 1.);
    const float STEP = 3.14159265 / 4., W = .1, GAP = .007;
    float grid(float a) { return abs(fract(a / STEP + .5) - .5) * STEP; }
    void main() {
      vec2 p = vP / .96; float r2 = dot(p, p);
      float edge = 1. - smoothstep(.975, 1., r2);
      if (edge <= 0.) discard;
      vec3 n = vec3(p, sqrt(max(0., 1. - r2)));
      vec3 m = uR * n;
      float lat = asin(clamp(m.y, -1., 1.)), w = .012 / max(n.z, .25);
      float line = 1. - smoothstep(w * .5, w * 1.5, min(grid(lat), grid(atan(m.x, m.z)) * cos(lat)));
      vec3 c = mix(BODY, LINE, line * .06);
      if (dot(n, uEye) > 0.) {
        vec2 q = vec2(dot(n, uEyeU), dot(n, uEyeV) / max(uOpen, .04));
        float r = length(q);
        for (int i = 6; i >= 0; i--) {
          float f = float(i), s = uSize * (1. + uPush * (.05 + f * .03));
          float outer = (f + 1.) * W * s, inner = i == 0 ? -1. : f * W * s + GAP * s;
          c = mix(c, uRing[i], smoothstep(inner - .003, inner + .003, r) * (1. - smoothstep(outer - .003, outer + .003, r)));
        }
        c = mix(c, PALE, 1. - smoothstep(W * uSize * .42, W * uSize * .5, r));
      }
      vec3 L1 = normalize(vec3(-.82, .1, .56)), L2 = normalize(vec3(.25, .88, .4));
      float dif = .16 + 1.05 * max(0., dot(n, L1)) + .45 * max(0., dot(n, L2));
      float sp = pow(max(0., dot(n, normalize(L1 + vec3(0., 0., 1.)))), 40.) * .5;
      c = c * dif + sp + vec3(.25, .3, .75) * pow(1. - n.z, 3.) * .3;
      gl_FragColor = vec4(c * edge, edge);
    }`;

  function start(canvas, report) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) { report(0, 'WebGL refused'); return null; }
    const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(prog, 'aP');
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n), uR = U('uR'), uEye = U('uEye'), uEyeU = U('uEyeU'), uEyeV = U('uEyeV'), uOpen = U('uOpen'), uRing = U('uRing'), uSize = U('uSize'), uPush = U('uPush');
    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const state = { gazeX: -0.3, gazeY: 0.1, wantX: -0.3, wantY: 0.1, following: false, nextLook: 2000, spin: 0, extra: 0, blinkAt: 0, size: 1, sizeWant: 1, nextSink: 15000, push: 0 };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
    const rings = new Float32Array(21);
    const roam = { rx: 0, ry: 0, x: 0, y: 0, nowX: 0, nowY: 0, at: 0 };
    const idle = { since: performance.now(), next: performance.now() + IDLE_FIRST_MS, nextClose: performance.now() + CLOSE_FIRST_MS, act: null, until: 0 };
    function setRes(px) { if (canvas.width !== px) { canvas.width = px; canvas.height = px; gl.viewport(0, 0, px, px); } }
    function endAct() { idle.act = null; state.following = false; state.nextLook = 0; }
    let last = 0, frames = 0, windowStart = performance.now(), running = true, firstFrame = true;
    const api = {
      voice: null, // set while he talks: returns how loud he is, 0 to 1
      offset: { x: 0, y: 0 }, // how far he has floated from his home spot
      zoom: 1, // how near he is: under 1 is far away, over 1 is right up at the glass
      center: { x: 0, y: 0 }, // the middle of the screen, measured from his home spot
      // Left alone for a while, he does something: goes far away, or comes right up and looks in at you. Any touch of the remote ends it.
      touch() { idle.since = performance.now(); idle.next = idle.since + IDLE_FIRST_MS; idle.nextClose = Math.max(idle.nextClose, idle.since + IDLE_FIRST_MS); if (idle.act) endAct(); },
      act(kind) { idle.act = kind; idle.until = performance.now() + (kind === 'close' ? CLOSE_HOLD_MS : FAR_HOLD_MS) + 1500; setRes(kind === 'close' ? CLOSE_RES : SMALL_RES); if (kind === 'close') { state.wantX = 0; state.wantY = 0; state.following = true; } },
      roamBox(rx, ry) { roam.rx = rx; roam.ry = ry; roam.x = 0; roam.y = 0; roam.at = 0; roam.nowX = 0; roam.nowY = 0; },
      lookAt(dx, dy) { state.following = true; state.wantX = Math.max(-0.7, Math.min(0.7, dx)); state.wantY = Math.max(-0.7, Math.min(0.7, dy)); },
      rest() { state.following = false; state.nextLook = 0; },
      spinKick() { state.extra = 0.012; },
      stop() { running = false; }
    };

    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (document.hidden || now - last < FRAME_MS) return;
      const dt = Math.min(100, now - last); last = now;
      if (firstFrame) { firstFrame = false; state.blinkAt = now + 2500; roam.at = now + ROAM_FIRST_MS; }
      // every so often he drifts off somewhere new in the open part of the screen
      if (!roam.at) roam.at = now + ROAM_GAP_MS;
      if (now > roam.at) {
        roam.x = (Math.random() * 2 - 1) * roam.rx; roam.y = (Math.random() * 2 - 1) * roam.ry;
        roam.at = now + ROAM_GAP_MS + Math.random() * ROAM_GAP_MS;
      }
      if (idle.act && now > idle.until) { endAct(); idle.next = now + IDLE_GAP_MS + Math.random() * IDLE_GAP_MS; }
      if (!idle.act && now > idle.next) {
        // mostly he drifts far off; coming right up to the glass is a rarer treat
        if (now > idle.nextClose) { idle.nextClose = now + CLOSE_GAP_MS + Math.random() * CLOSE_GAP_MS; api.act('close'); } else api.act('far');
      }
      // at rest he still drifts gently toward you and away
      const wantZoom = idle.act === 'close' ? CLOSE_SIZE : idle.act === 'far' ? FAR_SIZE * (1 + 0.25 * Math.sin(now / 2600)) : 1 + 0.16 * Math.sin(now / 7000);
      api.zoom += (wantZoom - api.zoom) * (idle.act === 'far' ? 0.02 : 0.035);
      if (idle.act !== 'close' && api.zoom < 1.05) setRes(SMALL_RES); // back to the light size once he's home
      const towardX = idle.act === 'close' ? api.center.x : roam.x, towardY = idle.act === 'close' ? api.center.y : roam.y;
      roam.nowX += (towardX - roam.nowX) * (idle.act === 'close' ? 0.035 : 0.012);
      roam.nowY += (towardY - roam.nowY) * (idle.act === 'close' ? 0.035 : 0.012);
      // on his own he glances somewhere new every few seconds
      if (!state.following && now > state.nextLook) {
        state.wantX = (Math.random() - 0.5) * 1.1; state.wantY = (Math.random() - 0.5) * 0.7;
        state.nextLook = now + 4000 + Math.random() * 6000;
      }
      // now and then his eye sinks back into the ball, then comes forward again
      if (now > state.nextSink) {
        state.sizeWant = state.sizeWant < 1 ? 1 : 0.5;
        state.nextSink = now + (state.sizeWant < 1 ? 2200 : 16000 + Math.random() * 20000);
      }
      state.size += (state.sizeWant - state.size) * 0.05;
      const level = api.voice ? Math.min(1, api.voice()) : 0;
      state.push += (level - state.push) * 0.35;
      state.extra *= Math.pow(0.97, dt / 16);
      state.spin += (TAU / TURN_S / 1000 + state.extra) * dt;
      state.gazeX += (state.wantX - state.gazeX) * 0.05;
      state.gazeY += (state.wantY - state.gazeY) * 0.05;
      const t = now / 1000, a = state.spin, b = 0.35 * Math.sin(t * 0.31);
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      gl.uniformMatrix3fv(uR, false, [ca, sb * sa, -cb * sa, 0, cb, sb, sa, -sb * ca, cb * ca]);
      const e = [state.gazeX, state.gazeY, 1], l = Math.hypot(e[0], e[1], e[2]); e[0] /= l; e[1] /= l; e[2] /= l;
      const ru = Math.hypot(e[2], e[0]), r = [e[2] / ru, 0, -e[0] / ru], up = [e[1] * r[2] - e[2] * r[1], e[2] * r[0] - e[0] * r[2], e[0] * r[1] - e[1] * r[0]];
      gl.uniform3fv(uEye, e); gl.uniform3fv(uEyeU, r); gl.uniform3fv(uEyeV, up);
      gl.uniform1f(uSize, state.size);
      gl.uniform1f(uPush, state.push * 2.4);
      // the colors flow outward through the panes, about one ring a second, as on his live icon
      const shift = now / 900;
      for (let i = 0; i < 7; i++) {
        const pos = i - shift, k = Math.floor(pos), fr = pos - k, A = RAINBOW[((k % 7) + 7) % 7], B = RAINBOW[(((k + 1) % 7) + 7) % 7];
        for (let j = 0; j < 3; j++) rings[i * 3 + j] = A[j] + (B[j] - A[j]) * fr;
      }
      gl.uniform3fv(uRing, rings);
      const x = now - state.blinkAt;
      if (x > 400) state.blinkAt = now + 2500 + Math.random() * 5000;
      gl.uniform1f(uOpen, x < 0 ? 1 : x < 130 ? Math.max(0.04, 1 - x / 130) : Math.min(1, (x - 130) / 270));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frames++;
      api.offset.x = roam.nowX + 28 * Math.sin(t * 0.26);
      api.offset.y = roam.nowY + 22 * Math.sin(t * 0.42 + 0.7);
      canvas.style.transform = 'translate(' + api.offset.x.toFixed(1) + 'px,' + api.offset.y.toFixed(1) + 'px) scale(' + api.zoom.toFixed(3) + ')';
      if (now - windowStart >= 2000) { report(Math.round(frames * 1000 / (now - windowStart)), renderer); frames = 0; windowStart = now; }
    }
    requestAnimationFrame(frame);
    window.EdisonLive.last = api;
    return api;
  }
  window.EdisonLive = { start };
})();
