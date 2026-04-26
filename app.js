const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const resultDiv = document.getElementById('result');
const suggestionsContainer = document.getElementById('suggestions');
const clearBtn = document.getElementById('clearBtn');
const unitCBtn = document.getElementById('unitCBtn');
const unitFBtn = document.getElementById('unitFBtn');

let unit = localStorage.getItem('weather_unit') || 'C';
let lastWeatherData = null;
let lastLocation = { latitude: null, longitude: null, name: '', country: '' };

// local index
let localDistrictsFlat = [];
let fuseSearch = null;

function normalizeForSearch(s) {
  if (!s) return '';
  // basic turkish-safe normalization
  return String(s).toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇÇ\s-]/gi, '')
    .trim();
}

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}

async function reindexLocalDistricts() {
  try {
    const resp = await fetch('data/il-ilce-with-loc.json');
    if (!resp.ok) return false;
    const json = await resp.json();
    const provinces = Array.isArray(json) ? json : (json.data || []);
    const flat = [];
    for (const p of provinces) {
      const province = p.il_adi || p.province || '';
      const ilceler = p.ilceler || [];
      for (const ic of ilceler) {
        flat.push({ province, district: ic.ilce_adi || ic.ilce || ic.name || '', latitude: ic.latitude ?? ic.lat ?? null, longitude: ic.longitude ?? ic.lon ?? null });
      }
    }
    localDistrictsFlat = flat;
    if (typeof Fuse !== 'undefined') {
      try { fuseSearch = new Fuse(localDistrictsFlat, { keys: ['district','province'], threshold: 0.35, ignoreLocation: true }); } catch(e) { fuseSearch = null; }
    }
    return true;
  } catch (e) {
    console.warn('reindex error', e);
    return false;
  }
}

async function searchSuggestions(query) {
  const q = String(query || '').trim();
  if (!q) { renderSuggestions([], ''); return; }
  const results = [];

  // local Fuse results
  if (fuseSearch && localDistrictsFlat && localDistrictsFlat.length) {
    try {
      const fs = fuseSearch.search(q).slice(0, 10);
      for (const r of fs) {
        const item = r.item || r;
        results.push({ source: 'local', name: item.district, admin1: item.province, latitude: item.latitude, longitude: item.longitude });
        if (results.length >= 7) break;
      }
    } catch (e) { console.warn('fuse search err', e); }
  }

  // remote fallback if not enough local results
  if (results.length < 7) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=20&language=tr&format=json`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const remote = (data && data.results) ? data.results : [];
        for (const r of remote) {
          if (!r || !r.name) continue;
          results.push({ source: 'remote', name: r.name, admin1: r.admin1 || '', latitude: r.latitude, longitude: r.longitude, country: r.country || '' });
          if (results.length >= 7) break;
        }
      }
    } catch (e) { console.warn('remote geocode fail', e); }
  }

  // dedupe by name+admin1
  const dedup = [];
  const seen = new Set();
  for (const it of results) {
    const key = `${String(it.name||'').toLocaleLowerCase()}|${String(it.admin1||'').toLocaleLowerCase()}`;
    if (seen.has(key)) continue; seen.add(key); dedup.push(it);
  }

  renderSuggestions(dedup.slice(0,7), q);
}

function renderSuggestions(items, q) {
  if (!suggestionsContainer) return;
  suggestionsContainer.innerHTML = '';
  if (!items || items.length === 0) { suggestionsContainer.innerHTML = '<div class="suggestion-item no-results">Eşleşen sonuç yok</div>'; return; }
  items.forEach((it, i) => {
    const name = escapeHtml(it.name || '');
    const sub = escapeHtml(it.admin1 || '');
    const lat = (it.latitude !== undefined && it.latitude !== null) ? it.latitude : '';
    const lon = (it.longitude !== undefined && it.longitude !== null) ? it.longitude : '';
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.setAttribute('role','option');
    div.dataset.idx = String(i);
    div.dataset.name = it.name || '';
    div.dataset.admin1 = it.admin1 || '';
    div.dataset.lat = lat;
    div.dataset.lon = lon;
    div.innerHTML = `<div class="suggestion-main">${wrapMatch(name, q)}</div>${sub ? `<div class="suggestion-sub">${wrapMatch(sub, q)}</div>` : ''}`;
    div.addEventListener('click', () => selectSuggestionFromElement(div));
    suggestionsContainer.appendChild(div);
  });
}

function selectSuggestionFromElement(el) {
  const lat = el.dataset.lat;
  const lon = el.dataset.lon;
  const name = el.dataset.name || '';
  const admin1 = el.dataset.admin1 || '';
  cityInput.value = admin1 ? `${name} / ${admin1}` : name;
  suggestionsContainer.innerHTML = '';
  if (lat && lon) {
    fetchAndRender(lat, lon, name, '');
    saveRecent(cityInput.value);
    return;
  }
  // try remote geocode for the specific suggestion
  (async () => {
    try {
      const q = `${name}${admin1 ? (', ' + admin1) : ''}, Turkey`;
      const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=tr&format=json`;
      const r = await fetch(u);
      if (!r.ok) { resultDiv.innerHTML = '<p>Konum servisi kullanılamıyor.</p>'; return; }
      const data = await r.json().catch(()=>({}));
      if (data && data.results && data.results.length) {
        const loc = data.results[0];
        await fetchAndRender(loc.latitude, loc.longitude, loc.name || name, loc.country || '');
        saveRecent(cityInput.value);
      } else {
        resultDiv.innerHTML = '<p>Seçilen ilçe için koordinat bulunamadı.</p>';
      }
    } catch (e) { console.warn('select geocode err', e); resultDiv.innerHTML = '<p>Koordinat sorgusu yapılamadı.</p>'; }
  })();
}

