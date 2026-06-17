# Carbon Atlas: Sistema Interativo de Exploração de Emissões de CO₂

**Disciplina:** Design de Sistemas de Visualização Interativos

**Alunos:** Danilo Monteiro · Samuel Bello Ferreira

**Dataset:** OWID CO₂ and Greenhouse Gas Emissions Dataset

**Tecnologias:** D3.js v7 · DuckDB-WASM · TopoJSON

---

## 1. What (Abstração de Dados)

### 1.1 Fonte e Natureza do Dataset

O sistema utiliza o **OWID CO₂ Dataset** (Our World in Data / Global Carbon Project). O arquivo gerenciado em tempo de execução via DuckDB-WASM abrange uma série histórica robusta que se estende de **1750 a 2021**. A estrutura do dataset é longitudinal/painel, contendo registros anuais indexados por país e por códigos geoespaciais padronizados.

### 1.2 Atributos Selecionados e Tipos de Dados (Mapeamento de Munzner)

Para estender a análise além das emissões básicas e cobrir todos os módulos implementados no sistema (como os gráficos de ranking e eficiência energética encontrados em `plot.js`), os atributos são abstratizados da seguinte forma:

| Coluna / Atributo | Tipo de Atributo (Munzner) | Tipo de Escala | Semântica Categórica / Quantitativa | Dimensão Analítica |
| --- | --- | --- | --- | --- |
| `country` / `Entity` | Categórico | Nominal | Identificador do país/região | **WHERE** |
| `iso_code` / `Code` | Categórico | Nominal | Chave de junção geoespacial (ISO-3) | **WHERE** (Chave) |
| `year` | Ordenado | Quantitativo (Intervalo) | Dimensão temporal contínua | **WHEN** |
| `co2` | Quantitativo | Razão (*Ratio*) | Emissões absolutas anuais de CO₂ (MtCO₂) | **WHAT** (Magnitude) |
| `co2_per_capita` | Quantitativo | Razão (*Ratio*) | Emissões per capita (tCO₂/habitante) | **WHAT** (Intensidade) |
| `cumulative_co2` | Quantitativo | Razão (*Ratio*) | Emissão histórica acumulada | **WHAT** (Histórico) |
| `share_global_co2` / `CO2_Share` | Quantitativo | Razão (*Ratio*) | Percentual de contribuição global (%) | **WHAT** (Proporção) |
| `gdp` | Quantitativo | Razão (*Ratio*) | Produto Interno Bruto (PIB em USD) | Covariável Econômica |
| `population` | Quantitativo | Razão (*Ratio*) | População total do país | Covariável de Escala |
| `Energy_TWh` | Quantitativo | Razão (*Ratio*) | Consumo de energia primária em TWh | **WHAT** (Matriz Energética) |
| `Carbon_Intensity` | Quantitativo | Razão (*Ratio*) | Intensidade de carbono por unidade de energia | **WHAT** (Eficiência) |
| `continent` | Categórico | Nominal | Agrupamento macrorregional | Metadado Geográfico |

### 1.3 Estruturas de Dados Internas e Transformações (DuckDB-WASM & Estado)

Em vez de depender de pré-processamento estático, o pipeline de dados realiza transformações dinâmicas *in-browser*:

1. **Limpeza de Agregados:** Filtros SQL eliminam pseudo-países inseridos pelo OWID (ex: `World`, `G20`, divisões por faixas de renda) garantindo que a escala macro do mapa e do scatter plot represente entidades mutuamente exclusivas. O critério consiste em validar `length(iso_code) = 3` e omitir prefixos como `OWI%`.
2. **Derivação de Atributos em Tempo de Execução:** A covariável `gdp_per_capita` é calculada dinamicamente via SQL utilizando a expressão protetiva `COALESCE(gdp / NULLIF(population, 0), 0)`.
3. **Estrutura de Estado para Múltiplas Seleções:** Para suportar a comparação simultânea de trajetórias, o estado da aplicação encapsula não apenas um país isolado, mas uma coleção dinâmica sob a chave `selectedCountries`, permitindo análises comparativas de n-gargalos sobrepostos.
4. **Camada de Cache de Consultas (`queryCache`):** Para mitigar a latência de processamento em transições e animações temporais fluidas, o sistema implementa um mecanismo de memorização estruturado em três eixos nativos (`mapData`, `topEmissions`, `seriesData`), mapeando chaves combinadas (`metric:year`) diretamente para estruturas prontas para consumo pelo D3.

