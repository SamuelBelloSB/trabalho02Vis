# Carbon Atlas: Sistema Interativo de Exploração de Emissões de CO₂

**Disciplina:** Design de Sistemas de Visualização Interativos  
**Alunos:** Danilo Murilo  · Samuel Bello  
**Dataset:** OWID CO₂ and Greenhouse Gas Emissions Dataset  
**Tecnologias:** D3.js v7 · DuckDB-WASM

---

## 1. What (Abstração de Dados)

### 1.1 Fonte e Natureza do Dataset

O dataset utilizado é o **OWID CO₂ Dataset** (Our World in Data / Global Carbon Project), disponível publicamente em `github.com/owid/co2-data`. O arquivo CSV contém **~50 mil linhas**, com uma linha por país por ano (1750–2022), e mais de 70 colunas cobrindo emissões absolutas, per capita, por fonte de combustível, emissões acumuladas históricas, dados de energia e indicadores socioeconômicos.

### 1.2 Atributos Selecionados e Seus Tipos (Munzner)

| Coluna | Tipo Munzner | Semântica |
|---|---|---|
| `country` | Categórico | Identificador nominal do país |
| `iso_code` | Categórico (chave) | Código ISO-3 — chave de junção geoespacial |
| `year` | Ordenado (quantitativo) | Dimensão temporal (WHEN) |
| `co2` | Quantitativo (ratio) | Emissões anuais de CO₂ (MtCO₂) — WHERE/WHAT |
| `co2_per_capita` | Quantitativo (ratio) | Emissões per capita (tCO₂/pessoa) |
| `cumulative_co2` | Quantitativo (ratio) | Total histórico acumulado de CO₂ |
| `share_global_co2` | Quantitativo (ratio) | Percentual da emissão global |
| `gdp` | Quantitativo (ratio) | PIB (USD) — covariável |
| `population` | Quantitativo (ratio) | População — covariável de escala |
| `continent` | Categórico | Agrupamento regional (WHY) |

**Atributo derivado:** `gdp_per_capita = gdp / population` — derivado via SQL no DuckDB-WASM em tempo de execução, sem pré-processamento offline.

### 1.3 Transformações Realizadas (DuckDB-WASM)

Todas as transformações são executadas em SQL dentro do navegador via DuckDB-WASM:

```sql
-- Filtro: exclui agregados OWID (ex: "World", "G20", grupos de renda)
-- critério: iso_code com exatamente 3 caracteres e sem prefixo 'OWI'
WHERE length(iso_code) = 3 AND iso_code NOT LIKE 'OWI%'

-- Derivação de gdp_per_capita
COALESCE(gdp / NULLIF(population, 0), 0) AS gdp_per_capita

-- Recorte temporal: 1900–2022 (período com dados densos)
AND year >= 1900 AND year <= 2022
```

**Justificativa:** A exclusão de agregados (World, G20) evita dupla-contagem e artefatos na escala de cor do mapa. O recorte pós-1900 elimina dados esparsos do século XIX que distorceriam as escalas logarítmicas. A derivação de `gdp_per_capita` in-browser mantém o pipeline totalmente reprodutível sem etapas offline.

---

## 2. Why (Tarefas de Visualização)

O sistema foi projetado para suportar três famílias de tarefas, descritas usando o framework de **Ação × Alvo** de Munzner:

### 2.1 Tarefa T1 — Comparar distribuição geográfica (WHERE)

- **Ação:** Comparar  
- **Alvo:** Distribuição (atributo `co2` por país em um ano)  
- **Rationale:** O usuário precisa identificar rapidamente *quais* países dominam as emissões globais em um determinado ano. Uma visão geográfica codificada por cor (Choropleth) é o canal mais intuitivo para comunicar distribuição espacial.

### 2.2 Tarefa T2 — Explorar trajetória temporal de um país (WHEN)

- **Ação:** Identificar + Comparar  
- **Alvo:** Tendência (série temporal de um país vs. média mundial)  
- **Rationale:** A seleção de um país no mapa dispara uma visão de detalhe com a série histórica 1900–2022 do país, sobreposta à média mundial (linha de referência). Isso implementa o padrão **Overview + Detail on Demand** de Shneiderman: o mapa fornece o overview, o gráfico de linha provê o detalhe temporal.

### 2.3 Tarefa T3 — Correlacionar emissões com desenvolvimento econômico (WHAT)

- **Ação:** Descobrir (discover) + Correlacionar  
- **Alvo:** Distribuição bivariada (CO₂ per capita × PIB per capita)  
- **Rationale:** A hipótese central da literatura climática é que emissões e riqueza estão historicamente correlacionadas, mas que países ricos já começam a desacoplar. O scatter plot log×log expõe essa estrutura. O tamanho dos pontos codifica população (canal quantitativo de área), e a cor codifica região (canal nominal de matiz).

### 2.4 Necessidade de Visões Coordenadas

Nenhuma visão isolada responde às três perguntas simultaneamente. O usuário pode, por exemplo:

1. Ver no mapa (V1) que a China domina as emissões em 2022 → clicar
2. No gráfico de linha (V2), observar que a China só ultrapassou os EUA após ~2005
3. No scatter (V3), perceber que a China ainda tem CO₂ per capita muito inferior aos EUA

Essa narrativa multi-passo só emerge através da **coordenação de visões com seleção compartilhada**, que reduz a carga cognitiva ao manter o contexto visual enquanto o usuário drila em detalhes.

---

## 3. How (Design Visual)

### 3.1 Eficácia de Canais Visuais (Munzner)

