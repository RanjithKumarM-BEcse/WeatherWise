#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse
from datetime import datetime

# ═══════════════════════════════════════
# WMO WEATHER CODE MAPPING
# ═══════════════════════════════════════
WMO = {
    0:  {'label': 'Clear Sky',            'icon': '☀️'},
    1:  {'label': 'Mainly Clear',         'icon': '🌤'},
    2:  {'label': 'Partly Cloudy',        'icon': '⛅'},
    3:  {'label': 'Overcast',             'icon': '☁️'},
    45: {'label': 'Foggy',                'icon': '🌫'},
    48: {'label': 'Freezing Fog',         'icon': '🌫'},
    51: {'label': 'Light Drizzle',        'icon': '🌦'},
    53: {'label': 'Drizzle',              'icon': '🌦'},
    55: {'label': 'Heavy Drizzle',        'icon': '🌧'},
    61: {'label': 'Light Rain',           'icon': '🌧'},
    63: {'label': 'Rain',                 'icon': '🌧'},
    65: {'label': 'Heavy Rain',           'icon': '🌧'},
    71: {'label': 'Light Snow',           'icon': '🌨'},
    73: {'label': 'Snow',                 'icon': '❄️'},
    75: {'label': 'Heavy Snow',           'icon': '❄️'},
    77: {'label': 'Snow Grains',          'icon': '🌨'},
    80: {'label': 'Light Showers',        'icon': '🌦'},
    81: {'label': 'Showers',              'icon': '🌧'},
    82: {'label': 'Heavy Showers',        'icon': '🌧'},
    85: {'label': 'Snow Showers',         'icon': '🌨'},
    86: {'label': 'Heavy Snow Showers',   'icon': '❄️'},
    95: {'label': 'Thunderstorm',         'icon': '⛈'},
    96: {'label': 'Thunderstorm + Hail',  'icon': '⛈'},
    99: {'label': 'Heavy Thunderstorm',   'icon': '⛈'},
}

def get_wmo_info(code):
    return WMO.get(code, {'label': 'Unknown', 'icon': '🌡'})

# ═══════════════════════════════════════
# HTTP HELPER (No third-party libraries needed)
# ═══════════════════════════════════════
def fetch_json(url, headers=None):
    if headers is None:
        headers = {}
    # Nominatim requires a User-Agent, let's supply one globally to be safe
    if 'User-Agent' not in headers:
        headers['User-Agent'] = 'WeatherWisePythonAdvisor/1.0 (contact: ranjithkumar.m.cse@gmail.com)'
        
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        raise RuntimeError(f"HTTP Request failed: {e}")

# ═══════════════════════════════════════
# 1. GEOLOCATION (via IP-API)
# ═══════════════════════════════════════
def get_location():
    try:
        # Fetch lat/lon based on external IP
        data = fetch_json("http://ip-api.com/json/")
        if data.get("status") == "success":
            return {
                "lat": data.get("lat"),
                "lon": data.get("lon"),
                "city": data.get("city", "Your Location"),
                "fallback": False
            }
    except Exception:
        pass
    
    # Fallback to Chennai coordinates
    return {
        "lat": 13.0827,
        "lon": 80.2707,
        "city": "Chennai (default)",
        "fallback": True
    }

# ═══════════════════════════════════════
# 2. REVERSE GEOCODING (via Nominatim)
# ═══════════════════════════════════════
def get_city_name(lat, lon):
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
        data = fetch_json(url)
        address = data.get("address", {})
        city = address.get("city") or address.get("town") or address.get("village") or address.get("county") or address.get("state")
        return city or "Your Location"
    except Exception:
        return "Your Location"

# ═══════════════════════════════════════
# 3. OPEN-METEO WEATHER FETCHING
# ═══════════════════════════════════════
def fetch_weather(lat, lon):
    params = {
        'latitude': lat,
        'longitude': lon,
        'current': ','.join([
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
            'cloud_cover'
        ]),
        'hourly': ','.join([
            'temperature_2m',
            'precipitation_probability',
            'weather_code'
        ]),
        'wind_speed_unit': 'kmh',
        'temperature_unit': 'celsius',
        'precipitation_unit': 'mm',
        'timezone': 'auto',
        'forecast_days': 1
    }
    query_string = urllib.parse.urlencode(params)
    url = f"https://api.open-meteo.com/v1/forecast?{query_string}"
    return fetch_json(url)

