import React, { useEffect, useRef } from "react";
import { JarvisStage } from "./HolographicCanvas";

interface OscilloscopeCanvasProps {
  stage: JarvisStage;
  audioLevel: number;
  micActive: boolean;
}

const STAGE_HUES: Record<JarvisStage, number> = {
  listening: 190,
  recognizing: 46,
  thinking: 278,
  speaking: 152,
  idle: 195,
  cooldown: 32,
};

export const OscilloscopeCanvas: React.FC<OscilloscopeCanvasProps> = ({
  stage,
  audioLevel,
  micActive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<JarvisStage>(stage);
  const levelRef = useRef<number>(audioLevel);
  const micRef = useRef<boolean>(micActive);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    micRef.current = micActive;
  }, [micActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let hue = 190;
    let amp = 0.1;
    let lastTs = 0;
    let t = 0;

    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth || 280;
      h = canvas.clientHeight || 76;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const draw = (ts: number) => {
      animId = requestAnimationFrame(draw);
      if (ts - lastTs < 24) return;
      const dt = Math.min(ts - lastTs, 100);
      lastTs = ts;
      t += dt / 1000;

      const st = stageRef.current;
      const rawLevel = levelRef.current;

      let targetAmp = 0.08;
      if (st === "speaking") {
        targetAmp = 0.52 + 0.35 * Math.abs(Math.sin(t * 9.5) * Math.cos(t * 4.2));
      } else if (micRef.current) {
        targetAmp = 0.12 + Math.min(1, rawLevel * 2.2) * 0.85;
      } else if (st === "thinking") {
        targetAmp = 0.22 + 0.15 * Math.sin(t * 4);
      } else {
        targetAmp = 0.08 + 0.03 * Math.sin(t * 2);
      }

      amp += (targetAmp - amp) * 0.3;
      const targetHue = STAGE_HUES[st] ?? 190;
      hue += (targetHue - hue) * 0.1;

      const mid = h / 2;
      ctx.clearRect(0, 0, w, h);

      // Subtle Horizontal Reference Grid
      ctx.strokeStyle = `hsla(${Math.round(hue)}, 100%, 60%, 0.18)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      const speedMult = st === "speaking" ? 2.3 : micRef.current ? 1.6 : 1.0;

      // 4-Tier Multi-Harmonic Oscilloscope Waveforms
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const nx = x / w;
          const env = Math.sin(nx * Math.PI);
          const wave =
            Math.sin(nx * (12 + k * 8) + t * (2.2 + k * 1.2) * speedMult) *
              (h * 0.42) *
              amp *
              env *
              (1 - k * 0.2) +
            Math.sin(nx * 46 + t * 6) * h * 0.05 * amp;
          const y = mid + wave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${Math.round(hue)}, 100%, ${64 + k * 8}%, ${0.95 - k * 0.22})`;
        ctx.lineWidth = 2.2 - k * 0.45;
        ctx.stroke();
      }
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-[76px] block rounded bg-[#010712]/70 border border-cyan-500/15"
      aria-label="Voice Frequency Oscilloscope"
    />
  );
};
