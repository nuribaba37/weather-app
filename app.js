import {
  fetchApproximateIpLocation, fetchWeatherBundle, fetchWeatherSummary, reverseGeocodeLocation,
  searchRemoteLocation,
} from './js/api.js';
import { translate } from './js/i18n.js';
import {
  findDistrict, findDistrictByAddress, hasAmbiguousDistrictName, loadDistrictIndex,
  nearestDistrict, searchDistricts,
} from './js/search.js';
import {
  addRecent, addSavedLocation, clearRecent, defaultAlertPreferences, getLastLocation,
  getLatestWeatherCache, getRecent, getSavedLocations, getSettings, getWeatherCache,
  removeSavedLocation, saveLastLocation,
  saveSettings, saveWeatherCache,
} from './js/storage.js';
import {
  airQualityLabel, cacheKey, debounce, escapeHtml, formatDay, formatDecimal, formatHour,
  formatLocalTime, formatPercentage, formatTemperature, isTurkeyCoordinate,
  normalizeForSearch, windDirection,
} from './js/utils.js';
import { weatherIcon, weatherLabel, weatherTheme } from './js/weather-codes.js';
import { buildWeatherAlerts } from './js/weather-alerts.js';

const AUTO_REFRESH_MS = 15 * 60 * 1000;

const elements = Object.fromEntries([
  'searchForm', 'cityInput', 'clearBtn', 'searchBtn', 'suggestions', 'locationBtn',
  'unitCBtn', 'unitFBtn', 'notice', 'result', 'recentSection', 'recentList',
  'clearRecentBtn', 'savedSection', 'savedList', 'savedEmpty', 'saveCurrentBtn', 'themeBtn',
  'languageBtn', 'installBtn', 'offlineBanner', 'helpBtn', 'ipDialog', 'allowIpBtn',
  'helpDialog', 'toast', 'compareSavedBtn', 'comparisonResults', 'rainThreshold',
  'windThreshold', 'uvThreshold', 'rainThresholdValue', 'windThresholdValue',
  'uvThresholdValue', 'resetAlertSettingsBtn', 'updateBanner', 'updateNowBtn', 'updateLaterBtn',
  'installCard', 'installCardBtn', 'installDismissBtn',
].map(id => [id, document.getElementById(id)]));

let chartModulePromise = null;

const state = {
  settings: getSettings(),
  currentLocation: null,
  currentBundle: null,
  currentFetchedAt: 0,
  currentIsCached: false,
  requestController: null,
  retryAction: null,
  installPrompt: null,
  serviceWorkerRegistration: null,
  toastTimer: null,
  locationLookupInProgress: false,
  districtIndexPromise: null,
  districtIndexLoading: true,
  comparisonController: null,
  comparisonResults: [],
  comparisonLocationIds: '',
  comparisonFetchedAt: 0,
  updateWorker: null,
  updateRequested: false,
};

const t = (key, variables) => translate(state.settings.language, key, variables);

function drawHourlyChartLazy(canvas, hourly, unit, theme) {
  if (!canvas) return;
  chartModulePromise ??= import('./js/chart.js');
  chartModulePromise
    .then(({ drawHourlyChart }) => drawHourlyChart(canvas, hourly, unit, theme))
    .catch(() => {
      // The hourly table and cards remain available if canvas drawing fails.
    });
}

function updateTranslations() {
  document.documentElement.lang = state.settings.language;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const label = t(element.dataset.i18nTitle);
    element.title = label;
    element.setAttribute('aria-label', label);
  });
  elements.cityInput.setAttribute('aria-label', t('searchLabel'));
  elements.languageBtn.setAttribute('aria-label', t('language'));
  elements.unitCBtn.parentElement.setAttribute('aria-label', state.settings.language === 'tr' ? 'Sıcaklık birimi' : 'Temperature unit');
}

function resolvedTheme() {
  if (state.settings.theme === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return state.settings.theme;
}

function updateAlertPreferenceControls() {
  const alerts = state.settings.alerts;
  elements.rainThreshold.value = String(alerts.rainProbability);
  elements.windThreshold.value = String(alerts.windSpeed);
  elements.uvThreshold.value = String(alerts.uvIndex);
  elements.rainThresholdValue.textContent = formatPercentage(alerts.rainProbability, state.settings.language);
  elements.windThresholdValue.textContent = `${formatDecimal(alerts.windSpeed, state.settings.language, 0)} km/h`;
  elements.uvThresholdValue.textContent = formatDecimal(alerts.uvIndex, state.settings.language, 0);
}

function updateAlertPreference(key, value) {
  state.settings.alerts = { ...state.settings.alerts, [key]: Number(value) };
  saveSettings(state.settings);
  applySettings();
}

function resetAlertPreferences() {
  state.settings.alerts = defaultAlertPreferences();
  saveSettings(state.settings);
  applySettings();
  showToast(t('alertSettingsReset'));
}

function applySettings() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  elements.unitCBtn.setAttribute('aria-checked', String(state.settings.unit === 'C'));
  elements.unitFBtn.setAttribute('aria-checked', String(state.settings.unit === 'F'));
  elements.unitCBtn.classList.toggle('active', state.settings.unit === 'C');
  elements.unitFBtn.classList.toggle('active', state.settings.unit === 'F');
  updateAlertPreferenceControls();
  updateTranslations();
  updateInstallCard();
  if (state.currentBundle) renderWeather();
  renderSavedLocations();
  renderRecentLocations();
}

function selectUnit(unit, focus = false) {
  state.settings.unit = unit;
  saveSettings(state.settings);
  applySettings();
  if (focus) (unit === 'C' ? elements.unitCBtn : elements.unitFBtn).focus();
}

function setLoading(loading) {
  elements.result.setAttribute('aria-busy', String(loading));
  [elements.searchBtn, elements.locationBtn].forEach(button => { button.disabled = loading; });
  if (loading) {
    elements.result.innerHTML = `
      <div class="loading-state skeleton-state" role="status">
        <span class="loader" aria-hidden="true"></span>
        <strong>${escapeHtml(t('loading'))}</strong>
        <div class="skeleton-card" aria-hidden="true">
          <span></span>
          <b></b>
          <i></i>
          <i></i>
        </div>
      </div>`;
  }
}

function finishRequest(controller) {
  if (state.requestController !== controller) return;
  state.requestController = null;
  setLoading(false);
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function showNotice(message = '', type = 'info', actions = []) {
  if (!message) {
    elements.notice.hidden = true;
    elements.notice.replaceChildren();
    return;
  }
  elements.notice.hidden = false;
  elements.notice.className = `notice ${type}`;
  const text = document.createElement('span');
  text.textContent = message;
  elements.notice.replaceChildren(text);
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-action';
    button.textContent = action.label;
    button.addEventListener('click', action.callback);
    elements.notice.append(button);
  }
}

