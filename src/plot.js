import * as d3 from 'd3';

// Formateadores D3
const formatPercent = d3.format('.2f');
const formatInteger = d3.format('d');
const formatScientific = d3.format('.2e');

function formatEmission(value) {
    if (value === null || value === undefined) return 'N/A';
    if (value > 1000) return formatScientific(value);
    return formatPercent(value) + '%';
}

export function updateTimeSeriesChart(data, countryCode) {
    const seriesList = Array.isArray(data) && data.length > 0 && data[0].values
        ? data
        : [{ entity: countryCode || 'Série', values: data || [] }];

    const allPoints = seriesList.flatMap(series => series.values || []);
    if (!allPoints.length) {
        d3.select('#line-chart-container').selectAll('svg').remove();
        return;
    }

    const margin = { top: 20, right: 120, bottom: 40, left: 50 };
    const width = 800 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const container = d3.select('#line-chart-container');
    container.selectAll('svg').remove();

    const svg = container.append('svg')
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain(d3.extent(allPoints, d => +d.Year))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(allPoints, d => +d.Emission) || 0])
        .nice()
        .range([height, 0]);

    const xAxis = d3.axisBottom(x).ticks(5).tickFormat(d3.format('d'));
    const yAxis = d3.axisLeft(y).ticks(5);

    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text').style('fill', '#888');

    svg.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text').style('fill', '#888');

    svg.selectAll('.domain, .tick line').style('stroke', '#444');

    svg.append('text')
        .attr('class', 'axis-title-x axis-label')
        .attr('text-anchor', 'end')
        .attr('x', width)
        .attr('y', height + 35)
        .text('Ano');

    svg.append('text')
        .attr('class', 'axis-title-y axis-label')
        .attr('text-anchor', 'end')
        .attr('transform', 'rotate(-90)')
        .attr('y', -40)
        .attr('x', 0)
        .text('Participação (%)');

    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(seriesList.map(s => s.entity));

    const line = d3.line()
        .x(d => x(+d.Year))
        .y(d => y(+d.Emission));

    const tooltip = d3.select('body').selectAll('.chart-tooltip').data([null]);
    tooltip.enter()
        .append('div')
        .attr('class', 'chart-tooltip')
        .style('position', 'absolute')
        .style('pointer-events', 'none')
        .style('background', 'rgba(0, 0, 0, 0.92)')
        .style('border', '1px solid #444')
        .style('border-radius', '6px')
        .style('padding', '8px 12px')
        .style('color', '#fff')
        .style('font-size', '12px')
        .style('box-shadow', '0 2px 20px rgba(0,0,0,0.4)')
        .style('z-index', '1000');

    const seriesGroups = svg.selectAll('.series-group')
        .data(seriesList, d => d.entity)
        .join('g')
        .attr('class', 'series-group');

    seriesGroups.selectAll('.line-path')
        .data(d => [d])
        .join('path')
        .attr('class', 'line-path')
        .attr('fill', 'none')
        .attr('stroke-width', 2)
        .attr('stroke', d => color(d.entity))
        .attr('d', d => line(d.values))
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('opacity', 0.9)
        .each(function(d) {
            const totalLength = this.getTotalLength();
            d3.select(this)
                .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
                .attr('stroke-dashoffset', totalLength)
                .transition().duration(900).ease(d3.easeCubicOut)
                .attr('stroke-dashoffset', 0);
        });

    const pointData = seriesList.flatMap(series => (series.values || []).map(point => ({ ...point, entity: series.entity })));

    svg.selectAll('.point')
        .data(pointData, d => `${d.entity}-${d.Year}`)
        .join(
            enter => enter.append('circle')
                .attr('class', 'point')
                .attr('r', 4)
                .attr('fill', d => color(d.entity))
                .attr('stroke', '#121212')
                .attr('stroke-width', 1)
                .attr('cx', d => x(+d.Year))
                .attr('cy', d => y(+d.Emission))
                .style('cursor', 'pointer')
                .on('mouseover', function(event, d) {
                    d3.select(this).transition().duration(100).attr('r', 6).attr('stroke-width', 2);
                    tooltip.style('display', 'block')
                        .html(`<strong>${d.entity}</strong><br/>Ano: ${d.Year}<br/>Emissão: ${formatEmission(d.Emission)}`);
                })
                .on('mousemove', function(event) {
                    tooltip.style('left', `${event.pageX + 12}px`).style('top', `${event.pageY + 12}px`);
                })
                .on('mouseout', function() {
                    d3.select(this).transition().duration(100).attr('r', 4).attr('stroke-width', 1);
                    tooltip.style('display', 'none');
                }),
            update => update.transition().duration(400)
                .attr('cx', d => x(+d.Year))
                .attr('cy', d => y(+d.Emission))
                .attr('fill', d => color(d.entity)),
            exit => exit.remove()
        );

    const legend = svg.append('g').attr('class', 'legend').attr('transform', `translate(${width + 20}, 0)`);
    legend.selectAll('.legend-item')
        .data(seriesList)
        .join('g')
        .attr('class', 'legend-item')
        .call(g => {
            g.append('rect')
                .attr('width', 12)
                .attr('height', 12)
                .attr('y', (d, i) => i * 20)
                .attr('fill', d => color(d.entity));
            g.append('text')
                .attr('x', 16)
                .attr('y', (d, i) => i * 20 + 10)
                .attr('fill', '#ddd')
                .style('font-size', '11px')
                .text(d => d.entity);
        });
}

