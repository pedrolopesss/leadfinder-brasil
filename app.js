const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "leadfinder-brasil-leads-v1";

let currentResults = [];
let savedLeads = loadSaved();
let installPrompt = null;

const SEGMENTS = {
  all: { label: "Todos os segmentos", filter: null },
  restaurant: { label: "Restaurantes e lanchonetes", filter: '["amenity"~"restaurant|fast_food|cafe|bar|food_court"]' },
  acai: {
    label: "Açaíterias e lojas de açaí",
    filters: [
      '["name"~"acai|açaí|acaiteria|açaiteria|açaíteria",i]',
      '["cuisine"~"acai|açaí",i]',
      '["amenity"~"restaurant|fast_food|cafe"]["name"~"acai|açaí",i]',
      '["shop"~"beverages|convenience"]["name"~"acai|açaí",i]',
      '["brand"~"acai|açaí",i]'
    ]
  },
  icecream: {
    label: "Sorveterias e sobremesas",
    filters: [
      '["amenity"="ice_cream"]',
      '["shop"~"ice_cream|confectionery|pastry"]',
      '["name"~"sorveteria|sorvete|gelateria",i]'
    ]
  },
  burger: {
    label: "Hamburguerias",
    filters: [
      '["cuisine"~"burger|hamburger",i]',
      '["amenity"="fast_food"]["name"~"burger|hamburg|smash",i]',
      '["amenity"="restaurant"]["name"~"burger|hamburg|smash",i]'
    ]
  },
  pizza: {
    label: "Pizzarias",
    filters: [
      '["cuisine"="pizza"]',
      '["amenity"~"restaurant|fast_food"]["name"~"pizza|pizzaria",i]'
    ]
  },
  snack: {
    label: "Lanchonetes e hot dogs",
    filters: [
      '["amenity"="fast_food"]',
      '["amenity"="restaurant"]["name"~"lanche|hot dog|cachorro-quente",i]'
    ]
  },
  bakery: {
    label: "Docerias e confeitarias",
    filters: [
      '["shop"~"pastry|confectionery"]',
      '["name"~"doceria|confeitaria|brigadeiro|bolo",i]'
    ]
  },
  beauty: { label: "Barbearias e salões", filter: '["shop"~"hairdresser|beauty"]' },
  health: { label: "Clínicas e saúde", filter: '["amenity"~"doctors|dentist|clinic|veterinary"]' },
  auto: { label: "Oficinas e automotivo", filter: '["shop"~"car_repair|tyres|car"]' },
  retail: { label: "Lojas e comércio", filter: '["shop"]' },
  clothing: {
    label: "Lojas de roupas",
    filters: [
      '["shop"~"clothes|fashion|boutique"]',
      '["name"~"roupa|moda|vestuario|vestuário|boutique",i]'
    ]
  },
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
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function normalize(s = "") {
  return s.toString().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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
    ? "⏳ Buscando empresas…"
    : "🔎 Buscar empresas";
}

function websiteOf(t) {
  return t.website || t["contact:website"] || t.url ||
    t["contact:url"] || t["website:menu"] ||
    t["contact:website:mobile"] || "";
}

function phoneOf(t) {
  return t.phone || t["contact:phone"] || t.mobile ||
    t["contact:mobile"] || t["contact:whatsapp"] ||
    t.whatsapp || "";
}

function whatsappOf(t) {
  return t.whatsapp || t["contact:whatsapp"] || "";
}

function addressOf(t) {
  return [
    t["addr:housenumber"], t["addr:street"],
    t["addr:suburb"], t["addr:city"], t["addr:state"]
  ].filter(Boolean).join(", ");
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
    whatsapp: whatsappOf(t),
    address: addressOf(t),
    city: $("city").value.trim(),
    lat,
    lon,
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    updatedAt: new Date().toISOString()
  };
}

