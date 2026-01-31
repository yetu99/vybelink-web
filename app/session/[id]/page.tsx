import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AnchorHostQR } from "./AnchorHostQR";

const DURATION_MS = 120_000; // 120 seconds

// Anchor session id for outdoor / quick testing.
// Change this value when you want to test a stable session URL (e.g. /session/anchor-session-001)
const ANCHOR_SESSION_ID = "anchor-session-001";

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
