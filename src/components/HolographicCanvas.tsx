import React, { useEffect, useRef } from "react";

export type OrnionStage = "listening" | "recognizing" | "thinking" | "speaking" | "idle" | "cooldown";
export type JarvisStage = OrnionStage;

interface HolographicCanvasProps {
  stage: OrnionStage;
  audioLevel: number;
  failoverActive: boolean;
}

const STAGE_HUES: Record<JarvisStage, number> = {
  listening: 190,
  recognizing: 46,
  thinking: 278,
  speaking: 152,
  idle: 195,
  cooldown: 32,
};

interface Particle {
  x: number;
  y: number;
  v: number;
  r: number;
  a: number;
}

interface OrbitNode {
  speed: number;
  dist: number;
  phase: number;
  size: number;
}

// Precompute 3D Wireframe Globe lat/lon rings
const GLOBE_RINGS: Array<Array<[number, number, number]>> = [];
for (const lat of [-60, -30, 0, 30, 60]) {
  const ring: Array<[number, number, number]> = [];
  const la = (lat * Math.PI) / 180;
  for (let j = 0; j <= 48; j++) {
    const a = (j / 48) * Math.PI * 2;
    ring.push([Math.cos(la) * Math.cos(a), Math.sin(la), Math.cos(la) * Math.sin(a)]);
  }
  GLOBE_RINGS.push(ring);
}
for (let k = 0; k < 10; k++) {
  const lon = (k / 10) * Math.PI;
  const ring: Array<[number, number, number]> = [];
  for (let j = 0; j <= 48; j++) {
    const b = (j / 48) * Math.PI * 2;
    ring.push([Math.cos(b) * Math.cos(lon), Math.sin(b), Math.cos(b) * Math.sin(lon)]);
  }
  GLOBE_RINGS.push(ring);
}

