import * as d3 from 'https://cdn.skypack.dev/d3@7';
import * as topojson from 'https://cdn.skypack.dev/topojson-client@3';

// Tooltip único para a aplicação, utilizando a classe já definida no seu CSS
const tooltip = d3.select("body").append("div")
    .attr("class", "map-tooltip")
    .style("opacity", 0);

/**
 * Atualiza o Ranking de Impacto (Gráfico de Barras)
 * @param {Array} data - Dados vindos do DuckDB { Entity, Emission }
 */
export function updateBarChart(data) {
    const container = d3.select("#bar-chart-container");
    
    // Obtém dimensões dinâmicas do container
    const margin = { top: 20, right: 30, bottom: 40, left: 120 };
    const width = (container.node()?.clientWidth || 400) - margin.left - margin.right;
    const height = (container.node()?.clientHeight || 400) - margin.top - margin.bottom;

    // Limpa ou cria o SVG
    let svg = container.select("svg");
    if (svg.empty()) {
        svg = container.append("svg")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
    } else {
        svg = svg.select("g");
    }

    // Escalas
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.Emission) || 100])
        .range([0, width]);

    const y = d3.scaleBand()
        .domain(data.map(d => d.Entity))
        .range([0, height])
        .padding(0.2);

    // Renderização dos Eixos
    svg.selectAll(".axis").remove();
    
    svg.append("g")
        .attr("class", "axis y-axis")
        .call(d3.axisLeft(y).tickSize(0).tickPadding(10))
        .selectAll("text")
        .style("fill", "#aaa")
        .style("font-size", "12px");

    svg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => d + "%"))
        .selectAll("text")
        .style("fill", "#888");

    // Barras
    const bars = svg.selectAll(".bar")
        .data(data, d => d.Entity);

    // Saída
    bars.exit().remove();

    // Entrada + Atualização
    bars.enter()
        .append("rect")
        .attr("class", "bar")
        .attr("fill", "#e41a1c")
        .attr("rx", 4) // Bordas levemente arredondadas
        .merge(bars)
        .on("mouseover", function(event, d) {
            d3.select(this).attr("fill", "#ff4d4d"); // Destaque visual
            
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <div style="border-bottom: 1px solid #444; margin-bottom: 5px; padding-bottom: 5px;">
                    <strong>${d.Entity}</strong>
                </div>
                <span>Emissão Acumulada: </span>
                <span style="color: #e41a1c; font-weight: bold;">${d.Emission.toFixed(2)}%</span>
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 15) + "px")
                   .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("fill", "#e41a1c");
            tooltip.transition().duration(500).style("opacity", 0);
        })
        .transition()
        .duration(750)
        .attr("y", d => y(d.Entity))
        .attr("x", 0)
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.Emission));

    console.log("Ranking de Impacto atualizado:", data.length, "países.");
}

let worldData = null;

/**
 * Implementação de Spike Map Geográfico
 */
export async function loadChoroplethMap(data, onSelect) {
    const container = d3.select("#chart-container");
    const width = container.node()?.clientWidth || 600;
    const height = container.node()?.clientHeight || 450;

    let svg = container.select("svg");
    if (svg.empty()) {
        svg = container.append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "xMidYMid meet");
        
        // Camada principal de zoom que conterá o mapa e os espigões
        const zoomLayer = svg.append("g").attr("class", "zoom-layer");

        zoomLayer.append("g").attr("class", "countries");
        zoomLayer.append("g").attr("class", "spikes");

        // Configuração do Zoom (feita apenas uma vez na criação do SVG)
        const zoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", (event) => {
                const { transform } = event;
                zoomLayer.attr("transform", transform);
                
                // Ajusta as linhas para não ficarem grossas no zoom
                zoomLayer.select(".countries").selectAll("path")
                    .attr("stroke-width", 0.5 / transform.k);
                zoomLayer.select(".spikes").selectAll("path")
                    .attr("stroke-width", 0.5 / transform.k);
            });

        svg.call(zoom);
    }

    const zoomLayer = svg.select(".zoom-layer");

    // Carrega o mapa do mundo (apenas uma vez)
    if (!worldData) {
        const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const topoData = await response.json();
        worldData = topojson.feature(topoData, topoData.objects.countries);
    }

    const projection = d3.geoNaturalEarth1()
        .fitSize([width, height], worldData);
    const path = d3.geoPath().projection(projection);

    // Desenha os países
    const countriesGroup = zoomLayer.select(".countries");
    countriesGroup
        .selectAll("path")
        .data(worldData.features)
        .join("path")
        .attr("d", path)
        .attr("fill", "#2a2a2a")
        .attr("stroke", "#333")
        .attr("stroke-width", 0.5); // Stroke inicial

    // Função geradora de espigão (Spike)
    const spike = (length, width = 6) => {
        return `M${-width / 2},0L0,${-length}L${width / 2},0`;
    };

    // Escala para a altura dos espigões (ajustável conforme necessidade)
    const lengthScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.Emission) || 100])
        .range([0, 150]);

    // Prepara dados: mapeia coordenadas para os países que temos dados no CSV
    const spikeData = data.map(d => {
        const feature = worldData.features.find(f => 
            f.id === d.Code || f.properties.name === d.Entity
        );
        return {
            ...d,
            centroid: feature ? path.centroid(feature) : null
        };
    }).filter(d => d.centroid);

    // Desenha/Atualiza os espigões
    const spikesGroup = zoomLayer.select(".spikes");
    const spikes = spikesGroup
        .selectAll("path")
        .data(spikeData, d => d.Code);

    spikes.exit().remove();

    spikes.enter()
        .append("path")
        .attr("fill", "#e41a1c")
        .attr("fill-opacity", 0.5)
        .attr("stroke", "#e41a1c") // Stroke inicial
        .attr("stroke-width", 0.5)
        .attr("transform", d => `translate(${d.centroid[0]}, ${d.centroid[1]})`)
        .on("mouseover", function(event, d) {
            d3.select(this).attr("fill-opacity", 0.8).attr("stroke-width", 1.5);
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <div style="border-bottom: 1px solid #444; margin-bottom: 5px; padding-bottom: 5px;">
                    <strong>${d.Entity}</strong>
                </div>
                Acumulado: <strong>${d.Emission.toFixed(2)}%</strong><br/>
                Tendência: <span style="color: ${d.Delta >= 0 ? '#e41a1c' : '#4caf50'}">
                    ${(d.Delta || 0).toFixed(4)}
                </span>
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("fill-opacity", 0.5).attr("stroke-width", 0.5);
            tooltip.transition().duration(200).style("opacity", 0); // Transição mais rápida para o tooltip
        })
        .on("click", (event, d) => onSelect(d.Code))
        .merge(spikes)
        .transition()
        .duration(200) // Transição rápida para acompanhar a animação
        .attr("d", d => spike(lengthScale(d.Emission)));

    // console.log("Spike Map atualizado.");
}