# ═══════════════════════════════════════
# 4. DATA NORMALIZATION
# ═══════════════════════════════════════
def normalize_data(api_data, city_name):
    current = api_data.get('current', {})
    hourly = api_data.get('hourly', {})
    
    wmo_info = get_wmo_info(current.get('weather_code', 0))
    temp = round(current.get('temperature_2m', 0))
    feels = round(current.get('apparent_temperature', 0))
    humidity = round(current.get('relative_humidity_2m', 0))
    wind = round(current.get('wind_speed_10m', 0))
    gusts = round(current.get('wind_gusts_10m') if current.get('wind_gusts_10m') is not None else wind)
    rain = round(current.get('precipitation_probability', 0))
    uv = round(current.get('uv_index', 0))
    
    visibility = current.get('visibility')
    vis_km = f"{visibility / 1000:.1f}" if visibility is not None else None
    cloud = round(current.get('cloud_cover', 0))
    code = current.get('weather_code', 0)

    # Process hourly data (next 12 hours)
    now_hour = datetime.now().hour
    h_temp = hourly.get('temperature_2m', [])
    h_rain = hourly.get('precipitation_probability', [])
    h_code = hourly.get('weather_code', [])
    
    hourly_forecasts = []
    for i in range(now_hour, min(now_hour + 12, len(h_temp))):
        hr = i % 24
        hourly_forecasts.append({
            'time_str': f"{hr:02d}:00",
            'temp': round(h_temp[i] if i < len(h_temp) else temp),
            'rain': round(h_rain[i] if i < len(h_rain) else rain),
            'icon': get_wmo_info(h_code[i] if i < len(h_code) else 0)['icon'],
            'is_now': i == now_hour
        })

    # Alert generation
    alert = None
    if code >= 95:
        alert = {
            'icon': '⚡',
            'title': 'Thunderstorm Warning — Stay Indoors',
            'chips': ['Do not go outside', 'Unplug electronics', 'Keep plants sheltered']
        }
    elif code >= 65 or rain >= 85:
        alert = {
            'icon': '⛈',
            'title': 'Heavy Rain Expected',
            'chips': ['Carry umbrella', 'Avoid low-lying areas', 'Move potted plants under cover']
        }
    elif temp >= 42:
        alert = {
            'icon': '🌡',
            'title': 'Extreme Heatwave Warning',
            'chips': ['Stay indoors 11am–4pm', 'Drink water frequently', 'Water plants at dawn']
        }
    elif wind >= 50 or gusts >= 60:
        alert = {
            'icon': '💨',
            'title': 'Strong Wind Advisory',
            'chips': ['Secure loose items', 'Avoid open areas', 'Stake or shelter tall plants']
        }

    return {
        'condition': wmo_info['label'],
        'icon': wmo_info['icon'],
        'temp': temp,
        'feels': feels,
        'humidity': humidity,
        'wind': wind,
        'gusts': gusts,
        'rain': rain,
        'uv': uv,
        'vis': vis_km,
        'cloud': cloud,
        'code': code,
        'city': city_name,
        'hourly': hourly_forecasts,
        'alert': alert
    }

