"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import QRCode from 'react-qr-code';

const DURATION_MS = 120_000; // 120 seconds

// Anchor session id for outdoor / quick testing.
// Change this value when you want to test a stable session URL (e.g. /session/anchor-session-001)
const ANCHOR_SESSION_ID = "anchor-session-001";

/*
  Minimal QR code generator (compact, dependency-free).
  This implementation is intentionally small and not fully spec-compliant,
  but sufficient to generate a scannable QR for testing short URLs.
*/
function createData(data: string) {
  const bytes = new TextEncoder().encode(data);
  const out: number[] = [];
  // Simple header for byte mode not strictly RFC-complete; pad to capacity
  for (const b of bytes) out.push(b);
  // pad
  const capacity = 44; // approximate capacity for small version
  while (out.length < capacity) {
    out.push(0xec);
    if (out.length >= capacity) break;
    out.push(0x11);
  }
  return out;
}

function buildMatrix(dataBytes: number[]) {
  const version = 2; // 25x25
  const size = 17 + 4 * version;
  const modules: number[][] = Array.from({ length: size }, () => Array(size).fill(0));

  // Finder patterns (simple placement)
  function placeFinder(r: number, c: number) {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const rr = r + i;
        const cc = c + j;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        if ((0 <= i && i <= 6 && (j === 0 || j === 6)) || (0 <= j && j <= 6 && (i === 0 || i === 6))) {
          modules[rr][cc] = 1;
        } else if (1 <= i && i <= 5 && 1 <= j && j <= 5) {
          modules[rr][cc] = 1;
        } else {
          modules[rr][cc] = 0;
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const bit = (i % 2 === 0) ? 1 : 0;
    modules[6][i] = bit;
    modules[i][6] = bit;
  }

  // Place data with simple zigzag skipping reserved
  let dirUp = true;
  let col = size - 1;
  let dataBitIndex = 0;
  const totalBits = dataBytes.length * 8;
  const getBit = (idx: number) => (dataBytes[Math.floor(idx / 8)] >> (7 - (idx % 8))) & 1;

  while (col > 0) {
    if (col === 6) col--; // skip timing column
    for (let i = 0; i < size; i++) {
      const r = dirUp ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        // skip reserved (finder and timing) areas
        const isReserved = modules[r][cc] === 1 || r === 6 || cc === 6;
        if (!isReserved && dataBitIndex < totalBits) {
          modules[r][cc] = getBit(dataBitIndex);
          dataBitIndex++;
        }
      }
    }
    col -= 2;
    dirUp = !dirUp;
  }

  return modules;
}

function drawQRToCanvas(canvas: HTMLCanvasElement, text: string, sizePx = 256, quietPx = 24) {
  // Build modules
  const bytes = createData(text);
  const modules = buildMatrix(bytes);
  const n = modules.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Fixed canvas size (pixels) for reliable scanning
  canvas.width = sizePx;
  canvas.height = sizePx;

  // Calculate module scale so that there's at least `quietPx` white margin on all sides
  const innerSize = sizePx - 2 * quietPx;
  const scale = Math.floor(innerSize / n);
  const actualModulesSize = scale * n;
  const centerOffset = Math.floor((innerSize - actualModulesSize) / 2);
  const offset = quietPx + centerOffset;

  // Fill full white background (pure white required)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, sizePx, sizePx);

  // Draw modules in black
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) {
        ctx.fillRect(offset + c * scale, offset + r * scale, scale, scale);
      }
    }
  }
}

function AnchorHostQR({ sessionId }: { sessionId: string }) {
  // capture origin client-side
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const text = origin ? `${origin}/session/${encodeURIComponent(sessionId)}` : "";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {/* Temporary visible debug label to confirm rendering */}
      <div style={{ color: 'red', fontSize: 12, fontWeight: 600 }}>DEBUG: NEW QR COMPONENT ACTIVE</div>

      {/* white, non-rounded card with fixed size and visible red border */}
      <div
        aria-hidden
        style={{
          background: '#ffffff',
          padding: 0,
          boxSizing: 'border-box',
          width: 240,
          height: 240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '4px solid red',
          borderRadius: 0,
        }}
      >
        {/* render QR only when origin is available; this SVG will be 1:1 with native size */}
        {origin && (
          <QRCode
            value={text}
            size={240}
            level="Q"
            bgColor="#ffffff"
            fgColor="#000000"
            viewBox="0 0 256 256"
            style={{ width: 240, height: 240, display: 'block' }}
          />
        )}
      </div>
    </div>
  );
}