/**
 * Evolução Temporal (Gráfico de Áreas com Tooltip interativo)
 */
export function updateTimeSeriesChart(seriesList) {
    const container = d3.select("#line-chart-container");
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = (container.node()?.clientWidth || 400) - margin.left - margin.right;
    const height = (container.node()?.clientHeight || 350) - margin.top - margin.bottom;

    let svg = container.select("svg");
    if (svg.empty()) {
        svg = container.append("svg")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
    } else {
        svg = svg.select("g");
    }

    const allValues = seriesList.flatMap(s => s.values);
    if (!allValues.length) return;

    const x = d3.scaleLinear()
        .domain(d3.extent(allValues, d => d.Year))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(allValues, d => d.Emission) || 1])
        .range([height, 0]);

    svg.selectAll(".axis").remove();
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(5));

    svg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + "%"));

    // Escala de cores para as áreas
    const colorScale = d3.scaleOrdinal()
        .domain(seriesList.map(d => d.code))
        .range(["#e41a1c", "#4caf50", "#1f77b4", "#ff7f0e", "#9467bd", "#8c564b"]);

    const area = d3.area()
        .x(d => x(d.Year))
        .y0(height)
        .y1(d => y(d.Emission));

    // Cria um defs para gradientes se não existir
    let defs = svg.select("defs");
    if (defs.empty()) {
        defs = svg.append("defs");
    }

    // Remove gradientes antigos
    defs.selectAll("linearGradient").remove();

    // Cria gradientes para cada série
    seriesList.forEach((series, index) => {
        const color = colorScale(series.code);
        const gradient = defs.append("linearGradient")
            .attr("id", `gradient-${series.code}`)
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "0%")
            .attr("y2", "100%");
        
        gradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", color)
            .attr("stop-opacity", 0.7);
        
        gradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", color)
            .attr("stop-opacity", 0.1);
    });

    const paths = svg.selectAll(".area-path").data(seriesList, d => d.code);
    paths.exit().remove();
    paths.enter()
        .append("path")
        .attr("class", "area-path")
        .attr("fill", d => `url(#gradient-${d.code})`)
        .attr("stroke", d => colorScale(d.code))
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .merge(paths)
        .transition().duration(750)
        .attr("d", d => area(d.values));

    // Adiciona círculos para interatividade (Tooltip em pontos da área)
    const dotsGroup = svg.selectAll(".dots-group").data(seriesList, d => d.code);
    dotsGroup.exit().remove();
    
    const dotsMerged = dotsGroup.enter()
        .append("g")
        .attr("class", "dots-group")
        .merge(dotsGroup);

    const circles = dotsMerged.selectAll("circle")
        .data(d => d.values.map(v => ({ ...v, entity: d.entity, code: d.code })), d => d.Year);

    circles.exit().remove();
    circles.enter()
        .append("circle")
        .attr("r", 4)
        .attr("fill", d => colorScale(d.code))
        .style("opacity", 0) // Escondidos por padrão
        .style("cursor", "pointer")
        .merge(circles)
        .on("mouseover", function(event, d) {
            d3.select(this).style("opacity", 1).attr("r", 6);
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <div style="border-bottom: 1px solid #444; margin-bottom: 5px; padding-bottom: 5px;">
                    <strong>${d.entity}</strong>
                </div>
                Ano: <strong>${d.Year}</strong><br/>
                Emissão: <span style="color: ${colorScale(d.code)}; font-weight: bold;">${d.Emission.toFixed(2)}%</span>
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).style("opacity", 0).attr("r", 4);
            tooltip.transition().duration(500).style("opacity", 0);
        })
        .transition().duration(750)
        .attr("cx", d => x(d.Year))
        .attr("cy", d => y(d.Emission));
}

