/* EduTrack cloud migration bridge.
 * JWT is intentionally kept only in this module's memory and is never persisted.
 */
(function (window) {
  'use strict';
  var token = null;
  var user = null;
  var CACHE_CONFIG = 'ems_config';
  var CACHE_PREFIX = 'edutrack_cloud_students:';

  function jsonCacheGet(key, fallback) { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
  function jsonCacheSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function schoolCode() { return String((window.CONFIG && (CONFIG.schoolNo || CONFIG.schoolCode)) || '').trim(); }
  function headers(extra) { var result = Object.assign({ 'Content-Type': 'application/json' }, extra || {}); if (token) result.Authorization = 'Bearer ' + token; return result; }
  async function request(url, options) {
    var response = await fetch(url, Object.assign({ credentials: 'same-origin', headers: headers() }, options || {}));
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) { var error = new Error(body.error || 'Cloud request failed'); error.status = response.status; throw error; }
    return body;
  }
  function cacheKey(params) { return CACHE_PREFIX + [params.className, params.form, params.year, params.term].map(String).join('|'); }
  async function login(credentials) { var result = await request('/api/login', { method: 'POST', body: JSON.stringify(credentials) }); token = result.token; user = result.user || null; return result; }
  function logout() { token = null; user = null; }
  function isAuthenticated() { return Boolean(token); }
  async function loadConfig() {
    var code = schoolCode();
    if (!code) return jsonCacheGet(CACHE_CONFIG, null);
    try { var result = await request('/api/config?schoolCode=' + encodeURIComponent(code)); jsonCacheSet(CACHE_CONFIG, result); return result; }
    catch (_) { return jsonCacheGet(CACHE_CONFIG, null); }
  }
  async function saveConfig(config) {
    var next = Object.assign({}, config, { schoolCode: config.schoolCode || schoolCode() });
    jsonCacheSet(CACHE_CONFIG, next);
    return request('/api/config', { method: 'POST', body: JSON.stringify(next) });
  }
  async function getStudents(params) {
    var p = Object.assign({ schoolCode: schoolCode() }, params || {});
    var query = new URLSearchParams({ schoolCode: p.schoolCode, class: p.className || p.class || '', form: p.form || '', year: String(p.year || ''), term: p.term || '' });
    try { var result = await request('/api/students?' + query.toString()); jsonCacheSet(cacheKey(p), result.students || []); return result.students || []; }
    catch (_) { return jsonCacheGet(cacheKey(p), []); }
  }
  async function saveStudent(params, student) {
    var p = Object.assign({ schoolCode: schoolCode() }, params || {}); var key = cacheKey(p); var cached = jsonCacheGet(key, []); var id = student.student_usid;
    var updated = cached.filter(function (item) { return item.student_usid !== id; }).concat([student]); jsonCacheSet(key, updated);
    return request('/api/students', { method: 'POST', body: JSON.stringify({ schoolCode: p.schoolCode, class: p.className || p.class, form: p.form, year: p.year, term: p.term, student: student }) });
  }
  async function sync(options) {
    var cfg = options && options.config || window.CONFIG;
    var summary = { config: false, students: 0, errors: [] };
    try { if (cfg && schoolCode()) { await saveConfig(cfg); summary.config = true; } } catch (e) { summary.errors.push(e.message); }
    var batches = options && options.batches || [];
    if (!batches.length && window.DATA && typeof window.DATA === 'object') {
      var year = cfg && (cfg.year || cfg.academicYear) || new Date().getFullYear();
      var term = cfg && cfg.term || '3rd Term';
      Object.keys(window.DATA).forEach(function (key) {
        var parts = key.split('|');
        var rows = Array.isArray(window.DATA[key]) ? window.DATA[key] : [];
        if (rows.length) batches.push({ className: parts[0], form: parts[1] || 'A', year: year, term: term, students: rows });
      });
    }
    for (var i = 0; i < batches.length; i++) { try { for (var j = 0; j < (batches[i].students || []).length; j++) { await saveStudent(batches[i], batches[i].students[j]); summary.students++; } } catch (e) { summary.errors.push(e.message); } }
    return summary;
  }
  window.EduTrackCloud = { login: login, logout: logout, isAuthenticated: isAuthenticated, getUser: function () { return user; }, loadConfig: loadConfig, saveConfig: saveConfig, getStudents: getStudents, saveStudent: saveStudent, sync: sync };
})(window);