function wrapMatch(text, q) {
  if (!q) return escapeHtml(text);
  try {
    const re = new RegExp('(' + escapeRegExp(q) + ')','gi');
    return escapeHtml(text).replace(re, '<span class="match">$1</span>');
  } catch (e) { return escapeHtml(text); }
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }
function escapeHtml(str) { return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

async function fetchAndRender(latitude, longitude, name = '', country = '') {
  setLoading(true);
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const resp = await fetch(weatherUrl);
    if (!resp.ok) { resultDiv.innerHTML = '<p>Hava servisi kullanılamıyor.</p>'; return; }
    const weather = await resp.json().catch(()=>null);
    if (!weather || !weather.current_weather) { resultDiv.innerHTML='<p>Hava verisi alınamadı.</p>'; return; }
    lastWeatherData = weather; lastLocation = { latitude, longitude, name, country };
    renderWeatherFromData(weather, name, country);
  } catch (e) { console.error(e); resultDiv.innerHTML = '<p>Hava verisi alınamadı.</p>'; }
  finally { setLoading(false); }
}

function renderWeatherFromData(weatherData, name='', country='') {
  const current = weatherData.current_weather;
  if (!current) { resultDiv.innerHTML = '<p>Hava verisi yok.</p>'; return; }
  const icon = getIcon(current.weathercode || 0);
  const desc = weatherCodeMap[current.weathercode] || '';
  const html = `
    <div class="weather-current">
      <div class="icon">${icon}</div>
      <div class="details">
        <p><strong>Şehir:</strong> ${escapeHtml(name)}${country ? (', ' + escapeHtml(country)) : ''}</p>
        <p><strong>Sıcaklık:</strong> ${formatTemp(current.temperature)}</p>
        <p><strong>Rüzgar:</strong> ${current.windspeed} km/h</p>
        <p><strong>Hava:</strong> ${escapeHtml(desc)}</p>
        <p><strong>Saat:</strong> ${new Date(current.time).toLocaleString('tr-TR')}</p>
      </div>
    </div>
  `;
  resultDiv.innerHTML = html;
}

function setLoading(v) { if (v) { resultDiv.innerHTML = '<p>Yükleniyor…</p>'; } }

function getIcon(code) {
  const map = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',61:'🌧️',71:'🌨️',95:'⛈️'};
  return map[code] || '❓';
}

const weatherCodeMap = {0:'Açık',1:'Çok az bulutlu',2:'Parçalı bulutlu',3:'Bulutlu',45:'Sis',48:'Donmuş sis',51:'Çiseleme',61:'Yağmur',71:'Kar',95:'Fırtına'};

function formatTemp(c) { const n = Number(c); if (isNaN(n)) return '—'; return unit === 'C' ? `${Math.round(n)} °C` : `${Math.round(n*9/5+32)} °F`; }

// Recent searches
function saveRecent(v) {
  try { if (!v) return; const key='weather_recent'; let arr=JSON.parse(localStorage.getItem(key)||'[]'); arr = arr.filter(x=>x.toLowerCase()!==v.toLowerCase()); arr.unshift(v); if (arr.length>5) arr=arr.slice(0,5); localStorage.setItem(key, JSON.stringify(arr)); renderRecent(); } catch(e){console.warn(e);} }
function renderRecent() { const cont=document.getElementById('recent'); if(!cont) return; const arr=JSON.parse(localStorage.getItem('weather_recent')||'[]'); if(!arr||!arr.length){cont.innerHTML='';return;} cont.innerHTML = '<div class="recent-title"><strong>Son Aramalar</strong></div><div class="recent-list">'+arr.map(a=>`<button class="recent-item">${escapeHtml(a)}</button>`).join('')+'</div>'; cont.querySelectorAll('.recent-item').forEach(b=>b.addEventListener('click',()=>{ cityInput.value=b.textContent; searchBtn.click(); })); }

// basic input handlers
cityInput && cityInput.addEventListener('input', debounce(e=>searchSuggestions(e.target.value), 250));
clearBtn && clearBtn.addEventListener('click', ()=>{ cityInput.value=''; suggestionsContainer.innerHTML=''; cityInput.focus(); });
searchBtn && searchBtn.addEventListener('click', async ()=>{
  const q = cityInput.value.trim(); if(!q) return; // try remote geocode
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=tr&format=json`;
    const r = await fetch(url); if(!r.ok){ resultDiv.innerHTML = '<p>Konum servisi kullanılamıyor.</p>'; return; }
    const data = await r.json().catch(()=>null);
    if (!data || !data.results || !data.results.length) { resultDiv.innerHTML = '<p>Şehir bulunamadı.</p>'; return; }
    const loc = data.results[0]; await fetchAndRender(loc.latitude, loc.longitude, loc.name||q, loc.country||'');
  } catch(e){ console.warn(e); resultDiv.innerHTML = '<p>Arama başarısız.</p>'; }
});

// unit toggles
if (unitCBtn) unitCBtn.addEventListener('click', ()=>{ unit='C'; localStorage.setItem('weather_unit', unit); if (lastWeatherData) renderWeatherFromData(lastWeatherData, lastLocation.name, lastLocation.country); });
if (unitFBtn) unitFBtn.addEventListener('click', ()=>{ unit='F'; localStorage.setItem('weather_unit', unit); if (lastWeatherData) renderWeatherFromData(lastWeatherData, lastLocation.name, lastLocation.country); });

// Export reindex to window for runtime calls
window.reindexLocalDistricts = reindexLocalDistricts;

// on load
window.addEventListener('load', async ()=>{ renderRecent(); await reindexLocalDistricts(); });
