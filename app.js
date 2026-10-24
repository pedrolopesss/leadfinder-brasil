
"use strict";

const $ = id => document.getElementById(id);
const STORAGE_KEY = "leadfinder-brasil-leads-v1";
const STAGES = [
  "Novo",
  "Contato feito",
  "Respondeu",
  "Em negociação",
  "Convertido",
  "Sem interesse"
];

let currentResults = [];
let savedLeads = loadSaved();
let installPrompt = null;
let activePipelineStage = null;

const SEGMENTS = {
  all: { label: "Todos os segmentos", filter: null },
  restaurant: { label: "Restaurantes e lanchonetes", filter: '["amenity"~"restaurant|fast_food|cafe|bar|food_court"]' },
  acai: { label: "Açaíterias e lojas de açaí", filters: [
    '["name"~"acai|açaí|acaiteria|açaiteria|açaíteria",i]',
    '["cuisine"~"acai|açaí",i]',
    '["amenity"~"restaurant|fast_food|cafe"]["name"~"acai|açaí",i]',
    '["shop"~"beverages|convenience"]["name"~"acai|açaí",i]'
  ]},
  icecream: { label: "Sorveterias e sobremesas", filters: [
    '["amenity"="ice_cream"]',
    '["shop"~"ice_cream|confectionery|pastry"]',
    '["name"~"sorveteria|sorvete|gelateria",i]'
  ]},
  burger: { label: "Hamburguerias", filters: [
    '["cuisine"~"burger|hamburger",i]',
    '["amenity"="fast_food"]["name"~"burger|hamburg|smash",i]',
    '["amenity"="restaurant"]["name"~"burger|hamburg|smash",i]'
  ]},
  pizza: { label: "Pizzarias", filters: [
    '["cuisine"="pizza"]',
    '["amenity"~"restaurant|fast_food"]["name"~"pizza|pizzaria",i]'
  ]},
  snack: { label: "Lanchonetes e hot dogs", filters: [
    '["amenity"="fast_food"]',
    '["amenity"="restaurant"]["name"~"lanche|hot dog|cachorro-quente",i]'
  ]},
  bakery: { label: "Docerias e confeitarias", filters: [
    '["shop"~"pastry|confectionery"]',
    '["name"~"doceria|confeitaria|brigadeiro|bolo",i]'
  ]},
  beauty: { label: "Barbearias e salões", filter: '["shop"~"hairdresser|beauty"]' },
  health: { label: "Clínicas e saúde", filter: '["amenity"~"doctors|dentist|clinic|veterinary"]' },
  auto: { label: "Oficinas e automotivo", filter: '["shop"~"car_repair|tyres|car"]' },
  retail: { label: "Lojas e comércio", filter: '["shop"]' },
  clothing: { label: "Lojas de roupas", filters: [
    '["shop"~"clothes|fashion|boutique"]',
    '["name"~"roupa|moda|vestuario|vestuário|boutique",i]'
  ]},
  services: { label: "Serviços profissionais", filter: '["office"]' },
  lodging: { label: "Hotéis e hospedagem", filter: '["tourism"~"hotel|guest_house|hostel|motel"]' },
  fitness: { label: "Academias e fitness", filter: '["leisure"~"fitness_centre|sports_centre"]' }
};

function loadSaved() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data.map(lead => ({
      ...lead,
      stage: STAGES.includes(lead.stage) ? lead.stage : "Novo",
      notes: lead.notes || ""
    })) : [];
  } catch {
    return [];
  }
}

