/**
 * Renderização: indicadores, gráficos (Chart.js), tabela, detalhe e relatórios.
 */
(function (GGE) {
  'use strict';

  /* ---------- Utilitários ---------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => n.toLocaleString('pt-BR');
  const fmtPct = (n) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const fmtData = (d) => (d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

  /** Aceita apenas URLs http(s) absolutas; qualquer outra coisa é bloqueada. */
  function urlSegura(valor) {
    const s = String(valor ?? '').trim();
    if (!s) return null;
    try {
      const u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch { return null; }
  }

  const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const icones = () => { if (window.lucide) window.lucide.createIcons(); };

  GGE.util = { esc, fmtNum, fmtPct, fmtData, urlSegura, semAcento, icones };

  const { CATEGORIAS } = GGE.indicadores;
  const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const corCategoria = () => ({
    [CATEGORIAS.EDITORIAL]: css('--cor-editorial'),
    [CATEGORIAS.DIAGRAMACAO]: css('--cor-diagramacao'),
    [CATEGORIAS.COMBINADO]: css('--cor-combinado'),
    [CATEGORIAS.NAO_CLASSIFICADO]: css('--cor-nao-classificado')
  });

  /* ---------- Gráficos ---------- */
  const graficos = new Map();

  function configGlobalChart() {
    Chart.defaults.font.family = css('--fonte');
    Chart.defaults.font.size = 12;
    Chart.defaults.color = css('--texto-suave');
    Chart.defaults.borderColor = css('--borda');
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = css('--tooltip');
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.maintainAspectRatio = false;
  }

  function desenhar(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const vazio = canvas.closest('.chart-box')?.querySelector('.chart-vazio');
    const semDados = !config.data.labels.length;
    canvas.style.display = semDados ? 'none' : '';
    if (vazio) vazio.hidden = !semDados;
    if (graficos.has(id)) { graficos.get(id).destroy(); graficos.delete(id); }
    if (!semDados) graficos.set(id, new Chart(canvas, config));
  }

  // Função (e não constante) para a grade acompanhar o tema ativo.
  const eixoInteiro = () => ({ beginAtZero: true, ticks: { precision: 0 }, grid: { color: css('--borda') } });

  function barras(id, { rotulos, valores }, { horizontal = false, cor = css('--primaria'), rotulo = 'Apontamentos', comRotulos = false } = {}) {
    desenhar(id, {
      type: 'bar',
      data: { labels: rotulos, datasets: [{ label: rotulo, data: valores, backgroundColor: cor, borderRadius: 6, maxBarThickness: 36 }] },
      plugins: comRotulos ? [rotulosValor] : [],
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        // Espaço reservado para os rótulos após a barra.
        layout: comRotulos ? { padding: horizontal ? { right: 30 } : { top: 20 } } : {},
        plugins: { legend: { display: false }, rotulosValor: { posicao: 'fim' } },
        scales: horizontal
          ? { x: eixoInteiro(), y: { grid: { display: false } } }
          : { y: eixoInteiro(), x: { grid: { display: false } } }
      }
    });
  }

  /** Texto claro ou escuro, conforme a luminância da cor de fundo (hex). */
  function corTextoSobre(fundo) {
    const h = String(fundo).replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return '#fff';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#0f172a' : '#fff'; // independe do tema: o fundo é a própria barra
  }

  /**
   * Rótulos de valor em barras, ativado só nos gráficos que o incluem em `plugins`.
   * Opções (options.plugins.rotulosValor): posicao 'fim' (após a barra) ou 'dentro' (no segmento).
   * Valores lidos do dataset atual; zeros e barras sem espaço ficam sem rótulo.
   */
  const rotulosValor = {
    id: 'rotulosValor',
    afterDatasetsDraw(chart, _args, opcoes) {
      const { ctx } = chart;
      const horizontal = chart.options.indexAxis === 'y';
      const dentro = opcoes.posicao === 'dentro';
      const tamanho = chart.width < 480 ? 11 : 12;
      ctx.save();
      ctx.font = `600 ${tamanho}px ${css('--fonte')}`;
      chart.data.datasets.forEach((ds, d) => {
        if (!chart.isDatasetVisible(d)) return;
        chart.getDatasetMeta(d).data.forEach((barra, i) => {
          const valor = Number(ds.data[i]);
          if (!valor) return;
          const texto = fmtNum(valor);
          const largTexto = ctx.measureText(texto).width;
          const { x, y, base, width, height } = barra.getProps(['x', 'y', 'base', 'width', 'height'], true);
          if (dentro) {
            const espaco = horizontal ? Math.abs(x - base) : Math.abs(base - y);
            const transversal = horizontal ? height : width;
            if (espaco < tamanho + 2 || transversal < largTexto + 4) return; // segmento pequeno demais
            ctx.fillStyle = corTextoSobre(Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(texto, horizontal ? (x + base) / 2 : x, horizontal ? y : (y + base) / 2);
          } else {
            if (!horizontal && width < largTexto * 0.6) return; // colunas finas demais em telas estreitas
            ctx.fillStyle = css('--texto');
            ctx.textAlign = horizontal ? 'left' : 'center';
            ctx.textBaseline = horizontal ? 'middle' : 'bottom';
            ctx.fillText(texto, horizontal ? x + 6 : x, horizontal ? y : y - 5);
          }
        });
      });
      ctx.restore();
    }
  };

  function colunasColecao(id, { rotulos, valores }) {
    desenhar(id, {
      type: 'bar',
      data: {
        labels: rotulos,
        datasets: [{
          label: 'Apontamentos', data: valores, backgroundColor: css('--primaria'),
          borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: 'bottom',
          categoryPercentage: 0.7, barPercentage: 0.8, maxBarThickness: 72
        }]
      },
      plugins: [rotulosValor],
      options: {
        animation: { duration: 600, easing: 'easeOutQuart' },
        layout: { padding: { top: 22 } }, // espaço para os valores acima das colunas
        plugins: { legend: { display: false }, rotulosValor: { posicao: 'fim' } },
        scales: {
          y: { ...eixoInteiro(), border: { display: false } },
          x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45 } }
        }
      }
    });
  }

  /** Percentual de cada ponto sobre o total do próprio gráfico; zeros sem rótulo. */
  const rotulosPercentuais = {
    id: 'rotulosPercentuais',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const dados = chart.data.datasets[0].data;
      const total = dados.reduce((s, n) => s + n, 0);
      if (!total) return;
      const fonte = chart.width < 420 ? 11 : 12;
      ctx.save();
      ctx.font = `600 ${fonte}px ${css('--fonte')}`;
      // Tom da cor do processo, um pouco mais escuro para o texto pequeno atingir contraste ≥ 4,5:1.
      ctx.fillStyle = escurecer(chart.data.datasets[0].borderColor, 0.82);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.getDatasetMeta(0).data.forEach((ponto, i) => {
        if (!dados[i]) return;
        const texto = fmtPct((dados[i] / total) * 100);
        const meia = ctx.measureText(texto).width / 2;
        const { x, y } = ponto.getProps(['x', 'y'], true);
        // Nas extremidades, mantém o texto dentro do canvas e sem invadir os números do eixo Y.
        const xTexto = Math.min(Math.max(x, chart.chartArea.left + meia + 2), chart.width - meia - 2);
        ctx.fillText(texto, xTexto, y - 9);
      });
      ctx.restore();
    }
  };

  /** Área por módulo: gradiente mais intenso junto à linha, transparente na base. */
  function areaModulos(id, dados, cor = css('--primaria')) {
    const vazio = !dados.valores.some((v) => v > 0);
    desenhar(id, {
      type: 'line',
      data: {
        labels: vazio ? [] : dados.rotulos,
        datasets: [{
          label: 'Apontamentos', data: dados.valores, borderColor: cor, borderWidth: 2.5, fill: 'origin',
          cubicInterpolationMode: 'monotone',
          pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: css('--superficie'), pointBorderColor: cor, pointBorderWidth: 2,
          backgroundColor: (ctx) => {
            const area = ctx.chart.chartArea;
            if (!area) return 'transparent';
            const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, comAlfa(cor, 0.35));
            g.addColorStop(0.6, comAlfa(cor, 0.12));
            g.addColorStop(1, comAlfa(cor, 0));
            return g;
          }
        }]
      },
      plugins: [rotulosPercentuais],
      options: {
        animation: { duration: 400 },
        layout: { padding: { top: 22, right: 8 } }, // espaço para o percentual acima do ponto mais alto
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: (it) => `Módulo ${it[0].label}`,
              label: (c) => `${fmtNum(c.parsed.y)} ${c.parsed.y === 1 ? 'apontamento' : 'apontamentos'}`
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: css('--borda') }, border: { display: false } },
          // Com um único módulo, o ponto fica centralizado em vez de colado ao eixo Y.
          x: { grid: { display: false }, offset: dados.rotulos.length === 1 }
        }
      }
    });
  }

  const ROSCA_HOVER_OFFSET = 14;

  /**
   * Rótulos externos "quantidade (percentual)" com linha conectora na cor da fatia.
   * A posição do texto não depende do hover; só o início da linha acompanha a fatia.
   */
  const rotulosExternos = {
    id: 'rotulosExternos',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const ds = chart.data.datasets[0];
      const meta = chart.getDatasetMeta(0);
      const total = ds.data.reduce((s, n) => s + n, 0);
      if (!total) return;
      const fonte = chart.width < 340 ? 11 : 12;
      const altura = fonte + 6;
      ctx.save();
      ctx.font = `600 ${fonte}px ${css('--fonte')}`;

      // 1) Calcula a posição ideal de cada rótulo.
      const itens = [];
      meta.data.forEach((arco, i) => {
        const valor = ds.data[i];
        if (!valor || !chart.getDataVisibility(i)) return;
        const { x: cx, y: cy, startAngle, endAngle, outerRadius } = arco.getProps(['x', 'y', 'startAngle', 'endAngle', 'outerRadius'], true);
        const ang = (startAngle + endAngle) / 2;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const desloc = arco.options.offset || 0;
        const direita = cos >= 0;
        const raioCotovelo = outerRadius + ROSCA_HOVER_OFFSET + 4;
        itens.push({
          cor: Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor,
          texto: `${fmtNum(valor)} (${fmtPct((valor / total) * 100)})`,
          direita,
          inicio: { x: cx + cos * (outerRadius + desloc + 2), y: cy + sin * (outerRadius + desloc + 2) },
          cotovelo: { x: cx + cos * raioCotovelo, y: cy + sin * raioCotovelo },
          y: cy + sin * raioCotovelo
        });
      });

      // 2) Evita sobreposição em cada lado e mantém dentro da área do gráfico.
      [true, false].forEach((lado) => {
        const grupo = itens.filter((it) => it.direita === lado).sort((a, b) => a.y - b.y);
        grupo.forEach((it, k) => {
          const minimo = k ? grupo[k - 1].y + altura : chartArea.top + altura / 2;
          it.y = Math.max(it.y, minimo);
        });
        for (let k = grupo.length - 1; k >= 0; k--) {
          const maximo = k < grupo.length - 1 ? grupo[k + 1].y - altura : chartArea.bottom - altura / 2;
          grupo[k].y = Math.min(grupo[k].y, maximo);
        }
      });

      // 3) Desenha linha (fatia → cotovelo → trecho horizontal) e texto.
      itens.forEach((it) => {
        const largura = ctx.measureText(it.texto).width;
        const xFim = it.cotovelo.x + (it.direita ? 10 : -10);
        const xTexto = xFim + (it.direita ? 4 : -4);
        // Sem espaço lateral (telas muito estreitas): omite o rótulo; o tooltip continua disponível.
        if (it.direita ? xTexto + largura > chart.width - 2 : xTexto - largura < 2) return;
        ctx.strokeStyle = it.cor;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(it.inicio.x, it.inicio.y);
        ctx.lineTo(it.cotovelo.x, it.y);
        ctx.lineTo(xFim, it.y);
        ctx.stroke();
        ctx.fillStyle = css('--texto');
        ctx.textAlign = it.direita ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.texto, xTexto, it.y);
      });
      ctx.restore();
    }
  };

  function rosca(id, kpis) {
    const cores = corCategoria();
    const itens = [
      [CATEGORIAS.EDITORIAL, kpis.editorial], [CATEGORIAS.DIAGRAMACAO, kpis.diagramacao],
      [CATEGORIAS.COMBINADO, kpis.combinado], [CATEGORIAS.NAO_CLASSIFICADO, kpis.naoClassificado]
    ].filter(([, n]) => n > 0);
    desenhar(id, {
      type: 'doughnut',
      data: {
        labels: itens.map((i) => i[0]),
        datasets: [{
          data: itens.map((i) => i[1]), backgroundColor: itens.map((i) => cores[i[0]]), borderWidth: 2, borderColor: css('--superficie'),
          // Hover: a fatia avança para fora do centro, com borda branca mais espessa.
          hoverOffset: ROSCA_HOVER_OFFSET, hoverBorderWidth: 3, hoverBorderColor: css('--superficie')
        }]
      },
      plugins: [rotulosExternos],
      options: {
        cutout: '65%',
        // Raio reduzido abre espaço lateral para os rótulos externos sem estreitar a legenda;
        // o padding vertical acomoda o avanço da fatia no hover.
        radius: '74%',
        layout: { padding: { top: 14, bottom: 4 } },
        transitions: { active: { animation: { duration: 240, easing: 'easeOutCubic' } } },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtNum(c.parsed)} (${fmtPct((c.parsed / kpis.total) * 100)})` } }
        }
      }
    });
  }

  function empilhado(id, cruz) {
    const cores = corCategoria();
    desenhar(id, {
      type: 'bar',
      data: {
        labels: cruz.rotulos,
        datasets: cruz.series
          .filter((s) => s.valores.some((v) => v > 0))
          .map((s) => ({ label: s.categoria, data: s.valores, backgroundColor: cores[s.categoria], borderRadius: 4, maxBarThickness: 36 }))
      },
      plugins: [rotulosValor],
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false }, rotulosValor: { posicao: 'dentro' } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { ...eixoInteiro(), stacked: true } }
      }
    });
  }

  /* ---------- Indicadores ---------- */
  // Ícones PNG da pasta assets; nomes com "%" e acentos vão codificados na URL.
  const ICONES_PNG = {
    editorial: `assets/${encodeURIComponent('editorial.png')}`,
    diagramacao: `assets/${encodeURIComponent('diagramação.png')}`,
    percentual: `assets/${encodeURIComponent('%.png')}`
  };

  function card({ icone, imagem, rotulo, valor, detalhe = '', variante = '' }) {
    return `<article class="kpi ${variante}">
      <div class="kpi-icone">${imagem
        ? `<img class="kpi-icone-img" src="${esc(imagem)}" alt="" width="22" height="22">`
        : `<i data-lucide="${icone}"></i>`}</div>
      <div class="kpi-corpo">
        <span class="kpi-rotulo">${esc(rotulo)}</span>
        <strong class="kpi-valor">${esc(valor)}</strong>
        ${detalhe ? `<span class="kpi-detalhe">${esc(detalhe)}</span>` : ''}
      </div>
    </article>`;
  }

  /* ---------- Cards com minigráfico (Visão Geral) ---------- */
  let aoVerDetalhes = () => {};

  /** Escurece uma cor hexadecimal (#rrggbb) mantendo `fator` da cor original (0–1). */
  function escurecer(cor, fator) {
    const h = String(cor).replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return cor;
    return '#' + [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * fator).toString(16).padStart(2, '0')).join('');
  }

  /** Aplica transparência a uma cor hexadecimal (#rgb ou #rrggbb). */
  function comAlfa(cor, alfa) {
    let h = cor.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return cor;
    return `#${h}${Math.round(alfa * 255).toString(16).padStart(2, '0')}`;
  }

  function minigrafico(id, serie, valores, cor) {
    desenhar(id, {
      type: 'line',
      data: {
        labels: serie.rotulos,
        datasets: [{
          // Monotônica: suave, sem ultrapassar os valores reais entre os pontos.
          data: valores, borderColor: cor, borderWidth: 2, cubicInterpolationMode: 'monotone', fill: true,
          // Com um ou dois módulos, marcadores discretos indicam os valores reais.
          pointRadius: valores.length <= 2 ? 3 : 0, pointHoverRadius: 4, pointBackgroundColor: cor,
          backgroundColor: (ctx) => {
            const area = ctx.chart.chartArea;
            if (!area) return 'transparent';
            const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, comAlfa(cor, 0.22));
            g.addColorStop(1, comAlfa(cor, 0));
            return g;
          }
        }]
      },
      options: {
        animation: false,
        layout: { padding: { top: 4, bottom: 2, left: 2, right: 2 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (c) => `${fmtNum(c.parsed.y)} ${c.parsed.y === 1 ? 'apontamento' : 'apontamentos'}` }
          }
        },
        // Eixo Y começa em zero para não exagerar variações pequenas.
        // Com um único módulo, o marcador fica centralizado em vez de colado à borda.
        scales: { x: { display: false, offset: valores.length === 1 }, y: { display: false, beginAtZero: true, suggestedMax: 1 } }
      }
    });
  }

  function cardTendencia({ id, titulo, icone, valor, pct, sub, cor, acao, serie }) {
    const vazio = !valor || !serie.rotulos.length ? 'Sem apontamentos nos filtros atuais' : '';
    return `<article class="kpi-card" style="--kpi-cor:${esc(cor)}">
      <header class="kpi-card-topo">
        <span class="kpi-card-titulo">${esc(titulo)}</span>
      </header>
      <div class="kpi-card-numeros">
        <span class="kpi-card-icone"><i data-lucide="${icone}"></i></span>
        <strong class="kpi-card-valor">${fmtNum(valor)}</strong>
        <span class="kpi-card-pct">${esc(pct)}</span>
      </div>
      <p class="kpi-card-sub">${esc(sub)}</p>
      <div class="kpi-card-spark">
        ${vazio ? `<p class="kpi-card-vazio">${esc(vazio)}</p>` : `<canvas id="${id}" aria-label="${esc(titulo)} por módulo" role="img"></canvas>`}
      </div>
      <footer class="kpi-card-rodape">
        <button type="button" class="kpi-card-acao" data-acao="${esc(acao)}">Ver apontamentos<i data-lucide="arrow-right"></i></button>
      </footer>
    </article>`;
  }

  function renderCardsGerais(registros, k) {
    const { CATEGORIAS: C } = GGE.indicadores;
    const ehOutra = (r) => r._categoria !== C.EDITORIAL && r._categoria !== C.DIAGRAMACAO;
    // Mesma regra do gráfico principal: só módulos com registros na classificação do card,
    // na ordem M1 → ANUAL → M2 → M3 → M4.
    const porModulo = (filtro) => GGE.indicadores.modulosPresentes(filtro ? registros.filter(filtro) : registros);
    const series = [porModulo(), porModulo((r) => r._categoria === C.EDITORIAL), porModulo((r) => r._categoria === C.DIAGRAMACAO), porModulo(ehOutra)];
    const outras = k.combinado + k.naoClassificado;
    const pctDe = (n) => `${fmtPct(k.total ? (n / k.total) * 100 : 0)} do total`;
    const partesOutras = [];
    if (k.combinado) partesOutras.push(`${fmtNum(k.combinado)} combinados`);
    if (k.naoClassificado) partesOutras.push(`${fmtNum(k.naoClassificado)} não classificados`);

    const cards = [
      { id: 'spark-total', titulo: 'Total de apontamentos', icone: 'triangle-alert', valor: k.total, pct: k.total ? '100% dos apontamentos' : '—',
        sub: 'Apontamentos registrados pela Arte e Finalização', cor: css('--primaria'), acao: 'total', serie: series[0] },
      { id: 'spark-editorial', titulo: 'Apontamentos editoriais', icone: 'pen-line', valor: k.editorial, pct: pctDe(k.editorial),
        sub: 'Ocorrências identificadas no processo editorial.', cor: css('--cor-editorial'), acao: C.EDITORIAL, serie: series[1] },
      { id: 'spark-diagramacao', titulo: 'Apontamentos de diagramação', icone: 'layout-template', valor: k.diagramacao, pct: pctDe(k.diagramacao),
        sub: 'Ocorrências identificadas na etapa de diagramação.', cor: css('--cor-diagramacao'), acao: C.DIAGRAMACAO, serie: series[2] }
    ];
    if (outras) {
      cards.push({ id: 'spark-outras', titulo: 'Outras classificações', icone: 'shapes', valor: outras, pct: pctDe(outras),
        sub: partesOutras.join(' · '), cor: css('--cor-combinado'), acao: GGE.filtros.OUTRAS, serie: series[3] });
    }

    const box = document.getElementById('kpis-geral');
    box.classList.toggle('kpis-cards-4', cards.length === 4);
    box.innerHTML = cards.map((c) => cardTendencia(c)).join('');
    cards.forEach((c) => {
      if (document.getElementById(c.id)) minigrafico(c.id, c.serie, c.serie.valores, c.cor);
      else if (graficos.has(c.id)) { graficos.get(c.id).destroy(); graficos.delete(c.id); }
    });
    if (!outras && graficos.has('spark-outras')) { graficos.get('spark-outras').destroy(); graficos.delete('spark-outras'); }
  }

  function ligarCards(callback) {
    aoVerDetalhes = callback;
    document.getElementById('kpis-geral').addEventListener('click', (e) => {
      const btn = e.target.closest('.kpi-card-acao');
      if (btn) aoVerDetalhes(btn.dataset.acao);
    });
  }

  function renderVisaoGeral(registros) {
    const k = GGE.indicadores.calcularKpis(registros);
    renderCardsGerais(registros, k);

    const I = GGE.indicadores;
    rosca('ch-tipo', k);
    areaModulos('ch-area-modulo', I.modulosPresentes(registros));
    barras('ch-disciplinas', I.agrupar(registros, 'disciplina', { porValor: true, limite: 10 }), { horizontal: true, comRotulos: true });
    barras('ch-ano', I.agrupar(registros, 'ano'), { comRotulos: true });
    const porColecao = I.agrupar(registros, 'colecao', { porValor: true });
    document.getElementById('total-colecao').textContent = fmtNum(porColecao.valores.reduce((s, n) => s + n, 0));
    colunasColecao('ch-colecao', porColecao);
    empilhado('ch-disc-cat', I.cruzarPorCategoria(registros, 'disciplina', { porTotal: true }));
    renderTabela('geral', registros);
  }

  /**
   * Seções Editorial / Diagramação (mesma estrutura nas duas).
   * Registros do processo: a categoria da página + os combinados (Editorial + Diagramação),
   * cada linha contada uma única vez.
   * Participação no total: denominador = todos os registros após os filtros globais,
   * inclusive um filtro de Tipo explícito (nesse caso a participação reflete essa seleção).
   */
  function renderAnalise(prefixo, registros, categoria) {
    const I = GGE.indicadores;
    const doTipo = registros.filter((r) => r._categoria === categoria || r._categoria === CATEGORIAS.COMBINADO);
    const cor = corCategoria()[categoria];
    const editorial = categoria === CATEGORIAS.EDITORIAL;
    const variante = editorial ? 'kpi-editorial' : 'kpi-diagramacao';

    document.getElementById(`kpis-${prefixo}`).innerHTML = [
      card({ imagem: editorial ? ICONES_PNG.editorial : ICONES_PNG.diagramacao, rotulo: editorial ? 'Apontamentos Editorial' : 'Apontamentos de Diagramação', valor: fmtNum(doTipo.length), variante }),
      card({ imagem: ICONES_PNG.percentual, rotulo: 'Participação no total', valor: fmtPct(registros.length ? (doTipo.length / registros.length) * 100 : 0), detalhe: `de ${fmtNum(registros.length)} apontamentos`, variante })
    ].join('');

    areaModulos(`ch-${prefixo}-area-modulo`, I.modulosPresentes(doTipo), cor);
    barras(`ch-${prefixo}-disciplina`, I.agrupar(doTipo, 'disciplina', { porValor: true, limite: 10 }), { horizontal: true, cor, comRotulos: true });
    barras(`ch-${prefixo}-modulo`, I.agrupar(doTipo, 'modulo'), { cor, comRotulos: true });
    barras(`ch-${prefixo}-ano`, I.agrupar(doTipo, 'ano'), { cor, comRotulos: true });
    barras(`ch-${prefixo}-colecao`, I.agrupar(doTipo, 'colecao', { porValor: true }), { horizontal: true, cor, comRotulos: true });
    renderTabela(prefixo, doTipo);
  }

  /* ---------- Tabela de ocorrências ---------- */
  // ID, Data/Hora e Registrado por ficam só no detalhe (ícone de olho); a busca ainda considera o ID
  // e a ordem padrão continua sendo a data mais recente.
  const COLUNAS_TABELA = [
    { chave: 'modulo', rotulo: 'Módulo' },
    { chave: 'ano', rotulo: 'Ano Escolar' },
    { chave: 'disciplina', rotulo: 'Disciplina' },
    { chave: 'colecao', rotulo: 'Coleção' },
    { chave: 'tipo', rotulo: 'Tipo de apontamento' },
    { chave: 'descricao', rotulo: 'Descrição do apontamento' },
    { chave: 'evidencia', rotulo: 'Evidência', semOrdem: true }
  ];

  // Uma instância por contêiner [data-tabela]; cada uma guarda sua busca, ordem e página.
  const tabelas = new Map();
  let porUid = new Map();

  function classeCategoria(cat) {
    return {
      [CATEGORIAS.EDITORIAL]: 'tag-editorial', [CATEGORIAS.DIAGRAMACAO]: 'tag-diagramacao',
      [CATEGORIAS.COMBINADO]: 'tag-combinado', [CATEGORIAS.NAO_CLASSIFICADO]: 'tag-nao'
    }[cat];
  }

  function linkEvidencia(valor, comTexto = false) {
    const url = urlSegura(valor);
    if (url) {
      return `<a class="link-evidencia" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Abrir evidência em nova aba">
        <i data-lucide="external-link"></i>${comTexto ? ' Abrir evidência' : ''}</a>`;
    }
    if (String(valor ?? '').trim()) return '<span class="tag tag-nao" title="Endereço inválido ou inseguro">Link bloqueado</span>';
    return '<span class="texto-suave">—</span>';
  }

  /** Monta a estrutura (título opcional, busca, tabela, paginação) e liga os eventos do contêiner. */
  function criarTabela(raiz) {
    const titulo = raiz.dataset.titulo;
    const tabela = {
      raiz, busca: '', ordem: '_data', direcao: 'desc', pagina: 1, tamanho: 15, dados: [], assinatura: '',
      compacta: raiz.hasAttribute('data-compacta')
    };
    tabela.colunas = COLUNAS_TABELA;
    raiz.innerHTML = `
      ${titulo ? `<header class="tabela-titulo"><h2>${esc(titulo)}</h2></header>` : ''}
      <div class="tabela-ferramentas">
        <label class="busca"><i data-lucide="search"></i><input type="search" class="js-busca" placeholder="Pesquisar por ID, disciplina, descrição…" aria-label="Pesquisar ${esc(titulo || 'ocorrências')}"></label>
        <label class="campo-inline">Linhas por página
          <select class="js-tamanho"><option>10</option><option selected>15</option><option>25</option><option>50</option><option>100</option></select>
        </label>
      </div>
      <div class="tabela-wrap">
        <table class="tabela${tabela.compacta ? ' tabela-compacta' : ''}"><thead><tr>${tabela.colunas.map((c) => (c.semOrdem
          ? `<th>${c.rotulo}</th>`
          : `<th><button type="button" class="th-ordenar" data-col="${c.chave}">${c.rotulo}<i data-lucide="chevrons-up-down"></i></button></th>`)).join('')}<th></th></tr></thead><tbody></tbody></table>
      </div>
      <div class="tabela-rodape">
        <span class="js-info"></span>
        <nav class="paginacao js-paginacao" aria-label="Paginação"></nav>
      </div>`;

    raiz.querySelector('thead').addEventListener('click', (e) => {
      const btn = e.target.closest('.th-ordenar');
      if (!btn) return;
      const col = btn.dataset.col;
      tabela.direcao = tabela.ordem === col && tabela.direcao === 'asc' ? 'desc' : 'asc';
      tabela.ordem = col;
      tabela.pagina = 1;
      desenharTabela(tabela);
    });
    let t;
    raiz.querySelector('.js-busca').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { tabela.busca = e.target.value; tabela.pagina = 1; desenharTabela(tabela); }, 200);
    });
    raiz.querySelector('.js-tamanho').addEventListener('change', (e) => {
      tabela.tamanho = +e.target.value; tabela.pagina = 1; desenharTabela(tabela);
    });
    raiz.querySelector('.js-paginacao').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-pagina]');
      if (!btn || btn.disabled) return;
      tabela.pagina = +btn.dataset.pagina; desenharTabela(tabela);
    });
    raiz.querySelector('tbody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-detalhe]');
      if (btn) abrirDetalhe(+btn.dataset.detalhe);
    });
    tabelas.set(raiz.dataset.tabela, tabela);
  }

  function montarTabela() {
    document.querySelectorAll('[data-tabela]').forEach(criarTabela);
  }

  /**
   * Atualiza os registros de uma tabela. A página volta para 1 só quando o conjunto muda
   * (filtros); ao apenas alternar de seção, busca, ordem e página são mantidas.
   */
  function renderTabela(nome, registros) {
    const tabela = tabelas.get(nome);
    if (!tabela) return;
    const assinatura = registros.map((r) => r._uid).join(',');
    if (assinatura !== tabela.assinatura) {
      tabela.assinatura = assinatura;
      tabela.pagina = 1;
    }
    tabela.dados = registros;
    desenharTabela(tabela);
  }

  function desenharTabela(tabela) {
    const { raiz } = tabela;
    const termo = GGE.util.semAcento(tabela.busca);
    let linhas = tabela.dados;
    if (termo) {
      linhas = linhas.filter((r) => GGE.util.semAcento(
        [r.id, fmtData(r._data), r.modulo, r.ano, r.disciplina, r.colecao, r.tipo, r._categoria, r.descricao, r.registradoPor].join(' ')
      ).includes(termo));
    }
    const { ordem, direcao } = tabela;
    const fator = direcao === 'asc' ? 1 : -1;
    linhas = [...linhas].sort((a, b) => {
      if (ordem === '_data') return ((a._data?.getTime() ?? -Infinity) - (b._data?.getTime() ?? -Infinity)) * fator;
      return GGE.indicadores.ordenarRotulos(String(a[ordem] ?? ''), String(b[ordem] ?? '')) * fator;
    });

    const total = linhas.length;
    const paginas = Math.max(1, Math.ceil(total / tabela.tamanho));
    tabela.pagina = Math.min(tabela.pagina, paginas);
    const inicio = (tabela.pagina - 1) * tabela.tamanho;
    const pagina = linhas.slice(inicio, inicio + tabela.tamanho);

    raiz.querySelectorAll('.th-ordenar').forEach((b) => {
      const ativo = b.dataset.col === ordem;
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-sort', ativo ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none');
      b.querySelector('svg, i')?.remove();
      const icone = document.createElement('i');
      icone.setAttribute('data-lucide', ativo ? (direcao === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevrons-up-down');
      b.appendChild(icone);
    });

    raiz.querySelector('tbody').innerHTML = pagina.length
      ? pagina.map((r) => `<tr>
          <td class="nowrap">${esc(r.modulo)}</td>
          <td class="nowrap">${esc(r.ano)}</td>
          <td class="disciplina">${esc(r.disciplina)}</td>
          <td>${esc(r.colecao)}</td>
          <td><span class="tag ${classeCategoria(r._categoria)}" title="Categoria: ${esc(r._categoria)}">${esc(r.tipo.trim() || '(vazio)')}</span></td>
          <td class="descricao">${tabela.compacta
            ? `<span class="truncado" title="${esc(r.descricao)}">${esc(r.descricao)}</span>`
            : esc(r.descricao)}</td>
          <td class="centro">${linkEvidencia(r.evidencia)}</td>
          <td><button type="button" class="btn-icone" data-detalhe="${r._uid}" aria-label="Ver detalhes de ${esc(r.id)}"><i data-lucide="eye"></i></button></td>
        </tr>`).join('')
      : `<tr><td colspan="${tabela.colunas.length + 1}" class="vazio">Nenhuma ocorrência encontrada.</td></tr>`;

    raiz.querySelector('.js-info').textContent = total
      ? `Exibindo ${fmtNum(inicio + 1)}–${fmtNum(inicio + pagina.length)} de ${fmtNum(total)} ocorrências`
      : '0 ocorrências';

    // Paginação compacta: primeira, última e vizinhas da atual.
    const p = tabela.pagina;
    const nums = [...new Set([1, p - 1, p, p + 1, paginas])].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b);
    let html = `<button type="button" data-pagina="${p - 1}" ${p === 1 ? 'disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>`;
    nums.forEach((n, i) => {
      if (i && n - nums[i - 1] > 1) html += '<span class="reticencias">…</span>';
      html += `<button type="button" data-pagina="${n}" class="${n === p ? 'ativo' : ''}" ${n === p ? 'aria-current="page"' : ''}>${n}</button>`;
    });
    html += `<button type="button" data-pagina="${p + 1}" ${p === paginas ? 'disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button>`;
    raiz.querySelector('.js-paginacao').innerHTML = html;

    GGE.util.icones();
  }

  /* ---------- Detalhe ---------- */
  function abrirDetalhe(uid) {
    const r = porUid.get(uid);
    if (!r) return;
    const campos = [
      ['ID', esc(r.id || '(sem ID)') + (r._idDuplicado ? ' <span class="tag tag-alerta">ID duplicado na base</span>' : '')],
      ['Data/Hora', r._data ? esc(fmtData(r._data)) : `<span class="tag tag-alerta">Data inválida: ${esc(r.dataHora)}</span>`],
      ['Módulo', esc(r.modulo)],
      ['Ano Escolar', esc(r.ano)],
      ['Disciplina', esc(r.disciplina)],
      ['Coleção', esc(r.colecao)],
      ['Tipo de apontamento (valor original)', esc(r.tipo.trim() || '(vazio)')],
      ['Classificação normalizada', `<span class="tag ${classeCategoria(r._categoria)}">${esc(r._categoria)}</span>`],
      ['Registrado por', esc(r.registradoPor)],
      ['Planilha de Origem', esc(r.planilhaOrigem)],
      ['Célula de Origem', esc(r.celulaOrigem)],
      ['Linha de Origem', esc(r.linhaOrigem)]
    ];
    if (r._linhaPlanilha !== undefined && r._linhaPlanilha !== '') campos.push(['Linha na BASE_ERROS', esc(r._linhaPlanilha)]);
    if (r.status) campos.push(['Status (controle da planilha)', `${esc(r.status)} <span class="texto-suave">— não usado nos indicadores</span>`]);
    document.getElementById('detalhe-titulo').textContent = `Ocorrência ${r.id || '(sem ID)'}`;
    document.getElementById('detalhe-corpo').innerHTML = `
      <div class="detalhe-descricao"><span>Descrição do apontamento</span><p>${esc(r.descricao) || '—'}</p></div>
      <dl class="detalhe-grid">${campos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="detalhe-evidencia">${linkEvidencia(r.evidencia, true)}</div>`;
    const dlg = document.getElementById('detalhe');
    dlg.showModal();
    GGE.util.icones();
  }

  /* ---------- Qualidade da base (aviso no topo do conteúdo) ---------- */
  function renderQualidade(inc, totalBase) {
    const itens = [];
    if (inc.divergenciaTotal) {
      itens.push(`<li><b>Total divergente:</b> a API informou ${fmtNum(inc.divergenciaTotal.api)} ocorrências, mas ${fmtNum(inc.divergenciaTotal.recebidos)} registros foram recebidos.</li>`);
    }
    if (inc.idsDuplicados.length) {
      itens.push(`<li><b>${fmtNum(inc.idsDuplicados.length)} ID(s) duplicado(s):</b> ${inc.idsDuplicados.map((d) => `${esc(d.id)} (${d.ocorrencias}×)`).join(', ')}. As linhas foram mantidas como ocorrências distintas.</li>`);
    }
    if (inc.semId) itens.push(`<li><b>${fmtNum(inc.semId)} registro(s) sem ID.</b></li>`);
    if (inc.datasInvalidas.length) {
      itens.push(`<li><b>${fmtNum(inc.datasInvalidas.length)} data(s) inválida(s):</b> ${inc.datasInvalidas.slice(0, 10).map((d) => `${esc(d.id)} (“${esc(d.valor)}”)`).join(', ')}. Esses registros contam nos totais.</li>`);
    }
    if (inc.tiposNaoReconhecidos.length) {
      const valores = [...new Set(inc.tiposNaoReconhecidos.map((t) => String(t.valor).trim() || '(vazio)'))];
      itens.push(`<li><b>${fmtNum(inc.tiposNaoReconhecidos.length)} registro(s) com tipo de apontamento não reconhecido</b> (${valores.map(esc).join(', ')}). Contabilizados como “Não classificado”.</li>`);
    }
    // Os detalhes ficam no próprio aviso (antes ficavam no relatório consolidado, removido).
    const alerta = document.getElementById('alerta-qualidade');
    const lista = document.getElementById('alerta-detalhes');
    alerta.hidden = !itens.length;
    if (itens.length) {
      alerta.querySelector('span').textContent = `${itens.length} tipo(s) de inconsistência encontrados na base (${fmtNum(totalBase)} registros).`;
      lista.innerHTML = itens.join('');
    }
  }

  function indexar(registros) { porUid = new Map(registros.map((r) => [r._uid, r])); }

  function redimensionar() { graficos.forEach((g) => g.resize()); }

  GGE.dashboard = {
    configGlobalChart, montarTabela, indexar, redimensionar, ligarCards,
    renderVisaoGeral, renderAnalise, renderQualidade
  };
})(window.GGE = window.GGE || {});
