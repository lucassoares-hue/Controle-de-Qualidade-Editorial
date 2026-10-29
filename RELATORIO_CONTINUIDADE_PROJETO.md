# Relatório de Continuidade do Projeto — Dashboard de Controle de Qualidade Editorial GGE

> Auditoria técnica realizada em **27/10/2026**, somente leitura (exceto a criação deste arquivo).
> Pasta auditada: `gge-qualidade-editoria/`.
> Convenção usada no documento: **[COMPROVADO]** = verificado em arquivo, execução ou resposta da API nesta auditoria; **[HIPÓTESE]** = inferência não confirmada.

---

## 1. Resumo executivo

O projeto é um **dashboard web estático** (HTML + CSS + JavaScript puro, sem build) que exibe indicadores, gráficos, tabelas e relatórios em PDF sobre os **apontamentos** (ajustes) registrados pelo setor de **Arte e Finalização** na verificação final dos materiais didáticos do Sistema GGE de Ensino.

Os dados vêm, em tempo real, de uma **planilha Google Sheets (aba `BASE_ERROS`)** exposta por um **Web App do Google Apps Script** (somente leitura, `GET`, JSON). Não há banco de dados nem backend próprio.

Estado geral **[COMPROVADO]**:

- Os 7 arquivos JavaScript são sintaticamente válidos (`node`, verificação de sintaxe).
- A aplicação carrega sem erros de JavaScript; as quatro seções renderizam (Visão Geral: 9 gráficos; Análise Editorial: 5; Análise de Diagramação: 5; Relatórios: gerador + consolidado).
- A API respondeu com `sucesso=true`, `versao=1.0.0`, **55 registros** (13 Editorial, 42 Diagramação, 0 não classificados, 0 IDs duplicados).
- O projeto **não está sob controle de versão** (sem `.git`) e **não possui testes automatizados** nem `package.json`.

Ponto de interrupção **[COMPROVADO]**: a última funcionalidade desenvolvida foi o **gerador de relatórios em PDF** (`js/relatorios.js`, arquivo mais recente — 27/10/2026 14:59). Ela está implementada e foi testada em navegador headless; restaram decisões pendentes (ver §8 e §10).

**Próxima tarefa recomendada:** colocar o projeto sob controle de versão (Git) com um commit de referência, antes de qualquer nova alteração (ver §12).

---

## 2. Finalidade do sistema

- **Nome na interface:** "Controle de Qualidade Editorial" — Sistema GGE de Ensino; rodapé institucional **SGGE-PCP** (`index.html`, menu lateral).
- **Objetivo:** identificar padrões de apontamentos e comparar processos (Editorial × Diagramação), coleções, disciplinas, anos escolares e módulos, apoiando a gestão da qualidade editorial com abordagem de melhoria contínua (terminologia "apontamento" em vez de "erro").
- **Público:** gestão editorial / PCP. Os relatórios em PDF são de **uso interno**.
- **Regra de negócio central:** cada linha da `BASE_ERROS` é um apontamento; registros com as duas classificações contam **uma única vez** nos totais (`js/indicadores.js` — `categorizar`, `calcularKpis`).
- **Fora do escopo (decisão de projeto):** taxa de conformidade de materiais (não há base de materiais verificados) e uso do campo `Status` da planilha.

---

## 3. Tecnologias utilizadas

| Tecnologia | Versão | Origem | Uso | Arquivo |
|---|---|---|---|---|
| HTML5 / CSS3 / JavaScript ES2020+ | — | local | aplicação inteira, sem framework e sem build | `index.html`, `css/style.css`, `js/*.js` |
| Chart.js | 4.4.1 | CDN jsDelivr | todos os gráficos e os gráficos do PDF | `index.html` |
| Lucide (ícones) | 0.454.0 | CDN unpkg | ícones `data-lucide` | `index.html` |
| jsPDF | 2.5.1 | CDN cdnjs | geração de PDF no navegador | `index.html`, `js/relatorios.js` |
| jspdf-autotable | 3.8.2 | CDN cdnjs | tabela paginada no PDF | `index.html`, `js/relatorios.js` |
| Fonte Inter | — | Google Fonts | tipografia | `index.html` |
| Google Apps Script (Web App) | API v1.0.0 | Google | fonte de dados (JSON) | `js/api.js` |
| Google Sheets | aba `BASE_ERROS` | Google | armazenamento dos apontamentos | (externo) |