---

## 2. Why (Tarefas de Visualização — Ação e Alvo)

O sistema Carbon Atlas foi arquitetado para suportar consultas complexas combinando visões coordenadas. Abaixo, as tarefas são mapeadas rigorosamente sob o framework **Ação × Alvo** de Munzner:

### 2.1 Tarefa T1 — Analisar a Distribuição Geográfica Global (WHERE)

* **Ação:** Apresentar (*Present*) $\rightarrow$ Comparar (*Compare*).
* **Alvo:** Distribuição espacial de uma métrica selecionada (`co2`, `co2_per_capita`, `cumulative_co2`).
* **Justificativa:** O mapa coroplético atua como a âncora espacial (Overview). Ele permite descobrir anomalias geográficas e contrastar instantaneamente magnitudes continentais em um ano específico.

### 2.2 Tarefa T2 — Avaliar a Evolução e Tendência Temporal Multivariável (WHEN)

* **Ação:** Identificar (*Identify*) $\rightarrow$ Comparar (*Compare*) tendências.
* **Alvo:** Trajetórias temporais de múltiplos países selecionados em paralelo.
* **Justificativa:** Ao permitir que múltiplos países sejam selecionados e renderizados na mesma área de plotagem (visão de séries temporais), o usuário quebra o isolamento do dado pontual e realiza comparações diretas de taxas de crescimento ou inflexão histórica (ex: comparar o momento exato em que a China ultrapassa os EUA em emissões absolutas vs. o comportamento estável das emissões per capita europeias).

### 2.3 Tarefa T3 — Investigar o Ranking e a Magnitude Relativa dos Poluidores (WHAT)

* **Ação:** Classificar (*Rank*) $\rightarrow$ Comparar (*Compare*) magnitudes.
* **Alvo:** Subconjunto ordenado dos maiores emissores (*Top Emissions*).
* **Justificativa:** O gráfico de barras fornece uma ordenação linear precisa das entidades. Enquanto o mapa sinaliza a localização, o gráfico de barras elimina distorções de percepção de área geográfica, permitindo a comparação exata de magnitudes contíguas através de um canal visual altamente eficaz (comprimento/posição em escala comum).

### 2.4 Tarefa T4 — Correlacionar Consumo de Energia, Eficiência e Impacto (WHAT × WHAT)

* **Ação:** Correlacionar (*Correlate*) $\rightarrow$ Identificar *Outliers*.
* **Alvo:** Distribuição multivariada (`Energy_TWh` × `CO2_Share` × `Carbon_Intensity`).
* **Justificativa:** O gráfico de eficiência energética (Scatter Plot) permite ao analista avaliar se o aumento no consumo de energia de um país está diretamente atrelado a uma matriz carbônica agressiva ou se há um desacoplamento tecnológico (alta eficiência/baixa intensidade de carbono).

### 2.5 Justificativa Lógica para Visões Coordenadas (Linked Views)

Uma tela isolada geraria sobrecarga cognitiva ou ocultaria dimensões críticas. O Carbon Atlas resolve o problema coordenando as visões por meio de **Seleção Compartilhada (Shared Selection)** e **Navegação Temporal Sincronizada**:

* Ao alterar o ano corrente (via teclado ou slider), o Mapa Coroplético (Distribuição Espacial), o Gráfico de Barras (Ranking de Magnitude) e o Gráfico de Eficiência (Scatter Plot) atualizam seus eixos e posições em sincronia perfeita.
* Uma seleção de país por clique no mapa ou duplo-clique na listagem adiciona a entidade à série temporal. Isso materializa o mantra de Shneiderman: *Overview first (Mapa/Scatter), zoom and filter (Seleção de Países/Métricas), then details-on-demand (Linhas de Tendência e Tooltips).*

---

## 3. How (Design Visual e Eficácia de Canais)

### 3.1 Ranking de Eficácia de Canais Visuais (Munzner)

O design visual respeita estritamente as restrições de legibilidade humana, priorizando canais de alta precisão para atributos quantitativos:

| Gráfico / Visão | Atributo Codificado | Marcador Utilizado | Canal Visual Aplicado | Posição no Ranking de Munzner | Justificativa de Design |
| --- | --- | --- | --- | --- | --- |
| **V1: Mapa Coroplético** | Métrica Ativa (`co2`, etc.) | Polígono (Área Geográfica) | Luminosidade/Saturação Sequencial | Alta (para dados coropléticos) | Uso de escala logarítmica (`scaleSequentialLog`) para dados de cauda longa, prevenindo que gigantes como EUA/China saturem a escala e tornem invisíveis as variações de países de menor porte. |
| **V2: Séries Temporais** | Ano (`year`) | Linha / Ponto | Posição horizontal (Eixo X) | 1º Lugar (Dados Quantitativos) | Alinhamento padrão ouro para percepção de tendências temporais contínuas. |
|  | Métrica de Emissão | Linha / Ponto | Posição vertical (Eixo Y) | 1º Lugar (Dados Quantitativos) | Permite avaliar inclinação e aceleração das curvas históricas de forma precisa. |
| **V3: Gráfico de Barras** | Entidade (`country`) | Linha/Barra | Posição vertical (Eixo Y) | 1º Lugar (Dados Categóricos) | Estrutura de ranking linear vertical facilitando a leitura de rótulos textuais de países. |
|  | Magnitude da Emissão | Linha/Barra (Comprimento) | Posição horizontal / Comprimento (Eixo X) | 1º Lugar (Dados Quantitativos) | O comprimento a partir de uma linha de base comum zero elimina ambiguidades de leitura de escala. |
| **V4: Gráfico de Eficiência** | Consumo de Energia (`Energy_TWh`) | Círculo (Ponto) | Posição horizontal (Eixo X) | 1º Lugar (Dados Quantitativos) | Eixo referencial de entrada. |
|  | Proporção de CO₂ (`CO2_Share`) | Círculo (Ponto) | Posição vertical (Eixo Y) | 1º Lugar (Dados Quantitativos) | Eixo vertical mapeando impacto proporcional direto. |
|  | Intensidade / Metadados | Círculo | Raio/Área ou Opacidade | 3º Lugar (Dados Quantitativos) | O uso de `scaleSqrt` para dimensões circulares ou variações controladas de opacidade garante distinção sem poluição visual. |

### 3.2 Mecanismos de Interação e Fluidez (Inovação e Redução de Carga)

A interatividade foi projetada para remover barreiras físicas de cliques repetitivos:

* **Navegação Temporal via Teclado (`ArrowLeft` / `ArrowRight`):** O mapeamento de eventos de teclado intercepta as setas direcionais para decrementar ou incrementar o `selectedYear` de forma fluida. Isso permite ao usuário fixar os olhos nos gráficos e assistir à animação da evolução histórica frame a frame sem precisar arrastar um slider continuamente com o mouse.
* **Seleção Avançada por Duplo Clique (`dblclick`):** Implementada no componente de listagem (`countrySelect`), a ação captura múltiplos elementos simultaneamente, despachando-os para a função `toggleCountrySelection` e gerando as tags dinâmicas de remoção rápida (*Selection Tags/Pills*), minimizando o esforço de personalização do painel.
* **Isolamento de Tooltip Unificado (`.map-tooltip`):** Um elemento singleton injetado diretamente no `body` intercepta as coordenadas do mouse (`event.pageX`, `event.pageY`) em qualquer um dos gráficos. A unificação da string HTML interna do tooltip garante consistência textual completa nas transições entre os componentes visuais.

