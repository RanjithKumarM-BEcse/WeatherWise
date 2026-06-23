/**
 * WeatherWise — script.js
 * ─────────────────────────────────────────────────
 * Real data pipeline:
 *   1. navigator.geolocation  → lat/lon
 *   2. Nominatim (OSM)        → city name
 *   3. Open-Meteo API         → live weather + hourly
 *
 * No mock data. No scores. No daily summary.
 * No specific plant types — general plant advice only.
 * ─────────────────────────────────────────────────
 */

/* ═══════════════════════════════════════
   WMO WEATHER CODE → label / icon / orb colours
   https://open-meteo.com/en/docs#weathervariables
   ═══════════════════════════════════════ */
const WMO = {
  0:  { label: 'Clear Sky',            icon: '☀️',  a: '#F9A825', b: '#F57F17' },
  1:  { label: 'Mainly Clear',         icon: '🌤',  a: '#FDD835', b: '#F9A825' },
  2:  { label: 'Partly Cloudy',        icon: '⛅',  a: '#29B6F6', b: '#0288D1' },
  3:  { label: 'Overcast',             icon: '☁️',  a: '#78909C', b: '#546E7A' },
  45: { label: 'Foggy',                icon: '🌫',  a: '#90A4AE', b: '#607D8B' },
  48: { label: 'Freezing Fog',         icon: '🌫',  a: '#90A4AE', b: '#607D8B' },
  51: { label: 'Light Drizzle',        icon: '🌦',  a: '#64B5F6', b: '#1E88E5' },
  53: { label: 'Drizzle',              icon: '🌦',  a: '#4FC3F7', b: '#0288D1' },
  55: { label: 'Heavy Drizzle',        icon: '🌧',  a: '#546E7A', b: '#37474F' },
  61: { label: 'Light Rain',           icon: '🌧',  a: '#5C85D6', b: '#1565C0' },
  63: { label: 'Rain',                 icon: '🌧',  a: '#546E7A', b: '#37474F' },
  65: { label: 'Heavy Rain',           icon: '🌧',  a: '#455A64', b: '#263238' },
  71: { label: 'Light Snow',           icon: '🌨',  a: '#B3E5FC', b: '#81D4FA' },
  73: { label: 'Snow',                 icon: '❄️',  a: '#E1F5FE', b: '#B3E5FC' },
  75: { label: 'Heavy Snow',           icon: '❄️',  a: '#ECEFF1', b: '#CFD8DC' },
  77: { label: 'Snow Grains',          icon: '🌨',  a: '#B3E5FC', b: '#81D4FA' },
  80: { label: 'Light Showers',        icon: '🌦',  a: '#5C85D6', b: '#1565C0' },
  81: { label: 'Showers',              icon: '🌧',  a: '#546E7A', b: '#37474F' },
  82: { label: 'Heavy Showers',        icon: '🌧',  a: '#455A64', b: '#263238' },
  85: { label: 'Snow Showers',         icon: '🌨',  a: '#B3E5FC', b: '#81D4FA' },
  86: { label: 'Heavy Snow Showers',   icon: '❄️',  a: '#ECEFF1', b: '#CFD8DC' },
  95: { label: 'Thunderstorm',         icon: '⛈',  a: '#4A148C', b: '#6A1B9A' },
  96: { label: 'Thunderstorm + Hail',  icon: '⛈',  a: '#4A148C', b: '#311B92' },
  99: { label: 'Heavy Thunderstorm',   icon: '⛈',  a: '#311B92', b: '#1A0045' },
};

function wmo(code) {
  return WMO[code] ?? { label: 'Unknown', icon: '🌡', a: '#29B6F6', b: '#0288D1' };
}

/* ═══════════════════════════════════════
   1. GEOLOCATION
   ═══════════════════════════════════════ */
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 13.0827, lon: 80.2707, fallback: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, fallback: false }),
      ()  => resolve({ lat: 13.0827, lon: 80.2707, fallback: true }),
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}