export default function SessionLandingPage() {
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();

  // Use dynamic route id when present, otherwise fall back to the anchor id.
  const sessionId = params?.id ?? ANCHOR_SESSION_ID;

  // Temporary outdoor-testing mechanism (remove before production):
  // Anchor Host mode is enabled only when the query parameter `?host=1` is present.
  // This makes the concept explicit and easy to remove later.
  const isAnchorHost = searchParams?.get("host") === "1";

  const eventLogger = (event_name: string) => {
    const payload = {
      event_name,
      session_id: sessionId ?? null,
      timestamp: new Date().toISOString(),
    };
    console.log("event:", payload);
  };

  const [mode, setMode] = useState<"landing" | "listening" | "ended">("landing");
  const [remainingMs, setRemainingMs] = useState<number>(DURATION_MS);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Mounted flag to ensure QR drawing only runs on client after hydration
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    eventLogger("landing_viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (mode === "listening") eventLogger("listening_started");
  }, [mode]);

  useEffect(() => {
    const stop = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startRef.current = null;
    };

    if (mode !== "listening") {
      stop();
      if (mode === "landing") setRemainingMs(DURATION_MS);
      return () => stop();
    }

    startRef.current = performance.now();
    setRemainingMs(DURATION_MS);

    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const remaining = Math.max(0, DURATION_MS - elapsed);
      setRemainingMs(remaining);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
      else {
        rafRef.current = null;
        eventLogger("listening_ended");
        setMode("ended");
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => stop();
  }, [mode]);

  const handleJoin = () => {
    eventLogger("join_clicked");
    setMode("listening");
  };
  const handleLeave = () => {
    eventLogger("listening_aborted");
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startRef.current = null;
    setRemainingMs(0);
    setMode("ended");
  };
  const handleClose = () => {
    setMode("landing");
    setRemainingMs(DURATION_MS);
  };

  // Circular progress math
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, remainingMs / DURATION_MS));
  const dashoffset = circumference * (1 - ratio);
  const secondsLeft = Math.ceil(remainingMs / 1000);

  // TODO: temporary debug logs for verifying Anchor Host / Listener logic — remove before production
  useEffect(() => {
    if (isAnchorHost) {
      console.log("ANCHOR_HOST_ACTIVE");
    }
  }, [isAnchorHost]);

  useEffect(() => {
    if (mode === "listening") {
      console.log("LISTENER_MODE");
    }
  }, [mode]);

  // If user is acting as Anchor Host, return a restricted host-only UI.
  if (isAnchorHost) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6">
        <div className="max-w-md text-center space-y-6">
          <h1 className="text-2xl font-semibold">You are hosting a moment</h1>
          <p className="text-white/70">Music is playing nearby</p>

          <div className="mt-4 flex flex-col items-center">
            <AnchorHostQR sessionId={sessionId} />

            <p className="text-white/80 text-xs mt-4">Let others join by scanning</p>
          </div>
        </div>
      </main>
    );
  }

  // Listener UI (unchanged behavior)
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6">
      <div className="max-w-md text-center space-y-6">
        {mode === "landing" ? (
          <>
            <h1 className="text-3xl font-semibold">You are now part of a moment.</h1>
            <p className="text-white/70">Someone near you is listening to music right now.</p>
            <button
              onClick={handleJoin}
              className="w-full py-4 mt-6 rounded-full bg-white text-black text-lg font-medium hover:bg-white/90 transition"
            >
              Join the vibe
            </button>
          </>
        ) : mode === "listening" ? (
          <div className="flex flex-col items-center gap-4">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <g id="pulse-layer">{/* future pulsing circle(s) go here */}</g>

              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={stroke}
                fill="none"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />

              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="white"
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={dashoffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />

              <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fill="#FFFFFF"
                style={{ fontSize: 22, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial', fontWeight: 600 }}
              >
                {secondsLeft}
              </text>
            </svg>

            <button
              onClick={handleLeave}
              className="mt-2 text-sm text-white/60 px-3 py-1 rounded-full bg-transparent hover:text-white transition"
            >
              Leave
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <p className="text-white/80">Thanks for being part of it.</p>
            <button
              onClick={handleClose}
              className="w-32 py-2 rounded-full bg-white text-black font-medium hover:bg-white/90 transition"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
