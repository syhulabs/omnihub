import { useEffect, useRef, useState } from 'react';

export type OrientationStatus = 'checking' | 'unavailable' | 'needsPermission' | 'denied' | 'ready';

/** Set once sensor access is granted, so switching between Compass and Level (each mounts its own
 *  copy of this hook) doesn't ask again. */
let grantedThisSession = false;

export interface OrientationState {
  status: OrientationStatus;
  /** Compass heading, 0-360, 0 = north, clockwise. */
  heading: number;
  /** Front-back tilt in degrees, -180..180, 0 = flat. */
  beta: number;
  /** Left-right tilt in degrees, -90..90, 0 = flat. */
  gamma: number;
  /** True once tilt readings arrive, even on a phone with no magnetometer (no heading). */
  tiltReady: boolean;
  requestPermission: () => Promise<void>;
}

interface CompassOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

/**
 * Shared device-orientation reader for the Compass and Level tools - one listener, one
 * permission flow (iOS gates this behind a user gesture; Android doesn't need it at all), used
 * by both instead of each tool reimplementing the same sensor plumbing.
 */
export function useDeviceOrientation(): OrientationState {
  const [status, setStatus] = useState<OrientationStatus>('checking');
  const [heading, setHeading] = useState(0);
  const [beta, setBeta] = useState(0);
  const [gamma, setGamma] = useState(0);
  const [tiltReady, setTiltReady] = useState(false);
  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  function handleOrientation(e: CompassOrientationEvent) {
    let headingValue: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') {
      headingValue = e.webkitCompassHeading;
    } else if (e.alpha !== null) {
      headingValue = 360 - e.alpha;
    }
    if (headingValue !== null) {
      setHeading(((headingValue % 360) + 360) % 360);
      setStatus('ready');
    }
    if (e.beta !== null) setBeta(e.beta);
    if (e.gamma !== null) setGamma(e.gamma);
    if (e.beta !== null && e.gamma !== null) setTiltReady(true);
  }

  function attachListener() {
    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    listenerRef.current = handleOrientation as (e: DeviceOrientationEvent) => void;
    window.addEventListener(eventName, listenerRef.current, true);
  }

  function detachListener() {
    if (listenerRef.current) {
      window.removeEventListener('deviceorientationabsolute', listenerRef.current, true);
      window.removeEventListener('deviceorientation', listenerRef.current, true);
      listenerRef.current = null;
    }
  }

  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setStatus('unavailable');
      return;
    }

    const requestPermissionFn = (
      DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
    ).requestPermission;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (cancelled) return;
      setStatus('checking');
      attachListener();
      timeout = setTimeout(() => setStatus((s) => (s === 'checking' ? 'unavailable' : s)), 2500);
    };

    if (typeof requestPermissionFn === 'function' && !grantedThisSession) {
      // The API exists on iOS and on newer Chromium builds. Ask quietly first: where access is
      // already allowed this answers "granted" with no prompt and the tool just starts; where a
      // tap is required (iOS) it refuses, and only then is the Enable button shown.
      requestPermissionFn
        .call(DeviceOrientationEvent)
        .then((result) => {
          if (result === 'granted') {
            grantedThisSession = true;
            start();
          } else if (!cancelled) {
            setStatus('needsPermission');
          }
        })
        .catch(() => {
          if (!cancelled) setStatus('needsPermission');
        });
    } else {
      start();
    }

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      detachListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestPermission() {
    const requestPermissionFn = (
      DeviceOrientationEvent as unknown as { requestPermission: () => Promise<'granted' | 'denied'> }
    ).requestPermission;
    try {
      const result = await requestPermissionFn.call(DeviceOrientationEvent);
      if (result === 'granted') {
        grantedThisSession = true;
        setStatus('checking');
        attachListener();
      } else {
        // Refused: that is not the same as the phone having no sensor.
        setStatus('denied');
      }
    } catch {
      setStatus('denied');
    }
  }

  return { status, heading, beta, gamma, tiltReady, requestPermission };
}