/* ═══════════════════════════════════════
   2. REVERSE GEOCODE  (Nominatim / OSM)
   ═══════════════════════════════════════ */
async function cityName(lat, lon) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!r.ok) throw 0;
    const d = await r.json();
    const a = d.address || {};
    return a.city || a.town || a.village || a.county || a.state || 'Your Location';
  } catch {
    return 'Your Location';
  }
}

/* ═══════════════════════════════════════
   3. OPEN-METEO — live weather
   Free, no API key, CORS-open.
   ═══════════════════════════════════════ */
async function fetchWeather(lat, lon) {
  const p = new URLSearchParams({
    latitude:           lat,
    longitude:          lon,
    current:            [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'wind_gusts_10m',
      'weather_code',
      'precipitation_probability',
      'precipitation',
      'uv_index',
      'visibility',
      'cloud_cover',
    ].join(','),
    hourly:             [
      'temperature_2m',
      'precipitation_probability',
      'weather_code',
    ].join(','),
    wind_speed_unit:    'kmh',
    temperature_unit:   'celsius',
    precipitation_unit: 'mm',
    timezone:           'auto',
    forecast_days:      1,
  });

  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  return r.json();
}

/* ═══════════════════════════════════════
   4. NORMALISE → clean internal object
   ═══════════════════════════════════════ */
function normalise(api, city) {
  const c   = api.current;
  const W   = wmo(c.weather_code);
  const temp      = Math.round(c.temperature_2m);
  const feels     = Math.round(c.apparent_temperature);
  const humidity  = Math.round(c.relative_humidity_2m);
  const wind      = Math.round(c.wind_speed_10m);
  const gusts     = Math.round(c.wind_gusts_10m ?? wind);
  const rain      = Math.round(c.precipitation_probability ?? 0);
  const uv        = Math.round(c.uv_index ?? 0);
  const vis       = c.visibility != null ? (c.visibility / 1000).toFixed(1) : null; // → km
  const cloud     = Math.round(c.cloud_cover ?? 0);
  const code      = c.weather_code;

  /* ── hourly (next 12 from current hour) ── */
  const nowH  = new Date().getHours();
  const hT    = api.hourly.temperature_2m           ?? [];
  const hR    = api.hourly.precipitation_probability ?? [];
  const hC    = api.hourly.weather_code              ?? [];
  const hourly = [];
  for (let i = nowH; i < Math.min(nowH + 12, hT.length); i++) {
    const h = i % 24;
    hourly.push({
      timeStr:  h.toString().padStart(2,'0') + ':00',
      temp:     Math.round(hT[i] ?? temp),
      rain:     Math.round(hR[i] ?? rain),
      icon:     wmo(hC[i] ?? 0).icon,
      isNow:    i === nowH,
    });
  }

  /* ── alert ── */
  let alert = null;
  if (code >= 95) {
    alert = {
      icon: '⚡',
      title: 'Thunderstorm Warning — Stay Indoors',
      chips: ['Do not go outside', 'Unplug electronics', 'Keep plants sheltered'],
    };
  } else if (code >= 65 || rain >= 85) {
    alert = {
      icon: '⛈',
      title: 'Heavy Rain Expected',
      chips: ['Carry umbrella', 'Avoid low-lying areas', 'Move potted plants under cover'],
    };
  } else if (temp >= 42) {
    alert = {
      icon: '🌡',
      title: 'Extreme Heatwave Warning',
      chips: ['Stay indoors 11am–4pm', 'Drink water frequently', 'Water plants at dawn'],
    };
  } else if (wind >= 50 || gusts >= 60) {
    alert = {
      icon: '💨',
      title: 'Strong Wind Advisory',
      chips: ['Secure loose items', 'Avoid open areas', 'Stake or shelter tall plants'],
    };
  }

  return { condition: W.label, icon: W.icon, orbA: W.a, orbB: W.b,
           temp, feels, humidity, wind, gusts, rain, uv, vis, cloud,
           code, city, hourly, alert };
}

