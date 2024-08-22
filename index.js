const axios = require('axios');
const { MACD } = require('technicalindicators');
//const { createObjectCsvWriter } = require('csv-writer');

let arrayDif = [];
let opera = false;
let action = "no_action";
let lastOp = null;
let difference = 0;
let lastDifference = null;
let firstRun = true; // Para saber si es la primera ejecución
let initialDifference = null; // Guardar la diferencia inicial
let previousClosePrice = null; // Guardar el precio de cierre de la vela anterior

// Configuración de la API de Binance
const BASE_URL = 'https://api.binance.com';
const SYMBOL = 'BTCUSDT';
const INTERVAL = '1m'; // Temporalidad para el cálculo del MACD (4 horas)
const LIMIT = 101; // Límite de velas para cálculo del MACD (1 más de lo necesario)

// Configuración para MACD
const MACD_INPUT = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
};

// Configuración del CSV Writer
//const csvWriter = createObjectCsvWriter({
  //  path: 'macd_data.csv',
    //header: [
      //  { id: 'date', title: 'Date' },
        //{ id: 'close', title: 'Close Price' },
        //{ id: 'macd', title: 'MACD' },
        //{ id: 'signal', title: 'Signal' },
        //{ id: 'difference', title: 'Difference' },
        //{ id: 'last_difference', title: 'Last Difference' },
        //{ id: 'action', title: 'Action' }
    //],
  //  append: true // Agregar los datos nuevos sin sobrescribir
//});

// Función para obtener los datos de velas (kline) desde Binance
async function getKlines() {
    const endpoint = `${BASE_URL}/api/v3/klines`;
    const response = await axios.get(endpoint, {
        params: {
            symbol: SYMBOL,
            interval: INTERVAL,
            limit: LIMIT
        }
    });
    return response.data.map(k => parseFloat(k[4])); // Precios de cierre
}

// Función para calcular el MACD y la señal
function calculateMACD(closes) {
    const macdInput = {
        values: closes,
        fastPeriod: MACD_INPUT.fastPeriod,
        slowPeriod: MACD_INPUT.slowPeriod,
        signalPeriod: MACD_INPUT.signalPeriod
    };

    return MACD.calculate(macdInput);
}

// Función para mostrar y guardar los datos
async function logAndDisplayData(macdData, closePrice) {
    if (macdData.length > 0) {
        const lastData = macdData[macdData.length - 1];
        const date = new Date().toISOString(); // Fecha y hora actual en formato ISO

        // Diferencia entre MACD y la señal
        difference = lastData.MACD - lastData.signal;

        // Comparar con la diferencia de la vela anterior
        if (firstRun) {
            // Si es la primera ejecución, usa la diferencia de la vela anterior
            if (initialDifference !== null) {
                lastDifference = initialDifference;

                if (difference > lastDifference && lastOp !== "compra") {
                    action = "comprar";
                    precioOp = closePrice;
                    lastOp = "compra";
                    opera = true;
                } else if (difference < lastDifference && lastOp !== "venta") {
                    action = "vender";
                    precioOp = closePrice;
                    lastOp = "venta";
                    opera = true;
                }
            } else {
                // Si no hay diferencia anterior, esperar
                action = "esperar";
                opera = false;
            }

            firstRun = false;
        } else {
            // Comparar con el último elemento del array
            lastDifference = arrayDif[arrayDif.length - 1];
            if (difference > lastDifference && lastOp !== "compra") {
                action = "comprar";
                precioOp = closePrice;
                lastOp = "compra";
                opera = true;
            } else if (difference < lastDifference && lastOp !== "venta") {
                action = "vender";
                precioOp = closePrice;
                lastOp = "venta";
                opera = true;
            }
        }

        // Agregar la nueva diferencia al array
        arrayDif.push(difference);

        // Mantener el tamaño del array en un máximo de 5 elementos
        if (arrayDif.length > 5) {
            arrayDif.shift(); // Elimina el primer elemento del array
        }

        // Mostrar y guardar en CSV
        if (opera) {
            console.log("----------------------");
            console.log(`Fecha: ${date}`);
            console.log(`MACD actual: ${lastData.MACD}`);
            console.log(`Señal actual: ${lastData.signal}`);
            console.log(`Diferencia: ${difference}`);
            console.log(`Acción: ${action}`);
            console.log(`Precio de operación: ${closePrice}`);
            opera = false;
        } else {
            console.log(`No opera`);
            console.log(`No opera - Diferencia: ${difference}`);
        }

        // Guardar en CSV
       
        //await csvWriter.writeRecords([{
          //  date,
            //close: closePrice,
            //macd: lastData.MACD,
            //signal: lastData.signal,
            //difference,
            //last_difference: lastDifference, // Agregar la diferencia con la que se compara
            //action
        //}]);
    }// else {
      //  console.log('No hay datos suficientes para calcular MACD');
   // }
//}
*/
// Función principal para ejecutar
async function main() {
    try {
        const closes = await getKlines();
        if (closes.length >= MACD_INPUT.slowPeriod) { // Verificar que hay suficientes datos
            // Guardar el precio de cierre de la vela anterior
            if (previousClosePrice === null) {
                previousClosePrice = closes[closes.length - 2];
                // Obtener el MACD de la vela anterior
                const previousCloses = closes.slice(0, -1); // Excluir la vela más reciente
                const macdDataPrevious = calculateMACD(previousCloses);
                const lastDataPrevious = macdDataPrevious[macdDataPrevious.length - 1];
                initialDifference = lastDataPrevious.MACD - lastDataPrevious.signal; // Diferencia de la vela anterior
            }
            
            const macdData = calculateMACD(closes);
            const closePrice = closes[closes.length - 1]; // Precio de cierre actual
            await logAndDisplayData(macdData, closePrice);
        } else {
            console.log('No hay suficientes datos para calcular MACD');
        }
    } catch (error) {
        console.error('Error obteniendo datos de Binance:', error.message);
    }
}

// Ejecutar la función inmediatamente
main();

// Ejecutar cada 2 horas
setInterval(main,  60 * 1000); // 2 horas
