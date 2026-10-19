const PIPELINE_STAGES = [
  "Novo",
  "Contato feito",
  "Respondeu",
  "Em negociação",
  "Convertido",
  "Sem interesse"
];

let pipelineFilter = "Todos";

function renderPipelineDashboard() {
  const savedRoot = document.getElementById("savedResults");
  if (!savedRoot) return;

  let dashboard = document.getElementById("pipelineDashboard");

  if (!dashboard) {
    dashboard = document.createElement("section");
    dashboard.id = "pipelineDashboard";
    dashboard.className = "pipeline-dashboard";
    dashboard.setAttribute("aria-label", "Pipeline de vendas");

    savedRoot.parentNode.insertBefore(dashboard, savedRoot);
  }

  const counts = {};
  PIPELINE_STAGES.forEach(stage => {
    counts[stage] = savedLeads.filter(lead =>
      (lead.stage || "Novo") === stage
    ).length;
  });

  dashboard.innerHTML = `
    <div class="pipeline-heading">
      <h3>Pipeline de vendas</h3>
      <p>Acompanhe seus contatos e negociações.</p>
    </div>

    <button type="button"
      class="pipeline-card ${pipelineFilter === "Todos" ? "active" : ""}"
      data-pipeline-filter="Todos">
      <span>Todos os leads</span>
      <strong>${savedLeads.length}</strong>
    </button>

    ${PIPELINE_STAGES.map(stage => `
      <button type="button"
        class="pipeline-card ${pipelineFilter === stage ? "active" : ""}"
        data-pipeline-filter="${escapeHtml(stage)}">
        <span>${escapeHtml(stage)}</span>
        <strong>${counts[stage]}</strong>
      </button>
    `).join("")}
  `;

  dashboard.querySelectorAll("[data-pipeline-filter]").forEach(button => {
    button.addEventListener("click", () => {
      pipelineFilter = button.dataset.pipelineFilter;
      renderSaved();
    });
  });
}

// Substitui a renderização da lista salva, mantendo notas, remoção,
// cópia da abordagem e exportação já existentes no app.js.
function renderSaved() {
  const badge = document.getElementById("savedBadge");
  const root = document.getElementById("savedResults");

  if (!root) return;

  if (badge) {
    badge.textContent =
      `${savedLeads.length} ${savedLeads.length === 1 ? "lead" : "leads"}`;
  }

  renderPipelineDashboard();

  const visibleLeads = pipelineFilter === "Todos"
    ? savedLeads
    : savedLeads.filter(lead =>
        (lead.stage || "Novo") === pipelineFilter
      );

  if (!visibleLeads.length) {
    root.innerHTML = `
      <p class="muted empty-saved">
        ${savedLeads.length === 0
          ? "Você ainda não salvou leads. Salve empresas para montar sua lista de prospecção."
          : "Nenhum lead nesta etapa. Escolha outra etapa no pipeline."}
      </p>`;
    return;
  }

  root.innerHTML = visibleLeads.map(lead => {
    const noSite = !hasWebsite(lead);
    const stage = PIPELINE_STAGES.includes(lead.stage)
      ? lead.stage
      : "Novo";

    return `
      <article class="lead-card">
        <div class="lead-avatar">
          ${escapeHtml((lead.name || "?").slice(0, 1).toUpperCase())}
        </div>

        <div class="lead-main">
          <h4 class="lead-title">${escapeHtml(lead.name)}</h4>

          <div class="lead-meta">
            ${escapeHtml(lead.category || "Negócio local")}
            ${lead.phone ? ` · ${escapeHtml(lead.phone)}` : ""}
            ${lead.address ? `<br>${escapeHtml(lead.address)}` : ""}
          </div>

          <div class="lead-tags">
            <span class="tag">
              Pontuação: ${prospectingPriority(lead)}/100 · ${scoreLabel(lead)}
            </span>

            <span class="tag ${noSite ? "no-site" : "has-site"}">
              ${noSite ? "Sem site informado" : "Site informado"}
            </span>

            <span class="tag">Etapa: ${escapeHtml(stage)}</span>

            ${lead.notes
              ? `<span class="tag">Observações: ${escapeHtml(lead.notes)}</span>`
              : ""}
          </div>

          <div class="lead-links">
            ${lead.phone
              ? `<a href="${escapeHtml(phoneLink(lead.phone))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>`
              : ""}

            ${lead.website
              ? `<a href="${escapeHtml(safeUrl(lead.website))}" target="_blank" rel="noopener noreferrer">Site ↗</a>`
              : ""}

            <a href="${escapeHtml(googleSearchUrl(lead.name, lead.city || lead.address, "telefone contato WhatsApp"))}"
              target="_blank" rel="noopener noreferrer">Buscar telefone ↗</a>

            <a href="${escapeHtml(googleSearchUrl(lead.name, lead.city || lead.address))}"
              target="_blank" rel="noopener noreferrer">Ver empresa no Google ↗</a>

            <a href="${escapeHtml(googleSearchUrl(lead.name, lead.city || lead.address, "Instagram oficial"))}"
              target="_blank" rel="noopener noreferrer">Buscar Instagram ↗</a>

            ${lead.osmUrl
              ? `<a href="${escapeHtml(lead.osmUrl)}" target="_blank" rel="noopener noreferrer">Fonte ↗</a>`
              : ""}
          </div>
        </div>

        <div class="lead-actions">
          <label class="pipeline-stage-label" for="stage-${escapeHtml(lead.id)}">
            Etapa da venda
          </label>

          <select class="pipeline-stage-select"
            id="stage-${escapeHtml(lead.id)}"
            data-stage-select="${escapeHtml(lead.id)}">
            ${PIPELINE_STAGES.map(option => `
              <option value="${escapeHtml(option)}"
                ${stage === option ? "selected" : ""}>
                ${escapeHtml(option)}
              </option>
            `).join("")}
          </select>

          <button type="button" class="mini-btn"
            data-copy-saved="${escapeHtml(lead.id)}">
            Copiar abordagem
          </button>

          <button type="button" class="mini-btn"
            data-notes="${escapeHtml(lead.id)}">
            Editar observações
          </button>

          <button type="button" class="mini-btn"
            data-remove="${escapeHtml(lead.id)}">
            Remover
          </button>
        </div>
      </article>`;
  }).join("");

  root.querySelectorAll("[data-stage-select]").forEach(select => {
    select.addEventListener("change", () => {
      const lead = savedLeads.find(item =>
        item.id === select.dataset.stageSelect
      );

      if (!lead) return;

      lead.stage = select.value;
      persistSaved();
      setStatus(`Etapa de "${lead.name}" atualizada.`, "success");
    });
  });

  root.querySelectorAll("[data-copy-saved]").forEach(button => {
    button.addEventListener("click", () =>
      copyApproach(button.dataset.copySaved, "saved")
    );
  });

  root.querySelectorAll("[data-notes]").forEach(button => {
    button.addEventListener("click", () =>
      editLeadNotes(button.dataset.notes)
    );
  });

  root.querySelectorAll("[data-remove]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.remove;

      savedLeads = savedLeads.filter(lead => lead.id !== id);
      persistSaved();
      renderResults();
    });
  });
}
renderSaved();
