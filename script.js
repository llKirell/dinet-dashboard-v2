let rawData = [];
let processedData = [];
let currentFilter = "TODOS";

// ── Edición inline de Stage / Estado Carga ───────────────────────────
let stageOverrides = {};
const STAGE_OVERRIDES_KEY = 'dinet_stage_overrides_v1';

function loadStageOverrides() {
  try { stageOverrides = JSON.parse(localStorage.getItem(STAGE_OVERRIDES_KEY) || '{}'); }
  catch (_) { stageOverrides = {}; }
}
function saveStageOverrides() {
  try { localStorage.setItem(STAGE_OVERRIDES_KEY, JSON.stringify(stageOverrides)); }
  catch (_) {}
}
function rowKey(row) {
  return `${String(row.dt || '').trim()}__${String(row.placa || '').trim()}`;
}
function deriveRampaFromStage(stage) {
  if (!stage) return '';
  const m = stage.trim().match(/ST\.0*(\d+)/i);
  if (m) return String(parseInt(m[1], 10));
  const nums = stage.match(/(\d+)/);
  return nums ? String(parseInt(nums[1], 10)) : stage.trim();
}
function deriveEstadoCargaFromStage(stage, finCarga) {
  const fin = String(finCarga || '').toUpperCase().trim();
  if (fin === 'OK' || fin === 'SI' || fin === '✓' || fin === 'LISTO' || fin === 'X' || fin === '1') return 'CARGADO';
  if (stage && stage.trim()) return 'EN_CARGA';
  return 'PENDIENTE';
}
function applyRowOverrides(row) {
  const ov = stageOverrides[rowKey(row)];
  return ov ? { ...row, ...ov } : row;
}
function handleStageEdit(key, newStage, finCarga) {
  if (!newStage) { delete stageOverrides[key]; }
  else {
    stageOverrides[key] = {
      stageDestino: newStage,
      rampa: deriveRampaFromStage(newStage),
      estadoCarga: deriveEstadoCargaFromStage(newStage, finCarga)
    };
  }
  saveStageOverrides();
  render();
}
function handleEstadoCargaEdit(key, newEstado) {
  stageOverrides[key] = { ...(stageOverrides[key] || {}), estadoCarga: newEstado };
  saveStageOverrides();
  render();
}
function initInlineStageEdit() {
  const tbody = document.getElementById('detailTable');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const td = e.target.closest('.stage-editable');
    if (!td || td.querySelector('input')) return;
    const currentVal = td.textContent.trim();
    const key = td.dataset.key;
    const finCarga = td.dataset.fincarga || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentVal;
    input.className = 'stage-input';
    input.placeholder = 'Ej: ST.03.05';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      handleStageEdit(key, input.value.trim().toUpperCase(), finCarga);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { committed = true; render(); }
    });
  });
}
function handleFieldEdit(key, field, value) {
  const trimmed = field === 'placa' ? value.toUpperCase() : value;
  stageOverrides[key] = { ...(stageOverrides[key] || {}), [field]: trimmed };
  saveStageOverrides();
  render();
}

function initInlineFieldEdit() {
  const tbody = document.getElementById('detailTable');
  if (!tbody) return;
  const PLACEHOLDERS = { placa: 'Ej: AKR-892', cita: 'Ej: 08:00' };
  tbody.addEventListener('click', (e) => {
    const td = e.target.closest('.field-editable');
    if (!td || td.querySelector('input')) return;
    const key   = td.dataset.key;
    const field = td.dataset.field;
    const currentVal = td.dataset.rawval || '';
    const input = document.createElement('input');
    input.type        = 'text';
    input.value       = currentVal;
    input.className   = 'stage-input';
    input.placeholder = PLACEHOLDERS[field] || '';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      handleFieldEdit(key, field, input.value.trim());
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { committed = true; render(); }
    });
  });
}

function initInlineCargaEdit() {
  const tbody = document.getElementById('detailTable');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const td = e.target.closest('.carga-editable');
    if (!td || td.querySelector('select')) return;
    if (td.dataset.canEdit !== '1') return;
    const key = td.dataset.key;
    const currentEstado = td.dataset.estado || 'PENDIENTE';
    const select = document.createElement('select');
    select.className = 'carga-select';
    [{ value: 'PENDIENTE', label: 'PENDIENTE' }, { value: 'EN_CARGA', label: 'EN CARGA' }, { value: 'CARGADO', label: 'CARGADO' }]
      .forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        if (value === currentEstado) opt.selected = true;
        select.appendChild(opt);
      });
    td.innerHTML = '';
    td.appendChild(select);
    select.focus();
    select.addEventListener('change', () => handleEstadoCargaEdit(key, select.value));
    select.addEventListener('blur', () => render());
  });
}
function findColKey(sampleRow, alternatives) {
  for (const key of alternatives) {
    if (Object.prototype.hasOwnProperty.call(sampleRow, key)) return key;
  }
  const lowerAlts = alternatives.map(a => String(a).toLowerCase().trim());
  for (const key of Object.keys(sampleRow)) {
    if (lowerAlts.includes(String(key).toLowerCase().trim())) return key;
  }
  return alternatives[0];
}
// ── File System Access API — manejo de handle persistente ────────────
const FS_DB = 'dinet_fs_db', FS_STORE = 'handles', FS_KEY = 'bd_file';

function openFsDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(FS_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(FS_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function getStoredHandle() {
  try {
    const db = await openFsDb();
    return await new Promise(res => {
      const req = db.transaction(FS_STORE).objectStore(FS_STORE).get(FS_KEY);
      req.onsuccess = () => res(req.result || null);
      req.onerror   = () => res(null);
    });
  } catch { return null; }
}
async function storeHandle(handle) {
  try {
    const db = await openFsDb();
    await new Promise(res => {
      const tx = db.transaction(FS_STORE, 'readwrite');
      handle ? tx.objectStore(FS_STORE).put(handle, FS_KEY)
             : tx.objectStore(FS_STORE).delete(FS_KEY);
      tx.oncomplete = res;
    });
  } catch {}
}

function showToast(msg, isError = false) {
  document.querySelectorAll('.save-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'save-toast' + (isError ? ' save-toast-error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

function buildWorkbook() {
  const sample    = rawData[0];
  const dtCol     = findColKey(sample, ["DT", "dt", "Nro_DT", "Documento", "NRO DT"]);
  const placaCol  = findColKey(sample, ["Placa", "PLACA", "placa", "PLACA CAMION", "Placa Camion"]);
  const stageCol  = findColKey(sample, ["Stage_Destino", "Stage Destino", "STAGE_DESTINO", "Stage"]);
  const rampaCol  = findColKey(sample, ["Rampa", "RAMPA", "RAMPAS", "rampas", "Rampas"]);
  const estadoCol = findColKey(sample, ["Estado_Carga", "Estado Carga", "ESTADO_CARGA", "Carga", "CARGA"]);
  const citaCol   = findColKey(sample, ["Cita", "CITA", "cita", "Hora_Cita"]);
  let filled = 0;
  const updatedRows = rawData.map(rawRow => {
    const dt    = String(rawRow[dtCol]    || '').trim();
    const placa = String(rawRow[placaCol] || '').trim().toUpperCase();
    const ov    = stageOverrides[`${dt}__${placa}`];
    if (!ov) return rawRow;
    const row = { ...rawRow };
    let changed = false;
    // Solo rellena blancos (datos que venían vacíos del sistema):
    if (ov.stageDestino && !String(row[stageCol] || '').trim()) { row[stageCol] = ov.stageDestino; changed = true; }
    if (ov.rampa        && !String(row[rampaCol]  || '').trim()) { row[rampaCol]  = ov.rampa;        changed = true; }
    if (ov.estadoCarga  && !String(row[estadoCol] || '').trim()) { row[estadoCol] = ov.estadoCarga;  changed = true; }
    // Siempre sobreescribe (correcciones del operador):
    if (ov.placa !== undefined) { row[placaCol] = ov.placa; changed = true; }
    if (ov.cita  !== undefined) { row[citaCol]  = ov.cita;  changed = true; }
    if (changed) filled++;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(updatedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Embarques');
  return { wb, filled };
}

// ── Auto-guardado cada 2 minutos ─────────────────────────────────────
const AUTO_SAVE_BD_MS = 2 * 60 * 1000;
let autoSaveTimer    = null;
let cachedFileHandle = null; // handle en memoria para evitar IndexedDB en cada ciclo

function setAutoSaveUI(active, lastTime = '') {
  const dot  = document.getElementById('autoSaveDot');
  const lbl  = document.getElementById('autoSaveLabel');
  if (dot) dot.classList.toggle('auto-save-active', active);
  if (lbl) lbl.textContent = active ? (lastTime ? `BD · ${lastTime}` : 'BD · auto') : 'Guardar en BD';
}

async function writeToHandle(handle, wb) {
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') return false;
  const buffer   = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const writable = await handle.createWritable();
  await writable.write(new Blob([buffer]));
  await writable.close();
  return true;
}

async function autoSave() {
  if (!rawData.length || !cachedFileHandle) return;
  try {
    const { wb, filled } = buildWorkbook();
    const ok = await writeToHandle(cachedFileHandle, wb);
    if (!ok) return; // permiso expiró — esperar a que el usuario haga clic
    const now = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    setAutoSaveUI(true, now);
    showToast(`Auto-guardado ${now} · ${filled} fila(s) guardada(s)`);
  } catch {
    // Handle obsoleto — detener auto-save y pedir al usuario que reconfigure
    cachedFileHandle = null;
    await storeHandle(null);
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
    setAutoSaveUI(false);
    showToast('Auto-guardado detenido: archivo no accesible. Haz clic en "Guardar en BD".', true);
  }
}

function startAutoSave(handle) {
  cachedFileHandle = handle;
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(autoSave, AUTO_SAVE_BD_MS);
  setAutoSaveUI(true);
}

async function saveToDatabase(forceNewFile = false) {
  if (!rawData.length) { showToast('No hay datos. Carga un Excel primero.', true); return; }
  const { wb, filled } = buildWorkbook();

  if ('showSaveFilePicker' in window) {
    let handle = forceNewFile ? null : (cachedFileHandle || await getStoredHandle());

    if (!handle) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: 'dinet_embarques_data.xlsx',
          types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
        });
        await storeHandle(handle);
      } catch (e) {
        if (e.name === 'AbortError') return;
        XLSX.writeFile(wb, 'dinet_embarques_data.xlsx');
        showToast(`Descargado · ${filled} fila(s) actualizada(s)`);
        return;
      }
    }

    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { showToast('Sin permiso para escribir.', true); return; }

      await writeToHandle(handle, wb);
      const now = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      showToast(`✓ Guardado en "${handle.name}" · ${filled} fila(s) · ${now}`);
      startAutoSave(handle); // ← activa / reinicia el timer de 2 min
    } catch {
      cachedFileHandle = null;
      await storeHandle(null);
      showToast('Archivo no encontrado. Clic de nuevo para elegir destino.', true);
    }
  } else {
    XLSX.writeFile(wb, 'dinet_embarques_data.xlsx');
    showToast(`Descargado · ${filled} fila(s) actualizada(s)`);
  }
}

const AUTO_DATA_PATHS = ["data/latest.xlsx", "./data/latest.xlsx"];
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const API_BASE_STORAGE_KEY = "dinet_api_base_url_v1";

function getStoredApiBaseUrl() {
  try {
    return localStorage.getItem(API_BASE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredApiBaseUrl(value) {
  try {
    if (value) localStorage.setItem(API_BASE_STORAGE_KEY, value);
    else localStorage.removeItem(API_BASE_STORAGE_KEY);
  } catch {}
}

function normalizeApiEndpoint(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/dashboard-rows(?:[/?#]|$)/i.test(value)) return value;

  const base = value.replace(/\/+$/, "");
  if (/\/api(?:\/v\d+)?$/i.test(base)) return `${base}/dashboard-rows`;
  return `${base}/api/dashboard-rows`;
}

function buildApiDataPaths() {
  const params = new URLSearchParams(window.location.search);
  const queryApi = params.get("api") || "";
  const metaApi = document.querySelector('meta[name="dinet-api-url"]')?.content || "";
  const hasExplicitApi = Boolean(queryApi.trim() || metaApi.trim());

  // Mantener base oficial del dashboard (latest.xlsx) por defecto.
  // Solo habilitar endpoints API cuando se indiquen de forma explicita.
  if (!hasExplicitApi) return [];

  if (queryApi.trim()) setStoredApiBaseUrl(queryApi.trim());
  const configuredApi = getStoredApiBaseUrl();

  return [...new Set([
    normalizeApiEndpoint(queryApi),
    normalizeApiEndpoint(configuredApi),
    normalizeApiEndpoint(metaApi)
  ].filter(Boolean))];
}

const API_DATA_PATHS = buildApiDataPaths();

// ── Toggle filtros ───────────────────────────────────────────────
(function initToggle() {
  const btn     = document.getElementById("toggleFiltersBtn");
  const label   = document.getElementById("toggleFiltersLabel");
  const section = document.getElementById("filterSection");
  if (!btn || !section) return;
  btn.addEventListener("click", () => {
    const hidden = section.classList.toggle("filters-hidden");
    btn.classList.toggle("collapsed", hidden);
    label.textContent = hidden ? "Mostrar filtros" : "Ocultar filtros";
  });
})();

function initTableFullscreenToggle() {
  const btn = document.getElementById("toggleTableFullscreenBtn");
  const icon = document.getElementById("toggleTableFullscreenIcon");
  const label = document.getElementById("toggleTableFullscreenLabel");
  if (!btn || !icon || !label) return;

  btn.addEventListener("click", () => {
    const enabled = document.body.classList.toggle("table-fullscreen");
    icon.textContent = enabled ? "▼" : "▲";
    label.textContent = enabled ? "Vista normal" : "Expandir tabla";
  });
}
let currentTableFilter = "TODOS";
let dateFilter = { day: "TODOS", month: "TODOS", year: "TODOS" };
const CLIENT_TYPE_CATALOG = window.CLIENT_TYPE_CATALOG || { codigos: {}, clientes: {}, destinos: {} };

const FILTER_CONFIG = {
  TODOS: { meta: 0.9, theme: "theme-neutral", scope: "Vista consolidada de la operacion" },
  LOCAL: { meta: 0.95, theme: "theme-local", scope: "Registros clasificados como Local" },
  PROVINCIA: { meta: 0.8, theme: "theme-prov", scope: "Registros clasificados como Provincia" }
};

const els = {
  excelInput: document.getElementById("excelInput"),
  emptyState: document.getElementById("emptyState"),
  dashboardContent: document.getElementById("dashboardContent"),
  filterBar: document.getElementById("filterBar"),
  searchInput: document.getElementById("searchInput"),
  lastUpdateText: document.getElementById("lastUpdateText"),
  sectionMeta: document.getElementById("sectionMeta"),
  dayFilter: document.getElementById("dayFilter"),
  monthFilter: document.getElementById("monthFilter"),
  yearFilter: document.getElementById("yearFilter"),
  kpiGrid: document.getElementById("kpiGrid"),
  detailTable: document.getElementById("detailTable"),
  turnoCombinadoBars: document.getElementById("turnoCombinadoBars"),
  tableTitle: document.getElementById("tableTitle"),
  tTabCountTodos: document.getElementById("tTabCountTodos"),
  tTabCountCompleto: document.getElementById("tTabCountCompleto"),
  tTabCountProceso: document.getElementById("tTabCountProceso"),
  tTabCountPendiente: document.getElementById("tTabCountPendiente"),
  tabCountTodos: document.getElementById("tabCountTodos"),
  tabCountLocal: document.getElementById("tabCountLocal"),
  tabCountProvincia: document.getElementById("tabCountProvincia")
};

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.hasAttribute("data-filter")) {
      currentFilter = tab.dataset.filter;
      syncActiveTab();
      render();
    } else if (tab.hasAttribute("data-estado")) {
      currentTableFilter = tab.dataset.estado;
      syncActiveTableTab();
      render();
    }
  });
});

if (els.excelInput) {
  els.excelInput.addEventListener("change", handleExcelUpload);
}
if (els.dayFilter) els.dayFilter.addEventListener("change", handleDateFilterChange);
if (els.monthFilter) els.monthFilter.addEventListener("change", handleDateFilterChange);
if (els.yearFilter) els.yearFilter.addEventListener("change", handleDateFilterChange);
if (els.searchInput) els.searchInput.addEventListener("input", render);

async function loadHostedWorkbook() {
  for (const path of AUTO_DATA_PATHS) {
    try {
      const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true, bookVBA: false });
      const sheetName = workbook.SheetNames.includes("Embarques")
        ? "Embarques"
        : workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
      if (!rows.length) continue;

      loadRows(rows, "latest.xlsx", sheetName);
      if (els.lastUpdateText) {
        els.lastUpdateText.textContent = `Actualizado: ${new Date().toLocaleString("es-PE")} (auto)`;
      }
      return true;
    } catch (_error) {
      // Intentar siguiente ruta
    }
  }
  return false;
}