/**
 * Correlação: Acumulado vs. Tendência (Scatter Plot)
 */
export function updateScatterPlot(data, onSelect) {
    const container = d3.select("#scatter-plot-container");
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = (container.node()?.clientWidth || 400) - margin.left - margin.right;
    const height = (container.node()?.clientHeight || 350) - margin.top - margin.bottom;

    let svg = container.select("svg");
    if (svg.empty()) {
        svg = container.append("svg")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
    } else {
        svg = svg.select("g");
    }

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.Emission) || 1])
        .range([0, width]);

    const y = d3.scaleLinear().domain([d3.min(data, d => d.Delta) || -0.01, d3.max(data, d => d.Delta) || 0.01]).range([height, 0]);

    // Escala de cores baseada no acúmulo de emissões (vermelho claro a vermelho intenso)
    const colorScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.Emission) || 1])
        .range(["#ffcccc", "#e41a1c"]); // Vermelho claro a vermelho intenso

    // Escala de tamanho do círculo baseada no acúmulo de emissões
    const radiusScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.Emission) || 1])
        .range([3, 12]); // De 3 a 12 de raio

    svg.selectAll(".axis").remove();
    svg.selectAll(".grid-line").remove();

    // Adiciona uma linha de referência no Y=0 para separar quem sobe de quem desce
    svg.append("line")
        .attr("class", "grid-line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", y(0))
        .attr("y2", y(0))
        .attr("stroke", "#444")
        .attr("stroke-dasharray", "4,4");

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => d + "%"));
    svg.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("+.2f")));

    const dots = svg.selectAll(".dot").data(data, d => d.Code);
    dots.exit().remove();
    dots.enter()
        .append("circle")
        .attr("class", "dot")
        .attr("fill", d => colorScale(d.Emission))
        .attr("opacity", 0.7)
        .on("mouseover", function(event, d) {
            d3.select(this).attr("opacity", 1);
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <div style="border-bottom: 1px solid #444; margin-bottom: 5px; padding-bottom: 5px;">
                    <strong>${d.Entity}</strong>
                </div>
                Acumulado: <strong>${d.Emission.toFixed(2)}%</strong><br/>
                Variação Anual: <span style="color: ${d.Delta >= 0 ? '#e41a1c' : '#4caf50'}">${(d.Delta || 0).toFixed(4)}</span>
            `)
            .style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("opacity", 0.7);
            tooltip.transition().duration(500).style("opacity", 0);
        })
        .on("click", (event, d) => onSelect(d.Code))
        .merge(dots)
        .transition().duration(800)
        .attr("cx", d => x(d.Emission))
        .attr("cy", d => y(d.Delta || 0))
        .attr("r", d => radiusScale(d.Emission))
        .attr("fill", d => colorScale(d.Emission));
}

/**
 * Gráfico de Eficiência Energética (CO2 vs Energia)
 */
export function updateEnergyEfficiencyChart(data) {
    if (!data || data.length === 0) return;

    const container = d3.select("#energy-efficiency-container");
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = (container.node()?.clientWidth || 400) - margin.left - margin.right;
    const height = (container.node()?.clientHeight || 350) - margin.top - margin.bottom;

    let svg = container.select("svg");
    if (svg.empty()) {
        svg = container.append("svg")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
    } else {
        svg = svg.select("g");
    }

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.Energy_TWh) || 1])
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.CO2_Share) || 1])
        .range([height, 0]);

    svg.selectAll(".axis").remove();
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0s")));
    svg.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(d => d + "%"));

    const dots = svg.selectAll(".dot-energy").data(data, d => d.Code);
    dots.exit().remove();
    dots.enter()
        .append("circle")
        .attr("class", "dot-energy")
        .attr("r", 4)
        .attr("fill", "#e41a1c")
        .attr("opacity", 0.5)
        .merge(dots)
        .on("mouseover", function(event, d) {
            d3.select(this).attr("r", 6).attr("opacity", 1);
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <div style="border-bottom: 1px solid #444; padding-bottom: 4px; margin-bottom: 4px;">
                    <strong>${d.Entity}</strong>
                </div>
                Energia: <strong>${Math.round(d.Energy_TWh)} TWh</strong><br/>
                CO₂: <strong>${d.CO2_Share.toFixed(2)}%</strong><br/>
                <small>Intensidade: ${d.Carbon_Intensity.toFixed(6)}</small>
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("r", 4).attr("opacity", 0.5);
            tooltip.style("opacity", 0);
        })
        .transition()
        .duration(750)
        .attr("cx", d => x(d.Energy_TWh))
        .attr("cy", d => y(d.CO2_Share));
}