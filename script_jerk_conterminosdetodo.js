const axios = require('axios');
const { MACD, SMA } = require('technicalindicators');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const clc = require('cli-color');

// Configuración del CSV Writer
const csvWriter = createCsvWriter({
    path: 'indicators_29_08_dia.csv',
    header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'macd', title: 'MACD' },
        { id: 'signal', title: 'Signal' },
        { id: 'macdSlope', title: 'MACD Slope' },  // Nueva columna para la pendiente del MACD
        { id: 'macdSlopeTerms', title: 'MACD Slope Terms' },  // Términos de la pendiente
        { id: 'macdVariation', title: 'MACD Variation' },   
        { id: 'macdVarTerms', title: 'MACD Variation Terms' },  
        { id: 'macdAcceleration', title: 'MACD Acceleration' },  
        { id: 'macdAccTerms', title: 'MACD Acceleration Terms' },  
        { id: 'macdJerk', title: 'MACD Jerk' }, 
        { id: 'macdJerkTerms', title: 'MACD Jerk Terms' },  
        { id: 'volumeColor', title: 'Volume Color' },
        { id: 'latestVolume', title: 'Latest Volume' },
        { id: 'sma7Volume', title: 'SMA7 Volume' },
        { id: 'sma20Volume', title: 'SMA20 Volume' },
        { id: 'openPrice', title: 'Open Price' },
        { id: 'closePrice', title: 'Close Price' },
        { id: 'position', title: 'Position' }, 
    ],
});

let previousSignojerk = null;
let currentPosition = null;
let tradeHistory = [];