Não há dependências npm, `package.json`, bundler, linter ou testes.

---

## 4. Arquitetura

Aplicação de página única (SPA) com **módulos em IIFE** que compartilham o namespace global `window.GGE`. A ordem de carregamento dos scripts em `index.html` é obrigatória:

```
mock-data.js → api.js → indicadores.js → filtros.js → dashboard.js → relatorios.js → app.js
```

| Módulo | Namespace | Responsabilidade |
|---|---|---|
| `js/mock-data.js` | `GGE.mockData` | 260 registros **fictícios** no formato da planilha (só usados se `USAR_DEMONSTRATIVO = true`) |
| `js/api.js` | `GGE.api` | consulta ao Web App, validação da resposta, mapeamento dos campos da API para chaves internas |
| `js/indicadores.js` | `GGE.indicadores` | normalização de tipo, datas BR, inconsistências, KPIs, agrupamentos, totais por módulo |
| `js/filtros.js` | `GGE.filtros` | filtros globais com checkboxes (drawer), lógica OU/E, estado aplicado |
| `js/dashboard.js` | `GGE.util`, `GGE.dashboard` | utilitários, todos os gráficos, cards, tabelas, detalhe, relatório consolidado, CSV |
| `js/relatorios.js` | `GGE.relatorios` | gerador de relatório em PDF (parâmetros próprios) |
| `js/app.js` | — | inicialização, roteamento por hash, drawer, menu recolhível, navegação "Ver apontamentos" |

**Roteamento:** por `location.hash` (`#visao-geral`, `#editorial`, `#diagramacao`, `#relatorios`); rotas desconhecidas (ex.: `#ocorrencias`, removida) redirecionam para `#visao-geral` (`js/app.js` — `navegar`, listener `hashchange`).

**Renderização:** apenas a seção visível é desenhada a cada atualização (`renderSecao` em `js/app.js`). Cada atualização de filtros recalcula a partir do array em memória `base` — não há novas requisições.

---

## 5. Estrutura de arquivos

```
gge-qualidade-editoria/
├── index.html                      (244 linhas)  estrutura, seções, drawer, modal, scripts
├── css/style.css                   (480 linhas)  tema em variáveis CSS, layout, responsividade, impressão
├── js/
│   ├── mock-data.js                (140)  dados demonstrativos (fictícios)
│   ├── api.js                      (113)  integração com Apps Script
│   ├── indicadores.js              (210)  regras de negócio e cálculos
│   ├── filtros.js                  (127)  filtros globais
│   ├── dashboard.js                (773)  gráficos, cards, tabelas, detalhe, consolidado
│   ├── relatorios.js               (424)  gerador de PDF
│   └── app.js                      (231)  orquestração e navegação
├── assets/
│   ├── logo-sgge.png               147×62    logo completo (menu expandido, PDF)
│   ├── logo-sgge-mini.png          1278×1230 símbolo (menu recolhido) — 575 KB
│   ├── favicon.png                 128×128   ícone da aba (logotipo "PCP")
│   ├── editorial.png, diagramação.png, %.png  ícones dos cards das seções de análise
└── RELATORIO_CONTINUIDADE_PROJETO.md        este documento
```

Encoding: todos os arquivos de texto em UTF-8 sem BOM **[COMPROVADO]**.

---

## 6. Mapeamento das páginas e funcionalidades

### 6.1 Estrutura global da interface

