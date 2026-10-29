/**
 * Camada de serviço de dados.
 * Consulta o Web App do Google Apps Script (aba BASE_ERROS) e converte
 * cada ocorrência para o formato interno usado pelo dashboard.
 * Os dados demonstrativos só são usados se USAR_DEMONSTRATIVO = true.
 */
(function (GGE) {
  'use strict';

  const CONFIG = {
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwIMZfY-StP8xM3GaVlf41DeUfHfvvjT34tTsHPFYmzcrskgM3KDGW_hWwUVmlM_nPd/exec',
    TIMEOUT_MS: 30000,
    USAR_DEMONSTRATIVO: false,
    ABA: 'BASE_ERROS'
  };

  /* ---------- Dados demonstrativos (matriz da planilha) ---------- */
  const COLUNAS = {
    'ID': 'id',
    'Data/Hora': 'dataHora',
    'Módulo': 'modulo',
    'Ano Escolar': 'ano',
    'Disciplina': 'disciplina',
    'Coleção': 'colecao',
    'Tipo de Erro': 'tipo',
    'Descrição do Problema': 'descricao',
    'Link da Evidência/Imagem': 'evidencia',
    'Registrado por': 'registradoPor',
    'Planilha de Origem': 'planilhaOrigem',
    'Célula de Origem': 'celulaOrigem',
    'Linha de Origem': 'linhaOrigem',
    'Status': 'status'
  };

  /** Converte a matriz [cabeçalho, ...linhas] em objetos, ignorando linhas vazias. */
  function matrizParaRegistros(valores) {
    if (!Array.isArray(valores) || valores.length === 0) return [];
    const cabecalho = valores[0].map((c) => String(c).trim());
    const faltantes = Object.keys(COLUNAS).filter((c) => !cabecalho.includes(c));
    if (faltantes.length) {
      throw new Error(`Colunas ausentes na aba ${CONFIG.ABA}: ${faltantes.join(', ')}`);
    }
    return valores.slice(1)
      .filter((linha) => linha.some((v) => String(v ?? '').trim() !== ''))
      .map((linha, i) => {
        const reg = { _linhaPlanilha: i + 2 };
        cabecalho.forEach((nome, c) => {
          const chave = COLUNAS[nome];
          if (chave) reg[chave] = linha[c] ?? '';
        });
        return reg;
      });
  }

  /* ---------- API real ---------- */
  /** Mapeia um registro da API para as chaves internas, preservando os valores originais. */
  function apiParaRegistro(d) {
    return {
      id: d.id ?? '',
      dataHora: d.dataHora ?? '',
      modulo: d.modulo ?? '',
      ano: d.anoEscolar ?? '',
      disciplina: d.disciplina ?? '',
      colecao: d.colecao ?? '',
      tipo: d.tipoErro ?? '',
      classificacoes: Array.isArray(d.classificacoes) ? d.classificacoes : [],
      descricao: d.descricaoProblema ?? '',
      evidencia: d.linkEvidencia ?? '',
      registradoPor: d.registradoPor ?? '',
      planilhaOrigem: d.planilhaOrigem ?? '',
      celulaOrigem: d.celulaOrigem ?? '',
      linhaOrigem: d.linhaOrigem ?? '',
      _linhaPlanilha: d.linhaBase ?? ''
    };
  }

  async function consultarApi() {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), CONFIG.TIMEOUT_MS);
    let resp;
    try {
      // GET simples, sem cabeçalhos customizados, para não disparar preflight CORS no Apps Script.
      resp = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'GET', cache: 'no-store', signal: controle.signal });
    } catch (e) {
      throw new Error(e.name === 'AbortError'
        ? 'A API demorou demais para responder. Tente novamente.'
        : 'Não foi possível conectar à API do Google Sheets. Verifique a conexão.');
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) throw new Error(`A API respondeu com erro (HTTP ${resp.status}).`);

    let json;
    try { json = await resp.json(); } catch {
      throw new Error('A API devolveu uma resposta que não é JSON. Verifique a publicação do Web App.');
    }
    if (!json || json.sucesso !== true) {
      throw new Error(`A API informou falha${json && json.erro ? `: ${json.erro}` : '.'}`);
    }
    if (!Array.isArray(json.dados)) throw new Error('Resposta da API sem o campo "dados".');

    return {
      registros: json.dados.map(apiParaRegistro),
      demonstrativo: false,
      meta: {
        versao: json.versao ?? '',
        atualizadoEm: json.atualizadoEm ? new Date(json.atualizadoEm) : null,
        totalApi: typeof json.total === 'number' ? json.total : null,
        resumo: json.resumo || null
      }
    };
  }

  async function carregarRegistros() {
    if (CONFIG.USAR_DEMONSTRATIVO) {
      return { registros: matrizParaRegistros(GGE.mockData.valores), demonstrativo: true, meta: null };
    }
    return consultarApi();
  }

  GGE.api = { CONFIG, carregarRegistros, matrizParaRegistros, apiParaRegistro };
})(window.GGE = window.GGE || {});