async function loadRowsFromApi() {
  for (const path of API_DATA_PATHS) {
    try {
      const response = await fetch(`${path}?v=${Date.now()}`, {
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.rows)
          ? payload.rows
          : [];
      if (!rows.length) continue;

      loadRows(rows, "api", "dashboard_rows");
      if (els.lastUpdateText) {
        const src = payload?.source ? ` · ${payload.source}` : "";
        els.lastUpdateText.textContent = `Actualizado: ${new Date().toLocaleString("es-PE")} (API${src})`;
      }
      return true;
    } catch (_error) {
      // probar siguiente endpoint
    }
  }
  return false;
}

window.addEventListener("DOMContentLoaded", async () => {
  initTableFullscreenToggle();
  loadStageOverrides();
  initInlineStageEdit();
  initInlineCargaEdit();
  initInlineFieldEdit();

  // Reactivar auto-save si el handle ya existe y el permiso fue concedido esta sesión
  const storedHandle = await getStoredHandle();
  if (storedHandle) {
    const perm = await storedHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      startAutoSave(storedHandle);
    } else {
      // Permiso expirado: mostrar indicador pero no arrancar — esperar clic manual
      setAutoSaveUI(false);
      const lbl = document.getElementById('autoSaveLabel');
      if (lbl) lbl.textContent = 'Guardar en BD ⚠';
    }
  }

  const fromWorkbook = await loadHostedWorkbook();
  if (!fromWorkbook) await loadRowsFromApi();

  window.setInterval(async () => {
    const okWorkbook = await loadHostedWorkbook();
    if (!okWorkbook) await loadRowsFromApi();
  }, AUTO_REFRESH_MS);
});

async function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const buffer = await file.arrayBuffer();

    // Intento 1: lectura completa con fechas
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: "array", cellDates: true, bookVBA: false });
    } catch (_e1) {
      // Intento 2: sin procesar fechas (funciona con algunos xlsm)
      try {
        workbook = XLSX.read(buffer, { type: "array", cellDates: false, bookVBA: false });
      } catch (_e2) {
        // Intento 3: modo permisivo
        workbook = XLSX.read(buffer, { type: "array", WTF: false });
      }
    }

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("El archivo no contiene hojas de calculo.");
    }

    const sheetName = workbook.SheetNames.includes("Embarques")
      ? "Embarques"
      : workbook.SheetNames[0];

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

    if (rows.length === 0) {
      window.alert(`Se leyó la hoja "${sheetName}" pero está vacía o no tiene encabezados reconocibles.`);
      return;
    }

    loadRows(rows, file.name, sheetName);
  } catch (error) {
    console.error("Error al leer Excel:", error);
    window.alert(
      `No se pudo leer el archivo.\n\n` +
      `Posibles causas:\n` +
      `• El archivo está abierto en Excel (ciérralo primero)\n` +
      `• Es un archivo protegido con contraseña\n` +
      `• El formato no es compatible\n\n` +
      `Detalle: ${error.message || error}`
    );
  } finally {
    event.target.value = "";
  }
}

function loadRows(rows, fileName, sheetName) {
  rawData = rows;
  const normalizedRows = rows
    .map(normalizeRow)
    .filter((row) => row.dt || row.destino || row.solicitado || row.picado);
  processedData = dedupeRowsByDt(normalizedRows);
  dateFilter = { day: "TODOS", month: "TODOS", year: "TODOS" };

  currentFilter = chooseDefaultFilter();
  currentTableFilter = "TODOS";
  syncActiveTab();
  syncActiveTableTab();
  populateDateFilters();

  els.emptyState.classList.add("hidden");
  els.dashboardContent.classList.remove("hidden");
  els.filterBar.classList.remove("hidden");
  els.lastUpdateText.textContent = `Actualizado: ${new Date().toLocaleString("es-PE")}`;
  updateCountsAndScope();
  render();

  // Activar auto-guardado solo si ya existe handle configurado.
  // No abrir selector ni descargar archivo automaticamente en PCs nuevas.
  if ('showSaveFilePicker' in window && !cachedFileHandle) {
    getStoredHandle().then(h => {
      if (h) {
        startAutoSave(h);
      }
    });
  }
}

function chooseDefaultFilter() {
  if (processedData.some((row) => row.tipo === "LOCAL")) return "LOCAL";
  if (processedData.some((row) => row.tipo === "PROVINCIA")) return "PROVINCIA";
  return "TODOS";
}