| Componente | Descrição | Arquivos | Status |
|---|---|---|---|
| Menu lateral | Logo GGE, "Controle de Qualidade Editorial", 4 itens com ícone em caixa e seta, item ativo em gradiente azul, rodapé "SGGE-PCP" | `index.html`, `css/style.css` (Sidebar) | IMPLEMENTADA |
| Menu recolhível | 256 px ↔ 76 px, logo mini, tooltips, transição 250 ms, preferência em `localStorage` (`gge.menuRecolhido`), desativado no mobile | `js/app.js` (`aplicarMenuRecolhido`, `iniciarMenuRecolhivel`), `css/style.css` | IMPLEMENTADA |
| Menu mobile (≤ 960 px) | Off-canvas com botão ☰ e overlay | `js/app.js` (`abrirMenu`/`fecharMenu`) | IMPLEMENTADA |
| Cabeçalho | Título da seção + subtítulo institucional; selo "Google Sheets · atualizado em…", botão atualizar (recarrega a página), botão "Filtros (n)" | `index.html`, `js/app.js` (`atualizar`) | IMPLEMENTADA |
| Drawer de filtros | Checkboxes multi-seleção (Módulo, Ano Escolar, Disciplina com busca, Coleção, Tipo); OU dentro do grupo, E entre grupos; aplicar/limpar/fechar; ESC e clique fora | `js/filtros.js`, `js/app.js` (`abrirDrawer`/`fecharDrawer`) | IMPLEMENTADA |
| Modal de detalhe | ID, data, campos de origem, classificação original e normalizada, link de evidência | `js/dashboard.js` (`abrirDetalhe`), `<dialog id="detalhe">` | IMPLEMENTADA |
| Aviso de qualidade da base | IDs duplicados, sem ID, datas inválidas, tipos não reconhecidos, divergência de total | `js/indicadores.js` (`prepararRegistros`), `js/dashboard.js` (`renderQualidade`) | IMPLEMENTADA (hoje oculto: base sem inconsistências) |
| Modo demonstrativo | Troca a API pelos dados fictícios | `js/api.js` (`USAR_DEMONSTRATIVO`) | IMPLEMENTADA (desligado) |

### 6.2 Visão Geral (`#visao-geral`)

| Funcionalidade | Como funciona | Arquivos | Status |
|---|---|---|---|
| Cards Total / Editoriais / Diagramação (+ "Outras classificações" se houver) | Valor, % do total, descrição, **minigráfico por módulo** (M1→M4), botão "Ver apontamentos" | `js/dashboard.js` (`renderCardsGerais`, `cardTendencia`, `minigrafico`) | IMPLEMENTADA |
| Botões "Ver apontamentos" | Total → tabela da própria página; Editorial/Diagramação → tabela da seção correspondente, com rolagem suave; "Outras" → aplica filtro e vai à tabela geral | `js/app.js` (`irParaComponente`, `rolarAte`, `DESTINOS`) | IMPLEMENTADA ("Outras" NÃO VERIFICADA — base sem registros desse tipo) |
| Distribuição por tipo (rosca) | Editorial `#2563EB`, Diagramação `#747687`, rótulos externos "n (p%)" com linhas conectoras, hover com avanço da fatia | `js/dashboard.js` (`rosca`, plugin `rotulosExternos`) | IMPLEMENTADA (hover não testado com mouse real) |
| Apontamentos por módulo (área) | Gradiente, % por ponto | `js/dashboard.js` (`areaModulos`, plugin `rotulosPercentuais`), `js/indicadores.js` (`totaisPorModulo`) | IMPLEMENTADA |
| Por coleção | Colunas + bloco "Total geral de apontamentos" | `js/dashboard.js` (`colunasColecao`) | IMPLEMENTADA |
| Ranking de disciplinas (top 10) | Barras horizontais com rótulos | `js/dashboard.js` (`barras`, plugin `rotulosValor`) | IMPLEMENTADA |
| Por ano escolar | Colunas com rótulos | idem | IMPLEMENTADA |
| Editorial × Diagramação por disciplina | Barras empilhadas, valores dentro dos segmentos | `js/dashboard.js` (`empilhado`) | IMPLEMENTADA |
| Tabela "Apontamentos registrados" | Ver §6.5 | `js/dashboard.js` (`criarTabela`, `renderTabela`) | IMPLEMENTADA |

