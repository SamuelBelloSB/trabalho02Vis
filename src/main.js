import { loadDb } from './config.js';
import { loadChoroplethMap, updateTimeSeriesChart, updateBarChart, updateScatterPlot, updateEnergyEfficiencyChart } from './plot.js';

// Estado global da aplicação para evitar re-renderizações desnecessárias
let conn;
let appState = {
    selectedCountry: 'USA', // Iniciar com um país que possui dados históricos extensos
    selectedCountries: ['USA'],
    selectedYear: 2021,
    minYear: 1750,
    maxYear: 2021,
    mapData: [],
    seriesData: [],
    isPlaying: false,
    availableCountries: [] // Cache para busca
};

const queryCache = {
    mapData: new Map(),
    topEmissions: new Map(),
    seriesData: new Map()
};

// Função auxiliar para validar conexão com base de dados
function ensureDatabase() {
    if (!conn) {
        throw new Error('Conexão com base de dados não disponível. Recarregue a página.');
    }
}

function getCacheKey(key, ...params) {
    return `${key}:${params.join(':')}`;
}

async function getMapData(year) {
    const cacheKey = getCacheKey('mapData', year);
    if (queryCache.mapData.has(cacheKey)) {
        return queryCache.mapData.get(cacheKey);
    }

    const result = await conn.query(`
        SELECT Entity, Code, Emission, Delta
        FROM emissions
        WHERE Year = ${year};
    `);

    const data = result.toArray().map(r => r.toJSON());
    queryCache.mapData.set(cacheKey, data);
    return data;
}

async function getTopEmissions(year) {
    const cacheKey = getCacheKey('topEmissions', year);
    if (queryCache.topEmissions.has(cacheKey)) {
        return queryCache.topEmissions.get(cacheKey);
    }

    const result = await conn.query(`
        SELECT Entity, Emission
        FROM emissions
        WHERE Year = ${year}
        ORDER BY Emission DESC LIMIT 10;
    `);

    const data = result.toArray().map(r => r.toJSON());
    queryCache.topEmissions.set(cacheKey, data);
    return data;
}

async function getSeriesData(countryCode) {
    const cacheKey = getCacheKey('seriesData', countryCode);
    if (queryCache.seriesData.has(cacheKey)) {
        return queryCache.seriesData.get(cacheKey);
    }

    const result = await conn.query(`
        SELECT Year, Emission, Entity, Code
        FROM emissions
        WHERE Code = '${countryCode}'
        ORDER BY Year ASC;
    `);

    const data = result.toArray().map(r => r.toJSON());
    queryCache.seriesData.set(cacheKey, data);
    return data;
}

async function getSeriesDataList(countryCodes) {
    const promises = countryCodes.map(code => getSeriesData(code));
    const series = await Promise.all(promises);
    return series.map(data => ({
        code: data.length > 0 ? data[0].Code : null,
        entity: data.length > 0 ? data[0].Entity : data[0]?.Code || 'Sem dados',
        values: data.map(d => ({ Year: d.Year, Emission: d.Emission }))
    }));
}

