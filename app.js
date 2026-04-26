const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const resultDiv = document.getElementById("result");

const unitCBtn = document.getElementById('unitCBtn');
const unitFBtn = document.getElementById('unitFBtn');

let unit = localStorage.getItem('weather_unit') || 'C';
let lastWeatherData = null;
let lastLocation = { latitude: null, longitude: null, name: '', country: '' };
// Local Turkey districts dataset (loaded at runtime)
  let turkeyData = null;
  let localDistrictsFlat = []; // { province, district }
  let fuseSearch = null;
  let fuseSearch = null;

searchBtn.addEventListener("click", getWeather);
// input key handling moved below (for autocomplete and keyboard navigation)

const weatherCodeMap = {
  0: "Açık",
  1: "Çok az bulutlu",
  2: "Parçalı bulutlu",
  3: "Bulutlu",
  45: "Sis",
  48: "Donmuş sis",
  51: "Hafif çiseleme",
  53: "Orta çiseleme",
  55: "Yoğun çiseleme",
  56: "Hafif donma çiseleme",
  57: "Yoğun donma çiseleme",
  61: "Hafif yağmur",
  63: "Orta şiddet yağmur",
  65: "Şiddetli yağmur",
  66: "Hafif donma yağmur",
  67: "Yoğun donma yağmur",
  71: "Hafif kar",
  73: "Orta kar",
  75: "Aşırı kar",
  77: "Buz parçacıkları",
  80: "Hafif sağanak yağmur",
  81: "Orta sağanak yağmur",
  82: "Şiddetli sağanak yağmur",
  85: "Hafif kar sağanağı",
  86: "Yoğun kar sağanağı",
  95: "Fırtına",
  96: "Hafif dolu",
  99: "Yoğun dolu",
};

const weatherIconMap = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌧️",
  56: "🌧️",
  57: "🌧️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌧️",
  67: "🌧️",
  71: "🌨️",
  73: "🌨️",
  75: "🌨️",
  77: "🌨️",
  80: "🌧️",
  81: "🌧️",
  82: "🌧️",
  85: "🌨️",
  86: "🌨️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

function getWeatherCategory(code) {
  const c = Number(code);
  if (c === 0) return "clear";
  if (c >= 1 && c <= 3) return "cloudy";
  if (c === 45 || c === 48) return "fog";
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c)) return "rain";
  if ([71,73,75,77,85,86].includes(c)) return "snow";
  if (c >= 95) return "thunder";
  return "clear";
}

function getIcon(code) {
  return weatherIconMap[code] || "❓";
}

function parseIsoToLocalDate(iso) {
  if (!iso) return null;
  try {
    if (/[Z\+\-]\d{2}:?\d{2}$/.test(iso) || iso.endsWith('Z')) {
      return new Date(iso);
    }
    const [datePart, timePart] = iso.split('T');
    if (!datePart) return new Date(iso);
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour = 0, minute = 0] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute || 0);
  } catch (e) {
    return new Date(iso);
  }
}