### 6.3 Análise Editorial (`#editorial`) e 6.4 Análise de Diagramação (`#diagramacao`)

Estrutura idêntica, mudando o processo e a cor (`js/dashboard.js` — `renderAnalise`). Recorte: categoria da página **+ registros combinados**, cada um uma vez; participação calculada sobre todos os registros após os filtros globais (regra documentada em comentário no código).

| Funcionalidade | Status |
|---|---|
| Cards "Apontamentos Editorial"/"Apontamentos de Diagramação" e "Participação no total — de X apontamentos", com ícones PNG (`assets/editorial.png`, `assets/diagramação.png`, `assets/%.png`), conteúdo centralizado | IMPLEMENTADA |
| Apontamentos por módulo (área, % por ponto, na cor do processo) | IMPLEMENTADA |
| Por disciplina, Por módulo (barras), Por coleção, Por ano escolar — todos com rótulos de valor | IMPLEMENTADA |
| Tabela "Apontamentos editoriais" / "Apontamentos de diagramação" | IMPLEMENTADA |

### 6.5 Tabelas de apontamentos (componente único)

- Um componente (`criarTabela`) instanciado por contêiner `[data-tabela]` (`geral`, `ed`, `dg`), cada um com estado próprio (busca, ordenação, página, linhas por página). **[COMPROVADO]**
- Colunas: Módulo, Ano Escolar, Disciplina, Coleção, Tipo de apontamento, Descrição (truncada em 2 linhas, texto completo no tooltip e no detalhe), Evidência (link seguro `http(s)`, `noopener`), Visualizar.
- ID, Data/Hora e Registrado por **não são colunas**, mas continuam pesquisáveis (ID) e visíveis no detalhe; ordenação padrão: data mais recente.
- Status: IMPLEMENTADA.

### 6.6 Relatórios (`#relatorios`)

| Funcionalidade | Como funciona | Arquivos | Status |
|---|---|---|---|
| Gerador "Novo relatório" (PDF) | Parâmetros próprios em checkboxes (Coleção: Todas/BASIS/LUDUS/MUNDUS/EXTRA; Módulo: Todos/1–4/Anual; Apontamentos: Editorial/Diagramação; Conteúdo: resumo/gráficos/tabela); prévia com contagem; validações; PDF com jsPDF + autotable (cabeçalho institucional, parâmetros, cards, 4 gráficos renderizados fora da tela, tabela paginada com links, rodapé "SGGE-PCP · Página X de Y") | `js/relatorios.js`, `index.html` (`#gerador-relatorio`) | IMPLEMENTADA (testada em headless; ver limitações) |
| Relatório consolidado (legado) | Tabelas cruzadas (disciplina, coleção, módulo, ano × categoria) sobre os **filtros globais**, "Exportar CSV", "Imprimir / PDF" (impressão do navegador), lista de qualidade da base | `js/dashboard.js` (`renderRelatorios`, `tabelaCruzada`, `exportarCSV`, `renderQualidade`) | IMPLEMENTADA — **sobreposição** com o gerador (ver P-05) |

### 6.7 Funcionalidades removidas ao longo do desenvolvimento (não recriar sem decisão)

- Seção independente **Ocorrências** (rota redireciona para Visão Geral).
- Filtro de **período** (datas) no drawer.
- Gráfico "Evolução temporal" e "Por módulo" (barras) **na Visão Geral**.
- Cards "Disciplina mais afetada"/"Coleção mais afetada" e bloco "Apontamentos recorrentes" nas análises.
- Botão de menu ☰ no desktop.

---

## 7. Fluxo de dados e integrações

