/**
 * =============================================================================
 * script.js — AquaGás / SobreÁguas Distribuidora
 * VERSÃO CORRIGIDA — Sincronização total entre ADM e site
 * =============================================================================
 */

/* ============================================================================
   🔥 CONFIGURAÇÃO DO FIREBASE
   Substitua pelos dados do seu projeto Firebase!
============================================================================ */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDTTbJU2poHonruuvBFdsBvE2rAumXj3aY",
  authDomain:        "sobreaguas-bfbaf.firebaseapp.com",
  databaseURL:       "https://sobreaguas-bfbaf-default-rtdb.firebaseio.com",
  projectId:         "sobreaguas-bfbaf",
  storageBucket:     "sobreaguas-bfbaf.firebasestorage.app",
  messagingSenderId: "238961926525",
  appId:             "1:238961926525:web:cd60680f75d9e09367ec14",
  measurementId:     "G-99826C08B6"
};

/* ============================================================================
   PRODUTOS PADRÃO — banco começa vazio; o ADM cadastra os produtos
============================================================================ */
const PRODUTOS_PADRAO = [];
const WHATSAPP_PADRAO = "5583996231032";

/* ============================================================================
   FIREBASE — Inicialização
============================================================================ */
let firebaseApp  = null;
let firebaseDB   = null;
let firebaseOk   = false;

function inicializarFirebase() {
  try {
    if (typeof firebase === "undefined") {
      console.warn("Firebase SDK nao carregado. Usando localStorage como fallback.");
      return false;
    }
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      firebaseApp = firebase.apps[0];
    }
    firebaseDB = firebase.database();
    firebaseOk = true;
    console.log("Firebase conectado com sucesso!");
    return true;
  } catch (e) {
    console.warn("Erro ao inicializar Firebase:", e.message);
    return false;
  }
}

/* ============================================================================
   BANCO DE DADOS — Firebase com fallback para localStorage
============================================================================ */
async function dbGet(path) {
  if (firebaseOk) {
    try {
      const snapshot = await firebaseDB.ref(path).get();
      return snapshot.exists() ? snapshot.val() : null;
    } catch (e) {
      console.warn("dbGet Firebase erro:", e.message);
    }
  }
  // Fallback localStorage com suporte a paths como "aquagas_db/produtos"
  try {
    var partes = path.split("/");
    var raiz = partes[0];
    // Le o objeto raiz (ex: "aquagas_db")
    var base = localStorage.getItem(raiz);
    if (!base) return null;
    var obj = JSON.parse(base);
    // Navega pelos niveis do path (ex: /produtos, /siteLayout)
    for (var i = 1; i < partes.length; i++) {
      if (obj === null || obj === undefined) return null;
      obj = obj[partes[i]];
    }
    return obj !== undefined ? obj : null;
  } catch (e) { return null; }
}

async function dbSet(path, value) {
  if (firebaseOk) {
    try {
      await firebaseDB.ref(path).set(value);
      return true;
    } catch (e) {
      console.warn("dbSet Firebase erro:", e.message);
    }
  }
  // Fallback localStorage com suporte a paths como "aquagas_db/comandas/1"
  try {
    var partes = path.split("/");
    var raiz = partes[0];
    var base = localStorage.getItem(raiz);
    var obj = base ? JSON.parse(base) : {};
    if (partes.length === 1) {
      // Path simples — salva direto
      obj = value;
    } else {
      // Navega e seta o valor no lugar certo
      var cur = obj;
      for (var i = 1; i < partes.length - 1; i++) {
        if (!cur[partes[i]] || typeof cur[partes[i]] !== "object") cur[partes[i]] = {};
        cur = cur[partes[i]];
      }
      cur[partes[partes.length - 1]] = value;
    }
    localStorage.setItem(raiz, JSON.stringify(obj));
    // Avisa outras abas (ADM -> site e site -> ADM)
    window.dispatchEvent(new StorageEvent("storage", { key: raiz }));
    return true;
  } catch (e) { return false; }
}