function updateInstallCard() {
  const visible = Boolean(state.installPrompt && !state.settings.installHintDismissed);
  if (elements.installCard) elements.installCard.hidden = !visible;
  elements.installBtn.hidden = !state.installPrompt;
}

function dismissInstallCard() {
  state.settings.installHintDismissed = true;
  saveSettings(state.settings);
  updateInstallCard();
}

function describeDataError(error, fallbackKey = 'dataError') {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  if (name === 'TimeoutError' || message.includes('timeout') || message.includes('timed out')) {
    return t('dataErrorTimeout');
  }
  if (name === 'TypeError' || message.includes('network') || message.includes('failed to fetch')) {
    return t('dataErrorNetwork');
  }
  if (message.includes('photon') || message.includes('geocode') || message.includes('geocod')) {
    return t('dataErrorGeocode');
  }
  if (message.includes('ipwho') || message.includes('ip location')) {
    return t('dataErrorIp');
  }
  if (message.includes('open-meteo') || message.includes('forecast') || message.includes('air-quality')) {
    return t('dataErrorForecast');
  }
  return t(fallbackKey);
}

function renderError(message, retryAction = null) {
  state.retryAction = retryAction;
  elements.result.innerHTML = `
    <div class="error-state" role="alert">
      <span aria-hidden="true">!</span>
      <h2>${escapeHtml(message)}</h2>
      ${retryAction ? `<button id="retryBtn" class="primary-button" type="button">${escapeHtml(t('retry'))}</button>` : ''}
    </div>`;
  document.getElementById('retryBtn')?.addEventListener('click', () => state.retryAction?.());
}

function locationIdentity(location) {
  return location.id || `${normalizeForSearch(location.name)}|${normalizeForSearch(location.admin1)}`;
}

function normalizedLocation(location) {
  return { ...location, id: locationIdentity(location) };
}

function savedLocationIds(locations) {
  return locations.map(location => location.id).sort().join('|');
}

function clearSavedComparison() {
  state.comparisonController?.abort();
  state.comparisonController = null;
  state.comparisonResults = [];
  state.comparisonLocationIds = '';
  state.comparisonFetchedAt = 0;
  elements.comparisonResults.hidden = true;
  elements.comparisonResults.replaceChildren();
}

function renderSavedComparison() {
  const saved = getSavedLocations();
  const currentIds = savedLocationIds(saved);
  if (!state.comparisonResults.length || state.comparisonLocationIds !== currentIds) {
    elements.comparisonResults.hidden = true;
    elements.comparisonResults.replaceChildren();
    return;
  }
  elements.comparisonResults.hidden = false;
  elements.comparisonResults.innerHTML = `
    <section class="comparison-panel" aria-labelledby="comparisonHeading">
      <div class="section-heading compact-heading">
        <h3 id="comparisonHeading">${escapeHtml(t('comparisonTitle'))}</h3>
      </div>
      <div class="comparison-grid">
        ${state.comparisonResults.map(({ location, weather }) => {
          const current = weather?.current || {};
          return `<article class="comparison-card">
            <strong>${escapeHtml(location.label)}</strong>
            <span class="comparison-condition">${weatherIcon(current.weather_code, current.is_day)} ${escapeHtml(weatherLabel(current.weather_code, state.settings.language))}</span>
            <b>${escapeHtml(formatTemperature(current.temperature_2m, state.settings.unit))}</b>
            <small>${escapeHtml(t('wind'))} ${escapeHtml(formatDecimal(current.wind_speed_10m, state.settings.language))} km/h</small>
          </article>`;
        }).join('')}
      </div>
    </section>`;
}

async function compareSavedLocations() {
  const saved = getSavedLocations();
  if (saved.length < 2) {
    showToast(t('comparisonUnavailable'));
    return;
  }
  const ids = savedLocationIds(saved);
  const hasFreshComparison = state.comparisonResults.length
    && state.comparisonLocationIds === ids
    && Date.now() - state.comparisonFetchedAt < 10 * 60 * 1000;
  if (hasFreshComparison) {
    renderSavedComparison();
    return;
  }
  state.comparisonController?.abort();
  const controller = new AbortController();
  state.comparisonController = controller;
  elements.compareSavedBtn.disabled = true;
  elements.compareSavedBtn.textContent = t('comparisonLoading');
  try {
    const responses = await Promise.allSettled(saved.map(async location => ({
      location,
      weather: await fetchWeatherSummary(location.latitude, location.longitude, controller.signal),
    })));
    if (state.comparisonController !== controller) return;
    const results = responses
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    if (!results.length) throw new Error('Comparison data unavailable');
    state.comparisonResults = results;
    state.comparisonLocationIds = ids;
    state.comparisonFetchedAt = Date.now();
    renderSavedComparison();
  } catch (error) {
    if (error.name !== 'AbortError') showNotice(t('comparisonDataError'), 'error');
  } finally {
    if (state.comparisonController === controller) {
      state.comparisonController = null;
      elements.compareSavedBtn.disabled = false;
      elements.compareSavedBtn.textContent = t('compareSaved');
    }
  }
}

function renderRecentLocations() {
  const recent = getRecent();
  elements.recentSection.hidden = recent.length === 0;
  elements.recentList.innerHTML = recent.map(location => `
    <button class="location-chip recent-chip" type="button" data-recent-id="${escapeHtml(location.id)}">${escapeHtml(location.label)}</button>`).join('');

  elements.recentList.querySelectorAll('[data-recent-id]').forEach(button => {
    button.addEventListener('click', () => {
      const location = recent.find(item => item.id === button.dataset.recentId);
      if (location) openWeather(location, { addToRecent: false });
    });
  });
}

function removeSavedById(id) {
  removeSavedLocation(id);
  if (state.settings.defaultLocationId === id) {
    state.settings.defaultLocationId = null;
    saveSettings(state.settings);
  }
  clearSavedComparison();
  renderSavedLocations();
}

