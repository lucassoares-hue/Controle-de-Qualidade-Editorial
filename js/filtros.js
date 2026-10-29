/**
 * Filtros globais com seleção múltipla (checkboxes no drawer).
 * Dentro de um grupo: OU entre as opções marcadas. Entre grupos: E.
 * Grupo sem seleção não restringe. Alterações só valem ao clicar em "Aplicar filtros".
 */
(function (GGE) {
  'use strict';

  const CAMPOS = [
    { chave: 'modulo', rotulo: 'Módulo' },
    { chave: 'ano', rotulo: 'Ano Escolar' },
    { chave: 'disciplina', rotulo: 'Disciplina', busca: true },
    { chave: 'colecao', rotulo: 'Coleção' },
    { chave: '_categoria', rotulo: 'Tipo de apontamento' }
  ];

  // Valor especial do filtro de tipo: tudo que não é exclusivamente Editorial ou Diagramação.
  const OUTRAS = '__outras';
  const ROTULO_OUTRAS = 'Outras classificações';
  const ehOutra = (cat) => cat !== GGE.indicadores.CATEGORIAS.EDITORIAL && cat !== GGE.indicadores.CATEGORIAS.DIAGRAMACAO;

  // Estado aplicado: um Set de valores marcados por grupo (vazio = todos).
  const estado = Object.fromEntries(CAMPOS.map(({ chave }) => [chave, new Set()]));
  let aoMudar = () => {};

  const grupo = (chave) => document.getElementById(`f-${chave}`);
  const caixas = (chave) => [...grupo(chave).querySelectorAll('input[type="checkbox"]')];

  /** Opções de cada grupo, derivadas dos registros e na ordem adequada. */
  function opcoes(registros, chave) {
    const { ordenarRotulos, CATEGORIAS, totaisPorModulo } = GGE.indicadores;
    const presentes = new Set(registros.map((r) => r[chave]));
    if (chave === 'modulo') {
      // Mesma ordem editorial do gráfico (M1→M4, depois os demais), só com módulos existentes.
      return totaisPorModulo(registros).rotulos.filter((m) => presentes.has(m)).map((m) => ({ valor: m, rotulo: m }));
    }
    if (chave === '_categoria') {
      const lista = Object.values(CATEGORIAS).filter((c) => presentes.has(c)).map((c) => ({ valor: c, rotulo: c }));
      if ([...presentes].some(ehOutra)) lista.push({ valor: OUTRAS, rotulo: ROTULO_OUTRAS });
      return lista;
    }
    return [...presentes].sort(ordenarRotulos).map((v) => ({ valor: v, rotulo: v }));
  }

  function montar(registros, callback) {
    aoMudar = callback;
    const { esc } = GGE.util;

    CAMPOS.forEach(({ chave, rotulo, busca }) => {
      const lista = opcoes(registros, chave);
      const contagem = new Map();
      registros.forEach((r) => contagem.set(r[chave], (contagem.get(r[chave]) || 0) + 1));
      grupo(chave).innerHTML = `
        <legend class="grupo-check-titulo">${esc(rotulo)} <span class="grupo-check-contador" data-contador></span></legend>
        ${busca ? `<label class="grupo-check-busca"><i data-lucide="search"></i><input type="search" placeholder="Pesquisar ${esc(rotulo.toLowerCase())}…" aria-label="Pesquisar ${esc(rotulo.toLowerCase())}"></label>` : ''}
        <div class="grupo-check-lista${busca ? ' rolavel' : ''}">
          ${lista.map(({ valor, rotulo: r }) => `
            <label class="opcao-check" data-busca="${esc(GGE.util.semAcento(r))}">
              <input type="checkbox" value="${esc(valor)}">
              <span class="opcao-check-texto">${esc(r)}</span>
              ${valor === OUTRAS ? '' : `<span class="opcao-check-qtd">${GGE.util.fmtNum(contagem.get(valor) || 0)}</span>`}
            </label>`).join('')}
          ${busca ? '<p class="grupo-check-vazio" hidden>Nenhuma opção encontrada.</p>' : ''}
        </div>`;
      grupo(chave).addEventListener('change', () => atualizarContador(chave));
      if (busca) {
        const campoBusca = grupo(chave).querySelector('.grupo-check-busca input');
        campoBusca.addEventListener('input', () => {
          const termo = GGE.util.semAcento(campoBusca.value);
          let visiveis = 0;
          grupo(chave).querySelectorAll('.opcao-check').forEach((op) => {
            const mostra = !termo || op.dataset.busca.includes(termo);
            op.hidden = !mostra;
            if (mostra) visiveis++;
          });
          grupo(chave).querySelector('.grupo-check-vazio').hidden = visiveis > 0;
        });
      }
    });

    sincronizarCampos();
    document.getElementById('btn-aplicar').addEventListener('click', aplicarCampos);
    document.getElementById('btn-limpar').addEventListener('click', limpar);
  }

  function atualizarContador(chave) {
    const n = caixas(chave).filter((c) => c.checked).length;
    grupo(chave).querySelector('[data-contador]').textContent = n ? `(${n})` : '';
  }

  /** Copia o estado aplicado para os checkboxes (descarta marcações não aplicadas). */
  function sincronizarCampos() {
    CAMPOS.forEach(({ chave, busca }) => {
      caixas(chave).forEach((c) => { c.checked = estado[chave].has(c.value); });
      if (busca) {
        const campoBusca = grupo(chave).querySelector('.grupo-check-busca input');
        campoBusca.value = '';
        campoBusca.dispatchEvent(new Event('input'));
      }
      atualizarContador(chave);
    });
  }

  function aplicarCampos() {
    CAMPOS.forEach(({ chave }) => {
      estado[chave] = new Set(caixas(chave).filter((c) => c.checked).map((c) => c.value));
    });
    aoMudar();
  }

  function limpar() {
    CAMPOS.forEach(({ chave }) => { estado[chave] = new Set(); });
    sincronizarCampos();
    aoMudar();
  }

  function aplicar(registros) {
    return registros.filter((r) => CAMPOS.every(({ chave }) => {
      const sel = estado[chave];
      if (!sel.size) return true;
      if (chave === '_categoria' && sel.has(OUTRAS) && ehOutra(r._categoria)) return true;
      return sel.has(r[chave]);
    }));
  }

  /** Grupos com seleção, para o contador do botão e os relatórios. */
  function ativos() {
    return CAMPOS.filter(({ chave }) => estado[chave].size).map(({ chave, rotulo }) => ({
      rotulo,
      valor: [...estado[chave]].map((v) => (v === OUTRAS ? ROTULO_OUTRAS : v)).join(', ')
    }));
  }

  /** Define o filtro de tipo (usado pelos cards), preservando os demais filtros. */
  function definirCategoria(valor) {
    if (valor && !caixas('_categoria').some((c) => c.value === valor)) return;
    estado._categoria = new Set(valor ? [valor] : []);
    sincronizarCampos();
    aoMudar();
  }

  GGE.filtros = { montar, aplicar, limpar, ativos, definirCategoria, sincronizarCampos, estado, OUTRAS };
})(window.GGE = window.GGE || {});