function dbOnValue(path, callback) {
  if (firebaseOk) {
    firebaseDB.ref(path).on("value", (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
    return;
  }
  // Dispara imediatamente
  dbGet(path).then(callback);
  // Ouve mudancas de outras abas em tempo real
  window.addEventListener("storage", function(e) {
    var raiz = path.split("/")[0];
    if (e.key === raiz) {
      dbGet(path).then(callback);
    }
  });
  // Polling a cada 3s como seguranca
  setInterval(function() { dbGet(path).then(callback); }, 3000);
}

/* ============================================================================
   ESTADO GLOBAL
============================================================================ */
let produtos       = [];
let whatsappNumero = WHATSAPP_PADRAO;
let instagramLink  = "https://instagram.com/seuinstagram";
let carrinho       = [];

/* ============================================================================
   SITE LAYOUT — Valores padrao (mesmos do ADM)
============================================================================ */
const SITE_LAYOUT_DEFAULTS = {
  nome: 'SobreAguas',
  slogan: 'Agua & Gas',
  descricaoHero: 'Entrega em 30 a 60 minutos na sua regiao.',
  badgeHero: 'Entrega Rapida',
  regiao: 'regiao de Itabaiana',
  cor: '#00b4ff',
  navbarBg: 'dark',
  fonte: "'Exo 2',sans-serif",
  fonteSize: 16,
  radius: 16,
  whatsapp: '5583996231032',
  instagram: 'seuinstagram',
  btnWpp: 'Pedir pelo WhatsApp',
  stat1Val: '30-60 min', stat1Leg: 'Prazo de entrega',
  stat2Val: '4.9 estrelas', stat2Leg: 'Avaliacao',
  stat3Val: 'Gratis', stat3Leg: 'Frete na regiao',
  heroBtnWpp: true,
  fabWpp: true, fabInsta: true,
  bannerEntrega: true,
  banner1: 'Entrega em 30 a 60 minutos',
  banner2: 'Cobrimos toda a regiao de Itabaiana',
  banner3: 'Produto garantido e lacrado',
  banner4: 'Pedido pelo WhatsApp',
  sobreTexto: 'Ha mais de 5 anos levando agua e gas de qualidade para lares e empresas da regiao.',
  sobre1Num: '10+', sobre1Leg: 'Anos de mercado',
  sobre2Num: '5k+', sobre2Leg: 'Clientes satisfeitos',
  sobre3Num: '50k+', sobre3Leg: 'Entregas realizadas',
  footerCopy: '2025 AquaGas Distribuidora — Todos os direitos reservados',
  footerSocial: true,
  loader: true, scrollReveal: true, particulas: true, parallax: true,
};

let siteLayout = Object.assign({}, SITE_LAYOUT_DEFAULTS);

/* ============================================================================
   APLICAR LAYOUT DO SITE NO DOM
   Atualiza todos os textos, cores, links e visibilidades do site
============================================================================ */
function aplicarLayoutSiteNoDom(layout) {
  if (!layout) return;
  siteLayout = Object.assign({}, SITE_LAYOUT_DEFAULTS, layout);

  // Atualiza numero WhatsApp e Instagram globais
  if (siteLayout.whatsapp) whatsappNumero = siteLayout.whatsapp;
  if (siteLayout.instagram) {
    instagramLink = siteLayout.instagram.startsWith('http')
      ? siteLayout.instagram
      : 'https://instagram.com/' + siteLayout.instagram.replace('@','');
  }

  // Cores do site
  var cor = siteLayout.cor || '#00b4ff';
  document.documentElement.style.setProperty('--site-accent', cor);
  document.documentElement.style.setProperty('--azul-vivo', cor);
  document.documentElement.style.setProperty('--azul-glow', cor + '44');

  // Fonte
  if (siteLayout.fonte) document.body.style.fontFamily = siteLayout.fonte;
  if (siteLayout.fonteSize) document.documentElement.style.fontSize = siteLayout.fonteSize + 'px';
  if (siteLayout.radius) document.documentElement.style.setProperty('--card-radius', siteLayout.radius + 'px');

  // Nome da empresa (logo nav + footer)
  var nome = siteLayout.nome || 'SobreAguas';
  document.querySelectorAll('.nav-logo span').forEach(function(el) {
    var partes = nome.split(' ');
    if (partes.length > 1) {
      el.innerHTML = partes.slice(0, -1).join(' ') + '<strong>' + partes[partes.length - 1] + '</strong>';
    } else {
      el.innerHTML = '<strong>' + nome + '</strong>';
    }
  });
  document.querySelectorAll('.footer-logo span').forEach(function(el) {
    var partes = nome.split(' ');
    if (partes.length > 1) {
      el.innerHTML = partes.slice(0, -1).join(' ') + '<strong>' + partes[partes.length - 1] + '</strong>';
    } else {
      el.innerHTML = '<strong>' + nome + '</strong>';
    }
  });

  // Title da pagina
  if (siteLayout.nome) document.title = siteLayout.nome + ' — Distribuidora Premium';

  // Hero — badge
  var heroBadgeEl = document.querySelector('.hero-badge');
  if (heroBadgeEl) {
    heroBadgeEl.innerHTML = '<i class="fa-solid fa-bolt"></i> ' + (siteLayout.badgeHero || 'Entrega Rapida');
  }

  // Hero — titulo (h1)
  var heroH1 = document.querySelector('.hero-content h1');
  if (heroH1) {
    var slogan = siteLayout.slogan || 'Agua & Gas';
    heroH1.innerHTML = slogan + '<br/><span style="color:' + cor + '">na sua porta</span>';
  }

  // Hero — descricao
  var heroDesc = document.querySelector('.hero-content > p');
  if (heroDesc && siteLayout.descricaoHero) {
    heroDesc.innerHTML = siteLayout.descricaoHero;
  }

  // Hero — estatisticas
  var stats = document.querySelectorAll('.hero-stats .stat');
  if (stats.length >= 3) {
    var s1s = stats[0].querySelector('strong'), s1l = stats[0].querySelector('span');
    var s2s = stats[1].querySelector('strong'), s2l = stats[1].querySelector('span');
    var s3s = stats[2].querySelector('strong'), s3l = stats[2].querySelector('span');
    if (s1s) s1s.textContent = siteLayout.stat1Val || '30-60 min';
    if (s1l) s1l.textContent = siteLayout.stat1Leg || 'Prazo de entrega';
    if (s2s) s2s.textContent = siteLayout.stat2Val || '4.9';
    if (s2l) s2l.textContent = siteLayout.stat2Leg || 'Avaliacao';
    if (s3s) s3s.textContent = siteLayout.stat3Val || 'Gratis';
    if (s3l) s3l.textContent = siteLayout.stat3Leg || 'Frete na regiao';
  }

  // Hero — botao WhatsApp
  var btnWppHero = document.querySelector('.hero-btns .btn-whatsapp');
  if (btnWppHero) {
    btnWppHero.style.display = siteLayout.heroBtnWpp === false ? 'none' : '';
  }

  // Botoes flutuantes
  var fabWppEl   = document.querySelector('.fab-whatsapp');
  var fabInstaEl = document.querySelector('.fab-instagram');
  if (fabWppEl)   fabWppEl.style.display   = siteLayout.fabWpp   === false ? 'none' : '';
  if (fabInstaEl) fabInstaEl.style.display = siteLayout.fabInsta === false ? 'none' : '';

  // Todos os links WhatsApp
  var wppUrl = 'https://wa.me/' + (siteLayout.whatsapp || WHATSAPP_PADRAO);
  document.querySelectorAll('a[href*="wa.me"]').forEach(function(a) { a.href = wppUrl; });

  // Botao WhatsApp secao contato
  var btnWppLg = document.querySelector('.btn-whatsapp-lg');
  if (btnWppLg) {
    btnWppLg.innerHTML = '<i class="fa-brands fa-whatsapp"></i> ' + (siteLayout.btnWpp || 'Pedir pelo WhatsApp');
    btnWppLg.href = wppUrl;
  }

  // Todos os links Instagram
  document.querySelectorAll('a[href*="instagram"]').forEach(function(a) { a.href = instagramLink; });

  // Banner de entrega
  var bannerEl = document.querySelector('.delivery-banner');
  if (bannerEl) {
    bannerEl.style.display = siteLayout.bannerEntrega === false ? 'none' : '';
    var bannerItems = bannerEl.querySelectorAll('.delivery-item span');
    var bannerTexts = [
      siteLayout.banner1 || 'Entrega em <strong>30 a 60 minutos</strong>',
      siteLayout.banner2 || 'Cobrimos toda a <strong>regiao de Itabaiana</strong>',
      siteLayout.banner3 || 'Produto <strong>garantido</strong> e lacrado',
      siteLayout.banner4 || 'Pedido pelo <strong>WhatsApp</strong>',
    ];
    bannerItems.forEach(function(item, i) {
      if (bannerTexts[i]) item.innerHTML = bannerTexts[i];
    });
  }

  // Secao Sobre
  var sobreP = document.querySelector('.sobre-content > p');
  if (sobreP && siteLayout.sobreTexto) sobreP.textContent = siteLayout.sobreTexto;

  var sobreCards = document.querySelectorAll('.sobre-card');
  var sobreData = [
    { num: siteLayout.sobre1Num || '10+', leg: siteLayout.sobre1Leg || 'Anos de mercado' },
    { num: siteLayout.sobre2Num || '5k+', leg: siteLayout.sobre2Leg || 'Clientes satisfeitos' },
    { num: siteLayout.sobre3Num || '50k+', leg: siteLayout.sobre3Leg || 'Entregas realizadas' },
  ];
  sobreCards.forEach(function(card, i) {
    if (!sobreData[i]) return;
    var strong = card.querySelector('strong');
    var span   = card.querySelector('span');
    if (strong) strong.textContent = sobreData[i].num;
    if (span)   span.textContent   = sobreData[i].leg;
  });

  // Footer copyright
  var footerCopyEl = document.querySelector('.footer-inner > p');
  if (footerCopyEl && siteLayout.footerCopy) footerCopyEl.textContent = siteLayout.footerCopy;

  // Footer social
  var footerSocialEl = document.querySelector('.footer-social');
  if (footerSocialEl) footerSocialEl.style.display = siteLayout.footerSocial === false ? 'none' : '';

  // Carrinho — prazo de entrega
  var cartDelivery = document.querySelector('.cart-delivery-info span');
  if (cartDelivery) {
    var prazo = siteLayout.prazoEntrega || '30 a 60 minutos';
    cartDelivery.innerHTML = 'Entrega estimada: <strong>' + prazo + '</strong>';
  }

  // Parallax flag
  if (siteLayout.parallax === false) {
    window._parallaxOff = true;
  } else {
    window._parallaxOff = false;
  }

  console.log("Layout do site aplicado com sucesso!");
}

/* ============================================================================
   LOADER
============================================================================ */
window.addEventListener("load", async function() {
  inicializarFirebase();
  await inicializarDados();

  setTimeout(function() {
    var loader = document.getElementById("loader");
    if (loader) loader.classList.add("hide");
  }, 1600);
});

/* ============================================================================
   INICIALIZAR DADOS — carrega tudo do Firebase e ativa listeners
============================================================================ */
async function inicializarDados() {
  // 1) Carrega banco completo
  var db = null;
  try { db = await dbGet("aquagas_db"); } catch(e) {}

  // Produtos
  if (db && Array.isArray(db.produtos) && db.produtos.length > 0) {
    produtos = db.produtos;
  } else {
    produtos = PRODUTOS_PADRAO;
  }

  // Config (WhatsApp, prazo, empresa)
  if (db && db.config) {
    if (db.config.whatsapp)     whatsappNumero = db.config.whatsapp;
    if (db.config.instagram)    instagramLink  = db.config.instagram;
    if (db.config.prazoEntrega) siteLayout.prazoEntrega = db.config.prazoEntrega;
    if (db.config.nomeEmpresa)  siteLayout.nomeEmpresa  = db.config.nomeEmpresa;
  }

  // 2) Carrega siteLayout (do Firebase ou localStorage)
  var layoutRemoto = null;
  try {
    if (db && db.siteLayout) {
      layoutRemoto = db.siteLayout;
    } else {
      layoutRemoto = await dbGet("aquagas_db/siteLayout");
    }
  } catch(e) {}

  if (!layoutRemoto) {
    // Fallback: localStorage (compatibilidade ADM sem Firebase)
    try {
      var ls = localStorage.getItem('aquagas_site_layout');
      if (ls) layoutRemoto = JSON.parse(ls);
    } catch(e) {}
  }

  if (layoutRemoto) {
    aplicarLayoutSiteNoDom(layoutRemoto);
  }

  // Carrinho local
  carrinho = carregarCarrinhoLocal();

  // Renderiza produtos
  renderizarProdutos();
  atualizarCarrinho();

  // ── LISTENERS EM TEMPO REAL ──

  // Produtos
  dbOnValue("aquagas_db/produtos", function(novosProdutos) {
    if (!novosProdutos || !Array.isArray(novosProdutos)) return;
    var jsonAtual = JSON.stringify(produtos);
    var jsonNovo  = JSON.stringify(novosProdutos);
    if (jsonAtual !== jsonNovo) {
      produtos = novosProdutos;
      var filtroAtivo = (document.querySelector(".filtro-btn.active") || {}).dataset || {};
      renderizarProdutos(filtroAtivo.filtro || "todos");
      console.log("Produtos atualizados em tempo real do Firebase!");
    }
  });

  // Config (WhatsApp, prazo, etc.)
  dbOnValue("aquagas_db/config", function(config) {
    if (!config) return;
    if (config.whatsapp)     whatsappNumero = config.whatsapp;
    if (config.instagram)    instagramLink  = config.instagram;
    if (config.prazoEntrega) {
      siteLayout.prazoEntrega = config.prazoEntrega;
      var cd = document.querySelector('.cart-delivery-info span');
      if (cd) cd.innerHTML = 'Entrega estimada: <strong>' + config.prazoEntrega + '</strong>';
    }
    // Atualiza links WA
    var wppUrl = 'https://wa.me/' + (config.whatsapp || WHATSAPP_PADRAO);
    document.querySelectorAll('a[href*="wa.me"]').forEach(function(a) { a.href = wppUrl; });
    // Atualiza links Instagram
    if (config.instagram) {
      var igUrl = config.instagram.startsWith('http')
        ? config.instagram
        : 'https://instagram.com/' + config.instagram.replace('@','');
      document.querySelectorAll('a[href*="instagram"]').forEach(function(a) { a.href = igUrl; });
    }
  });

  // Layout do Site (atualizacao em tempo real)
  dbOnValue("aquagas_db/siteLayout", function(layout) {
    if (!layout) return;
    aplicarLayoutSiteNoDom(layout);
    // Re-renderiza produtos para atualizar cores
    var filtroAtivo = (document.querySelector(".filtro-btn.active") || {}).dataset || {};
    renderizarProdutos(filtroAtivo.filtro || "todos");
  });
}

/* ============================================================================
   CARRINHO LOCAL (salvo no localStorage do proprio cliente)
============================================================================ */
function carregarCarrinhoLocal() {
  try {
    var salvo = localStorage.getItem("aquagas_carrinho_cliente");
    return salvo ? JSON.parse(salvo) : [];
  } catch (e) { return []; }
}

function salvarCarrinhoLocal() {
  try {
    localStorage.setItem("aquagas_carrinho_cliente", JSON.stringify(carrinho));
  } catch (e) {}
}

/* ============================================================================
   NAVBAR
============================================================================ */
window.addEventListener("scroll", function() {
  var navbar = document.getElementById("navbar");
  if (!navbar) return;
  navbar.classList.toggle("scrolled", window.scrollY > 60);
});

/* ============================================================================
   MENU MOBILE
============================================================================ */
var btnMenu    = document.getElementById("btnMenu");
var mobileMenu = document.getElementById("mobileMenu");

if (btnMenu && mobileMenu) {
  btnMenu.addEventListener("click", function() {
    btnMenu.classList.toggle("open");
    mobileMenu.classList.toggle("open");
  });
}

function fecharMenu() {
  if (btnMenu)    btnMenu.classList.remove("open");
  if (mobileMenu) mobileMenu.classList.remove("open");
}

/* ============================================================================
   PARTICULAS DO HERO
============================================================================ */
function criarParticulas() {
  var container = document.getElementById("heroParticles");
  if (!container) return;
  for (var i = 0; i < 25; i++) {
    var p   = document.createElement("div");
    p.classList.add("particle");
    var tam = Math.random() * 6 + 2;
    var esq = Math.random() * 100;
    var dur = Math.random() * 12 + 8;
    var del = Math.random() * 10;
    var bot = Math.random() * 20;
    p.style.cssText = 'width:'+tam+'px;height:'+tam+'px;left:'+esq+'%;bottom:'+bot+'%;animation-duration:'+dur+'s;animation-delay:-'+del+'s;';
    container.appendChild(p);
  }
}
criarParticulas();

/* ============================================================================
   PARALLAX
============================================================================ */
var heroBg = document.getElementById("heroBg");
window.addEventListener("scroll", function() {
  if (window._parallaxOff) return;
  if (heroBg) heroBg.style.transform = 'translateY(' + (window.scrollY * 0.3) + 'px)';
});

/* ============================================================================
   SCROLL REVEAL
============================================================================ */
var scrollRevealObserver = new IntersectionObserver(
  function(entries) {
    entries.forEach(function(e) { if (e.isIntersecting) e.target.classList.add("visible"); });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".scroll-reveal").forEach(function(el) { scrollRevealObserver.observe(el); });

/* ============================================================================
   RENDERIZACAO DOS PRODUTOS
============================================================================ */
function renderizarProdutos(filtro) {
  if (filtro === undefined) filtro = "todos";
  var grid = document.getElementById("produtosGrid");
  if (!grid) return;
  grid.innerHTML = "";

  // Remove produtos invalidos
  var produtosValidos = produtos.filter(function(p) { return p && p.nome && p.preco >= 0; });
  var lista = filtro === "todos"
    ? produtosValidos
    : produtosValidos.filter(function(p) { return p.categoria === filtro; });

  if (lista.length === 0) {
    var msgVazio = produtosValidos.length === 0
      ? '<i class="fa-solid fa-box-open" style="font-size:3rem;margin-bottom:16px;display:block"></i>' +
        '<p style="font-size:1.05rem;margin-bottom:8px">Nenhum produto cadastrado ainda.</p>' +
        '<span style="font-size:.875rem">Em breve nosso catalogo estara disponivel aqui!</span>'
      : '<i class="fa-solid fa-box-open" style="font-size:3rem;margin-bottom:12px;display:block"></i>' +
        '<p>Nenhum produto encontrado nesta categoria.</p>';
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:rgba(240,248,255,0.4)">' + msgVazio + '</div>';
    return;
  }

  var badges = {
    agua:       { label:"Agua",      classe:"badge-agua"       },
    gas:        { label:"Gas",       classe:"badge-gas"        },
    acessorios: { label:"Acessorio", classe:"badge-acessorios" },
    limpeza:    { label:"Limpeza",   classe:"badge-limpeza"    },
  };

  var corDestaque = siteLayout.cor || '#00b4ff';

  lista.forEach(function(produto, index) {
    var card  = document.createElement("div");
    card.classList.add("produto-card", "scroll-reveal");
    card.style.transitionDelay = (index * 0.07) + 's';
    var badge = badges[produto.categoria] || { label:"", classe:"" };
    var corProd = produto.cor || corDestaque;

    card.innerHTML =
      '<span class="card-badge ' + badge.classe + '">' + badge.label + '</span>' +
      '<div class="card-icon" style="color:' + corProd + '">' +
        '<span style="font-size:5rem;z-index:1;position:relative;">' + (produto.icone || "package") + '</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3>' + produto.nome + '</h3>' +
        '<p class="descricao">' + (produto.descricao || "") + '</p>' +
        '<div class="card-preco">' +
          '<span class="preco-valor">R$ ' + formatarPreco(produto.preco) + '</span>' +
          '<span class="preco-label">/ unidade</span>' +
        '</div>' +
        '<button class="btn-add" onclick="adicionarAoCarrinho(' + produto.id + ')" aria-label="Adicionar ' + produto.nome + ' ao pedido">' +
          '<i class="fa-solid fa-plus"></i> Adicionar ao pedido' +
        '</button>' +
      '</div>';

    grid.appendChild(card);
    scrollRevealObserver.observe(card);
  });
}

/* ============================================================================
   FILTROS
============================================================================ */
document.querySelectorAll(".filtro-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".filtro-btn").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    renderizarProdutos(btn.dataset.filtro);
  });
});