```
Google Sheets (aba BASE_ERROS)
        │  leitura feita pelo Apps Script (fora deste repositório)
        ▼
Web App Apps Script  ── GET JSON ──►  js/api.js  consultarApi()
  {sucesso, versao, atualizadoEm,        • timeout 30 s (AbortController)
   total, resumo, dados[]}               • valida sucesso / JSON / dados[]
                                         • apiParaRegistro(): anoEscolar→ano, tipoErro→tipo,
                                           descricaoProblema→descricao, linkEvidencia→evidencia…
        ▼
js/indicadores.js  prepararRegistros()
  • _data (dd/mm/aaaa hh:mm), _categoria (via classificacoes; fallback tipoErro),
    _idDuplicado, inconsistências
        ▼
js/app.js  base (memória) ──► GGE.filtros.aplicar() ──► filtrados
        │                                  │
        │                                  ├─► dashboard.renderVisaoGeral / renderAnalise / renderRelatorios
        │                                  └─► tabelas (renderTabela)
        └─► GGE.relatorios.montar(base)  (gerador de PDF usa a base completa, sem filtros globais)
```

- **Campos da API** **[COMPROVADO]**: `id, dataHora, modulo, anoEscolar, disciplina, colecao, tipoErro, classificacoes, descricaoProblema, linkEvidencia, registradoPor, planilhaOrigem, celulaOrigem, linhaOrigem, linhaBase`.
- **Escrita:** nenhuma. O sistema **não grava** na planilha nem em qualquer serviço. Persistência local: apenas `localStorage['gge.menuRecolhido']` (preferência visual).
- **Atualização dos dados:** a cada carregamento da página; o botão "Recarregar dados" faz `location.reload()`. Sem cache, sem polling.
- **Autenticação/autorização:** **inexistente no frontend**. O endpoint do Web App está em `js/api.js` (`CONFIG.APPS_SCRIPT_URL`); qualquer pessoa com esse endereço lê os dados, que incluem e-mails de quem registrou e links de evidência. O controle depende da configuração de publicação do Apps Script e da hospedagem — **não verificável a partir deste repositório**.
- **Validações e erros:** falhas de rede/timeout/JSON/`sucesso≠true` exibem aviso `#erro-carga`; divergência entre `total` da API e registros recebidos vira inconsistência; URLs de evidência passam por `urlSegura` (só `http/https`); textos são escapados (`esc`) antes de entrar no HTML; CSV protege contra injeção de fórmulas.
- **Código do Apps Script:** **não está no repositório**. Não foi possível auditá-lo.

---

## 8. Estado atual do desenvolvimento

### Comprovado
- Sem Git; datas de modificação mostram a sequência final: `filtros.js` (14:17) → `dashboard.js` (14:44) → `index.html`/`app.js`/`style.css` (14:54–14:56) → `relatorios.js` (14:59).
- Nenhum TODO/FIXME no código.
- Execução headless (Edge) sem erros; seções e gráficos renderizados; API respondendo.
- O gerador de PDF produziu arquivos válidos em teste (PDF completo: 5 páginas, ~185 KB; tabela com 55 linhas paginada; acentos corretos).

### Última tarefa executada
**Implementação da seção Relatórios como gerador de PDF** (`js/relatorios.js`, alterações em `index.html`, `js/app.js`, `css/style.css`). Concluída e testada; ficaram **decisões em aberto** comunicadas ao responsável:
1. Manter, reduzir ou remover o "Relatório consolidado" legado (dois caminhos de "PDF" na mesma tela).
2. Definir o controle de acesso (Apps Script/hospedagem).
3. O logotipo só entra no PDF quando a página é servida por HTTP (Live Server/hospedagem); em `file://` o cabeçalho sai só com texto.

### Hipóteses
- [HIPÓTESE] O favicon "PCP" é intencional (o rodapé usa "SGGE-PCP").
- [HIPÓTESE] Materiais anuais seriam registrados com módulo "Anual"/"Módulo Anual" — mapeamento implementado de forma conservadora, sem registros reais para confirmar.
- [HIPÓTESE] A coleção "EXTRA" será registrada exatamente com esse nome.

### Não verificado nesta auditoria
- Funcionamento em navegadores reais com mouse/touch (hover da rosca, tooltips, drawer em celular físico, download do PDF em Chrome/Edge/Firefox/Safari).
- Comportamento com volume grande de registros (milhares).
- Configuração de acesso do Web App do Apps Script.

---

## 9. Problemas e riscos identificados