function persistSaved() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLeads));
    updateDashboard();
    renderSaved();
    renderResults();
  } catch {
    setStatus("Não foi possível salvar. O armazenamento do navegador pode estar cheio.", "error");
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function setStatus(message, type = "") {
  const el = $("status");
  if (!el) return;
  el.textContent = message;
  el.className = "status" + (type ? " " + type : "");
}

function hideStatus() {
  if ($("status")) $("status").className = "status hidden";
}

function setBusy(busy) {
  $("searchBtn").disabled = busy;
  $("searchBtn").textContent = busy ? "⏳ Buscando empresas..." : "⌕ Buscar empresas";
}

function websiteOf(tags) {
  return tags.website || tags["contact:website"] || tags.url ||
    tags["contact:url"] || tags["website:menu"] || "";
}

function phoneOf(tags) {
  return tags.phone || tags["contact:phone"] || tags.mobile ||
    tags["contact:mobile"] || tags["contact:whatsapp"] || tags.whatsapp || "";
}

function whatsappOf(tags) {
  return tags.whatsapp || tags["contact:whatsapp"] || "";
}

function addressOf(tags) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  return [
    street,
    tags["addr:suburb"],
    tags["addr:city"],
    tags["addr:state"]
  ].filter(Boolean).join(" · ");
}

function classify(tags) {
  for (const key of ["shop", "amenity", "office", "tourism", "leisure", "craft"]) {
    if (tags[key]) return `${key}: ${tags[key].replaceAll("_", " ")}`;
  }
  return "Negócio local";
}

function makeLead(element) {
  const tags = element.tags || {};
  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || tags.brand || tags.operator || "Negócio sem nome cadastrado",
    category: classify(tags),
    website: websiteOf(tags),
    phone: phoneOf(tags),
    whatsapp: whatsappOf(tags),
    address: addressOf(tags),
    city: $("city").value.trim(),
    lat: element.lat ?? element.center?.lat ?? null,
    lon: element.lon ?? element.center?.lon ?? null,
    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    updatedAt: new Date().toISOString()
  };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(lead => {
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  });
}

function hasWebsite(lead) {
  return Boolean(String(lead.website || "").trim());
}

function hasPhone(lead) {
  return Boolean(String(lead.phone || "").trim());
}

function phoneDigits(lead) {
  return String(lead.whatsapp || lead.phone || "").replace(/\D/g, "");
}

function hasUsablePhone(lead) {
  const digits = phoneDigits(lead);
  return digits.length >= 10 && digits.length <= 13;
}

function prospectingPriority(lead) {
  let score = 0;
  if (!hasWebsite(lead)) score += 45;
  if (hasPhone(lead)) score += 20;
  if (lead.address) score += 10;
  if (lead.lat != null && lead.lon != null) score += 5;
  if (lead.category && lead.category !== "Negócio local") score += 5;
  if (!isSaved(lead.id)) score += 15;
  return Math.min(100, score);
}

function scoreLabel(lead) {
  const score = prospectingPriority(lead);
  if (score >= 75) return "Prioridade alta";
  if (score >= 50) return "Prioridade média";
  return "Prioridade baixa";
}

function sortProspects(list) {
  return [...list].sort((a, b) =>
    prospectingPriority(b) - prospectingPriority(a) ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}

function safeUrl(value) {
  let url = String(value || "").trim();
  if (!url) return "#";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function phoneLink(lead) {
  let digits = phoneDigits(lead);
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (digits.length < 12 || digits.length > 13) return "";
  return `https://wa.me/${digits}`;
}

function googleSearchUrl(name, city, extra = "") {
  return "https://www.google.com/search?q=" +
    encodeURIComponent(`${name || ""} ${city || ""} ${extra}`.trim());
}

function isSaved(id) {
  return savedLeads.some(lead => lead.id === id);
}

async function geocode(city) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(city)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Não foi possível localizar essa cidade agora.");
  const data = await response.json();
  if (!data.length) {
    throw new Error("Cidade não encontrada. Informe cidade e estado, por exemplo: Vila Velha, Espírito Santo.");
  }
  return data[0];
}

function buildQuery(lat, lon, radius, segment) {
  const selected = SEGMENTS[segment];
  const area = `nwr(around:${radius},${lat},${lon})`;

  if (segment === "all") {
    return `[out:json][timeout:35];(
      ${area}["name"]["shop"];
      ${area}["name"]["amenity"];
      ${area}["name"]["office"];
      ${area}["name"]["tourism"];
      ${area}["name"]["leisure"];
    );out center tags;`;
  }

  if (Array.isArray(selected.filters)) {
    const clauses = selected.filters
      .map(filter => `${area}${filter}["name"];`)
      .join("\n");
    return `[out:json][timeout:35];(${clauses});out center tags;`;
  }

  return `[out:json][timeout:35];${area}${selected.filter}["name"];out center tags;`;
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
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "data=" + encodeURIComponent(query)
      });

      if (!response.ok) {
        throw new Error(response.status === 429
          ? "O serviço recebeu muitas buscas. Aguarde um pouco e tente novamente."
          : `O serviço de busca respondeu com erro (${response.status}).`);
      }

      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new Error("A resposta da busca veio em formato inesperado.");
      return data.elements;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Não foi possível acessar a base pública agora.");
}