/* ============================================================================
   CARRINHO — ADICIONAR, REMOVER, ALTERAR QUANTIDADE
============================================================================ */
function adicionarAoCarrinho(id) {
  var produto = produtos.find(function(p) { return p.id === id; });
  if (!produto) return;

  var itemExistente = carrinho.find(function(i) { return i.id === id; });
  if (itemExistente) {
    itemExistente.quantidade++;
  } else {
    carrinho.push({ id: produto.id, nome: produto.nome, preco: produto.preco, quantidade: 1, icone: produto.icone });
  }

  salvarCarrinhoLocal();
  atualizarCarrinho();
  mostrarToast((produto.icone || '') + ' ' + produto.nome + ' adicionado!');

  if (carrinho.length === 1) abrirCarrinho();
}

function removerDoCarrinho(id) {
  carrinho = carrinho.filter(function(i) { return i.id !== id; });
  salvarCarrinhoLocal();
  atualizarCarrinho();
}

function alterarQuantidade(id, delta) {
  var item = carrinho.find(function(i) { return i.id === id; });
  if (!item) return;
  item.quantidade += delta;
  if (item.quantidade <= 0) { removerDoCarrinho(id); return; }
  salvarCarrinhoLocal();
  atualizarCarrinho();
}

function limparCarrinho() {
  carrinho = [];
  salvarCarrinhoLocal();
  atualizarCarrinho();
}