function formatDateLong(iso) {
  const d = parseIsoToLocalDate(iso);
  if (!d || isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

async function searchSuggestions(query) {
  lastSuggestionQuery = query || '';
  if (!query || query.length < 1) { clearSuggestions(); return; }

  const q = query.trim();
  const qLower = q.toLowerCase();
  const qNorm = normalizeForSearch(q);

  // Initialize Fuse.js if available
  if (typeof Fuse !== 'undefined' && !fuseSearch && Array.isArray(localDistrictsFlat) && localDistrictsFlat.length) {
    try {
      const fuseOptions = { keys: ['district','province','name','admin1','admin2'], threshold: 0.35, ignoreLocation: true };
      fuseSearch = new Fuse(localDistrictsFlat, fuseOptions);
    } catch (e) {
      console.warn('Fuse init failed', e);
      fuseSearch = null;
    }
  }

  // Try local matches (prefer Fuse search)
  const localMatches = [];
  if (fuseSearch) {
    try {
      const fuseRes = fuseSearch.search(q);
      for (const r of fuseRes) {
        const d = r && r.item ? r.item : r;
        if (!d) continue;
        localMatches.push({ source: 'local', name: d.district || d.name || '', admin1: d.province || d.admin1 || '', admin2: d.admin2 || '', latitude: (d.latitude !== undefined ? d.latitude : null), longitude: (d.longitude !== undefined ? d.longitude : null), country: 'Türkiye' });
        if (localMatches.length >= 7) break;
      }
    } catch (e) {
      // fallback to scanning below
      fuseSearch = null;
    }
  }

  if (!localMatches.length && localDistrictsFlat && localDistrictsFlat.length) {
    for (const d of localDistrictsFlat) {
      if (!d) continue;
      const name = d.district || d.name || '';
      const province = d.province || d.admin1 || '';
      const nameNorm = normalizeForSearch(name);
      if (nameNorm.includes(qNorm) || name.toLowerCase().includes(qLower)) {
        localMatches.push({ source: 'local', name: name, admin1: province || '', admin2: '', latitude: (d.latitude !== undefined ? d.latitude : null), longitude: (d.longitude !== undefined ? d.longitude : null), country: 'Türkiye' });
        if (localMatches.length >= 7) break;
      }
    }
  }

  if (localMatches.length > 0) {
    currentSuggestions = localMatches.slice(0, 7);
    renderSuggestions(currentSuggestions, query);
  } else {
    if (suggestionsContainer) suggestionsContainer.innerHTML = '<div class="suggestion-loading">Yükleniyor...</div>';
  }

  // Fetch remote geocoding and merge with local matches
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=tr&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn('Geocoding service returned', resp.status);
      if (!localMatches.length) {
        if (suggestionsContainer) suggestionsContainer.innerHTML = '<div class="suggestion-item no-results">Eşleşen sonuç yok</div>';
      }
      return;
    }
    let data = {};
    try { data = await resp.json(); } catch (e) { data = {}; }
    const results = (data && data.results) ? data.results : [];

    const seen = new Set();
    const processed = [];
    for (const r of results) {
      if (!r || !r.name) continue;
      const key = `${(r.name||'').toLowerCase()}|${(r.admin1||'').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      processed.push({ source: 'remote', name: r.name || '', admin1: r.admin1 || '', admin2: r.admin2 || '', latitude: r.latitude, longitude: r.longitude, country: r.country || '' });
    }

    // combine local then remote, dedupe by name+admin1
    const combined = [];
    const seen2 = new Set();
    for (const it of localMatches) {
      const key = `${(it.name||'').toLowerCase()}|${(it.admin1||'').toLowerCase()}`;
      if (!seen2.has(key)) { seen2.add(key); combined.push(it); }
    }
    for (const it of processed) {
      const key = `${(it.name||'').toLowerCase()}|${(it.admin1||'').toLowerCase()}`;
      if (!seen2.has(key)) { seen2.add(key); combined.push(it); }
    }

    currentSuggestions = combined.slice(0, 7);
    renderSuggestions(currentSuggestions, query);
  } catch (e) {
    console.warn('suggestions error', e);
    if (!localMatches.length) {
      if (suggestionsContainer) suggestionsContainer.innerHTML = '<div class="suggestion-item no-results">Eşleşen sonuç yok</div>';
    }
  }
}
              flat.push({ province: provinceName, district: ilce.ilce_adi, latitude: lat, longitude: lon });
            }
          }
        }
      }
    }
    flat.sort((a,b) => a.district.localeCompare(b.district, 'tr'));
    const flatStr = JSON.stringify(flat);
    if (!cached || cached !== flatStr) {
      localStorage.setItem(cacheKey, flatStr);
      localDistrictsFlat = flat;
    } else {
      if (!localDistrictsFlat || localDistrictsFlat.length === 0) localDistrictsFlat = flat;
    }
  } catch (e) {
    console.warn('Error loading turkish district data', e);
  }
}

function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

function cToF(c) { return (c * 9) / 5 + 32; }
function formatTemp(celsius) {
  const c = Number(celsius);
  if (isNaN(c)) return '—';
  if (unit === 'C') return `${Math.round(c)} °C`;
  return `${Math.round(cToF(c))} °F`;
}

function updateUnitUI() {
  if (unitCBtn) {
    unitCBtn.setAttribute('role', 'radio');
    unitCBtn.setAttribute('aria-checked', unit === 'C' ? 'true' : 'false');
    unitCBtn.tabIndex = unit === 'C' ? 0 : -1;
  }
  if (unitFBtn) {
    unitFBtn.setAttribute('role', 'radio');
    unitFBtn.setAttribute('aria-checked', unit === 'F' ? 'true' : 'false');
    unitFBtn.tabIndex = unit === 'F' ? 0 : -1;
  }
}

function setUnit(u) {
  if (!u || (u !== 'C' && u !== 'F')) return;
  if (unit === u) return;
  unit = u;
  localStorage.setItem('weather_unit', unit);
  updateUnitUI();
  if (lastWeatherData) renderWeatherFromData(lastWeatherData, lastLocation.name, lastLocation.country);
}

if (unitCBtn) unitCBtn.addEventListener('click', () => setUnit('C'));
if (unitFBtn) unitFBtn.addEventListener('click', () => setUnit('F'));

updateUnitUI();

// keyboard support for the radiogroup (Left/Right to toggle)
const unitToggle = document.querySelector('.unit-toggle');
if (unitToggle) {
  unitToggle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setUnit(e.key === 'ArrowLeft' ? 'C' : 'F');
      const toFocus = unit === 'C' ? unitCBtn : unitFBtn;
      if (toFocus) toFocus.focus();
    }
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function clearSuggestions() {
  if (!suggestionsContainer) return;
  suggestionsContainer.innerHTML = '';
  suggestionIndex = -1;
  currentSuggestions = [];
}
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let lastSuggestionQuery = '';

function highlightMatch(text, q) {
  if (!q) return escapeHtml(text);
  try {
    const re = new RegExp('(' + escapeRegExp(q) + ')', 'gi');
    return escapeHtml(text).replace(re, '<span class="match">$1</span>');
  } catch (e) {
    return escapeHtml(text);
  }
}

function wrapMatch(text, q) {
  if (!q) return escapeHtml(text);
  const s = String(text || '');
  const qi = String(q || '').toLowerCase();
  const si = s.toLowerCase();
  const idx = si.indexOf(qi);
  if (idx === -1) return escapeHtml(s);
  const before = escapeHtml(s.slice(0, idx));
  const match = escapeHtml(s.slice(idx, idx + q.length));
  const after = escapeHtml(s.slice(idx + q.length));
  return `${before}<span class="match">${match}</span>${after}`;
}

async function searchSuggestions(query) {
  lastSuggestionQuery = query || '';
  if (!query || query.length < 1) { clearSuggestions(); return; }

  const q = query.trim();
  const qLower = q.toLowerCase();
  const qNorm = normalizeForSearch(q);

  // Initialize Fuse.js if available
  if (typeof Fuse !== 'undefined' && !fuseSearch && Array.isArray(localDistrictsFlat) && localDistrictsFlat.length) {
    try {
      const fuseOptions = { keys: ['district','province','name','admin1','admin2'], threshold: 0.35, ignoreLocation: true };
      fuseSearch = new Fuse(localDistrictsFlat, fuseOptions);
    } catch (e) {
      console.warn('Fuse init failed', e);
      fuseSearch = null;
    }
  }

  // Try local matches (prefer Fuse search)
  const localMatches = [];
  if (fuseSearch) {
    try {
      const fuseRes = fuseSearch.search(q);
      for (const r of fuseRes) {
        const d = r && r.item ? r.item : r;
        if (!d) continue;
        localMatches.push({ source: 'local', name: d.district || d.name || '', admin1: d.province || d.admin1 || '', admin2: d.admin2 || '', latitude: (d.latitude !== undefined ? d.latitude : null), longitude: (d.longitude !== undefined ? d.longitude : null), country: 'Türkiye' });
        if (localMatches.length >= 7) break;
      }
    } catch (e) {
      // fallback to scanning below
      fuseSearch = null;
    }
  }

  if (!localMatches.length && localDistrictsFlat && localDistrictsFlat.length) {
    for (const d of localDistrictsFlat) {
      if (!d) continue;
      const name = d.district || d.name || '';
      const province = d.province || d.admin1 || '';
      const nameNorm = normalizeForSearch(name);
      if (nameNorm.includes(qNorm) || name.toLowerCase().includes(qLower)) {
        localMatches.push({ source: 'local', name: name, admin1: province || '', admin2: '', latitude: (d.latitude !== undefined ? d.latitude : null), longitude: (d.longitude !== undefined ? d.longitude : null), country: 'Türkiye' });
        if (localMatches.length >= 7) break;
      }
    }
  }

  if (localMatches.length > 0) {
    currentSuggestions = localMatches.slice(0, 7);
    renderSuggestions(currentSuggestions, query);
  } else {
    if (suggestionsContainer) suggestionsContainer.innerHTML = '<div class="suggestion-loading">Yükleniyor...</div>';
  }

  // Fetch remote geocoding and merge with local matches
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=tr&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn('Geocoding service returned', resp.status);
      if (!localMatches.length) {
        if (suggestionsContainer) suggestionsContainer.innerHTML = '<div class="suggestion-item no-results">Eşleşen sonuç yok</div>';
      }
      return;
    }
    let data = {};
    try { data = await resp.json(); } catch (e) { data = {}; }
    const results = (data && data.results) ? data.results : [];

    const seen = new Set();
    const processed = [];
    for (const r of results) {
      if (!r || !r.name) continue;
      const key = `${(r.name||'').toLowerCase()}|${(r.admin1||'').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      processed.push({ source: 'remote', name: r.name || '', admin1: r.admin1 || '', admin2: r.admin2 || '', latitude: r.latitude, longitude: r.longitude, country: r.country || '' });
    }

    // combine local then remote, dedupe by name+admin1
    const combined = [];
    const seen2 = new Set();
    for (const it of localMatches) {
      const key = `${(it.name||'').toLowerCase()}|${(it.admin1||'').toLowerCase()}`;
      if (!seen2.has(key)) { seen2.add(key); combined.push(it); }
    }
    for (const it of processed) {
      const key = `${(it.name||'').toLowerCase()}|${(it.admin1||'').toLowerCase()}`;
      if (!seen2.has(key)) { seen2.add(key); combined.push(it); }
    }

    currentSuggestions = combined.slice(0, 7);
    renderSuggestions(currentSuggestions, query);
  } catch (e) {
    console.warn('suggestions error', e);
    if (!localMatches.length) {
      if (suggestionsContainer) suggestionsContainer.innerHTML = '<div class="suggestion-item no-results">Eşleşen sonuç yok</div>';
    }
  }
}

function renderSuggestions(items, q) {
  if (!suggestionsContainer) return;
  const query = (q || '').trim();
  if (suggestionsContainer) suggestionsContainer.dataset.q = query;
  if (!items || items.length === 0) {
    suggestionsContainer.innerHTML = '<div class="suggestion-item no-results">Eşleşen sonuç yok</div>';
    suggestionIndex = -1;
    currentSuggestions = [];
    cityInput.removeAttribute('aria-activedescendant');
    return;
  }

  suggestionIndex = -1;
  let html = '';
  items.forEach((it, i) => {
    const admin1 = it.admin1 || '';
    const admin2 = it.admin2 || '';
    const mainText = admin2 || it.name || '';
    const subText = admin1 || '';
    const highlightedMain = wrapMatch(mainText, query);
    const highlightedSub = wrapMatch(subText, query);
    const dataLat = (it.latitude !== undefined && it.latitude !== null) ? it.latitude : '';
    const dataLon = (it.longitude !== undefined && it.longitude !== null) ? it.longitude : '';
    html += `<div id="suggestion-item-${i}" class="suggestion-item" role="option" aria-selected="false" data-idx="${i}" data-lat="${dataLat}" data-lon="${dataLon}" data-name="${escapeHtml(it.name||'')}" data-admin1="${escapeHtml(admin1)}" data-admin2="${escapeHtml(admin2)}"><div class="suggestion-main">${highlightedMain}</div>${subText ? `<div class="suggestion-sub">${highlightedSub}</div>` : ''}</div>`;
  });

  suggestionsContainer.innerHTML = html;
  const els = Array.from(suggestionsContainer.querySelectorAll('.suggestion-item'));
  els.forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.idx);
      selectSuggestion(idx);
    });
    el.addEventListener('mouseenter', () => {
      suggestionIndex = Number(el.dataset.idx);
      highlightSuggestion(els, suggestionIndex);
    });
  });
}