export function updateBarChart(data) {
    const margin = { top: 10, right: 30, bottom: 30, left: 100 };
    const width = 400 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const container = d3.select('#bar-chart-container');
    let svgElement = container.select('svg');

    if (svgElement.empty()) {
        svgElement = container.append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        svgElement.append('g').attr('class', 'y-axis');
        svgElement.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${height})`);
    } else {
        svgElement = svgElement.select('g');
    }

    const y = d3.scaleBand()
        .domain(data.map(d => d.Entity))
        .range([0, height])
        .padding(0.2);

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => +d.Emission)])
        .range([0, width]);

    svgElement.select('.y-axis').transition().duration(500).call(d3.axisLeft(y));
    svgElement.select('.x-axis').transition().duration(500).call(d3.axisBottom(x).ticks(3));

    // Legenda do eixo X
    if (svgElement.select('.axis-title-x').empty()) {
        svgElement.append('text').attr('class', 'axis-title-x axis-label').attr('text-anchor', 'end')
            .attr('x', width).attr('y', height + 25).text('Emissão Acumulada (%)');
    }

    const barTooltip = d3.select('body').selectAll('.bar-tooltip').data([null])
        .join(
            enter => enter.append('div')
                .attr('class', 'bar-tooltip')
                .style('position', 'absolute')
                .style('pointer-events', 'none')
                .style('background', 'rgba(0, 0, 0, 0.92)')
                .style('border', '1px solid #444')
                .style('border-radius', '6px')
                .style('padding', '8px 12px')
                .style('color', '#fff')
                .style('font-size', '12px')
                .style('box-shadow', '0 2px 20px rgba(0,0,0,0.4)')
                .style('z-index', '1000'),
            update => update
        );

    svgElement.selectAll('.bar')
        .data(data, d => d.Entity)
        .join(
            enter => enter.append('rect')
                .attr('class', 'bar')
                .attr('x', 0)
                .attr('y', d => y(d.Entity))
                .attr('height', y.bandwidth())
                .attr('fill', '#e41a1c')
                .attr('width', 0)
                .style('cursor', 'pointer')
                .on('mouseover', function(event, d) {
                    d3.select(this).transition().duration(150).attr('fill', '#ff5b5b');
                    barTooltip.style('display', 'block')
                        .html(`<strong>${d.Entity}</strong><br/>Emissão: ${formatEmission(d.Emission)}`);
                })
                .on('mousemove', function(event) {
                    barTooltip.style('left', `${event.pageX + 12}px`).style('top', `${event.pageY + 12}px`);
                })
                .on('mouseout', function() {
                    d3.select(this).transition().duration(150).attr('fill', '#e41a1c');
                    barTooltip.style('display', 'none');
                })
                .call(enter => enter.transition().duration(700).attr('width', d => x(d.Emission))),
            update => update.transition().duration(500)
                .attr('y', d => y(d.Entity))
                .attr('height', y.bandwidth())
                .attr('width', d => x(d.Emission)),
            exit => exit.remove()
        );
}

export function updateScatterPlot(data, onCountryClick) {
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = 500 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const container = d3.select('#scatter-plot-container');
    let svgElement = container.select('svg');

    if (svgElement.empty()) {
        svgElement = container.append('svg')
            .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        svgElement.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${height})`);
        svgElement.append('g').attr('class', 'y-axis');
        svgElement.append('text').attr('class', 'label').attr('x', width).attr('y', height + 35).attr('text-anchor', 'end').attr('fill', '#888').style('font-size', '10px').text('Participação Acumulada (%)');
        svgElement.append('text').attr('class', 'label').attr('transform', 'rotate(-90)').attr('y', -40).attr('text-anchor', 'end').attr('fill', '#888').style('font-size', '10px').text('Tendência (Delta Anual)');
    } else {
        svgElement = svgElement.select('g');
    }

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

    const tooltip = d3.select('body').selectAll('.scatter-tooltip').data([null]);
    tooltip.enter()
        .append('div')
        .attr('class', 'scatter-tooltip')
        .style('position', 'absolute')
        .style('pointer-events', 'none')
        .style('background', 'rgba(0, 0, 0, 0.88)')
        .style('border', '1px solid #444')
        .style('border-radius', '6px')
        .style('padding', '8px 10px')
        .style('color', '#fff')
        .style('font-size', '12px')
        .style('z-index', '1000');

    svgElement.selectAll('.dot')
        .data(validData, d => d.Code)
        .join(
            enter => enter.append('circle')
                .attr('class', 'dot')
                .attr('r', 5)
                .attr('fill', '#e41a1c')
                .attr('opacity', 0.6)
                .attr('cx', d => x(d.Emission))
                .attr('cy', d => y(d.Delta))
                .on('mouseover', function(event, d) {
                    d3.select(this).attr('opacity', 1).attr('stroke', '#fff');
                    d3.select(`#${d.Code}`).style('stroke', '#fff').style('stroke-width', '2px');
                    d3.select('.scatter-tooltip')
                        .style('display', 'block')
                        .html(`<strong>${d.Entity}</strong><br/>Emissão: ${formatEmission(d.Emission)}`);
                })
                .on('mousemove', function(event) {
                    d3.select('.scatter-tooltip')
                        .style('left', `${event.pageX + 12}px`)
                        .style('top', `${event.pageY + 12}px`);
                })
                .on('mouseout', function(event, d) {
                    d3.select(this).attr('opacity', 0.6).attr('stroke', null);
                    d3.select(`#${d.Code}`).style('stroke', null);
                    d3.select('.scatter-tooltip').style('display', 'none');
                })
                .on('click', (e, d) => onCountryClick(d.Code)),
            update => update.transition()
                .attr('cx', d => x(d.Emission))
                .attr('cy', d => y(d.Delta)),
            exit => exit.remove()
        );
}

