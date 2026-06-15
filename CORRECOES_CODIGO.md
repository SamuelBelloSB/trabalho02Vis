# 🔧 CORREÇÕES DE CÓDIGO PRONTAS PARA IMPLEMENTAÇÃO

Este ficheiro contém snippets de código corrigidos para cada bug identificado. Copie e cole directamente nos ficheiros correspondentes.

---

## BUG #1: d3.xml() Deprecated

**Ficheiro:** `src/plot.js`  
**Localização:** Função `loadChoroplethMap` (linha ~95)

### ❌ CÓDIGO ACTUAL (QUEBRADO EM D3 V7+)
```javascript
// Select map features with id (ISO3) and color them
const svgDoc = await d3.xml('/share-of-cumulative-co2.svg');
container.node().appendChild(svgDoc.documentElement);
```

### ✅ CÓDIGO CORRIGIDO
```javascript
// Carregar SVG com fetch + DOMParser (compatível com D3 v7+)
let svg = container.select('svg');
if (svg.empty()) {
    try {
        const response = await fetch('/share-of-cumulative-co2.svg');
        if (!response.ok) throw new Error(`HTTP ${response.status}: SVG não encontrado`);
        
        const svgText = await response.text();
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        
        // Validar se o parse foi bem-sucedido
        if (svgDoc.getElementsByTagName('parsererror').length > 0) {
            throw new Error('SVG inválido ou mal-formado');
        }
        
        // Clonar para evitar problemas de references
        container.node().appendChild(svgDoc.documentElement.cloneNode(true));
        svg = container.select('svg');
    } catch (error) {
        console.error('Erro ao carregar SVG:', error);
        container.html(`<div style="color: #f44; padding: 20px; text-align: center;">
            <strong>Erro:</strong> ${error.message}<br/>
            <small>Verifique se o ficheiro /share-of-cumulative-co2.svg existe.</small>
        </div>`);
        return; // Exit early
    }
}
```

---

## BUG #2: Event Listener Leaks (CRÍTICO)

**Ficheiro:** `src/plot.js`  
**Localização:** Função `loadChoroplethMap` (linha ~115-140)

### ❌ CÓDIGO ACTUAL (MEMORY LEAK)
```javascript
// Select map features with id (ISO3) and color them
svg.selectAll('[id]')
    .filter(function() { return this.id && this.id.length === 3; })
    .each(function() {
        const node = d3.select(this);
        const iso = this.id.toUpperCase();
        const entry = codeMap.get(iso);
        const val = entry ? entry.Emission : null;
        const fill = (val === null || val === 0) ? '#2a2a2a' : colorScale(val);
        
        // Transição para evitar o estado "estático"
        node.transition().duration(250).attr('fill', fill);

        // ❌ PROBLEMA: Listeners são RE-BINDADOS a cada atualização!
        node.on('mousemove', function(event) {
            tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY + 15) + 'px');
        })
        node.on('mouseover', function(event) {
            node.style('stroke', '#fff').style('stroke-width', '1px').raise();
            tooltip.style('display', 'block').html(`<strong>${entry ? entry.Entity : iso}</strong>: ${val ? val.toFixed(2) + '%' : 'N/A'}`);
        })
        .on('mouseout', function() {
            node.style('stroke', null).style('stroke-width', null);
            tooltip.style('display', 'none');
        })
        .on('click', () => onCountryClick(iso));
    });
```

