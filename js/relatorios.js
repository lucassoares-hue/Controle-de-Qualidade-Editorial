/**
 * Seção Relatórios: gerador de PDF a partir dos registros reais da BASE_ERROS.
 * - Parâmetros próprios (independentes dos filtros globais), em checkboxes.
 * - PDF montado com jsPDF + jspdf-autotable: textos e tabelas são desenhados no documento;
 *   gráficos são renderizados pelo Chart.js em canvas fora da tela e inseridos como imagem.
 * - Ordem do documento: capa → página institucional (frase) → indicadores e gráficos (1 página) →
 *   tabela (grupos Editorial e Diagramação) → contracapa, respeitando os componentes
 *   marcados em "Conteúdo do relatório".
 */
(function (GGE) {
  'use strict';

  const TODAS = '__todas';
  const TITULO = 'Relatório de Controle de Qualidade Editorial';
  // Paleta do relatório (RGB).
  const COR = {
    marinho: [16, 28, 53],      // #101C35
    azul: [37, 99, 235],        // #2563EB
    diagramacao: [116, 118, 135], // #747687
    fundo: [246, 248, 252],     // #F6F8FC
    borda: [223, 229, 239],     // #DFE5EF
    branco: [255, 255, 255],
    texto: [15, 23, 42],
    suave: [100, 116, 139],
    azulClaro: [147, 180, 245],
    capaTexto: [201, 212, 234],
    capaSuave: [159, 176, 208]
  };
  const HEX = { marinho: '#101C35', azul: '#2563EB', diagramacao: '#747687', borda: '#DFE5EF', texto: '#0F172A', eixo: '#475569' };

  let base = [];
  let meta = null;
  let logoDataUrl = null;

  const $ = (id) => document.getElementById(id);
  const grupo = (nome) => document.querySelector(`#form-relatorio [data-rel="${nome}"]`);
  const caixas = (nome) => [...grupo(nome).querySelectorAll('input[type="checkbox"]')];
  const marcados = (nome) => caixas(nome).filter((c) => c.checked).map((c) => c.value);
  const norm = (s) => GGE.util.semAcento(s).replace(/\s+/g, ' ');

  /* ---------- Mapeamento entre a interface e os valores da base ---------- */

  /** "M1", "m 1", "Módulo 1" → "M1"; "Anual"/"Módulo Anual" → "ANUAL"; outros → null. */
  function codigoModulo(valor) {
    const n = norm(valor);
    const m = n.match(/^(?:m|modulo)\s*(\d+)$/);
    if (m) return `M${+m[1]}`;
    if (/^(?:modulo )?anual$/.test(n)) return 'ANUAL';
    return null;
  }

  /** Coleção comparada sem acentos, espaços extras ou diferença de maiúsculas. */
  const codigoColecao = (valor) => norm(valor).toUpperCase();

  /**
   * Processos do registro, a partir das classificações da API (já normalizadas em _categoria
   * por indicadores.categorizar). Um registro combinado pertence aos dois processos.
   */
  function processos(r) {
    const C = GGE.indicadores.CATEGORIAS;
    if (r._categoria === C.EDITORIAL) return [C.EDITORIAL];
    if (r._categoria === C.DIAGRAMACAO) return [C.DIAGRAMACAO];
    if (r._categoria === C.COMBINADO) return [C.EDITORIAL, C.DIAGRAMACAO];
    return [];
  }

  /* ---------- Parâmetros ---------- */

  function parametros() {
    const col = marcados('colecao');
    const mod = marcados('modulo');
    return {
      colecoes: col.includes(TODAS) || !col.length ? null : new Set(col),
      modulos: mod.includes(TODAS) || !mod.length ? null : new Set(mod),
      processos: new Set(marcados('processo')),
      conteudo: new Set(marcados('conteudo'))
    };
  }

  /** Cada registro entra uma única vez, mesmo combinado e com os dois processos marcados. */
  function filtrar(p) {
    return base.filter((r) => {
      if (p.colecoes && !p.colecoes.has(codigoColecao(r.colecao))) return false;
      if (p.modulos && !p.modulos.has(codigoModulo(r.modulo))) return false;
      return processos(r).some((pr) => p.processos.has(pr));
    });
  }

  /* ---------- Interface ---------- */

  function montar(registros, metadados) {
    base = registros;
    meta = metadados || null;

    // "Todas"/"Todos" é exclusivo: marcar uma opção específica desmarca-o e vice-versa.
    ['colecao', 'modulo'].forEach((nome) => {
      grupo(nome).addEventListener('change', (e) => {
        const todas = caixas(nome).find((c) => c.value === TODAS);
        if (e.target === todas && todas.checked) caixas(nome).forEach((c) => { if (c !== todas) c.checked = false; });
        else if (e.target !== todas && e.target.checked) todas.checked = false;
        if (!marcados(nome).length) todas.checked = true; // nada marcado equivale a todas
      });
    });

    $('form-relatorio').addEventListener('change', atualizarPrevia);
    $('rel-limpar').addEventListener('click', limpar);
    $('rel-gerar').addEventListener('click', gerar);
    carregarLogo();
    atualizarPrevia();
  }

  function limpar() {
    caixas('colecao').forEach((c) => { c.checked = c.value === TODAS; });
    caixas('modulo').forEach((c) => { c.checked = c.value === TODAS; });
    caixas('processo').forEach((c) => { c.checked = true; });
    caixas('conteudo').forEach((c) => { c.checked = true; });
    atualizarPrevia();
  }

  function status(html, tipo = 'info') {
    const el = $('rel-status');
    el.className = `gerador-status gerador-status-${tipo}`;
    el.innerHTML = html;
  }

  /** Validações e prévia do recorte; retorna os registros quando é possível gerar. */
  function atualizarPrevia() {
    const { esc, fmtNum } = GGE.util;
    const p = parametros();
    const btn = $('rel-gerar');
    const erros = [];
    if (!p.processos.size) erros.push('Selecione ao menos um tipo de apontamento (Editorial ou Diagramação).');
    if (!p.conteudo.size) erros.push('Selecione ao menos um componente em “Conteúdo do relatório”.');

    // Opções específicas sem nenhum registro na base: estado informativo, sem inventar dados.
    const vazias = [];
    if (p.colecoes) [...p.colecoes].forEach((v) => { if (!base.some((r) => codigoColecao(r.colecao) === v)) vazias.push(`coleção ${v}`); });
    if (p.modulos) [...p.modulos].forEach((v) => { if (!base.some((r) => codigoModulo(r.modulo) === v)) vazias.push(v === 'ANUAL' ? 'materiais anuais' : `módulo ${v.replace('M', '')}`); });
    const aviso = vazias.length ? `<p><i data-lucide="info"></i>Não há registros na base para ${esc(vazias.join(', '))}.</p>` : '';

    const registros = erros.length ? [] : filtrar(p);
    if (erros.length) {
      status(erros.map((m) => `<p><i data-lucide="circle-alert"></i>${esc(m)}</p>`).join('') + aviso, 'erro');
    } else if (!registros.length) {
      erros.push('vazio');
      status(`<p><i data-lucide="circle-alert"></i>Nenhum apontamento atende aos parâmetros selecionados.</p>${aviso}`, 'erro');
    } else {
      status(`<p><i data-lucide="list-checks"></i><b>${fmtNum(registros.length)}</b> ${registros.length === 1 ? 'apontamento atende' : 'apontamentos atendem'} aos parâmetros selecionados.</p>${aviso}`, aviso ? 'aviso' : 'info');
    }
    btn.disabled = erros.length > 0;
    GGE.util.icones();
    return erros.length ? null : { p, registros };
  }

  /* ---------- Recursos para o PDF ---------- */

  /** Logo como data URL (precisa de servidor http, ex.: Live Server; em file:// a capa usa só texto). */
  function carregarLogo() {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        logoDataUrl = { url: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
      } catch { logoDataUrl = null; }
    };
    img.src = 'assets/logo-sgge.png';
  }

  // Resolução das imagens de gráfico: pixels por milímetro da página.
  const PX_MM = 7;

  /** Valores sobre barras/pontos, desenhados no próprio gráfico do relatório. */
  const rotulosPdf = {
    id: 'rotulosPdf',
    afterDatasetsDraw(chart, _a, op) {
      const { ctx } = chart;
      const dados = chart.data.datasets[0].data;
      const total = dados.reduce((s, n) => s + n, 0);
      const horizontal = chart.options.indexAxis === 'y';
      ctx.save();
      ctx.font = `600 ${op.fonte || 22}px Inter, Arial, sans-serif`;
      ctx.fillStyle = HEX.texto;
      chart.getDatasetMeta(0).data.forEach((el, i) => {
        if (!dados[i]) return;
        const texto = op.percentual ? `${dados[i]} (${GGE.util.fmtPct((dados[i] / total) * 100)})` : String(dados[i]);
        const { x, y } = el.getProps(['x', 'y'], true);
        ctx.textAlign = horizontal ? 'left' : 'center';
        ctx.textBaseline = horizontal ? 'middle' : 'bottom';
        // Nas pontas, mantém o rótulo dentro da área do gráfico (sem invadir os números do eixo Y).
        const meia = ctx.measureText(texto).width / 2;
        const xRotulo = horizontal ? x + 8 : Math.min(Math.max(x, chart.chartArea.left + meia + 4), chart.width - meia - 4);
        ctx.fillText(texto, xRotulo, horizontal ? y : y - 10);
      });
      ctx.restore();
    }
  };

  /**
   * Renderiza um gráfico Chart.js num canvas fora da tela, no tamanho exato da caixa
   * do PDF (larguraMm × alturaMm), e devolve a imagem PNG — sem distorção ao inserir.
   */
  function imagemGrafico(config, larguraMm, alturaMm) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(larguraMm * PX_MM);
    canvas.height = Math.round(alturaMm * PX_MM);
    // ~3 mm de altura de texto no papel, para leitura em tela e impressão.
    const fonte = { size: Math.round(PX_MM * 2.9), family: 'Inter, Arial, sans-serif' };
    const escalas = Object.fromEntries(Object.entries(config.options?.scales || {}).map(([k, s]) => [k, { ...s, ticks: { ...(s.ticks || {}), font: fonte, color: HEX.eixo } }]));
    const chart = new Chart(canvas, {
      ...config,
      options: {
        responsive: false, animation: false, devicePixelRatio: 1,
        ...config.options,
        scales: escalas,
        plugins: { legend: { display: false }, tooltip: { enabled: false }, ...(config.options?.plugins || {}) }
      }
    });
    const url = chart.toBase64Image('image/png', 1);
    chart.destroy();
    return url;
  }

  /** Dados agregados usados pelos indicadores e gráficos. */
  function agregados(registros) {
    const I = GGE.indicadores;
    const C = I.CATEGORIAS;
    const total = registros.length;
    const ed = registros.filter((r) => processos(r).includes(C.EDITORIAL)).length;
    const dg = registros.filter((r) => processos(r).includes(C.DIAGRAMACAO)).length;
    return {
      total, ed, dg,
      comb: registros.filter((r) => r._categoria === C.COMBINADO).length,
      mod: I.totaisPorModulo(registros),
      col: I.agrupar(registros, 'colecao', { porValor: true }),
      disc: I.agrupar(registros, 'disciplina', { porValor: true, limite: 10 })
    };
  }

  /** Configurações dos quatro gráficos analíticos (renderizados no tamanho de cada caixa). */
  function configsGraficos(a) {
    const eixo = { beginAtZero: true, ticks: { precision: 0 }, grid: { color: HEX.borda } };
    const rotulo = Math.round(PX_MM * 3.1);
    return {
      modulo: {
        type: 'line',
        data: { labels: a.mod.rotulos, datasets: [{ data: a.mod.valores, borderColor: HEX.azul, backgroundColor: 'rgba(37,99,235,.12)', fill: true, borderWidth: 4, pointRadius: 8, pointBackgroundColor: '#fff', pointBorderColor: HEX.azul, pointBorderWidth: 4, cubicInterpolationMode: 'monotone' }] },
        plugins: [rotulosPdf],
        // Folga lateral e superior: os rótulos "n (p%)" das pontas não podem ser cortados.
        options: { layout: { padding: { top: 50, right: 90, left: 70, bottom: 4 } }, plugins: { rotulosPdf: { percentual: true, fonte: rotulo } }, scales: { y: eixo, x: { grid: { display: false } } } }
      },
      processo: {
        type: 'doughnut',
        data: { labels: ['Editorial', 'Diagramação'], datasets: [{ data: [a.ed, a.dg], backgroundColor: [HEX.azul, HEX.diagramacao], borderColor: '#fff', borderWidth: 6 }] },
        options: { cutout: '64%', layout: { padding: 16 } }
      },
      colecao: {
        type: 'bar',
        data: { labels: a.col.rotulos, datasets: [{ data: a.col.valores, backgroundColor: HEX.azul, borderRadius: 8, maxBarThickness: 120 }] },
        plugins: [rotulosPdf],
        options: { layout: { padding: { top: 44, right: 10 } }, plugins: { rotulosPdf: { fonte: rotulo } }, scales: { y: eixo, x: { grid: { display: false } } } }
      },
      disciplina: {
        type: 'bar',
        data: { labels: a.disc.rotulos, datasets: [{ data: a.disc.valores, backgroundColor: HEX.azul, borderRadius: 6, maxBarThickness: 46 }] },
        plugins: [rotulosPdf],
        options: { indexAxis: 'y', layout: { padding: { right: 70, top: 6 } }, plugins: { rotulosPdf: { fonte: rotulo } }, scales: { x: eixo, y: { grid: { display: false } } } }
      }
    };
  }

  /* ---------- Geração ---------- */

  function gerar() {
    const pronto = atualizarPrevia();
    if (!pronto) return;
    if (!window.jspdf || !window.jspdf.jsPDF || !window.jspdf.jsPDF.API.autoTable) {
      status('<p><i data-lucide="circle-x"></i>Não foi possível carregar a biblioteca de PDF. Verifique a conexão e tente novamente.</p>', 'erro');
      GGE.util.icones();
      return;
    }
    const btn = $('rel-gerar');
    btn.disabled = true;
    status('<p><i data-lucide="loader"></i>Gerando PDF…</p>');
    GGE.util.icones();

    // Cede um quadro para a mensagem aparecer antes do trabalho síncrono.
    setTimeout(() => {
      try {
        const { doc, nome, paginas } = montarPdf(pronto.p, pronto.registros);
        doc.save(nome);
        status(`<p><i data-lucide="circle-check"></i>PDF gerado: <b>${GGE.util.esc(nome)}</b> — ${paginas} ${paginas === 1 ? 'página' : 'páginas'}, ${GGE.util.fmtNum(pronto.registros.length)} apontamentos.</p>`, 'sucesso');
      } catch (erro) {
        console.error(erro);
        status(`<p><i data-lucide="circle-x"></i>Falha ao gerar o PDF: ${GGE.util.esc(erro.message)}</p>`, 'erro');
      } finally {
        btn.disabled = false;
        GGE.util.icones();
      }
    }, 30);
  }

  /* ---------- Montagem do PDF ---------- */

  const FRASE_INSTITUCIONAL = '“Transformamos apontamentos em oportunidades de melhoria contínua, fortalecendo processos e promovendo a excelência operacional.”';
  const ASSINATURA_INSTITUCIONAL = 'PCP - SGGE';

  /**
   * Página institucional (verso da capa): frase centralizada, traço azul acima e assinatura abaixo.
   * Largura, quebras de linha e altura do bloco são medidas para centralizar o conjunto na página.
   */
  function paginaInstitucional(doc, W, H) {
    // Fundo branco levemente aquecido.
    doc.setFillColor(252, 251, 248); doc.rect(0, 0, W, H, 'F');

    const tam = 19;                          // pt
    const larguraBloco = 118;                // mm — largura controlada (evita o artigo "a" isolado no fim da linha)
    const entrelinha = tam * 0.3528 * 1.55;  // pt → mm, com entrelinhamento confortável
    doc.setFont('helvetica', 'normal'); doc.setFontSize(tam);
    const linhas = doc.splitTextToSize(FRASE_INSTITUCIONAL, larguraBloco);

    const traco = 1.1; const gapTraco = 16; const gapAssinatura = 16; const alturaAssinatura = 4;
    const alturaFrase = (linhas.length - 1) * entrelinha + tam * 0.3528;
    const alturaBloco = traco + gapTraco + alturaFrase + gapAssinatura + alturaAssinatura;
    let y = (H - alturaBloco) / 2 - 6; // leve compensação óptica para cima

    doc.setFillColor(...COR.azul); doc.rect(W / 2 - 9, y, 18, traco, 'F');
    y += traco + gapTraco + tam * 0.3528 * 0.8; // primeira linha de base

    doc.setTextColor(...COR.marinho);
    linhas.forEach((linha, i) => doc.text(linha, W / 2, y + i * entrelinha, { align: 'center' }));
    y += alturaFrase + gapAssinatura;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COR.suave);
    const espaco = 1.4;
    // Com charSpace o texto não centraliza sozinho: desloca pela largura real.
    const larg = doc.getTextWidth(ASSINATURA_INSTITUCIONAL) + espaco * (ASSINATURA_INSTITUCIONAL.length - 1);
    doc.text(ASSINATURA_INSTITUCIONAL, W / 2 - larg / 2, y, { charSpace: espaco });
  }

  function montarPdf(p, registros) {
    const { jsPDF } = window.jspdf;
    const { fmtNum, fmtPct, fmtData } = GGE.util;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const W = doc.internal.pageSize.getWidth();   // 210
    const H = doc.internal.pageSize.getHeight();  // 297
    const M = 16;                                 // margem lateral
    const TOPO = 26;                              // início do conteúdo nas páginas internas
    const BASE = H - 18;                          // limite inferior do conteúdo (rodapé abaixo)
    const agora = new Date();
    const dataExtenso = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const internas = []; // páginas que recebem cabeçalho/rodapé e numeração

    doc.setProperties({ title: TITULO, subject: 'Relatório analítico de apontamentos', creator: 'SGGE-PCP' });

    const texto = (t, x, y, { tam = 10, cor = COR.texto, estilo = 'normal', alinhar = 'left', espaco = 0 } = {}) => {
      doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...cor);
      doc.text(t, x, y, { align: alinhar, charSpace: espaco });
    };
    const opacidade = (o) => doc.setGState(new doc.GState({ opacity: o, 'stroke-opacity': o }));
    const placaLogo = (x, y, altura, centralizar = false) => {
      if (!logoDataUrl) {
        texto('GGE', centralizar ? x : x, y + altura * 0.75, { tam: altura * 1.9, estilo: 'bold', cor: COR.branco, alinhar: centralizar ? 'center' : 'left' });
        return;
      }
      const larg = (logoDataUrl.w / logoDataUrl.h) * altura;
      const px = 5; const py = 3.5;
      const x0 = centralizar ? x - (larg + 2 * px) / 2 : x;
      doc.setFillColor(...COR.branco); doc.roundedRect(x0, y, larg + 2 * px, altura + 2 * py, 3, 3, 'F');
      doc.addImage(logoDataUrl.url, 'PNG', x0 + px, y + py, larg, altura, 'logo', 'FAST');
    };

    /* ----- 1. Capa ----- */
    doc.setFillColor(...COR.marinho); doc.rect(0, 0, W, H, 'F');
    // Elementos geométricos discretos.
    opacidade(0.18); doc.setDrawColor(...COR.azul); doc.setLineWidth(0.8);
    doc.circle(W - 18, 52, 62, 'S'); doc.circle(W - 18, 52, 44, 'S');
    opacidade(0.08); doc.setFillColor(...COR.azul); doc.circle(12, H - 30, 70, 'F');
    opacidade(1);
    doc.setFillColor(...COR.azul); doc.rect(0, 0, W, 2.2, 'F');

    placaLogo(26, 30, 15);

    doc.setFillColor(...COR.azul); doc.rect(26, 100, 1.6, 62, 'F');
    texto('SGGE-PCP', 34, 108, { tam: 11, estilo: 'bold', cor: COR.azulClaro, espaco: 1.2 });
    texto('CONTROLE DE', 34, 126, { tam: 30, estilo: 'bold', cor: COR.branco });
    texto('QUALIDADE EDITORIAL', 34, 140, { tam: 30, estilo: 'bold', cor: COR.branco });
    doc.setFillColor(...COR.azul); doc.rect(34, 148, 28, 1.4, 'F');
    texto('Relatório analítico de apontamentos', 34, 160, { tam: 14, cor: COR.capaTexto });

    opacidade(0.25); doc.setDrawColor(...COR.capaSuave); doc.setLineWidth(0.3); doc.line(26, H - 44, W - 26, H - 44); opacidade(1);
    texto('Sistema GGE de Ensino', 26, H - 34, { tam: 12, estilo: 'bold', cor: COR.branco });
    texto(`Gerado em ${dataExtenso}, às ${hora}`, 26, H - 27, { tam: 9.5, cor: COR.capaSuave });
    texto('Documento de uso interno', W - 26, H - 27, { tam: 8.5, cor: COR.capaSuave, alinhar: 'right' });

    /* ----- Página 2: frase institucional (sem cabeçalho, rodapé ou numeração) ----- */
    doc.addPage();
    paginaInstitucional(doc, W, H);

    const a = agregados(registros);

    /* ----- 2. Indicadores e gráficos (uma única página) ----- */
    if (p.conteudo.has('resumo') || p.conteudo.has('graficos')) {
      doc.addPage(); internas.push(doc.getNumberOfPages());
      let y = TOPO;
      texto('Visão analítica', M, y + 4, { tam: 17, estilo: 'bold', cor: COR.marinho });
      const fonteDados = meta && meta.atualizadoEm && !isNaN(meta.atualizadoEm) ? ` · dados de ${fmtData(meta.atualizadoEm)}` : '';
      texto(`${fmtNum(a.total)} apontamentos considerados · fonte: Google Sheets, aba BASE_ERROS${fonteDados}`, M, y + 10, { tam: 8.5, cor: COR.suave });
      y += 17;

      if (p.conteudo.has('resumo')) {
        const cards = [
          ['Total de apontamentos', fmtNum(a.total), '100% do recorte', COR.marinho],
          ['Apontamentos editoriais', fmtNum(a.ed), `${fmtPct(a.total ? (a.ed / a.total) * 100 : 0)} do total`, COR.azul],
          ['Apontamentos de diagramação', fmtNum(a.dg), `${fmtPct(a.total ? (a.dg / a.total) * 100 : 0)} do total`, COR.diagramacao]
        ];
        const gap = 5; const cw = (W - 2 * M - 2 * gap) / 3; const ch = 25;
        cards.forEach(([rot, val, sub, cor], i) => {
          const x = M + i * (cw + gap);
          doc.setFillColor(...COR.fundo); doc.setDrawColor(...COR.borda); doc.setLineWidth(0.25);
          doc.roundedRect(x, y, cw, ch, 2.5, 2.5, 'FD');
          doc.setFillColor(...cor); doc.roundedRect(x, y, 1.6, ch, 0.8, 0.8, 'F');
          texto(rot, x + 6, y + 7, { tam: 8.5, cor: COR.suave });
          texto(val, x + 6, y + 16.5, { tam: 19, estilo: 'bold', cor });
          texto(sub, x + 6, y + 21.5, { tam: 8, cor: COR.suave });
        });
        y += ch + 3;
        if (a.comb) {
          texto(`Inclui ${fmtNum(a.comb)} apontamento(s) com as duas classificações, contados uma única vez no total.`, M, y + 3, { tam: 7.5, cor: COR.suave });
          y += 5;
        }
        y += 4;
      }

      if (p.conteudo.has('graficos')) {
        // Grade calculada para caber no espaço restante desta página:
        // linha 1 = módulo (largura total); linha 2 = processo + coleção; linha 3 = disciplina (largura total).
        const gap = 5; const tituloH = 9; const pad = 2.5;
        const disponivel = BASE - y - 2 * gap;
        const hLinha = [0.30, 0.34, 0.36].map((f) => disponivel * f);
        const largTotal = W - 2 * M;
        const meia = (largTotal - gap) / 2;
        const cfg = configsGraficos(a);
        const blocos = [
          { chave: 'modulo', titulo: 'Apontamentos por módulo', x: M, w: largTotal, linha: 0 },
          { chave: 'processo', titulo: 'Distribuição por processo', x: M, w: meia, linha: 1, legenda: true },
          { chave: 'colecao', titulo: 'Apontamentos por coleção', x: M + meia + gap, w: meia, linha: 1 },
          { chave: 'disciplina', titulo: 'Apontamentos por disciplina (10 mais frequentes)', x: M, w: largTotal, linha: 2 }
        ];
        const yLinha = [y, y + hLinha[0] + gap, y + hLinha[0] + hLinha[1] + 2 * gap];
        blocos.forEach((c, i) => {
          const yy = yLinha[c.linha]; const h = hLinha[c.linha];
          doc.setFillColor(...COR.branco); doc.setDrawColor(...COR.borda); doc.setLineWidth(0.25);
          doc.roundedRect(c.x, yy, c.w, h, 2.5, 2.5, 'FD');
          texto(c.titulo, c.x + 5, yy + 6.5, { tam: 9.5, estilo: 'bold', cor: COR.marinho });
          const legendaH = c.legenda ? 8 : 0;
          const iw = c.w - 2 * pad; const ih = h - tituloH - pad - legendaH;
          doc.addImage(imagemGrafico(cfg[c.chave], iw, ih), 'PNG', c.x + pad, yy + tituloH, iw, ih, `grafico-${i}`, 'FAST');
          if (c.legenda) {
            const itens = [[`Editorial: ${fmtNum(a.ed)} (${fmtPct(a.total ? (a.ed / a.total) * 100 : 0)})`, COR.azul], [`Diagramação: ${fmtNum(a.dg)} (${fmtPct(a.total ? (a.dg / a.total) * 100 : 0)})`, COR.diagramacao]];
            itens.forEach(([t, cor], k) => {
              const lx = c.x + 7 + k * (c.w / 2);
              doc.setFillColor(...cor); doc.circle(lx, yy + h - 5.2, 1.4, 'F');
              texto(t, lx + 3.2, yy + h - 4.1, { tam: 8.5 });
            });
          }
        });
      }
    }

    /* ----- 3. Tabela de apontamentos (sempre em página nova), em grupos por processo ----- */
    if (p.conteudo.has('tabela')) {
      const C = GGE.indicadores.CATEGORIAS;
      doc.addPage();
      const primeira = doc.getNumberOfPages();
      texto('Tabela de apontamentos', M, TOPO + 4, { tam: 17, estilo: 'bold', cor: COR.marinho });
      texto(`${fmtNum(a.total)} ${a.total === 1 ? 'apontamento' : 'apontamentos'} · do mais recente para o mais antigo em cada processo`, M, TOPO + 10, { tam: 8.5, cor: COR.suave });
      let y = TOPO + 18;

      // Um grupo por processo marcado no formulário. A separação usa a classificação normalizada
      // (processos()); um registro combinado aparece nos dois grupos — o total geral segue único.
      const ordenados = [...registros].sort((x, y2) => (y2._data?.getTime() ?? 0) - (x._data?.getTime() ?? 0));
      const grupos = [[C.EDITORIAL, COR.azul], [C.DIAGRAMACAO, COR.diagramacao]]
        .filter(([proc]) => p.processos.has(proc))
        .map(([proc, cor]) => ({ proc, cor, linhas: ordenados.filter((r) => processos(r).includes(proc)) }));

      // Subtítulo + cabeçalho + ao menos uma linha precisam caber; senão o grupo começa na página seguinte.
      const ESPACO_MIN_GRUPO = 34;
      grupos.forEach((g, i) => {
        if (i > 0 && y + ESPACO_MIN_GRUPO > BASE) { doc.addPage(); y = TOPO + 4; }
        doc.setFillColor(...g.cor); doc.roundedRect(M, y - 4.2, 1.6, 6, 0.8, 0.8, 'F');
        texto(g.proc, M + 4.5, y, { tam: 12.5, estilo: 'bold', cor: g.cor });
        texto(`${fmtNum(g.linhas.length)} ${g.linhas.length === 1 ? 'apontamento' : 'apontamentos'}`, W - M, y, { tam: 8.5, cor: COR.suave, alinhar: 'right' });
        y += 4;
        if (!g.linhas.length) {
          texto('Nenhum apontamento deste processo no recorte selecionado.', M, y + 5, { tam: 9, cor: COR.suave });
          y += 16;
          return;
        }
        doc.autoTable({
          startY: y,
          margin: { left: M, right: M, top: TOPO, bottom: H - BASE },
          head: [['Módulo', 'Ano Escolar', 'Disciplina', 'Coleção', 'Descrição do apontamento']],
          body: g.linhas.map((r) => [r.modulo, r.ano, r.disciplina, r.colecao, r.descricao || '—']),
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 2.2, bottom: 2.2, left: 2.4, right: 2.4 }, overflow: 'linebreak', valign: 'top', textColor: COR.texto, lineColor: COR.borda, lineWidth: 0.2 },
          headStyles: { fillColor: COR.marinho, textColor: 255, fontStyle: 'bold', fontSize: 8, valign: 'middle', lineColor: COR.marinho },
          bodyStyles: { fillColor: COR.branco },
          alternateRowStyles: { fillColor: COR.fundo },
          // Larguras fixas para os campos curtos; a descrição ocupa o restante (≈ 90 mm em A4).
          columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 20 }, 2: { cellWidth: 34 }, 3: { cellWidth: 18 }, 4: { cellWidth: 'auto' } },
          showHead: 'everyPage',
          rowPageBreak: 'avoid'
        });
        y = doc.lastAutoTable.finalY + 12;
      });
      for (let i = primeira; i <= doc.getNumberOfPages(); i++) internas.push(i);
    }

    /* ----- 4. Contracapa (sempre a última página) ----- */
    doc.addPage();
    doc.setFillColor(...COR.marinho); doc.rect(0, 0, W, H, 'F');
    opacidade(0.14); doc.setDrawColor(...COR.azul); doc.setLineWidth(0.8);
    doc.circle(W / 2, H / 2 - 18, 74, 'S'); doc.circle(W / 2, H / 2 - 18, 56, 'S');
    opacidade(1);
    doc.setFillColor(...COR.azul); doc.rect(0, H - 2.2, W, 2.2, 'F');
    placaLogo(W / 2, 92, 15, true);
    texto('SGGE-PCP', W / 2, 138, { tam: 11, estilo: 'bold', cor: COR.azulClaro, alinhar: 'center', espaco: 1.2 });
    texto('CONTROLE DE QUALIDADE EDITORIAL', W / 2, 150, { tam: 17, estilo: 'bold', cor: COR.branco, alinhar: 'center' });
    doc.setFillColor(...COR.azul); doc.rect(W / 2 - 12, 157, 24, 1.2, 'F');
    texto('“Qualidade editorial e melhoria contínua.”', W / 2, 170, { tam: 12.5, estilo: 'italic', cor: COR.capaTexto, alinhar: 'center' });
    texto('Sistema GGE de Ensino', W / 2, H - 30, { tam: 11, estilo: 'bold', cor: COR.branco, alinhar: 'center' });

    /* ----- Cabeçalho e rodapé discretos nas páginas internas ----- */
    const total = doc.getNumberOfPages();
    internas.forEach((n) => {
      doc.setPage(n);
      doc.setFillColor(...COR.azul); doc.rect(M, 11, 8, 1.1, 'F');
      texto('SGGE-PCP', M + 11, 12.4, { tam: 7.5, estilo: 'bold', cor: COR.marinho, espaco: 0.6 });
      // Posição calculada pela largura real de "SGGE-PCP" (inclui o espaçamento entre letras).
      const xSub = M + 11 + doc.getTextWidth('SGGE-PCP') + 0.6 * 'SGGE-PCP'.length + 3;
      texto('·  Controle de Qualidade Editorial', xSub, 12.4, { tam: 7.5, cor: COR.suave });
      texto(`${dataExtenso}`, W - M, 12.4, { tam: 7.5, cor: COR.suave, alinhar: 'right' });
      doc.setDrawColor(...COR.borda); doc.setLineWidth(0.25); doc.line(M, 16, W - M, 16);
      doc.line(M, H - 13, W - M, H - 13);
      texto('Relatório analítico de apontamentos · uso interno', M, H - 8, { tam: 7.5, cor: COR.suave });
      texto(`${n} / ${total}`, W - M, H - 8, { tam: 8, estilo: 'bold', cor: COR.marinho, alinhar: 'right' });
    });

    const iso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    return { doc, nome: `GGE_Relatorio_Qualidade_Editorial_${iso}.pdf`, paginas: total };
  }

  GGE.relatorios = { montar, parametros, filtrar, codigoModulo, codigoColecao, _montarPdf: montarPdf };
})(window.GGE = window.GGE || {});
