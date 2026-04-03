'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
  variant?: 'waveform' | 'bars' | 'pulse';
  color?: string;
  height?: number;
  className?: string;
}

/**
 * Real-time audio visualizer using Web Audio API + Canvas.
 * Three variants:
 * - waveform: smooth oscilloscope wave
 * - bars: frequency spectrum bars
 * - pulse: breathing circle that reacts to volume
 */
export function AudioVisualizer({
  stream,
  isActive,
  variant = 'waveform',
  color = '#6366f1',
  height = 80,
  className = '',
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isActive) return;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = variant === 'bars' ? 256 : 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      source.disconnect();
      audioCtx.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream, isActive, variant]);

  useEffect(() => {
    if (!isActive || !analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const analyser = analyserRef.current;

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (variant === 'waveform') {
        drawWaveform(ctx, analyser, w, h, color);
      } else if (variant === 'bars') {
        drawBars(ctx, analyser, w, h, color);
      } else if (variant === 'pulse') {
        drawPulse(ctx, analyser, w, h, color);
      }
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isActive, variant, color]);

  // Idle animation when not active
  useEffect(() => {
    if (isActive || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    const drawIdle = () => {
      animFrameRef.current = requestAnimationFrame(drawIdle);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      t += 0.02;

      // Gentle breathing line
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x++) {
        const y = h / 2 + Math.sin(x * 0.02 + t) * 4 * Math.sin(t * 0.5);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawIdle();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isActive, color]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={height}
      className={`w-full ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  w: number,
  h: number,
  color: string
) {
  const bufferLength = analyser.frequencyBinCount;
  const data = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(data);

  // Glow effect
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;

  // Main wave
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.beginPath();

  const sliceWidth = w / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = data[i] / 128.0;
    const y = (v * h) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  // Mirror wave (subtle)
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = data[i] / 128.0;
    const y = h - (v * h) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  w: number,
  h: number,
  color: string
) {
  const bufferLength = analyser.frequencyBinCount;
  const data = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(data);

  const barCount = 48;
  const gap = 2;
  const barWidth = (w - gap * barCount) / barCount;

  ctx.shadowColor = color;
  ctx.shadowBlur = 6;

  for (let i = 0; i < barCount; i++) {
    // Average a range of frequencies for each bar
    const start = Math.floor((i / barCount) * bufferLength);
    const end = Math.floor(((i + 1) / barCount) * bufferLength);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    const avg = sum / (end - start);

    const barHeight = (avg / 255) * h * 0.9;
    const x = i * (barWidth + gap);
    const y = h - barHeight;

    // Gradient per bar
    const gradient = ctx.createLinearGradient(x, h, x, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, adjustAlpha(color, 0.3));
    ctx.fillStyle = gradient;

    // Rounded top
    const radius = Math.min(barWidth / 2, 3);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, h);
    ctx.lineTo(x, h);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

function drawPulse(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  w: number,
  h: number,
  color: string
) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  // Calculate average volume
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const avg = sum / data.length / 255;

  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(w, h) * 0.2;
  const radius = baseRadius + avg * baseRadius * 1.5;

  // Outer glow rings
  for (let ring = 3; ring >= 0; ring--) {
    const r = radius + ring * 8;
    const alpha = 0.05 * (4 - ring);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = adjustAlpha(color, alpha);
    ctx.fill();
  }

  // Main circle
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, adjustAlpha(color, 0.8));
  gradient.addColorStop(0.7, adjustAlpha(color, 0.4));
  gradient.addColorStop(1, adjustAlpha(color, 0.1));

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Inner bright core
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = adjustAlpha(color, 0.6 + avg * 0.4);
  ctx.fill();
}

function adjustAlpha(hex: string, alpha: number): string {
  // Convert hex to rgba
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// === Compact inline indicator (for use in headers) ===

interface AudioLevelProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export function AudioLevelIndicator({ stream, isActive }: AudioLevelProps) {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !isActive) { setLevel(0); return; }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      setLevel(sum / data.length / 255);
    };
    tick();

    return () => {
      cancelAnimationFrame(frameRef.current);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream, isActive]);

  return (
    <div className="flex items-center gap-[3px] h-6">
      {[0.1, 0.2, 0.35, 0.5, 0.65].map((threshold, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-100"
          style={{
            height: `${Math.max(4, level > threshold ? (level - threshold + 0.3) * 24 : 4)}px`,
            background: level > threshold ? 'var(--color-accent)' : 'var(--color-border)',
            opacity: level > threshold ? 0.7 + level * 0.3 : 0.3,
          }}
        />
      ))}
    </div>
  );
}