### ✅ CÓDIGO CORRIGIDO
```javascript
// Singleton pattern: Listeners apenas uma vez
// Usar merge() para separar lógica de color fill da lógica de event binding

// PASSO 1: Atualizar cores (sem re-binding listeners)
const features = svg.selectAll('[id]')
    .filter(function() { return this.id && this.id.length === 3; });

features.transition().duration(250)
    .attr('fill', function() {
        const iso = this.id.toUpperCase();
        const entry = codeMap.get(iso);
        const val = entry ? entry.Emission : null;
        return (val === null || val === 0) ? '#2a2a2a' : colorScale(val);
    });

// PASSO 2: Bind listeners uma única vez (if not already bound)
features
    .on('mousemove', function(event) {
        const iso = this.id.toUpperCase();
        tooltip.style('left', (event.pageX + 15) + 'px')
               .style('top', (event.pageY + 15) + 'px');
    })
    .on('mouseover', function(event) {
        const iso = this.id.toUpperCase();
        const entry = codeMap.get(iso);
        const val = entry ? entry.Emission : null;
        
        d3.select(this).style('stroke', '#fff').style('stroke-width', '1px').raise();
        tooltip.style('display', 'block')
               .html(`<strong>${entry ? entry.Entity : iso}</strong>: ${val ? val.toFixed(2) + '%' : 'N/A'}`);
    })
    .on('mouseout', function() {
        d3.select(this).style('stroke', null).style('stroke-width', null);
        tooltip.style('display', 'none');
    })
    .on('click', function() {
        const iso = this.id.toUpperCase();
        onCountryClick(iso);
    });
```

---

## BUG #3: Null/Undefined em Delta (Scatter Plot)

**Ficheiro:** `src/plot.js`  
**Localização:** Função `updateScatterPlot` (linha ~88-95)

### ❌ CÓDIGO ACTUAL
```javascript
export function updateScatterPlot(data, onCountryClick) {
    // ... setup code ...
    
    const x = d3.scaleLinear().domain([0, d3.max(data, d => d.Emission)]).range([0, width]);
    const y = d3.scaleLinear()
        .domain(d3.extent(data, d => d.Delta || 0))  // ← Problema aqui
        .nice()
        .range([height, 0]);
```

### ✅ CÓDIGO CORRIGIDO
```javascript
export function updateScatterPlot(data, onCountryClick) {
    // ... setup code ...
    
    // Filtrar dados com Delta válido (LAG() retorna NULL para primeiro ano)
    const validData = data.filter(d => 
        d.Delta !== null && 
        d.Delta !== undefined && 
        d.Emission !== null && 
        d.Emission !== undefined
    );
    
    if (!validData || validData.length === 0) {
        console.warn('[Scatter] Sem dados válidos para este ano');
        return;
    }
    
    const x = d3.scaleLinear()
        .domain([0, d3.max(validData, d => d.Emission)])
        .range([0, width]);
    
    const y = d3.scaleLinear()
        .domain(d3.extent(validData, d => d.Delta))
        .nice()
        .range([height, 0]);

    svgElement.select('.x-axis').transition().duration(500).call(d3.axisBottom(x).ticks(5));
    svgElement.select('.y-axis').transition().duration(500).call(d3.axisLeft(y).ticks(5));

    svgElement.selectAll('.dot')
        .data(validData, d => d.Code)  // ← Use validData em vez de data
        .join(
            enter => enter.append('circle')
                .attr('class', 'dot')
                .attr('r', 5)
                .attr('fill', '#e41a1c')
                .attr('opacity', 0.6)
                .attr('cx', d => x(d.Emission))
                .attr('cy', d => y(d.Delta))
                .on('mouseover', function(e, d) {
                    d3.select(this).attr('opacity', 1).attr('stroke', '#fff');
                    d3.select(`#${d.Code}`).style('stroke', '#fff').style('stroke-width', '2px');
                })
                .on('mouseout', function(e, d) {
                    d3.select(this).attr('opacity', 0.6).attr('stroke', null);
                    d3.select(`#${d.Code}`).style('stroke', null);
                })
                .on('click', (e, d) => onCountryClick(d.Code)),
            update => update.transition()
                .attr('cx', d => x(d.Emission))
                .attr('cy', d => y(d.Delta)),
            exit => exit.remove()
        );
}
```

---

## BUG #4: Validação de Conexão DuckDB

**Ficheiro:** `src/main.js`  
**Localização:** Funções `updateDashboard`, `togglePlay`, `handleCountrySelection`

### ❌ CÓDIGO ACTUAL
```javascript
async function updateDashboard() {
    // Sem validação de conn
    const result = await conn.query(sqlAnalytics);
    // ...
}
```

### ✅ CÓDIGO CORRIGIDO
```javascript
// Função auxiliar para validar conexão
function ensureDatabase() {
    if (!conn) {
        throw new Error('Conexão com base de dados não disponível. Recarregue a página.');
    }
}

