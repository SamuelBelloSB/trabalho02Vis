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
    }
}

async function updateDashboard() {
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
}

window.onload = async () => {
    await initDatabase();
    
    // Renderização inicial do dashboard
    await updateDashboard();
    
    // Força a carga da série temporal do país padrão para não iniciar vazio
    if (appState.selectedCountry) {
        await handleCountrySelection(appState.selectedCountry);
    }

    const slider = document.getElementById('yearSlider');
    const playBtn = document.getElementById('playButton');

    if (playBtn) playBtn.onclick = togglePlay;

    if (slider) {
        slider.oninput = (e) => {
            appState.selectedYear = +e.target.value;
            updateUIFromState();
            updateDashboard();
        };
    }
};