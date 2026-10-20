
/* ==========================================
   LEADFINDER BRASIL — PIPELINE DE VENDAS
   Layout responsivo, moderno e acessível
   ========================================== */

.pipeline-dashboard {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0 24px;
  width: 100%;
  box-sizing: border-box;
}

.pipeline-heading {
  grid-column: 1 / -1;
  margin-bottom: 4px;
}

.pipeline-heading h3 {
  margin: 0 0 7px;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.025em;
}

.pipeline-heading p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  opacity: 0.75;
}

/* Cartões de cada etapa */

.pipeline-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 13px;

  width: 100%;
  min-width: 0;
  min-height: 104px;
  padding: 15px;

  border: 1px solid var(--border, #ded8f4);
  border-radius: 15px;

  background: var(--card, #ffffff);
  color: var(--text, #171329);

  text-align: left;
  font: inherit;
  cursor: pointer;

  overflow-wrap: anywhere;
  box-sizing: border-box;

  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.pipeline-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary, #7c4dff);
  box-shadow: 0 8px 22px rgba(80, 45, 160, 0.09);
}

.pipeline-card:active {
  transform: translateY(0);
}

.pipeline-card.active {
  padding: 14px;
  border: 2px solid var(--primary, #7c4dff);
  background: var(--card, #ffffff);
  box-shadow: 0 0 0 3px rgba(124, 77, 255, 0.09);
}

.pipeline-card span {
  display: block;
  color: var(--muted, #625d75);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.pipeline-card strong {
  display: block;
  color: var(--text, #171329);
  font-size: 1.65rem;
  line-height: 1;
  font-weight: 850;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

/* Identificação da etapa selecionada */

.pipeline-card.active strong {
  color: var(--primary, #7c4dff);
}

/* Rótulo do seletor de etapas */

.pipeline-stage-label {
  display: block;
  width: 100%;
  margin: 8px 0 6px;

  color: var(--text, #171329);
  font-size: 0.84rem;
  font-weight: 750;
  line-height: 1.45;
}

/* Seletor para movimentar o lead no funil */

.pipeline-stage-select {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;

  border: 1px solid var(--border, #ded8f4);
  border-radius: 11px;

  background-color: var(--card, #ffffff);
  color: var(--text, #171329);

  font: inherit;
  font-size: 0.9rem;
  line-height: 1.4;

  box-sizing: border-box;
  cursor: pointer;

  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.pipeline-stage-select:hover {
  border-color: var(--primary, #7c4dff);
}

.pipeline-stage-select option {
  background-color: #ffffff;
  color: #171329;
}

/* Acessibilidade: foco visível pelo teclado */

.pipeline-stage-select:focus-visible,
.pipeline-card:focus-visible {
  outline: 3px solid var(--primary, #7c4dff);
  outline-offset: 3px;
}

/* Tablets e telas intermediárias */

@media (min-width: 601px) and (max-width: 900px) {
  .pipeline-dashboard {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .pipeline-card {
    min-height: 94px;
  }
}

/* Celulares */

@media (max-width: 600px) {
  .pipeline-dashboard {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
    margin: 16px 0 20px;
  }

  .pipeline-heading {
    margin-bottom: 3px;
  }

  .pipeline-heading h3 {
    font-size: 1.05rem;
  }

  .pipeline-heading p {
    font-size: 0.85rem;
  }

  .pipeline-card {
    min-height: 88px;
    padding: 12px;
    gap: 11px;
    border-radius: 13px;
  }

  .pipeline-card.active {
    padding: 11px;
  }

  .pipeline-card span {
    font-size: 0.77rem;
  }

  .pipeline-card strong {
    font-size: 1.45rem;
  }

  .pipeline-stage-label {
    font-size: 0.82rem;
  }

  .pipeline-stage-select {
    min-height: 44px;
    max-width: 100%;
    font-size: 0.87rem;
  }
}

/* Celulares muito estreitos */

@media (max-width: 360px) {
  .pipeline-dashboard {
    gap: 7px;
  }

  .pipeline-card {
    min-height: 82px;
    padding: 10px;
  }

  .pipeline-card.active {
    padding: 9px;
  }

  .pipeline-card span {
    font-size: 0.73rem;
  }

  .pipeline-card strong {
    font-size: 1.3rem;
  }
}

/* Respeita usuários que preferem menos animações */

@media (prefers-reduced-motion: reduce) {
  .pipeline-card,
  .pipeline-stage-select {
    transition: none;
  }

  .pipeline-card:hover {
    transform: none;
  }
}