export async function loadChoroplethMap(data, onCountryClick) {
    const container = d3.select('#chart-container');
    const legendContainer = d3.select('#map-legend');
    
    // Singleton: Carrega o SVG apenas uma vez
    let svg = container.select('svg');
    if (svg.empty()) {
        try {
            // Carregar SVG com fetch + DOMParser (compatível com D3 v7+)
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
            svg.selectAll('text, title, metadata').remove();
        } catch (error) {
            console.error('Erro ao carregar SVG:', error);
            container.html(`<div style="color: #f44; padding: 20px; text-align: center;">
                <strong>Erro:</strong> ${error.message}<br/>
                <small>Verifique se o ficheiro /share-of-cumulative-co2.svg existe.</small>
            </div>`);
            return; // Exit early
        }
    }

    // Build quick lookup maps by ISO code
    const codeMap = new Map(data.map(d => [d.Code.toUpperCase(), d]));

    // Color scale: YlOrRd evoca aquecimento e emissões (Tema científico)
    const thresholds = [0, 0.1, 0.5, 1, 2, 5, 10, 20];
    const colors = d3.schemeYlOrRd[9];
    const colorScale = d3.scaleThreshold().domain(thresholds).range(colors);

    // Renderização da Legenda (apenas uma vez)
    if (legendContainer.select('svg').empty()) {
        const lW = 280, cellW = lW / colors.length;
        const lSvg = legendContainer.append('svg').attr('viewBox', `0 0 ${lW} 40`);
        lSvg.selectAll('rect').data(colors).join('rect')
            .attr('x', (d, i) => i * cellW).attr('width', cellW).attr('height', 10).attr('fill', d => d);
        const xL = d3.scaleLinear().domain([0, 20]).range([0, lW]);
        lSvg.append('g').attr('transform', 'translate(0,10)')
            .call(d3.axisBottom(xL).tickValues(thresholds).tickFormat(d => d + '%'))
            .style('color', '#888').style('font-size', '8px').select('.domain').remove();
    }

    // Singleton para o Tooltip (Evita múltiplas instâncias no DOM)
    let tooltip = d3.select('.map-tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div').attr('class', 'map-tooltip').style('display', 'none');
    }

    // Função helper para validar ISO3
    function isValidISO3(code) {
        if (!code) return false;
        return /^[A-Z]{3}$/.test(code.toUpperCase());
    }

    // PASSO 1: Selecionar features e atualizar apenas cores (sem re-binding listeners)
    const features = svg.selectAll('[id]')
        .filter(function() { return this.id && isValidISO3(this.id); });

    features.transition().duration(250)
        .attr('fill', function() {
            const iso = this.id.toUpperCase();
            const entry = codeMap.get(iso);
            const val = entry ? entry.Emission : null;
            return (val === null || val === 0) ? '#2a2a2a' : colorScale(val);
        });

    // PASSO 2: Bind listeners uma única vez (usa a flag data para evitar rebinding)
    // Se já têm listeners, esta chamada é no-op (meramente dados + transição)
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
                   .html(`<strong>${entry ? entry.Entity : iso}</strong><br/>
                          <em>Participação:</em> ${formatEmission(val)}<br/>
                          <em>Tendência (Δ):</em> ${entry && entry.Delta ? formatPercent(entry.Delta) + '%' : 'N/A'}`);
        })
        .on('mouseout', function() {
            d3.select(this).style('stroke', null).style('stroke-width', null);
            tooltip.style('display', 'none');
        })
        .on('click', function() {
            const iso = this.id.toUpperCase();
            onCountryClick(iso);
        });
}