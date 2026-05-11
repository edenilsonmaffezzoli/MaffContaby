(() => {
  const STORAGE_PREFIX = "gdp_cache_v1";
  const TOKEN_KEY = "gdp_token";
  const ADMIN_SELECTED_USER_KEY = "gdp_admin_user";
  const API_STORE_PATH = "/api/gdp/store";
  const API_ME_PATH = "/api/auth/me";
  const API_USERS_PATH = "/api/gdp/users";

  const el = {
    tituloMes: document.getElementById("tituloMes"),
    resumoMes: document.getElementById("resumoMes"),
    gridDias: document.getElementById("gridDias"),
    tplAtividade: document.getElementById("tplAtividade"),
    btnMesAnterior: document.getElementById("btnMesAnterior"),
    btnMesProximo: document.getElementById("btnMesProximo"),
    btnHoje: document.getElementById("btnHoje"),
    btnTema: document.getElementById("btnTema"),
    btnExportar: document.getElementById("btnExportar"),
    btnExportarExcel: document.getElementById("btnExportarExcel"),
    btnPdfMes: document.getElementById("btnPdfMes"),
    btnNuvemBaixar: document.getElementById("btnNuvemBaixar"),
    btnNuvemEnviar: document.getElementById("btnNuvemEnviar"),
    btnNuvemConfig: document.getElementById("btnNuvemConfig"),
    inputImportar: document.getElementById("inputImportar"),
    inputImportarExcel: document.getElementById("inputImportarExcel"),
    modal: document.getElementById("modal"),
    btnFecharModal: document.getElementById("btnFecharModal"),
    formRegistro: document.getElementById("formRegistro"),
    registroId: document.getElementById("registroId"),
    registroData: document.getElementById("registroData"),
    atividade: document.getElementById("atividade"),
    descricao: document.getElementById("descricao"),
    inicio: document.getElementById("inicio"),
    fim: document.getElementById("fim"),
    total: document.getElementById("total"),
    observacao: document.getElementById("observacao"),
    contagemObs: document.getElementById("contagemObs"),
    modalTitulo: document.getElementById("modalTitulo"),
    modalSubtitulo: document.getElementById("modalSubtitulo"),
    btnCancelar: document.getElementById("btnCancelar"),
    btnSalvar: document.getElementById("btnSalvar"),
    btnExcluir: document.getElementById("btnExcluir"),
    erroForm: document.getElementById("erroForm"),
  };

  const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const dayLongFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function fromDateKey(key) {
    const [y, m, d] = key.split("-").map((x) => Number(x));
    return new Date(y, m - 1, d);
  }

  function minutesFromTime(value) {
    if (!value || typeof value !== "string") return null;
    const m = value.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function formatMinutes(totalMinutes) {
    const m = Math.max(0, Math.round(totalMinutes));
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return `${pad2(hh)}h${pad2(mm)}`;
  }

  function diffMinutes(start, end) {
    const s = minutesFromTime(start);
    const e = minutesFromTime(end);
    if (s === null || e === null) return null;
    let d = e - s;
    if (d < 0) d += 24 * 60;
    return d;
  }

  function cryptoId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function createDefaultStore() {
    return {
      version: 1,
      theme: inferTheme(),
      records: {},
      updatedAt: new Date().toISOString(),
    };
  }

  function inferTheme() {
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  }

  function normalizeStore(input) {
    const theme = input?.theme === "light" ? "light" : "dark";
    const records = typeof input?.records === "object" && input?.records ? input.records : {};
    const updatedAt = typeof input?.updatedAt === "string" ? input.updatedAt : "";
    const normalized = { version: 1, theme, records: {}, updatedAt };
    for (const [dateKey, arr] of Object.entries(records)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
      if (!Array.isArray(arr)) continue;
      const clean = [];
      for (const r of arr) {
        if (!r || typeof r !== "object") continue;
        const atividade = typeof r.atividade === "string" ? r.atividade.trim() : "";
        if (!atividade) continue;
        const inicio = typeof r.inicio === "string" ? r.inicio : "";
        const fim = typeof r.fim === "string" ? r.fim : "";
        const totalMin = Number.isFinite(r.totalMin) ? r.totalMin : diffMinutes(inicio, fim) ?? 0;
        clean.push({
          id: typeof r.id === "string" && r.id ? r.id : cryptoId(),
          atividade,
          descricao: typeof r.descricao === "string" ? r.descricao : "",
          inicio,
          fim,
          totalMin: Math.max(0, Math.round(totalMin)),
          observacao: typeof r.observacao === "string" ? r.observacao.slice(0, 10000) : "",
          criadoEm: typeof r.criadoEm === "string" ? r.criadoEm : new Date().toISOString(),
          atualizadoEm: typeof r.atualizadoEm === "string" ? r.atualizadoEm : new Date().toISOString(),
        });
      }
      if (clean.length) normalized.records[dateKey] = clean;
    }
    if (!normalized.updatedAt) normalized.updatedAt = new Date().toISOString();
    return normalized;
  }

  function cacheKeyFor(userId) {
    return `${STORAGE_PREFIX}:${userId}`;
  }

  function loadStore(cacheKey) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return createDefaultStore();
      const parsed = JSON.parse(raw);
      return normalizeStore(parsed);
    } catch {
      return createDefaultStore();
    }
  }

  function getToken() {
    return (localStorage.getItem(TOKEN_KEY) || "").trim();
  }

  function requireTokenOrRedirect() {
    const token = getToken();
    if (token) return token;
    window.location.href = "/login";
    return "";
  }

  async function apiRequest({ method, path, body }) {
    const token = requireTokenOrRedirect();
    if (!token) throw new Error("Não autenticado");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = "/login";
      }
      const msg = (typeof data === "string" && data) || data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function fetchMe() {
    const data = await apiRequest({ method: "GET", path: API_ME_PATH });
    return data?.user ?? null;
  }

  async function fetchUsers() {
    const data = await apiRequest({ method: "GET", path: API_USERS_PATH });
    return Array.isArray(data?.users) ? data.users : [];
  }

  function getSelectedUserId() {
    return (localStorage.getItem(ADMIN_SELECTED_USER_KEY) || "").trim();
  }

  function setSelectedUserId(value) {
    const v = String(value || "").trim();
    if (!v) localStorage.removeItem(ADMIN_SELECTED_USER_KEY);
    else localStorage.setItem(ADMIN_SELECTED_USER_KEY, v);
  }

  async function fetchStore({ userId }) {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const data = await apiRequest({ method: "GET", path: `${API_STORE_PATH}${qs}` });
    return data?.store ? normalizeStore(data.store) : null;
  }

  async function putStore({ userId, store }) {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    await apiRequest({ method: "PUT", path: `${API_STORE_PATH}${qs}`, body: { store } });
  }

  let pendingUploadTimer = null;

  function saveStore(cacheKey, { upload } = { upload: true }) {
    store.updatedAt = new Date().toISOString();
    localStorage.setItem(cacheKey, JSON.stringify(store));
    if (upload) scheduleUpload();
  }

  function scheduleUpload() {
    if (pendingUploadTimer) clearTimeout(pendingUploadTimer);
    pendingUploadTimer = setTimeout(async () => {
      pendingUploadTimer = null;
      try {
        await putStore({ userId: activeUserId, store });
      } catch {
      }
    }, 700);
  }

  function mondayIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  function isToday(date) {
    const t = new Date();
    return date.getFullYear() === t.getFullYear() && date.getMonth() === t.getMonth() && date.getDate() === t.getDate();
  }

  function startOfMonth(year, monthIndex) {
    return new Date(year, monthIndex, 1);
  }

  function addMonths(base, delta) {
    return new Date(base.getFullYear(), base.getMonth() + delta, 1);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    store.theme = theme;
    if (currentCacheKey) saveStore(currentCacheKey);
    el.btnTema.textContent = theme === "light" ? "Escuro" : "Claro";
    el.btnTema.title = theme === "light" ? "Mudar para tema escuro" : "Mudar para tema claro";
  }

  function openModal({ dateKey, record }) {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.erroForm.textContent = "";
    el.formRegistro.reset();
    el.registroData.value = dateKey;
    el.registroId.value = record?.id ?? "";
    el.atividade.value = record?.atividade ?? "";
    el.descricao.value = record?.descricao ?? "";
    el.inicio.value = record?.inicio ?? "";
    el.fim.value = record?.fim ?? "";
    el.observacao.value = record?.observacao ?? "";
    el.btnExcluir.hidden = !record;
    el.modalTitulo.textContent = record ? "Editar registro" : "Novo registro";
    el.modalSubtitulo.textContent = dayLongFmt.format(fromDateKey(dateKey));
    updateObsCount();
    updateTotalField();
    el.modal.classList.add("open");
    el.modal.setAttribute("aria-hidden", "false");
    setTimeout(() => el.atividade.focus(), 0);
  }

  function closeModal() {
    el.modal.classList.remove("open");
    el.modal.setAttribute("aria-hidden", "true");
    el.erroForm.textContent = "";
    if (lastFocus) lastFocus.focus();
  }

  function updateObsCount() {
    el.contagemObs.textContent = String(el.observacao.value.length);
  }

  function updateTotalField() {
    const d = diffMinutes(el.inicio.value, el.fim.value);
    el.total.value = d === null ? "" : formatMinutes(d);
  }

  function getRecordsForDay(dateKey) {
    return Array.isArray(store.records[dateKey]) ? store.records[dateKey] : [];
  }

  function setRecordsForDay(dateKey, arr) {
    if (!arr.length) {
      delete store.records[dateKey];
      return;
    }
    store.records[dateKey] = arr;
  }

  function sortDayRecords(arr) {
    const copy = [...arr];
    copy.sort((a, b) => {
      const am = minutesFromTime(a.inicio) ?? 999999;
      const bm = minutesFromTime(b.inicio) ?? 999999;
      if (am !== bm) return am - bm;
      return String(a.atividade).localeCompare(String(b.atividade), "pt-BR");
    });
    return copy;
  }

  function upsertRecord(dateKey, record) {
    const arr = getRecordsForDay(dateKey);
    const idx = arr.findIndex((x) => x.id === record.id);
    const next = [...arr];
    if (idx >= 0) next[idx] = record;
    else next.push(record);
    setRecordsForDay(dateKey, sortDayRecords(next));
  }

  function deleteRecord(dateKey, recordId) {
    const arr = getRecordsForDay(dateKey);
    const next = arr.filter((x) => x.id !== recordId);
    setRecordsForDay(dateKey, next);
  }

  function dayTotalMinutes(dateKey) {
    return getRecordsForDay(dateKey).reduce((sum, r) => sum + (Number(r.totalMin) || 0), 0);
  }

  function monthTotals(year, monthIndex) {
    let totalMin = 0;
    let registros = 0;
    for (const [dateKey, list] of Object.entries(store.records)) {
      if (!Array.isArray(list) || !list.length) continue;
      const d = fromDateKey(dateKey);
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      registros += list.length;
      totalMin += list.reduce((s, r) => s + (Number(r.totalMin) || 0), 0);
    }
    return { totalMin, registros };
  }

  function render() {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const title = monthFmt.format(viewDate);
    el.tituloMes.textContent = title.charAt(0).toUpperCase() + title.slice(1);

    const mt = monthTotals(y, m);
    const totalMesTxt = formatMinutes(mt.totalMin);
    el.resumoMes.textContent = `${mt.registros} registro(s) • Total do mês: ${totalMesTxt}`;

    const first = startOfMonth(y, m);
    const offset = mondayIndex(first);
    const start = new Date(y, m, 1 - offset);

    el.gridDias.innerHTML = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const dateKey = toDateKey(d);
      const inMonth = d.getMonth() === m;
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const records = getRecordsForDay(dateKey);
      const hasRecords = records.length > 0;

      const dayEl = document.createElement("div");
      dayEl.className =
        "day" +
        (inMonth ? "" : " out") +
        (isToday(d) ? " today" : "") +
        (weekend ? " weekend" : "") +
        (hasRecords ? " has-records" : "");
      dayEl.dataset.date = dateKey;
      dayEl.setAttribute("role", "gridcell");

      const top = document.createElement("div");
      top.className = "day-top";

      const titleEl = document.createElement("div");
      titleEl.className = "day-title";
      titleEl.textContent = `Dia ${pad2(d.getDate())}`;

      const actions = document.createElement("div");
      actions.className = "day-actions";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn add";
      addBtn.title = "Novo Registro";
      addBtn.setAttribute("aria-label", "Novo Registro");
      addBtn.textContent = "+";
      addBtn.addEventListener("click", () => openModal({ dateKey, record: null }));

      actions.appendChild(addBtn);
      top.appendChild(titleEl);
      top.appendChild(actions);

      const listEl = document.createElement("div");
      listEl.className = "activities";

      for (const r of records) {
        const row = el.tplAtividade.content.firstElementChild.cloneNode(true);
        const mainBtn = row.querySelector(".activity-main");
        const nameEl = row.querySelector(".activity-name");
        const timeEl = row.querySelector(".activity-time");
        const delBtn = row.querySelector(".activity-del");

        nameEl.textContent = r.atividade;
        timeEl.textContent = formatMinutes(r.totalMin || 0);

        mainBtn.addEventListener("click", () => openModal({ dateKey, record: r }));
        delBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const ok = confirm(`Excluir "${r.atividade}" (${formatMinutes(r.totalMin || 0)})?`);
          if (!ok) return;
          deleteRecord(dateKey, r.id);
          saveStore(currentCacheKey);
          render();
        });

        listEl.appendChild(row);
      }

      const totalEl = document.createElement("div");
      totalEl.className = "day-total";
      const label = document.createElement("span");
      label.textContent = "Total do dia:";
      const value = document.createElement("strong");
      value.textContent = formatMinutes(dayTotalMinutes(dateKey));
      totalEl.appendChild(label);
      totalEl.appendChild(value);

      dayEl.appendChild(top);
      dayEl.appendChild(listEl);
      dayEl.appendChild(totalEl);
      el.gridDias.appendChild(dayEl);
    }
  }

  function exportJson() {
    const payload = JSON.stringify(store, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gdp_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadTextFile({ filename, mimeType, text }) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function normalizeHeader(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "");
  }

  function csvEscape(value, delimiter) {
    const s = String(value ?? "");
    const needsQuotes = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  }

  function exportCsvMonth() {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const monthKey = `${y}-${pad2(m + 1)}`;
    const delimiter = ";";
    const headers = [
      "Data",
      "Id",
      "Atividade",
      "Descrição",
      "Início",
      "Fim",
      "TotalMin",
      "Total",
      "Observação",
      "CriadoEm",
      "AtualizadoEm",
    ];

    const rows = [];
    for (const [dateKey, list] of Object.entries(store.records)) {
      const d = fromDateKey(dateKey);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        const totalMin = Number(r.totalMin) || 0;
        rows.push([
          dateKey,
          r.id ?? "",
          r.atividade ?? "",
          r.descricao ?? "",
          r.inicio ?? "",
          r.fim ?? "",
          String(totalMin),
          formatMinutes(totalMin),
          r.observacao ?? "",
          r.criadoEm ?? "",
          r.atualizadoEm ?? "",
        ]);
      }
    }

    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[4]).localeCompare(String(b[4])));

    const lines = [];
    lines.push(headers.map((h) => csvEscape(h, delimiter)).join(delimiter));
    for (const row of rows) {
      lines.push(row.map((v) => csvEscape(v, delimiter)).join(delimiter));
    }

    const bom = "\ufeff";
    const text = bom + lines.join("\r\n");
    downloadTextFile({
      filename: `gdp_${monthKey}.csv`,
      mimeType: "text/csv;charset=utf-8",
      text,
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatMinutesPrint(totalMinutes) {
    const m = Math.max(0, Math.round(totalMinutes));
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  function generateMonthReportHtml() {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const monthTitleRaw = monthFmt.format(viewDate);
    const monthTitle = monthTitleRaw.charAt(0).toUpperCase() + monthTitleRaw.slice(1);
    const monthKey = `${y}-${pad2(m + 1)}`;

    const lastDay = new Date(y, m + 1, 0).getDate();
    let monthTotalMin = 0;
    const daySections = [];

    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(y, m, day);
      const dateKey = toDateKey(d);
      const list = getRecordsForDay(dateKey);
      if (!list.length) continue;

      const totalDayMin = list.reduce((s, r) => s + (Number(r.totalMin) || 0), 0);
      monthTotalMin += totalDayMin;

      const rows = list
        .map((r) => {
          const totalMin = Number(r.totalMin) || 0;
          return `
            <tr>
              <td class="col-atividade">${escapeHtml(r.atividade)}</td>
              <td class="col-time">${escapeHtml(r.inicio)}</td>
              <td class="col-time">${escapeHtml(r.fim)}</td>
              <td class="col-total">${escapeHtml(formatMinutesPrint(totalMin))}</td>
            </tr>
          `;
        })
        .join("");

      daySections.push(`
        <section class="day">
          <div class="day-head">
            <div class="day-title">Dia ${escapeHtml(pad2(day))}</div>
          </div>
          <table class="table" aria-label="Registros do dia ${escapeHtml(pad2(day))}">
            <thead>
              <tr>
                <th>Atividade</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
            <tfoot>
              <tr>
                <td class="tfoot-label" colspan="3">Total do dia</td>
                <td class="col-total tfoot-total">${escapeHtml(formatMinutesPrint(totalDayMin))}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      `);
    }

    const emptyHtml = `
      <div class="empty">
        Nenhum registro encontrado para <strong>${escapeHtml(monthTitle)}</strong>.
      </div>
    `;

    const content = daySections.length ? daySections.join("") : emptyHtml;

    const bg = store.theme === "light" ? "#ffffff" : "#0f131c";
    const text = store.theme === "light" ? "#0f172a" : "rgba(255,255,255,.92)";
    const muted = store.theme === "light" ? "rgba(15,23,42,.62)" : "rgba(255,255,255,.70)";
    const border = store.theme === "light" ? "rgba(15,23,42,.16)" : "rgba(255,255,255,.16)";

    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GDP — ${escapeHtml(monthTitle)}</title>
    <style>
      :root{ color-scheme: light; }
      *{ box-sizing: border-box; }
      html,body{ height: 100%; }
      body{
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif;
        background: ${bg};
        color: ${text};
      }
      .wrap{ max-width: 980px; margin: 0 auto; padding: 22px 20px 40px; }
      .head{
        display:flex;
        align-items:flex-end;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid ${border};
        margin-bottom: 18px;
      }
      h1{ font-size: 22px; margin: 0; letter-spacing: .2px; }
      .meta{ color: ${muted}; font-size: 12px; text-align: right; }
      .month-total{
        margin-top: 6px;
        font-size: 13px;
        color: ${muted};
      }
      .month-total strong{ color: ${text}; }
      .day{ margin: 14px 0 18px; break-inside: avoid; }
      .day-head{
        display:flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .day-title{ font-weight: 800; }
      .table{
        width: 100%;
        border-collapse: collapse;
        border: 1px solid ${border};
        border-radius: 10px;
        overflow: hidden;
      }
      th, td{
        text-align: left;
        padding: 9px 10px;
        border-bottom: 1px solid ${border};
        vertical-align: top;
        font-size: 13px;
      }
      th{ font-size: 12px; color: ${muted}; letter-spacing: .2px; }
      tr:last-child td{ border-bottom: none; }
      .col-time, .col-total{ white-space: nowrap; }
      .col-total{ text-align: right; font-weight: 700; }
      tfoot td{
        border-top: 1px solid ${border};
        font-weight: 800;
      }
      .tfoot-label{
        color: ${muted};
        font-weight: 700;
      }
      .empty{
        padding: 14px 12px;
        border: 1px dashed ${border};
        border-radius: 12px;
        color: ${muted};
      }
      @media print{
        @page{ margin: 12mm; }
        .wrap{ max-width: none; padding: 0; }
        .day{ break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="head">
        <div>
          <h1>GDP — ${escapeHtml(monthTitle)}</h1>
          <div class="month-total">Total do mês: <strong>${escapeHtml(formatMinutesPrint(monthTotalMin))}</strong></div>
        </div>
        <div class="meta">
          Mês: ${escapeHtml(monthKey)}
        </div>
      </header>
      ${content}
    </div>
    <script>
      window.addEventListener("load", () => setTimeout(() => window.print(), 80));
    </script>
  </body>
</html>`;
  }

  function openMonthPdf() {
    const html = generateMonthReportHtml();
    const w = window.open("", "_blank");
    if (!w) {
      alert("Não foi possível abrir a janela do PDF. Verifique se o bloqueador de pop-ups está ativo.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  function parseCsv(text) {
    const s = String(text ?? "").replace(/^\uFEFF/, "");
    const firstLine = s.split(/\r?\n/)[0] ?? "";
    const semiCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = semiCount >= commaCount ? ";" : ",";

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const next = s[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          field += '"';
          i++;
          continue;
        }
        if (ch === '"') {
          inQuotes = false;
          continue;
        }
        field += ch;
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }

      if (ch === delimiter) {
        row.push(field);
        field = "";
        continue;
      }

      if (ch === "\r" && next === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      field += ch;
    }

    row.push(field);
    rows.push(row);

    const trimmed = rows
      .map((r) => r.map((c) => String(c ?? "").trim()))
      .filter((r) => r.some((c) => c.length > 0));

    return { delimiter, rows: trimmed };
  }

  async function importCsvFile(file) {
    const text = await file.text();
    const parsed = parseCsv(text);
    const rows = parsed.rows;
    if (rows.length < 2) throw new Error("CSV vazio");

    const headerRow = rows[0];
    const headerIndex = new Map();
    for (let i = 0; i < headerRow.length; i++) {
      const key = normalizeHeader(headerRow[i]);
      if (!key) continue;
      if (!headerIndex.has(key)) headerIndex.set(key, i);
    }

    function pick(row, keyVariants) {
      for (const k of keyVariants) {
        const idx = headerIndex.get(normalizeHeader(k));
        if (typeof idx === "number") return row[idx] ?? "";
      }
      return "";
    }

    const monthSet = new Set();
    let imported = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const dateKey = pick(r, ["Data", "Dia", "DataISO"]).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        skipped++;
        continue;
      }
      monthSet.add(dateKey.slice(0, 7));

      const atividade = pick(r, ["Atividade", "AtividadeNome", "Nome"]).trim();
      const inicio = pick(r, ["Início", "Inicio"]).trim();
      const fim = pick(r, ["Fim"]).trim();
      if (!atividade) {
        skipped++;
        continue;
      }
      if (minutesFromTime(inicio) === null || minutesFromTime(fim) === null) {
        skipped++;
        continue;
      }

      const id = pick(r, ["Id", "ID", "Uuid", "UUID"]).trim() || cryptoId();
      const descricao = pick(r, ["Descrição", "Descricao"]).trim();
      const observacao = pick(r, ["Observação", "Observacao", "Obs"]).slice(0, 10000);
      const totalMinRaw = pick(r, ["TotalMin", "TotalMinutos", "Minutos"]).trim();
      const totalMinParsed = totalMinRaw ? Number(totalMinRaw) : NaN;
      const totalMin = Number.isFinite(totalMinParsed) ? Math.max(0, Math.round(totalMinParsed)) : diffMinutes(inicio, fim) ?? 0;

      const criadoEm = pick(r, ["CriadoEm", "Criado", "Criacao"]).trim() || nowIso;
      const atualizadoEm = pick(r, ["AtualizadoEm", "Atualizado", "Atualizacao"]).trim() || nowIso;
      const existing = getRecordsForDay(dateKey).find((x) => x.id === id);

      upsertRecord(dateKey, {
        id,
        atividade,
        descricao,
        inicio,
        fim,
        totalMin,
        observacao,
        criadoEm: existing?.criadoEm ?? criadoEm,
        atualizadoEm,
      });

      imported++;
    }

    saveStore(currentCacheKey);
    render();

    const months = [...monthSet].sort();
    const monthsTxt = months.length ? months.join(", ") : "—";
    alert(`Importação concluída.\nImportados: ${imported}\nIgnorados: ${skipped}\nMês(es) no arquivo: ${monthsTxt}`);
  }

  async function importJsonFile(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeStore(parsed);
    store = normalized;
    saveStore(currentCacheKey);
    setTheme(store.theme);
    render();
  }

  function showFormError(msg) {
    el.erroForm.textContent = msg;
  }

  function clearFormError() {
    el.erroForm.textContent = "";
  }

  let currentUser = null;
  let activeUserId = "";
  let currentCacheKey = "";

  let store = createDefaultStore();
  let viewDate = startOfMonth(new Date().getFullYear(), new Date().getMonth());
  let lastFocus = null;

  function storeUserIdParam() {
    if (currentUser && currentUser.admin) return activeUserId;
    return null;
  }

  async function refreshFromRemote() {
    try {
      const remote = await fetchStore({ userId: storeUserIdParam() });
      if (!remote) return;
      if (String(remote.updatedAt || "") > String(store.updatedAt || "")) {
        store = remote;
        saveStore(currentCacheKey, { upload: false });
        setTheme(store.theme);
        render();
      }
    } catch {
    }
  }

  async function setActiveUserId(userId) {
    activeUserId = userId;
    currentCacheKey = cacheKeyFor(userId);
    store = loadStore(currentCacheKey);
    setTheme(store.theme);
    render();
    await refreshFromRemote();
  }

  async function initAdminLookup() {
    if (!currentUser?.admin) return;
    const users = await fetchUsers();
    const selected = getSelectedUserId();
    const byId = new Map(users.map(u => [u.id, u]));
    const initial = selected && byId.has(selected) ? selected : currentUser.id;
    setSelectedUserId(initial);

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "8px";

    const label = document.createElement("div");
    label.textContent = "Usuário:";
    label.className = "muted";
    label.style.fontSize = "12px";

    const select = document.createElement("select");
    select.className = "btn";
    select.style.padding = "10px 12px";
    select.style.height = "42px";

    for (const u of users) {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = u.username;
      select.appendChild(opt);
    }
    select.value = initial;
    select.addEventListener("change", async () => {
      const next = select.value;
      setSelectedUserId(next);
      await setActiveUserId(next);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    const toolbar = document.querySelector(".toolbar");
    if (toolbar) toolbar.prepend(wrapper);
  }

  el.btnMesAnterior.addEventListener("click", () => {
    viewDate = addMonths(viewDate, -1);
    render();
  });
  el.btnMesProximo.addEventListener("click", () => {
    viewDate = addMonths(viewDate, 1);
    render();
  });
  el.btnHoje.addEventListener("click", () => {
    const now = new Date();
    viewDate = startOfMonth(now.getFullYear(), now.getMonth());
    render();
  });
  el.btnTema.addEventListener("click", () => {
    setTheme(store.theme === "light" ? "dark" : "light");
  });
  el.btnExportarExcel.addEventListener("click", exportCsvMonth);
  el.btnPdfMes.addEventListener("click", openMonthPdf);

  el.modal.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.close === "true") closeModal();
  });
  el.btnFecharModal.addEventListener("click", closeModal);
  el.btnCancelar.addEventListener("click", closeModal);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && el.modal.classList.contains("open")) closeModal();
  });

  el.inicio.addEventListener("input", () => {
    updateTotalField();
    clearFormError();
  });
  el.fim.addEventListener("input", () => {
    updateTotalField();
    clearFormError();
  });
  el.observacao.addEventListener("input", updateObsCount);
  el.atividade.addEventListener("input", clearFormError);

  el.formRegistro.addEventListener("submit", (ev) => {
    ev.preventDefault();
    clearFormError();

    const dateKey = el.registroData.value;
    const id = el.registroId.value || cryptoId();
    const atividade = el.atividade.value.trim();
    const descricao = el.descricao.value.trim();
    const inicio = el.inicio.value;
    const fim = el.fim.value;
    const observacao = el.observacao.value.slice(0, 10000);
    const totalMin = diffMinutes(inicio, fim);

    if (!dateKey) return;
    if (!atividade) return showFormError("Informe a atividade.");
    if (minutesFromTime(inicio) === null) return showFormError("Informe um horário de início válido.");
    if (minutesFromTime(fim) === null) return showFormError("Informe um horário de fim válido.");
    if (totalMin === null) return showFormError("Não foi possível calcular o total.");

    const nowIso = new Date().toISOString();
    const existing = getRecordsForDay(dateKey).find((x) => x.id === id);

    const record = {
      id,
      atividade,
      descricao,
      inicio,
      fim,
      totalMin,
      observacao,
      criadoEm: existing?.criadoEm ?? nowIso,
      atualizadoEm: nowIso,
    };

    upsertRecord(dateKey, record);
    saveStore(currentCacheKey);
    render();
    closeModal();
  });

  el.btnExcluir.addEventListener("click", () => {
    const dateKey = el.registroData.value;
    const id = el.registroId.value;
    if (!dateKey || !id) return;
    const r = getRecordsForDay(dateKey).find((x) => x.id === id);
    const ok = confirm(`Excluir "${r?.atividade ?? "registro"}"?`);
    if (!ok) return;
    deleteRecord(dateKey, id);
    saveStore(currentCacheKey);
    render();
    closeModal();
  });

  (async () => {
    try {
      currentUser = await fetchMe();
      if (!currentUser?.id) return;
      await initAdminLookup();
      const initialUserId = currentUser.admin ? getSelectedUserId() || currentUser.id : currentUser.id;
      await setActiveUserId(initialUserId);
    } catch {
    }
  })();
})();
