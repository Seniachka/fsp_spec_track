import { useEffect, useRef } from "react";

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

const LINK = 148;

function tone(x: number, width: number) {
  const t = width <= 0 ? 0.5 : Math.min(1, Math.max(0, x / width));
  return {
    r: 108 + (18 - 108) * t,
    g: 38 + (92 - 38) * t,
    b: 132 + (124 - 132) * t,
  };
}

export function Constellation() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let nodes: Node[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(390, Math.max(144, (w * h) / 5800)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() < 0.14 ? 2.6 : 1.15 + Math.random() * 0.7,
      }));
    };

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      const reach = LINK * LINK;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = dx * dx + dy * dy;
          if (dist > reach) continue;
          const fade = 1 - Math.sqrt(dist) / LINK;
          const c = tone((a.x + b.x) / 2, w);
          ctx.strokeStyle = `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${(0.32 * fade).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        const c = tone(n.x, w);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, 0.9)`;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tick = () => {
      if (!reduced) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -24) n.x = w + 24;
          else if (n.x > w + 24) n.x = -24;
          if (n.y < -24) n.y = h + 24;
          else if (n.y > h + 24) n.y = -24;
        }
      }
      draw();
      if (!reduced) raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      resize();
      if (reduced) draw();
    };

    resize();
    tick();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="constellation" aria-hidden="true" />;
}