function normalizeRow(row) {
  const fechaGeneracionRaw = pickFirstValidDate(row, [
    "Fecha_Generacion_Picking",
    "FECHA_GENERACION_PICKING",
    "Fecha_Generacion",
    "Fecha Generacion",
    "FECHA_GENERACION",
    "Fecha de Generacion",
    "Fecha de Generación",
    "Fec. Generacion",
    "Fecha de Generación Picking"
  ]);
  const fechaOperativaRaw = pickFirstValidDate(row, ["Fecha_Operativa", "Fecha Operativa", "FECHA_OPERATIVA"]);
  const fechaFallbackRaw = pickFirstValidDate(row, ["Fecha", "fecha", "FECHA"]);
  // Prioridad de fecha real: generacion de picking > operativa > fecha general
  const fechaPreferida = fechaGeneracionRaw || fechaOperativaRaw || fechaFallbackRaw;
  const solicitadoOriginal = toNumber(pick(row, ["Und_Solicitadas", "Solicitado", "solicitado", "UND_SOLICITADAS", "UNIDADES SOLICITADAS", "Pedido (Caj)", "Pedido"]));
  const solicitadoDb = toNumber(pick(row, ["unidades_solicitadas", "pedido", "solicitado_db"]));
  const asignadoDinet = toNumber(
    pick(row, [
      "Und_Asignadas_DINET",
      "Und Asignadas DINET",
      "UND_ASIGNADAS_DINET",
      "UNIDADES ASIGNADAS DINET",
      "Cantidad UMS Asignada"
    ])
  );
  const asignadoPicking = toNumber(
    pick(row, [
      "Und_Asignadas_Picking",
      "Und Asignadas Picking",
      "UND_ASIGNADAS_PICKING",
      "UNIDADES ASIGNADAS PICKING",
      "Cantidad UMS Asignada Picking"
    ])
  );
  const picadoOriginal = toNumber(pick(row, ["Und_Picadas", "Picado", "picado", "UND_PICADAS", "UNIDADES PICADAS", "Avance (Caj)", "Avance"]));
  const picadoDb = toNumber(pick(row, ["unidades_picadas", "avance_cajas", "picado_db"]));

  // Guardarrail: si asignado viene inflado x10, no usarlo como base.
  const solicitadoRaw = Math.max(solicitadoOriginal, solicitadoDb);
  const picadoRaw = Math.max(picadoOriginal, picadoDb);
  const refBase = Math.max(solicitadoRaw, picadoRaw);
  const asignadoLooksX10 = refBase > 0 && asignadoDinet === refBase * 10;
  const assignedSafe = asignadoLooksX10 ? refBase : asignadoDinet;

  // Base operativa: priorizar asignado DINET, luego asignado de picking.
  const assignedBase = Math.max(assignedSafe, asignadoPicking);
  const solicitado = assignedBase > 0 ? assignedBase : solicitadoRaw;
  const picado = picadoRaw === 0 && assignedBase > 0 ? assignedBase : picadoRaw;
  const avance = solicitado > 0 ? clamp(picado / solicitado, 0, 1) : 0;
  const faltante = Math.max(solicitado - picado, 0);
  const hasCruceAsignacion = (asignadoDinet > 0) || (asignadoPicking > 0) || (solicitadoOriginal > 0) || (picadoOriginal > 0);
  const tipoDestino = String(pick(row, ["Tipo_Destino", "Tipo", "tipo", "TIPO_DESTINO", "TIPO DESTINO", "tipo_servicio"]) || "").trim();
  const clienteCodigo = String(
    pick(row, ["Cod_Cliente_DINET", "Cod Cliente DINET", "Cod. Cliente", "Cod_Cliente", "COD_CLIENTE", "Codigo Cliente", "Codigo"])
      || ""
  ).trim();
  const cliente = titleCase(
    pick(row, ["Cliente_DINET", "Cliente DINET", "Cliente", "CLIENTE", "cliente", "Razon Social", "Razón Social", "Nombre Cliente", "Desc Cliente"])
      || "SIN CLIENTE"
  );
  const destino = titleCase(pick(row, ["Destino", "destino", "DESTINO", "destino_db"]) || "SIN DESTINO");
  const tipo = normalizarTipo(tipoDestino, destino, cliente, clienteCodigo);
  const peso = toNumber(pick(row, ["Peso_Ton", "Peso", "PESO_TON", "peso", "PESO (Ton)", "Peso (Ton)", "peso_total_dinet"]));
  const volumen = toNumber(pick(row, ["Volumen_m3", "Volumen", "VOLUMEN_M3", "m3", "VOL (m3)", "Vol (m3)", "VOL", "volumen", "volumen_total_dinet"]));
  const horaLlegada = String(pick(row, ["Hora_Llegada", "Hora Llegada", "HORA LLEGADA", "HoraLlegada", "Hora llegada", "HORA_LLEGADA", "Hora", "hora", "HORA"]) || "").trim();
  const placa = String(pick(row, ["Placa", "PLACA", "placa", "PLACA CAMION", "Placa Camion"]) || "").trim().toUpperCase();
  const rampa = String(pick(row, ["Rampa", "RAMPA", "RAMPAS", "rampas", "Rampas", "rampa"]) || "").trim();
  const finCarga = String(pick(row, ["Fin_Carga", "Fin Carga", "FIN_CARGA", "fin_carga"]) || "").trim();
  const estadoCargaRaw = String(pick(row, ["Estado_Carga", "Estado Carga", "ESTADO_CARGA", "Carga", "CARGA"]) || "").trim();
  const estadoCarga = deriveEstadoCarga(finCarga, rampa, estadoCargaRaw);
  const observaciones = String(pick(row, ["Observaciones", "OBSERVACIONES", "Obs", "OBS", "Observacion"]) || "").trim();
  const tipoCliente = titleCase(String(pick(row, ["Tipo_Cliente", "Tipo Cliente", "TIPO_CLIENTE", "TIPO CLIENTE", "TipoCliente"]) || "").trim());
  const filtrador = String(pick(row, ["Filtrador", "FILTRADOR", "filtrador"]) || "").trim();
  const stageDestino = String(pick(row, ["Stage_Destino", "Stage Destino", "STAGE_DESTINO", "Stage", "stage"]) || "").trim();
  const inicioPicking = String(pick(row, ["Inicio_Picking", "Inicio Picking", "INICIO_PICKING"]) || "").trim();
  const finPicking = String(pick(row, ["Fin_Picking", "Fin Picking", "FIN_PICKING"]) || "").trim();
  // Usamos la hora en la que finalizó la tarea. Si está vacía, usamos la hora de llegada por defecto.
  const turno = deriveTurno(String(pick(row, ["Turno", "turno", "TURNO"]) || "").trim(), finPicking || horaLlegada);
  const tiempoPicking = String(pick(row, ["Tiempo_Picking", "Tiempo Picking", "TIEMPO_PICKING"]) || "").trim();
  const cita = String(pick(row, ["Cita", "CITA", "cita", "Hora_Cita"]) || "").trim();
  const familias = String(pick(row, ["Familias_DINET", "Familias", "familias", "FAMILIAS"]) || "").trim();
  const motivoDiferencia = String(pick(row, ["Motivo_Diferencia", "Motivo Diferencia", "MOTIVO_DIFERENCIA", "Motivo"]) || "").trim();
  const usuarioEjecucion = String(pick(row, ["Usuario_Ejecucion", "Usuario Ejecucion", "USUARIO_EJECUCION", "Usuario"]) || "").trim();

  const dtValue = String(pick(row, ["DT", "dt", "Nro_DT", "Documento", "NRO DT"]) || "").trim();
  const avanceFinal = avance;
  const estadoFinal = calcularEstado(avanceFinal, faltante, solicitado, picado);
  const prioridadFinal = calcularPrioridad(avanceFinal, faltante, solicitado, picado);

  return {
    fecha: normalizeDate(fechaPreferida),
    fechaInfo: parseDateParts(fechaPreferida),
    fechaGeneracion: normalizeDate(fechaGeneracionRaw || fechaPreferida),
    fechaGeneracionRaw: fechaGeneracionRaw || "",
    hora: String(pick(row, ["Hora", "hora", "HORA"]) || "").trim(),
    dt: dtValue,
    transporte: titleCase(pick(row, ["Transporte", "transporte", "TRANSPORTE"]) || "SIN TRANSPORTE"),
    clienteCodigo,
    cliente,
    destino,
    solicitado,
    solicitadoOriginal,
    asignadoDinet,
    asignadoPicking,
    picado,
    picadoOriginal,
    faltante,
    avance: avanceFinal,
    hasCruceAsignacion,
    tipo,
    peso,
    volumen,
    turno,
    placa,
    horaLlegada,
    estadoCarga,
    finCarga,
    rampa,
    observaciones,
    tipoCliente,
    filtrador,
    stageDestino,
    inicioPicking,
    finPicking,
    tiempoPicking,
    cita,
    familias,
    motivoDiferencia,
    usuarioEjecucion,
    prioridad: prioridadFinal,
    estado: estadoFinal,
    criticidad: calcularCriticidad(avanceFinal, faltante, solicitado)
  };
}

function dedupeRowsByDt(rows) {
  const byDt = new Map();

  for (const row of rows) {
    const dtKey = String(row.dt || "").trim();
    if (!dtKey) continue;

    const prev = byDt.get(dtKey);
    if (!prev || shouldReplaceRowForDt(prev, row)) {
      byDt.set(dtKey, row);
    }
  }

  const rowsWithoutDt = rows.filter((r) => !String(r.dt || "").trim());
  return [...byDt.values(), ...rowsWithoutDt];
}

function shouldReplaceRowForDt(current, candidate) {
  const currentScore = scoreRowForDt(current);
  const candidateScore = scoreRowForDt(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore;

  const currentTime = parseDateTimeToEpoch(current.fechaGeneracionRaw || current.fechaGeneracion || current.fecha);
  const candidateTime = parseDateTimeToEpoch(candidate.fechaGeneracionRaw || candidate.fechaGeneracion || candidate.fecha);
  if (candidateTime !== currentTime) return candidateTime > currentTime;

  const currentDate = parseDateToEpoch(current.fecha);
  const candidateDate = parseDateToEpoch(candidate.fecha);
  if (candidateDate !== currentDate) return candidateDate > currentDate;

  return false;
}

function scoreRowForDt(row) {
  const solicitado = Number(row.solicitado) || 0;
  const picado = Number(row.picado) || 0;
  const faltante = Number(row.faltante) || 0;

  // Puntaje mayor = fila mas util para operacion real
  // Prioriza la base mas completa (solicitado), luego avance y menor faltante.
  return (solicitado * 1000000) + (picado * 1000) - faltante;
}

function parseDateToEpoch(value) {
  const p = parseDateParts(value);
  if (!p || !p.year || !p.month || !p.day) return 0;
  const d = new Date(`${p.year}-${p.month}-${p.day}T00:00:00`);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function parseDateTimeToEpoch(value) {
  if (!value) return 0;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.valueOf();
  const text = String(value).trim();
  if (!text) return 0;

  const isoWithTime = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoWithTime) {
    const [, y, m, d, hh, mm, ss] = isoWithTime;
    const dt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${mm}:${ss || "00"}`);
    const t = dt.getTime();
    return Number.isFinite(t) ? t : 0;
  }

  const latamWithTime = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (latamWithTime) {
    const [, d, m, yRaw, hh, mm, ss] = latamWithTime;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const dt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${mm}:${ss || "00"}`);
    const t = dt.getTime();
    return Number.isFinite(t) ? t : 0;
  }

  const direct = Date.parse(text);
  return Number.isFinite(direct) ? direct : 0;
}