# ═══════════════════════════════════════
# 5. OUTDOOR ADVISOR
# ═══════════════════════════════════════
def get_outdoor_advice(w):
    tips = []
    status = 'safe' # safe | caution | avoid
    
    # Rain checks
    if w['rain'] >= 80:
        tips.append({'icon': '☂️', 'head': 'Heavy rain likely', 'body': 'Carry a raincoat and umbrella.', 'cls': 'danger'})
        status = 'avoid'
    elif w['rain'] >= 45:
        tips.append({'icon': '🌂', 'head': 'Rain possible', 'body': 'Pack a compact umbrella just in case.', 'cls': 'warn'})
        if status == 'safe':
            status = 'caution'
            
    # Temperature checks
    if w['temp'] >= 42:
        tips.append({'icon': '🥵', 'head': 'Extreme heat', 'body': 'Avoid outdoor activity between 11am – 4pm.', 'cls': 'danger'})
        status = 'avoid'
    elif w['temp'] >= 36:
        tips.append({'icon': '🍶', 'head': 'Hot conditions', 'body': 'Stay hydrated. Carry a water bottle.', 'cls': 'warn'})
        if status == 'safe':
            status = 'caution'
    elif w['temp'] <= 8:
        tips.append({'icon': '🧥', 'head': 'Cold weather', 'body': 'Wear warm, layered clothing.', 'cls': 'warn'})
        if status == 'safe':
            status = 'caution'
            
    # UV index checks
    if w['uv'] >= 11:
        tips.append({'icon': '☀️', 'head': f"Extreme UV ({w['uv']})", 'body': 'SPF 50+ sunscreen and a hat are essential.', 'cls': 'danger'})
        if status == 'safe':
            status = 'caution'
    elif w['uv'] >= 8:
        tips.append({'icon': '🧴', 'head': f"Very high UV ({w['uv']})", 'body': 'Apply sunscreen before heading out.', 'cls': 'warn'})
        if status == 'safe':
            status = 'caution'
    elif w['uv'] >= 6:
        tips.append({'icon': '🧢', 'head': f"Moderate UV ({w['uv']})", 'body': 'A cap or hat will help.', 'cls': ''})

    # Wind checks
    if w['wind'] >= 50 or w['gusts'] >= 60:
        tips.append({'icon': '💨', 'head': 'Dangerous winds', 'body': f"Gusts up to {w['gusts']} km/h — stay indoors.", 'cls': 'danger'})
        status = 'avoid'
    elif w['wind'] >= 28:
        tips.append({'icon': '🌬', 'head': 'Windy conditions', 'body': 'Secure loose items. Hold onto your hat.', 'cls': 'warn'})
        if status == 'safe':
            status = 'caution'

    # Humidity
    if w['humidity'] >= 88:
        tips.append({'icon': '💧', 'head': f"Very humid ({w['humidity']}%)", 'body': "Sweat won't cool you. Rest in shade often.", 'cls': 'warn'})
        if status == 'safe':
            status = 'caution'

    # Visibility / Fog
    if w['code'] in [45, 48] or (w['vis'] is not None and float(w['vis']) < 1.0):
        tips.append({'icon': '🌫', 'head': 'Low visibility', 'body': 'Drive carefully. Use headlights.', 'cls': 'warn'})
        if status == 'safe':
            status = 'caution'

    # Thunderstorm
    if w['code'] >= 95:
        tips.append({'icon': '⚡', 'head': 'Thunderstorm active', 'body': 'Stay indoors. Avoid trees and open fields.', 'cls': 'danger'})
        status = 'avoid'

    if not tips:
        tips.append({'icon': '🏃', 'head': 'Great conditions!', 'body': 'Perfect weather to head outside and enjoy.', 'cls': 'good'})

    status_labels = {
        'safe': '🟢 Safe to Go Out',
        'caution': '🟡 Go with Precautions',
        'avoid': '🔴 Stay Indoors'
    }

    return {
        'badge': status_labels[status],
        'tips': tips
    }

# ═══════════════════════════════════════
# 6. PLANT CARE ADVISOR
# ═══════════════════════════════════════
def get_plant_advice(w):
    tips = []
    badge = '🟢 Plants are happy'
    
    # Watering rules
    if w['rain'] >= 70:
        tips.append({'icon': '🚫', 'head': 'Skip watering today', 'body': 'Enough rain is expected — let nature do it.', 'cls': 'warn'})
    elif w['rain'] >= 40:
        tips.append({'icon': '🤔', 'head': 'Hold off for now', 'body': 'Light rain may come. Wait and water in evening if not.', 'cls': ''})
    elif w['temp'] >= 36:
        tips.append({'icon': '⏰', 'head': 'Water early morning only', 'body': 'Water before 7am. Midday watering scorches roots.', 'cls': 'warn'})
    elif w['temp'] <= 6:
        tips.append({'icon': '❄️', 'head': 'Reduce watering', 'body': 'Cold slows absorption. Water sparingly at midday.', 'cls': ''})
    else:
        tips.append({'icon': '💧', 'head': 'Good time to water', 'body': 'Conditions are fine for regular watering today.', 'cls': 'good'})

    # Sunlight rules
    if w['uv'] >= 10:
        tips.append({'icon': '🌿', 'head': 'Protect from harsh sun', 'body': 'Provide shade cloth or move pots to dappled light.', 'cls': 'warn'})
        badge = '🟡 Some attention needed'
    elif w['cloud'] >= 80 or w['uv'] <= 1:
        tips.append({'icon': '🪟', 'head': 'Low sunlight today', 'body': 'Move sun-loving plants near a bright window.', 'cls': ''})
    elif w['uv'] >= 4 and w['cloud'] < 50:
        tips.append({'icon': '☀️', 'head': 'Great light conditions', 'body': "Plants will love today's natural sunlight.", 'cls': 'good'})

    # Storm / Rain protection
    if w['code'] >= 95:
        tips.append({'icon': '🏠', 'head': 'Bring potted plants inside', 'body': 'Thunder, lightning, and heavy rain can damage foliage.', 'cls': 'danger'})
        badge = '🔴 Action needed'
    elif w['code'] >= 65 or w['rain'] >= 85:
        tips.append({'icon': '🏠', 'head': 'Shelter potted plants', 'body': 'Heavy rain may waterlog soil and snap delicate stems.', 'cls': 'danger'})
        badge = '🔴 Action needed'

    # Wind rules
    if w['wind'] >= 40 or w['gusts'] >= 50:
        tips.append({'icon': '🪢', 'head': 'Stake tall plants', 'body': 'Strong gusts can snap stems. Tie supports now.', 'cls': 'warn'})
        if badge == '🟢 Plants are happy':
            badge = '🟡 Some attention needed'

    # Humidity rules
    if w['humidity'] >= 85:
        tips.append({'icon': '🌬', 'head': 'Ensure airflow', 'body': 'High humidity promotes mold and fungal issues.', 'cls': 'warn'})
        if badge == '🟢 Plants are happy':
            badge = '🟡 Some attention needed'
    elif w['humidity'] <= 25:
        tips.append({'icon': '💦', 'head': 'Mist leaves gently', 'body': 'Air is very dry. Light misting prevents dehydration.', 'cls': ''})

    # Heat stress
    if w['temp'] >= 40:
        tips.append({'icon': '🌡', 'head': 'Heat stress risk', 'body': 'Move pots to shade. Check soil moisture twice today.', 'cls': 'danger'})
        badge = '🔴 Action needed'

    # Cold stress
    if w['temp'] <= 4:
        tips.append({'icon': '🧣', 'head': 'Frost risk', 'body': 'Bring tender plants indoors or cover them overnight.', 'cls': 'danger'})
        badge = '🔴 Action needed'

    return {
        'badge': badge,
        'tips': tips
    }