| ID | Prioridade | Arquivo(s) | Evidência | Impacto | Correção recomendada |
|---|---|---|---|---|---|
| P-01 | **ALTA** | (projeto inteiro) | Não existe `.git`; histórico da conversa já foi perdido uma vez | Sem histórico nem rollback; qualquer alteração pode quebrar algo sem retorno | `git init`, `.gitignore`, commit de referência do estado atual; idealmente repositório remoto privado |
| P-02 | **ALTA** | `js/api.js`, Apps Script (externo) | Endpoint público no frontend; sem autenticação; dados incluem e-mails e links internos | Exposição de dados internos a quem obtiver a URL | Revisar "Quem tem acesso" no deploy do Apps Script (ex.: somente domínio institucional) e restringir a hospedagem do painel; avaliar autenticação |
| P-03 | MÉDIA | — | Não há testes no projeto (os testes desta fase ficaram em arquivos temporários fora do repositório) | Regressões silenciosas em cálculos e filtros | Criar `tests/` com testes das funções puras (`indicadores.js`, `filtros.aplicar`, `relatorios.filtrar`) executáveis com Node, sem dependências |
| P-04 | MÉDIA | `index.html` | Chart.js, Lucide, jsPDF, autotable e fonte vêm de CDNs | Sem internet/CDN: sem gráficos, ícones ou PDF (há mensagem de erro para Chart.js e jsPDF; ícones somem sem aviso) | Manter versões fixas (já estão); opcionalmente servir cópias locais em `assets/vendor/` |
| P-05 | MÉDIA | `index.html` (`#secao-relatorios`), `js/dashboard.js` (`renderRelatorios`, `exportarCSV`) | Gerador de PDF e "Relatório consolidado" (com "Imprimir / PDF") coexistem | Confusão para o usuário; dois recortes diferentes (parâmetros próprios × filtros globais) | Decidir: remover o consolidado, ou manter só "Exportar CSV"/qualidade da base, deixando claro o recorte |
| P-06 | MÉDIA | `js/dashboard.js` (773 linhas) | Um arquivo concentra utilitários, 3 plugins Chart.js, cards, gráficos, tabela, detalhe, consolidado e CSV | Manutenção difícil; alto risco de efeitos colaterais | Separar futuramente em `graficos.js`, `tabela.js`, `consolidado.js` (sem mudar comportamento) |
| P-07 | MÉDIA | `js/relatorios.js` (`carregarLogo`) | Logo carregado via canvas; em `file://` o canvas fica bloqueado | PDF sem logotipo quando aberto direto do disco | Documentar o uso via HTTP ou embutir o logo em base64 |
| P-08 | MÉDIA | `css/style.css` (`.tabela-compacta`) | Em 1440 px as tabelas cabem exatamente (1077/1077 px) | Textos maiores provocam rolagem horizontal | Monitorar; aceitar rolagem ou reduzir colunas em telas médias |
| P-09 | BAIXA | `js/dashboard.js` (`desenharTabela`) | Colunas ID/Data removidas levaram junto as marcas "dup." e "data inválida" | Inconsistências só aparecem no detalhe e em Relatórios | Opcional: indicador discreto na linha |
| P-10 | BAIXA | `js/indicadores.js` (`serieTemporal`, `serieComparativa`), `css/style.css` (`.kpis-4`, `.kpis-5`) | Funções e classes sem uso atual | Código morto | Remover em uma etapa de limpeza |
| P-11 | BAIXA | `index.html`, `js/api.js` | `mock-data.js` é carregado e gera 260 registros a cada abertura, mesmo com `USAR_DEMONSTRATIVO=false` | Custo pequeno e desnecessário | Carregar só quando o modo demonstrativo estiver ativo |
| P-12 | BAIXA | `js/dashboard.js` | Textos residuais "ocorrências" (rodapé das tabelas "Exibindo X de Y ocorrências", nome do CSV `ocorrencias-gge-…`, título do detalhe "Ocorrência …") | Terminologia mista | Padronizar para "apontamentos" se desejado |
| P-13 | BAIXA | `assets/logo-sgge-mini.png` | 575 KB / 1278×1230 px exibido a 40 px | Carregamento mais pesado | Versão reduzida (ex.: 128 px) |
| P-14 | BAIXA | `js/relatorios.js` (`codigoModulo`, coleção EXTRA) | Sem registros reais de "Anual" e "EXTRA" | Mapeamento pode não casar com o valor real futuro | Validar quando surgirem registros |
| P-15 | BAIXA | `css/style.css` | Tablet (~1000 px): terceiro card sozinho na linha; subtítulo do cabeçalho em 3 linhas | Estética em tablet | Ajustar grade intermediária |
| P-16 | BAIXA | Dados (planilha) | Registro com descrição "jhgjsjosfhgjhe" (aparenta teste) | Polui indicadores | Revisar na planilha (fora do escopo do código) |
| P-17 | BAIXA | `js/relatorios.js` | `_montarPdf` exposto em `GGE.relatorios` (gancho de teste) | Nenhum funcional | Remover ou manter documentado para testes |

