/**
 * =============================================================================
 * relatorio-semanal.js — Módulo de Fechamento de Semana / Relatório Semanal
 * SobreÁguas Distribuidora
 *
 * ARQUIVO EXTERNO — não modifica nenhum código existente.
 * Usa a instância do Firebase já inicializada pelo script.js.
 * Semana: Domingo → Sábado
 * Requer: jsPDF (carregado via CDN no adm.html)
 *
 * COMO USAR NO adm.html:
 *   1. Adicione o jsPDF CDN (se ainda não tiver):
 *      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
 *   2. Adicione este script APÓS o script.js:
 *      <script src="SCRIPT/relatorio-semanal.js"></script>
 * =============================================================================
 */

(function () {
  'use strict';

  /* ============================================================
     CONFIGURAÇÃO
  ============================================================ */
  const EMPRESA_NOME      = 'SobreÁguas Distribuidora';
  const EMPRESA_SUBTITULO = 'Água & Gás — Relatório Semanal de Caixa';
  const DB_PATH           = 'aquagas_db';

  // Semana começa no Domingo (0). Para Segunda, usar 1.
  const SEMANA_INICIO_DIA = 0;

  const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const NOMES_DIAS_COMPLETOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  /* ============================================================
     UTILITÁRIOS
  ============================================================ */
  function fmtDataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }

  function hoje() {
    return new Date().toISOString().split('T')[0];
  }

  function hojeFormatado() {
    return new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function agora() {
    return new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function moeda(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }

  /**
   * Dado qualquer data ISO (YYYY-MM-DD), retorna o intervalo
   * Domingo → Sábado da semana que contém essa data.
   * Retorna { inicio: "YYYY-MM-DD", fim: "YYYY-MM-DD", dias: ["YYYY-MM-DD", ...] }
   */
  function calcularSemana(isoData) {
    const ref  = new Date(isoData + 'T12:00:00');
    const dow  = ref.getDay(); // 0=Dom … 6=Sáb
    const diffInicio = (dow - SEMANA_INICIO_DIA + 7) % 7;

    const inicio = new Date(ref);
    inicio.setDate(ref.getDate() - diffInicio);

    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      dias.push(d.toISOString().split('T')[0]);
    }

    return {
      inicio: dias[0],
      fim:    dias[6],
      dias,
    };
  }

  function getDB() {
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        return firebase.apps[0].database();
      }
    } catch (e) { /* silent */ }
    return null;
  }

  async function lerPath(path) {
    const db = getDB();
    if (db) {
      try {
        const snap = await db.ref(path).get();
        return snap.exists() ? snap.val() : null;
      } catch (e) {
        console.warn('[relatorio-semanal.js] lerPath Firebase erro:', e.message);
      }
    }
    try {
      const partes = path.split('/');
      let obj = JSON.parse(localStorage.getItem(partes[0]) || 'null');
      for (let i = 1; i < partes.length; i++) {
        if (!obj) return null;
        obj = obj[partes[i]];
      }
      return obj !== undefined ? obj : null;
    } catch (e) { return null; }
  }

  async function deletarPath(path) {
    const db = getDB();
    if (db) {
      try {
        await db.ref(path).remove();
        return true;
      } catch (e) {
        console.warn('[relatorio-semanal.js] deletarPath Firebase erro:', e.message);
      }
    }
    try {
      const partes = path.split('/');
      const raiz   = partes[0];
      const base   = JSON.parse(localStorage.getItem(raiz) || '{}');
      let cur = base;
      for (let i = 1; i < partes.length - 1; i++) {
        if (!cur[partes[i]]) return false;
        cur = cur[partes[i]];
      }
      delete cur[partes[partes.length - 1]];
      localStorage.setItem(raiz, JSON.stringify(base));
      return true;
    } catch (e) { return false; }
  }

  /* ============================================================
     ESTADO DO MÓDULO
  ============================================================ */
  let dadosSemana    = null;
  let semanaAtual    = null; // { inicio, fim, dias }
  let semanaAnterior = null; // para comparativo

  /* ============================================================
     INJETAR BOTÃO NA SIDEBAR
  ============================================================ */
  function injetarBotaoSidebar() {
    if (document.getElementById('relatorio-semanal-nav-btn')) return;

    const sidenav = document.querySelector('nav.sidenav');
    if (!sidenav) return;

    // Adiciona separador de seção só se o botão diário não o fez
    const secaoExistente = [...sidenav.querySelectorAll('.nav-section')]
      .find(el => el.textContent.trim() === 'Caixa');
    if (!secaoExistente) {
      const secao = document.createElement('div');
      secao.className   = 'nav-section';
      secao.textContent = 'Caixa';
      sidenav.appendChild(secao);
    }

    const btn = document.createElement('div');
    btn.id        = 'relatorio-semanal-nav-btn';
    btn.className = 'relatorio-nav-item';
    btn.title     = 'Gerar Relatório e Fechar Semana';
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" width="18" height="18">' +
        '<path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192zm176 40c-13.3 0-24 10.7-24 24v48H152c-13.3 0-24 10.7-24 24s10.7 24 24 24h48v48c0 13.3 10.7 24 24 24s24-10.7 24-24V351h48c13.3 0 24-10.7 24-24s-10.7-24-24-24H248V256c0-13.3-10.7-24-24-24z"/>' +
      '</svg>' +
      ' Fechar Semana';

    btn.addEventListener('click', abrirRelatorioSemanal);
    sidenav.appendChild(btn);
  }

  /* ============================================================
     CRIAR MODAL HTML
  ============================================================ */
  function criarModal() {
    if (document.getElementById('relatorioSemanalOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'relatorioSemanalOverlay';

    // Reutiliza os estilos do relatorio.css que já está carregado,
    // e adiciona overrides específicos do semanal inline via <style>
    const style = document.createElement('style');
    style.id = 'relatorio-semanal-styles';
    style.textContent = `
      #relatorioSemanalOverlay {
        position: fixed;
        inset: 0;
        background: rgba(5, 10, 18, 0.85);
        z-index: 8100;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
        backdrop-filter: blur(4px);
      }
      #relatorioSemanalOverlay.aberto { display: flex; }

      .rel-sem-modal {
        background: #12151c;
        border: 1px solid #252a38;
        border-radius: 18px;
        width: 100%;
        max-width: 660px;
        max-height: 92vh;
        overflow-y: auto;
        box-shadow: 0 24px 64px rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        animation: relSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);
      }

      /* Semana pill — destaque verde */
      .rel-sem-periodo {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 229, 160, 0.1);
        border: 1px solid rgba(0, 229, 160, 0.25);
        border-radius: 20px;
        padding: 3px 10px;
        font-size: 0.78rem;
        color: #00e5a0;
        font-weight: 600;
        margin-top: 6px;
      }

      /* Tabela de dias da semana */
      .rel-dias-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
        margin-bottom: 14px;
      }
      .rel-dia-card {
        background: #181c26;
        border: 1px solid #252a38;
        border-radius: 10px;
        padding: 8px 4px;
        text-align: center;
      }
      .rel-dia-card.melhor {
        border-color: rgba(0,229,160,0.4);
        background: rgba(0,229,160,0.05);
      }
      .rel-dia-card.pior {
        border-color: rgba(255,77,109,0.3);
        background: rgba(255,77,109,0.04);
      }
      .rel-dia-nome {
        font-size: 0.65rem;
        color: #7a8299;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .rel-dia-valor {
        font-size: 0.78rem;
        font-weight: 700;
        color: #e8ecf4;
      }
      .rel-dia-valor.zero { color: #3a3f52; }
      .rel-dia-valor.pos  { color: #00e5a0; }
      .rel-dia-valor.neg  { color: #ff4d6d; }
      .rel-dia-pedidos {
        font-size: 0.62rem;
        color: #7a8299;
        margin-top: 2px;
      }

      /* Comparativo semana anterior */
      .rel-comparativo {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 14px;
      }
      .rel-comp-item {
        background: #181c26;
        border: 1px solid #252a38;
        border-radius: 10px;
        padding: 10px 12px;
        text-align: center;
      }
      .rel-comp-label {
        font-size: 0.68rem;
        color: #7a8299;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .rel-comp-delta {
        font-size: 0.82rem;
        font-weight: 700;
      }
      .rel-comp-delta.up   { color: #00e5a0; }
      .rel-comp-delta.down { color: #ff4d6d; }
      .rel-comp-delta.zero { color: #7a8299; }
      .rel-comp-base {
        font-size: 0.65rem;
        color: #3a3f52;
        margin-top: 2px;
      }

      /* Ranking de produtos */
      .rel-ranking-lista {
        padding: 8px 16px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .rel-ranking-item {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .rel-ranking-pos {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 700;
        flex-shrink: 0;
      }
      .rel-ranking-pos.ouro   { background: rgba(255,210,63,0.2); color: #ffd23f; }
      .rel-ranking-pos.prata  { background: rgba(180,190,210,0.2); color: #b4bed2; }
      .rel-ranking-pos.bronze { background: rgba(200,120,60,0.2); color: #c8783c; }
      .rel-ranking-pos.outro  { background: rgba(255,255,255,0.05); color: #7a8299; }
      .rel-ranking-bar-wrap {
        flex: 1;
        position: relative;
      }
      .rel-ranking-nome {
        font-size: 0.82rem;
        color: #e8ecf4;
        margin-bottom: 3px;
      }
      .rel-ranking-bar {
        height: 4px;
        border-radius: 2px;
        background: rgba(0,212,255,0.25);
        transition: width 0.4s;
      }
      .rel-ranking-bar.ouro   { background: rgba(255,210,63,0.5); }
      .rel-ranking-bar.prata  { background: rgba(180,190,210,0.4); }
      .rel-ranking-bar.bronze { background: rgba(200,120,60,0.4); }
      .rel-ranking-qty {
        font-size: 0.8rem;
        font-weight: 700;
        color: #00d4ff;
        white-space: nowrap;
      }

      @media (max-width: 520px) {
        .rel-dias-grid { grid-template-columns: repeat(4, 1fr); }
        .rel-comparativo { grid-template-columns: repeat(3, 1fr); }
        .rel-sem-modal { border-radius: 14px; }
      }
    `;

    if (!document.getElementById('relatorio-semanal-styles')) {
      document.head.appendChild(style);
    }

    overlay.innerHTML = `
      <div class="rel-sem-modal" role="dialog" aria-modal="true" aria-label="Fechamento de Semana">

        <!-- HEADER -->
        <div class="relatorio-header">
          <div class="relatorio-header-left">
            <div class="relatorio-header-icon" style="background:linear-gradient(135deg,rgba(0,229,160,0.2),rgba(0,229,160,0.06));border-color:rgba(0,229,160,0.3);color:#00e5a0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" width="20" height="20">
                <path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192zm176 40c-13.3 0-24 10.7-24 24v48H152c-13.3 0-24 10.7-24 24s10.7 24 24 24h48v48c0 13.3 10.7 24 24 24s24-10.7 24-24V351h48c13.3 0 24-10.7 24-24s-10.7-24-24-24H248V256c0-13.3-10.7-24-24-24z"/>
              </svg>
            </div>
            <div>
              <h2 style="color:#e8ecf4">Fechamento de Semana</h2>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
                <input type="date" id="relSemDataInput"
                  style="background:var(--card,#1a1d2e);border:1px solid var(--border,#2a2d3e);border-radius:8px;padding:4px 10px;color:var(--text,#fff);font-size:.85rem;font-family:inherit;outline:none;cursor:pointer">
                <span class="rel-sem-periodo" id="relSemPeriodoLabel">—</span>
              </div>
            </div>
          </div>
          <button class="relatorio-btn-fechar" id="relSemBtnFechar" title="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" width="14" height="14">
              <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/>
            </svg>
          </button>
        </div>

        <!-- BODY -->
        <div class="relatorio-body" id="relSemBody">
          <div class="relatorio-loading" id="relSemLoading">
            <div class="rel-spinner"></div>
            <p>Carregando dados da semana...</p>
          </div>
          <div id="relSemConteudo" style="display:none"></div>
        </div>

        <!-- FOOTER -->
        <div class="relatorio-footer" id="relSemFooter" style="display:none">
          <div class="relatorio-alerta" id="relSemAlerta"></div>
          <div class="relatorio-footer-btns">
            <button class="rel-btn rel-btn-gerar" id="relSemBtnPDF" disabled>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" width="15" height="15">
                <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64z"/>
              </svg>
              Gerar PDF
            </button>
            <button class="rel-btn rel-btn-apagar" id="relSemBtnApagar" disabled style="display:none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" width="15" height="15">
                <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"/>
              </svg>
              Fechar Semana
            </button>
            <button class="rel-btn rel-btn-ghost" id="relSemBtnCancelar">Cancelar</button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    // Eventos dos botões
    document.getElementById('relSemBtnFechar').addEventListener('click',   fecharRelatorio);
    document.getElementById('relSemBtnCancelar').addEventListener('click',  fecharRelatorio);
    document.getElementById('relSemBtnPDF').addEventListener('click',       gerarPDF);
    document.getElementById('relSemBtnApagar').addEventListener('click',    confirmarFecharSemana);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) fecharRelatorio();
    });

    // Evento do seletor de data — recarrega ao mudar
    document.getElementById('relSemDataInput').addEventListener('change', async function () {
      await carregarESincronizar(this.value);
    });
  }

  /* ============================================================
     ABRIR MODAL
  ============================================================ */
  async function abrirRelatorioSemanal() {
    criarModal();

    const overlay   = document.getElementById('relatorioSemanalOverlay');
    const inputData = document.getElementById('relSemDataInput');

    inputData.value = hoje();
    overlay.classList.add('aberto');
    document.body.style.overflow = 'hidden';

    await carregarESincronizar(inputData.value);
  }

  /* ============================================================
     CARREGAR + SINCRONIZAR UI
  ============================================================ */
  async function carregarESincronizar(dataIso) {
    const loading   = document.getElementById('relSemLoading');
    const conteudo  = document.getElementById('relSemConteudo');
    const footer    = document.getElementById('relSemFooter');
    const btnPDF    = document.getElementById('relSemBtnPDF');
    const btnApagar = document.getElementById('relSemBtnApagar');
    const alerta    = document.getElementById('relSemAlerta');

    // Reset UI
    loading.style.display   = 'block';
    conteudo.style.display  = 'none';
    footer.style.display    = 'none';
    btnApagar.style.display = 'none';
    btnPDF.disabled         = true;
    dadosSemana             = null;
    if (alerta) alerta.className = 'relatorio-alerta';

    // Calcula semana
    semanaAtual    = calcularSemana(dataIso);
    atualizarPeriodoLabel(semanaAtual);

    try {
      dadosSemana = await carregarDadosSemana(semanaAtual);
    } catch (e) {
      loading.style.display  = 'none';
      conteudo.style.display = 'block';
      conteudo.innerHTML     = '<div class="relatorio-vazio"><p>Erro ao carregar dados.<br><small style="color:#7a8299">' + e.message + '</small></p></div>';
      footer.style.display   = 'flex';
      return;
    }

    loading.style.display  = 'none';
    conteudo.style.display = 'block';
    footer.style.display   = 'flex';
    btnPDF.disabled        = false;

    renderizarConteudo(dadosSemana);

    if (dadosSemana.totalPedidos > 0 || dadosSemana.totalLancamentos > 0) {
      btnApagar.style.display = 'inline-flex';
      btnApagar.disabled      = false;
    }
  }

  /* ============================================================
     ATUALIZAR LABEL DO PERÍODO
  ============================================================ */
  function atualizarPeriodoLabel(sem) {
    const el = document.getElementById('relSemPeriodoLabel');
    if (el && sem) {
      el.textContent = fmtDataBR(sem.inicio) + ' → ' + fmtDataBR(sem.fim);
    }
  }

  /* ============================================================
     FECHAR MODAL
  ============================================================ */
  function fecharRelatorio() {
    const overlay = document.getElementById('relatorioSemanalOverlay');
    if (overlay) overlay.classList.remove('aberto');
    document.body.style.overflow = '';
  }

  /* ============================================================
     CARREGAR DADOS DA SEMANA
  ============================================================ */
  async function carregarDadosSemana(sem) {
    const db = await lerPath(DB_PATH);

    const todasComandas    = db && db.comandas    ? Object.values(db.comandas)    : [];
    const todosLancamentos = db && db.lancamentos ? Object.values(db.lancamentos) : [];

    // Filtra apenas registros dentro da semana
    const comandas    = todasComandas.filter(c => sem.dias.includes(c.data));
    const lancamentos = todosLancamentos.filter(l => sem.dias.includes(l.data));

    /* ---- Métricas globais ---- */
    const totalEntrada = lancamentos
      .filter(l => l.tipo === 'receita')
      .reduce((s, l) => s + (Number(l.valor) || 0), 0);

    const totalSaida = lancamentos
      .filter(l => l.tipo === 'despesa')
      .reduce((s, l) => s + (Number(l.valor) || 0), 0);

    const saldoSemana = totalEntrada - totalSaida;

    const totalPedidos      = comandas.length;
    const pedidosConcluidos = comandas.filter(c => c.status === 'concluida').length;
    const pedidosPendentes  = comandas.filter(c => c.status === 'pendente').length;
    const pedidosCancelados = comandas.filter(c => c.status === 'cancelada').length;

    /* ---- Desempenho por dia ---- */
    const diasDesempenho = sem.dias.map((iso, idx) => {
      const cmdsDia = comandas.filter(c => c.data === iso && c.status !== 'cancelada');
      const lancDia = lancamentos.filter(l => l.data === iso);
      const receitaDia = lancDia.filter(l => l.tipo === 'receita').reduce((s,l) => s+(Number(l.valor)||0), 0);
      const despesaDia = lancDia.filter(l => l.tipo === 'despesa').reduce((s,l) => s+(Number(l.valor)||0), 0);
      return {
        iso,
        nome:    NOMES_DIAS[new Date(iso + 'T12:00:00').getDay()],
        nomeCompleto: NOMES_DIAS_COMPLETOS[new Date(iso + 'T12:00:00').getDay()],
        pedidos: cmdsDia.length,
        receita: receitaDia,
        despesa: despesaDia,
        saldo:   receitaDia - despesaDia,
      };
    });

    // Melhor e pior dia (por saldo, excluindo dias sem movimento)
    const diasComMovimento = diasDesempenho.filter(d => d.pedidos > 0 || d.receita > 0);
    let melhorDia = null, piorDia = null;
    if (diasComMovimento.length > 0) {
      melhorDia = diasComMovimento.reduce((a, b) => b.saldo > a.saldo ? b : a);
      piorDia   = diasComMovimento.reduce((a, b) => b.saldo < a.saldo ? b : a);
    }

    /* ---- Ranking de produtos ---- */
    const mapaProdutos = {};
    comandas.filter(c => c.status !== 'cancelada').forEach(c => {
      if (!c.itens) return;
      const itens = Array.isArray(c.itens) ? c.itens : Object.values(c.itens);
      itens.forEach(item => {
        const nome = item.nome || 'Produto';
        if (!mapaProdutos[nome]) {
          mapaProdutos[nome] = { nome, quantidade: 0, total: 0, icone: item.icone || '' };
        }
        mapaProdutos[nome].quantidade += Number(item.qty || item.quantidade || 1);
        mapaProdutos[nome].total      += Number(item.preco || 0) * Number(item.qty || item.quantidade || 1);
      });
    });
    const rankingProdutos = Object.values(mapaProdutos)
      .sort((a, b) => b.quantidade - a.quantidade);

    /* ---- Funcionários pagos na semana ---- */
    const funcionariosPagos = lancamentos
      .filter(l => l.tipo === 'despesa' && l.categoria === 'salarios')
      .map(l => ({
        nome:  l.descricao || 'Funcionário',
        valor: Number(l.valor) || 0,
        data:  l.data || '',
      }));

    // Agrupa por nome (soma tudo da semana)
    const mapaFunc = {};
    funcionariosPagos.forEach(f => {
      if (!mapaFunc[f.nome]) mapaFunc[f.nome] = { nome: f.nome, valor: 0, pagamentos: 0 };
      mapaFunc[f.nome].valor      += f.valor;
      mapaFunc[f.nome].pagamentos += 1;
    });
    const funcionariosAgrupados = Object.values(mapaFunc);

    /* ---- Comparativo semana anterior ---- */
    const semAnteriorDias = sem.dias.map(iso => {
      const d = new Date(iso + 'T12:00:00');
      d.setDate(d.getDate() - 7);
      return d.toISOString().split('T')[0];
    });
    const cmdAnterior  = todasComandas.filter(c => semAnteriorDias.includes(c.data));
    const lancAnterior = todosLancamentos.filter(l => semAnteriorDias.includes(l.data));

    const entradaAnterior = lancAnterior.filter(l => l.tipo === 'receita').reduce((s,l) => s+(Number(l.valor)||0), 0);
    const saidaAnterior   = lancAnterior.filter(l => l.tipo === 'despesa').reduce((s,l) => s+(Number(l.valor)||0), 0);
    const saldoAnterior   = entradaAnterior - saidaAnterior;
    const pedidosAnterior = cmdAnterior.length;
    const temComparativo  = cmdAnterior.length > 0 || lancAnterior.length > 0;

    const comparativo = {
      temDados:       temComparativo,
      saldoAnterior,
      entradaAnterior,
      pedidosAnterior,
      deltaSaldo:     saldoSemana    - saldoAnterior,
      deltaEntrada:   totalEntrada   - entradaAnterior,
      deltaPedidos:   totalPedidos   - pedidosAnterior,
    };

    return {
      semana: sem,
      totalEntrada,
      totalSaida,
      saldoSemana,
      totalPedidos,
      pedidosConcluidos,
      pedidosPendentes,
      pedidosCancelados,
      diasDesempenho,
      melhorDia,
      piorDia,
      rankingProdutos,
      funcionarios: funcionariosAgrupados,
      lancamentos,
      totalLancamentos: lancamentos.length,
      comparativo,
    };
  }

  /* ============================================================
     RENDERIZAR MODAL
  ============================================================ */
  function renderizarConteudo(d) {
    const el = document.getElementById('relSemConteudo');

    if (d.totalPedidos === 0 && d.totalLancamentos === 0) {
      el.innerHTML =
        '<div class="relatorio-vazio">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" width="48" height="48" style="opacity:.2"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>' +
          '<p>Nenhum movimento registrado nesta semana.</p>' +
          '<p style="font-size:.78rem;margin-top:4px;color:#3a3f52">' + fmtDataBR(d.semana.inicio) + ' → ' + fmtDataBR(d.semana.fim) + '</p>' +
        '</div>';
      return;
    }

    let html = '';

    /* --- Cards de métricas globais --- */
    const totalUnidades = d.rankingProdutos.reduce((s, p) => s + p.quantidade, 0);
    html += '<div class="relatorio-metricas">';
    html += metricaCard('Itens Vendidos',      totalUnidades + ' unid.',   'verde',   iconeCoin());
    html += metricaCard('Entradas da Semana',  moeda(d.totalEntrada),      'azul',    iconeUp());
    html += metricaCard('Despesas da Semana',  moeda(d.totalSaida),        'vermelho',iconeDown());
    html += metricaCard('Saldo da Semana',     moeda(d.saldoSemana),       d.saldoSemana >= 0 ? 'verde' : 'vermelho', iconeWallet());
    html += '</div>';

    /* --- Desempenho por dia --- */
    html += '<div class="relatorio-secao" style="margin-bottom:14px">';
    html += '<div class="relatorio-secao-titulo">📅 Desempenho por Dia</div>';
    html += '<div style="padding:12px 14px">';
    html += '<div class="rel-dias-grid">';
    d.diasDesempenho.forEach(dia => {
      const isMelhor = d.melhorDia && dia.iso === d.melhorDia.iso && (dia.pedidos > 0 || dia.receita > 0);
      const isPior   = d.piorDia   && dia.iso === d.piorDia.iso   && (dia.pedidos > 0 || dia.receita > 0) && d.melhorDia.iso !== d.piorDia.iso;
      const cls      = isMelhor ? 'melhor' : isPior ? 'pior' : '';
      const valorCls = dia.saldo === 0 ? 'zero' : dia.saldo > 0 ? 'pos' : 'neg';
      html += '<div class="rel-dia-card ' + cls + '">';
      html += '<div class="rel-dia-nome">' + dia.nome + (isMelhor ? ' 🏆' : isPior ? ' 📉' : '') + '</div>';
      html += '<div class="rel-dia-valor ' + valorCls + '">' + (dia.saldo === 0 ? '—' : (dia.saldo > 0 ? '+' : '') + 'R$' + Number(dia.saldo).toFixed(0)) + '</div>';
      html += '<div class="rel-dia-pedidos">' + (dia.pedidos > 0 ? dia.pedidos + ' ped.' : '—') + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Legenda
    if (d.melhorDia) {
      html += '<div style="font-size:.72rem;color:#7a8299;margin-top:6px">' +
        '🏆 Melhor dia: <span style="color:#00e5a0">' + d.melhorDia.nomeCompleto + ' (' + fmtDataBR(d.melhorDia.iso) + ')</span>';
      if (d.piorDia && d.piorDia.iso !== d.melhorDia.iso) {
        html += '&ensp;📉 Pior dia: <span style="color:#ff4d6d">' + d.piorDia.nomeCompleto + ' (' + fmtDataBR(d.piorDia.iso) + ')</span>';
      }
      html += '</div>';
    }
    html += '</div></div>';

    /* --- Comparativo semana anterior --- */
    if (d.comparativo.temDados) {
      html += '<div class="relatorio-secao" style="margin-bottom:14px">';
      html += '<div class="relatorio-secao-titulo">📊 Comparativo com Semana Anterior</div>';
      html += '<div style="padding:12px 14px">';
      html += '<div class="rel-comparativo">';
      html += compCard('Saldo',    d.saldoSemana,   d.comparativo.saldoAnterior,   true);
      html += compCard('Entradas', d.totalEntrada,  d.comparativo.entradaAnterior, true);
      html += compCardNum('Pedidos', d.totalPedidos, d.comparativo.pedidosAnterior);
      html += '</div>';
      html += '</div></div>';
    }

    /* --- Ranking de produtos --- */
    if (d.rankingProdutos.length > 0) {
      const maxQty = d.rankingProdutos[0].quantidade;
      html += '<div class="relatorio-secao" style="margin-bottom:14px">';
      html += '<div class="relatorio-secao-titulo">🏅 Ranking de Produtos Mais Vendidos</div>';
      html += '<div class="rel-ranking-lista">';
      d.rankingProdutos.slice(0, 10).forEach((p, i) => {
        const medalha = i === 0 ? 'ouro' : i === 1 ? 'prata' : i === 2 ? 'bronze' : 'outro';
        const pct = Math.round((p.quantidade / maxQty) * 100);
        html +=
          '<div class="rel-ranking-item">' +
            '<div class="rel-ranking-pos ' + medalha + '">' + (i + 1) + '</div>' +
            '<div class="rel-ranking-bar-wrap">' +
              '<div class="rel-ranking-nome">' + (p.icone ? p.icone + ' ' : '') + escHtml(p.nome) + '</div>' +
              '<div class="rel-ranking-bar ' + medalha + '" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<div class="rel-ranking-qty">' + p.quantidade + 'x</div>' +
          '</div>';
      });
      html += '</div></div>';
    }

    /* --- Pedidos da semana --- */
    html += '<div class="relatorio-secao" style="margin-bottom:14px">';
    html += '<div class="relatorio-secao-titulo">📋 Pedidos da Semana</div>';
    html += '<div class="rel-resumo-lista">' +
      linhaResumo('Total de pedidos', String(d.totalPedidos)) +
      linhaResumo('Concluídos',       String(d.pedidosConcluidos)) +
      linhaResumo('Pendentes',        String(d.pedidosPendentes)) +
      linhaResumo('Cancelados',       String(d.pedidosCancelados)) +
    '</div></div>';

    /* --- Funcionários pagos na semana --- */
    if (d.funcionarios.length > 0) {
      html += '<div class="relatorio-secao" style="margin-bottom:14px">';
      html += '<div class="relatorio-secao-titulo">💳 Funcionários Pagos na Semana</div>';
      html += '<div class="rel-func-lista">';
      d.funcionarios.forEach(f => {
        const inicial = (f.nome || 'F')[0].toUpperCase();
        html +=
          '<div class="rel-func-item">' +
            '<div class="rel-func-avatar">' + inicial + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:2px;flex:1">' +
              '<span style="font-weight:600">' + escHtml(f.nome) + '</span>' +
              '<span style="font-size:.75rem;color:#7a8299">' + f.pagamentos + ' pagamento(s) na semana</span>' +
            '</div>' +
            '<span style="color:#ff4d6d;font-weight:700;margin-left:auto">' + moeda(f.valor) + '</span>' +
          '</div>';
      });
      html += '</div></div>';
    }

    /* --- Resumo financeiro final --- */
    const totalFuncSemana = d.funcionarios.reduce((s, f) => s + f.valor, 0);
    html += '<div class="relatorio-secao" style="margin-bottom:14px">';
    html += '<div class="relatorio-secao-titulo">🏦 Resumo Financeiro da Semana</div>';
    html += '<div class="rel-resumo-lista">' +
      linhaResumo('Total de Entradas',    moeda(d.totalEntrada)) +
      linhaResumo('Total de Despesas',    moeda(d.totalSaida)) +
      (totalFuncSemana > 0 ? linhaResumo('  └ Folha de Pagamento', moeda(totalFuncSemana)) : '') +
      linhaTotalResumo('Saldo Final da Semana', moeda(d.saldoSemana)) +
    '</div></div>';

    el.innerHTML = html;
  }

  /* ============================================================
     HELPERS DE HTML
  ============================================================ */
  function metricaCard(label, valor, cor, icone) {
    return '<div class="rel-metrica">' +
      '<div class="rel-metrica-label">' + icone + label + '</div>' +
      '<div class="rel-metrica-valor ' + cor + '">' + valor + '</div>' +
    '</div>';
  }

  function compCard(label, atual, anterior, isMoeda) {
    const delta = atual - anterior;
    const cls   = delta > 0 ? 'up' : delta < 0 ? 'down' : 'zero';
    const sinal = delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= ';
    const deltaStr = isMoeda ? moeda(Math.abs(delta)) : String(Math.abs(delta));
    const pct   = anterior !== 0 ? Math.round((delta / anterior) * 100) : 0;
    return '<div class="rel-comp-item">' +
      '<div class="rel-comp-label">' + label + '</div>' +
      '<div class="rel-comp-delta ' + cls + '">' + sinal + (isMoeda ? '' : '') + deltaStr + '</div>' +
      '<div class="rel-comp-base">' + (anterior !== 0 ? pct + '% vs semana ant.' : 'sem dados ant.') + '</div>' +
    '</div>';
  }

  function compCardNum(label, atual, anterior) {
    const delta = atual - anterior;
    const cls   = delta > 0 ? 'up' : delta < 0 ? 'down' : 'zero';
    const sinal = delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= ';
    const pct   = anterior !== 0 ? Math.round((delta / anterior) * 100) : 0;
    return '<div class="rel-comp-item">' +
      '<div class="rel-comp-label">' + label + '</div>' +
      '<div class="rel-comp-delta ' + cls + '">' + sinal + Math.abs(delta) + ' ped.</div>' +
      '<div class="rel-comp-base">' + (anterior !== 0 ? pct + '% vs semana ant.' : 'sem dados ant.') + '</div>' +
    '</div>';
  }

  function linhaResumo(label, valor) {
    return '<div class="rel-resumo-linha"><span>' + escHtml(label) + '</span><span>' + escHtml(valor) + '</span></div>';
  }
  function linhaTotalResumo(label, valor) {
    return '<div class="rel-resumo-linha total"><span>' + escHtml(label) + '</span><span>' + escHtml(valor) + '</span></div>';
  }
  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- Ícones inline ---- */
  function iconeCoin()   { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" width="12" height="12"><path d="M512 80c0 18-14.3 34.6-38.4 48c-29.1 16.1-72.5 27.5-122.3 30.9c-3.7-1.8-7.4-3.5-11.3-5C300.6 137.4 248.2 128 192 128c-8.3 0-16.4 .2-24.5 .6l-1.1-.6C142.3 114.6 128 98 128 80c0-44.2 86-80 192-80S512 35.8 512 80zM160.7 161.1c10.2-.7 20.7-1.1 31.3-1.1c62.2 0 117.4 12.3 152.5 31.4C369.3 204.9 384 221.7 384 240c0 4-.7 7.9-2.1 11.7c-4.6 13.2-17 25.3-35 35.5c-48.8 19.5-121.9 33.3-205.5 29.8C79.4 321.5 32 302.1 32 280s47.4-41.5 128.7-118.9zM256 512c-59 0-115.3-10.7-157.4-29.4C60 465.2 32 443.3 32 416V387.7c8.7 6.1 18.7 11.6 29.9 16.6c8.3 3.7 17.5 7.1 27.2 10.2C132.4 427.3 192.4 432 256 432s123.6-4.7 166.9-17.5c9.7-3 18.9-6.5 27.2-10.2c11.2-5 21.2-10.5 29.9-16.6V416c0 27.3-28 49.2-67.6 66.6C403.3 501.3 347 512 256 512z"/></svg>'; }
  function iconeUp()     { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" width="12" height="12"><path d="M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.2V448c0 17.7 14.3 32 32 32s32-14.3 32-32V141.2L329.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z"/></svg>'; }
  function iconeDown()   { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" width="12" height="12"><path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8V64c0-17.7-14.3-32-32-32s-32 14.3-32 32v306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>'; }
  function iconeWallet() { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" width="12" height="12"><path d="M64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V192c0-35.3-28.7-64-64-64H80c-8.8 0-16-7.2-16-16s7.2-16 16-16H448c17.7 0 32-14.3 32-32s-14.3-32-32-32H64zM432 312a24 24 0 1 1 0-48 24 24 0 1 1 0 48z"/></svg>'; }

  /* ============================================================
     GERAR PDF
  ============================================================ */
  function gerarPDF() {
    if (!dadosSemana) return;

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
      mostrarAlerta('erro', 'jsPDF não encontrado. Adicione o CDN no adm.html.');
      return;
    }

    const d   = dadosSemana;
    const doc = new jsPDFClass({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const L   = 15;
    const W   = 180;
    let   y   = 20;

    const nl    = (n = 6) => { y += n; };
    const linha = () => { doc.setDrawColor(200, 200, 210); doc.line(L, y, L + W, y); nl(4); };

    /* --- CABEÇALHO --- */
    doc.setFillColor(11, 13, 18);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(0, 229, 160);
    doc.text(EMPRESA_NOME, L, y);
    nl(8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(180, 190, 210);
    doc.text(EMPRESA_SUBTITULO, L, y);
    nl(6);

    doc.setFontSize(9);
    doc.setTextColor(140, 150, 170);
    doc.text(
      'Emitido em: ' + agora() + '   |   Período: ' + fmtDataBR(d.semana.inicio) + ' → ' + fmtDataBR(d.semana.fim),
      L, y
    );

    y = 50;

    doc.setDrawColor(0, 229, 160);
    doc.setLineWidth(0.5);
    doc.line(L, y, L + W, y);
    nl(8);
    doc.setLineWidth(0.2);

    /* --- MÉTRICAS --- */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 40, 60);
    doc.text('RESUMO FINANCEIRO DA SEMANA', L, y);
    nl(7);

    const totalUnidades = d.rankingProdutos.reduce((s, p) => s + p.quantidade, 0);
    const metricas = [
      { label: 'Itens Vendidos',     valor: totalUnidades + ' unid.',  cor: [0, 180, 100]  },
      { label: 'Total de Entradas',  valor: moeda(d.totalEntrada),     cor: [0, 150, 220]  },
      { label: 'Total de Despesas',  valor: moeda(d.totalSaida),       cor: [220, 60, 80]  },
      { label: 'Saldo da Semana',    valor: moeda(d.saldoSemana),      cor: d.saldoSemana >= 0 ? [0,180,100] : [220,60,80] },
    ];
    const cw = W / 2;
    metricas.forEach((m, i) => {
      const cx = L + (i % 2) * (cw + 5);
      const cy = y + Math.floor(i / 2) * 22;
      doc.setFillColor(245, 246, 250);
      doc.roundedRect(cx, cy - 5, cw - 5, 18, 3, 3, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 110, 130);
      doc.text(m.label, cx + 4, cy + 1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...m.cor);
      doc.text(m.valor, cx + 4, cy + 9);
    });
    y += 52;
    linha();

    /* --- DESEMPENHO POR DIA --- */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 40, 60);
    doc.text('DESEMPENHO POR DIA', L, y);
    nl(7);

    // Cabeçalho tabela
    doc.setFillColor(230, 232, 240);
    doc.rect(L, y - 4, W, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 90, 110);
    doc.text('DIA', L + 2, y + 1);
    doc.text('PEDIDOS', L + W * 0.35, y + 1);
    doc.text('ENTRADAS', L + W * 0.55, y + 1);
    doc.text('DESPESAS', L + W * 0.73, y + 1);
    doc.text('SALDO', L + W, y + 1, { align: 'right' });
    nl(7);

    d.diasDesempenho.forEach((dia, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 249, 253);
        doc.rect(L, y - 3, W, 7, 'F');
      }
      const isMelhor = d.melhorDia && dia.iso === d.melhorDia.iso && dia.pedidos > 0;
      doc.setFont('helvetica', isMelhor ? 'bold' : 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 40, 60);
      doc.text(dia.nomeCompleto + ' ' + fmtDataBR(dia.iso), L + 2, y + 1);
      doc.text(String(dia.pedidos), L + W * 0.35, y + 1);
      doc.setTextColor(0, 150, 100);
      doc.text(dia.receita > 0 ? moeda(dia.receita) : '—', L + W * 0.55, y + 1);
      doc.setTextColor(200, 60, 80);
      doc.text(dia.despesa > 0 ? moeda(dia.despesa) : '—', L + W * 0.73, y + 1);
      const corSaldo = dia.saldo > 0 ? [0,160,100] : dia.saldo < 0 ? [200,60,80] : [120,130,150];
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...corSaldo);
      doc.text(dia.saldo !== 0 ? moeda(dia.saldo) : '—', L + W, y + 1, { align: 'right' });
      nl(7);
    });
    linha();

    /* --- COMPARATIVO --- */
    if (d.comparativo.temDados) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 60);
      doc.text('COMPARATIVO COM SEMANA ANTERIOR', L, y);
      nl(7);

      const comp = [
        { label: 'Saldo da semana',     atual: moeda(d.saldoSemana),   anterior: moeda(d.comparativo.saldoAnterior),   delta: d.comparativo.deltaSaldo },
        { label: 'Total de entradas',   atual: moeda(d.totalEntrada),  anterior: moeda(d.comparativo.entradaAnterior), delta: d.comparativo.deltaEntrada },
        { label: 'Nº de pedidos',       atual: String(d.totalPedidos), anterior: String(d.comparativo.pedidosAnterior), delta: d.comparativo.deltaPedidos },
      ];
      comp.forEach(c => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(60, 70, 90);
        doc.text(c.label, L + 2, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(20, 30, 50);
        doc.text(c.atual, L + W * 0.5, y);
        const corDelta = c.delta > 0 ? [0,150,100] : c.delta < 0 ? [200,60,80] : [120,130,150];
        doc.setTextColor(...corDelta);
        const sinal = c.delta > 0 ? '+' : '';
        doc.text(sinal + (typeof c.delta === 'number' && Math.abs(c.delta) < 1000 ? c.delta : ''), L + W, y, { align: 'right' });
        nl(7);
      });
      linha();
    }

    /* --- RANKING DE PRODUTOS --- */
    if (d.rankingProdutos.length > 0) {
      if (y > 220) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 60);
      doc.text('RANKING DE PRODUTOS MAIS VENDIDOS', L, y);
      nl(7);

      doc.setFillColor(230, 232, 240);
      doc.rect(L, y - 4, W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 90, 110);
      doc.text('#', L + 2, y + 1);
      doc.text('PRODUTO', L + 14, y + 1);
      doc.text('QTD', L + W * 0.65, y + 1);
      doc.text('TOTAL', L + W, y + 1, { align: 'right' });
      nl(7);

      d.rankingProdutos.slice(0, 15).forEach((p, i) => {
        if (y > 265) { doc.addPage(); y = 20; }
        if (i % 2 === 0) {
          doc.setFillColor(248, 249, 253);
          doc.rect(L, y - 3, W, 7, 'F');
        }
        const medalCor = i === 0 ? [200,160,0] : i === 1 ? [130,140,160] : i === 2 ? [160,90,40] : [100,110,130];
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...medalCor);
        doc.text(String(i + 1), L + 2, y + 1);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 40, 60);
        doc.text((p.nome).slice(0, 32), L + 14, y + 1);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 150, 220);
        doc.text(p.quantidade + 'x', L + W * 0.65, y + 1);
        doc.setTextColor(0, 180, 100);
        doc.text(moeda(p.total), L + W, y + 1, { align: 'right' });
        nl(7);
      });
      linha();
    }

    /* --- PEDIDOS --- */
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 40, 60);
    doc.text('PEDIDOS DA SEMANA', L, y);
    nl(7);

    [
      ['Total de pedidos', String(d.totalPedidos)],
      ['Concluídos',       String(d.pedidosConcluidos)],
      ['Pendentes',        String(d.pedidosPendentes)],
      ['Cancelados',       String(d.pedidosCancelados)],
    ].forEach(([label, valor]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(60, 70, 90);
      doc.text(label, L + 2, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 30, 50);
      doc.text(valor, L + W, y, { align: 'right' });
      nl(6);
    });
    linha();

    /* --- FUNCIONÁRIOS --- */
    if (d.funcionarios.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 60);
      doc.text('FUNCIONÁRIOS PAGOS NA SEMANA', L, y);
      nl(7);

      doc.setFillColor(230, 232, 240);
      doc.rect(L, y - 4, W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 90, 110);
      doc.text('FUNCIONÁRIO', L + 2, y + 1);
      doc.text('PAGAMENTOS', L + W * 0.6, y + 1);
      doc.text('TOTAL PAGO', L + W, y + 1, { align: 'right' });
      nl(7);

      d.funcionarios.forEach((f, idx) => {
        if (y > 270) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) {
          doc.setFillColor(248, 249, 253);
          doc.rect(L, y - 3, W, 7, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 40, 60);
        doc.text((f.nome || 'Funcionário').slice(0, 35), L + 2, y + 1);
        doc.setTextColor(100, 110, 130);
        doc.text(String(f.pagamentos), L + W * 0.6, y + 1);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 60, 80);
        doc.text(moeda(f.valor), L + W, y + 1, { align: 'right' });
        nl(7);
      });
      linha();
    }

    /* --- FECHAMENTO --- */
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFillColor(11, 13, 18);
    doc.rect(L - 2, y - 4, W + 4, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(180, 190, 210);
    doc.text('FECHAMENTO DA SEMANA — ' + fmtDataBR(d.semana.inicio) + ' a ' + fmtDataBR(d.semana.fim), L + 2, y + 3);
    nl(9);
    doc.setFontSize(14);
    doc.setTextColor(0, 229, 160);
    doc.text('Saldo Final da Semana: ' + moeda(d.saldoSemana), L + 2, y + 2);

    /* --- RODAPÉ --- */
    const totalPag = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPag; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(160, 170, 185);
      doc.text(
        EMPRESA_NOME + ' · Gerado em ' + agora() + '   Pág. ' + i + '/' + totalPag,
        105, 290, { align: 'center' }
      );
    }

    const nomeArq = 'semana_' + d.semana.inicio + '_a_' + d.semana.fim + '.pdf';
    doc.save(nomeArq);
    mostrarAlerta('sucesso', 'PDF gerado! Arquivo: ' + nomeArq);

    // Habilita botão de fechar semana após gerar PDF
    const btnApagar = document.getElementById('relSemBtnApagar');
    if (btnApagar) {
      btnApagar.style.display = 'inline-flex';
      btnApagar.disabled      = false;
    }
  }

  /* ============================================================
     CONFIRMAR E FECHAR SEMANA (apagar dados)
  ============================================================ */
  async function confirmarFecharSemana() {
    if (!dadosSemana || !semanaAtual) return;

    const confirmou = window.confirm(
      '⚠️ FECHAR SEMANA — ' + fmtDataBR(semanaAtual.inicio) + ' a ' + fmtDataBR(semanaAtual.fim) + '\n\n' +
      'Esta ação irá apagar:\n' +
      '  • Todas as comandas da semana\n' +
      '  • Todos os lançamentos financeiros da semana\n\n' +
      'NÃO serão apagados:\n' +
      '  • Produtos cadastrados\n' +
      '  • Funcionários cadastrados\n' +
      '  • Configurações do sistema\n' +
      '  • Dados de outras semanas\n\n' +
      '⚠️ Gere o PDF antes de fechar a semana!\n\n' +
      'Deseja continuar?'
    );
    if (!confirmou) return;

    const btnApagar = document.getElementById('relSemBtnApagar');
    const btnPDF    = document.getElementById('relSemBtnPDF');
    if (btnApagar) { btnApagar.disabled = true; btnApagar.textContent = 'Fechando...'; }
    if (btnPDF)    { btnPDF.disabled    = true; }

    mostrarAlerta('info', 'Apagando dados da semana...');

    try {
      const db     = await lerPath(DB_PATH);
      let apagados = 0;

      if (db && db.comandas) {
        const ids = Object.keys(db.comandas).filter(k => semanaAtual.dias.includes(db.comandas[k].data));
        for (const id of ids) {
          await deletarPath(DB_PATH + '/comandas/' + id);
          apagados++;
        }
      }

      if (db && db.lancamentos) {
        const ids = Object.keys(db.lancamentos).filter(k => semanaAtual.dias.includes(db.lancamentos[k].data));
        for (const id of ids) {
          await deletarPath(DB_PATH + '/lancamentos/' + id);
          apagados++;
        }
      }

      mostrarAlerta('sucesso', 'Semana fechada! ' + apagados + ' registros removidos.');

      const conteudo = document.getElementById('relSemConteudo');
      if (conteudo) {
        conteudo.innerHTML =
          '<div class="relatorio-vazio">' +
            '<p style="color:#00e5a0;font-size:1rem">✓ Semana fechada com sucesso!</p>' +
            '<p style="font-size:.82rem;margin-top:6px;color:#7a8299">Dados de ' + fmtDataBR(semanaAtual.inicio) + ' → ' + fmtDataBR(semanaAtual.fim) + ' foram removidos.</p>' +
          '</div>';
      }
      if (btnApagar) btnApagar.style.display = 'none';
      if (btnPDF)    btnPDF.disabled         = true;

    } catch (e) {
      mostrarAlerta('erro', 'Erro ao fechar semana: ' + e.message);
      if (btnApagar) { btnApagar.disabled = false; btnApagar.textContent = 'Fechar Semana'; }
      if (btnPDF)    btnPDF.disabled      = false;
    }
  }

  /* ============================================================
     ALERTAS
  ============================================================ */
  function mostrarAlerta(tipo, msg) {
    const el = document.getElementById('relSemAlerta');
    if (!el) return;
    el.className = 'relatorio-alerta show ' + tipo;
    el.innerHTML = (tipo === 'sucesso' ? '✓ ' : tipo === 'erro' ? '✕ ' : 'ℹ ') + escHtml(msg);
    if (tipo === 'sucesso') {
      setTimeout(() => { el.className = 'relatorio-alerta'; }, 6000);
    }
  }

  /* ============================================================
     INIT
  ============================================================ */
  function init() {
    criarModal();

    if (document.querySelector('nav.sidenav')) {
      injetarBotaoSidebar();
    } else {
      const obs = new MutationObserver(function () {
        if (document.querySelector('nav.sidenav')) {
          injetarBotaoSidebar();
          obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.RelatorioSemanalAquaGas = { abrir: abrirRelatorioSemanal, fechar: fecharRelatorio };

})();