/* ============================================================================
   ATUALIZAR INTERFACE DO CARRINHO
============================================================================ */
function atualizarCarrinho() {
  var cartItemsEl  = document.getElementById("cartItems");
  var cartEmptyEl  = document.getElementById("cartEmpty");
  var cartFooterEl = document.getElementById("cartFooter");
  var cartBadgeEl  = document.getElementById("cartBadge");
  var subtotalEl   = document.getElementById("subtotal");
  var totalEl      = document.getElementById("totalGeral");

  if (!cartItemsEl) return;

  var totalItens = carrinho.reduce(function(acc, i) { return acc + i.quantidade; }, 0);

  if (cartBadgeEl) {
    cartBadgeEl.textContent = totalItens;
    cartBadgeEl.classList.remove("bump");
    void cartBadgeEl.offsetWidth;
    cartBadgeEl.classList.add("bump");
  }

  var totalValor = carrinho.reduce(function(acc, i) { return acc + i.preco * i.quantidade; }, 0);

  var cartClienteEl = document.getElementById("cartCliente");

  if (carrinho.length === 0) {
    cartItemsEl.querySelectorAll(".cart-item").forEach(function(el) { el.remove(); });
    if (cartEmptyEl)   cartEmptyEl.style.display   = "flex";
    if (cartFooterEl)  cartFooterEl.style.display  = "none";
    return;
  }

  if (cartEmptyEl)   cartEmptyEl.style.display   = "none";
  if (cartFooterEl)  cartFooterEl.style.display  = "flex";

  cartItemsEl.querySelectorAll(".cart-item").forEach(function(el) { el.remove(); });

  carrinho.forEach(function(item) {
    var div = document.createElement("div");
    div.classList.add("cart-item");
    div.innerHTML =
      '<div class="item-icon">' + (item.icone || '') + '</div>' +
      '<div class="item-info">' +
        '<strong>' + item.nome + '</strong>' +
        '<span class="item-preco">R$ ' + formatarPreco(item.preco * item.quantidade) + '</span>' +
      '</div>' +
      '<div class="item-controles">' +
        '<button class="btn-qty" onclick="alterarQuantidade(' + item.id + ',-1)" aria-label="Diminuir">-</button>' +
        '<span class="item-qty">' + item.quantidade + '</span>' +
        '<button class="btn-qty" onclick="alterarQuantidade(' + item.id + ',+1)" aria-label="Aumentar">+</button>' +
        '<button class="btn-remove" onclick="removerDoCarrinho(' + item.id + ')" aria-label="Remover">' +
          '<i class="fa-solid fa-trash-can"></i>' +
        '</button>' +
      '</div>';
    cartItemsEl.appendChild(div);
  });

  if (subtotalEl) subtotalEl.textContent = 'R$ ' + formatarPreco(totalValor);
  if (totalEl)    totalEl.textContent    = 'R$ ' + formatarPreco(totalValor);
}

