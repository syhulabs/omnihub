import { useEffect, useState } from 'react';

export type SensorAvailability = 'checking' | 'available' | 'unavailable';

export interface MotionSensorsState {
  gyroscope: SensorAvailability;
  accelerometer: SensorAvailability;
}

/**
 * Detects whether the gyroscope and accelerometer are actually delivering data, for the Sensor
 * Status panel - there's no direct "is this sensor present" API, so this waits for a real
 * devicemotion event carrying each reading and times out to "unavailable" if none ever arrives,
 * the same approach the compass heading itself uses for the magnetometer.
 */
export function useMotionSensors(enabled: boolean): MotionSensorsState {
  const [gyroscope, setGyroscope] = useState<SensorAvailability>('checking');
  const [accelerometer, setAccelerometer] = useState<SensorAvailability>('checking');

  useEffect(() => {
    // Waits for sensor access: checked before the user had allowed it, both sensors timed out
    // as "Unavailable" and stayed that way after access was granted.
    if (!enabled) return;
    if (typeof DeviceMotionEvent === 'undefined') {
      setGyroscope('unavailable');
      setAccelerometer('unavailable');
      return;
    }

    function handleMotion(e: DeviceMotionEvent) {
      if (e.rotationRate && (e.rotationRate.alpha !== null || e.rotationRate.beta !== null || e.rotationRate.gamma !== null)) {
        setGyroscope('available');
      }
      const accel = e.accelerationIncludingGravity ?? e.acceleration;
      if (accel && (accel.x !== null || accel.y !== null || accel.z !== null)) {
        setAccelerometer('available');
      }
    }

    function attach() {
      window.addEventListener('devicemotion', handleMotion, true);
    }

    // No permission call here: on iOS it must come from a tap, which the compass's own Enable
    // button provides (the grant covers motion events too), and this hook only starts after that.
    attach();

    const timeout = setTimeout(() => {
      setGyroscope((s) => (s === 'checking' ? 'unavailable' : s));
      setAccelerometer((s) => (s === 'checking' ? 'unavailable' : s));
    }, 2500);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('devicemotion', handleMotion, true);
    };
  }, [enabled]);

  return { gyroscope, accelerometer };
}