function pickFirstValidDate(obj, keys) {
  for (const key of keys) {
    const raw = pick(obj, [key]);
    if (raw === "" || raw === null || raw === undefined) continue;
    const parsed = parseDateParts(raw);
    if (parsed && parsed.year && parsed.month && parsed.day) {
      return raw;
    }
  }
  return pick(obj, keys);
}

function normalizarTurnoLabel(raw) {
  const t = String(raw || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!t || t === "SIN TURNO") return "";
  if (t === "T1" || t === "1" || t === "TURNO 1" || t === "1 TURNO" ||
      t.includes("MAÑANA") || t.includes("MANANA") || t.includes("MADRUGADA")) return "1 TURNO";
  if (t === "T2" || t === "2" || t === "TURNO 2" || t === "2 TURNO" ||
      t.includes("TARDE") || t.includes("DIA")) return "2 TURNO";
  if (t === "T3" || t === "3" || t === "TURNO 3" || t === "3 TURNO" ||
      t.includes("NOCHE")) return "3 TURNO";
  if (t.includes("1")) return "1 TURNO";
  if (t.includes("2")) return "2 TURNO";
  if (t.includes("3")) return "3 TURNO";
  return "";
}

function deriveTurno(turnoExcel, horaStr) {
  // Primero intenta normalizar el valor del Excel
  const fromExcel = normalizarTurnoLabel(turnoExcel);
  if (fromExcel) return fromExcel;

  // Si no hay valor Excel, inferir por hora
  if (!horaStr) return "SIN TURNO";
  let h = -1;
  const timeMatch = horaStr.match(/(\d{1,2}):\d{2}/);
  if (timeMatch) {
    h = parseInt(timeMatch[1], 10);
  } else if (!isNaN(horaStr) && Number(horaStr) > 0 && Number(horaStr) < 1) {
    h = Math.floor(Number(horaStr) * 24);
  } else {
    h = parseInt(horaStr, 10);
  }
  if (isNaN(h) || h < 0 || h > 23) return "SIN TURNO";
  if (h >= 7 && h < 15) return "1 TURNO";
  if (h >= 15 && h < 23) return "2 TURNO";
  return "3 TURNO";
}

function normalizarEstadoCarga(raw) {
  if (!raw) return "PENDIENTE";
  const upper = raw.toUpperCase().trim();
  if (upper === "CARGADO" || upper === "C" || upper === "✓" || upper === "✔" || upper === "1") return "CARGADO";
  if (upper.includes("EN CARGA") || upper.includes("ENCARGA") || upper === "E" || upper === "⚠" || upper === "2") return "EN_CARGA";
  if (upper === "PENDIENTE" || upper === "P" || upper === "✗" || upper === "X" || upper === "0") return "PENDIENTE";
  return "PENDIENTE";
}

function deriveEstadoCarga(finCarga, rampa, estadoCargaRaw) {
  // 1. Fin_Carga con "ok" (o cualquier valor no vacío) → terminó de cargar
  const fin = finCarga.toUpperCase().trim();
  if (fin === "OK" || fin === "SI" || fin === "✓" || fin === "LISTO" || fin === "X" || fin === "1") {
    return "CARGADO";
  }
  // 2. Tiene rampa asignada pero no ha finalizado → en proceso de carga
  if (rampa && rampa.trim()) {
    return "EN_CARGA";
  }
  // 3. Sin rampa ni fin de carga → fallback a columna explícita o PENDIENTE
  return normalizarEstadoCarga(estadoCargaRaw);
}

function pick(obj, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== "") return obj[key];
  }
  
  // Búsqueda flexible (ignora mayúsculas, minúsculas y espacios invisibles en los encabezados del Excel)
  const normalizedKeys = keys.map(k => String(k).toLowerCase().trim());
  for (const objKey in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, objKey)) {
      const normObjKey = String(objKey).toLowerCase().trim();
      if (normalizedKeys.includes(normObjKey) && obj[objKey] !== "") {
        return obj[objKey];
      }
    }
  }
  return "";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace("%", "");

  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeDate(value) {
  const parsed = parseDateParts(value);
  return parsed.label;
}

function parseDateParts(value) {
  if (!value) return { label: "", day: "", month: "", year: "" };

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return {
      label: value.toLocaleDateString("es-PE"),
      day: String(value.getDate()).padStart(2, "0"),
      month: String(value.getMonth() + 1).padStart(2, "0"),
      year: String(value.getFullYear())
    };
  }

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return {
      label: `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`,
      day: day.padStart(2, "0"),
      month: month.padStart(2, "0"),
      year
    };
  }

  const latamMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (latamMatch) {
    const [, day, month, yearRaw] = latamMatch;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return {
      label: `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`,
      day: day.padStart(2, "0"),
      month: month.padStart(2, "0"),
      year
    };
  }

  return { label: text, day: "", month: "", year: "" };
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizarTipo(tipoDestino, destino = "", cliente = "", clienteCodigo = "") {
  const text = String(tipoDestino || "").toUpperCase();
  if (text.includes("PROVINCIA")) return "PROVINCIA";
  if (text.includes("CANAL MODERNO") || text.includes("CANAL TRADICIONAL") || text.includes("LOCAL") || text.includes("COPACK")) {
    return "LOCAL";
  }

  const destinoText = String(destino || "").toUpperCase();
  const clienteText = String(cliente || "").toUpperCase();
  const codigoText = String(clienteCodigo || "").trim();
  const catalogByCode = lookupCatalog(CLIENT_TYPE_CATALOG.codigos, codigoText);
  if (catalogByCode) return catalogByCode;
  const catalogByClient = lookupCatalog(CLIENT_TYPE_CATALOG.clientes, clienteText);
  if (catalogByClient) return catalogByClient;
  const catalogByDestino = lookupCatalog(CLIENT_TYPE_CATALOG.destinos, destinoText);
  if (catalogByDestino) return catalogByDestino;

  const provinciaKeywords = [
    "AREQUIPA", "PIURA", "TRUJILLO", "CHICLAYO", "CUSCO", "ICA", "TACNA", "JULIACA",
    "CAJAMARCA", "HUANCAYO", "PUNO", "IQUITOS", "CHIMBOTE", "SULLANA", "TUMBES",
    "TARAPOTO", "MOQUEGUA", "ILO", "PISCO", "HUARAZ", "PROV"
  ];

  if (provinciaKeywords.some((keyword) => destinoText.includes(keyword) || clienteText.includes(keyword))) {
    return "PROVINCIA";
  }

  return "LOCAL";
}

function lookupCatalog(map, key) {
  if (!map || !key) return "";
  const raw = map[key];
  if (!raw) return "";
  const value = String(raw).toUpperCase().trim();
  if (value === "PROVINCIA") return "PROVINCIA";
  if (value === "LOCAL") return "LOCAL";
  return "";
}

function calcularEstado(avance, faltante, solicitado, picado) {
  // Regla estricta de clasificación:
  // - Completo: pedido > 0 y picado >= pedido
  // - En proceso: pedido > 0 y 0 < picado < pedido
  // - Pendiente: pedido 0/vacío o picado 0
  if (solicitado > 0 && picado >= solicitado) return "Completo";
  if (solicitado > 0 && picado > 0 && picado < solicitado) return "En proceso";
  return "Pendiente";
}