function classify(t) {
  for (const k of ["amenity", "shop", "office", "tourism", "leisure", "craft"]) {
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

function hasWebsite(lead) {
  return Boolean((lead.website || "").trim());
}

function prospectingPriority(lead) {
  let score = 0;
  if (!hasWebsite(lead)) score += 60;
  if (lead.phone) score += 20;
  if (lead.address) score += 10;
  if (lead.lat != null && lead.lon != null) score += 5;
  if (lead.category && lead.category !== "Negócio local") score += 5;
  return Math.min(100, score);
}

function scoreLabel(lead) {
  const score = prospectingPriority(lead);
  if (score >= 80) return "Prioridade alta";
  if (score >= 60) return "Prioridade média";
  return "Prioridade baixa";
}

function sortProspects(list) {
  return [...list].sort((a, b) =>
    prospectingPriority(b) - prospectingPriority(a) ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}

function editLeadNotes(id) {
  const lead = savedLeads.find(x => x.id === id);
  if (!lead) return;

  const notes = prompt("Observações sobre este negócio:", lead.notes || "");
  if (notes === null) return;

  lead.notes = notes.trim();
  persistSaved();
  setStatus("Observações salvas neste dispositivo.", "success");
}

function outreachMessage(lead) {
  const rawName = (lead?.name || "").trim();

  const genericNames = [
    "Negócio sem nome cadastrado",
    "Negócio local",
    "Sem nome"
  ];

  const hasRealName = rawName &&
    !genericNames.some(name =>
      rawName.toLocaleLowerCase("pt-BR") ===
      name.toLocaleLowerCase("pt-BR")
    );

  const company = hasRealName ? rawName : "";
  const greeting = company
    ? `Olá, pessoal da ${company}! Tudo bem?`
    : "Olá! Tudo bem?";

  const companyMention = company ? `a ${company}` : "a empresa de vocês";
  const category = (lead?.category || "").toLowerCase();

  let benefit =
    "apresentar os serviços, facilitar o contato com clientes e transmitir mais confiança para quem pesquisa a empresa na internet.";

  if (/restaurant|fast_food|food|cafe|bar|ice_cream|acai|sorvete|lanchonete/i.test(category)) {
    benefit = "apresentar o cardápio, divulgar os produtos e facilitar o contato e os pedidos dos clientes.";
  } else if (/clothes|fashion|roupa|moda|vestuario|vestuário|boutique/i.test(category)) {
    benefit = "apresentar as coleções, divulgar as peças, mostrar as novidades e facilitar o contato de clientes interessados nos produtos.";
  } else if (/hairdresser|beauty|barber|sal[aã]o/i.test(category)) {
    benefit = "apresentar os serviços, mostrar os trabalhos realizados e facilitar o agendamento de clientes.";
  } else if (/doctor|dentist|clinic|health|cl[ií]nica/i.test(category)) {
    benefit = "apresentar os serviços, disponibilizar informações úteis e facilitar o contato para agendamentos.";
  } else if (/car_repair|car|tyres|auto|oficina/i.test(category)) {
    benefit = "apresentar os serviços, explicar como funciona o atendimento e facilitar o contato de novos clientes.";
  } else if (/hotel|guest_house|hostel|lodging/i.test(category)) {
    benefit = "apresentar as acomodações, mostrar fotos e facilitar as consultas sobre reservas.";
  }

  return `${greeting}

Trabalho com criação de sites profissionais para empresas e tive uma ideia que pode ajudar a fortalecer a presença de ${companyMention} na internet.

Um site profissional pode ${benefit}

Gostaria de apresentar uma ideia de como poderia ficar um site para ${companyMention}, sem compromisso. Posso mostrar para vocês?`;
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
      if (!copied) throw new Error("Falha ao copiar");
    }
    setStatus("Abordagem copiada! Agora é só colar na conversa.", "success");
  } catch {
    window.prompt("Copie sua abordagem abaixo:", text);
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

async function geocode(city) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(city)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error("Não foi possível localizar essa cidade agora.");
  }

  const data = await response.json();
  if (!data.length) {
    throw new Error("Cidade não encontrada. Informe cidade e estado, por exemplo: Vila Velha, Espírito Santo.");
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

  if (Array.isArray(selected.filters)) {
    const clauses = selected.filters
      .map(filter => `nwr(around:${radius},${lat},${lon})${filter}["name"];`)
      .join("\n");
    return `[out:json][timeout:35];(${clauses});out center tags;`;
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
        throw new Error(response.status === 429
          ? "Muitas buscas no serviço. Aguarde um minuto e tente novamente."
          : `Serviço de busca respondeu com erro (${response.status}).`);
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

    currentResults = sortProspects(dedupe(elements.map(makeLead))
      .filter(x => x.name !== "Negócio sem nome cadastrado"));

    renderResults();
    updateStats();

    if (currentResults.length) {
      const withoutSite = currentResults.filter(x => !hasWebsite(x)).length;
      setStatus(
        `Busca concluída: ${currentResults.length} empresas encontradas. ${withoutSite} sem site cadastrado na base consultada. Confirme as informações antes de abordar os negócios.`,
        "success"
      );
    } else {
      setStatus("Nenhuma empresa com nome encontrada nesse raio. Tente ampliar o raio ou escolher outro segmento.");
    }
  } catch (err) {
    currentResults = [];
    renderResults();
    updateStats();
    setStatus(`${err.message || "Ocorreu um erro inesperado."} Verifique sua conexão e tente novamente.`, "error");
  } finally {
    setBusy(false);
  }
}

function filteredResults() {
  const filter = $("filter").value;
  if (filter === "no-site") return currentResults.filter(x => !hasWebsite(x));
  if (filter === "with-site") return currentResults.filter(x => hasWebsite(x));
  if (filter === "with-phone") return currentResults.filter(x => Boolean((x.phone || "").trim()));
  if (filter === "no-phone") return currentResults.filter(x => !((x.phone || "").trim()));
  if (filter === "with-whatsapp") return currentResults.filter(x => Boolean((x.whatsapp || x.phone || "").trim()));
  return currentResults;
}

function setupContactFilters() {
  const filter = $("filter");
  if (!filter) return;

  const options = [
    ["with-phone", "📞 Com telefone"],
    ["no-phone", "🚫 Sem telefone"],
    ["with-whatsapp", "🟢 Número para tentar WhatsApp"]
  ];

  options.forEach(([value, label]) => {
    if (filter.querySelector(`[value="${value}"]`)) return;

    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    filter.appendChild(option);
  });
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
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;

  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function phoneLink(phone) {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (digits.length < 12 || digits.length > 13) return "#";
  return "https://wa.me/" + digits;
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
    const whatsappNumber = x.whatsapp || x.phone;
    const whatsappLabel = x.whatsapp
      ? "🟢 WhatsApp cadastrado"
      : phoneLink(whatsappNumber) === "#"
        ? "📞 Ver telefone"
        : "🟢 Tentar WhatsApp";

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
            <span class="tag">Pontuação: ${prospectingPriority(x)}/100 · ${scoreLabel(x)}</span>
            <span class="tag ${noSite ? "no-site" : "has-site"}">
              ${noSite ? "Site não cadastrado na base" : "Site cadastrado na base"}
            </span>
            ${noSite ? '<span class="tag">Oportunidade para investigar</span>' : ""}
            ${x.phone ? '<span class="tag">Telefone cadastrado</span>' : ""}
            ${x.whatsapp ? '<span class="tag">WhatsApp cadastrado</span>' : ""}
          </div>
          <div class="lead-links">
            ${x.website ? `<a href="${escapeHtml(safeUrl(x.website))}" target="_blank" rel="noopener noreferrer">🌐 Abrir site ↗</a>` : ""}
            ${whatsappNumber ? `<a href="${escapeHtml(phoneLink(whatsappNumber))}" target="_blank" rel="noopener noreferrer">${whatsappLabel} ↗</a>` : ""}
            <a href="${escapeHtml(googleSearchUrl(x.name, x.city, "telefone contato WhatsApp"))}" target="_blank" rel="noopener noreferrer">📞 Buscar telefone ↗</a>
            <a href="${escapeHtml(googleSearchUrl(x.name, x.city))}" target="_blank" rel="noopener noreferrer">🔎 Ver empresa no Google ↗</a>
            <a class="instagram-link" href="${escapeHtml(googleSearchUrl(x.name, x.city, "Instagram oficial"))}" target="_blank" rel="noopener noreferrer">📷 Buscar Instagram ↗</a>
            <a href="${escapeHtml(x.osmUrl)}" target="_blank" rel="noopener noreferrer">🗺️ OpenStreetMap ↗</a>
            ${x.lat != null && x.lon != null ? `<a href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lon}" target="_blank" rel="noopener noreferrer">📍 Mapa ↗</a>` : ""}
          </div>
        </div>
        <div class="lead-actions">
          <button type="button" class="mini-btn" data-copy="${escapeHtml(x.id)}">📋 Copiar abordagem</button>
          <button type="button" class="mini-btn ${isSaved(x.id) ? "saved" : ""}" data-save="${escapeHtml(x.id)}">
            ${isSaved(x.id) ? "✓ Salvo" : "🔖 Salvar"}
          </button>
        </div>
      </article>`;
  }).join("");

  root.querySelectorAll("[data-save]").forEach(btn =>
    btn.addEventListener("click", () => saveLead(btn.dataset.save))
  );

  root.querySelectorAll("[data-copy]").forEach(btn =>
    btn.addEventListener("click", () => copyApproach(btn.dataset.copy, "results"))
  );
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
    stage: "Novo",
    notes: ""
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
    const whatsappNumber = x.whatsapp || x.phone;
    const whatsappLabel = x.whatsapp
      ? "🟢 WhatsApp cadastrado"
      : phoneLink(whatsappNumber) === "#"
        ? "📞 Ver telefone"
        : "🟢 Tentar WhatsApp";

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
            <span class="tag">Pontuação: ${prospectingPriority(x)}/100 · ${scoreLabel(x)}</span>
            <span class="tag ${noSite ? "no-site" : "has-site"}">
              ${noSite ? "Site não cadastrado na base" : "Site cadastrado na base"}
            </span>
            ${noSite ? '<span class="tag">Oportunidade para investigar</span>' : ""}
            ${x.whatsapp ? '<span class="tag">WhatsApp cadastrado</span>' : ""}
            <span class="tag">${escapeHtml(x.stage || "Novo")}</span>
            ${x.notes ? `<span class="tag">Observações: ${escapeHtml(x.notes)}</span>` : ""}
          </div>
          <div class="lead-links">
            ${whatsappNumber ? `<a href="${escapeHtml(phoneLink(whatsappNumber))}" target="_blank" rel="noopener noreferrer">${whatsappLabel} ↗</a>` : ""}
            ${x.website ? `<a href="${escapeHtml(safeUrl(x.website))}" target="_blank" rel="noopener noreferrer">🌐 Site ↗</a>` : ""}
            <a href="${escapeHtml(googleSearchUrl(x.name, x.city || x.address, "telefone contato WhatsApp"))}" target="_blank" rel="noopener noreferrer">📞 Buscar telefone ↗</a>
            <a href="${escapeHtml(googleSearchUrl(x.name, x.city || x.address))}" target="_blank" rel="noopener noreferrer">🔎 Google ↗</a>
            <a class="instagram-link" href="${escapeHtml(googleSearchUrl(x.name, x.city || x.address, "Instagram oficial"))}" target="_blank" rel="noopener noreferrer">📷 Instagram ↗</a>
            <a href="${escapeHtml(x.osmUrl || "#")}" target="_blank" rel="noopener noreferrer">🗺️ Fonte ↗</a>
          </div>
        </div>
        <div class="lead-actions">
          <button type="button" class="mini-btn" data-copy-saved="${escapeHtml(x.id)}">📋 Copiar abordagem</button>
          <button type="button" class="mini-btn" data-notes="${escapeHtml(x.id)}">📝 Editar observações</button>
          <button type="button" class="mini-btn" data-stage="${escapeHtml(x.id)}">🔄 Alterar etapa</button>
          <button type="button" class="mini-btn" data-remove="${escapeHtml(x.id)}">🗑️ Remover</button>
        </div>
      </article>`;
  }).join("");

  root.querySelectorAll("[data-copy-saved]").forEach(btn =>
    btn.addEventListener("click", () => copyApproach(btn.dataset.copySaved, "saved"))
  );

  root.querySelectorAll("[data-notes]").forEach(btn =>
    btn.addEventListener("click", () => editLeadNotes(btn.dataset.notes))
  );

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
        "Novo", "Contato feito", "Respondeu",
        "Em negociação", "Convertido", "Sem interesse"
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
    "Nome", "Segmento", "Site cadastrado na base", "Telefone",
    "WhatsApp cadastrado", "Endereço", "Latitude", "Longitude",
    "Etapa", "Pontuação", "Prioridade", "Observações", "Fonte"
  ];

  const rows = list.map(x => [
    x.name, x.category, x.website, x.phone, x.whatsapp, x.address,
    x.lat, x.lon, x.stage || "Novo",
    prospectingPriority(x), scoreLabel(x), x.notes || "", x.osmUrl
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

setupContactFilters();
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
