/**
 * DADOS DEMONSTRATIVOS — NÃO SÃO DADOS REAIS.
 * Reproduz exatamente a estrutura da aba BASE_ERROS (cabeçalho + linhas),
 * no mesmo formato que o Google Apps Script devolverá (matriz de valores).
 * Inclui, de propósito, casos de teste: ID duplicado, classificações
 * combinadas/desconhecidas/vazias e um link de evidência inseguro.
 */
(function (GGE) {
  'use strict';

  const CABECALHO = [
    'ID', 'Data/Hora', 'Módulo', 'Ano Escolar', 'Disciplina', 'Coleção',
    'Tipo de Erro', 'Descrição do Problema', 'Link da Evidência/Imagem',
    'Registrado por', 'Planilha de Origem', 'Célula de Origem', 'Linha de Origem', 'Status'
  ];

  // Gerador pseudoaleatório determinístico: os dados são sempre os mesmos.
  let semente = 20260127;
  const rand = () => ((semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const pad = (n) => String(n).padStart(2, '0');

  const ANOS_EF1 = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano'];
  const ANOS_EF2 = ['6º Ano', '7º Ano', '8º Ano', '9º Ano'];
  const ANOS_EM = ['1ª Série EM', '2ª Série EM', '3ª Série EM'];

  const DISCIPLINAS = {
    EF1: ['Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia', 'Arte'],
    EF2: ['Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia', 'Inglês', 'Arte'],
    EM: ['Língua Portuguesa', 'Matemática', 'Física', 'Química', 'Biologia', 'História', 'Geografia', 'Inglês']
  };

  const COLECOES = {
    EF1: ['Coleção Demo Raízes', 'Coleção Demo Horizonte'],
    EF2: ['Coleção Demo Horizonte', 'Coleção Demo Trilhas'],
    EM: ['Coleção Demo Trilhas', 'Coleção Demo Vértice']
  };

  // Janela de produção de cada módulo (mês inicial e final, 2026).
  const MODULOS = [
    { nome: 'Módulo 1', meses: [1, 3] },
    { nome: 'Módulo 2', meses: [3, 5] },
    { nome: 'Módulo 3', meses: [6, 8] },
    { nome: 'Módulo 4', meses: [8, 10] }
  ];

  // Valores brutos como podem aparecer na planilha (variações de grafia).
  const TIPOS_BRUTOS = [
    ['Editorial', 34], ['editorial', 6], ['EDITORIAL ', 3],
    ['Diagramação', 30], ['Diagramacao', 5], ['diagramação', 4],
    ['Editorial / Diagramação', 5], ['Editorial e Diagramação', 3],
    ['Revisão técnica', 3], ['', 2]
  ];

  const DESCRICOES = {
    Editorial: [
      'Erro de concordância verbal no enunciado da questão',
      'Gabarito divergente da resolução apresentada',
      'Crase utilizada indevidamente no texto de apoio',
      'Referência bibliográfica incompleta',
      'Termo técnico grafado de forma inconsistente',
      'Numeração de exercícios fora de sequência',
      'Informação conceitual desatualizada no boxe',
      'Repetição de palavra no parágrafo introdutório'
    ],
    Diagramação: [
      'Imagem com baixa resolução na abertura do capítulo',
      'Texto ultrapassando a margem de segurança',
      'Legenda desalinhada em relação à figura',
      'Fonte diferente do padrão no título da seção',
      'Tabela quebrada entre páginas sem repetição de cabeçalho',
      'Espaçamento irregular entre parágrafos',
      'Cor do boxe fora da paleta da coleção',
      'Viúva no final da coluna'
    ],
    Combinado: [
      'Enunciado com erro ortográfico e caixa de texto sobreposta à imagem',
      'Gráfico sem fonte de dados e com rótulos cortados'
    ],
    Outro: [
      'Unidade de medida incorreta no exemplo resolvido',
      'Ocorrência registrada sem classificação definida'
    ]
  };

  const REGISTRADORES = ['Usuário Demo A', 'Usuário Demo B', 'Usuário Demo C', 'Usuário Demo D'];

  function sortearTipo() {
    const total = TIPOS_BRUTOS.reduce((s, [, p]) => s + p, 0);
    let r = rand() * total;
    for (const [valor, peso] of TIPOS_BRUTOS) {
      if ((r -= peso) < 0) return valor;
    }
    return 'Editorial';
  }

  function grupoDescricao(tipo) {
    const t = tipo.trim().toLowerCase();
    if (t.includes('/') || t.includes(' e ')) return 'Combinado';
    if (t.startsWith('editorial')) return 'Editorial';
    if (t.startsWith('diagrama')) return 'Diagramação';
    return 'Outro';
  }

  const linhas = [];
  const TOTAL = 260;
  for (let i = 1; i <= TOTAL; i++) {
    const modulo = pick(MODULOS);
    const nivel = pick(['EF1', 'EF2', 'EF2', 'EM']);
    const ano = pick(nivel === 'EF1' ? ANOS_EF1 : nivel === 'EF2' ? ANOS_EF2 : ANOS_EM);
    const disciplina = pick(DISCIPLINAS[nivel]);
    const colecao = pick(COLECOES[nivel]);
    const tipo = sortearTipo();

    const mes = modulo.meses[0] + Math.floor(rand() * (modulo.meses[1] - modulo.meses[0] + 1));
    const dia = 1 + Math.floor(rand() * 28);
    const hora = 8 + Math.floor(rand() * 10);
    const minuto = Math.floor(rand() * 60);
    const dataHora = `${pad(dia)}/${pad(mes)}/2026 ${pad(hora)}:${pad(minuto)}:00`;

    const id = `DEMO-${String(i).padStart(4, '0')}`;
    const planilha = `DEMO_${modulo.nome.replace(' ', '')}_${nivel}`;
    const linhaOrigem = 2 + Math.floor(rand() * 180);
    const coluna = pick(['C', 'D', 'E', 'F', 'G', 'H']);

    linhas.push([
      id,
      dataHora,
      modulo.nome,
      ano,
      disciplina,
      colecao,
      tipo,
      pick(DESCRICOES[grupoDescricao(tipo)]),
      `https://drive.google.com/file/d/DEMO-EVIDENCIA-${String(i).padStart(4, '0')}/view`,
      pick(REGISTRADORES),
      planilha,
      `${coluna}${linhaOrigem}`,
      linhaOrigem,
      pick(['Pendente', 'Corrigido', 'Corrigido', 'Em revisão'])
    ]);
  }

  // Casos de teste de qualidade da base:
  // 1) ID duplicado (mesmo ID em duas linhas diferentes).
  linhas[41][0] = linhas[40][0];
  // 2) Link de evidência inseguro — deve ser bloqueado pela interface.
  linhas[12][8] = 'javascript:alert("teste")';
  // 3) Registro sem link de evidência.
  linhas[77][8] = '';

  GGE.mockData = {
    aviso: 'Dados demonstrativos fictícios — não representam registros reais.',
    aba: 'BASE_ERROS',
    valores: [CABECALHO, ...linhas]
  };
})(window.GGE = window.GGE || {});
