
/*
 * LEADFINDER BRASIL — FUNIL DE VENDAS
 * Painel visual, contagem por etapa e filtro de leads.
 * Compatível com app.js e com o armazenamento local existente.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "leadfinder-brasil-leads-v1";

  const STAGES = [
    "Novo",
    "Contato feito",
    "Respondeu",
    "Em negociação",
    "Convertido",
    "Sem interesse"
  ];

  let activeStage = null;
  let dashboard;
  let savedResults;
  let filterNotice;
  let observer;
  let refreshScheduled = false;

  function readLeads() {
    try {
      const data = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "[]"
      );

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(
        "LeadFinder: não foi possível ler os leads salvos.",
        error
      );

      return [];
    }
  }

  function normalizeStage(stage) {
    return STAGES.includes(stage) ? stage : "Novo";
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return entities[char];
    });
  }

  function getStageCounts(leads) {
    const counts = {};

    STAGES.forEach(function (stage) {
      counts[stage] = 0;
    });

    leads.forEach(function (lead) {
      const stage = normalizeStage(lead.stage);
      counts[stage]++;
    });

    return counts;
  }

  function createDashboard() {
    if (document.getElementById("pipelineDashboard")) {
      dashboard = document.getElementById("pipelineDashboard");
      return;
    }

    const savedPanel = document.querySelector(".saved-panel");
    savedResults = document.getElementById("savedResults");

    if (!savedPanel || !savedResults) {
      console.warn(
        "LeadFinder: seção de leads salvos não encontrada."
      );
      return;
    }

    dashboard = document.createElement("section");
    dashboard.id = "pipelineDashboard";
    dashboard.className = "pipeline-dashboard";
    dashboard.setAttribute(
      "aria-label",
      "Painel do funil de vendas"
    );

    dashboard.innerHTML = `
      <div class="pipeline-heading">
        <div>
          <h3>Funil de vendas</h3>
          <p>Acompanhe seus contatos em cada etapa da prospecção.</p>
        </div>
        <div class="pipeline-total" id="pipelineTotal">
          0 leads
        </div>
      </div>

      <div class="pipeline-cards" id="pipelineCards">
        ${STAGES.map(function (stage, index) {
          return `
            <button
              type="button"
              class="pipeline-card"
              data-pipeline-stage="${escapeHTML(stage)}"
              aria-pressed="false"
            >
              <span class="pipeline-stage-label">
                ${escapeHTML(stage)}
              </span>
              <strong
                class="pipeline-stage-count"
                data-count-stage="${escapeHTML(stage)}"
              >0</strong>
              <span class="pipeline-card-caption">
                ${index === 0 ? "Comece por aqui" :
                  stage === "Convertido" ? "Vendas concluídas" :
                  stage === "Sem interesse" ? "Encerrados" :
                  "Ver leads nesta etapa"}
              </span>
            </button>
          `;
        }).join("")}
      </div>

      <div class="pipeline-filter-bar">
        <span id="pipelineFilterLabel">
          Exibindo todos os leads salvos
        </span>
        <button
          type="button"
          id="pipelineClearFilter"
          class="pipeline-clear-filter"
          hidden
        >
          Mostrar todos
        </button>
      </div>
    `;

    // Coloca o painel antes da lista de leads existentes.
    savedPanel.insertBefore(dashboard, savedResults);

    filterNotice = document.getElementById("pipelineFilterLabel");

    dashboard.addEventListener("click", function (event) {
      const stageButton = event.target.closest(
        "[data-pipeline-stage]"
      );

      if (stageButton && dashboard.contains(stageButton)) {
        const stage = stageButton.getAttribute(
          "data-pipeline-stage"
        );

        activeStage = activeStage === stage ? null : stage;

        updateDashboard();
        applyFilter();
        return;
      }

      if (
        event.target.closest("#pipelineClearFilter")
      ) {
        activeStage = null;
        updateDashboard();
        applyFilter();
      }
    });

    // Observa a lista original: app.js continua responsável
    // por salvar, editar e renderizar os leads.
    observer = new MutationObserver(function () {
      scheduleRefresh();
    });

    observer.observe(savedResults, {
      childList: true,
      subtree: true
    });

    updateDashboard();
    applyFilter();
  }

  function scheduleRefresh() {
    if (refreshScheduled) return;

    refreshScheduled = true;

    queueMicrotask(function () {
      refreshScheduled = false;
      updateDashboard();
      applyFilter();
    });
  }

  function updateDashboard() {
    if (!dashboard) return;

    const leads = readLeads();
    const counts = getStageCounts(leads);

    const total = document.getElementById("pipelineTotal");

    if (total) {
      total.textContent =
        leads.length + (leads.length === 1 ? " lead" : " leads");
    }

    STAGES.forEach(function (stage) {
      const countElement = dashboard.querySelector(
        `[data-count-stage="${stage}"]`
      );

      if (countElement) {
        countElement.textContent = counts[stage];
      }
    });

    dashboard
      .querySelectorAll("[data-pipeline-stage]")
      .forEach(function (button) {
        const selected =
          button.getAttribute("data-pipeline-stage") === activeStage;

        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

    const clearButton = document.getElementById(
      "pipelineClearFilter"
    );

    if (clearButton) {
      clearButton.hidden = !activeStage;
    }

    if (filterNotice) {
      filterNotice.textContent = activeStage
        ? "Filtrando por etapa: " + activeStage
        : "Exibindo todos os leads salvos";
    }
  }

  function applyFilter() {
    if (!savedResults) return;

    const leads = readLeads();

    // renderSaved() do app.js cria os cartões na mesma ordem
    // dos objetos armazenados. Associamos cada cartão ao lead.
    const cards = Array.from(savedResults.children).filter(
      function (element) {
        return element.matches("article, .lead-card");
      }
    );

    cards.forEach(function (card, index) {
      const lead = leads[index];

      if (!lead) {
        card.hidden = false;
        return;
      }

      card.dataset.pipelineLeadId = String(lead.id ?? index);
      card.dataset.pipelineStage = normalizeStage(lead.stage);

      card.hidden = activeStage !== null &&
        card.dataset.pipelineStage !== activeStage;
    });

    // Se a lista tiver um elemento vazio ou informativo, não o
    // escondemos junto com os cartões.
    Array.from(savedResults.children).forEach(function (element) {
      if (!element.matches("article, .lead-card")) {
        element.hidden = false;
      }
    });
  }

  function init() {
    savedResults = document.getElementById("savedResults");

    if (!savedResults) {
      console.warn(
        "LeadFinder: #savedResults não existe no HTML."
      );
      return;
    }

    createDashboard();

    // Atualiza quando outro separador modificar o armazenamento.
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY || event.key === null) {
        updateDashboard();
        applyFilter();
      }
    });

    // Atualiza os números periodicamente como proteção extra
    // caso a lista seja atualizada sem mudança estrutural.
    window.addEventListener("focus", function () {
      updateDashboard();
      applyFilter();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }
})();