/* ═══════════════════════════════════════
   5. OUTDOOR ADVISOR
   ═══════════════════════════════════════ */
function outdoorAdvice(w) {
  const tips = [];
  let status = 'safe'; // safe | caution | avoid

  /* rain */
  if (w.rain >= 80) {
    tips.push({ icon:'☂️', head:'Heavy rain likely',       body:'Carry a raincoat and umbrella.',             cls:'danger' });
    status = 'avoid';
  } else if (w.rain >= 45) {
    tips.push({ icon:'🌂', head:'Rain possible',            body:'Pack a compact umbrella just in case.',       cls:'warn'   });
    if (status === 'safe') status = 'caution';
  }

  /* temperature */
  if (w.temp >= 42) {
    tips.push({ icon:'🥵', head:'Extreme heat',             body:'Avoid outdoor activity between 11am – 4pm.', cls:'danger' });
    status = 'avoid';
  } else if (w.temp >= 36) {
    tips.push({ icon:'🍶', head:'Hot conditions',           body:'Stay hydrated. Carry a water bottle.',        cls:'warn'   });
    if (status === 'safe') status = 'caution';
  } else if (w.temp <= 8) {
    tips.push({ icon:'🧥', head:'Cold weather',             body:'Wear warm, layered clothing.',                cls:'warn'   });
    if (status === 'safe') status = 'caution';
  }

  /* UV */
  if (w.uv >= 11) {
    tips.push({ icon:'☀️', head:'Extreme UV ('+w.uv+')',   body:'SPF 50+ sunscreen and a hat are essential.',  cls:'danger' });
    if (status === 'safe') status = 'caution';
  } else if (w.uv >= 8) {
    tips.push({ icon:'🧴', head:'Very high UV ('+w.uv+')', body:'Apply sunscreen before heading out.',          cls:'warn'   });
    if (status === 'safe') status = 'caution';
  } else if (w.uv >= 6) {
    tips.push({ icon:'🧢', head:'Moderate UV ('+w.uv+')',  body:'A cap or hat will help.',                     cls:''       });
  }

  /* wind */
  if (w.wind >= 50 || w.gusts >= 60) {
    tips.push({ icon:'💨', head:'Dangerous winds',          body:`Gusts up to ${w.gusts} km/h — stay indoors.`, cls:'danger' });
    status = 'avoid';
  } else if (w.wind >= 28) {
    tips.push({ icon:'🌬', head:'Windy conditions',         body:'Secure loose items. Hold onto your hat.',     cls:'warn'   });
    if (status === 'safe') status = 'caution';
  }

  /* humidity */
  if (w.humidity >= 88) {
    tips.push({ icon:'💧', head:'Very humid ('+w.humidity+'%)', body:'Sweat won\'t cool you. Rest in shade often.', cls:'warn' });
    if (status === 'safe') status = 'caution';
  }

  /* fog / low visibility */
  if (w.code === 45 || w.code === 48 || (w.vis !== null && parseFloat(w.vis) < 1.0)) {
    tips.push({ icon:'🌫', head:'Low visibility',           body:'Drive carefully. Use headlights.',            cls:'warn'   });
    if (status === 'safe') status = 'caution';
  }

  /* thunderstorm */
  if (w.code >= 95) {
    tips.push({ icon:'⚡', head:'Thunderstorm active',      body:'Stay indoors. Avoid trees and open fields.',  cls:'danger' });
    status = 'avoid';
  }

  /* all-clear */
  if (tips.length === 0) {
    tips.push({ icon:'🏃', head:'Great conditions!',        body:'Perfect weather to head outside and enjoy.',  cls:'good'   });
  }

  const BADGE = {
    safe:    { text: '🟢 Safe to Go Out',                    cls: 'badge--blue'   },
    caution: { text: '🟡 Go with Precautions',               cls: 'badge--yellow' },
    avoid:   { text: '🔴 Stay Indoors',                      cls: ''              },
  };

  return { tips, ...BADGE[status] };
}