function downloadURI(uri, name) {
    const link = document.createElement('a');
    link.href = uri;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportCSV(data, filename) {
    if (!data || !data.length) {
        alert('Nenhum dado disponível para exportar.');
        return;
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(field => {
        const value = row[field];
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    downloadURI(url, filename);
    URL.revokeObjectURL(url);
}

async function exportLineChartPNG() {
    const svgElement = document.querySelector('#line-chart-container svg');
    if (!svgElement) {
        alert('Gráfico não disponível para exportar.');
        return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement.cloneNode(true));
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svgElement.viewBox.baseVal.width || svgElement.clientWidth;
        canvas.height = svgElement.viewBox.baseVal.height || svgElement.clientHeight;
        const context = canvas.getContext('2d');
        context.fillStyle = '#121212';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => {
            if (blob) {
                const pngUrl = URL.createObjectURL(blob);
                downloadURI(pngUrl, `line-chart-${appState.selectedYear}.png`);
                URL.revokeObjectURL(pngUrl);
            }
        }, 'image/png');
    };
    image.onerror = (e) => {
        console.error('Erro ao converter SVG para PNG', e);
        alert('Não foi possível exportar o PNG.');
    };
    image.src = url;
}


// Inicialização do banco de dados e carga do CSV
async function initDatabase() {
    try {
        const db = await loadDb();
        conn = await db.connect();
        
        // 1. Carregamento Obrigatório do Dataset Principal (CO2)
        // Se o arquivo estiver na raiz: './share-of-cumulative-co2.csv'
        // Se mantiver em public: './public/share-of-cumulative-co2.csv'
        const resCo2 = await fetch('./share-of-cumulative-co2.csv');

        if (!resCo2.ok) throw new Error("Arquivo share-of-cumulative-co2.csv não encontrado!");

        const bufferCo2 = new Uint8Array(await resCo2.arrayBuffer());
        await db.registerFileBuffer('share-of-cumulative-co2.csv', bufferCo2);

        // Criar tabelas base de emissões
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

            CREATE TABLE energy_co2_stats AS 
            SELECT * FROM emissions;
        `);

        // 2. Carregamento Opcional do Dataset de Energia
        try {
            const resEnergy = await fetch('./primary-energy-consumption.csv');
            if (resEnergy.ok) {
                const bufferEnergy = new Uint8Array(await resEnergy.arrayBuffer());
                await db.registerFileBuffer('primary-energy-consumption.csv', bufferEnergy);

                await conn.query(`
                    CREATE TABLE raw_energy AS SELECT * FROM read_csv_auto('primary-energy-consumption.csv', ignore_errors=true, sample_size=-1);
                    
                    CREATE TABLE energy_relationship AS
                    SELECT 
                        e.Entity, 
                        e.Code, 
                        e.Year, 
                        e.Emission as CO2_Share,
                        en."Primary energy consumption (TWh)" as Energy_TWh,
                        (e.Emission / NULLIF(en."Primary energy consumption (TWh)", 0)) as Carbon_Intensity
                    FROM emissions e
                    JOIN raw_energy en ON e.Code = en.Code AND e.Year = en.Year
                    WHERE e.Year >= 1965 AND en."Primary energy consumption (TWh)" IS NOT NULL;
                `);
                console.log("Dados de energia integrados com sucesso.");
            } else {
                console.warn("Aviso: primary-energy-consumption.csv não encontrado. Gráficos de energia ficarão ocultos.");
            }
        } catch (errEnergy) {
            console.warn("Aviso: Falha ao integrar dados de energia.", errEnergy);
        }
        
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

        // Busca dados da relação energia de forma segura
        let energyData = [];
        try {
            const energyRes = await conn.query(`
                SELECT * FROM energy_relationship WHERE Year = ${appState.selectedYear}
            `);
            energyData = energyRes.toArray().map(r => r.toJSON());
        } catch (e) {
            // Tabela energy_relationship pode não existir
        }

        appState.mapData = await getMapData(appState.selectedYear);
        const topEmissions = await getTopEmissions(appState.selectedYear);

        await loadChoroplethMap(appState.mapData, handleCountrySelection);
        updateBarChart(topEmissions);
        updateScatterPlot(appState.mapData, handleCountrySelection);
        
        // Nova visualização
        if (typeof updateEnergyEfficiencyChart === 'function' && energyData.length > 0) {
            updateEnergyEfficiencyChart(energyData);
        }

        await updateCountrySeries();
    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
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
        // Se o usuário apertar PLAY e já estivermos no fim, volta para o início automaticamente
        if (appState.selectedYear >= appState.maxYear) {
            appState.selectedYear = appState.minYear;
            updateUIFromState();
            updateDashboard();
        }

        const step = () => {
            if (!appState.isPlaying) return;
            if (appState.selectedYear >= appState.maxYear) {
                appState.isPlaying = false;
                btn.textContent = 'PLAY';
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

function toggleCountrySelection(countryCode, forceAdd = false) {
    const currentIndex = appState.selectedCountries.indexOf(countryCode);
    if (currentIndex >= 0) {
        // Se forceAdd for true (vindo do select), não remove se já existir
        if (forceAdd) {
            appState.selectedCountry = countryCode;
            return;
        }
        if (appState.selectedCountries.length > 1) {
            appState.selectedCountries.splice(currentIndex, 1);
        }
    } else {
        appState.selectedCountries.push(countryCode);
    }
    appState.selectedCountry = countryCode;
}

async function loadAvailableCountries() {
    ensureDatabase();
    const result = await conn.query(`
        SELECT DISTINCT Code, Entity
        FROM emissions
        ORDER BY Entity ASC;
    `);
    return result.toArray().map(r => r.toJSON());
}

function populateCountrySelect(countries, filter = '') {
    const select = document.getElementById('countrySelect');
    if (!select) return;
    
    appState.availableCountries = countries;
    select.innerHTML = '';

    countries
        .filter(c => c.Entity.toLowerCase().includes(filter.toLowerCase()) || c.Code.toLowerCase().includes(filter.toLowerCase()))
        .forEach(country => {
            const option = document.createElement('option');
            option.value = country.Code;
            option.textContent = `${country.Entity} (${country.Code})`;
            select.appendChild(option);
        });
    
    renderSelectedTags();
}

function renderSelectedTags() {
    const list = document.getElementById('selectedCountriesList');
    if (!list) return;
    list.innerHTML = '';

    appState.selectedCountries.forEach(code => {
        const country = appState.availableCountries.find(c => c.Code === code);
        const name = country ? country.Entity : code;
        
        const pill = document.createElement('div');
        pill.className = 'country-pill';
        pill.innerHTML = `${name} <span style="font-weight:bold">&times;</span>`;
        pill.onclick = async () => {
            toggleCountrySelection(code);
            await updateCountrySeries();
            renderSelectedTags();
        };
        list.appendChild(pill);
    });
}

async function updateCountrySeries() {
    const selected = appState.selectedCountries.length > 0 ? appState.selectedCountries : [appState.selectedCountry];
    const seriesList = await getSeriesDataList(selected);
    const names = seriesList.map(series => series.entity).filter(Boolean);
    
    const countryNameEl = document.getElementById('countryName');
    if (names.length > 2) {
        countryNameEl.textContent = `${names.length} países selecionados`;
        countryNameEl.title = names.join(', ');
        countryNameEl.style.textDecoration = "underline dotted";
    } else {
        countryNameEl.textContent = names.length ? names.join(' / ') : 'Nenhum país selecionado';
        countryNameEl.title = "";
        countryNameEl.style.textDecoration = "none";
    }

    updateTimeSeriesChart(seriesList);
}

function exportSelectedSeriesCSV() {
    const selected = appState.selectedCountries.length > 0 ? appState.selectedCountries : [appState.selectedCountry];
    if (!selected.length) {
        alert('Selecione pelo menos um país para exportar.');
        return;
    }

    getSeriesDataList(selected).then(seriesList => {
        const rows = seriesList.flatMap(series => series.values.map(point => ({
            Country: series.entity,
            Code: series.code,
            Year: point.Year,
            Emission: point.Emission
        })));
        exportCSV(rows, `emissions-series-${appState.selectedYear}.csv`);
    }).catch(error => {
        console.error('Erro ao exportar CSV:', error);
        alert('Não foi possível exportar o CSV.');
    });
}

function exportCurrentYearCSV() {
    if (!appState.mapData || !appState.mapData.length) {
        alert('Não há dados para exportar para o ano selecionado.');
        return;
    }
    const rows = appState.mapData.map(entry => ({
        Entity: entry.Entity,
        Code: entry.Code,
        Year: appState.selectedYear,
        Emission: entry.Emission,
        Delta: entry.Delta
    }));
    exportCSV(rows, `emissions-year-${appState.selectedYear}.csv`);
}

async function handleCountrySelection(countryCode) {
    try {
        ensureDatabase();
        toggleCountrySelection(countryCode);
        renderSelectedTags();
        await updateCountrySeries();
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
    
    const countries = await loadAvailableCountries();
    populateCountrySelect(countries);
    
    // Renderização inicial do dashboard
    await updateDashboard();

    const slider = document.getElementById('yearSlider');
    const playBtn = document.getElementById('playButton');
    const exportPngBtn = document.getElementById('exportPngBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportYearCsvBtn = document.getElementById('exportYearCsvBtn');
    const presetButtons = document.querySelectorAll('[data-preset-year]');
    const countrySelect = document.getElementById('countrySelect');
    const countrySearch = document.getElementById('countrySearch');
    const applyCountrySelectionBtn = document.getElementById('applyCountrySelection');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');

    if (playBtn) {
        playBtn.onclick = togglePlay;
        
        playBtn.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                togglePlay();
            }
        });
    }

    if (exportPngBtn) {
        exportPngBtn.onclick = exportLineChartPNG;
    }

    if (exportCsvBtn) {
        exportCsvBtn.onclick = exportSelectedSeriesCSV;
    }

    if (exportYearCsvBtn) {
        exportYearCsvBtn.onclick = exportCurrentYearCSV;
    }

    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetYear = Number(button.getAttribute('data-preset-year'));
            if (!Number.isNaN(targetYear)) {
                appState.selectedYear = targetYear;
                updateUIFromState();
                updateDashboard();
            }
        });
    });

    if (countrySearch) {
        countrySearch.oninput = (e) => {
            populateCountrySelect(appState.availableCountries, e.target.value);
        };
    }

    if (clearSelectionBtn) {
        clearSelectionBtn.onclick = async () => {
            appState.selectedCountries = ['USA'];
            appState.selectedCountry = 'USA';
            await updateCountrySeries();
            renderSelectedTags();
        };
    }

    if (applyCountrySelectionBtn) {
        applyCountrySelectionBtn.onclick = async () => {
            const selectedOptions = Array.from(countrySelect.selectedOptions).map(option => option.value);
            if (selectedOptions.length > 0) {
                selectedOptions.forEach(code => {
                    if (!appState.selectedCountries.includes(code)) appState.selectedCountries.push(code);
                });
                await updateCountrySeries();
                renderSelectedTags();
            }
        };
    }

    if (slider) {
        slider.oninput = (e) => {
            appState.selectedYear = +e.target.value;
            updateUIFromState();
            updateDashboard();
        };
        
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

    if (countrySelect) {
        countrySelect.addEventListener('dblclick', async () => {
            const selectedOptions = Array.from(countrySelect.selectedOptions).map(option => option.value);
            if (selectedOptions.length > 0) {
                selectedOptions.forEach(code => toggleCountrySelection(code, true));
                await updateCountrySeries();
                renderSelectedTags();
            }
        });
    }

    // Comentado para evitar erros de MIME type se sw.js não existir
    // if ('serviceWorker' in navigator) {
    //     try {
    //         await navigator.serviceWorker.register('/sw.js');
    //         console.log('Service Worker registrado com sucesso.');
    //     } catch (err) {
    //         console.warn('Falha ao registrar Service Worker:', err);
    //     }
    // }
};