async function runSearch(event) {
  event.preventDefault();
  hideStatus();
  setBusy(true);
  $("results").innerHTML = `<div class="empty-state"><span class="spinner"></span><h3>Buscando empresas...</h3><p>Isso pode levar alguns segundos.</p></div>`;
  $("resultsSummary").textContent = "Consultando dados públicos...";

  try {
    const city = $("city").value.trim();
    const radius = Number($("radius").value);
    const segment = $("segment").value;

    if (!city) throw new Error("Informe a cidade e o estado.");

    setStatus("Localizando a região e consultando o OpenStreetMap.");
    const place = await geocode(city);
    const query = buildQuery(Number(place.lat), Number(place.lon), radius, segment);
    const elements = await queryOverpass(query);

    currentResults = sortProspects(dedupe(elements.map(makeLead))
      .filter(lead => lead.name !== "Negócio sem nome cadastrado"));

    renderResults();
    updateDashboard();

    if (currentResults.length) {
      const noSite = currentResults.filter(lead => !hasWebsite(lead)).length;
      setStatus(`Busca concluída: ${currentResults.length} empresas encontradas. ${noSite} não têm site informado na base consultada.`, "success");
    } else {
      setStatus("Nenhuma empresa com nome foi encontrada. Tente ampliar o raio ou selecionar outro segmento.");
    }
  } catch (error) {
    currentResults = [];
    renderResults();
    updateDashboard();
    setStatus(`${error.message || "Ocorreu um erro."} Verifique a conexão e tente novamente.`, "error");
  } finally {
    setBusy(false);
  }
}

function filteredResults() {
  const filter = $("filter").value;
  const query = normalize($("resultSearch").value);
  let list = currentResults.filter(lead => {
    if (query && !normalize(`${lead.name} ${lead.category} ${lead.address} ${lead.phone}`).includes(query)) return false;

    if (filter === "no-site" && hasWebsite(lead)) return false;
    if (filter === "with-site" && !hasWebsite(lead)) return false;
    if (filter === "with-phone" && !hasPhone(lead)) return false;
    if (filter === "no-phone" && hasPhone(lead)) return false;
    if (filter === "with-whatsapp" && !hasUsablePhone(lead)) return false;
    if (filter === "high-priority" && prospectingPriority(lead) < 75) return false;
    if (filter === "unsaved" && isSaved(lead.id)) return false;
    return true;
  });

  const sort = $("sortResults").value;
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  else if (sort === "phone") list.sort((a, b) => Number(hasPhone(b)) - Number(hasPhone(a)) || a.name.localeCompare(b.name, "pt-BR"));
  else list.sort((a, b) => prospectingPriority(b) - prospectingPriority(a) || a.name.localeCompare(b.name, "pt-BR"));

  return list;
}