Nenhum problema **CRÍTICO** (que impeça a execução) foi encontrado.

---

## 10. Pendências

1. **Decisão** sobre o "Relatório consolidado" (P-05).
2. **Decisão/verificação** do controle de acesso (P-02).
3. **Versionamento** (P-01) e **testes** (P-03).
4. **Validação manual em navegador real** (Live Server) das interações não verificáveis em headless.
5. Confirmar o padrão de cadastro de **Anual** e **EXTRA** na planilha (P-14).
6. Confirmar que o **favicon "PCP"** é o desejado.

---

## 11. Plano de continuidade priorizado

### ETAPA 1 — Recuperação e estabilização

| Atividade | Objetivo | Arquivos | Prioridade | Dependências | Resultado esperado | Critério de conclusão |
|---|---|---|---|---|---|---|
| 1.1 Controle de versão | Ter histórico e rollback | raiz (`.git`, `.gitignore`) | ALTA | autorização do responsável | Repositório com commit "estado de referência — 27/10/2026" | `git log` mostra o commit; `git status` limpo |
| 1.2 Roteiro de verificação manual | Validar em navegador real o que o headless não cobre | `index.html` via Live Server | ALTA | 1.1 | Checklist preenchido (filtros, drawer, menu, "Ver apontamentos", hover da rosca, PDF, mobile) | Todos os itens OK ou registrados como defeito |
| 1.3 Controle de acesso | Garantir que só usuários autorizados leiam os dados | Apps Script (externo), hospedagem | ALTA | responsável pelo Apps Script | Deploy com acesso restrito ao domínio institucional | Teste fora do domínio é recusado |

### ETAPA 2 — Conclusão das funcionalidades existentes

| Atividade | Objetivo | Arquivos | Prioridade | Dependências | Resultado esperado | Critério de conclusão |
|---|---|---|---|---|---|---|
| 2.1 Definir o papel do "Relatório consolidado" | Eliminar a sobreposição com o gerador | `index.html`, `js/dashboard.js` | MÉDIA | decisão do responsável | Seção Relatórios com um único fluxo claro | Interface sem caminhos duplicados de PDF |
| 2.2 Logo no PDF fora de HTTP | PDF sempre com identidade visual | `js/relatorios.js` | MÉDIA | 1.1 | Logo embutido ou orientação de uso | PDF gerado em `file://` e HTTP com logo |
| 2.3 Validar "Anual"/"EXTRA" e "Outras classificações" | Confirmar mapeamentos com dados reais | `js/relatorios.js`, `js/filtros.js`, `js/app.js` | BAIXA | registros reais na planilha | Contagens corretas | Opções retornam os registros esperados |

### ETAPA 3 — Melhorias técnicas e visuais (sem alterar comportamento)

