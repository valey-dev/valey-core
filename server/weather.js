// Real weather, off unless the player turns it on. When it is on, the only thing
// that leaves this machine is a pair of coordinates going to open-meteo.com.
import { getSettings } from './settings.js';

const TTL = 15 * 60 * 1000;
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

let cache = null;
let fetchedAt = 0;
let inflight = null;

const minutes = (iso) => {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

async function pull(lat, lon, label) {
  const url = `${FORECAST}?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code,wind_speed_10m,is_day'
    + '&daily=sunrise,sunset&timezone=auto&forecast_days=1';
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('open-meteo ' + res.status);
  const j = await res.json();
  const c = j.current || {}, d = j.daily || {};
  return {
    enabled: true, label, lat, lon,
    code: c.weather_code, temp: c.temperature_2m, wind: c.wind_speed_10m,
    isDay: c.is_day,
    sun: { rise: minutes(d.sunrise?.[0]), set: minutes(d.sunset?.[0]), now: minutes(c.time) },
    at: Date.now(), error: null,
  };
}

export async function realWeather({ force = false } = {}) {
  const { weather: cfg } = await getSettings();
  if (!cfg.enabled || cfg.lat == null || cfg.lon == null) return { enabled: false };
  const stale = Date.now() - fetchedAt > TTL;
  const moved = cache && (cache.lat !== cfg.lat || cache.lon !== cfg.lon);
  if (cache && !stale && !moved && !force) return cache;
  if (inflight) return cache || { enabled: true, label: cfg.label, error: null };

  fetchedAt = Date.now();
  inflight = pull(cfg.lat, cfg.lon, cfg.label)
    .then((w) => { cache = w; console.log(`[weather] ${w.label}: code ${w.code}, ${w.temp}°`); return w; })
    .catch((err) => {
      console.error('[weather]', err.message);
      cache = { enabled: true, label: cfg.label, lat: cfg.lat, lon: cfg.lon, error: err.message, at: Date.now() };
      return cache;
    })
    .finally(() => { inflight = null; });

  return cache || inflight;
}

export function forgetWeather() { cache = null; fetchedAt = 0; }

export async function geocode(q, language = 'en') {
  const lang = language === 'ru' ? 'ru' : 'en';
  const url = `${GEO}?name=${encodeURIComponent(q)}&count=6&language=${lang}&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('geocoding ' + res.status);
  const j = await res.json();
  return (j.results || []).map((r) => ({
    label: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude,
  }));
}