/* ============================================================================
   ABRIR / FECHAR CARRINHO
============================================================================ */
var cartSidebar       = document.getElementById("cartSidebar");
var cartOverlay       = document.getElementById("cartOverlay");
var btnAbrirCarrinho  = document.getElementById("btnAbrirCarrinho");
var btnFecharCarrinho = document.getElementById("btnFecharCarrinho");

if (btnAbrirCarrinho)  btnAbrirCarrinho.addEventListener("click",  abrirCarrinho);
if (btnFecharCarrinho) btnFecharCarrinho.addEventListener("click", fecharCarrinho);

function abrirCarrinho() {
  if (cartSidebar) cartSidebar.classList.add("open");
  if (cartOverlay) cartOverlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function fecharCarrinho() {
  if (cartSidebar) cartSidebar.classList.remove("open");
  if (cartOverlay) cartOverlay.classList.remove("open");
  document.body.style.overflow = "";
}

/* ============================================================================
   FINALIZAR PEDIDO — Salva no Firebase + Abre WhatsApp
============================================================================ */
async function finalizarPedido() {
  if (carrinho.length === 0) {
    mostrarToast("Adicione produtos antes de finalizar!");
    return;
  }

  var total    = carrinho.reduce(function(acc, i) { return acc + i.preco * i.quantidade; }, 0);
  var agora    = new Date();
  var dataHora = agora.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
  var prazo    = siteLayout.prazoEntrega || '30 a 60 minutos';

  // Dados do cliente (opcionais)
  var nomeCliente     = (document.getElementById("clienteNome")     || {}).value || "";
  var enderecoCliente = (document.getElementById("clienteEndereco") || {}).value || "";
  nomeCliente     = nomeCliente.trim();
  enderecoCliente = enderecoCliente.trim();

  // Salva no Firebase (ADM recebe instantaneamente)
  var pedidoId = await registrarPedidoNoFirebase(total, nomeCliente, enderecoCliente);

  // Monta mensagem para WhatsApp
  var mensagem = "";
  mensagem += "NOVA COMANDA — AquaGas\n";
  mensagem += "===================================\n\n";
  mensagem += "Data/Hora: " + dataHora + "\n";
  if (pedidoId) mensagem += "Pedido #" + pedidoId + "\n";
  mensagem += "Prazo estimado: " + prazo + "\n";
  if (nomeCliente)     mensagem += "Cliente:  " + nomeCliente + "\n";
  if (enderecoCliente) mensagem += "Endereco: " + enderecoCliente + "\n";
  mensagem += "\n";
  mensagem += "ITENS DO PEDIDO:\n";
  mensagem += "-----------------------------------\n";

  carrinho.forEach(function(item) {
    var subtotalItem = item.preco * item.quantidade;
    mensagem += "\n" + (item.icone || '') + " " + item.nome + "\n";
    mensagem += "   Qtd: " + item.quantidade + "x\n";
    mensagem += "   Unitario: R$ " + formatarPreco(item.preco) + "\n";
    mensagem += "   Subtotal: R$ " + formatarPreco(subtotalItem) + "\n";
  });

  mensagem += "\n-----------------------------------\n";
  mensagem += "Itens: " + carrinho.length + " produto(s)\n";
  mensagem += "Frete: GRATIS\n";
  mensagem += "TOTAL: R$ " + formatarPreco(total) + "\n\n";
  mensagem += "===================================\n";
  if (!enderecoCliente) {
    mensagem += "Por favor, informe seu endereco completo para concluir o pedido.\n\n";
  }
  mensagem += "Pedido gerado pelo site AquaGas.";

  var wppNum = siteLayout.whatsapp || whatsappNumero || WHATSAPP_PADRAO;
  window.open('https://wa.me/' + wppNum + '?text=' + encodeURIComponent(mensagem), "_blank");

  // Limpa carrinho e campos do cliente após enviar
  limparCarrinho();
  var campoNome     = document.getElementById("clienteNome");
  var campoEndereco = document.getElementById("clienteEndereco");
  if (campoNome)     campoNome.value     = "";
  if (campoEndereco) campoEndereco.value = "";

  mostrarToast("Pedido enviado e registrado no ADM!");
}

/* ============================================================================
   REGISTRAR PEDIDO NO FIREBASE
============================================================================ */
async function registrarPedidoNoFirebase(total, nomeCliente, enderecoCliente) {
  try {
    var db = await dbGet("aquagas_db");

    if (!db) {
      db = {
        config:        { whatsapp: WHATSAPP_PADRAO },
        produtos:      [],
        nextProdId:    1,
        comandas:      {},
        nextComandaId: 1,
        lancamentos:   {},
        nextLancId:    1,
        funcionarios:  {},
        nextFuncId:    1,
      };
    }

    if (!db.nextComandaId) db.nextComandaId = 1;
    if (!db.nextLancId)    db.nextLancId    = 1;

    var hoje     = new Date().toISOString().split("T")[0];
    var pedidoId = db.nextComandaId;

    var novaComanda = {
      id:        pedidoId,
      cliente:   nomeCliente     || "Cliente do Site",
      telefone:  "",
      endereco:  enderecoCliente || "A confirmar via WhatsApp",
      pagamento: "a_confirmar",
      itens:     carrinho.map(function(item) {
        return {
          prodId: item.id,
          nome:   item.nome,
          icone:  item.icone,
          preco:  item.preco,
          qty:    item.quantidade,
        };
      }),
      total:  total,
      status: "pendente",
      obs:    "Pedido feito pelo site — endereco e pagamento a confirmar via WhatsApp.",
      data:   hoje,
      origem: "site",
      ts:     Date.now(),
    };

    var lancId = db.nextLancId;
    var novoLancamento = {
      id:        lancId,
      tipo:      "receita",
      descricao: "Pedido #" + pedidoId + " — Site (pendente confirmacao)",
      categoria: "vendas",
      valor:     total,
      data:      hoje,
      origem:    "site",
    };

    // Usa paths separados para nao sobrescrever o banco todo
    await dbSet("aquagas_db/comandas/" + pedidoId,  novaComanda);
    await dbSet("aquagas_db/lancamentos/" + lancId, novoLancamento);
    await dbSet("aquagas_db/nextComandaId",          pedidoId + 1);
    await dbSet("aquagas_db/nextLancId",             lancId + 1);

    console.log("Pedido #" + pedidoId + " salvo no Firebase — R$ " + formatarPreco(total));
    return pedidoId;

  } catch (erro) {
    console.error("Erro ao registrar pedido:", erro);
    return null;
  }
}

/* ============================================================================
   TOAST
============================================================================ */
var toastTimeout = null;

function mostrarToast(mensagem) {
  var toastEl    = document.getElementById("toast");
  var toastMsgEl = document.getElementById("toastMsg");
  if (!toastEl || !toastMsgEl) return;

  toastMsgEl.textContent = mensagem;
  toastEl.classList.add("show");

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(function() { toastEl.classList.remove("show"); }, 3000);
}

/* ============================================================================
   UTILITARIOS
============================================================================ */
function formatarPreco(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
}

/* ============================================================================
   SMOOTH SCROLL
============================================================================ */
document.querySelectorAll('a[href^="#"]').forEach(function(link) {
  link.addEventListener("click", function(e) {
    var alvo = document.querySelector(link.getAttribute("href"));
    if (alvo) { e.preventDefault(); alvo.scrollIntoView({ behavior:"smooth", block:"start" }); }
  });
});

console.log("AquaGas — Sistema Firebase carregado!");
console.log("Sincronizacao em tempo real ativa.");
