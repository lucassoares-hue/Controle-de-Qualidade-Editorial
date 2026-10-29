# Controle de Qualidade Editorial — SGGE-PCP

Dashboard do Sistema GGE de Ensino para acompanhar os apontamentos de qualidade editorial e de diagramação registrados pela equipe de Arte e Finalização.

## Funcionalidades

- **Visão Geral**: indicadores, distribuição por tipo, apontamentos por módulo (M1 → ANUAL → M2 → M3 → M4), por coleção, disciplina e ano escolar, e tabela de apontamentos.
- **Análise Editorial** e **Análise de Diagramação**: indicadores e gráficos de cada processo; os registros combinados entram nos dois.
- **Filtros globais** com seleção múltipla (OU dentro do grupo, E entre grupos).
- **Relatórios**: gerador de PDF com parâmetros próprios. O acesso pede uma senha de gestão (veja [Segurança](#segurança)).
- Tema claro e escuro, com a preferência salva no navegador.

## Arquitetura

Aplicação estática (HTML, CSS e JavaScript puro), sem etapa de build.

| Camada | Tecnologia |
|---|---|
| Dados | Google Sheets (aba `BASE_ERROS`), exposta por um Web App do Google Apps Script (`GET`, JSON) |
| Gráficos | Chart.js 4.4.1 |
| PDF | jsPDF 2.5.1 + jsPDF-AutoTable 3.8.2 |
| Ícones | Lucide 0.454.0 |

As bibliotecas são carregadas por CDN. O endereço do Web App fica em `js/api.js` (`CONFIG.APPS_SCRIPT_URL`).

```
index.html          página única
css/style.css       estilos e temas (variáveis CSS)
js/api.js           integração com o Apps Script
js/indicadores.js   preparação dos registros e cálculos
js/filtros.js       filtros globais
js/dashboard.js     gráficos, cards e tabelas
js/relatorios.js    gerador de PDF
js/app.js           inicialização, navegação, acesso e tema
js/mock-data.js     dados demonstrativos (usados se a API falhar)
assets/             logotipos e ícones
```

## Executar localmente

Sirva a pasta por HTTP (o logotipo no PDF depende disso):

```bash
python -m http.server 8000
# abra http://localhost:8000
```

Ou use a extensão Live Server do VS Code.

## Segurança

- **Dados:** o Web App do Apps Script é público para quem tiver o endereço, e os dados incluem e-mails e links internos. Antes de publicar o painel, restrinja o acesso ao Web App (por exemplo, somente ao domínio institucional).
- **Senha de Relatórios:** é uma barreira de navegação no frontend, não uma autenticação. O código guarda apenas o hash SHA-256 da senha (`HASH_SENHA` em `js/app.js`), mas ela pode ser contornada por quem tiver conhecimento técnico.
- Para trocar a senha, gere o SHA-256 da nova senha e substitua `HASH_SENHA`.

## Documentação

Detalhes técnicos, riscos e pendências estão em [RELATORIO_CONTINUIDADE_PROJETO.md](RELATORIO_CONTINUIDADE_PROJETO.md).

## Licença

Uso interno do Sistema GGE de Ensino. Todos os direitos reservados.
