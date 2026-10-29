/**
 * Inicialização, navegação entre seções e ciclo de atualização.
 */
(function (GGE) {
  'use strict';

  const SECOES = {
    'visao-geral': 'Visão Geral',
    editorial: 'Análise Editorial',
    diagramacao: 'Análise de Diagramação',
    relatorios: 'Relatórios'
  };

  let base = [];
  let filtrados = [];
  let secaoAtual = 'visao-geral';

  function renderSecao() {
    const D = GGE.dashboard;
    const { CATEGORIAS } = GGE.indicadores;
    if (secaoAtual === 'visao-geral') D.renderVisaoGeral(filtrados);
    if (secaoAtual === 'editorial') D.renderAnalise('ed', filtrados, CATEGORIAS.EDITORIAL);
    if (secaoAtual === 'diagramacao') D.renderAnalise('dg', filtrados, CATEGORIAS.DIAGRAMACAO);
    GGE.util.icones();
  }

  function atualizar() {
    filtrados = GGE.filtros.aplicar(base);
    const ativos = GGE.filtros.ativos();
    document.getElementById('contador-filtro').textContent =
      `${GGE.util.fmtNum(filtrados.length)} de ${GGE.util.fmtNum(base.length)} apontamentos com os filtros aplicados`;
    const btn = document.getElementById('btn-filtros');
    document.getElementById('btn-filtros-rotulo').textContent = ativos.length ? `Filtros (${ativos.length})` : 'Filtros';
    btn.classList.toggle('com-filtros', ativos.length > 0);
    btn.title = ativos.length ? ativos.map((f) => `${f.rotulo}: ${f.valor}`).join('\n') : 'Nenhum filtro aplicado';
    document.getElementById('btn-limpar').disabled = ativos.length === 0;
    renderSecao();
  }

  /* ---------- Acesso à gestão (seção Relatórios) ----------
   * Barreira de navegação no frontend, não autenticação: quem tiver conhecimento técnico
   * consegue contorná-la. Guarda só o SHA-256 da senha e o estado da sessão do navegador. */
  const SECAO_RESTRITA = 'relatorios';
  const HASH_SENHA = '3608df656b4376123e4b94e8ea37607eddd3f6d6d093ba6b6cf79a03695a6088';
  const CHAVE_SESSAO = 'gge-acesso-gestao';
  let navegou = false;
  let liberadoNaPagina = false; // fallback quando o sessionStorage está bloqueado

  function acessoLiberado() {
    try { return sessionStorage.getItem(CHAVE_SESSAO) === '1'; } catch { return false; }
  }

  async function sha256(texto) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function pedirAcesso() {
    const dlg = document.getElementById('acesso-gestao');
    if (dlg.open) return;
    document.getElementById('acesso-form').reset();
    mostrarErroAcesso(false);
    definirSenhaVisivel(false);
    dlg.showModal();
  }

  function mostrarErroAcesso(erro) {
    document.getElementById('acesso-erro').hidden = !erro;
    document.getElementById('acesso-senha').setAttribute('aria-invalid', String(erro));
  }

  function definirSenhaVisivel(visivel) {
    const btn = document.getElementById('acesso-mostrar');
    document.getElementById('acesso-senha').type = visivel ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(visivel));
    btn.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Mostrar senha');
    btn.innerHTML = `<i data-lucide="${visivel ? 'eye-off' : 'eye'}"></i>`;
    GGE.util.icones();
  }

  function ligarAcesso() {
    const dlg = document.getElementById('acesso-gestao');
    const campo = document.getElementById('acesso-senha');
    const entrar = document.getElementById('acesso-entrar');
    document.getElementById('acesso-mostrar').addEventListener('click', () => {
      definirSenhaVisivel(campo.type === 'password');
      campo.focus();
    });
    document.getElementById('acesso-cancelar').addEventListener('click', () => dlg.close());
    campo.addEventListener('input', () => mostrarErroAcesso(false));
    document.getElementById('acesso-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      entrar.disabled = true;
      let correta = false;
      try { correta = (await sha256(campo.value)) === HASH_SENHA; } catch { /* crypto.subtle indisponível */ }
      entrar.disabled = false;
      if (!correta) {
        mostrarErroAcesso(true);
        campo.select();
        return;
      }
      try { sessionStorage.setItem(CHAVE_SESSAO, '1'); } catch { /* armazenamento bloqueado: vale só até recarregar */ }
      liberadoNaPagina = true;
      dlg.close();
      history.replaceState(null, '', `#${SECAO_RESTRITA}`);
      navegar(SECAO_RESTRITA);
    });
  }

  function navegar(secao) {
    if (!SECOES[secao]) {
      // Rota inexistente ou antiga (ex.: #ocorrencias): abre a Visão Geral e corrige o endereço.
      if (secao) history.replaceState(null, '', '#visao-geral');
      secao = 'visao-geral';
    }
    if (secao === SECAO_RESTRITA && !liberadoNaPagina && !acessoLiberado()) {
      // Mantém a seção anterior (na carga inicial, a Visão Geral por trás do modal).
      history.replaceState(null, '', `#${secaoAtual}`);
      pedirAcesso();
      if (navegou) return;
      secao = secaoAtual;
    }
    navegou = true;
    secaoAtual = secao;
    document.querySelectorAll('.secao').forEach((s) => { s.hidden = s.id !== `secao-${secao}`; });
    document.querySelectorAll('.nav-link').forEach((a) => {
      const ativo = a.dataset.secao === secao;
      a.classList.toggle('ativo', ativo);
      if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.getElementById('titulo-secao').textContent = SECOES[secao];
    document.title = `${SECOES[secao]} · Qualidade Editorial GGE`;
    fecharMenu();
    renderSecao();
    if (destinoPendente) {
      const alvo = destinoPendente;
      destinoPendente = null;
      rolarAte(alvo);
    } else {
      window.scrollTo({ top: 0 });
    }
  }

  /* ---------- Navegação até um componente ---------- */
  let destinoPendente = null;

  /**
   * Rola até o elemento. Chamada logo após renderSecao(), que monta a seção de forma síncrona;
   * scrollIntoView força o cálculo de layout, então não é preciso esperar outro quadro.
   */
  function rolarAte(alvoId) {
    const alvo = document.getElementById(alvoId);
    // scroll-margin-top (CSS) mantém o título visível abaixo do topo.
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Abre a seção (pela navegação por hash já existente) e rola até o componente.
   * Na própria seção, apenas rola. Filtros e estado das tabelas são mantidos.
   */
  function irParaComponente(secao, alvoId) {
    if (secaoAtual === secao && location.hash.slice(1) === secao) {
      rolarAte(alvoId);
      return;
    }
    destinoPendente = alvoId;
    location.hash = secao; // dispara hashchange → navegar() → renderSecao() → rolarAte()
  }

  /* ---------- Menu mobile ---------- */
  const body = document.body;
  function abrirMenu() { body.classList.add('menu-aberto'); document.getElementById('btn-menu').setAttribute('aria-expanded', 'true'); }
  function fecharMenu() { body.classList.remove('menu-aberto'); document.getElementById('btn-menu').setAttribute('aria-expanded', 'false'); }

  /* ---------- Menu lateral expandido/recolhido (desktop) ---------- */
  const CHAVE_MENU = 'gge.menuRecolhido'; // só a preferência visual; nenhum dado de apontamento

  function aplicarMenuRecolhido(recolhido) {
    body.classList.toggle('menu-recolhido', recolhido);
    const btn = document.getElementById('btn-recolher');
    const texto = recolhido ? 'Expandir menu' : 'Recolher menu';
    btn.setAttribute('aria-expanded', String(!recolhido));
    btn.setAttribute('aria-label', texto);
    btn.title = texto;
    btn.innerHTML = `<i data-lucide="${recolhido ? 'chevron-right' : 'chevron-left'}"></i>`;
    GGE.util.icones();
  }

  function iniciarMenuRecolhivel() {
    let recolhido = false;
    try { recolhido = localStorage.getItem(CHAVE_MENU) === '1'; } catch { /* armazenamento indisponível */ }
    aplicarMenuRecolhido(recolhido);
    const DURACAO_TRANSICAO = 250; // mesma duração do CSS (.sidebar / .principal)
    document.getElementById('btn-recolher').addEventListener('click', () => {
      const novo = !body.classList.contains('menu-recolhido');
      aplicarMenuRecolhido(novo);
      try { localStorage.setItem(CHAVE_MENU, novo ? '1' : '0'); } catch { /* ignora */ }
      // Garante o redimensionamento mesmo sem transição (movimento reduzido) ou sem transitionend.
      setTimeout(GGE.dashboard.redimensionar, DURACAO_TRANSICAO + 30);
    });
    // Gráficos acompanham a nova largura ao fim da transição do conteúdo.
    document.querySelector('.principal').addEventListener('transitionend', (e) => {
      if (e.propertyName === 'margin-left') GGE.dashboard.redimensionar();
    });
  }

  /* ---------- Drawer de filtros ---------- */
  function abrirDrawer() {
    const drawer = document.getElementById('drawer-filtros');
    GGE.filtros.sincronizarCampos(); // reabre sempre com os filtros realmente aplicados
    fecharMenu();
    drawer.inert = false;
    drawer.setAttribute('aria-hidden', 'false');
    body.classList.add('drawer-aberto');
    document.getElementById('btn-filtros').setAttribute('aria-expanded', 'true');
    setTimeout(() => drawer.querySelector('.grupo-check input')?.focus(), 50);
  }

  function fecharDrawer() {
    if (!body.classList.contains('drawer-aberto')) return;
    const drawer = document.getElementById('drawer-filtros');
    body.classList.remove('drawer-aberto');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    const btn = document.getElementById('btn-filtros');
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  }

  function ligarEventos() {
    window.addEventListener('hashchange', () => {
      const pedido = location.hash.slice(1);
      if (pedido && !SECOES[pedido]) history.replaceState(null, '', '#visao-geral'); // rota antiga/inválida
      const secao = SECOES[pedido] ? pedido : 'visao-geral';
      // Hash da seção já aberta (ex.: chegou atrasado após uma rolagem): não volta ao topo.
      if (secao === secaoAtual && !destinoPendente) return;
      navegar(secao);
    });
    document.getElementById('btn-menu').addEventListener('click', () => (body.classList.contains('menu-aberto') ? fecharMenu() : abrirMenu()));
    document.getElementById('overlay').addEventListener('click', fecharMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (body.classList.contains('drawer-aberto')) fecharDrawer(); else fecharMenu();
    });

    document.getElementById('btn-filtros').addEventListener('click', abrirDrawer);
    document.getElementById('drawer-fechar').addEventListener('click', fecharDrawer);
    document.getElementById('drawer-cancelar').addEventListener('click', fecharDrawer);
    document.getElementById('drawer-fundo').addEventListener('click', fecharDrawer);
    // filtros.js aplica o estado; aqui apenas fecha o painel em seguida.
    document.getElementById('btn-aplicar').addEventListener('click', fecharDrawer);

    document.getElementById('btn-ver-qualidade').addEventListener('click', (e) => {
      const lista = document.getElementById('alerta-detalhes');
      lista.hidden = !lista.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!lista.hidden));
      e.currentTarget.textContent = lista.hidden ? 'Ver detalhes' : 'Ocultar detalhes';
    });

    const dlg = document.getElementById('detalhe');
    document.getElementById('detalhe-fechar').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    ligarAcesso();

    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(GGE.dashboard.redimensionar, 150); });
  }

  /* ---------- Tema claro/escuro ----------
   * O tema salvo já foi aplicado no <head>; aqui só a alternância. Os gráficos são
   * redesenhados com as cores do novo tema; o PDF não lê o tema e segue no padrão claro. */
  const CHAVE_TEMA = 'gge-tema';

  function temaEscuro() { return document.documentElement.dataset.theme === 'dark'; }

  function rotularBotaoTema() {
    const btn = document.getElementById('btn-tema');
    const texto = temaEscuro() ? 'Ativar modo claro' : 'Ativar modo escuro';
    btn.title = texto;
    btn.setAttribute('aria-label', texto);
  }

  function iniciarTema() {
    rotularBotaoTema();
    document.getElementById('btn-tema').addEventListener('click', () => {
      const escuro = !temaEscuro();
      if (escuro) document.documentElement.dataset.theme = 'dark';
      else delete document.documentElement.dataset.theme;
      try { localStorage.setItem(CHAVE_TEMA, escuro ? 'dark' : 'light'); } catch { /* preferência vale só nesta visita */ }
      rotularBotaoTema();
      if (window.Chart && base.length) {
        GGE.dashboard.configGlobalChart();
        renderSecao();
      }
    });
  }

  async function iniciar() {
    iniciarTema();
    const carregando = document.getElementById('carregando');
    iniciarMenuRecolhivel(); // antes da carga dos dados, para restaurar o estado sem esperar a API
    // Recarrega a página para buscar a versão mais recente da planilha.
    document.getElementById('btn-atualizar').addEventListener('click', (e) => {
      e.currentTarget.classList.add('girando');
      e.currentTarget.disabled = true;
      location.reload();
    });
    try {
      if (!window.Chart) throw new Error('Chart.js não carregou. Verifique a conexão com a internet.');
      GGE.dashboard.configGlobalChart();

      const { registros, demonstrativo, meta } = await GGE.api.carregarRegistros();
      marcarProgresso(55); // dados recebidos da API
      document.getElementById('selo-demo').hidden = !demonstrativo;
      if (meta) {
        const selo = document.getElementById('selo-fonte');
        selo.hidden = false;
        selo.querySelector('span').textContent = meta.atualizadoEm && !isNaN(meta.atualizadoEm)
          ? `Google Sheets · atualizado em ${GGE.util.fmtData(meta.atualizadoEm)}`
          : 'Google Sheets';
        // Texto completo também no tooltip: em telas médias o selo mostra só o ícone.
        selo.title = selo.querySelector('span').textContent + (meta.versao ? ` · API versão ${meta.versao}` : '');
        selo.setAttribute('aria-label', selo.title);
      }

      const { registros: preparados, inconsistencias } = GGE.indicadores.prepararRegistros(registros);
      if (meta && meta.totalApi !== null && meta.totalApi !== preparados.length) {
        inconsistencias.divergenciaTotal = { api: meta.totalApi, recebidos: preparados.length };
      }
      base = preparados;
      GGE.dashboard.indexar(base);
      GGE.dashboard.renderQualidade(inconsistencias, base.length);
      GGE.relatorios.montar(base, meta); // gerador de PDF usa a base completa, com parâmetros próprios
      GGE.dashboard.montarTabela();
      GGE.filtros.montar(base, atualizar);
      // "Ver apontamentos" dos cards: leva à tabela do respectivo processo, mantendo os filtros.
      const { CATEGORIAS } = GGE.indicadores;
      const DESTINOS = {
        total: ['visao-geral', 'apontamentos-geral'],
        [CATEGORIAS.EDITORIAL]: ['editorial', 'apontamentos-editorial'],
        [CATEGORIAS.DIAGRAMACAO]: ['diagramacao', 'apontamentos-diagramacao']
      };
      GGE.dashboard.ligarCards((acao) => {
        if (DESTINOS[acao]) {
          irParaComponente(...DESTINOS[acao]);
          return;
        }
        // "Outras classificações": sem seção própria; aplica o filtro e leva à tabela da Visão Geral.
        GGE.filtros.definirCategoria(acao);
        irParaComponente('visao-geral', 'apontamentos-geral');
      });
      ligarEventos();

      filtrados = GGE.filtros.aplicar(base);
      atualizar();
      navegar(location.hash.slice(1));
      marcarProgresso(85); // dashboard desenhado
    } catch (erro) {
      console.error(erro);
      const box = document.getElementById('erro-carga');
      box.hidden = false;
      box.querySelector('span').textContent = erro.message;
    } finally {
      carregando.hidden = true;
      GGE.util.icones();
      sinalizarInicializado(); // libera a abertura (com sucesso ou com aviso de erro visível)
    }
  }

  /* ---------- Abertura institucional ---------- */
  // A camada já está visível pelo HTML/CSS. Sai quando os dois acontecem: tempo mínimo de 2,8 s
  // (desde o início do carregamento) e fim da inicialização (sucesso ou erro da API).
  // Limite máximo: nunca bloqueia a entrada além de ABERTURA_MAXIMA, mesmo se a API não responder.
  const DURACAO_ABERTURA = 2800;
  const ABERTURA_MAXIMA = 10000;
  const SAIDA_ABERTURA = 600; // mesma duração da transição em .abertura
  let sinalizarInicializado;
  const inicializado = new Promise((resolver) => { sinalizarInicializado = resolver; });

  function encerrarAbertura() {
    const abertura = document.getElementById('abertura');
    if (!abertura) return;
    const remover = () => {
      abertura.remove();
      document.body.classList.remove('abertura-ativa');
      GGE.dashboard?.redimensionar?.(); // gráficos desenhados sob a camada já estão no tamanho certo; só garante
    };
    abertura.classList.add('saindo');
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(remover, reduzido ? 0 : SAIDA_ABERTURA);
  }

  /*
   * Progresso da abertura (0 → 100%, nunca retrocede).
   * Não há percentual real de carregamento: o valor combina marcos reais da inicialização
   * (marcarProgresso: dados recebidos, dashboard desenhado) com um avanço visual suave.
   * Fica abaixo de 100% até o sistema estar pronto; só então completa e a abertura sai.
   */
  const TETO_ANTES_DE_PRONTO = 92;
  let progresso = 0;        // valor exibido
  let pisoProgresso = 0;    // mínimo garantido pelos marcos reais
  let sistemaPronto = false;

  function marcarProgresso(valor) { pisoProgresso = Math.max(pisoProgresso, valor); }

  const esperar = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  Promise.race([
    Promise.all([esperar(DURACAO_ABERTURA - performance.now()), inicializado]),
    esperar(ABERTURA_MAXIMA - performance.now()) // falha/timeout da API: não bloqueia a entrada
  ]).then(() => { sistemaPronto = true; });

  (function animarProgresso() {
    const barra = document.getElementById('abertura-barra');
    const rotulo = document.getElementById('abertura-percentual');
    if (!barra || !rotulo) { inicializado.then(encerrarAbertura); return; }
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const relogio = setInterval(() => {
      // Avanço visual distribuído ao longo do tempo mínimo (desacelera no fim, sem paradas),
      // nunca abaixo dos marcos reais e nunca 100% antes de o sistema estar pronto.
      const fracao = Math.min(1, performance.now() / DURACAO_ABERTURA);
      const visual = TETO_ANTES_DE_PRONTO * (1 - (1 - fracao) ** 2);
      const alvo = sistemaPronto ? 100 : Math.min(Math.max(visual, pisoProgresso), TETO_ANTES_DE_PRONTO);
      const proximo = reduzido ? alvo : progresso + (alvo - progresso) * (sistemaPronto ? 0.2 : 0.1);
      progresso = Math.max(progresso, sistemaPronto && alvo - proximo < 0.5 ? 100 : proximo);
      barra.style.transform = `scaleX(${progresso / 100})`;
      rotulo.textContent = `${Math.round(progresso)}%`;
      if (progresso >= 100) {
        clearInterval(relogio);
        setTimeout(encerrarAbertura, 300); // breve pausa em 100% antes da transição
      }
    }, 30);
  })();

  document.addEventListener('DOMContentLoaded', iniciar);
})(window.GGE = window.GGE || {});
