import { useEffect, useRef } from 'react';

interface CountdownTimerProps {
  totalSeconds: number;     // total duration (90)
  remainingSeconds: number; // current remaining
  paused: boolean;
  onTick: (remaining: number) => void;  // called each second
  onComplete: () => void;               // called at 0
}

export function CountdownTimer({
  totalSeconds,
  remainingSeconds,
  paused,
  onTick,
  onComplete,
}: CountdownTimerProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(remainingSeconds);
  remainingRef.current = remainingSeconds;

  useEffect(() => {
    if (paused || remainingSeconds <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (intervalRef.current) return; // already running

    intervalRef.current = setInterval(() => {
      const next = remainingRef.current - 1;
      onTick(next);
      if (next <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        onComplete();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [paused, remainingSeconds <= 0]);  // restart when unpaused

  const minutes = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const pct = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
  const colorClass =
    remainingSeconds <= 10 ? 'is-red' :
    remainingSeconds <= 30 ? 'is-amber' : 'is-green';

  return (
    <div className="gfc-timer">
      <div className={`gfc-timer-digits ${colorClass}`}>
        {minutes}:{secs.toString().padStart(2, '0')}
      </div>
      <div className="gfc-timer-bar-track">
        <div
          className={`gfc-timer-bar ${colorClass}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
