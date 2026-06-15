import { loadDb } from './config.js';
import { loadChoroplethMap, updateTimeSeriesChart, updateBarChart, updateScatterPlot } from './plot.js';

// Estado global da aplicação para evitar re-renderizações desnecessárias
let conn;
let appState = {
    selectedCountry: 'USA', // Iniciar com um país que possui dados históricos extensos
    selectedYear: 2021,
    minYear: 1750,
    maxYear: 2021,
    mapData: [],
    seriesData: [],
    isPlaying: false
};

// Função auxiliar para validar conexão com base de dados
function ensureDatabase() {
    if (!conn) {
        throw new Error('Conexão com base de dados não disponível. Recarregue a página.');
    }
}

// Inicialização do banco de dados e carga do CSV
async function initDatabase() {
    try {
        const db = await loadDb();
        conn = await db.connect();
        
        const res = await fetch('/share-of-cumulative-co2.csv');
        if (!res.ok) throw new Error("CSV não encontrado!");

        const buffer = new Uint8Array(await res.arrayBuffer());
        await db.registerFileBuffer('share-of-cumulative-co2.csv', buffer);

        await conn.query(`
            CREATE TABLE raw_emissions AS SELECT * FROM read_csv_auto('share-of-cumulative-co2.csv');
            
            CREATE TABLE emissions AS
            SELECT
                Entity,
                Code,
                CAST(Year AS INTEGER) AS Year,
                CAST("Share of global cumulative CO₂ emissions" AS DOUBLE) AS Emission,
                Emission - LAG(Emission) OVER (PARTITION BY Code ORDER BY Year) as Delta
            FROM raw_emissions
            WHERE Code IS NOT NULL AND LENGTH(Code) = 3
            ORDER BY Year ASC;
        `);
        
        // Criar índices para otimizar queries
        await conn.query(`
            CREATE INDEX IF NOT EXISTS idx_emissions_code ON emissions(Code);
            CREATE INDEX IF NOT EXISTS idx_emissions_year ON emissions(Year);
            CREATE INDEX IF NOT EXISTS idx_emissions_code_year ON emissions(Code, Year);
        `);
        
        const yearRes = await conn.query('SELECT MAX(Year) as maxYear FROM emissions');
        const maxVal = yearRes.toArray();
        if (maxVal.length > 0) {
            appState.maxYear = maxVal[0].toJSON().maxYear;
            appState.selectedYear = appState.maxYear;
            updateUIFromState();
        }

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
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #e41a1c; color: white; border: none; border-radius: 5px; cursor: pointer;">Recarregar Página</button>
                </div>
            `;
        }
    }
}

async function updateDashboard() {
    try {
        ensureDatabase();
        
        // Busca integrada para Mapa e Scatter Plot
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

function togglePlay() {
    const btn = document.getElementById('playButton');
    appState.isPlaying = !appState.isPlaying;
    btn.textContent = appState.isPlaying ? 'STOP' : 'PLAY';
    
    if (appState.isPlaying) {
        const step = () => {
            if (!appState.isPlaying) return;
            if (appState.selectedYear >= appState.maxYear) {
                togglePlay();
                return;
            }
            appState.selectedYear++;
            updateUIFromState();
            updateDashboard();
            setTimeout(step, 100);
        };
        step();
    }
}

function updateUIFromState() {
    const slider = document.getElementById('yearSlider');
    const yearDisplay = document.getElementById('yearValue');
    slider.value = appState.selectedYear;
    yearDisplay.textContent = appState.selectedYear;
}

async function handleCountrySelection(countryCode) {
    try {
        ensureDatabase();
        
        if (appState.selectedCountry === countryCode) return;
        appState.selectedCountry = countryCode;

        // Consulta focada na série histórica do país selecionado
        // Adicionamos 'Entity' para capturar o nome amigável do país
        const sqlSeries = `
            SELECT Year, Emission, Entity
            FROM emissions
            WHERE Code = '${countryCode}'
            ORDER BY Year ASC;
        `;

        const result = await conn.query(sqlSeries);
        appState.seriesData = result.toArray().map(r => r.toJSON());
        
        // Melhoria de Legibilidade: Usamos o nome completo da entidade no título, não o código.
        const name = appState.seriesData.length > 0 ? appState.seriesData[0].Entity : "Sem dados";
        document.getElementById('countryName').textContent = name;

        updateTimeSeriesChart(appState.seriesData, countryCode);
    } catch (error) {
        console.error('Erro ao seleccionar país:', error);
        document.getElementById('countryName').textContent = `Erro: ${error.message}`;
    }
}

window.onload = async () => {
    await initDatabase();
    
    // Esconder loading indicator ao terminar com sucesso
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = 'none';
    
    // Renderização inicial do dashboard
    await updateDashboard();
    
    // Força a carga da série temporal do país padrão para não iniciar vazio
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