function renderSavedLocations() {
  const saved = getSavedLocations();
  const currentId = state.currentLocation?.id || null;
  const currentIsSaved = saved.some(location => location.id === currentId);
  elements.savedSection.hidden = saved.length === 0 && !state.currentLocation;
  elements.saveCurrentBtn.hidden = !state.currentLocation;
  elements.compareSavedBtn.hidden = saved.length < 2;
  elements.saveCurrentBtn.textContent = t(currentIsSaved ? 'removeCurrentLocation' : 'saveCurrentLocation');
  elements.saveCurrentBtn.setAttribute('aria-pressed', String(currentIsSaved));
  elements.savedEmpty.hidden = saved.length > 0;
  elements.savedList.innerHTML = saved.map(location => {
    const isDefault = state.settings.defaultLocationId === location.id;
    return `<div class="saved-location">
      <button class="location-chip saved-chip" type="button" data-saved-id="${escapeHtml(location.id)}">${escapeHtml(location.label)}</button>
      <button class="chip-action default-action ${isDefault ? 'active' : ''}" type="button" data-default-id="${escapeHtml(location.id)}" aria-pressed="${isDefault}" aria-label="${escapeHtml(t(isDefault ? 'clearDefaultLocation' : 'makeDefaultLocation', { location: location.label }))}" title="${escapeHtml(t(isDefault ? 'clearDefaultLocation' : 'makeDefaultLocation', { location: location.label }))}">&#9733;</button>
      <button class="chip-action remove-action" type="button" data-remove-saved-id="${escapeHtml(location.id)}" aria-label="${escapeHtml(t('removeSavedLocation', { location: location.label }))}" title="${escapeHtml(t('removeSavedLocation', { location: location.label }))}">&times;</button>
    </div>`;
  }).join('');

  elements.savedList.querySelectorAll('[data-saved-id]').forEach(button => {
    button.addEventListener('click', () => {
      const location = saved.find(item => item.id === button.dataset.savedId);
      if (location) {
        elements.cityInput.value = location.label;
        openWeather(location, { addToRecent: false });
      }
    });
  });
  elements.savedList.querySelectorAll('[data-default-id]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.defaultId;
      const clearing = state.settings.defaultLocationId === id;
      state.settings.defaultLocationId = clearing ? null : id;
      saveSettings(state.settings);
      renderSavedLocations();
      showToast(t(clearing ? 'defaultLocationCleared' : 'defaultLocationSet'));
    });
  });
  elements.savedList.querySelectorAll('[data-remove-saved-id]').forEach(button => {
    button.addEventListener('click', () => removeSavedById(button.dataset.removeSavedId));
  });
  renderSavedComparison();
}

function toggleCurrentLocationSaved() {
  if (!state.currentLocation) return;
  const isSaved = getSavedLocations().some(location => location.id === state.currentLocation.id);
  if (isSaved) {
    removeSavedById(state.currentLocation.id);
    showToast(t('locationRemoved'));
  } else {
    addSavedLocation(state.currentLocation);
    clearSavedComparison();
    renderSavedLocations();
    showToast(t('locationSaved'));
  }
}

function renderSuggestions(items, query) {
  elements.suggestions.replaceChildren();
  elements.cityInput.setAttribute('aria-expanded', String(items.length > 0));
  if (!items.length) elements.cityInput.removeAttribute('aria-activedescendant');
  const normalizedQuery = normalizeForSearch(query);
  for (const [index, item] of items.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.id = `suggestion-${index}`;
    const name = document.createElement('strong');
    if (normalizeForSearch(item.name).includes(normalizedQuery)) {
      const mark = document.createElement('mark');
      mark.className = 'match';
      mark.textContent = item.name;
      name.append(mark);
    } else {
      name.textContent = item.name;
    }
    const province = document.createElement('span');
    province.textContent = item.admin1;
    button.append(name, province);
    button.addEventListener('click', () => selectLocation(item));
    button.addEventListener('focus', () => {
      elements.suggestions.querySelectorAll('[role="option"]').forEach(option => option.setAttribute('aria-selected', 'false'));
      button.setAttribute('aria-selected', 'true');
      elements.cityInput.setAttribute('aria-activedescendant', button.id);
    });
    button.addEventListener('keydown', event => navigateSuggestions(event, button));
    elements.suggestions.append(button);
  }
}

function navigateSuggestions(event, button) {
  if (event.key === 'ArrowDown' && button.nextElementSibling) {
    event.preventDefault();
    button.nextElementSibling.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    (button.previousElementSibling || elements.cityInput).focus();
  } else if (event.key === 'Escape') {
    renderSuggestions([], '');
    elements.cityInput.focus();
  }
}

function selectLocation(location) {
  elements.cityInput.value = location.label;
  renderSuggestions([], '');
  elements.cityInput.removeAttribute('aria-activedescendant');
  openWeather(location);
}

async function handleSearch() {
  if (state.locationLookupInProgress) return;
  const query = elements.cityInput.value.trim();
  if (!query) return;
  if (state.districtIndexLoading && state.districtIndexPromise) {
    setLoading(true);
    try {
      await state.districtIndexPromise;
    } finally {
      setLoading(false);
    }
  }
  let location = findDistrict(query, state.settings.language);
  if (!location && hasAmbiguousDistrictName(query)) {
    renderSuggestions(searchDistricts(query, state.settings.language), query);
    showNotice(t('ambiguousLocation'), 'warning');
    elements.cityInput.focus();
    return;
  }
  renderSuggestions([], '');
  if (!location) {
    setLoading(true);
    const controller = new AbortController();
    state.requestController?.abort();
    state.requestController = controller;
    try {
      location = await searchRemoteLocation(query, state.settings.language, controller.signal);
    } catch (error) {
      if (error.name === 'AbortError') return;
      renderError(describeDataError(error, 'dataErrorGeocode'), handleSearch);
      return;
    } finally {
      finishRequest(controller);
    }
  }
  if (!location) {
    renderError(t('locationNotFound'));
    return;
  }
  elements.cityInput.value = location.label;
  await openWeather(location);
}

function showCachedWeather(cached, options = {}) {
  if (!cached?.payload) return false;
  state.currentLocation = cached.payload.location;
  state.currentBundle = cached.payload.bundle;
  state.currentFetchedAt = Date.parse(cached.savedAt) || 0;
  state.currentIsCached = true;
  elements.cityInput.value = state.currentLocation.label;
  saveLastLocation(state.currentLocation);
  renderWeather();
  renderSavedLocations();
  renderRecentLocations();
  if (options.notice !== false) {
    showNotice(t('cached', { time: formatLocalTime(cached.savedAt, state.settings.language) }), 'warning');
  }
  return true;
}