function outreachMessage(lead) {
  const name = lead.name && !lead.name.includes("sem nome") ? lead.name : "";
  const greeting = name ? `Olá, pessoal da ${name}! Tudo bem?` : "Olá! Tudo bem?";
  const category = normalize(lead.category);
  let benefit = "apresentar os serviços, facilitar o contato e transmitir mais confiança para quem pesquisa a empresa na internet.";

  if (/restaurant|fast food|food|cafe|bar|ice cream|acai|sorvete|lanchonete|pizza|burger/.test(category)) {
    benefit = "apresentar o cardápio, divulgar os produtos e facilitar o contato e os pedidos dos clientes.";
  } else if (/clothes|fashion|roupa|moda|vestuario|boutique/.test(category)) {
    benefit = "apresentar as coleções, divulgar as peças e facilitar o contato de clientes interessados.";
  } else if (/hairdresser|beauty|barber|salao/.test(category)) {
    benefit = "apresentar os serviços, mostrar trabalhos realizados e facilitar os agendamentos.";
  } else if (/doctor|dentist|clinic|health|clinica/.test(category)) {
    benefit = "apresentar os serviços e facilitar o contato para agendamentos.";
  } else if (/car repair|car|tyres|auto|oficina/.test(category)) {
    benefit = "apresentar os serviços e facilitar o contato de novos clientes.";
  } else if (/hotel|guest house|hostel|lodging/.test(category)) {
    benefit = "apresentar as acomodações e facilitar consultas sobre reservas.";
  }

  const company = name ? `a ${name}` : "a empresa de vocês";
  return `${greeting}

Trabalho com criação de sites profissionais e tive uma ideia para fortalecer a presença de ${company} na internet.

Um site profissional pode ${benefit}

Posso mostrar uma ideia de site para vocês, sem compromisso?`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (!copied) throw new Error("Falha ao copiar");
    }
    setStatus("Mensagem copiada. Revise e personalize antes de enviar.", "success");
  } catch {
    window.prompt("Copie a mensagem abaixo:", text);
  }
}

function copyApproach(id, source) {
  const lead = (source === "saved" ? savedLeads : currentResults).find(item => item.id === id);
  if (!lead) return;
  copyText(outreachMessage(lead));
}

function saveLead(id) {
  const lead = currentResults.find(item => item.id === id);
  if (!lead) return;

  if (isSaved(id)) {
    setStatus("Este lead já está no seu CRM.");
    return;
  }

  savedLeads.unshift({
    ...lead,
    savedAt: new Date().toISOString(),
    stage: "Novo",
    notes: "",
    contactHistory: []
  });

  persistSaved();
  setStatus(`${lead.name} foi adicionado ao CRM.`, "success");
}

function editNotes(id) {
  const lead = savedLeads.find(item => item.id === id);
  if (!lead) return;
  const notes = prompt("Observações deste lead:", lead.notes || "");
  if (notes === null) return;
  lead.notes = notes.trim();
  lead.updatedAt = new Date().toISOString();
  persistSaved();
  setStatus("Observações salvas neste dispositivo.", "success");
}

function updateStage(id, stage) {
  const lead = savedLeads.find(item => item.id === id);
  if (!lead || !STAGES.includes(stage)) return;

  lead.stage = stage;
  lead.updatedAt = new Date().toISOString();

  if (stage === "Contato feito" && !lead.contactedAt) {
    lead.contactedAt = new Date().toISOString();
  }

  if (stage === "Convertido" && !lead.convertedAt) {
    lead.convertedAt = new Date().toISOString();
  }

  persistSaved();
  setStatus(`Etapa de ${lead.name} atualizada para "${stage}".`, "success");
}

function removeLead(id) {
  const lead = savedLeads.find(item => item.id === id);
  if (!lead) return;
  if (!confirm(`Remover "${lead.name}" do seu CRM?`)) return;
  savedLeads = savedLeads.filter(item => item.id !== id);
  persistSaved();
  setStatus("Lead removido do CRM.");
}