function calcularPrioridad(avance, faltante, solicitado, picado) {
  if (solicitado > 0 && picado >= solicitado) return "CERRADO";
  if (avance < 0.65 || faltante >= 500) return "ALTA";
  if (avance < 0.9 || faltante >= 100) return "MEDIA";
  return "BAJA";
}

function calcularCriticidad(avance, faltante, solicitado) {
  if (!solicitado) return 0;
  const share = faltante / solicitado;
  return clamp((1 - avance) * 0.55 + share * 0.45, 0, 1);
}

function filteredRows() {
  const searchText = els.searchInput ? els.searchInput.value.toUpperCase() : "";

  return processedData.map(applyRowOverrides).filter((row) => {
    const typeMatch = currentFilter === "TODOS" ? true : row.tipo === currentFilter;
    const dayMatch = dateFilter.day === "TODOS" ? true : row.fechaInfo.day === dateFilter.day;
    const monthMatch = dateFilter.month === "TODOS" ? true : row.fechaInfo.month === dateFilter.month;
    const yearMatch = dateFilter.year === "TODOS" ? true : row.fechaInfo.year === dateFilter.year;
    const searchMatch = searchText
      ? `${row.dt} ${row.destino} ${row.transporte} ${row.cliente} ${row.placa}`.toUpperCase().includes(searchText)
      : true;

    return typeMatch && dayMatch && monthMatch && yearMatch && searchMatch;
  });
}

function summarize(rows) {
  const solicitado = sum(rows, "solicitado");
  const picado = sum(rows, "picado");
  const faltante = sum(rows, "faltante");
  const avance = solicitado > 0 ? picado / solicitado : 0;
  const totalPeso = sum(rows, "peso");
  const totalVolumen = sum(rows, "volumen");
  // Pendiente TON/M3 debe salir de la suma real por DT (no de una regla global Total*%).
  // Si un DT tiene solicitado>0, se toma su proporcion faltante.
  // Si solicitado=0 y el estado no es Completo, se considera 100% pendiente.
  const pendientePeso = rows.reduce((acc, row) => {
    const sol = Number(row.solicitado) || 0;
    const pic = Number(row.picado) || 0;
    const peso = Number(row.peso) || 0;
    if (sol > 0) {
      const ratioPend = clamp((sol - pic) / sol, 0, 1);
      return acc + (peso * ratioPend);
    }
    const av = Number(row.avance) || 0;
    if (row.estado === "Completo") return acc;
    if (av > 0 && av < 1) return acc + (peso * (1 - av));
    return acc + peso;
  }, 0);
  const pendienteVolumen = rows.reduce((acc, row) => {
    const sol = Number(row.solicitado) || 0;
    const pic = Number(row.picado) || 0;
    const vol = Number(row.volumen) || 0;
    if (sol > 0) {
      const ratioPend = clamp((sol - pic) / sol, 0, 1);
      return acc + (vol * ratioPend);
    }
    const av = Number(row.avance) || 0;
    if (row.estado === "Completo") return acc;
    if (av > 0 && av < 1) return acc + (vol * (1 - av));
    return acc + vol;
  }, 0);
  const completos = rows.filter((row) => row.estado === "Completo").length;
  const pendientes = rows.filter((row) => row.estado === "Pendiente").length;
  const alta = rows.filter((row) => row.prioridad === "ALTA").length;
  const meta = FILTER_CONFIG[currentFilter]?.meta ?? 0.9;

  const cargadoRows = rows.filter((r) => r.estadoCarga === "CARGADO");
  const enCargaRows = rows.filter((r) => r.estadoCarga === "EN_CARGA");
  const despachoPicado = sum(cargadoRows, "picado");
  const despachoPeso = sum(cargadoRows, "peso");
  const despachoVolumen = sum(cargadoRows, "volumen");
  const avanceDespacho = picado > 0 ? despachoPicado / picado : 0;
  const hasCargaData = rows.some((r) => r.estadoCarga !== "PENDIENTE");

  return {
    total: rows.length,
    solicitado,
    picado,
    faltante,
    avance,
    totalPeso,
    totalVolumen,
    pendientePeso,
    pendienteVolumen,
    completos,
    pendientes,
    alta,
    meta,
    brecha: avance - meta,
    despachoPicado,
    despachoPeso,
    despachoVolumen,
    avanceDespacho,
    hasCargaData,
    cargados: cargadoRows.length,
    enCarga: enCargaRows.length,
    sinCargar: rows.length - cargadoRows.length - enCargaRows.length
  };
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

function updateCountsAndScope() {
  const countByType = (type) => processedData.filter((row) => row.tipo === type).length;
  els.tabCountTodos.textContent = processedData.length;
  els.tabCountLocal.textContent = countByType("LOCAL");
  els.tabCountProvincia.textContent = countByType("PROVINCIA");
}

function syncActiveTab() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.filter === currentFilter);
    tab.setAttribute("aria-pressed", tab.dataset.filter === currentFilter ? "true" : "false");
  });
}

function syncActiveTableTab() {
  document.querySelectorAll(".t-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.estado === currentTableFilter);
    tab.setAttribute("aria-pressed", tab.dataset.estado === currentTableFilter ? "true" : "false");
  });
}

function handleDateFilterChange() {
  dateFilter = {
    day: els.dayFilter.value,
    month: els.monthFilter.value,
    year: els.yearFilter.value
  };
  render();
}

function populateDateFilters() {
  const days = uniqueSortedValues(processedData.map((row) => row.fechaInfo.day).filter(Boolean), "asc");
  const months = uniqueSortedValues(processedData.map((row) => row.fechaInfo.month).filter(Boolean), "asc");
  const years = uniqueSortedValues(processedData.map((row) => row.fechaInfo.year).filter(Boolean), "desc");

  const today = new Date();
  const defaultDay = String(today.getDate()).padStart(2, "0");
  const defaultMonth = String(today.getMonth() + 1).padStart(2, "0");
  const defaultYear = String(today.getFullYear());

  fillSelect(els.dayFilter, days, (value) => value, defaultDay, true);
  fillSelect(els.monthFilter, months, (value) => monthName(value), defaultMonth, true);
  fillSelect(els.yearFilter, years, (value) => value, defaultYear, true);

  // Actualizar dateFilter con la fecha de hoy por defecto
  dateFilter = {
    day: defaultDay,
    month: defaultMonth,
    year: defaultYear
  };
}