async function openWeather(location, options = {}) {
  const safeLocation = normalizedLocation(location);
  state.requestController?.abort();
  const controller = new AbortController();
  state.requestController = controller;
  if (!options.silent) {
    setLoading(true);
    showNotice();
  }
  try {
    const bundle = await fetchWeatherBundle(safeLocation.latitude, safeLocation.longitude, controller.signal);
    state.currentLocation = safeLocation;
    state.currentBundle = bundle;
    state.currentFetchedAt = Date.now();
    state.currentIsCached = false;
    renderSuggestions([], '');
    saveWeatherCache(cacheKey(safeLocation.latitude, safeLocation.longitude), { location: safeLocation, bundle });
    saveLastLocation(safeLocation);
    if (options.addToRecent !== false) addRecent(safeLocation);
    renderWeather();
    renderSavedLocations();
    renderRecentLocations();
  } catch (error) {
    if (error.name === 'AbortError') return;
    const cached = getWeatherCache(cacheKey(safeLocation.latitude, safeLocation.longitude));
    if (cached?.payload) {
      showCachedWeather(cached);
    } else if (!options.silent) {
      renderError(describeDataError(error, 'dataErrorForecast'), () => openWeather(safeLocation, options));
    }
  } finally {
    finishRequest(controller);
  }
}

function hourlyIndexesForDate(weather, date) {
  const hourly = weather.hourly || {};
  const currentTime = weather.current?.time || '';
  const currentDate = currentTime.slice(0, 10);
  return date === currentDate
    ? (hourly.time || [])
      .map((value, index) => value >= currentTime ? index : -1)
      .filter(index => index >= 0)
      .slice(0, 24)
    : (hourly.time || [])
      .map((value, index) => value.startsWith(date) ? index : -1)
      .filter(index => index >= 0);
}

function hourlyDataForDate(weather, date) {
  const hourly = weather.hourly || {};
  const indexes = hourlyIndexesForDate(weather, date);
  return Object.fromEntries(Object.entries(hourly).map(([key, values]) => [
    key,
    Array.isArray(values) ? indexes.map(index => values[index]) : values,
  ]));
}

function metric(icon, label, value, detail = '') {
  return `<article class="metric-card">
    <span class="metric-icon" aria-hidden="true">${icon}</span>
    <span class="metric-label">${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
  </article>`;
}

function formatCoordinates(location, language) {
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';
  const digits = location.source === 'ip-approx' ? 2 : 4;
  const latitude = Number(location.latitude).toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const longitude = Number(location.longitude).toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${latitude}, ${longitude}`;
}

function weatherAlertDetail(alert, language, unit) {
  const value = alert.value;
  if (alert.type === 'strongWind') {
    return t('alertStrongWindBody', { value: `${formatDecimal(value, language)} km/h` });
  }
  if (alert.type === 'heavyRain') {
    const rainValue = Number.isFinite(Number(value))
      ? `${formatDecimal(value, language)} mm/h`
      : t('alertHeavyRainFallback');
    return t('alertHeavyRainBody', { value: rainValue });
  }
  if (alert.type === 'rainChance') {
    return t('alertRainChanceBody', { value: formatPercentage(value, language) });
  }
  if (alert.type === 'heat') {
    return t('alertHeatBody', { value: formatTemperature(value, unit) });
  }
  if (alert.type === 'frost') {
    return t('alertFrostBody', { value: formatTemperature(value, unit) });
  }
  if (alert.type === 'uv') {
    return t('alertUvBody', { value: formatDecimal(value, language) });
  }
  if (alert.type === 'airQuality') {
    return t('alertAirQualityBody', { value: formatDecimal(value, language) });
  }
  return t(`alert${alert.type[0].toUpperCase()}${alert.type.slice(1)}Body`);
}

function renderAlerts(weather, airQuality, language, unit) {
  const alerts = buildWeatherAlerts(weather, airQuality, state.settings.alerts);
  const icons = {
    thunderstorm: '!', heavyRain: 'R', rainChance: '%', snow: '*', strongWind: 'W',
    heat: 'H', frost: 'F', uv: 'UV', airQuality: 'AQ',
  };
  const cards = alerts.length
    ? alerts.map(alert => `<article class="weather-alert ${alert.severity}">
        <span class="alert-icon" aria-hidden="true">${icons[alert.type]}</span>
        <div>
          <strong>${escapeHtml(t(`alert${alert.type[0].toUpperCase()}${alert.type.slice(1)}Title`))}</strong>
          <p>${escapeHtml(weatherAlertDetail(alert, language, unit))}</p>
        </div>
      </article>`).join('')
    : `<div class="alerts-clear"><span aria-hidden="true">&#10003;</span><p>${escapeHtml(t('noForecastRisks'))}</p></div>`;

  return `<section class="alerts-panel" aria-labelledby="alertsHeading">
    <div class="section-heading alert-heading">
      <div><span class="eyebrow">24h</span><h2 id="alertsHeading">${escapeHtml(t('weatherAlerts'))}</h2></div>
      <span class="summary-badge">${escapeHtml(t('automaticSummary'))}</span>
    </div>
    <div class="alerts-list">${cards}</div>
    <p class="alerts-disclaimer">${escapeHtml(t('alertsDisclaimer'))} <a href="https://www.mgm.gov.tr/meteouyari/turkiye.aspx" target="_blank" rel="noopener noreferrer">${escapeHtml(t('officialWarnings'))}</a></p>
  </section>`;
}

function nextHourlyIndexes(weather, limit = 24) {
  const hourly = weather?.hourly || {};
  const currentTime = weather?.current?.time || hourly.time?.[0] || '';
  return (hourly.time || [])
    .map((time, index) => time >= currentTime ? index : -1)
    .filter(index => index >= 0)
    .slice(0, limit);
}

