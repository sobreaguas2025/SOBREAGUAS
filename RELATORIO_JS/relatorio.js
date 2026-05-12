/**
 * =============================================================================
 * relatorio.js — Módulo de Fechamento de Caixa / Relatório Diário
 * SobreÁguas Distribuidora
 *
 * ARQUIVO EXTERNO — não modifica nenhum código existente.
 * Usa a instância do Firebase já inicializada pelo script.js.
 * Requer: jsPDF (carregado via CDN no adm.html)
 * =============================================================================
 */

(function () {
  'use strict';

  /* ============================================================
     CONFIGURAÇÃO
  ============================================================ */
  const EMPRESA_NOME     = 'SobreÁguas Distribuidora';
  const EMPRESA_SUBTITULO = 'Água & Gás — Relatório de Caixa';
  const DB_PATH          = 'aquagas_db';

  /* ============================================================
     UTILITÁRIOS
  ============================================================ */
  function hoje() {
    return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
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

  function getDB() {
    // Reutiliza a instância Firebase já aberta pelo script.js
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
        console.warn('[relatorio.js] lerPath Firebase erro:', e.message);
      }
    }
    // Fallback localStorage
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
        console.warn('[relatorio.js] deletarPath Firebase erro:', e.message);
      }
    }
    // Fallback localStorage
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
  let dadosDia = null; // dados carregados do Firebase

  /* ============================================================
     INJETAR CSS EXTERNO
  ============================================================ */
  function injetarCSS() {
    if (document.getElementById('relatorio-css')) return;
    const link = document.createElement('link');
    link.id   = 'relatorio-css';
    link.rel  = 'stylesheet';
    // Caminho relativo ao adm.html — ajuste se necessário
    link.href = 'SCRIPT/relatorio.css';
    document.head.appendChild(link);
  }

  /* ============================================================
     INJETAR BOTÃO NA SIDEBAR
  ============================================================ */
  function injetarBotaoSidebar() {
    if (document.getElementById('relatorio-nav-btn')) return;

    // Aguarda a sidebar existir
    const sidenav = document.querySelector('nav.sidenav');
    if (!sidenav) return;

    // Cria seção separadora
    const secao = document.createElement('div');
    secao.className = 'nav-section';
    secao.textContent = 'Caixa';

    // Cria o botão
    const btn = document.createElement('div');
    btn.id        = 'relatorio-nav-btn';
    btn.className = 'relatorio-nav-item';
    btn.title     = 'Gerar Relatório e Fechar Caixa';
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor">' +
        '<path d="M192 0c-41.8 0-77.4 26.7-90.5 64H64C28.7 64 0 92.7 0 128V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H282.5C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM128 256c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H160c-17.7 0-32-14.3-32-32zm0 96c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H160c-17.7 0-32-14.3-32-32zm0 96c0-17.7 14.3-32 32-32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H160c-17.7 0-32-14.3-32-32z"/>' +
      '</svg>' +
      ' Fechar Caixa';

    btn.addEventListener('click', abrirRelatorio);

    sidenav.appendChild(secao);
    sidenav.appendChild(btn);
  }

  /* ============================================================
     CRIAR ESTRUTURA DO MODAL (HTML)
  ============================================================ */
  function criarModal() {
    if (document.getElementById('relatorioOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'relatorioOverlay';
    overlay.innerHTML = `
      <div class="relatorio-modal" role="dialog" aria-modal="true" aria-label="Fechamento de Caixa">

        <!-- HEADER -->
        <div class="relatorio-header">
          <div class="relatorio-header-left">
            <div class="relatorio-header-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor" width="20" height="20">
                <path d="M0 112.5V422.3c0 18 10.1 35 27 41.3c87 32.5 174 10.3 261-11.9c79.8-20.3 159.6-40.7 239.3-18.9c23 6.3 48.7-9.5 48.7-33.4V89.7c0-18-10.1-35-27-41.3C462 15.9 375 38.1 288 60.3C208.2 80.6 128.4 100.9 48.7 79.1C25.6 72.8 0 88.6 0 112.5zM288 352c-44.2 0-80-43-80-96s35.8-96 80-96s80 43 80 96s-35.8 96-80 96zM64 352c0-17.7 14.3-32 32-32s32 14.3 32 32s-14.3 32-32 32s-32-14.3-32-32zm384 32c-17.7 0-32-14.3-32-32s14.3-32 32-32s32 14.3 32 32s-14.3 32-32 32z"/>
              </svg>
            </div>
            <div>
              <h2>Fechamento de Caixa</h2>
              <p id="relatorioDataLabel">Carregando...</p>
            </div>
          </div>
          <button class="relatorio-btn-fechar" id="relBtnFechar" title="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" width="14" height="14">
              <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/>
            </svg>
          </button>
        </div>

        <!-- BODY -->
        <div class="relatorio-body" id="relatorioBody">
          <div class="relatorio-loading" id="relatorioLoading">
            <div class="rel-spinner"></div>
            <p>Carregando dados do dia...</p>
          </div>
          <div id="relatorioConteudo" style="display:none"></div>
        </div>

        <!-- FOOTER -->
        <div class="relatorio-footer" id="relatorioFooter" style="display:none">
          <div class="relatorio-alerta" id="relatorioAlerta"></div>
          <div class="relatorio-footer-btns">
            <button class="rel-btn rel-btn-gerar" id="relBtnGerarPDF" disabled>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" width="15" height="15">
                <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64z"/>
              </svg>
              Gerar PDF
            </button>
            <button class="rel-btn rel-btn-apagar" id="relBtnApagar" disabled style="display:none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" width="15" height="15">
                <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"/>
              </svg>
              Apagar Dados do Dia
            </button>
            <button class="rel-btn rel-btn-ghost" id="relBtnCancelar">
              Cancelar
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    // Eventos
    document.getElementById('relBtnFechar').addEventListener('click', fecharRelatorio);
    document.getElementById('relBtnCancelar').addEventListener('click', fecharRelatorio);
    document.getElementById('relBtnGerarPDF').addEventListener('click', gerarPDF);
    document.getElementById('relBtnApagar').addEventListener('click', confirmarApagar);

    // Fechar ao clicar fora do modal
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) fecharRelatorio();
    });
  }

  /* ============================================================
     ABRIR MODAL
  ============================================================ */
  async function abrirRelatorio() {
    criarModal();

    const overlay   = document.getElementById('relatorioOverlay');
    const loading   = document.getElementById('relatorioLoading');
    const conteudo  = document.getElementById('relatorioConteudo');
    const footer    = document.getElementById('relatorioFooter');
    const dataLabel = document.getElementById('relatorioDataLabel');
    const btnPDF    = document.getElementById('relBtnGerarPDF');
    const btnApagar = document.getElementById('relBtnApagar');

    // Reset
    loading.style.display  = 'block';
    conteudo.style.display = 'none';
    footer.style.display   = 'none';
    ocultarAlerta();
    dadosDia = null;

    overlay.classList.add('aberto');
    document.body.style.overflow = 'hidden';

    dataLabel.textContent = 'Data: ' + hojeFormatado();

    // Carregar dados
    try {
      dadosDia = await carregarDadosDia();
    } catch (e) {
      loading.style.display = 'none';
      conteudo.style.display = 'block';
      conteudo.innerHTML =
        '<div class="relatorio-vazio">' +
          '<p>Erro ao carregar dados.<br><small style="color:#7a8299">' + e.message + '</small></p>' +
        '</div>';
      footer.style.display = 'flex';
      return;
    }

    // Renderizar
    loading.style.display  = 'none';
    conteudo.style.display = 'block';
    footer.style.display   = 'flex';

    renderizarConteudo(dadosDia);

    // Habilitar botões
    btnPDF.disabled = false;
    if (dadosDia.totalPedidos > 0 || dadosDia.totalLancamentos > 0) {
      btnApagar.style.display = 'inline-flex';
      btnApagar.disabled = false;
    }
  }

  /* ============================================================
     FECHAR MODAL
  ============================================================ */
  function fecharRelatorio() {
    const overlay = document.getElementById('relatorioOverlay');
    if (overlay) overlay.classList.remove('aberto');
    document.body.style.overflow = '';
  }

  /* ============================================================
     CARREGAR DADOS DO DIA
  ============================================================ */
  async function carregarDadosDia() {
    const dataHoje   = hoje();
    const db         = await lerPath(DB_PATH);

    const comandas     = db && db.comandas     ? Object.values(db.comandas)     : [];
    const lancamentos  = db && db.lancamentos  ? Object.values(db.lancamentos)  : [];
    const funcionariosCadastrados = db && db.funcionarios ? Object.values(db.funcionarios) : [];

    // Filtrar pelo dia atual
    const comandasHoje    = comandas.filter(c => c.data === dataHoje);
    const lancamentosHoje = lancamentos.filter(l => l.data === dataHoje);

    // Métricas financeiras
    const totalVendas = comandasHoje
      .filter(c => c.status !== 'cancelada')
      .reduce((s, c) => s + (Number(c.total) || 0), 0);

    // Entradas manuais: exclui lançamentos gerados automaticamente pelas comandas (categoria 'vendas')
    const totalEntrada = lancamentosHoje
      .filter(l => l.tipo === 'receita' && l.categoria !== 'vendas')
      .reduce((s, l) => s + (Number(l.valor) || 0), 0);

    const totalSaida = lancamentosHoje
      .filter(l => l.tipo === 'despesa')
      .reduce((s, l) => s + (Number(l.valor) || 0), 0);

    // Saldo = vendas das comandas + entradas manuais - despesas (sem dupla contagem)
    const saldoDia = totalVendas + totalEntrada - totalSaida;

    // Contagem de pedidos
    const totalPedidos     = comandasHoje.length;
    const pedidosConcluidos = comandasHoje.filter(c => c.status === 'concluida').length;
    const pedidosPendentes  = comandasHoje.filter(c => c.status === 'pendente').length;
    const pedidosCancelados = comandasHoje.filter(c => c.status === 'cancelada').length;

    // Produtos mais vendidos (excluindo canceladas)
    const mapaProdutos = {};
    comandasHoje.filter(c => c.status !== 'cancelada').forEach(c => {
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

    const produtosVendidos = Object.values(mapaProdutos)
      .sort((a, b) => b.quantidade - a.quantidade);

    // Funcionários pagos hoje: lançamentos tipo 'despesa' + categoria 'salarios' no dia
    // O ADM salva com categoria='salarios' quando é pagamento de funcionário
    const funcionariosPagosHoje = lancamentosHoje
      .filter(l => l.tipo === 'despesa' && l.categoria === 'salarios')
      .map(l => ({
        nome:  l.descricao || 'Funcionário',
        valor: Number(l.valor) || 0,
        data:  l.data || dataHoje,
      }));

    return {
      dataHoje,
      totalVendas,
      totalEntrada,
      totalSaida,
      saldoDia,
      totalPedidos,
      pedidosConcluidos,
      pedidosPendentes,
      pedidosCancelados,
      produtosVendidos,
      funcionarios: funcionariosPagosHoje,
      lancamentosHoje,
      totalLancamentos: lancamentosHoje.length,
    };
  }

  /* ============================================================
     RENDERIZAR CONTEÚDO DO MODAL
  ============================================================ */
  function renderizarConteudo(d) {
    const el = document.getElementById('relatorioConteudo');

    if (d.totalPedidos === 0 && d.totalLancamentos === 0) {
      el.innerHTML =
        '<div class="relatorio-vazio">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor" width="48" height="48"><path d="M0 112.5V422.3c0 18 10.1 35 27 41.3c87 32.5 174 10.3 261-11.9c79.8-20.3 159.6-40.7 239.3-18.9c23 6.3 48.7-9.5 48.7-33.4V89.7c0-18-10.1-35-27-41.3C462 15.9 375 38.1 288 60.3C208.2 80.6 128.4 100.9 48.7 79.1C25.6 72.8 0 88.6 0 112.5zM288 352c-44.2 0-80-43-80-96s35.8-96 80-96s80 43 80 96s-35.8 96-80 96zM64 352c0-17.7 14.3-32 32-32s32 14.3 32 32s-14.3 32-32 32s-32-14.3-32-32zm384 32c-17.7 0-32-14.3-32-32s14.3-32 32-32s32 14.3 32 32s-14.3 32-32 32z"/></svg>' +
          '<p>Nenhum movimento registrado hoje.</p>' +
          '<p style="font-size:0.78rem;margin-top:4px">Data: ' + hojeFormatado() + '</p>' +
        '</div>';
      return;
    }

    // ---- Cards de métricas ----
    let html = '<div class="relatorio-metricas">';
    html += metricaCard('Total de Vendas',   moeda(d.totalVendas),   'verde',   iconeCoin());
    html += metricaCard('Entradas',          moeda(d.totalEntrada),  'azul',    iconeUp());
    html += metricaCard('Saídas / Despesas', moeda(d.totalSaida),    'vermelho',iconeDown());
    html += metricaCard('Saldo do Dia',      moeda(d.saldoDia),      d.saldoDia >= 0 ? 'verde' : 'vermelho', iconeWallet());
    html += '</div>';

    // ---- Resumo dos pedidos ----
    html += secao('📋 Pedidos do Dia',
      '<div class="rel-resumo-lista">' +
        linhaResumo('Total de pedidos',   String(d.totalPedidos)) +
        linhaResumo('Concluídos',         String(d.pedidosConcluidos)) +
        linhaResumo('Pendentes',          String(d.pedidosPendentes)) +
        linhaResumo('Cancelados',         String(d.pedidosCancelados)) +
      '</div>'
    );

    // ---- Produtos vendidos ----
    if (d.produtosVendidos.length > 0) {
      let tabela =
        '<table class="rel-tabela">' +
          '<thead><tr>' +
            '<th>Produto</th>' +
            '<th style="text-align:center">Qtd</th>' +
            '<th>Total</th>' +
          '</tr></thead><tbody>';
      d.produtosVendidos.forEach(p => {
        tabela +=
          '<tr>' +
            '<td>' + (p.icone ? p.icone + ' ' : '') + escHtml(p.nome) + '</td>' +
            '<td style="text-align:center"><span class="badge-qty">' + p.quantidade + 'x</span></td>' +
            '<td class="valor-verde">' + moeda(p.total) + '</td>' +
          '</tr>';
      });
      tabela += '</tbody></table>';
      html += secao('📦 Produtos Vendidos', tabela);
    }

    // ---- Lançamentos do dia ----
    if (d.lancamentosHoje.length > 0) {
      let tabela =
        '<table class="rel-tabela">' +
          '<thead><tr>' +
            '<th>Descrição</th>' +
            '<th>Tipo</th>' +
            '<th>Valor</th>' +
          '</tr></thead><tbody>';
      d.lancamentosHoje.forEach(l => {
        const cor = l.tipo === 'receita' ? 'color:#00e5a0' : 'color:#ff4d6d';
        tabela +=
          '<tr>' +
            '<td>' + escHtml(l.descricao || '—') + '</td>' +
            '<td style="' + cor + ';font-weight:600;text-transform:capitalize">' + (l.tipo || '—') + '</td>' +
            '<td style="' + cor + ';font-weight:600">' + moeda(l.valor) + '</td>' +
          '</tr>';
      });
      tabela += '</tbody></table>';
      html += secao('💰 Lançamentos do Dia', tabela);
    }

    // ---- Funcionários pagos hoje (categoria = salarios) ----
    if (d.funcionarios.length > 0) {
      let lista = '<div class="rel-func-lista">';
      d.funcionarios.forEach(f => {
        const inicial = (f.nome || 'F')[0].toUpperCase();
        lista +=
          '<div class="rel-func-item">' +
            '<div class="rel-func-avatar">' + inicial + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:2px;flex:1">' +
              '<span style="font-weight:600">' + escHtml(f.nome) + '</span>' +
              '<span style="font-size:.75rem;color:var(--muted)">Pago em: ' + escHtml(f.data) + '</span>' +
            '</div>' +
            '<span style="color:#ff4d6d;font-weight:700;margin-left:auto">' + moeda(f.valor) + '</span>' +
          '</div>';
      });
      lista += '</div>';
      html += secao('💳 Funcionários Pagos Hoje', lista);
    }

    // ---- Resumo financeiro final ----
    html += secao('🏦 Resumo Financeiro',
      '<div class="rel-resumo-lista">' +
        linhaResumo('Total de Vendas',    moeda(d.totalVendas)) +
        linhaResumo('Outras Entradas',    moeda(d.totalEntrada)) +
        linhaResumo('Total Despesas',     moeda(d.totalSaida)) +
        linhaTotalResumo('Saldo Final do Dia', moeda(d.saldoDia)) +
      '</div>'
    );

    el.innerHTML = html;
  }

  /* ---- Helpers de HTML ---- */
  function metricaCard(label, valor, cor, icone) {
    return '<div class="rel-metrica">' +
      '<div class="rel-metrica-label">' + icone + label + '</div>' +
      '<div class="rel-metrica-valor ' + cor + '">' + valor + '</div>' +
    '</div>';
  }
  function secao(titulo, corpo) {
    return '<div class="relatorio-secao">' +
      '<div class="relatorio-secao-titulo">' + titulo + '</div>' +
      corpo +
    '</div>';
  }
  function linhaResumo(label, valor) {
    return '<div class="rel-resumo-linha">' +
      '<span>' + escHtml(label) + '</span>' +
      '<span>' + escHtml(valor) + '</span>' +
    '</div>';
  }
  function linhaTotalResumo(label, valor) {
    return '<div class="rel-resumo-linha total">' +
      '<span>' + escHtml(label) + '</span>' +
      '<span>' + escHtml(valor) + '</span>' +
    '</div>';
  }
  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
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
    if (!dadosDia) return;

    // Verifica se jsPDF está disponível
    const jsPDFClass =
      (window.jspdf && window.jspdf.jsPDF) ||
      (window.jsPDF);

    if (!jsPDFClass) {
      mostrarAlerta('erro', 'jsPDF não encontrado. Adicione o CDN no adm.html (veja instruções no arquivo).');
      return;
    }

    const d   = dadosDia;
    const doc = new jsPDFClass({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const L   = 15;  // margem esquerda
    const W   = 180; // largura útil
    let   y   = 20;

    /* Helpers de posição */
    const nl = (n = 6) => { y += n; };
    const linha = () => { doc.setDrawColor(200, 200, 210); doc.line(L, y, L + W, y); nl(4); };

    /* ---------- CABEÇALHO ---------- */
    doc.setFillColor(11, 13, 18);
    doc.rect(0, 0, 210, 38, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 210, 63);
    doc.text(EMPRESA_NOME, L, y);
    nl(8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(180, 190, 210);
    doc.text(EMPRESA_SUBTITULO, L, y);
    nl(6);

    doc.setFontSize(9);
    doc.setTextColor(140, 150, 170);
    doc.text('Emitido em: ' + agora() + '   |   Referência: ' + hojeFormatado(), L, y);

    y = 48;

    /* ---------- LINHA DIVISÓRIA ---------- */
    doc.setDrawColor(255, 210, 63);
    doc.setLineWidth(0.5);
    doc.line(L, y, L + W, y);
    nl(8);
    doc.setLineWidth(0.2);

    /* ---------- MÉTRICAS ---------- */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 40, 60);
    doc.text('RESUMO FINANCEIRO DO DIA', L, y);
    nl(7);

    // Cards de métricas (2 colunas)
    const metricas = [
      { label: 'Total de Vendas',  valor: moeda(d.totalVendas),   cor: [0, 180, 100]  },
      { label: 'Total Entradas',   valor: moeda(d.totalEntrada),  cor: [0, 150, 220]  },
      { label: 'Total Saídas',     valor: moeda(d.totalSaida),    cor: [220, 60, 80]  },
      { label: 'Saldo do Dia',     valor: moeda(d.saldoDia),      cor: d.saldoDia >= 0 ? [0,180,100] : [220,60,80] },
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
    y += 50;
    linha();

    /* ---------- PEDIDOS ---------- */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 40, 60);
    doc.text('PEDIDOS DO DIA', L, y);
    nl(7);

    const infoPedidos = [
      ['Total de pedidos',  String(d.totalPedidos)],
      ['Concluídos',        String(d.pedidosConcluidos)],
      ['Pendentes',         String(d.pedidosPendentes)],
      ['Cancelados',        String(d.pedidosCancelados)],
    ];
    infoPedidos.forEach(([label, valor]) => {
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

    /* ---------- PRODUTOS VENDIDOS ---------- */
    if (d.produtosVendidos.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 60);
      doc.text('PRODUTOS VENDIDOS', L, y);
      nl(7);

      // Cabeçalho da tabela
      doc.setFillColor(230, 232, 240);
      doc.rect(L, y - 4, W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 90, 110);
      doc.text('PRODUTO', L + 2, y + 1);
      doc.text('QTD', L + W * 0.6, y + 1);
      doc.text('TOTAL', L + W, y + 1, { align: 'right' });
      nl(7);

      d.produtosVendidos.forEach((p, idx) => {
        if (y > 260) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) {
          doc.setFillColor(248, 249, 253);
          doc.rect(L, y - 3, W, 7, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 40, 60);
        doc.text(p.nome, L + 2, y + 1);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 150, 220);
        doc.text(p.quantidade + 'x', L + W * 0.6, y + 1);
        doc.setTextColor(0, 160, 90);
        doc.text(moeda(p.total), L + W, y + 1, { align: 'right' });
        nl(7);
      });
      linha();
    }

    /* ---------- LANÇAMENTOS ---------- */
    if (d.lancamentosHoje.length > 0) {
      if (y > 220) { doc.addPage(); y = 20; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 60);
      doc.text('LANÇAMENTOS DO DIA', L, y);
      nl(7);

      doc.setFillColor(230, 232, 240);
      doc.rect(L, y - 4, W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 90, 110);
      doc.text('DESCRIÇÃO', L + 2, y + 1);
      doc.text('TIPO', L + W * 0.6, y + 1);
      doc.text('VALOR', L + W, y + 1, { align: 'right' });
      nl(7);

      d.lancamentosHoje.forEach((l, idx) => {
        if (y > 265) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) {
          doc.setFillColor(248, 249, 253);
          doc.rect(L, y - 3, W, 7, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 40, 60);
        // Trunca descrição longa
        const desc = (l.descricao || '—').slice(0, 38);
        doc.text(desc, L + 2, y + 1);
        const isReceita = l.tipo === 'receita';
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(isReceita ? 0 : 200, isReceita ? 160 : 60, isReceita ? 90 : 80);
        doc.text(isReceita ? 'Receita' : 'Despesa', L + W * 0.6, y + 1);
        doc.text(moeda(l.valor), L + W, y + 1, { align: 'right' });
        nl(7);
      });
      linha();
    }

    /* ---------- FUNCIONÁRIOS PAGOS ---------- */
    if (d.funcionarios.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 60);
      doc.text('FUNCIONÁRIOS PAGOS', L, y);
      nl(7);

      // Cabeçalho
      doc.setFillColor(230, 232, 240);
      doc.rect(L, y - 4, W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 90, 110);
      doc.text('FUNCIONÁRIO / DESCRIÇÃO', L + 2, y + 1);
      doc.text('DATA', L + W * 0.65, y + 1);
      doc.text('VALOR PAGO', L + W, y + 1, { align: 'right' });
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
        doc.text(f.data || '', L + W * 0.65, y + 1);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 60, 80);
        doc.text(moeda(f.valor), L + W, y + 1, { align: 'right' });
        nl(7);
      });
      linha();
    }

    /* ---------- FECHAMENTO ---------- */
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFillColor(11, 13, 18);
    doc.rect(L - 2, y - 4, W + 4, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(180, 190, 210);
    doc.text('FECHAMENTO DO CAIXA — ' + hojeFormatado(), L + 2, y + 3);
    nl(9);
    doc.setFontSize(14);
    doc.setTextColor(255, 210, 63);
    doc.text('Saldo Final: ' + moeda(d.saldoDia), L + 2, y + 2);

    /* ---------- RODAPÉ ---------- */
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

    /* ---------- SALVAR ---------- */
    const nomeArquivo = 'caixa_' + d.dataHoje + '.pdf';
    doc.save(nomeArquivo);

    mostrarAlerta('sucesso', 'PDF gerado e salvo com sucesso! Arquivo: ' + nomeArquivo);

    // Exibe o botão de apagar dados após gerar o PDF
    const btnApagar = document.getElementById('relBtnApagar');
    if (btnApagar) {
      btnApagar.style.display = 'inline-flex';
      btnApagar.disabled = false;
    }
  }

  /* ============================================================
     CONFIRMAR E APAGAR DADOS DO DIA
  ============================================================ */
  async function confirmarApagar() {
    const dataHoje = hoje();
    const confirmou = window.confirm(
      '⚠️ ATENÇÃO — Fechar caixa de ' + hojeFormatado() + '\n\n' +
      'Esta ação irá apagar:\n' +
      '  • Todas as comandas do dia\n' +
      '  • Todos os lançamentos financeiros do dia\n' +
      '  • (Dashboard será zerado automaticamente)\n\n' +
      'NÃO serão apagados:\n' +
      '  • Produtos cadastrados\n' +
      '  • Funcionários cadastrados\n' +
      '  • Configurações do sistema\n\n' +
      '⚠️ Gere o PDF antes de apagar!\n\n' +
      'Deseja continuar?'
    );
    if (!confirmou) return;

    const btnApagar = document.getElementById('relBtnApagar');
    const btnPDF    = document.getElementById('relBtnGerarPDF');
    if (btnApagar) { btnApagar.disabled = true; btnApagar.textContent = 'Apagando...'; }
    if (btnPDF)    { btnPDF.disabled = true; }

    mostrarAlerta('info', 'Apagando dados...');

    try {
      const db = await lerPath(DB_PATH);
      let apagados = 0;

      // Apagar comandas do dia
      if (db && db.comandas) {
        const ids = Object.keys(db.comandas).filter(k => db.comandas[k].data === dataHoje);
        for (const id of ids) {
          await deletarPath(DB_PATH + '/comandas/' + id);
          apagados++;
        }
      }

      // Apagar lançamentos do dia
      if (db && db.lancamentos) {
        const ids = Object.keys(db.lancamentos).filter(k => db.lancamentos[k].data === dataHoje);
        for (const id of ids) {
          await deletarPath(DB_PATH + '/lancamentos/' + id);
          apagados++;
        }
      }

      mostrarAlerta('sucesso', 'Dados do dia apagados com sucesso! (' + apagados + ' registros removidos)');

      // Limpa o conteúdo exibido
      const conteudo = document.getElementById('relatorioConteudo');
      if (conteudo) {
        conteudo.innerHTML =
          '<div class="relatorio-vazio">' +
            '<p style="color:#00e5a0;font-size:1rem">✓ Caixa fechado com sucesso!</p>' +
            '<p style="font-size:.82rem;margin-top:6px;color:#7a8299">Os dados de ' + hojeFormatado() + ' foram removidos.</p>' +
          '</div>';
      }
      if (btnApagar) { btnApagar.style.display = 'none'; }
      if (btnPDF)    { btnPDF.disabled = true; }

    } catch (e) {
      mostrarAlerta('erro', 'Erro ao apagar dados: ' + e.message);
      if (btnApagar) { btnApagar.disabled = false; btnApagar.innerHTML = '🗑️ Apagar Dados do Dia'; }
      if (btnPDF)    { btnPDF.disabled = false; }
    }
  }

  /* ============================================================
     ALERTAS
  ============================================================ */
  function mostrarAlerta(tipo, msg) {
    const el = document.getElementById('relatorioAlerta');
    if (!el) return;
    el.className = 'relatorio-alerta show ' + tipo;
    el.innerHTML =
      (tipo === 'sucesso' ? '✓ ' : tipo === 'erro' ? '✕ ' : 'ℹ ') +
      escHtml(msg);
    if (tipo === 'sucesso') {
      setTimeout(() => { el.className = 'relatorio-alerta'; }, 6000);
    }
  }
  function ocultarAlerta() {
    const el = document.getElementById('relatorioAlerta');
    if (el) el.className = 'relatorio-alerta';
  }

  /* ============================================================
     INIT — aguarda DOM pronto e sidebar disponível
  ============================================================ */
  function init() {
    injetarCSS();
    criarModal();

    // Tenta injetar o botão. Pode precisar aguardar o painel abrir
    if (document.querySelector('nav.sidenav')) {
      injetarBotaoSidebar();
    } else {
      // Observa até a sidebar aparecer (após login)
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

  // Expõe para uso manual se necessário
  window.RelatorioAquaGas = { abrir: abrirRelatorio, fechar: fecharRelatorio };

})();
