/**
 * Regras de negócio: normalização, validação e cálculos.
 * O campo Status nunca é usado aqui.
 */
(function (GGE) {
  'use strict';

  const CATEGORIAS = {
    EDITORIAL: 'Editorial',
    DIAGRAMACAO: 'Diagramação',
    COMBINADO: 'Editorial + Diagramação',
    NAO_CLASSIFICADO: 'Não classificado'
  };

  const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  /** Classifica o Tipo de Erro sem alterar o valor original. */
  function normalizarTipo(valor) {
    const t = semAcento(valor);
    const editorial = /\beditorial\b/.test(t);
    const diagramacao = /\bdiagrama(cao|do|r)?\b/.test(t);
    if (editorial && diagramacao) return CATEGORIAS.COMBINADO;
    if (editorial) return CATEGORIAS.EDITORIAL;
    if (diagramacao) return CATEGORIAS.DIAGRAMACAO;
    return CATEGORIAS.NAO_CLASSIFICADO;
  }

  /** Usa o array classificacoes da API quando existir; senão, o Tipo de Erro bruto. */
  function categorizar(registro) {
    const lista = Array.isArray(registro.classificacoes) ? registro.classificacoes : [];
    if (!lista.length) return normalizarTipo(registro.tipo);
    const cats = new Set(lista.map(normalizarTipo));
    const ed = cats.has(CATEGORIAS.EDITORIAL) || cats.has(CATEGORIAS.COMBINADO);
    const dg = cats.has(CATEGORIAS.DIAGRAMACAO) || cats.has(CATEGORIAS.COMBINADO);
    if (ed && dg) return CATEGORIAS.COMBINADO;
    if (ed) return CATEGORIAS.EDITORIAL;
    if (dg) return CATEGORIAS.DIAGRAMACAO;
    return CATEGORIAS.NAO_CLASSIFICADO;
  }

  /** Interpreta "dd/mm/aaaa [hh:mm[:ss]]"; aceita também Date e ISO (vindos da API). */
  function parseDataBR(valor) {
    if (valor instanceof Date) return isNaN(valor) ? null : valor;
    const s = String(valor ?? '').trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const [, d, mo, a, h = 0, mi = 0, se = 0] = m.map((x) => (x === undefined ? undefined : x));
      const data = new Date(+a, +mo - 1, +d, +h, +mi, +se);
      // Rejeita datas inexistentes (ex.: 31/02).
      if (data.getFullYear() !== +a || data.getMonth() !== +mo - 1 || data.getDate() !== +d) return null;
      return data;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const data = new Date(s);
      return isNaN(data) ? null : data;
    }
    return null;
  }

  /** Enriquece os registros e levanta inconsistências da base. */
  function prepararRegistros(registros) {
    const contagemIds = new Map();
    registros.forEach((r) => {
      const id = String(r.id ?? '').trim();
      contagemIds.set(id, (contagemIds.get(id) || 0) + 1);
    });

    const inconsistencias = { idsDuplicados: [], semId: 0, datasInvalidas: [], tiposNaoReconhecidos: [] };
    contagemIds.forEach((n, id) => {
      if (id && n > 1) inconsistencias.idsDuplicados.push({ id, ocorrencias: n });
    });

    const preparados = registros.map((r, i) => {
      const id = String(r.id ?? '').trim();
      const data = parseDataBR(r.dataHora);
      const categoria = categorizar(r);
      if (!id) inconsistencias.semId++;
      if (!data) inconsistencias.datasInvalidas.push({ id: id || '(sem ID)', valor: r.dataHora });
      if (categoria === CATEGORIAS.NAO_CLASSIFICADO) {
        inconsistencias.tiposNaoReconhecidos.push({ id: id || '(sem ID)', valor: r.tipo });
      }
      const texto = (v, padrao) => String(v ?? '').trim() || padrao;
      return {
        ...r,
        _uid: i,
        id,
        _data: data,
        _categoria: categoria,
        _idDuplicado: contagemIds.get(id) > 1,
        modulo: texto(r.modulo, '(não informado)'),
        ano: texto(r.ano, '(não informado)'),
        disciplina: texto(r.disciplina, '(não informado)'),
        colecao: texto(r.colecao, '(não informado)'),
        tipo: String(r.tipo ?? '')
      };
    });

    return { registros: preparados, inconsistencias };
  }

  /** Indicadores principais. Cada linha conta uma única vez. */
  function calcularKpis(registros) {
    const total = registros.length;
    const cont = contarPor(registros, (r) => r._categoria);
    const get = (c) => cont.get(c) || 0;
    const editorial = get(CATEGORIAS.EDITORIAL);
    const diagramacao = get(CATEGORIAS.DIAGRAMACAO);
    const combinado = get(CATEGORIAS.COMBINADO);
    const naoClassificado = get(CATEGORIAS.NAO_CLASSIFICADO);
    const pct = (n) => (total ? (n / total) * 100 : 0);
    return {
      total, editorial, diagramacao, combinado, naoClassificado,
      pctEditorial: pct(editorial),
      pctDiagramacao: pct(diagramacao),
      pctCombinado: pct(combinado),
      pctNaoClassificado: pct(naoClassificado)
    };
  }

  function contarPor(registros, chaveFn) {
    const mapa = new Map();
    registros.forEach((r) => {
      const k = chaveFn(r);
      mapa.set(k, (mapa.get(k) || 0) + 1);
    });
    return mapa;
  }

  const coll = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  const ordenarRotulos = (a, b) => coll.compare(a, b);

  /** Contagem por campo, ordenada por rótulo ou por valor. */
  function agrupar(registros, campo, { porValor = false, limite = 0 } = {}) {
    let pares = [...contarPor(registros, (r) => r[campo]).entries()];
    pares.sort(porValor ? (a, b) => b[1] - a[1] || ordenarRotulos(a[0], b[0]) : (a, b) => ordenarRotulos(a[0], b[0]));
    if (limite) pares = pares.slice(0, limite);
    return { rotulos: pares.map((p) => p[0]), valores: pares.map((p) => p[1]) };
  }

  // Sequência conhecida de módulos do projeto: sempre exibida, mesmo com zero.
  const MODULOS_PADRAO = ['M1', 'M2', 'M3', 'M4'];

  /** Número do módulo em "M1", "m 2", "Módulo 3"…; null se não reconhecido. */
  function numeroModulo(rotulo) {
    const m = String(rotulo).trim().match(/^(?:m|m[oó]dulo)\s*(\d+)$/i);
    return m ? +m[1] : null;
  }

  /** Ocorrências por módulo: M1→M4 (com zeros), outros numerados em sequência, demais ao final. */
  function totaisPorModulo(registros) {
    const cont = contarPor(registros, (r) => r.modulo);
    const rotulos = [...new Set([...MODULOS_PADRAO, ...cont.keys()])];
    rotulos.sort((a, b) => {
      const na = numeroModulo(a);
      const nb = numeroModulo(b);
      if (na !== null && nb !== null) return na - nb || ordenarRotulos(a, b);
      if (na !== null) return -1;
      if (nb !== null) return 1;
      return ordenarRotulos(a, b);
    });
    return { rotulos, valores: rotulos.map((m) => cont.get(m) || 0) };
  }

  // Posição de cada módulo no eixo da Visão Geral: M1 → ANUAL → M2 → M3 → M4.
  function posicaoModulo(rotulo) {
    if (String(rotulo).trim().toUpperCase() === 'ANUAL') return 1.5;
    return numeroModulo(rotulo);
  }

  /** Ocorrências apenas dos módulos presentes, na ordem M1 → ANUAL → M2 → M3 → M4; demais ao final. */
  function modulosPresentes(registros) {
    const cont = contarPor(registros, (r) => r.modulo);
    const rotulos = [...cont.keys()].sort((a, b) => {
      const pa = posicaoModulo(a);
      const pb = posicaoModulo(b);
      if (pa !== null && pb !== null) return pa - pb || ordenarRotulos(a, b);
      if (pa !== null) return -1;
      if (pb !== null) return 1;
      return ordenarRotulos(a, b);
    });
    return { rotulos, valores: rotulos.map((m) => cont.get(m)) };
  }

  /** Matriz campo × categoria (para gráficos empilhados e relatórios). */
  function cruzarPorCategoria(registros, campo, { porTotal = false } = {}) {
    const linhas = new Map();
    registros.forEach((r) => {
      if (!linhas.has(r[campo])) linhas.set(r[campo], {});
      const l = linhas.get(r[campo]);
      l[r._categoria] = (l[r._categoria] || 0) + 1;
    });
    const total = (o) => Object.values(o).reduce((s, n) => s + n, 0);
    const rotulos = [...linhas.keys()].sort(porTotal
      ? (a, b) => total(linhas.get(b)) - total(linhas.get(a)) || ordenarRotulos(a, b)
      : ordenarRotulos);
    const series = Object.values(CATEGORIAS).map((cat) => ({
      categoria: cat,
      valores: rotulos.map((rot) => linhas.get(rot)[cat] || 0)
    }));
    return { rotulos, series, totais: rotulos.map((rot) => total(linhas.get(rot))) };
  }

  /** Série temporal mensal (ou diária se o intervalo for curto). */
  function serieTemporal(registros) {
    const s = serieComparativa(registros, [() => true]);
    return { rotulos: s.rotulos, valores: s.series[0], granularidade: s.granularidade };
  }

  /**
   * Várias séries sobre os MESMOS períodos e granularidade, definidos pelo
   * conjunto completo de registros — para comparação simultânea (ex.: minigráficos).
   */
  function serieComparativa(registros, filtrosFn) {
    const datados = registros.filter((r) => r._data);
    if (!datados.length) return { rotulos: [], chaves: [], series: filtrosFn.map(() => []), granularidade: 'mês' };
    const tempos = datados.map((r) => r._data.getTime());
    const dias = (Math.max(...tempos) - Math.min(...tempos)) / 86400000;
    const diario = dias <= 45;
    const pad = (n) => String(n).padStart(2, '0');
    const chave = (d) => (diario
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    const mapas = filtrosFn.map((fn) => contarPor(datados.filter(fn), (r) => chave(r._data)));

    // Preenche períodos sem ocorrências com zero.
    const ini = new Date(Math.min(...tempos));
    const fim = new Date(Math.max(...tempos));
    const cursor = diario ? new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()) : new Date(ini.getFullYear(), ini.getMonth(), 1);
    const chaves = [];
    while (cursor <= fim) {
      chaves.push(chave(cursor));
      if (diario) cursor.setDate(cursor.getDate() + 1); else cursor.setMonth(cursor.getMonth() + 1);
    }
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const rotulos = chaves.map((k) => {
      const [a, m, d] = k.split('-');
      return diario ? `${d}/${m}` : `${meses[+m - 1]}/${a.slice(2)}`;
    });
    return {
      rotulos,
      chaves,
      series: mapas.map((mapa) => chaves.map((k) => mapa.get(k) || 0)),
      granularidade: diario ? 'dia' : 'mês'
    };
  }

  GGE.indicadores = {
    CATEGORIAS, normalizarTipo, categorizar, parseDataBR, prepararRegistros,
    calcularKpis, agrupar, cruzarPorCategoria, serieTemporal, serieComparativa, totaisPorModulo, modulosPresentes, ordenarRotulos
  };
})(window.GGE = window.GGE || {});
