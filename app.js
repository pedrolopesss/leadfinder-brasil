const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "leadfinder-brasil-leads-v1";

let currentResults = [];
let savedLeads = loadSaved();
let installPrompt = null;

const SEGMENTS = {
  all: { label: "Todos os segmentos", filter: null },
  restaurant: { label: "Restaurantes e lanchonetes", filter: '["amenity"~"restaurant|fast_food|cafe|bar|food_court"]' },
  beauty: { label: "Barbearias e salões", filter: '["shop"~"hairdresser|beauty"]' },
  health: { label: "Clínicas e saúde", filter: '["amenity"~"doctors|dentist|clinic|veterinary"]' },
  auto: { label: "Oficinas e automotivo", filter: '["shop"~"car_repair|tyres|car"]' },
  retail: { label: "Lojas e comércio", filter: '["shop"]' },
  services: { label: "Serviços profissionais", filter: '["office"]' },
  lodging: { label: "Hotéis e hospedagem", filter: '["tourism"~"hotel|guest_house|hostel|motel"]' },
  fitness: { label: "Academias e fitness", filter: '["leisure"~"fitness_centre|sports_centre"]' }
};

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistSaved() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLeads));
  updateStats();
  renderSaved();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function normalize(s = "") {
  return s.toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function setStatus(message, type = "") {
  const el = $("status");
  el.textContent = message;
  el.className = "status" + (type ? " " + type : "");
}

function hideStatus() {
  $("status").className = "status hidden";
}

function setBusy(busy) {
  $("searchBtn").disabled = busy;
  $("searchBtn").textContent = busy
    ? "Buscando empresas…"
    : "⌕  Buscar empresas";
}

function websiteOf(t) {
  return t.website || t["contact:website"] || t.url || t["contact:url"] || "";
}

function phoneOf(t) {
  return t.phone || t["contact:phone"] || t.mobile || t["contact:mobile"] || "";
}

function addressOf(t) {
  const parts = [
    t["addr:housenumber"],
    t["addr:street"],
    t["addr:suburb"],
    t["addr:city"],
    t["addr:state"]
  ].filter(Boolean);

  return parts.join(", ");
}

function elementId(el) {
  return `${el.type}/${el.id}`;
}

function makeLead(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  return {
    id: elementId(el),
    name: t.name || t.brand || t.operator || "Negócio sem nome cadastrado",
    category: classify(t),
    website: websiteOf(t),
    phone: phoneOf(t),
    address: addressOf(t),
    city: $("city").value.trim(),
    lat,
    lon,
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    updatedAt: new Date().toISOString()
  };
}

function classify(t) {
  const keys = ["amenity", "shop", "office", "tourism", "leisure", "craft"];

  for (const k of keys) {
    if (t[k]) return `${k}: ${t[k].replaceAll("_", " ")}`;
  }

  return "Negócio local";
}

function dedupe(list) {
  const seen = new Set();

  return list.filter(x => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

async function geocode(city) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(city)}`;

  const response = await fetch(url, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error("Não foi possível localizar essa cidade agora.");
  }

  const data = await response.json();

  if (!data.length) {
    throw new Error(
      "Não encontrei essa cidade. Informe cidade e estado, por exemplo: Vila Velha, Espírito Santo."
    );
  }

  return data[0];
}

function buildQuery(lat, lon, radius, segment) {
  const selected = SEGMENTS[segment];

  if (segment === "all") {
    return `[out:json][timeout:35];(
      nwr(around:${radius},${lat},${lon})["name"]["shop"];
      nwr(around:${radius},${lat},${lon})["name"]["amenity"];
      nwr(around:${radius},${lat},${lon})["name"]["office"];
      nwr(around:${radius},${lat},${lon})["name"]["tourism"];
      nwr(around:${radius},${lat},${lon})["name"]["leisure"];
    );out center tags;`;
  }

  return `[out:json][timeout:35];nwr(around:${radius},${lat},${lon})${selected.filter}["name"];out center tags;`;
}

async function queryOverpass(query) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: "data=" + encodeURIComponent(query)
      });

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "O serviço está recebendo muitas buscas. Aguarde um minuto e tente novamente."
            : `Serviço de busca respondeu com erro (${response.status}).`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.elements)) {
        throw new Error("A resposta da busca veio em formato inesperado.");
      }

      return data.elements;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Não foi possível acessar a base pública agora.");
}

/* PRIORIZAÇÃO DE OPORTUNIDADES */

function hasWebsite(lead) {
  return Boolean((lead.website || "").trim());
}

function prospectingPriority(lead) {
  let score = 0;

  // A ausência de site cadastrado é um sinal para investigar,
  // não uma confirmação de que a empresa não possui site.
  if (!hasWebsite(lead)) score += 3;
  if (lead.phone) score += 2;
  if (lead.address) score += 1;

  return score;
}

function sortProspects(list) {
  return [...list].sort((a, b) =>
    prospectingPriority(b) - prospectingPriority(a) ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}

/* ABORDAGEM COMERCIAL PERSONALIZADA */

function outreachMessage(lead) {
  const name = lead.name || "tudo bem";
  const greeting = `Olá, ${name}! Tudo bem?`;

  return `${greeting}

Meu nome é [SEU NOME] e trabalho com criação de sites profissionais para empresas.

Encontrei o negócio de vocês enquanto pesquisava empresas da região e gostaria de apresentar uma ideia que pode ajudar a fortalecer a presença da empresa na internet.

Um site profissional pode facilitar o contato com clientes, apresentar os serviços e transmitir mais confiança para quem pesquisa a empresa online.

Posso te mostrar uma ideia de como ficaria um site para vocês, sem compromisso?

Obrigado pela atenção!`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      textarea.remove();

      if (!copied) throw new Error("Não foi possível copiar.");
    }

    setStatus("Abordagem copiada! Agora é só colar na conversa com a empresa.", "success");
  } catch {
    // Alternativa para navegadores que bloqueiam a área de transferência.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (copied) {
      setStatus("Abordagem copiada! Cole a mensagem na conversa.", "success");
    } else {
      window.prompt("Copie sua abordagem abaixo:", text);
    }
  }
}

function copyApproach(id, source = "results") {
  const list = source === "saved" ? savedLeads : currentResults;
  const lead = list.find(x => x.id === id);

  if (!lead) {
    setStatus("Não consegui localizar esse lead.", "error");
    return;
  }

  copyText(outreachMessage(lead));
}

async function runSearch(e) {
  e.preventDefault();
  hideStatus();
  setBusy(true);

  $("results").innerHTML =
    '<div class="empty-state"><h4>Buscando negócios na região…</h4><p>Isso pode levar alguns segundos. Não feche a página.</p></div>';

  try {
    const city = $("city").value.trim();
    const radius = Number($("radius").value);
    const segment = $("segment").value;

    setStatus("Localizando a cidade e consultando dados públicos do OpenStreetMap.");

    const place = await geocode(city);
    const query = buildQuery(Number(place.lat), Number(place.lon), radius, segment);
    const elements = await queryOverpass(query);

    currentResults = dedupe(elements.map(makeLead))
      .filter(x => x.name !== "Negócio sem nome cadastrado");

    currentResults = sortProspects(currentResults);

    renderResults();
    updateStats();

    if (currentResults.length) {
      const withoutSite = currentResults.filter(x => !hasWebsite(x)).length;

      setStatus(
        `Busca concluída: ${currentResults.length} empresas encontradas. ${withoutSite} sem site informado na base consultada. Confirme as informações antes de abordar os negócios.`,
        "success"
      );
    } else {
      setStatus(
        "A busca não retornou empresas com nome nesse raio. Tente ampliar o raio ou escolher outro segmento."
      );
    }
  } catch (err) {
    currentResults = [];
    renderResults();
    updateStats();

    setStatus(
      `${err.message || "Ocorreu um erro inesperado."} Verifique sua conexão e tente novamente mais tarde.`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

function filteredResults() {
  const filter = $("filter").value;

  if (filter === "no-site") {
    return currentResults.filter(x => !hasWebsite(x));
  }

  if (filter === "with-site") {
    return currentResults.filter(x => hasWebsite(x));
  }

  return currentResults;
}

function isSaved(id) {
  return savedLeads.some(x => x.id === id);
}

function googleSearchUrl(name, city, extra = "") {
  return "https://www.google.com/search?q=" +
    encodeURIComponent(`${name} ${city || ""} ${extra}`.trim());
}

function safeUrl(url) {
  let value = (url || "").trim();

  if (!/^https?:\/\//i.test(value)) {
    value = "https://" + value;
  }

  try {
    return new URL(value).href;
  } catch {
    return "#";
  }
}

function phoneLink(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  return digits ? "https://wa.me/" + digits : "#";
}

function renderResults() {
  const list = filteredResults();
  const root = $("results");

  if (!list.length) {
    root.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⌕</div>
      <h4>${currentResults.length ? "Nenhuma empresa neste filtro" : "Nenhum resultado ainda"}</h4>
      <p>${currentResults.length ? "Experimente outro filtro." : "Faça uma busca por cidade e segmento para começar."}</p>
    </div>`;
    return;
  }

  root.innerHTML = list.map(x => {
    const noSite = !hasWebsite(x);

    return `
      <article class="lead-card">
        <div class="lead-avatar">${escapeHtml((x.name || "?").slice(0, 1).toUpperCase())}</div>

        <div class="lead-main">
          <h4 class="lead-title">${escapeHtml(x.name)}</h4>

          <div class="lead-meta">
            ${escapeHtml(x.category)}
            ${x.address ? ` · ${escapeHtml(x.address)}` : ""}
            ${x.phone ? `<br>Telefone: ${escapeHtml(x.phone)}` : ""}
          </div>

          <div class="lead-tags">
            <span class="tag ${noSite ? "no-site" : "has-site"}">
              ${noSite ? "Sem site informado" : "Site informado"}
            </span>

            ${noSite ? '<span class="tag">Oportunidade para investigar</span>' : ""}
            ${x.phone ? '<span class="tag">Telefone disponível</span>' : ""}
          </div>

          <div class="lead-links">
            ${x.website ? `<a href="${escapeHtml(safeUrl(x.website))}" target="_blank" rel="noopener noreferrer">Abrir site ↗</a>` : ""}

            ${x.phone ? `<a href="${escapeHtml(phoneLink(x.phone))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>` : ""}

            <a href="${escapeHtml(googleSearchUrl(x.name, x.city, "telefone contato WhatsApp"))}" target="_blank" rel="noopener noreferrer">Buscar telefone ↗</a>

            <a href="${escapeHtml(googleSearchUrl(x.name, x.city))}" target="_blank" rel="noopener noreferrer">Ver empresa no Google ↗</a>

            <a href="${escapeHtml(googleSearchUrl(x.name, x.city, "Instagram oficial"))}" target="_blank" rel="noopener noreferrer">Buscar Instagram ↗</a>

            <a href="${escapeHtml(x.osmUrl)}" target="_blank" rel="noopener noreferrer">Ver no OpenStreetMap ↗</a>

            ${x.lat != null && x.lon != null ? `<a href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lon}" target="_blank" rel="noopener noreferrer">Mapa ↗</a>` : ""}
          </div>
        </div>

        <div class="lead-actions">
          <button type="button" class="mini-btn" data-copy="${escapeHtml(x.id)}">Copiar abordagem</button>
          <button type="button" class="mini-btn ${isSaved(x.id) ? "saved" : ""}" data-save="${escapeHtml(x.id)}">
            ${isSaved(x.id) ? "✓ Salvo" : "+ Salvar"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  root.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", () => saveLead(btn.dataset.save));
  });

  root.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => copyApproach(btn.dataset.copy, "results"));
  });
}