async function selectSuggestion(idx) {
  const it = currentSuggestions[idx];
  if (!it) return;
  const main = it.admin2 || it.name;
  const sub = it.admin1 || '';
  const display = sub ? `${main} / ${sub}` : `${main}`;
  cityInput.value = display;
  clearSuggestions();
  // If suggestion lacks coords, resolve via geocoding by combining district+province
  if (it.latitude == null || it.longitude == null) {
    try {
      setLoading(true);
      const q = `${it.name}${it.admin1 ? (', ' + it.admin1) : ''}, Turkey`;
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=tr&format=json`;
      const resp = await fetch(geoUrl);
      if (!resp.ok) {
        resultDiv.innerHTML = '<p>Konum servisi şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.</p>';
        return;
      }
      let data;
      try { data = await resp.json(); } catch (e) { resultDiv.innerHTML = '<p>Konum verisi okunamadı.</p>'; return; }
      if (data && data.results && data.results.length) {
        const loc = data.results[0];
        await fetchAndRender(loc.latitude, loc.longitude, it.name || loc.name, loc.country || 'Türkiye');
        try { saveRecent(`${it.name} / ${it.admin1 || ''}`); } catch (e) {}
      } else {
        resultDiv.innerHTML = '<p>Seçilen ilçe için koordinat bulunamadı.</p>';
      }
    } catch (e) {
      console.warn('local geocode failed', e);
      resultDiv.innerHTML = '<p>Koordinat sorgusu yapılamadı.</p>';
    } finally {
      setLoading(false);
    }
    } else {
    fetchAndRender(it.latitude, it.longitude, it.name, it.country);
    try { saveRecent(it.name); } catch (e) {}
  }
}

function highlightSuggestion(items, idx) {
  items.forEach((el, i) => {
    const sel = i === idx;
    el.classList.toggle('active', sel);
    el.setAttribute('aria-selected', sel ? 'true' : 'false');
  });
  if (idx >= 0 && items[idx]) {
    const id = items[idx].id;
    cityInput.setAttribute('aria-activedescendant', id);
    items[idx].scrollIntoView({ block: 'nearest' });
  } else {
    cityInput.removeAttribute('aria-activedescendant');
  }
}

function handleInputKeyDown(e) {
  const items = suggestionsContainer ? Array.from(suggestionsContainer.querySelectorAll('.suggestion-item')) : [];
  if (e.key === 'ArrowDown') {
    if (items.length === 0) return;
    e.preventDefault();
    suggestionIndex = (suggestionIndex + 1) % items.length;
    highlightSuggestion(items, suggestionIndex);
  } else if (e.key === 'ArrowUp') {
    if (items.length === 0) return;
    e.preventDefault();
    suggestionIndex = (suggestionIndex - 1 + items.length) % items.length;
    highlightSuggestion(items, suggestionIndex);
  } else if (e.key === 'Enter') {
    if (suggestionIndex >= 0 && items[suggestionIndex]) {
      e.preventDefault();
      selectSuggestion(suggestionIndex);
    } else if (items.length > 0) {
      e.preventDefault();
      suggestionIndex = 0;
      highlightSuggestion(items, suggestionIndex);
      selectSuggestion(suggestionIndex);
    } else {
      // trigger full search
      getWeather();
    }
  } else if (e.key === 'Escape') {
    clearSuggestions();
  }
}

// attach input listener (debounced) and keyboard handler
cityInput.addEventListener('input', debounce((ev) => { searchSuggestions(ev.target.value.trim()); }, 250));
cityInput.addEventListener('keydown', handleInputKeyDown);

// clear button
const clearBtn = document.getElementById('clearBtn');
if (clearBtn) clearBtn.addEventListener('click', () => { cityInput.value = ''; clearSuggestions(); cityInput.focus(); });

// click outside to hide
document.addEventListener('click', (ev) => { if (!searchBox.contains(ev.target)) clearSuggestions(); });

function renderWeatherFromData(weatherData, name = '', country = '') {
  if (!weatherData || !weatherData.current_weather) {
    resultDiv.innerHTML = "<p>Hava verisi alınamadı.</p>";
    return;
  }
  const current = weatherData.current_weather;

  let humidity = null;
  if (
    weatherData.hourly &&
    weatherData.hourly.time &&
    weatherData.hourly.relativehumidity_2m
  ) {
    const idx = weatherData.hourly.time.indexOf(current.time);
    if (idx !== -1) humidity = weatherData.hourly.relativehumidity_2m[idx];
  }

  const description = weatherCodeMap[current.weathercode] || "Bilinmiyor";
  const icon = getIcon(current.weathercode);
  const category = getWeatherCategory(current.weathercode);
  document.body.classList.remove("clear","cloudy","rain","snow","fog","thunder");
  document.body.classList.add(category);

  const currentHtml = `
    <div class="weather-current">
      <div class="icon">${icon}</div>
      <div class="details">
        <p><strong>Şehir:</strong> ${escapeHtml(name || '')}${country ? (', ' + escapeHtml(country)) : ''}</p>
        <p><strong>Sıcaklık:</strong> ${formatTemp(current.temperature)}</p>
        <p><strong>Nem:</strong> ${humidity !== null ? humidity + " %" : "—"}</p>
        <p><strong>Rüzgar:</strong> ${current.windspeed} km/h</p>
        <p><strong>Hava Durumu:</strong> ${description} (kod: ${current.weathercode})</p>
        <p><strong>Saat:</strong> ${formatDateLong(current.time)}</p>
      </div>
    </div>
  `;

  // 5 günlük tahmin
  let dailyHtml = '';
  if (weatherData.daily && weatherData.daily.time) {
    const days = Math.min(5, weatherData.daily.time.length);
    dailyHtml = '<div class="forecast-daily"><h3>5 Günlük Tahmin</h3><div class="cards">';
    for (let i = 0; i < days; i++) {
      const dDate = weatherData.daily.time[i];
      const max = weatherData.daily.temperature_2m_max[i];
      const min = weatherData.daily.temperature_2m_min[i];
      const dCode = weatherData.daily.weathercode[i];
      const dIcon = getIcon(dCode);
      const dDesc = weatherCodeMap[dCode] || '';
      const dayLabel = new Date(dDate).toLocaleDateString('tr-TR', {weekday:'short', day:'numeric', month:'short'});
      dailyHtml += `<div class="card"><div class="card-icon">${dIcon}</div><div class="card-day">${dayLabel}</div><div class="card-temp">${formatTemp(max)} / ${formatTemp(min)}</div><div class="card-desc">${dDesc}</div></div>`;
    }
    dailyHtml += '</div></div>';
  }

  // Saatlik tahmin (sonraki 24 saat)
  let hourlyHtml = '';
  if (weatherData.hourly && weatherData.hourly.time && weatherData.hourly.temperature_2m) {
    const startIdx = weatherData.hourly.time.indexOf(current.time);
    if (startIdx !== -1) {
      hourlyHtml = '<div class="forecast-hourly"><h3>Saatlik Tahmin (24s)</h3><div class="hour-rows">';
      for (let j = startIdx; j < Math.min(startIdx + 24, weatherData.hourly.time.length); j++) {
        const t = weatherData.hourly.time[j];
        const temp = weatherData.hourly.temperature_2m[j];
        const hrCode = (weatherData.hourly.weathercode && weatherData.hourly.weathercode[j] !== undefined) ? weatherData.hourly.weathercode[j] : null;
        const hrIcon = hrCode !== null ? getIcon(hrCode) : '';
        const timeLabel = formatTimeShort(t);
        hourlyHtml += `<div class="hour-row"><div class="hour-time">${timeLabel}</div><div class="hour-icon">${hrIcon}</div><div class="hour-temp">${formatTemp(temp)}</div></div>`;
      }
      hourlyHtml += '</div></div>';
    }
  }

  resultDiv.innerHTML = currentHtml + dailyHtml + hourlyHtml;
}

async function fetchAndRender(latitude, longitude, name = '', country = '') {
  setLoading(true);
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) {
      resultDiv.innerHTML = "<p>Hava servisi geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.</p>";
      return;
    }
    let weatherData;
    try { weatherData = await weatherResponse.json(); } catch (e) { resultDiv.innerHTML = "<p>Hava verisi okunamadı.</p>"; return; }

    lastWeatherData = weatherData;
    lastLocation = { latitude, longitude, name: name || '', country: country || '' };

    renderWeatherFromData(weatherData, name, country);

    if (name) saveRecent(name);
  } catch (error) {
    resultDiv.innerHTML = "<p>Bir hata oluştu. Lütfen tekrar dene.</p>";
    console.error(error);
  } finally {
    setLoading(false);
  }
}

async function getWeather() {
  const city = cityInput.value.trim();

  if (!city) {
    resultDiv.innerHTML = "<p>Lütfen bir şehir adı gir.</p>";
    return;
  }

  setLoading(true);
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`;
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) {
      resultDiv.innerHTML = "<p>Konum servisi kullanılamıyor. Lütfen tekrar deneyin.</p>";
      return;
    }
    let geoData;
    try { geoData = await geoResponse.json(); } catch (e) { resultDiv.innerHTML = "<p>Konum verisi okunamadı.</p>"; return; }

    if (!geoData.results || geoData.results.length === 0) {
      resultDiv.innerHTML = "<p>Şehir bulunamadı.</p>";
      return;
    }

    const location = geoData.results[0];
    const { latitude, longitude, name, country } = location;

    await fetchAndRender(latitude, longitude, name, country);
  } catch (error) {
    resultDiv.innerHTML = "<p>Bir hata oluştu. Lütfen tekrar dene.</p>";
    console.error(error);
  }
}

