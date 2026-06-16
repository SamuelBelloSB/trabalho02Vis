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
 * Evolução Temporal (Gráfico de Linhas com Tooltip interativo)
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

    const line = d3.line()
        .x(d => x(d.Year))
        .y(d => y(d.Emission));

    const paths = svg.selectAll(".line-path").data(seriesList, d => d.code);
    paths.exit().remove();
    paths.enter()
        .append("path")
        .attr("class", "line-path")
        .attr("fill", "none")
        .attr("stroke", "#e41a1c")
        .attr("stroke-width", 2)
        .merge(paths)
        .transition().duration(750)
        .attr("d", d => line(d.values));

    // Adiciona círculos para interatividade (Tooltip em pontos da linha)
    const dotsGroup = svg.selectAll(".dots-group").data(seriesList, d => d.code);
    dotsGroup.exit().remove();
    
    const dotsMerged = dotsGroup.enter()
        .append("g")
        .attr("class", "dots-group")
        .merge(dotsGroup);

    const circles = dotsMerged.selectAll("circle")
        .data(d => d.values.map(v => ({ ...v, entity: d.entity })), d => d.Year);

    circles.exit().remove();
    circles.enter()
        .append("circle")
        .attr("r", 4)
        .attr("fill", "#e41a1c")
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
                Emissão: <span style="color: #e41a1c; font-weight: bold;">${d.Emission.toFixed(2)}%</span>
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
        .attr("r", 4)
        .attr("fill", "#e41a1c")
        .attr("opacity", 0.4) // Reduzido para melhorar visualização de pontos grudados
        .on("mouseover", (event, d) => {
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
        .on("mouseout", () => tooltip.transition().duration(500).style("opacity", 0))
        .on("click", (event, d) => onSelect(d.Code))
        .merge(dots)
        .transition().duration(800)
        .attr("cx", d => x(d.Emission))
        .attr("cy", d => y(d.Delta || 0))
        .attr("r", 4);
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