| Atributo | Canal | Ranking Munzner | Justificativa |
|---|---|---|---|
| CO₂ (mapa) | Matiz + Luminosidade (sequencial) | 4º (quantitativo) | Escala logarítmica com ramp monocromática. Log justificado pela distribuição de cauda longa (China/EUA >> países pequenos) |
| Ano (trend) | Posição X | 1º (quantitativo) | Canal mais eficaz para ordenação temporal |
| Emissão (trend) | Posição Y | 1º (quantitativo) | Comparação de magnitude da série temporal |
| CO₂/cap (scatter) | Posição Y (log) | 1º | Eixo primário de análise |
| GDP/cap (scatter) | Posição X (log) | 1º | Variável independente (desenvolvimento) |
| População (scatter) | Área (raiz quadrada) | 3º | Canal de quantidade — `scaleSqrt` garante proporcionalidade de área |
| Continente (scatter) | Matiz | 1º (categórico) | Paleta com 6 matizes distinguíveis perceptivamente |

**Escala logarítmica no scatter:** Justificada pelo range de GDP/capita (centenas a >100k USD) e CO₂/capita (0.1 a ~20 t). Escalas lineares colapsariam 80% dos países em clusters ilegíveis.

### 3.2 Marcadores

- **Mapa:** Polígono preenchido (shape encoding geográfico) — único marcador adequado para dados regionais contíguos
- **Trend:** Linha + Área sombreada — conecta pontos temporais ordenados; a área sublinha a magnitude acumulada sob a curva
- **Scatter:** Círculo — forma neutra, área escalável, eficiente para grandes N

### 3.3 Mecanismos de Interação (Taxonomia de Munzner)

| Tipo | Implementação | Objetivo |
|---|---|---|
| **Select** | Click em país (mapa ou scatter) | Dispara linked highlight e carrega trend da visão 2 |
| **Filter** | Botões de métrica, slider de ano | Reduz o espaço de dados mostrado — foco em subconjunto |
| **Navigate** | Slider temporal (1900–2022) | Anima o estado do mapa e scatter por ano |
| **Connect** | Highlight sincronizado | Mantém identidade do país selecionado em todas as visões |
| **Encode** | Troca de métrica | Altera o canal de cor do mapa + eixo Y do trend |

### 3.4 Redução de Carga Cognitiva

- **Tooltip unificado:** Aparece em qualquer das três visões com as mesmas métricas-chave, evitando que o usuário precise navegar entre visões para obter contexto numérico
- **Cursor de ano no trend:** Uma linha vertical na visão temporal indica o ano do slider global, mantendo consistência temporal entre as visões
- **Selection pill:** O país selecionado é exibido no header de controles, tornando o estado de seleção sempre visível (princípio de visibilidade do estado do sistema)

---

## 4. Decisões de Implementação

### 4.1 Gerenciamento de Estado

O objeto `STATE` centraliza o estado da aplicação:

```javascript
const STATE = {
  year:     2022,   // ano corrente (slider)
  metric:   'co2',  // métrica ativa
  selected: null,   // iso3 do país selecionado
  allData:  [],     // dataset completo (carregado uma vez)
};
```

Toda interação chama `renderX()` nas visões afetadas — arquitetura **unidirecional** sem estado distribuído, o que simplifica debug e garante consistência entre visões.

### 4.2 Escalas D3

- `d3.scaleSequentialLog` para métricas com distribuição de cauda longa (co2, cumulative_co2)
- `d3.scaleSequential` para métricas com distribuição mais uniforme (per capita, share)
- `d3.scaleSqrt` para raio de círculo no scatter (garante que área ∝ população)
- `d3.scaleLog` nos dois eixos do scatter (GDP e CO₂ per capita)

### 4.3 DuckDB-WASM

O DuckDB é inicializado com `getJsDelivrBundles()` que seleciona automaticamente o bundle WASM correto para o navegador (multithreaded se SharedArrayBuffer disponível, single-thread caso contrário). O CSV do OWID é lido diretamente via `read_csv_auto()` sem download prévio, usando o suporte HTTP nativo do DuckDB.

### 4.4 Atualização do DOM

D3 `join()` com funções `enter/update/exit` separadas garante que apenas os elementos alterados sejam re-renderizados nas interações de ano (evita re-criar todos os ~180 polígonos a cada tick do slider).

---

## 5. Trade-Offs

- Encontramos falhas na exibição do eixo X das visualizações ao executar a animação de passagem de tempo. A visualização aplica um efeito de zoom in, que prejudica a leitura do eixo X. Atribuímos essa falha ao `.transform` e `translate()`, mas dentro do período de desenvolvimento do trabalho não conseguimos solucionar.

---

## 6. Melhorias Futuras

- Queremos correlacionar os dados de emissões de CO₂ com os dados sobre eficiência energética. Mas devido a grande dispariedade dos dados em questão, não conseguimos em tempo hábil solucionar esse problema com os datasets que tínhamos disponíveis.

- Queremos correlacionar os dados de emissões de CO₂ com os dados sobre Taxa Geométrica de Crescimento Anual (TGCA) e renda per capita. Mas também não encontramos datasets sobre informações globais e de boa qualidade.

---

## 7. Referências

- MUNZNER, Tamara. *Visualization Analysis and Design*. CRC Press, 2014.
- RITCHIE, H.; ROSADO, P.; ROSER, M. *Our World in Data — CO₂ and Greenhouse Gas Emissions*. 2023. Disponível em: ourworldindata.org/co2-and-greenhouse-gas-emissions
- Global Carbon Project. *Global Carbon Budget 2023*. Earth System Science Data, 2023.
- SHNEIDERMAN, B. *The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations*. IEEE Symposium on Visual Languages, 1996.
- D3.js Documentation — v7. https://d3js.org
- DuckDB-WASM Documentation. https://duckdb.org/docs/api/wasm