async function fetchWeatherByCoords(latitude, longitude) {
  try {
    const revUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=tr&format=json&count=1`;
    const revResp = await fetch(revUrl);
    const revData = await revResp.json();
    let name = 'Konumunuz';
    let country = '';
    if (revData && revData.results && revData.results.length) {
      name = revData.results[0].name || name;
      country = revData.results[0].country || '';
    }
    await fetchAndRender(latitude, longitude, name, country);
  } catch (e) {
    console.warn('Reverse geocoding failed', e);
    await fetchAndRender(latitude, longitude, 'Konumunuz', '');
  }
}

function saveRecent(city) {
  try {
    const key = 'weather_recent';
    if (!city) return;
    let arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr = arr.filter(c => c.toLowerCase() !== city.toLowerCase());
    arr.unshift(city);
    if (arr.length > 5) arr = arr.slice(0,5);
    localStorage.setItem(key, JSON.stringify(arr));
    renderRecent();
  } catch (e) {
    console.warn(e);
  }
}

function renderRecent() {
  const cont = document.getElementById('recent');
  if (!cont) return;
  const key = 'weather_recent';
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  if (!arr || arr.length === 0) { cont.innerHTML = ''; return; }
  let html = '<div class="recent-title"><strong>Son Aramalar</strong></div><div class="recent-list">';
  for (const c of arr) {
    html += `<button class="recent-item" data-city="${c}">${c}</button>`;
  }
  html += '</div>';
  cont.innerHTML = html;
  cont.querySelectorAll('.recent-item').forEach(btn => {
    btn.addEventListener('click', () => {
      cityInput.value = btn.dataset.city;
      getWeather();
    });
  });
}

async function reindexLocalDistricts() {
  try {
    const resp = await fetch('data/il-ilce-with-loc.json');
    if (!resp.ok) return false;
    const data = await resp.json();
    const flat = [];
    const provinces = Array.isArray(data) ? data : (data.data || []);
    for (const p of provinces) {
      const province = p.il_adi || p.province || p.admin1 || p.name || '';
      const ilceler = p.ilceler || p.districts || p.children || [];
      for (const ilce of ilceler) {
        const district = ilce.ilce_adi || ilce.ilce || ilce.district || ilce.name || '';
        const lat = (ilce.latitude !== undefined ? ilce.latitude : (ilce.lat !== undefined ? ilce.lat : null));
        const lon = (ilce.longitude !== undefined ? ilce.longitude : (ilce.lon !== undefined ? ilce.lon : null));
        flat.push({ province, district, latitude: lat, longitude: lon });
      }
    }
    flat.sort((a,b) => (a.district||'').localeCompare(b.district||'','tr'));
    localDistrictsFlat = flat;
    if (typeof Fuse !== 'undefined') {
      try { fuseSearch = new Fuse(localDistrictsFlat, { keys: ['district','province'], threshold: 0.35, ignoreLocation: true }); } catch(e) { fuseSearch = null; }
    }
    return true;
  } catch (e) {
    console.warn('reindexLocalDistricts failed', e);
    return false;
  }
}

window.addEventListener('load', () => {
  renderRecent();
  // load Turkey district list for offline/local suggestions
  loadTurkeyDistricts();

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
    }, (err) => {
      console.warn('Konum izni reddedildi veya hata:', err);
    });
  }
});