function saveLead(id) {
  const lead = currentResults.find(x => x.id === id);

  if (!lead) return;

  if (isSaved(id)) {
    setStatus("Esse lead já está salvo.");
    return;
  }

  savedLeads.unshift({
    ...lead,
    savedAt: new Date().toISOString(),
    stage: "Novo"
  });

  persistSaved();
  renderResults();
  setStatus(`${lead.name} foi salvo na sua lista.`, "success");
}

function renderSaved() {
  $("savedBadge").textContent =
    `${savedLeads.length} ${savedLeads.length === 1 ? "lead" : "leads"}`;

  const root = $("savedResults");

  if (!savedLeads.length) {
    root.innerHTML =
      '<p class="muted empty-saved">Você ainda não salvou leads. Salve empresas para montar sua lista de prospecção.</p>';
    return;
  }

  root.innerHTML = savedLeads.map(x => {
    const noSite = !hasWebsite(x);

    return `
      <article class="lead-card">
        <div class="lead-avatar">${escapeHtml((x.name || "?").slice(0, 1).toUpperCase())}</div>

        <div class="lead-main">
          <h4 class="lead-title">${escapeHtml(x.name)}</h4>

          <div class="lead-meta">
            ${escapeHtml(x.category)}
            ${x.phone ? ` · ${escapeHtml(x.phone)}` : ""}
            ${x.address ? `<br>${escapeHtml(x.address)}` : ""}
          </div>

          <div class="lead-tags">
            <span class="tag ${noSite ? "no-site" : "has-site"}">
              ${noSite ? "Sem site informado" : "Site informado"}
            </span>
            ${noSite ? '<span class="tag">Oportunidade para investigar</span>' : ""}
            <span class="tag">${escapeHtml(x.stage || "Novo")}</span>
          </div>

          <div class="lead-links">
            ${x.phone ? `<a href="${escapeHtml(phoneLink(x.phone))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>` : ""}

            ${x.website ? `<a href="${escapeHtml(safeUrl(x.website))}" target="_blank" rel="noopener noreferrer">Site ↗</a>` : ""}

            <a href="${escapeHtml(googleSearchUrl(x.name, x.city || x.address, "telefone contato WhatsApp"))}" target="_blank" rel="noopener noreferrer">Buscar telefone ↗</a>

            <a href="${escapeHtml(googleSearchUrl(x.name, x.city || x.address))}" target="_blank" rel="noopener noreferrer">Ver empresa no Google ↗</a>

            <a href="${escapeHtml(googleSearchUrl(x.name, x.city || x.address, "Instagram oficial"))}" target="_blank" rel="noopener noreferrer">Buscar Instagram ↗</a>

            <a href="${escapeHtml(x.osmUrl || "#")}" target="_blank" rel="noopener noreferrer">Fonte ↗</a>
          </div>
        </div>

        <div class="lead-actions">
          <button type="button" class="mini-btn" data-copy-saved="${escapeHtml(x.id)}">Copiar abordagem</button>
          <button type="button" class="mini-btn" data-stage="${escapeHtml(x.id)}">Alterar etapa</button>
          <button type="button" class="mini-btn" data-remove="${escapeHtml(x.id)}">Remover</button>
        </div>
      </article>
    `;
  }).join("");

  root.querySelectorAll("[data-copy-saved]").forEach(btn => {
    btn.addEventListener("click", () => copyApproach(btn.dataset.copySaved, "saved"));
  });

  root.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      savedLeads = savedLeads.filter(x => x.id !== btn.dataset.remove);
      persistSaved();
      renderResults();
    });
  });

  root.querySelectorAll("[data-stage]").forEach(btn => {
    btn.addEventListener("click", () => {
      const lead = savedLeads.find(x => x.id === btn.dataset.stage);
      if (!lead) return;

      const stages = [
        "Novo",
        "Contato feito",
        "Respondeu",
        "Em negociação",
        "Convertido",
        "Sem interesse"
      ];

      lead.stage = stages[(stages.indexOf(lead.stage) + 1) % stages.length];
      persistSaved();
    });
  });
}

function updateStats() {
  $("foundCount").textContent = currentResults.length;
  $("noSiteCount").textContent = currentResults.filter(x => !hasWebsite(x)).length;
  $("savedCount").textContent = savedLeads.length;
}

function csvEscape(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function exportCSV(list, filename) {
  if (!list.length) {
    setStatus("Não há leads para exportar ainda.");
    return;
  }

  const headers = [
    "Nome",
    "Segmento",
    "Site informado",
    "Telefone",
    "Endereço",
    "Latitude",
    "Longitude",
    "Etapa",
    "Fonte"
  ];

  const rows = list.map(x => [
    x.name,
    x.category,
    x.website,
    x.phone,
    x.address,
    x.lat,
    x.lon,
    x.stage || "Novo",
    x.osmUrl
  ]);

  const csv = "\uFEFF" +
    [headers, ...rows].map(row => row.map(csvEscape).join(";")).join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("searchForm").addEventListener("submit", runSearch);
$("filter").addEventListener("change", renderResults);

$("exportBtn").addEventListener("click", () =>
  exportCSV(filteredResults(), "leadfinder-resultados.csv")
);

$("exportSavedBtn").addEventListener("click", () =>
  exportCSV(savedLeads, "leadfinder-leads-salvos.csv")
);

$("clearSavedBtn").addEventListener("click", () => {
  if (!savedLeads.length) return;

  if (confirm("Tem certeza que deseja apagar todos os leads salvos deste dispositivo?")) {
    savedLeads = [];
    persistSaved();
    renderResults();
  }
});

updateStats();
renderSaved();

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  installPrompt = e;
  $("installBtn").classList.remove("hidden");
});

$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) {
    setStatus("No Android, abra o menu do navegador e escolha 'Instalar app' ou 'Adicionar à tela inicial'.");
    return;
  }

  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("installBtn").classList.add("hidden");
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
      }