function renderDayPlan(weather, airQuality, language, unit) {
  const hourly = weather.hourly || {};
  const indexes = nextHourlyIndexes(weather);
  const daytime = indexes.filter(index => Number(hourly.is_day?.[index]) === 1);
  const candidates = daytime.length ? daytime : indexes;
  const bestIndex = candidates.reduce((best, index) => {
    if (best === null) return index;
    const score = (Number(hourly.precipitation_probability?.[index]) || 0) * 1.8
      + (Number(hourly.wind_speed_10m?.[index]) || 0) * 0.65;
    const bestScore = (Number(hourly.precipitation_probability?.[best]) || 0) * 1.8
      + (Number(hourly.wind_speed_10m?.[best]) || 0) * 0.65;
    return score < bestScore ? index : best;
  }, null);
  const rainPeak = Math.max(0, ...indexes.map(index => Number(hourly.precipitation_probability?.[index]) || 0));
  const umbrellaKey = rainPeak >= state.settings.alerts.rainProbability
    ? 'umbrellaHigh'
    : rainPeak >= Math.max(25, state.settings.alerts.rainProbability - 25)
      ? 'umbrellaMedium'
      : 'umbrellaLow';
  const aqi = Number(airQuality?.current?.european_aqi);
  const adviceKey = !Number.isFinite(aqi)
    ? 'airAdviceUnknown'
    : aqi <= 40
      ? 'airAdviceGood'
      : aqi <= 60
        ? 'airAdviceModerate'
        : 'airAdvicePoor';
  const bestRain = bestIndex === null ? null : hourly.precipitation_probability?.[bestIndex];
  const bestWind = bestIndex === null ? null : hourly.wind_speed_10m?.[bestIndex];

  return `<section class="day-plan" aria-labelledby="dayPlanHeading">
    <div class="section-heading">
      <div><span class="eyebrow">24h</span><h2 id="dayPlanHeading">${escapeHtml(t('dayPlanTitle'))}</h2></div>
      <span class="summary-badge">${escapeHtml(t('dayPlanSubtitle'))}</span>
    </div>
    <div class="day-plan-grid">
      <article class="plan-card">
        <span class="plan-icon" aria-hidden="true">◷</span>
        <span>${escapeHtml(t('bestOutdoorTime'))}</span>
        <strong>${bestIndex === null ? '—' : `${escapeHtml(formatHour(hourly.time?.[bestIndex]))} · ${escapeHtml(formatTemperature(hourly.temperature_2m?.[bestIndex], unit))}`}</strong>
        <small>${escapeHtml(t('dayPlanDetail', {
          rain: formatPercentage(bestRain ?? 0, language),
          wind: `${formatDecimal(bestWind, language)} km/h`,
        }))}</small>
      </article>
      <article class="plan-card">
        <span class="plan-icon" aria-hidden="true">☂</span>
        <span>${escapeHtml(t('umbrella'))}</span>
        <strong>${escapeHtml(t(umbrellaKey))}</strong>
        <small>${escapeHtml(t('probability'))} ${escapeHtml(formatPercentage(rainPeak, language))}</small>
      </article>
      <article class="plan-card">
        <span class="plan-icon" aria-hidden="true">AQ</span>
        <span>${escapeHtml(t('airQualityAdvice'))}</span>
        <strong>${escapeHtml(airQualityLabel(aqi, language))}</strong>
        <small>${escapeHtml(t(adviceKey))}</small>
      </article>
    </div>
  </section>`;
}

function renderAirQualityDetails(airQuality, language) {
  const air = airQuality?.current || {};
  const aqi = Number(air.european_aqi);
  if (!Number.isFinite(aqi) && !Number.isFinite(Number(air.pm2_5)) && !Number.isFinite(Number(air.pm10))) return '';
  const adviceKey = !Number.isFinite(aqi)
    ? 'airAdviceUnknown'
    : aqi <= 40
      ? 'airAdviceGood'
      : aqi <= 60
        ? 'airAdviceModerate'
        : 'airAdvicePoor';
  return `<section class="air-details" aria-labelledby="airDetailsHeading">
    <div><span class="eyebrow">AQ</span><h2 id="airDetailsHeading">${escapeHtml(t('airDetails'))}</h2></div>
    <div class="air-detail-values">
      <span><b>AQI</b> ${escapeHtml(formatDecimal(aqi, language, 0))}</span>
      <span><b>${escapeHtml(t('pm25'))}</b> ${escapeHtml(formatDecimal(air.pm2_5, language))} µg/m³</span>
      <span><b>${escapeHtml(t('pm10'))}</b> ${escapeHtml(formatDecimal(air.pm10, language))} µg/m³</span>
    </div>
    <p>${escapeHtml(t(adviceKey))}</p>
  </section>`;
}

function renderTodayHighlights(weather, language, unit) {
  const daily = weather.daily || {};
  const hourly = weather.hourly || {};
  const indexes = nextHourlyIndexes(weather);
  const rainPeak = Math.max(0, ...indexes.map(index => Number(hourly.precipitation_probability?.[index]) || 0));
  const windPeak = Math.max(0, ...indexes.map(index => Number(hourly.wind_speed_10m?.[index]) || 0));
  const firstSunrise = daily.sunrise?.[0] ? formatHour(daily.sunrise[0]) : '—';
  const firstSunset = daily.sunset?.[0] ? formatHour(daily.sunset[0]) : '—';

  return `<section class="today-strip" aria-label="${escapeHtml(t('todayHighlights'))}">
    <article>
      <span>${escapeHtml(t('todayRange'))}</span>
      <strong>${escapeHtml(formatTemperature(daily.temperature_2m_max?.[0], unit))} / ${escapeHtml(formatTemperature(daily.temperature_2m_min?.[0], unit))}</strong>
    </article>
    <article>
      <span>${escapeHtml(t('peakRain'))}</span>
      <strong>${escapeHtml(formatPercentage(rainPeak, language))}</strong>
    </article>
    <article>
      <span>${escapeHtml(t('peakWind'))}</span>
      <strong>${escapeHtml(formatDecimal(windPeak, language))} km/h</strong>
    </article>
    <article>
      <span>${escapeHtml(t('sunWindow'))}</span>
      <strong>${escapeHtml(firstSunrise)} – ${escapeHtml(firstSunset)}</strong>
    </article>
  </section>`;
}