/* ═══════════════════════════════════════
   6. PLANT ADVISOR  (general — no specific types)
   ═══════════════════════════════════════ */
function plantAdvice(w) {
  const tips = [];
  let badge = '🟢 Plants are happy';
  let badgeCls = 'badge--green';

  /* watering decision */
  if (w.rain >= 70) {
    tips.push({ icon:'🚫', head:'Skip watering today',
      body:'Enough rain is expected — let nature do it.',              cls:'warn'   });
  } else if (w.rain >= 40) {
    tips.push({ icon:'🤔', head:'Hold off for now',
      body:'Light rain may come. Wait and water in the evening if not.', cls:''   });
  } else if (w.temp >= 36) {
    tips.push({ icon:'⏰', head:'Water early morning only',
      body:'Water before 7am. Midday watering scorches roots.',         cls:'warn'  });
  } else if (w.temp <= 6) {
    tips.push({ icon:'❄️', head:'Reduce watering',
      body:'Cold slows absorption. Water sparingly at midday.',         cls:''      });
  } else {
    tips.push({ icon:'💧', head:'Good time to water',
      body:'Conditions are fine for regular watering today.',           cls:'good'  });
  }

  /* sunlight */
  if (w.uv >= 10) {
    tips.push({ icon:'🌿', head:'Protect from harsh sun',
      body:'Provide shade cloth or move pots to dappled light.',        cls:'warn'  });
    badge = '🟡 Some attention needed'; badgeCls = 'badge--yellow';
  } else if (w.cloud >= 80 || w.uv <= 1) {
    tips.push({ icon:'🪟', head:'Low sunlight today',
      body:'Move sun-loving plants near a bright window.',              cls:''      });
  } else if (w.uv >= 4 && w.cloud < 50) {
    tips.push({ icon:'☀️', head:'Great light conditions',
      body:'Plants will love today\'s natural sunlight.',               cls:'good'  });
  }

  /* rain / storm protection */
  if (w.code >= 95) {
    tips.push({ icon:'🏠', head:'Bring potted plants inside',
      body:'Thunder, lightning, and heavy rain can damage foliage.',    cls:'danger' });
    badge = '🔴 Action needed'; badgeCls = '';
  } else if (w.code >= 65 || w.rain >= 85) {
    tips.push({ icon:'🏠', head:'Shelter potted plants',
      body:'Heavy rain may waterlog soil and snap delicate stems.',     cls:'danger' });
    badge = '🔴 Action needed'; badgeCls = '';
  }

  /* wind */
  if (w.wind >= 40 || w.gusts >= 50) {
    tips.push({ icon:'🪢', head:'Stake tall plants',
      body:'Strong gusts can snap stems. Tie supports now.',            cls:'warn'  });
    if (badgeCls === 'badge--green') { badge = '🟡 Some attention needed'; badgeCls = 'badge--yellow'; }
  }

  /* humidity */
  if (w.humidity >= 85) {
    tips.push({ icon:'🌬', head:'Ensure airflow',
      body:'High humidity promotes mold and fungal issues.',            cls:'warn'  });
    if (badgeCls === 'badge--green') { badge = '🟡 Some attention needed'; badgeCls = 'badge--yellow'; }
  } else if (w.humidity <= 25) {
    tips.push({ icon:'💦', head:'Mist leaves gently',
      body:'Air is very dry. Light misting prevents dehydration.',      cls:''      });
  }

  /* heat stress */
  if (w.temp >= 40) {
    tips.push({ icon:'🌡', head:'Heat stress risk',
      body:'Move pots to shade. Check soil moisture twice today.',      cls:'danger' });
    badge = '🔴 Action needed'; badgeCls = '';
  }

  /* cold stress */
  if (w.temp <= 4) {
    tips.push({ icon:'🧣', head:'Frost risk',
      body:'Bring tender plants indoors or cover them overnight.',      cls:'danger' });
    badge = '🔴 Action needed'; badgeCls = '';
  }

  return { tips, badge, badgeCls };
}