| Atividade | Objetivo | Arquivos | Prioridade | Dependências | Resultado esperado | Critério de conclusão |
|---|---|---|---|---|---|---|
| 3.1 Testes das funções puras | Proteger cálculos e filtros | novo `tests/` | MÉDIA | 1.1 | Testes Node sem dependências | Testes passam no estado atual |
| 3.2 Divisão de `dashboard.js` | Manutenção | `js/dashboard.js` → novos módulos; `index.html` | MÉDIA | 3.1 | Mesmo comportamento, arquivos menores | Testes e checklist 1.2 sem regressão |
| 3.3 Limpeza de código morto e mock condicional | Reduzir peso e ruído | `js/indicadores.js`, `css/style.css`, `index.html`, `js/api.js` | BAIXA | 3.1 | Sem código não usado | Checklist sem regressão |
| 3.4 Terminologia residual e otimização de imagens | Consistência e desempenho | `js/dashboard.js`, `assets/logo-sgge-mini.png` | BAIXA | — | "apontamentos" em todos os textos; mini-logo leve | Revisão visual |
| 3.5 Layout tablet | Estética em 960–1200 px | `css/style.css` | BAIXA | — | Grade equilibrada | Captura em 1000 px sem vazios |
| 3.6 Dependências locais (opcional) | Funcionar sem CDN | `assets/vendor/`, `index.html` | BAIXA | 1.1 | Bibliotecas servidas localmente | Painel abre sem internet (exceto API) |

### ETAPA 4 — Evolução do sistema

**Previstas com evidência:** nenhuma funcionalidade nova está explicitamente prevista no código ou documentação além das pendências acima.

**Sugestões novas (sem evidência de previsão — avaliar com o responsável):**
- Comparação entre períodos/ciclos de produção (exigiria reintroduzir o recorte temporal).
- Exportação do PDF também com os filtros globais atuais ("relatório do que estou vendo").
- Cache local dos dados com indicação de "dados de hh:mm" para abertura mais rápida.
- Taxa de conformidade, **somente** quando existir uma base de materiais verificados.

---

## 12. Próxima tarefa recomendada

**Colocar o projeto sob controle de versão (Git) e registrar um commit de referência do estado atual.**

Justificativa: o projeto está funcional, mas não tem histórico. O próprio motivo desta auditoria (perda de contexto) mostra o risco. Todas as etapas seguintes alteram arquivos; com um ponto de restauração, qualquer regressão pode ser desfeita com segurança. É uma operação local, sem efeito na planilha, na API ou no comportamento do painel.

---

## 13. Informações necessárias para retomar o projeto

- **Como executar:** abrir a pasta no VS Code → extensão **Live Server** → "Open with Live Server" em `index.html` (necessário HTTP para o logo no PDF). Requer internet (CDNs e API).
- **Fonte de dados:** `CONFIG.APPS_SCRIPT_URL` em `js/api.js` (endpoint do Web App; tratar como informação interna). Para testar sem a API: `USAR_DEMONSTRATIVO: true` no mesmo arquivo (dados fictícios).
- **Contrato da API:** objeto `{sucesso, versao, atualizadoEm, total, resumo, dados[]}`; campos de `dados` listados em §7. Não alterar a aba `BASE_ERROS`, os nomes das colunas ou os campos do JSON sem ajustar `js/api.js`.
- **Paleta:** variáveis em `:root` de `css/style.css` — `--cor-editorial: #2563EB`, `--cor-diagramacao: #747687`, cores do menu `--sidebar-*`.
- **Regras que não devem ser quebradas:**
  - cada linha = um apontamento; combinados contam uma vez;
  - `Status` não entra nos indicadores;
  - não há taxa de conformidade;
  - filtros: OU dentro do grupo, E entre grupos; grupo vazio = todos;
  - páginas de análise = processo da página + combinados;
  - gerador de PDF usa a base completa com parâmetros próprios.
- **Pontos frágeis ao alterar:** ordem dos `<script>` em `index.html`; IDs usados pelo JS (`kpis-*`, `ch-*`, `spark-*`, `apontamentos-*`, `f-*`, `rel-*`); larguras das tabelas compactas; plugins Chart.js locais (`rotulosValor`, `rotulosPercentuais`, `rotulosExternos`, `rotulosPdf`).
- **Fora deste repositório:** código do Google Apps Script e a planilha — necessários para qualquer mudança no contrato de dados ou no controle de acesso.