function renderWeather() {
  const { weather, airQuality } = state.currentBundle;
  const current = weather.current || {};
  const daily = weather.daily || {};
  const location = state.currentLocation;
  const language = state.settings.language;
  const unit = state.settings.unit;
  const air = airQuality?.current || {};
  const condition = weatherLabel(current.weather_code, language);
  const icon = weatherIcon(current.weather_code, current.is_day);
  const updated = formatLocalTime(current.time, language);
  const firstSunrise = daily.sunrise?.[0] ? formatHour(daily.sunrise[0]) : '—';
  const firstSunset = daily.sunset?.[0] ? formatHour(daily.sunset[0]) : '—';
  const badges = [];
  if (state.currentIsCached) badges.push(t('stale'));
  if (['gps-nearest', 'gps-low-accuracy', 'ip-approx'].includes(location.source)) {
    badges.push(t('approximateLocation'));
  }
  const statusBadges = badges.map(label => `<span class="status-badge">${escapeHtml(label)}</span>`).join('');
  const dailyUv = formatDecimal(daily.uv_index_max?.[0], language);
  const uvDetail = dailyUv === '—' ? '' : `${t('dailyMaximum')}: ${dailyUv}`;

  const fetchedAt = state.currentFetchedAt
    ? formatLocalTime(new Date(state.currentFetchedAt).toISOString(), language)
    : updated;
  const dataStatus = state.currentIsCached ? t('savedData') : t('liveData');

  document.body.dataset.weather = weatherTheme(current.weather_code, current.is_day);
  elements.result.innerHTML = `
    <section class="current-card">
      <div class="current-main">
        <div class="current-location">
          <span class="eyebrow">${escapeHtml(t('current'))} ${statusBadges}</span>
          <h2>${escapeHtml(location.label || location.name)}</h2>
          <p>${escapeHtml(condition)} · ${escapeHtml(updated)} · ${escapeHtml(weather.timezone_abbreviation || '')}</p>
        </div>
        <div class="temperature-block">
          <span class="weather-emoji" aria-hidden="true">${icon}</span>
          <strong>${escapeHtml(formatTemperature(current.temperature_2m, unit))}</strong>
          <small>${escapeHtml(t('feelsLike'))} ${escapeHtml(formatTemperature(current.apparent_temperature, unit))}</small>
        </div>
      </div>
    </section>

    ${renderTodayHighlights(weather, language, unit)}

    <section class="forecast-meta" aria-label="${escapeHtml(t('dataInformation'))}">
      <div class="meta-main">
        <span class="data-status ${state.currentIsCached ? 'cached' : 'live'}"><i aria-hidden="true"></i>${escapeHtml(dataStatus)}</span>
        <span><b>${escapeHtml(t('receivedAt'))}:</b> ${escapeHtml(fetchedAt)}</span>
        <span><b>${escapeHtml(t('forecastTime'))}:</b> ${escapeHtml(updated)}</span>
      </div>
      <div class="meta-detail">
        <span>${escapeHtml(t('weatherSource'))}: Open-Meteo</span>
        <span>${escapeHtml(t('coordinates'))}: ${escapeHtml(formatCoordinates(location, language))}</span>
        <span>${escapeHtml(weather.timezone || weather.timezone_abbreviation || '')}</span>
      </div>
    </section>

    <section class="metrics-grid" aria-label="${escapeHtml(t('details'))}">
      ${metric('◒', t('humidity'), `${current.relative_humidity_2m ?? '—'}%`)}
      ${metric('↗', t('wind'), `${current.wind_speed_10m ?? '—'} km/h`, windDirection(current.wind_direction_10m, language))}
      ${metric('≋', t('gust'), `${current.wind_gusts_10m ?? '—'} km/h`)}
      ${metric('●', t('precipitation'), `${current.precipitation ?? 0} mm`)}
      ${metric('☁', t('cloud'), `${current.cloud_cover ?? '—'}%`)}
      ${metric('AQ', t('airQuality'), airQualityLabel(air.european_aqi, language), Number.isFinite(Number(air.european_aqi)) ? `AQI ${air.european_aqi}` : '')}
      ${metric('UV', t('uvIndex'), formatDecimal(air.uv_index, language), uvDetail)}
      ${metric('↑', t('sunrise'), firstSunrise)}
      ${metric('↓', t('sunset'), firstSunset)}
    </section>

    ${renderAlerts(weather, airQuality, language, unit)}

    ${renderDayPlan(weather, airQuality, language, unit)}

    ${renderAirQualityDetails(airQuality, language)}

    <section class="forecast-section">
      <div class="section-heading"><div><span class="eyebrow">24h</span><h2>${escapeHtml(t('hourly'))}</h2></div></div>
      <div class="chart-card">
        <div class="chart-legend" aria-hidden="true">
          <span><i class="legend-line"></i>${escapeHtml(t('temperature'))}</span>
          <span><i class="legend-bar"></i>${escapeHtml(t('probability'))}</span>
        </div>
        <canvas id="hourlyChart" role="img" aria-label="${escapeHtml(t('hourly'))}"></canvas>
      </div>
      <div id="hourlyRows" class="hourly-rows"></div>
      <details class="hourly-table-details">
        <summary>${escapeHtml(t('hourlyTable'))}</summary>
        <div class="hourly-table-scroll">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(t('hour'))}</th>
                <th>${escapeHtml(t('condition'))}</th>
                <th>${escapeHtml(t('temperature'))}</th>
                <th>${escapeHtml(t('probability'))}</th>
                <th>${escapeHtml(t('wind'))}</th>
                <th>${escapeHtml(t('humidity'))}</th>
              </tr>
            </thead>
            <tbody id="hourlyTableBody"></tbody>
          </table>
        </div>
      </details>
    </section>

    <section class="forecast-section">
      <div class="section-heading"><div><span class="eyebrow">${escapeHtml(t('fiveDaysShort'))}</span><h2>${escapeHtml(t('daily'))}</h2></div></div>
      <div class="daily-grid">
        ${(daily.time || []).map((date, index) => `
          <button class="day-card ${index === 0 ? 'active' : ''}" type="button" data-date="${escapeHtml(date)}" aria-pressed="${index === 0}">
            <strong>${escapeHtml(formatDay(date, language))}</strong>
            <span class="day-icon" aria-hidden="true">${weatherIcon(daily.weather_code?.[index], 1)}</span>
            <span><b>${escapeHtml(formatTemperature(daily.temperature_2m_max?.[index], unit))}</b> / ${escapeHtml(formatTemperature(daily.temperature_2m_min?.[index], unit))}</span>
            <small>${escapeHtml(t('probability'))} ${escapeHtml(formatPercentage(daily.precipitation_probability_max?.[index] ?? 0, language))}</small>
            <small>${escapeHtml(t('wind'))} ${escapeHtml(formatDecimal(daily.wind_speed_10m_max?.[index], language))} km/h · UV ${escapeHtml(formatDecimal(daily.uv_index_max?.[index], language, 0))}</small>
          </button>`).join('')}
      </div>
    </section>`;

  const initialDate = current.time?.slice(0, 10) || daily.time?.[0];
  renderHourlySelection(initialDate);
  document.querySelectorAll('.day-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.day-card').forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-pressed', 'true');
      renderHourlySelection(card.dataset.date);
    });
  });
}

function renderHourlySelection(date) {
  if (!date) return;
  const weather = state.currentBundle?.weather || {};
  const canvas = document.getElementById('hourlyChart');
  const label = `${t('hourly')}: ${formatDay(date, state.settings.language)}`;
  canvas?.setAttribute('aria-label', label);
  drawHourlyChartLazy(
    canvas,
    hourlyDataForDate(weather, date),
    state.settings.unit,
    resolvedTheme(),
  );
  renderHourlyRows(date);
}