/* ═══════════════════════════════════════
   7. RENDER HELPERS
   ═══════════════════════════════════════ */
function renderTips(listId, tips) {
  const ul = document.getElementById(listId);
  ul.innerHTML = '';
  tips.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = `tip ${t.cls || ''}`;
    li.style.animationDelay = `${i * 70}ms`;
    li.innerHTML = `<span class="tip-icon">${t.icon}</span>
      <span class="tip-body"><strong>${t.head}</strong>${t.body}</span>`;
    ul.appendChild(li);
  });
}

function setBadge(id, text, cls) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className   = `badge ${cls}`;
}

function renderAlert(alert) {
  const banner = document.getElementById('alertBanner');
  if (!alert) { banner.classList.remove('active'); return; }
  banner.innerHTML = `
    <div class="alert-inner">
      <span class="alert-icon">${alert.icon}</span>
      <div>
        <p class="alert-title">⚠ ${alert.title}</p>
        <div class="alert-chips">
          ${alert.chips.map(c => `<span class="alert-chip">${c}</span>`).join('')}
        </div>
      </div>
    </div>`;
  banner.classList.add('active');
}

function renderHero(w) {
  /* orb */
  document.getElementById('orbIcon').textContent  = w.icon;
  document.getElementById('orbTemp').textContent  = w.temp + '°';
  document.getElementById('orbLabel').textContent = w.condition;
  const orb = document.getElementById('orb');
  orb.style.background  = `linear-gradient(145deg, ${w.orbA}, ${w.orbB})`;
  orb.style.boxShadow   = `0 0 80px ${w.orbA}55, 0 18px 56px ${w.orbB}44`;

  /* stats */
  document.getElementById('feelsLike').textContent = w.feels + '°C';
  document.getElementById('humidity').textContent  = w.humidity + '%';
  document.getElementById('wind').textContent      = w.wind + ' km/h';
  document.getElementById('rain').textContent      = w.rain + '%';
  document.getElementById('uv').textContent        = w.uv;
  document.getElementById('visibility').textContent = w.vis !== null ? w.vis + ' km' : 'N/A';

  /* location + title */
  document.getElementById('locationLabel').textContent = '📍 ' + w.city;
  document.title = `${w.temp}° ${w.condition} — ${w.city} | WeatherWise`;
}

function renderForecast(hourly) {
  const wrap = document.getElementById('forecastScroll');
  wrap.innerHTML = '';
  hourly.forEach((h, i) => {
    const div = document.createElement('div');
    div.className = `fhour${h.isNow ? ' now' : ''}`;
    div.style.animationDelay = `${i * 40}ms`;
    div.innerHTML = `
      <span class="fh-time">${h.isNow ? 'Now' : h.timeStr}</span>
      <span class="fh-icon">${h.icon}</span>
      <span class="fh-temp">${h.temp}°</span>
      <span class="fh-rain">💧 ${h.rain}%</span>`;
    wrap.appendChild(div);
  });
}

function updateClock() {
  const now = new Date();
  document.getElementById('heroTime').textContent =
    now.toLocaleString(undefined, {
      weekday:'short', month:'short', day:'numeric',
      hour:'2-digit', minute:'2-digit'
    }).replace(',', ' ·');
}

function setLastUpdated() {
  document.getElementById('lastUpdated').textContent =
    'Updated ' + new Date().toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
}

/* ═══════════════════════════════════════
   8. THEME
   ═══════════════════════════════════════ */
