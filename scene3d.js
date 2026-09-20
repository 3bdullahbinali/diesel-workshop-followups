'use strict';
/**
 * «مجسّم» — نواة ثلاثية الأبعاد صغيرة للمشروع.
 *
 * لا مكتبة ولا WebGL ولا خطوة بناء: هندسة تُبنى من مجسّمات أوّلية، ثم إسقاط
 * بالمنظور، ثم ترتيب الأوجه بالعمق ورسمها من الأبعد إلى الأقرب (خوارزمية
 * الرسّام)، وإضاءة باتجاه واحد تُظلّل كل وجه بحسب ميله.
 *
 * كل شكل يُبنى حول مركزه، ويُصحَّح لفّ رؤوس كل وجه تلقائياً ليشير عموده إلى
 * خارج الجسم — فلا يحتاج بناء الأشكال إلى تتبّع اتجاه اللفّ يدوياً.
 */
(() => {
  const S = {};

  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const norm = v => { const L = Math.hypot(v[0], v[1], v[2]) || 1;
                      return [v[0]/L, v[1]/L, v[2]/L]; };

  const centroid = pts => {
    const c = [0, 0, 0];
    for (const p of pts){ c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    return [c[0]/pts.length, c[1]/pts.length, c[2]/pts.length];
  };
  const normalOf = pts => cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));

  /** لون مضروب في معامل إضاءة. */
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    return `rgb(${r},${g},${b})`;
  };

  /**
   * وجه يشير عموده إلى خارج الجسم: إن أشار إلى الداخل عُكس لفّ رؤوسه.
   * بهذا لا يحتاج أي شكل إلى ترتيب رؤوسه بعناية.
   */
  function outward(pts, colour, about, extra){
    const v = sub(centroid(pts), about);
    const p = dot(normalOf(pts), v) < 0 ? pts.slice().reverse() : pts;
    return Object.assign({p, c: colour}, extra);
  }
  S.outward = outward;

  /** صندوق. `skip` أسماء أوجه تُترك مفتوحة: px nx py ny pz nz — وبها يصير المقطع مقطوعاً. */
  S.box = (x, y, z, w, h, d, colour, skip) => {
    const X = w/2, Y = h/2, Z = d/2, o = [x, y, z], out = [], no = skip || [];
    const v = (a, b, c) => [x + a*X, y + b*Y, z + c*Z];
    const add = (name, pts) => {
      if (!no.includes(name)) out.push(outward(pts, colour, o, {n: name}));
    };
    add('px', [v(1,-1,-1), v(1,-1,1), v(1,1,1), v(1,1,-1)]);
    add('nx', [v(-1,-1,-1), v(-1,-1,1), v(-1,1,1), v(-1,1,-1)]);
    add('py', [v(-1,1,-1), v(-1,1,1), v(1,1,1), v(1,1,-1)]);
    add('ny', [v(-1,-1,-1), v(-1,-1,1), v(1,-1,1), v(1,-1,-1)]);
    add('pz', [v(-1,-1,1), v(1,-1,1), v(1,1,1), v(-1,1,1)]);
    add('nz', [v(-1,-1,-1), v(1,-1,-1), v(1,1,-1), v(-1,1,-1)]);
    return out;
  };

  /**
   * أسطوانة حول محور x أو y أو z. `opts.from`/`opts.to` زاويتان بالراديان
   * لرسم نصف أسطوانة (يُفتح بها المقطع)، و`opts.caps` أي الغطاءين يُرسم.
   */
  S.cyl = (x, y, z, r, len, seg, colour, axis, opts) => {
    const o = {from: 0, to: Math.PI*2, caps: 'both', ...(opts || {})};
    const half = len/2, out = [], centre = [x, y, z];
    const at = (ang, side) => {
      const c = Math.cos(ang)*r, s = Math.sin(ang)*r, h = side*half;
      return axis === 'x' ? [x + h, y + c, z + s]
           : axis === 'y' ? [x + c, y + h, z + s]
           : [x + c, y + s, z + h];
    };
    const span = o.to - o.from, closed = Math.abs(span - Math.PI*2) < 1e-6;
    for (let i = 0; i < seg; i++){
      const a0 = o.from + span*(i/seg), a1 = o.from + span*((i+1)/seg);
      if (!closed && i === seg) break;
      out.push(outward([at(a0,-1), at(a1,-1), at(a1,1), at(a0,1)], colour, centre));
    }
    const cap = side => {
      const pts = [];
      for (let i = 0; i <= seg; i++) pts.push(at(o.from + span*(i/seg), side));
      if (!closed){
        const h = side*half;
        pts.push(axis === 'x' ? [x+h, y, z] : axis === 'y' ? [x, y+h, z] : [x, y, z+h]);
      }
      out.push(outward(pts, colour, centre));
    };
    if (o.caps === 'both' || o.caps === 'near') cap(1);
    if (o.caps === 'both' || o.caps === 'far') cap(-1);
    return out;
  };

  /** قضيب بين نقطتين: يُستعمل لذراع التوصيل والأضلاع المائلة. */
  S.bar = (p0, p1, w, d, colour) => {
    const dir = norm(sub(p1, p0));
    let up = Math.abs(dir[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const side = norm(cross(dir, up)); up = norm(cross(side, dir));
    const mid = [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2, (p0[2]+p1[2])/2];
    const corner = (p, a, b) => [p[0] + side[0]*a*w/2 + up[0]*b*d/2,
                                 p[1] + side[1]*a*w/2 + up[1]*b*d/2,
                                 p[2] + side[2]*a*w/2 + up[2]*b*d/2];
    const q = [[-1,-1], [1,-1], [1,1], [-1,1]].map(([a, b]) => [corner(p0,a,b), corner(p1,a,b)]);
    const out = [];
    for (let i = 0; i < 4; i++){
      const j = (i+1)%4;
      out.push(outward([q[i][0], q[j][0], q[j][1], q[i][1]], colour, mid));
    }
    out.push(outward(q.map(c => c[0]), colour, mid));
    out.push(outward(q.map(c => c[1]), colour, mid));
    return out;
  };

  /** أنبوب يتبع مساراً: الخراطيم والمواسير المنحنية. */
  S.tube = (path, r, seg, colour) => {
    const rings = path.map((p, i) => {
      const a = path[Math.max(0, i-1)], b = path[Math.min(path.length-1, i+1)];
      const dir = norm(sub(b, a));
      let up = Math.abs(dir[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
      const side = norm(cross(dir, up)); up = norm(cross(side, dir));
      const ring = [];
      for (let k = 0; k < seg; k++){
        const t = (k/seg)*Math.PI*2, c = Math.cos(t)*r, s = Math.sin(t)*r;
        ring.push([p[0] + side[0]*c + up[0]*s, p[1] + side[1]*c + up[1]*s,
                   p[2] + side[2]*c + up[2]*s]);
      }
      return ring;
    });
    const out = [];
    for (let i = 0; i < rings.length - 1; i++){
      const mid = [(path[i][0]+path[i+1][0])/2, (path[i][1]+path[i+1][1])/2,
                   (path[i][2]+path[i+1][2])/2];
      for (let k = 0; k < seg; k++){
        const j = (k+1)%seg;
        out.push(outward([rings[i][k], rings[i][j], rings[i+1][j], rings[i+1][k]], colour, mid));
      }
    }
    return out;
  };

  /** ترس بأسنان حقيقية: محيطه يتموّج بين قطر القمة وقطر القاع. */
  S.gear = (x, y, z, r, teeth, thick, colour, angle) => {
    const m = 2*r/teeth, R = r + m, rr = r - 1.25*m, o = [x, y, z], out = [];
    const rim = [];
    for (let i = 0; i < teeth; i++){
      const c = angle + (i/teeth)*Math.PI*2, P = Math.PI*2/teeth;
      rim.push([c - 0.31*P, rr], [c - 0.15*P, R], [c + 0.15*P, R], [c + 0.31*P, rr]);
    }
    const at = (a, rad, side) => [x + Math.cos(a)*rad, y + Math.sin(a)*rad, z + side*thick/2];
    for (let i = 0; i < rim.length; i++){
      const [a0, r0] = rim[i], [a1, r1] = rim[(i+1)%rim.length];
      out.push(outward([at(a0,r0,-1), at(a1,r1,-1), at(a1,r1,1), at(a0,r0,1)], colour, o));
    }
    for (const side of [1, -1])
      out.push(outward(rim.map(([a, rad]) => at(a, rad, side)), colour, o));
    return out;
  };

  /** دوران مجموعة أوجه حول محور يمرّ بنقطة. */
  S.spin = (faces, axis, ang, about) => {
    const c = Math.cos(ang), s = Math.sin(ang), [ax, ay, az] = about || [0, 0, 0];
    const turn = p => {
      const x = p[0]-ax, y = p[1]-ay, z = p[2]-az;
      return axis === 'x' ? [p[0], ay + y*c - z*s, az + y*s + z*c]
           : axis === 'y' ? [ax + x*c + z*s, p[1], az - x*s + z*c]
           : [ax + x*c - y*s, ay + x*s + y*c, p[2]];
    };
    return faces.map(f => Object.assign({}, f, {p: f.p.map(turn)}));
  };

  /**
   * الرسم: تدوير المشهد بزاويتي الكاميرا، ثم إخفاء الأوجه المُدبِرة، ثم
   * ترتيب الباقي من الأبعد إلى الأقرب، ثم تعبئتها بلونها مُظلَّلاً.
   */
  S.render = (ctx, faces, cam) => {
    const yaw = cam.yaw, pit = cam.pitch, f = cam.focal || 1500;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pit), sp = Math.sin(pit);
    const light = cam.light || norm([-0.45, 0.78, 0.62]);
    const ready = [];
    for (const face of faces){
      const view = [];
      let zm = 0;
      for (const p of face.p){
        const x = p[0]*cy + p[2]*sy, z0 = -p[0]*sy + p[2]*cy;
        const y = p[1]*cp - z0*sp, z = p[1]*sp + z0*cp;
        view.push([x, y, z]); zm += z;
      }
      const n = normalOf(view);
      if (!face.both && n[2] <= 0) continue;              // وجه مُدبِر: لا يُرسم
      const lit = 0.40 + 0.60*Math.max(0, dot(norm(n), light));
      const flat = view.map(p => {
        const s = f/(f - p[2]);
        return [cam.ox + p[0]*s*cam.scale, cam.oy - p[1]*s*cam.scale];
      });
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of flat){
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
      }
      ready.push({flat, z: zm/view.length, a: face.alpha == null ? 1 : face.alpha,
                  big: (x1 - x0) > 6 && (y1 - y0) > 6,
                  c: shade(face.c, face.flat ? 1 : lit)});
    }
    ready.sort((a, b) => a.z - b.z);                      // الأبعد أولاً
    for (const r of ready){
      ctx.globalAlpha = r.a;
      ctx.beginPath();
      ctx.moveTo(r.flat[0][0], r.flat[0][1]);
      for (let i = 1; i < r.flat.length; i++) ctx.lineTo(r.flat[i][0], r.flat[i][1]);
      ctx.closePath();
      ctx.fillStyle = r.c; ctx.fill();
      if (r.big){ ctx.strokeStyle = r.c; ctx.lineWidth = 0.8; ctx.stroke(); }  // يسدّ شقوق التجاور
    }
    ctx.globalAlpha = 1;
    return ready.length;
  };

  /** جعل أوجه شفّافة: غلاف يُرى ما خلفه، وهو ما يفتح المقطع دون حذف الجدار. */
  S.ghost = (faces, alpha) => faces.map(f => Object.assign({}, f, {alpha: alpha == null ? .24 : alpha}));

  /** اختيار أوجه بأسمائها أو استبعادها: pz nx py ny px nz. */
  S.only = (faces, names) => faces.filter(f => names.includes(f.n));
  S.without = (faces, names) => faces.filter(f => !names.includes(f.n));

  /** إسقاط نقطة واحدة: لوضع نصّ أو علامة فوق جزء في المجسّم. */
  S.project = (p, cam) => {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const f = cam.focal || 1500;
    const x = p[0]*cy + p[2]*sy, z0 = -p[0]*sy + p[2]*cy;
    const y = p[1]*cp - z0*sp, z = p[1]*sp + z0*cp;
    const s = f/(f - z);
    return [cam.ox + x*s*cam.scale, cam.oy - y*s*cam.scale, z];
  };

  window.Scene3D = S;
})();
