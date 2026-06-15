# trabalho02Vis

Carbon Atlas: Sistema Interativo de Exploração de Emissões de CO2.

Este projeto utiliza D3.js para visualizações dinâmicas e DuckDB-WASM para processamento de dados analíticos diretamente no navegador.

## Como Executar

Para configurar e executar o projeto localmente:

1. Certifique-se de ter o Node.js instalado.
2. Na raiz do projeto, instale as dependências:
   ```bash
   npm install
   ```
3. Em seguida, inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   O projeto será aberto automaticamente no seu navegador ou o endereço será indicado no terminal.

## Estrutura do Projeto

- src/main.js: Ponto de entrada. Gerencia o estado global, a instância do DuckDB e a coordenação entre filtros e gráficos.
- src/plot.js: Biblioteca de renderização. Contém as funções D3 para o Mapa, Gráfico de Séries Temporais, Barras e Scatter Plot.
- 00 - data/: Armazena o dataset e seus metadados.

## Integracao de Dados

O pipeline de dados segue o fluxo:
1. Ingestao: O CSV é registrado no sistema de arquivos virtual do DuckDB.
2. Transformacao: SQL é utilizado para tipagem, cálculo de janelas e limpeza de agregados regionais.
3. Vinculacao Geoespacial: O mapa faz a junção entre o atributo Code do banco e o ID dos elementos no SVG.

## Padroes de Design

- Escala de Cores: Utiliza esquemas de cores sequenciais para representar densidade de emissões.
- Interatividade: Implementa destaque sincronizado entre o Scatter Plot e o Mapa.

## Documentacao Academica

Para detalhes sobre a abstração de dados, tarefas e canais visuais, consulte o arquivo RELATORIO.md.