function initTheme() {
  const btn  = document.getElementById('themeToggle');
  const icon = btn.querySelector('.toggle-icon');
  if (localStorage.getItem('ww-theme') === 'dark') {
    document.body.classList.add('dark');
    icon.textContent = '☀️';
  }
  btn.addEventListener('click', () => {
    const dark = document.body.classList.toggle('dark');
    icon.textContent = dark ? '☀️' : '🌙';
    localStorage.setItem('ww-theme', dark ? 'dark' : 'light');
  });
}

/* ═══════════════════════════════════════
   9. LOADING MESSAGES
   ═══════════════════════════════════════ */
const MSGS = [
  'Reading the skies…',
  'Fetching live weather…',
  'Calculating UV levels…',
  'Checking wind conditions…',
  'Preparing plant advice…',
];
function cycleMsg() {
  const el = document.getElementById('loaderMsg');
  let i = 0;
  return setInterval(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent  = MSGS[++i % MSGS.length];
      el.style.opacity = '1';
    }, 300);
  }, 1800);
}

/* ═══════════════════════════════════════
   10. ERROR SCREEN
   ═══════════════════════════════════════ */
function showError(msg) {
  document.getElementById('loaderOverlay').innerHTML = `
    <div style="text-align:center;padding:28px;max-width:380px">
      <div style="font-size:2.8rem;margin-bottom:14px">🌧</div>
      <h2 style="font-size:1.05rem;font-weight:700;color:var(--text);margin-bottom:8px">
        Couldn't load weather</h2>
      <p style="font-size:.82rem;color:var(--text-2);line-height:1.6;margin-bottom:22px">${msg}</p>
      <button onclick="location.reload()" style="
        background:linear-gradient(135deg,#4FC3F7,#0288D1);
        color:#fff;border:none;border-radius:100px;
        padding:11px 26px;font-size:.88rem;font-weight:700;
        cursor:pointer;box-shadow:0 4px 16px rgba(79,195,247,.38)">
        Try Again
      </button>
    </div>`;
}

/* ═══════════════════════════════════════
   11. INIT
   ═══════════════════════════════════════ */
async function init() {
  initTheme();
  const timer = cycleMsg();

  try {
    /* location */
    const loc = await getLocation();

    /* parallel: city name + weather */
    const [city, api] = await Promise.all([
      cityName(loc.lat, loc.lon),
      fetchWeather(loc.lat, loc.lon),
    ]);

    /* normalise */
    const w = normalise(api, loc.fallback ? 'Chennai (default)' : city);

    /* hide loader */
    clearInterval(timer);
    document.getElementById('loaderOverlay').classList.add('gone');

    /* render */
    renderHero(w);
    updateClock();
    setLastUpdated();
    renderAlert(w.alert);

    const out   = outdoorAdvice(w);
    const plant = plantAdvice(w);

    setBadge('outdoorBadge', out.text,   out.cls);
    setBadge('plantBadge',   plant.badge, plant.badgeCls);
    renderTips('outdoorTips', out.tips);
    renderTips('plantTips',   plant.tips);
    renderForecast(w.hourly);

    /* live clock every minute */
    setInterval(updateClock, 60000);

    /* refresh weather every 30 min */
    setInterval(async () => {
      try {
        const fresh = normalise(await fetchWeather(loc.lat, loc.lon), w.city);
        renderHero(fresh);
        renderAlert(fresh.alert);
        const o = outdoorAdvice(fresh);
        const p = plantAdvice(fresh);
        setBadge('outdoorBadge', o.text,   o.cls);
        setBadge('plantBadge',   p.badge,  p.badgeCls);
        renderTips('outdoorTips', o.tips);
        renderTips('plantTips',   p.tips);
        renderForecast(fresh.hourly);
        setLastUpdated();
      } catch { /* silent — keep showing last data */ }
    }, 30 * 60 * 1000);

  } catch (err) {
    clearInterval(timer);
    console.error(err);
    showError(
      'Could not reach the weather service.<br>' +
      'Check your internet connection and try again.<br><br>' +
      `<small style="opacity:.55">${err.message}</small>`
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
