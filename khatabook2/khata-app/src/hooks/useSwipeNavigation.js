import { useEffect, useRef, useCallback } from "react";

const SWIPE_THRESHOLD = 80;

export default function useSwipeNavigation({ onSwipeLeft, onSwipeRight }) {
  const leftRef = useRef(onSwipeLeft);
  const rightRef = useRef(onSwipeRight);
  const touchStart = useRef(null);
  const locked = useRef(false);

  leftRef.current = onSwipeLeft;
  rightRef.current = onSwipeRight;

  useEffect(() => {
    const isTouchDevice = typeof window !== "undefined" && "ontouchstart" in window;
    if (!isTouchDevice) return;

    const handleTouchStart = (e) => {
      if (locked.current) return;
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e) => {
      if (!touchStart.current || locked.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      touchStart.current = null;

      if (absDx < SWIPE_THRESHOLD || absDx <= absDy) return;

      locked.current = true;
      if (dx > 0) {
        rightRef.current?.();
      } else {
        leftRef.current?.();
      }
      setTimeout(() => { locked.current = false; }, 400);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);
}