async function updateDashboard() {
    try {
        ensureDatabase();
        
        const sqlAnalytics = `
            SELECT Entity, Code, Emission, Delta
            FROM emissions
            WHERE Year = ${appState.selectedYear};
        `;

        const sqlBar = `
            SELECT Entity, Emission 
            FROM emissions 
            WHERE Year = ${appState.selectedYear}
            ORDER BY Emission DESC LIMIT 10;
        `;

        const result = await conn.query(sqlAnalytics);
        const barResult = await conn.query(sqlBar);

        appState.mapData = result.toArray().map(r => r.toJSON());
        const topEmissions = barResult.toArray().map(r => r.toJSON());
        
        await loadChoroplethMap(appState.mapData, handleCountrySelection);
        updateBarChart(topEmissions);
        updateScatterPlot(appState.mapData, handleCountrySelection);
    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
        // Mostrar erro ao utilizador
        const container = document.getElementById('chart-container');
        if (container) {
            container.innerHTML = `<div style="color: #f44; padding: 20px;">
                <strong>Erro:</strong> ${error.message}
            </div>`;
        }
    }
}

async function handleCountrySelection(countryCode) {
    try {
        ensureDatabase();
        
        if (appState.selectedCountry === countryCode) return;
        appState.selectedCountry = countryCode;

        const sqlSeries = `
            SELECT Year, Emission, Entity
            FROM emissions
            WHERE Code = '${countryCode}'
            ORDER BY Year ASC;
        `;

        const result = await conn.query(sqlSeries);
        appState.seriesData = result.toArray().map(r => r.toJSON());
        
        const name = appState.seriesData.length > 0 ? appState.seriesData[0].Entity : "Sem dados";
        document.getElementById('countryName').textContent = name;

        updateTimeSeriesChart(appState.seriesData, countryCode);
    } catch (error) {
        console.error('Erro ao seleccionar país:', error);
        document.getElementById('countryName').textContent = `Erro: ${error.message}`;
    }
}
```

---

## BUG #5: SVG Filter Frágil + ISO3 Validation

**Ficheiro:** `src/plot.js`  
**Localização:** Função `loadChoroplethMap` (linha ~116)

### ❌ CÓDIGO ACTUAL
```javascript
svg.selectAll('[id]')
    .filter(function() { return this.id && this.id.length === 3; })
    // ...
```

### ✅ CÓDIGO CORRIGIDO
```javascript
// Função helper para validar ISO3
function isValidISO3(code) {
    if (!code) return false;
    return /^[A-Z]{3}$/.test(code.toUpperCase());
}

// Usar em selectAll
svg.selectAll('[id]')
    .filter(function() { 
        return this.id && isValidISO3(this.id);
    })
    // ...
```

---

## OTIMIZAÇÃO #1: Índices DuckDB

**Ficheiro:** `src/main.js`  
**Localização:** Função `initDatabase` (após CREATE TABLE emissions)

### ✅ ADICIONAR APÓS CRIAÇÃO DA TABELA
```javascript
// Criar índices para optimizar queries
await conn.query(`
    CREATE INDEX IF NOT EXISTS idx_emissions_code ON emissions(Code);
    CREATE INDEX IF NOT EXISTS idx_emissions_year ON emissions(Year);
    CREATE INDEX IF NOT EXISTS idx_emissions_code_year ON emissions(Code, Year);
`);

console.log("Índices criados com sucesso.");
```

---

## OTIMIZAÇÃO #2: Cache de Top Emissions

**Ficheiro:** `src/main.js`  
**Localização:** Perto do início (após appState)

### ✅ ADICIONAR CACHE
```javascript
// Cache para evitar queries repetidas
const queryCache = {
    topEmissions: new Map(),
    seriesData: new Map(),
};