function renderHourlyRows(date) {
  const weather = state.currentBundle?.weather || {};
  const hourly = weather.hourly || {};
  const indexes = hourlyIndexesForDate(weather, date);
  const container = document.getElementById('hourlyRows');
  const tableBody = document.getElementById('hourlyTableBody');
  if (!container) return;
  container.innerHTML = indexes.map(index => `
    <article class="hour-card">
      <strong>${escapeHtml(formatHour(hourly.time[index]))}</strong>
      <span aria-hidden="true">${weatherIcon(hourly.weather_code?.[index], hourly.is_day?.[index] ?? 1)}</span>
      <b>${escapeHtml(formatTemperature(hourly.temperature_2m?.[index], state.settings.unit))}</b>
      <small>💧 ${escapeHtml(formatPercentage(hourly.precipitation_probability?.[index] ?? 0, state.settings.language))}</small>
      <small>${hourly.relative_humidity_2m?.[index] ?? '—'}%</small>
    </article>`).join('');
  if (tableBody) {
    tableBody.innerHTML = indexes.map(index => `
      <tr>
        <th scope="row">${escapeHtml(formatHour(hourly.time[index]))}</th>
        <td>${weatherIcon(hourly.weather_code?.[index], hourly.is_day?.[index] ?? 1)} ${escapeHtml(weatherLabel(hourly.weather_code?.[index], state.settings.language))}</td>
        <td>${escapeHtml(formatTemperature(hourly.temperature_2m?.[index], state.settings.unit))}</td>
        <td>${escapeHtml(formatPercentage(hourly.precipitation_probability?.[index] ?? 0, state.settings.language))}</td>
        <td>${escapeHtml(formatDecimal(hourly.wind_speed_10m?.[index], state.settings.language))} km/h</td>
        <td>${escapeHtml(hourly.relative_humidity_2m?.[index] ?? '—')}%</td>
      </tr>`).join('');
  }
}

async function handleUseLocation() {
  if (!navigator.geolocation) {
    showNotice(t('locationUnavailable'), 'error');
    return;
  }
  if (state.locationLookupInProgress) return;
  state.locationLookupInProgress = true;
  elements.locationBtn.disabled = true;
  elements.searchBtn.disabled = true;
  showNotice(t('loading'));
  if (state.districtIndexLoading && state.districtIndexPromise) {
    await state.districtIndexPromise;
  }
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      const { latitude, longitude } = position.coords;
      if (!isTurkeyCoordinate(latitude, longitude)) {
        showNotice(t('outsideTurkey'), 'warning');
        return;
      }
      const nearest = nearestDistrict(latitude, longitude, state.settings.language);
      if (nearest?.distanceKm > 150) {
        showNotice(t('outsideTurkey'), 'warning');
        return;
      }
      let address;
      try {
        address = await reverseGeocodeLocation(latitude, longitude, state.settings.language);
      } catch {
        address = null;
      }
      const countryCode = String(address?.countrycode || '').trim().toUpperCase();
      if (address && countryCode && countryCode !== 'TR') {
        showNotice(t('outsideTurkey'), 'warning');
        return;
      }
      if ((!address || !countryCode) && !(nearest && nearest.distanceKm <= 40)) {
        showNotice(t('locationUnavailable'), 'error');
        return;
      }
      const resolved = address ? findDistrictByAddress(address, state.settings.language) : null;
      const location = resolved || nearest || {
        name: state.settings.language === 'tr' ? 'Konumum' : 'My location',
        admin1: '',
        label: state.settings.language === 'tr' ? 'Konumum' : 'My location',
        country: 'Türkiye',
      };
      location.latitude = latitude;
      location.longitude = longitude;
      location.accuracy = Number(position.coords.accuracy) || null;
      location.source = resolved
        ? (location.accuracy > 5000 ? 'gps-low-accuracy' : 'gps-reverse')
        : 'gps-nearest';
      elements.cityInput.value = location.label;
      await openWeather(location);
    } finally {
      state.locationLookupInProgress = false;
      if (!state.requestController) {
        elements.locationBtn.disabled = false;
        elements.searchBtn.disabled = false;
      }
    }
  }, error => {
    state.locationLookupInProgress = false;
    elements.locationBtn.disabled = false;
    elements.searchBtn.disabled = false;
    if (error.code === error.PERMISSION_DENIED) {
      showNotice(t('locationDenied'), 'warning', [{ label: t('allowIp'), callback: () => elements.ipDialog.showModal() }]);
    } else {
      showNotice(t('locationUnavailable'), 'error');
    }
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 });
}

async function useApproximateIpLocation() {
  elements.ipDialog.close();
  setLoading(true);
  const controller = new AbortController();
  try {
    const approximate = await fetchApproximateIpLocation(controller.signal);
    if (!approximate) throw new Error('No IP location');
    const name = approximate.city || t('approximateLocation');
    const admin1 = approximate.region && normalizeForSearch(approximate.region) !== normalizeForSearch(name)
      ? approximate.region
      : '';
    const location = {
      id: `ip|${normalizeForSearch(name)}|${normalizeForSearch(admin1)}`,
      name,
      admin1,
      label: admin1 ? `${name} / ${admin1}` : name,
      country: approximate.country,
      latitude: approximate.latitude,
      longitude: approximate.longitude,
      source: 'ip-approx',
    };
    elements.cityInput.value = location.label;
    await openWeather(location);
  } catch {
    showNotice(t('locationUnavailable'), 'error');
  } finally {
    setLoading(false);
  }
}

function defaultSavedLocation() {
  return getSavedLocations().find(item => item.id === state.settings.defaultLocationId) || null;
}

function cachedEntryForLocation(location) {
  return location ? getWeatherCache(cacheKey(location.latitude, location.longitude)) : null;
}

function preferredCachedWeather() {
  const defaultLocation = defaultSavedLocation();
  const lastLocation = getLastLocation();
  return cachedEntryForLocation(defaultLocation)
    || cachedEntryForLocation(lastLocation)
    || getLatestWeatherCache();
}

function updateConnectionStatus() {
  if (!navigator.onLine) {
    const cached = preferredCachedWeather();
    const text = document.createElement('span');
    text.textContent = cached ? t('offline') : t('offlineNoCache');
    elements.offlineBanner.replaceChildren(text);
    if (cached) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-action';
      button.textContent = t('showSavedForecast');
      button.addEventListener('click', () => showCachedWeather(cached));
      elements.offlineBanner.append(button);
    }
    elements.offlineBanner.hidden = false;
  } else {
    elements.offlineBanner.hidden = true;
    elements.offlineBanner.replaceChildren();
  }
}