function fillSelect(select, values, formatter, defaultValue, ensureDefaultOption = false) {
  const normalizedValues = [...values];
  if (ensureDefaultOption && defaultValue && !normalizedValues.includes(defaultValue)) {
    normalizedValues.push(defaultValue);
    normalizedValues.sort((a, b) => a.localeCompare(b));
  }

  const options = ['<option value="TODOS">Todos</option>']
    .concat(normalizedValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`));
  select.innerHTML = options.join("");

  if (defaultValue && normalizedValues.includes(defaultValue)) {
    select.value = defaultValue;
  } else {
    select.value = "TODOS";
  }
}

function uniqueSortedValues(values, direction) {
  const unique = [...new Set(values)];
  return unique.sort((a, b) => (direction === "desc" ? b.localeCompare(a) : a.localeCompare(b)));
}

function monthName(value) {
  const names = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
    "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
    "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
  };
  return names[value] || value;
}

function render() {
  const rows = filteredRows();
  const summary = summarize(rows);
  applyTheme();
  renderGaugesAndSummary(rows, summary);
  renderTable(rows, summary);
  renderTurnoCombinadoBars(rows);
}

function applyTheme() {
  document.body.classList.remove("theme-local", "theme-prov", "theme-neutral", "theme-copacker", "theme-unclassified");
  document.body.classList.add(FILTER_CONFIG[currentFilter]?.theme || "theme-neutral");
}

function renderSectionMeta(summary) {
  if (!els.sectionMeta) return;
  const config = FILTER_CONFIG[currentFilter] || FILTER_CONFIG.TODOS;
  els.sectionMeta.textContent = `${config.scope} · ${fmtNum(summary.total)} DTs · ${fmtPct(summary.avance)} de avance · ${fmtNum(summary.faltante)} uds. faltantes`;
}

function renderKpis(rows, summary) {
  if (!els.kpiGrid) return;
  const topRisk = [...rows].sort(compareCritical)[0];
  const cards = [
    kpiCard("DTs visibles", fmtNum(summary.total), "Registros del filtro actual", "card-slate"),
    kpiCard("Avance global", fmtPct(summary.avance), `Meta ${fmtPct(summary.meta)}`, summary.brecha < 0 ? "card-amber" : "card-solid-green"),
    kpiCard("Pendiente", fmtNum(summary.faltante), "Unidades faltantes", summary.faltante > 0 ? "card-red" : "card-slate"),
    kpiCard("Alta prioridad", fmtNum(summary.alta), "DTs que exigen atencion", summary.alta > 0 ? "card-amber" : "card-slate"),
    kpiCard("Mayor riesgo", topRisk ? topRisk.destino : "Ninguno", topRisk ? `${fmtNum(topRisk.faltante)} unidades pendientes` : "Sin brechas abiertas", "card-slate")
  ];
  els.kpiGrid.innerHTML = cards.join("");
}

function kpiCard(label, value, sub, className) {
  return `
    <div class="card ${className}">
      <div class="c-label">${escapeHtml(label)}</div>
      <div class="c-value">${escapeHtml(value)}</div>
      <div class="c-sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

/* ─── GAUGES + SUMMARY ─────────────────────────────────────────── */

function renderGaugesAndSummary(rows, summary) {
  const elPiking   = document.getElementById("gaugePikingWrap");
  const elSummary  = document.getElementById("gaugeSummaryWrap");
  const elDespacho = document.getElementById("gaugeDespachoWrap");
  if (!elPiking && !elSummary && !elDespacho) return;

  const pikingLabel = currentFilter === "PROVINCIA" ? "PIKING PROVINCIA" : "PIKING LOCAL";
  const pikingSub   = `${fmtNum(summary.picado)} / ${fmtNum(summary.solicitado)} Cjs`;
  const despachoCls = summary.hasCargaData;
  const despachoPct = (Number.isFinite(summary.avanceDespacho) && summary.hasCargaData)
    ? summary.avanceDespacho : 0;
  const despachoSub = despachoCls
    ? `${fmtNum(summary.despachoPicado)} cjs cargadas`
    : "Sin datos de carga";

  if (elPiking)   elPiking.innerHTML   = gaugeInnerHtml("gaugePiking",   pikingLabel,  pikingSub,   summary.avance);
  if (elSummary)  elSummary.innerHTML  = summaryStripHtml(summary);
  if (elDespacho) elDespacho.innerHTML = gaugeInnerHtml("gaugeDespacho", "DESPACHO",   despachoSub, despachoPct);
}

function gaugeInnerHtml(id, label, subtitle, pct) {
  const R = 70, cx = 100, cy = 88;
  const circ = Math.PI * R;
  const pctSafe = (typeof pct === "number" && Number.isFinite(pct)) ? pct : 0;
  const pctClamped = clamp(pctSafe, 0, 1);
  const coloredLen = (circ * pctClamped).toFixed(2);
  const angle = Math.PI * (1 - pctClamped);
  const nx = (cx + R * 0.72 * Math.cos(angle)).toFixed(2);
  const ny = (cy - R * 0.72 * Math.sin(angle)).toFixed(2);
  const color = pctClamped >= 0.9 ? "#16a34a" : pctClamped >= 0.65 ? "#d97706" : "#dc2626";

  // Mostrar 100% sin decimales para que no ocupe demasiado espacio
  const displayPct = pctClamped === 1 ? "100%" : (pctClamped * 100).toFixed(1) + "%";

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const a = Math.PI * (1 - t);
    const ox = (cx + (R + 2) * Math.cos(a)).toFixed(1);
    const oy = (cy - (R + 2) * Math.sin(a)).toFixed(1);
    const ix = (cx + (R - 10) * Math.cos(a)).toFixed(1);
    const iy = (cy - (R - 10) * Math.sin(a)).toFixed(1);
    
    let lx = cx + (R + 14) * Math.cos(a);
    let ly = cy - (R + 14) * Math.sin(a);
    let anchor = "middle";
    
    // Ajustar la alineación en los extremos (0% y 100%) para que no choquen con el arco
    if (t === 0) {
      anchor = "end";
      lx = cx - R - 10;
    } else if (t === 1) {
      anchor = "start";
      lx = cx + R + 10;
    }
    
    return `<line x1="${ox}" y1="${oy}" x2="${ix}" y2="${iy}" stroke="#cbd5e1" stroke-width="1.5"/>
            <text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}" font-size="7.5" fill="#94a3b8">${Math.round(t*100)}%</text>`;
  }).join("");

  return `
    <div class="gauge-title">${escapeHtml(label)}</div>
    <svg viewBox="0 0 200 108" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;overflow:visible">
      <defs>
        <linearGradient id="${id}_grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="#dc2626"/>
          <stop offset="55%"  stop-color="#f59e0b"/>
          <stop offset="85%"  stop-color="#22c55e"/>
          <stop offset="100%" stop-color="#15803d"/>
        </linearGradient>
      </defs>
      ${ticks}
      <path d="M ${cx-R} ${cy} A ${R} ${R} 0 0 1 ${cx+R} ${cy}"
            stroke="#e2e8f0" stroke-width="13" fill="none" stroke-linecap="round"/>
      <path d="M ${cx-R} ${cy} A ${R} ${R} 0 0 1 ${cx+R} ${cy}"
            stroke="url(#${id}_grad)" stroke-width="13" fill="none" stroke-linecap="round"
            stroke-dasharray="${coloredLen} ${(circ + 20).toFixed(1)}"/>
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}"
            stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="#0f172a"/>
      <circle cx="${cx}" cy="${cy}" r="3" fill="#fff"/>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="22" font-weight="900" fill="${color}"
        style="font-family:inherit">${displayPct}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="8.5" fill="#94a3b8"
            style="font-family:inherit">${escapeHtml(subtitle)}</text>
    </svg>
  `;
}


function summaryStripHtml(summary) {
  const faltantePeso = Math.max(Number(summary.pendientePeso) || 0, 0);
  const faltanteVol = Math.max(Number(summary.pendienteVolumen) || 0, 0);

  const filas = [
    {
      label: "TOTAL",
      peso: summary.totalPeso,
      vol: summary.totalVolumen,
      caj: summary.solicitado,
      bold: true,
      cls: ""
    },
    {
      label: "AVANCE PIKING",
      peso: Math.max(summary.totalPeso - faltantePeso, 0),
      vol: Math.max(summary.totalVolumen - faltanteVol, 0),
      caj: summary.picado,
      bold: false,
      cls: "ok"
    },
    {
      label: "PENDIENTE PIKING",
      peso: faltantePeso,
      vol: faltanteVol,
      caj: summary.faltante,
      bold: false,
      cls: summary.faltante > 0 ? "red" : "ok"
    },
    {
      label: "AVANCE DESPACHO",
      peso: summary.despachoPeso,
      vol: summary.despachoVolumen,
      caj: summary.despachoPicado,
      bold: false,
      cls: "teal"
    }
  ];

  const rows = filas.map((f) => `
    <div class="summary-row${f.bold ? " summary-row-total" : ""}">
      <div class="summary-row-label">${escapeHtml(f.label)}</div>
      <div class="summary-cell ${f.cls}">${fmtDec(f.peso)} Ton</div>
      <div class="summary-cell ${f.cls}">${fmtDec(f.vol)} m³</div>
      <div class="summary-cell ${f.cls}">${fmtNum(Math.round(f.caj))} Cj</div>
    </div>
  `).join("");

  return `
    <div class="summary-strip">
      <div class="summary-strip-title">Resumen operativo</div>
      <div class="summary-header">
        <div></div>
        <div class="summary-col-head">TON</div>
        <div class="summary-col-head">M³</div>
        <div class="summary-col-head">CAJAS</div>
      </div>
      ${rows}
    </div>
  `;
}

/* ─── TABLE ─────────────────────────────────────────────────────── */

