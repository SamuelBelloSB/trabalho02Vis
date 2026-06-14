import { loadDb } from './config.js';
import { loadChoroplethMap } from './plot.js';

window.onload = async () => {
    console.log("Inicializando o DuckDB-WASM...");
    
    try {
        const db = await loadDb();
        const conn = await db.connect();
        
        console.log("Baixando o arquivo CSV...");
        const res = await fetch('/share-of-cumulative-co2.csv');

        if (!res.ok) {
            throw new Error("O arquivo CSV não foi encontrado na pasta de dados!");
        }

        const buffer = new Uint8Array(await res.arrayBuffer());
        await db.registerFileBuffer('share-of-cumulative-co2.csv', buffer);
        console.log("✅ CSV registrado com sucesso!");

                const sql = `
                        SELECT
                                Entity,
                                Code,
                                CAST("Share of global cumulative CO₂ emissions" AS DOUBLE) AS share,
                                CAST(Year AS INTEGER) AS Year
                        FROM read_csv_auto('share-of-cumulative-co2.csv')
                        WHERE Code IS NOT NULL
                            AND Year = (SELECT MAX(Year) FROM read_csv_auto('share-of-cumulative-co2.csv'))
                        ORDER BY Entity;
                `;

        const result = await conn.query(sql);
        // Normalize rows using toJSON() to get named properties
        const rawRows = result.toArray().map(r => r.toJSON());
        console.log('Preview raw rows:', rawRows.slice(0, 6));
        const data = rawRows.map(r => ({
            Entity: r.Entity,
            Code: r.Code,
            Year: Number(r.Year),
            share: Number(r.share ?? r['Share of global cumulative CO₂ emissions']),
        }));

        console.log("Dados prontos para o D3 (choropleth):", data.slice(0,20));

        await loadChoroplethMap(data);

    } catch (error) {
        console.error("❌ Erro fatal:", error);
    }
};