function refreshCurrentWeatherIfStale() {
  if (
    !navigator.onLine
    || document.hidden
    || state.requestController
    || state.locationLookupInProgress
    || !state.currentLocation
  ) return;
  const isStale = state.currentIsCached || Date.now() - state.currentFetchedAt >= AUTO_REFRESH_MS;
  if (isStale) openWeather(state.currentLocation, { addToRecent: false, silent: true });
}

async function installApp() {
  if (!state.installPrompt) {
    showToast(t('installUnavailable'));
    return;
  }
  await state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  updateInstallCard();
}

function showUpdateBanner(worker) {
  state.updateWorker = worker;
  elements.updateBanner.hidden = false;
}

function requestAppUpdate() {
  if (!state.updateWorker) return;
  state.updateRequested = true;
  elements.updateNowBtn.disabled = true;
  elements.updateNowBtn.textContent = t('updating');
  state.updateWorker.postMessage({ type: 'SKIP_WAITING' });
}

function scheduleServiceWorkerRegistration() {
  const register = () => { registerServiceWorker(); };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(register, { timeout: 1800 });
  } else {
    window.setTimeout(register, 500);
  }
}

function bindEvents() {
  elements.searchForm.addEventListener('submit', event => { event.preventDefault(); handleSearch(); });
  elements.cityInput.addEventListener('input', debounce(event => {
    renderSuggestions(searchDistricts(event.target.value, state.settings.language), event.target.value);
  }));
  elements.cityInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      const first = elements.suggestions.querySelector('.suggestion-item');
      if (first) { event.preventDefault(); first.focus(); }
    } else if (event.key === 'Escape') {
      renderSuggestions([], '');
    }
  });
  elements.clearBtn.addEventListener('click', () => {
    elements.cityInput.value = '';
    renderSuggestions([], '');
    elements.cityInput.focus();
  });
  elements.locationBtn.addEventListener('click', handleUseLocation);
  elements.unitCBtn.addEventListener('click', () => selectUnit('C'));
  elements.unitFBtn.addEventListener('click', () => selectUnit('F'));
  elements.unitCBtn.parentElement.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const units = ['C', 'F'];
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
    const currentIndex = units.indexOf(state.settings.unit);
    selectUnit(units[(currentIndex + direction + units.length) % units.length], true);
  });
  elements.themeBtn.addEventListener('click', () => {
    state.settings.theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
    saveSettings(state.settings);
    applySettings();
  });
  elements.languageBtn.addEventListener('click', () => {
    state.settings.language = state.settings.language === 'tr' ? 'en' : 'tr';
    saveSettings(state.settings);
    applySettings();
  });
  elements.saveCurrentBtn.addEventListener('click', toggleCurrentLocationSaved);
  elements.compareSavedBtn.addEventListener('click', compareSavedLocations);
  [
    ['rainProbability', elements.rainThreshold],
    ['windSpeed', elements.windThreshold],
    ['uvIndex', elements.uvThreshold],
  ].forEach(([key, input]) => {
    input.addEventListener('input', () => updateAlertPreference(key, input.value));
    input.addEventListener('change', () => showToast(t('alertSettingsSaved')));
  });
  elements.resetAlertSettingsBtn.addEventListener('click', resetAlertPreferences);
  elements.clearRecentBtn.addEventListener('click', () => { clearRecent(); renderRecentLocations(); });
  elements.helpBtn.addEventListener('click', () => elements.helpDialog.showModal());
  elements.allowIpBtn.addEventListener('click', useApproximateIpLocation);
  elements.installBtn.addEventListener('click', installApp);
  elements.installCardBtn?.addEventListener('click', installApp);
  elements.installDismissBtn?.addEventListener('click', dismissInstallCard);
  elements.updateNowBtn.addEventListener('click', requestAppUpdate);
  elements.updateLaterBtn.addEventListener('click', () => { elements.updateBanner.hidden = true; });
  window.addEventListener('online', () => {
    updateConnectionStatus();
    showToast(t('backOnline'));
    refreshCurrentWeatherIfStale();
  });
  window.addEventListener('offline', updateConnectionStatus);
  document.addEventListener('visibilitychange', refreshCurrentWeatherIfStale);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    updateInstallCard();
  });
  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    updateInstallCard();
    showToast(t('installed'));
  });
  document.addEventListener('click', event => {
    if (!elements.suggestions.contains(event.target) && event.target !== elements.cityInput) renderSuggestions([], '');
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (state.updateRequested) location.reload();
    });
    state.serviceWorkerRegistration = await navigator.serviceWorker.register(
      './service-worker.js?v=20260825-1',
      { updateViaCache: 'none' },
    );
    const watchInstallingWorker = worker => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(worker);
        }
      });
    };
    if (state.serviceWorkerRegistration.waiting) {
      showUpdateBanner(state.serviceWorkerRegistration.waiting);
    }
    state.serviceWorkerRegistration.addEventListener('updatefound', () => {
      const worker = state.serviceWorkerRegistration.installing;
      if (worker) watchInstallingWorker(worker);
    });
    await state.serviceWorkerRegistration.update();
  } catch {
    // PWA features are optional; core weather search remains available.
  }
}

async function restoreInitialWeather() {
  const locationAction = new URLSearchParams(location.search).get('action') === 'location';
  const defaultLocation = defaultSavedLocation();
  const lastLocation = getLastLocation();
  const preferredLocation = defaultLocation || lastLocation;
  const preferredCache = cachedEntryForLocation(preferredLocation);

  if (locationAction) {
    handleUseLocation();
  } else if (preferredCache?.payload) {
    showCachedWeather(preferredCache, { notice: !navigator.onLine });
    if (navigator.onLine && preferredLocation) {
      openWeather(preferredLocation, { addToRecent: false, silent: true });
    }
  } else if (navigator.onLine && preferredLocation) {
    elements.cityInput.value = preferredLocation.label;
    await openWeather(preferredLocation, { addToRecent: false });
  } else if (!navigator.onLine) {
    showCachedWeather(getLatestWeatherCache());
  }
}

function initialize() {
  applySettings();
  bindEvents();
  updateConnectionStatus();
  renderSavedLocations();
  renderRecentLocations();
  state.districtIndexPromise = loadDistrictIndex()
    .then(() => {
      const query = elements.cityInput.value;
      if (query) renderSuggestions(searchDistricts(query, state.settings.language), query);
    })
    .catch(() => {
      showNotice(t('searchDataError'), 'error');
    })
    .finally(() => {
      state.districtIndexLoading = false;
    });
  scheduleServiceWorkerRegistration();
  restoreInitialWeather();
  setInterval(refreshCurrentWeatherIfStale, AUTO_REFRESH_MS);
}

initialize();