function contactLogged(id) {
  const lead = savedLeads.find(item => item.id === id);
  if (!lead) return;
  lead.stage = "Contato feito";
  lead.contactedAt = new Date().toISOString();
  lead.updatedAt = new Date().toISOString();
  lead.contactHistory = Array.isArray(lead.contactHistory) ? lead.contactHistory : [];
  lead.contactHistory.push({ date: lead.contactedAt, type: "Contato registrado" });
  persistSaved();
  setStatus("Contato registrado no CRM.", "success");
}

function leadCard(lead, source) {
  const noSite = !hasWebsite(lead);
  const saved = isSaved(lead.id);
  const whatsappUrl = phoneLink(lead);
  const locationText = lead.address || lead.city || "";
  const score = prospectingPriority(lead);
  const stageOptions = STAGES.map(stage =>
    `<option value="${escapeHtml(stage)}" ${stage === (lead.stage || "Novo") ? "selected" : ""}>${escapeHtml(stage)}</option>`
  ).join("");

  return `
    <article class="lead-card">
      <div class="lead-avatar">${escapeHtml((lead.name || "?").slice(0, 1).toUpperCase())}</div>
      <div class="lead-main">
        <div class="lead-title-row">
          <h3 class="lead-title">${escapeHtml(lead.name)}</h3>
          <span class="score-pill ${score >= 75 ? "score-high" : score >= 50 ? "score-medium" : "score-low"}">${score}/100</span>
        </div>
        <p class="lead-meta">${escapeHtml(lead.category)}${locationText ? ` · ${escapeHtml(locationText)}` : ""}</p>
        ${lead.phone ? `<p class="lead-meta">Telefone: <strong>${escapeHtml(lead.phone)}</strong></p>` : ""}
        <div class="lead-tags">
          <span class="tag ${noSite ? "tag-warning" : "tag-good"}">${noSite ? "Site não informado" : "Site informado"}</span>
          ${lead.phone ? '<span class="tag">Telefone disponível</span>' : '<span class="tag tag-warning">Sem telefone na base</span>'}
          ${lead.whatsapp ? '<span class="tag tag-good">WhatsApp cadastrado</span>' : ""}
          ${source === "saved" ? `<span class="tag tag-stage">${escapeHtml(lead.stage || "Novo")}</span>` : ""}
        </div>
        <div class="lead-links">
          ${lead.website ? `<a href="${escapeHtml(safeUrl(lead.website))}" target="_blank" rel="noopener noreferrer">↗ Abrir site</a>` : ""}
          ${whatsappUrl ? `<a class="whatsapp-link" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">◉ ${lead.whatsapp ? "WhatsApp cadastrado" : "Tentar WhatsApp"}</a>` : ""}
          ${lead.phone ? `<a href="tel:${escapeHtml(lead.phone.replace(/[^\d+]/g, ""))}">☎ Ligar</a>` : ""}
          <a href="${escapeHtml(googleSearchUrl(lead.name, locationText, "telefone contato"))}" target="_blank" rel="noopener noreferrer">⌕ Buscar telefone</a>
          <a class="instagram-link" href="${escapeHtml(googleSearchUrl(lead.name, locationText, "Instagram oficial"))}" target="_blank" rel="noopener noreferrer">◎ Buscar Instagram</a>
          <a href="${escapeHtml(googleSearchUrl(lead.name, locationText))}" target="_blank" rel="noopener noreferrer">Google</a>
          ${lead.osmUrl ? `<a href="${escapeHtml(lead.osmUrl)}" target="_blank" rel="noopener noreferrer">Mapa de dados</a>` : ""}
          ${lead.lat != null && lead.lon != null ? `<a href="https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lon}" target="_blank" rel="noopener noreferrer">Abrir mapa</a>` : ""}
        </div>

        ${source === "saved" ? `
          <div class="crm-inline">
            <label>Etapa comercial
              <select class="stage-select" data-stage-select="${escapeHtml(lead.id)}">${stageOptions}</select>
            </label>
            <label class="notes-preview">Observações
              <span>${escapeHtml(lead.notes || "Nenhuma observação adicionada.")}</span>
            </label>
          </div>
        ` : ""}
      </div>

      <div class="lead-actions">
        ${source === "results" ? `
          <button type="button" class="mini-btn ${saved ? "saved" : ""}" data-save="${escapeHtml(lead.id)}" ${saved ? "disabled" : ""}>
            ${saved ? "✓ No CRM" : "＋ Salvar lead"}
          </button>
          <button type="button" class="mini-btn" data-copy="${escapeHtml(lead.id)}">Copiar abordagem</button>
        ` : `
          <button type="button" class="mini-btn" data-copy-saved="${escapeHtml(lead.id)}">Copiar abordagem</button>
          <button type="button" class="mini-btn" data-notes="${escapeHtml(lead.id)}">Editar observações</button>
          <button type="button" class="mini-btn" data-contacted="${escapeHtml(lead.id)}">Registrar contato</button>
          <button type="button" class="mini-btn btn-remove" data-remove="${escapeHtml(lead.id)}">Remover lead</button>
        `}
      </div>
    </article>
  `;
}

function renderResults() {
  const root = $("results");
  const list = filteredResults();

  $("resultsSummary").textContent = currentResults.length
    ? `${list.length} de ${currentResults.length} empresas exibidas`
    : "Faça uma busca para começar.";

  if (!list.length) {
    root.innerHTML = `<div class="empty-state">
      <span class="empty-icon">⌕</span>
      <h3>${currentResults.length ? "Nenhuma empresa corresponde aos filtros" : "Nenhum resultado ainda"}</h3>
      <p>${currentResults.length ? "Experimente mudar o filtro ou a busca por nome." : "Pesquise uma cidade e um segmento para começar."}</p>
    </div>`;
    return;
  }

  root.innerHTML = list.map(lead => leadCard(lead, "results")).join("");
}

function filteredSaved() {
  const query = normalize($("savedSearch").value);
  const stage = $("savedStageFilter").value;
  const sort = $("savedSort").value;

  let list = savedLeads.filter(lead => {
    if (stage !== "all" && (lead.stage || "Novo") !== stage) return false;
    const text = normalize(`${lead.name} ${lead.phone} ${lead.category} ${lead.address} ${lead.notes}`);
    return !query || text.includes(query);
  });

  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  else if (sort === "priority") list.sort((a, b) => prospectingPriority(b) - prospectingPriority(a));
  else list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

  if (activePipelineStage) {
    list = list.filter(lead => (lead.stage || "Novo") === activePipelineStage);
  }
  return list;
}

function renderSaved() {
  const root = $("savedResults");
  const list = filteredSaved();

  $("savedBadge").textContent = `${savedLeads.length} ${savedLeads.length === 1 ? "lead" : "leads"}`;

  $("crmSummary").innerHTML = `
    <span><strong>${list.length}</strong> leads exibidos</span>
    ${activePipelineStage ? `<button type="button" id="clearPipelineFilter" class="text-button">Limpar filtro: ${escapeHtml(activePipelineStage)} ×</button>` : ""}
  `;

  if (!savedLeads.length) {
    root.innerHTML = `<div class="empty-state"><span class="empty-icon">◎</span><h3>Seu CRM começa com o primeiro lead</h3><p>Pesquise empresas e toque em “Salvar lead” para adicioná-las aqui.</p></div>`;
    return;
  }

  if (!list.length) {
    root.innerHTML = `<div class="empty-state"><h3>Nenhum lead encontrado</h3><p>Altere o termo de pesquisa ou o filtro de etapa.</p></div>`;
    return;
  }

  root.innerHTML = list.map(lead => leadCard(lead, "saved")).join("");
}

function updateDashboard() {
  $("foundCount").textContent = currentResults.length;
  $("savedCount").textContent = savedLeads.length;
  $("contactedCount").textContent = savedLeads.filter(lead =>
    ["Contato feito", "Respondeu", "Em negociação", "Convertido"].includes(lead.stage)
  ).length;
  $("convertedCount").textContent = savedLeads.filter(lead => lead.stage === "Convertido").length;
  $("pipelineTotal").textContent = `${savedLeads.length} ${savedLeads.length === 1 ? "lead" : "leads"}`;

  $("pipelineCards").innerHTML = STAGES.map(stage => {
    const count = savedLeads.filter(lead => (lead.stage || "Novo") === stage).length;
    const active = activePipelineStage === stage;
    return `<button type="button" class="pipeline-card ${active ? "active" : ""}" data-pipeline="${escapeHtml(stage)}" aria-pressed="${active}">
      <span>${escapeHtml(stage)}</span><strong>${count}</strong>
    </button>`;
  }).join("");
}

function csvEscape(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function exportCSV(list, filename) {
  if (!list.length) {
    setStatus("Não há leads para exportar.", "error");
    return;
  }

  const headers = [
    "Nome", "Segmento", "Site informado na base", "Telefone",
    "WhatsApp cadastrado", "Endereço", "Cidade", "Etapa",
    "Pontuação", "Prioridade", "Observações", "Fonte"
  ];

  const rows = list.map(lead => [
    lead.name, lead.category, lead.website, lead.phone, lead.whatsapp,
    lead.address, lead.city, lead.stage || "Novo",
    prospectingPriority(lead), scoreLabel(lead), lead.notes || "", lead.osmUrl
  ]);

  const csv = "\uFEFF" + [headers, ...rows]
    .map(row => row.map(csvEscape).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

$("searchForm").addEventListener("submit", runSearch);
$("filter").addEventListener("change", renderResults);
$("resultSearch").addEventListener("input", renderResults);
$("sortResults").addEventListener("change", renderResults);
$("savedSearch").addEventListener("input", renderSaved);
$("savedStageFilter").addEventListener("change", renderSaved);
$("savedSort").addEventListener("change", renderSaved);

$("exportBtn").addEventListener("click", () =>
  exportCSV(filteredResults(), "leadfinder-resultados.csv")
);

$("exportSavedBtn").addEventListener("click", () =>
  exportCSV(savedLeads, "leadfinder-crm.csv")
);

$("clearSavedBtn").addEventListener("click", () => {
  if (!savedLeads.length) return;
  if (!confirm("Tem certeza que deseja apagar TODOS os leads salvos neste dispositivo? Esta ação não pode ser desfeita.")) return;
  savedLeads = [];
  activePipelineStage = null;
  persistSaved();
  setStatus("CRM limpo.", "success");
});

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.save) saveLead(button.dataset.save);
  if (button.dataset.copy) copyApproach(button.dataset.copy, "results");
  if (button.dataset.copySaved) copyApproach(button.dataset.copySaved, "saved");
  if (button.dataset.notes) editNotes(button.dataset.notes);
  if (button.dataset.remove) removeLead(button.dataset.remove);
  if (button.dataset.contacted) contactLogged(button.dataset.contacted);

  if (button.dataset.pipeline) {
    const stage = button.dataset.pipeline;
    activePipelineStage = activePipelineStage === stage ? null : stage;
    updateDashboard();
    renderSaved();
    $("crmSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (button.id === "clearPipelineFilter") {
    activePipelineStage = null;
    updateDashboard();
    renderSaved();
  }
});

document.addEventListener("change", event => {
  if (event.target.matches("[data-stage-select]")) {
    updateStage(event.target.dataset.stageSelect, event.target.value);
  }
});

window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY || event.key === null) {
    savedLeads = loadSaved();
    updateDashboard();
    renderSaved();
    renderResults();
  }
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  $("installBtn").classList.remove("hidden");
});

$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) {
    setStatus("Abra o menu do navegador e selecione “Instalar app” ou “Adicionar à tela inicial”.");
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

updateDashboard();
renderSaved();
renderResults();