export const HolographicCanvas: React.FC<HolographicCanvasProps> = ({
  stage,
  audioLevel,
  failoverActive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<JarvisStage>(stage);
  const levelRef = useRef<number>(audioLevel);
  const failoverRef = useRef<boolean>(failoverActive);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    failoverRef.current = failoverActive;
  }, [failoverActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let hue = 190;
    let amp = 0.08;
    let lastTs = 0;
    let elapsed = 0;

    const particles: Particle[] = Array.from({ length: 65 }, () => ({
      x: Math.random(),
      y: Math.random(),
      v: 8 + Math.random() * 22,
      r: 0.7 + Math.random() * 1.4,
      a: 0.15 + Math.random() * 0.45,
    }));

    const orbits: OrbitNode[] = Array.from({ length: 10 }, (_, i) => ({
      speed: 0.65 + (i % 4) * 0.18,
      dist: 0.86 + (i % 3) * 0.11,
      phase: (i / 10) * Math.PI * 2,
      size: 2.0 + (i % 3) * 0.9,
    }));

    const handleResize = () => {
      if (!canvas.parentElement) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const col = (lightness: number, alpha: number) =>
      `hsla(${Math.round(hue)}, 100%, ${lightness}%, ${alpha})`;

    const drawGlobe = (cx: number, cy: number, r: number, t: number) => {
      const ry = t * 0.38;
      const tx = 0.4;
      const cyc = Math.cos(ry);
      const syc = Math.sin(ry);
      const ct = Math.cos(tx);
      const stt = Math.sin(tx);
      const frontPath = new Path2D();
      const backPath = new Path2D();

      for (const pts of GLOBE_RINGS) {
        let prev: [number, number] | null = null;
        for (const p of pts) {
          const x = p[0] * cyc + p[2] * syc;
          const z = -p[0] * syc + p[2] * cyc;
          const y = p[1];
          const y2 = y * ct - z * stt;
          const z2 = y * stt + z * ct;
          const px = cx + x * r;
          const py = cy + y2 * r;
          if (prev) {
            const target = z2 >= 0 ? frontPath : backPath;
            target.moveTo(prev[0], prev[1]);
            target.lineTo(px, py);
          }
          prev = [px, py];
        }
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = col(55, 0.16);
      ctx.stroke(backPath);
      ctx.strokeStyle = col(74, 0.82);
      ctx.stroke(frontPath);
    };

    const drawReactor = (cx: number, cy: number, R: number, t: number) => {
      ctx.lineCap = "round";

      // 1. Outer Tech Degree Ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.06);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = col(65, 0.55);
      ctx.beginPath();
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const len = i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 4;
        ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.lineTo(Math.cos(a) * (R - len), Math.sin(a) * (R - len));
      }
      ctx.stroke();
      ctx.restore();

      // 2. Pulsing Quantum Arc Segments
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-t * 0.22);
      ctx.lineWidth = 4;
      ctx.strokeStyle = col(66, 0.85);
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.91, k * 1.5708 + 0.15, k * 1.5708 + 1.25);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Counter-Rotating Data Dash Ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.32);
      ctx.setLineDash([4, 9]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = col(75, 0.68);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.81, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 4. Audio-Reactive Plasma Corona Spikes
      const numSpikes = 96;
      const r0 = R * 0.62;
      ctx.strokeStyle = col(70, 0.92);
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      for (let i = 0; i < numSpikes; i++) {
        const a = (i / numSpikes) * Math.PI * 2 + t * 0.1;
        const spike = Math.sin(i * 1.8 + t * 5) * Math.cos(i * 0.4 - t * 2.5);
        const len = 4 + amp * R * 0.26 * (0.35 + Math.abs(spike));
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      }
      ctx.stroke();

      // 5. Conic Radar Sweep
      if (typeof ctx.createConicGradient === "function") {
        const cg = ctx.createConicGradient(t * 1.35, cx, cy);
        cg.addColorStop(0, col(60, 0));
        cg.addColorStop(0.84, col(60, 0));
        cg.addColorStop(1, col(75, 0.4));
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.58, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Central 3D Wireframe Globe
      drawGlobe(cx, cy, R * 0.42, t);

      // 7. Arc Heart Plasma Core
      const pulse = Math.sin(t * 3.5) * 0.04 + Math.sin(t * 7) * 0.018;
      const coreR = R * (0.15 + amp * 0.07 + pulse);
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      rg.addColorStop(0, "#ffffff");
      rg.addColorStop(0.28, col(92, 0.95));
      rg.addColorStop(0.68, col(68, 0.52));
      rg.addColorStop(1, col(50, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 8. Rotating Starburst Aperture Blades
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.48);
      ctx.strokeStyle = col(86, 0.92);
      ctx.lineWidth = Math.max(2, R * 0.028);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.24, a + 0.06, a + 0.38);
        ctx.stroke();
      }
      ctx.restore();

      // 9. Orbiting Quantum Nodes
      for (const orb of orbits) {
        const angle = t * orb.speed + orb.phase;
        const ox = cx + Math.cos(angle) * (R * orb.dist);
        const oy = cy + Math.sin(angle) * (R * orb.dist * 0.65);
        ctx.fillStyle = col(94, 0.9);
        ctx.beginPath();
        ctx.arc(ox, oy, orb.size * (1 + amp * 0.65), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const renderFrame = (ts: number) => {
      animId = requestAnimationFrame(renderFrame);
      if (ts - lastTs < 24) return;
      const dt = Math.min(ts - lastTs, 100);
      lastTs = ts;
      elapsed += dt / 1000;

      const currentStage: JarvisStage = failoverRef.current ? "cooldown" : stageRef.current;
      const rawMic = levelRef.current;

      let targetAmp = 0.08;
      switch (currentStage) {
        case "listening":
          targetAmp = 0.08 + Math.min(1, rawMic * 1.8) * 0.88;
          break;
        case "recognizing":
          targetAmp = 0.28 + 0.18 * Math.sin(elapsed * 8) + rawMic * 0.5;
          break;
        case "thinking":
          targetAmp = 0.24 + 0.22 * Math.abs(Math.sin(elapsed * 3.5));
          break;
        case "speaking":
          targetAmp = 0.45 + 0.36 * Math.abs(Math.sin(elapsed * 9.2) * Math.sin(elapsed * 5.1)) + rawMic * 0.3;
          break;
        case "cooldown":
          targetAmp = 0.14 + 0.1 * Math.sin(elapsed * 2.5);
          break;
        default:
          targetAmp = 0.07;
      }

      amp += (targetAmp - amp) * 0.25;
      const targetHue = STAGE_HUES[currentStage] ?? 190;
      hue += (targetHue - hue) * 0.08;

      const cx = width / 2;
      const cy = height * 0.44;
      const R = Math.min(width * 0.34, height * 0.34, 195);

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, width, height);

      // Ambient Radial Glow
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.65);
      bgGrad.addColorStop(0, col(22, 0.38));
      bgGrad.addColorStop(1, "rgba(2, 6, 13, 0)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "lighter";

      // Perspective Horizon Grid
      const hz = height * 0.72;
      ctx.lineWidth = 1;
      ctx.strokeStyle = col(60, 0.11);
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const f = (i + ((elapsed * 0.32) % 1)) / 14;
        const y = hz + f * f * (height - hz);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      for (let i = -12; i <= 12; i++) {
        ctx.moveTo(width / 2 + i * width * 0.02, hz);
        ctx.lineTo(width / 2 + i * width * 0.18, height);
      }
      ctx.stroke();

      // Floating Telemetry Dust Particles
      ctx.fillStyle = col(80, 0.55);
      for (const p of particles) {
        p.y -= (p.v * dt) / 1000 / Math.max(height, 300);
        if (p.y < 0) {
          p.y = 1;
          p.x = Math.random();
        }
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      drawReactor(cx, cy, R, elapsed);
      ctx.globalCompositeOperation = "source-over";
    };

    animId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block pointer-events-none"
      aria-label="ORNION 3D Holographic Neural Core and Wireframe Globe"
    />
  );
};