# ═══════════════════════════════════════
# MAIN CONTROLLER
# ═══════════════════════════════════════
def main():
    print("🌤  WEATHERWISE PYTHON ADVISOR  🌤")
    print("──────────────────────────────────")
    print("1. Identifying location...")
    loc = get_location()
    
    city = loc['city']
    if not loc['fallback']:
        city = get_city_name(loc['lat'], loc['lon'])
        
    print(f"   Coordinates: {loc['lat']}, {loc['lon']}")
    print(f"   Resolved Location: {city}\n")
    
    print("2. Fetching weather telemetry...")
    api_data = fetch_weather(loc['lat'], loc['lon'])
    w = normalize_data(api_data, city)
    
    print("\n🌤  CURRENT CONDITIONS")
    print("──────────────────────────────────")
    print(f"   Location:    📍 {w['city']}")
    print(f"   Weather:     {w['icon']}  {w['condition']}")
    print(f"   Temperature: {w['temp']}°C (Feels like {w['feels']}°C)")
    print(f"   Humidity:    💧 {w['humidity']}%")
    print(f"   Wind:        💨 {w['wind']} km/h (Gusts up to {w['gusts']} km/h)")
    print(f"   UV Index:    ☀️ {w['uv']}")
    print(f"   Visibility:  👁  {w['vis'] or 'N/A'} km")
    print(f"   Precipitation Probability: {w['rain']}%")

    if w['alert']:
        print("\n🚨 WARNINGS & ADVISORIES")
        print("──────────────────────────────────")
        print(f"   {w['alert']['icon']}  {w['alert']['title'].upper()}")
        print("   Advisory Steps:")
        for chip in w['alert']['chips']:
            print(f"   • {chip}")

    outdoor = get_outdoor_advice(w)
    print("\n🚶 OUTDOOR ADVICE")
    print("──────────────────────────────────")
    print(f"   Status: {outdoor['badge']}")
    for tip in outdoor['tips']:
        print(f"   {tip['icon']}  [{tip['head']}] {tip['body']}")

    plant = get_plant_advice(w)
    print("\n🌿 PLANT CARE ADVICE")
    print("──────────────────────────────────")
    print(f"   Status: {plant['badge']}")
    for tip in plant['tips']:
        print(f"   {tip['icon']}  [{tip['head']}] {tip['body']}")

    print("\n⏰ 12-HOUR FORECAST")
    print("──────────────────────────────────")
    for f in w['hourly']:
        now_indicator = " (Now) " if f['is_now'] else "       "
        print(f"   {f['time_str']}{now_indicator} {f['icon']}   {f['temp']}°C   💧 {f['rain']}%")

if __name__ == '__main__':
    main()