function getCacheKey(key, ...params) {
    return `${key}:${params.join(':')}`;
}

async function getTopEmissions(year) {
    const cacheKey = getCacheKey('topEmissions', year);
    
    if (queryCache.topEmissions.has(cacheKey)) {
        return queryCache.topEmissions.get(cacheKey);
    }
    
    const result = await conn.query(`
        SELECT Entity, Emission 
        FROM emissions 
        WHERE Year = $1
        ORDER BY Emission DESC LIMIT 10
    `).bind(year).all();
    
    const data = result.toArray().map(r => r.toJSON());
    queryCache.topEmissions.set(cacheKey, data);
    
    // Limpar cache antigo (manter apenas últimas 50 queries)
    if (queryCache.topEmissions.size > 50) {
        const firstKey = queryCache.topEmissions.keys().next().value;
        queryCache.topEmissions.delete(firstKey);
    }
    
    return data;
}
```

---

## UI/UX MELHORIA #1: Loading Indicator

**Ficheiro:** `index.html`  
**Localização:** Após tag `<body>` de abertura

### ✅ ADICIONAR HTML
```html
<div id="loading-indicator" class="loading-overlay">
    <div class="loading-container">
        <div class="spinner"></div>
        <p>Carregando dados globais...</p>
    </div>
</div>
```

### ✅ ADICIONAR CSS (em `<style>`)
```css
.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(18, 18, 18, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.loading-container {
    text-align: center;
    color: #e0e0e0;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #333;
    border-top: 4px solid #e41a1c;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
```

### ✅ ADICIONAR JAVASCRIPT (em `src/main.js`, função `initDatabase`)
```javascript
async function initDatabase() {
    try {
        const db = await loadDb();
        conn = await db.connect();
        // ... resto do código
        
        // Esconder loading indicator ao terminar com sucesso
        const loader = document.getElementById('loading-indicator');
        if (loader) loader.style.display = 'none';
        
        console.log("Banco de dados e estado inicial prontos.");
    } catch (e) {
        console.error("Erro na inicialização:", e);
        
        // Mostrar erro ao utilizador
        const loader = document.getElementById('loading-indicator');
        if (loader) {
            loader.innerHTML = `
                <div class="loading-container">
                    <h2 style="color: #f44;">Erro ao Carregar</h2>
                    <p>${e.message}</p>
                    <button onclick="location.reload()" style="margin-top: 20px;">Recarregar Página</button>
                </div>
            `;
        }
    }
}
```

---

## UI/UX MELHORIA #2: Responsividade Mobile

**Ficheiro:** `index.html`  
**Localização:** Em `<style>`

### ✅ ADICIONAR MEDIA QUERIES
```css
/* Base: Mobile-first */
.dashboard-grid { 
    grid-template-columns: 1fr;
}

/* Tablet */
@media (min-width: 768px) {
    .dashboard-grid {
        grid-template-columns: 1fr 1fr;
    }
}

/* Desktop */
@media (min-width: 1200px) {
    .dashboard-grid {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto;
    }
    
    #chart-container { grid-column: span 1; }
}

/* Melhorar readibilidade em telas pequenas */
@media (max-width: 600px) {
    .header {
        flex-direction: column;
        gap: 10px;
        padding: 1rem;
    }
    
    .controls {
        width: 100%;
        justify-content: center;
        flex-wrap: wrap;
    }
    
    input[type="range"] {
        width: 100%;
        max-width: 200px;
    }
    
    .card {
        min-height: 300px;
    }
}
```

---

## UI/UX MELHORIA #3: Formatação de Números

**Ficheiro:** `src/plot.js`  
**Localização:** Início do ficheiro (após `import * as d3`)

### ✅ ADICIONAR FORMATEADORES
```javascript
// Formateadores D3
const formatPercent = d3.format('.2f');
const formatInteger = d3.format('d');
const formatScientific = d3.format('.2e');

function formatEmission(value) {
    if (value === null || value === undefined) return 'N/A';
    if (value > 1000) return formatScientific(value);
    return formatPercent(value) + '%';
}
```

### ✅ USAR NOS TOOLTIPS
```javascript
// Em loadChoroplethMap
tooltip.style('display', 'block')
       .html(`<strong>${entry ? entry.Entity : iso}</strong><br/>
              <em>Participação:</em> ${formatEmission(val)}<br/>
              <em>Tendência (Δ):</em> ${entry && entry.Delta ? formatPercent(entry.Delta) : 'N/A'}`);

// Em updateScatterPlot
// Usar formatEmission(val) nos tooltips
```

---

## ACCESSIBILITY MELHORIA: Keyboard Navigation

**Ficheiro:** `src/main.js`  
**Localização:** Função `window.onload`

### ✅ ADICIONAR EVENT LISTENERS
```javascript
window.onload = async () => {
    await initDatabase();
    await updateDashboard();
    if (appState.selectedCountry) {
        await handleCountrySelection(appState.selectedCountry);
    }

    const slider = document.getElementById('yearSlider');
    const playBtn = document.getElementById('playButton');

    if (playBtn) {
        playBtn.onclick = togglePlay;
        
        // Espaço para play/stop
        playBtn.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                togglePlay();
            }
        });
    }

    if (slider) {
        slider.oninput = (e) => {
            appState.selectedYear = +e.target.value;
            updateUIFromState();
            updateDashboard();
        };
        
        // Arrow keys para slider
        slider.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 10 : 1; // Shift para saltar 10 anos
            
            if (e.code === 'ArrowLeft' && appState.selectedYear > appState.minYear) {
                e.preventDefault();
                appState.selectedYear = Math.max(appState.minYear, appState.selectedYear - step);
                updateUIFromState();
                updateDashboard();
            }
            if (e.code === 'ArrowRight' && appState.selectedYear < appState.maxYear) {
                e.preventDefault();
                appState.selectedYear = Math.min(appState.maxYear, appState.selectedYear + step);
                updateUIFromState();
                updateDashboard();
            }
        });
    }
};
```

---

## 🎯 QUICK IMPLEMENTATION CHECKLIST

```
PRE-IMPLEMENTATION:
☐ Fazer backup de todos os ficheiros (.js, .html)
☐ Criar branch git: git checkout -b fix/critical-bugs
☐ Abrir DevTools (F12) para monitorar console errors