function renderTable(rows, summary) {
  const tableRows = currentTableFilter === "TODOS" ? rows : rows.filter(r => r.estado === currentTableFilter);

  if (els.tTabCountTodos) els.tTabCountTodos.textContent = rows.length;
  if (els.tTabCountCompleto) els.tTabCountCompleto.textContent = rows.filter(r => r.estado === "Completo").length;
  if (els.tTabCountProceso) els.tTabCountProceso.textContent = rows.filter(r => r.estado === "En proceso").length;
  if (els.tTabCountPendiente) els.tTabCountPendiente.textContent = rows.filter(r => r.estado === "Pendiente").length;

  const ordered = [...tableRows].sort(compareCritical);
  els.tableTitle.textContent = "Detalle Dts";
  const subtitle = document.getElementById("tableSubtitle");
  if (subtitle) subtitle.textContent = `${fmtNum(ordered.length)} registros`;

  els.detailTable.innerHTML = ordered.length
    ? ordered.map((row) => `
      <tr class="${rowClass(row)}">
        <td class="dt-cell">${escapeHtml(row.dt || "-")}</td>
        <td>${escapeHtml(row.transporte)}</td>
        <td>${escapeHtml(row.cliente)}</td>
        <td>${escapeHtml(row.destino)}</td>
        <td class="num">${fmtDec(row.peso)}</td>
        <td class="num">${fmtDec(row.volumen)}</td>
        <td class="num">${fmtNum(row.solicitado)}</td>
        <td class="num">${fmtNum(row.picado)}</td>
        <td class="placa-cell field-editable" title="Clic para editar Placa" data-key="${escapeHtml(rowKey(row))}" data-field="placa" data-rawval="${escapeHtml(row.placa)}">${row.placa ? escapeHtml(row.placa) : '<span class="stage-empty">+ Placa</span>'}</td>
        <td class="pct-cell">
          <div class="pct-text">${fmtPct(row.avance)}</div>
          <div class="mini-bar"><div class="${barClass(row.avance)}" style="width:${Math.round(row.avance * 100)}%"></div></div>
        </td>
        <td class="rampa-cell stage-editable" title="Clic para editar Stage" data-key="${escapeHtml(rowKey(row))}" data-fincarga="${escapeHtml(row.finCarga || '')}">${(() => { const sv = row.stageDestino.split(" / ")[0].split(",")[0].trim(); if (sv) return escapeHtml(sv); if (!row.hasCruceAsignacion) return '<span class="stage-empty">Sin cruce</span>'; return '<span class="stage-empty">+ Stage</span>'; })()}</td>
        <td class="rampa-cell">${escapeHtml(row.rampa)}</td>
        <td class="rampa-cell field-editable" title="Clic para editar Cita" data-key="${escapeHtml(rowKey(row))}" data-field="cita" data-rawval="${escapeHtml(row.cita)}">${row.cita ? escapeHtml(row.cita) : '<span class="stage-empty">+ Cita</span>'}</td>
        <td class="carga-td ${row.avance >= 1 ? 'carga-editable' : ''}" style="padding: 6px; ${row.avance >= 1 ? 'cursor:pointer;' : 'cursor:not-allowed;opacity:.75;'}" title="${row.avance >= 1 ? 'Clic para cambiar estado' : 'Solo editable cuando % avance es 100%'}" data-can-edit="${row.avance >= 1 ? '1' : '0'}" data-key="${escapeHtml(rowKey(row))}" data-estado="${escapeHtml(row.estadoCarga)}">${cargaIcon(row.estadoCarga)}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="15" style="text-align:center;padding:24px;color:#94a3b8">No hay registros para el filtro actual.</td></tr>';
}

function cargaIcon(estadoCarga) {
  if (estadoCarga === "CARGADO") {
    return `
      <div class="estado-grafico ok" title="Cargado">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="3" width="15" height="13"></rect>
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
          <circle cx="5.5" cy="18.5" r="2.5"></circle>
          <circle cx="18.5" cy="18.5" r="2.5"></circle>
        </svg>
        <span>CARGADO</span>
      </div>`;
  }
  if (estadoCarga === "EN_CARGA") {
    return `
      <div class="estado-grafico warn" title="En carga">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="5" r="2"></circle>
          <path d="M8 7v6"></path>
          <path d="M8 13l-3 4"></path>
          <path d="M8 13l3 4"></path>
          <path d="M8 9h5"></path>
          <rect x="13" y="6" width="5" height="5" fill="currentColor" fill-opacity="0.2"></rect>
        </svg>
        <span>EN CARGA</span>
      </div>`;
  }
  return `
    <div class="estado-grafico pend" title="Pendiente">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 21V8l9-4 9 4v13"></path>
        <path d="M9 21v-7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v7"></path>
      </svg>
      <span>PENDIENTE</span>
    </div>`;
}

/* ─── CHARTS ─────────────────────────────────────────────────────── */

function renderTurnoCombinadoBars(rows) {
  if (!els.turnoCombinadoBars) return;
  const grouped = aggregate(rows, "turno").sort((a, b) => b.picado - a.picado);
  const totalPicado = sum(rows, "picado");

  els.turnoCombinadoBars.innerHTML = grouped.length && grouped.some((g) => g.picado > 0 || g.peso > 0)
    ? grouped.map((item) => {
        const ratio = totalPicado > 0 ? clamp(item.picado / totalPicado, 0, 1) : 0;
        return `
          <div class="turno-row">
            <div class="turno-row-head">
              <div class="turno-name">${escapeHtml(item.name)}</div>
              <div class="turno-values">
                <span><strong>${fmtDec(item.peso)}</strong> Ton</span>
                <span><strong>${fmtDec(item.volumen)}</strong> m³</span>
                <span><strong>${fmtNum(item.picado)}</strong> Cjs</span>
              </div>
            </div>
            <div class="bar-track turno-bar-track">
              <div class="bar-fill ${barClass(ratio)}" style="width:${Math.round(ratio * 100)}%">${Math.round(ratio * 100)}%</div>
            </div>
          </div>
        `;
      }).join("")
    : '<div class="insight-text">No hay información de turnos disponible.</div>';
}

function aggregate(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const name = row[key] || "SIN DATO";
    if (!map.has(name)) {
      map.set(name, { name, faltante: 0, solicitado: 0, picado: 0, peso: 0, volumen: 0 });
    }
    const current = map.get(name);
    current.faltante += row.faltante;
    current.solicitado += row.solicitado;
    current.picado += row.picado;
    current.peso += (row.peso || 0);
    current.volumen += (row.volumen || 0);
  });
  return [...map.values()].sort((a, b) => b.faltante - a.faltante || a.name.localeCompare(b.name));
}

function barRow(label, value, maxValue, isPct = false, suffix = "") {
  const safeMax = maxValue > 0 ? maxValue : 1;
  const ratio = clamp(value / safeMax, 0, 1);
  const shown = (isPct ? fmtPct(value / 100) : fmtNum(value)) + (suffix ? ` ${suffix}` : "");
  return `
    <div class="bar-row">
      <div class="bar-lbl">${escapeHtml(label)}</div>
      <div class="bar-track">
        <div class="bar-fill ${barClass(ratio)}" style="width:${Math.round(ratio * 100)}%">${escapeHtml(shown)}</div>
      </div>
      <div class="bar-pct">${Math.round(ratio * 100)}%</div>
    </div>
  `;
}

/* ─── HELPERS ────────────────────────────────────────────────────── */

function compareCritical(left, right) {
  return (
    (right.criticidad - left.criticidad) ||
    (right.faltante - left.faltante) ||
    (left.avance - right.avance)
  );
}

function rowClass(row) {
  if (row.prioridad === "ALTA") return "row-critical";
  if (row.prioridad === "MEDIA") return "row-warning";
  return "row-ok";
}

function barClass(avance) {
  if (avance >= 0.9) return "fill-green";
  if (avance >= 0.65) return "fill-amber";
  return "fill-red";
}

function fmtNum(value) {
  return Number(value || 0).toLocaleString("es-PE");
}

function fmtDec(value, d = 1) {
  return Number(value || 0).toFixed(d);
}

function fmtPct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function fmtBrecha(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)} pp`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