---

## 4. Detalhes de Implementação e Domínio de D3.js

### 4.1 Gerenciamento de Estado Unificado

Para evitar divergências entre visões coordenadas, a aplicação opera com um fluxo de dados estrito controlado por um único objeto global de estado (`appState`). Nenhuma visão armazena estado próprio; elas reagem a mutações centralizadas:

```javascript
let appState = {
    selectedCountry: 'USA',       // Foco de seleção primária
    selectedCountries: ['USA'],   // Coleção para comparação multivariada
    selectedYear: 2021,           // Âncora temporal (WHEN)
    minYear: 1750,                // Limiar inferior do dataset do OWID
    maxYear: 2021,                // Limiar superior do dataset do OWID
    mapData: [],                  // Cache estruturado para o Mapa Coroplético
    seriesData: [],               // Estruturas de séries históricas ativas
    isPlaying: false,             // Flag de controle da animação de linha do tempo
    availableCountries: []        // Vetor de indexação de busca rápida
};

```

### 4.2 Sincronização Estatística e Escalas de D3

O código demonstra domínio avançado na aplicação de transformações matemáticas matemáticas do D3 para mapeamento de dados brutos:

* **Uso do Padrão Data Join (`.join()`):** Nas atualizações críticas (como o redesenho do ranking ou dos nós do scatter), o ciclo de vida dos elementos do D3 gerencia explicitamente as transições de `enter`, `update` e `exit`, evitando o custo computacional de recriação destrutiva do DOM. Apenas atributos mutáveis (como `fill`, `cx`, `cy` ou `width`) são alterados.
* **Dimensionamento Responsivo Dinâmico:** Conforme verificado na função `updateBarChart` do arquivo `plot.js`, o tamanho do SVG não é estático. Ele calcula as dimensões do container dinamicamente em tempo de execução através do nó do DOM:
```javascript
const width = (container.node()?.clientWidth || 400) - margin.left - margin.right;
const height = (container.node()?.clientHeight || 400) - margin.top - margin.bottom;

```


Isso garante que o sistema de coordenadas espaciais do D3 (`viewBox`) e as funções de escala ajustem-se perfeitamente a qualquer resolução de tela ou redimensionamento de janela.

### 4.3 Integração Arquitetural com DuckDB-WASM

A inicialização do banco de dados vetorial embutido utiliza a seleção de bundles dinâmicos:

```javascript
const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
const worker = new Worker(bundle.mainWorker);
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

```

Essa arquitetura isola o processamento analítico pesado (agregações de tabelas de 50 mil linhas) em um worker em segundo plano, impedindo o travamento da thread principal de renderização do navegador e mantendo a taxa de quadros (*framerate*) de interação do D3 constante e altamente responsiva.

---

## 5. Referências Bibliográficas

1. MUNZNER, Tamara. **Visualization Analysis and Design**. Boca Raton: CRC Press, 2014.
2. SHNEIDERMAN, Ben. **The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations**. In: IEEE Symposium on Visual Languages, 1996, pp. 336-343.
3. RITCHIE, Hannah; ROSADO, Pablo; ROSER, Max. **CO₂ and Greenhouse Gas Emissions Dataset**. Our World in Data, 2023. Disponível em: [https://ourworldindata.org/co2-and-greenhouse-gas-emissions](https://ourworldindata.org/co2-and-greenhouse-gas-emissions).
4. D3.JS. **Data-Driven Documents v7 Documentation**. Disponível em: [https://d3js.org](https://d3js.org).
5. DUCKDB. **DuckDB-WASM: In-Browser Analytical SQL Budgeting**. Disponível em: [https://duckdb.org/docs/api/wasm](https://duckdb.org/docs/api/wasm).