FASE 1 (CRÍTICA):
☐ Aplicar BUG #1 (d3.xml deprecation)
☐ Aplicar BUG #2 (event listener leaks) - ESTA É A MAIS CRÍTICA
☐ Aplicar BUG #4 (validação DB)
☐ Testar: Play por 5 minutos, monitor memory em DevTools
☐ Commit: "fix: eliminate critical memory leak and d3 deprecation"

FASE 2 (HIGH):
☐ Aplicar BUG #3 (scatter plot nulls)
☐ Aplicar BUG #5 (ISO3 validation)
☐ Aplicar OTIMIZAÇÃO #1 (índices DuckDB)
☐ Testar: Year slider, country selection
☐ Commit: "perf: add db indices and scatter plot filtering"

FASE 3 (MEDIUM):
☐ Aplicar OTIMIZAÇÃO #2 (cache)
☐ Aplicar UI MELHORIA #1 (loading indicator)
☐ Aplicar UI MELHORIA #2 (responsividade)
☐ Aplicar UI MELHORIA #3 (formatação)
☐ Testar: Desktop + Mobile
☐ Commit: "feat: add loading UI and responsive design"

FASE 4 (FINAL):
☐ Aplicar ACCESSIBILITY (keyboard nav)
☐ Testar em Chrome, Firefox, Safari
☐ Lighthouse audit
☐ Commit: "feat: add accessibility features"

POST-IMPLEMENTATION:
☐ git merge para main
☐ Deploy
☐ Monitor em produção (Memory, errors no console)
```

---

**FIM DO DOCUMENTO**

Cada secção pode ser implementada e testada independentemente. Começar pela FASE 1, que resolve os bugs críticos.