// Función para obtener datos de Binance
async function fetchBinanceData(symbol, interval, limit = 500) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: {
                symbol: symbol,
                interval: interval,
                limit: limit
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error al obtener datos de Binance para ${symbol} en ${interval}:`, error);
        return [];
    }
}

// Función para calcular el MACD y sus derivadas
function calculateMACD(data) {
    const closePrices = data.map(candle => parseFloat(candle[4]));
    return MACD.calculate({
        values: closePrices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
}

// Función para calcular el volumen, su color, y medias móviles
function calculateVolume(data) {
    const volumes = data.map(candle => parseFloat(candle[5]));
    const sma7 = SMA.calculate({ values: volumes, period: 7 });
    const sma20 = SMA.calculate({ values: volumes, period: 20 });

    const latestVolume = volumes[volumes.length - 1];
    const ma7Volume = sma7[sma7.length - 1] || 0;
    const volumeColor = data[data.length - 1][1] > data[data.length - 1][4] ? 'red' : 'green';

    return {
        latestVolume,
        volumeColor,
        sma7: ma7Volume,
        sma20: sma20[sma20.length - 1],
        latestClosePrice: parseFloat(data[data.length - 1][4]),
        latestOpenPrice: parseFloat(data[data.length - 1][1])
    };
}

// Función para calcular la pendiente del MACD y sus términos
function calculateMACDSlope(macd) {
    const n = macd.length;
    if (n < 2) return { slope: 0, macdSlopeTerms: '' };

    const slope = macd[n - 1].MACD - macd[n - 2].MACD;
    const macdSlopeTerms = `${macd[n - 1].MACD.toFixed(4)} - ${macd[n - 2].MACD.toFixed(4)}`;

    return { slope, macdSlopeTerms };
}

// Función para calcular la tercera derivada (Jerk) y agregar términos anteriores
function calculateDerivatives(signal) {
    const n = signal.length;
    if (n < 3) return { acceleration: 0, jerk: 0, macdVarTerms: '', macdAccTerms: '', macdJerkTerms: '' };

    const firstDerivative1 = signal[n - 1] - signal[n - 2];
    const firstDerivative2 = signal[n - 2] - signal[n - 3];
    const secondDerivative = firstDerivative1 - firstDerivative2;
    const jerk = secondDerivative - (firstDerivative2 - (signal[n - 3] - signal[n - 4]));

    return {
        acceleration: secondDerivative,
        jerk: jerk,
        macdVarTerms: `${signal[n - 1].toFixed(4)} - ${signal[n - 2].toFixed(4)}`,
        macdAccTerms: `(${firstDerivative1.toFixed(4)}) - (${firstDerivative2.toFixed(4)})`,
        macdJerkTerms: `(${secondDerivative.toFixed(4)}) - (${(firstDerivative2 - (signal[n - 3] - signal[n - 4])).toFixed(4)})`
    };
}

// Función para verificar y ejecutar operaciones basadas en el cambio de signo del jerk
function checkTradeConditions(jerk, volumeInfo) {
    let tradeAction = '';

    const signojerk = jerk > 0 ? 'pos' : jerk < 0 ? 'neg' : 'cero';

    if (previousSignojerk && signojerk !== previousSignojerk) {
        if (signojerk === 'pos' && currentPosition !== 'comprado') {
            tradeAction = 'Compra';
            currentPosition = 'comprado';
        } else if (signojerk === 'neg' && currentPosition !== 'vendido') {
            tradeAction = 'Venta';
            currentPosition = 'vendido';
        }
    }

    previousSignojerk = signojerk;

    if (tradeAction) {
        tradeHistory.push({
            Tipo: tradeAction,
            Precio: volumeInfo.latestClosePrice,
            Volumen: volumeInfo.latestVolume,
            Momento: new Date().toLocaleString(),
            Jerk: jerk
        });

        console.log(clc[tradeAction === 'Compra' ? 'bgGreen' : 'bgRed'].white(`${tradeAction}!`));
    }
}

// Función para guardar indicadores en el archivo CSV
async function saveIndicatorsToCSV(indicators) {
    try {
        await csvWriter.writeRecords([indicators]);
        console.log('Datos guardados en CSV.');
    } catch (error) {
        console.error('Error al guardar en CSV:', error);
    }
}

// Función principal para obtener y calcular indicadores
async function getAndPrintIndicators() {
    const symbol = 'BTCUSDT';
    const interval = '4h';

    const data = await fetchBinanceData(symbol, interval);
    if (data.length === 0) {
        console.log(`No se pudieron obtener datos para el intervalo ${interval}`);
        return;
    }

    const macd = calculateMACD(data);
    const latestMACD = macd[macd.length - 1];
    const previousMACD = macd[macd.length - 2] || { MACD: null, signal: null, histogram: null };

    const volumeInfo = calculateVolume(data);

    const { slope, macdSlopeTerms } = calculateMACDSlope(macd);
    const { acceleration, jerk, macdVarTerms, macdAccTerms, macdJerkTerms } = calculateDerivatives(macd.map(m => m.signal));

    const latestIndicators = {
        timestamp: new Date().toLocaleString(),
        macd: latestMACD.MACD,
        signal: latestMACD.signal,
        macdSlope: slope,  // Pendiente del MACD
        macdSlopeTerms: macdSlopeTerms,  // Términos de la pendiente del MACD
        macdVariation: latestMACD.signal - previousMACD.signal,  
        macdVarTerms: macdVarTerms,
        macdAcceleration: acceleration,  
        macdAccTerms: macdAccTerms,
        macdJerk: jerk,  
        macdJerkTerms: macdJerkTerms,
        volumeColor: volumeInfo.volumeColor,
        latestVolume: volumeInfo.latestVolume,
        sma7Volume: volumeInfo.sma7,
        sma20Volume: volumeInfo.sma20,
        openPrice: volumeInfo.latestOpenPrice,
        closePrice: volumeInfo.latestClosePrice,
        position: currentPosition
    };

    console.log(latestIndicators);
    checkTradeConditions(jerk, volumeInfo);
    await saveIndicatorsToCSV(latestIndicators);
}

// Ejecutar cada 5 segundos
setInterval(getAndPrintIndicators, 5000);
