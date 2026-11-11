import { sameZone } from './offset';

export interface City {
  id: string;
  name: string;
  country: string;
  flag: string;
  timeZone: string;
  /** Approximate coordinates — used for the globe/map pin and sunrise/sunset math, not survey-accurate. */
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { id: 'new-york', name: 'New York', country: 'United States', flag: '🇺🇸', timeZone: 'America/New_York', lat: 40.7, lon: -74.0 },
  { id: 'los-angeles', name: 'Los Angeles', country: 'United States', flag: '🇺🇸', timeZone: 'America/Los_Angeles', lat: 34.0, lon: -118.2 },
  { id: 'chicago', name: 'Chicago', country: 'United States', flag: '🇺🇸', timeZone: 'America/Chicago', lat: 41.9, lon: -87.6 },
  { id: 'toronto', name: 'Toronto', country: 'Canada', flag: '🇨🇦', timeZone: 'America/Toronto', lat: 43.7, lon: -79.4 },
  { id: 'sao-paulo', name: 'São Paulo', country: 'Brazil', flag: '🇧🇷', timeZone: 'America/Sao_Paulo', lat: -23.5, lon: -46.6 },
  { id: 'london', name: 'London', country: 'United Kingdom', flag: '🇬🇧', timeZone: 'Europe/London', lat: 51.5, lon: -0.1 },
  { id: 'paris', name: 'Paris', country: 'France', flag: '🇫🇷', timeZone: 'Europe/Paris', lat: 48.9, lon: 2.3 },
  { id: 'berlin', name: 'Berlin', country: 'Germany', flag: '🇩🇪', timeZone: 'Europe/Berlin', lat: 52.5, lon: 13.4 },
  { id: 'moscow', name: 'Moscow', country: 'Russia', flag: '🇷🇺', timeZone: 'Europe/Moscow', lat: 55.8, lon: 37.6 },
  { id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', flag: '🇦🇪', timeZone: 'Asia/Dubai', lat: 25.2, lon: 55.3 },
  { id: 'mumbai', name: 'Mumbai', country: 'India', flag: '🇮🇳', timeZone: 'Asia/Kolkata', lat: 19.1, lon: 72.9 },
  { id: 'delhi', name: 'New Delhi', country: 'India', flag: '🇮🇳', timeZone: 'Asia/Kolkata', lat: 28.6, lon: 77.2 },
  { id: 'kuala-lumpur', name: 'Kuala Lumpur', country: 'Malaysia', flag: '🇲🇾', timeZone: 'Asia/Kuala_Lumpur', lat: 3.1, lon: 101.7 },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', flag: '🇸🇬', timeZone: 'Asia/Singapore', lat: 1.35, lon: 103.8 },
  { id: 'bangkok', name: 'Bangkok', country: 'Thailand', flag: '🇹🇭', timeZone: 'Asia/Bangkok', lat: 13.8, lon: 100.5 },
  { id: 'jakarta', name: 'Jakarta', country: 'Indonesia', flag: '🇮🇩', timeZone: 'Asia/Jakarta', lat: -6.2, lon: 106.8 },
  { id: 'hong-kong', name: 'Hong Kong', country: 'China', flag: '🇭🇰', timeZone: 'Asia/Hong_Kong', lat: 22.3, lon: 114.2 },
  { id: 'shanghai', name: 'Shanghai', country: 'China', flag: '🇨🇳', timeZone: 'Asia/Shanghai', lat: 31.2, lon: 121.5 },
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', flag: '🇯🇵', timeZone: 'Asia/Tokyo', lat: 35.7, lon: 139.7 },
  { id: 'seoul', name: 'Seoul', country: 'South Korea', flag: '🇰🇷', timeZone: 'Asia/Seoul', lat: 37.6, lon: 127.0 },
  { id: 'sydney', name: 'Sydney', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Sydney', lat: -33.9, lon: 151.2 },
  { id: 'auckland', name: 'Auckland', country: 'New Zealand', flag: '🇳🇿', timeZone: 'Pacific/Auckland', lat: -36.8, lon: 174.8 },
  { id: 'cairo', name: 'Cairo', country: 'Egypt', flag: '🇪🇬', timeZone: 'Africa/Cairo', lat: 30.0, lon: 31.2 },
  { id: 'johannesburg', name: 'Johannesburg', country: 'South Africa', flag: '🇿🇦', timeZone: 'Africa/Johannesburg', lat: -26.2, lon: 28.0 },
  { id: 'lagos', name: 'Lagos', country: 'Nigeria', flag: '🇳🇬', timeZone: 'Africa/Lagos', lat: 6.5, lon: 3.4 },
  { id: 'istanbul', name: 'Istanbul', country: 'Turkey', flag: '🇹🇷', timeZone: 'Europe/Istanbul', lat: 41.0, lon: 28.9 },
  { id: 'mexico-city', name: 'Mexico City', country: 'Mexico', flag: '🇲🇽', timeZone: 'America/Mexico_City', lat: 19.4, lon: -99.1 },
];

export function getCityById(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

/** Finds a curated city whose IANA zone matches, for resolving "this device's" city. */
export function getCityByTimeZone(timeZone: string): City | undefined {
  return CITIES.find((c) => sameZone(c.timeZone, timeZone));
}
