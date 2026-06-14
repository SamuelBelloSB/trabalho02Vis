import * as d3 from 'd3';

export async function loadTimeSeriesChart(data) {
    const container = d3.select('#chart-container');
    container.selectAll('*').remove(); // Limpa o container
    const table = container.append('table')
        .attr('class', 'data-table');

    const columns = ['Entity', 'Year', 'Share of global cumulative CO₂ emissions'];

    const thead = table.append('thead');
    thead.append('tr')
        .selectAll('th')
        .data(columns)
        .join('th')
        .text(d => d);

    const tbody = table.append('tbody');

    const rows = tbody.selectAll('tr')
        .data(data)
        .join('tr');

    rows.selectAll('td')
        .data(row => [row.Entity, row.Year, row.share.toFixed(6)])
        .join('td')
        .text(d => d);
}

export async function loadChoroplethMap(data) {
    const container = d3.select('#chart-container');
    container.selectAll('*').remove();

    // Build quick lookup maps by ISO code
    const codeMap = new Map();
    data.forEach(d => {
        if (d.Code) codeMap.set(d.Code, { Entity: d.Entity, share: d.share });
    });

    // Load SVG and inject
    const svgDoc = await d3.xml('/share-of-cumulative-co2.svg');
    const imported = document.importNode(svgDoc.documentElement, true);
    container.node().appendChild(imported);

    const svg = container.select('svg');

    // Color scale (thresholds in percent units)
    const thresholds = [0.1, 0.5, 1, 2, 5, 10];
    const colors = d3.schemeBlues[7] || ['#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#3182bd','#08519c'];
    const colorScale = d3.scaleThreshold()
        .domain(thresholds)
        .range(colors);

    // Tooltip
    const tooltip = d3.select('body').append('div')
        .attr('class', 'map-tooltip')
        .style('position', 'absolute')
        .style('pointer-events', 'none')
        .style('background', '#fff')
        .style('padding', '8px 10px')
        .style('border-radius', '4px')
        .style('box-shadow', '0 2px 6px rgba(0,0,0,0.15)')
        .style('display', 'none')
        .style('font-size', '13px');

    // Helper to format share value
    function formatShare(v) {
        if (v == null || isNaN(v)) return 'No data';
        // If values are small (<1), assume percent already; otherwise treat as percent value
        const formatted = Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
        return `${formatted}%`;
    }

    // Select map features with id (ISO3) and color them
    svg.selectAll('[id]')
        .filter(function() { return this.id && this.id.length === 3; })
        .each(function() {
            const node = d3.select(this);
            const iso = this.id;
            const entry = codeMap.get(iso);
            const val = entry ? entry.share : null;
            const fill = val == null ? '#eee' : colorScale(val);
            node.attr('fill', fill).attr('data-iso', iso);

            node.on('mouseover', function(event) {
                node.raise().style('stroke', '#333').style('stroke-width', '1.5px');
                tooltip.html(`<strong>${entry ? entry.Entity : iso}</strong><div>${formatShare(val)}</div>`)
                    .style('display', 'block');
            })
            .on('mousemove', function(event) {
                tooltip.style('left', (event.pageX + 12) + 'px')
                    .style('top', (event.pageY + 12) + 'px');
            })
            .on('mouseout', function() {
                node.style('stroke', null).style('stroke-width', null);
                tooltip.style('display', 'none');
            });
        });

}