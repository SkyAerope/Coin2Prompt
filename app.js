const express = require('express');
const ccxt = require('ccxt');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());

// 初始化交易所
const exchange = new ccxt.binance({
    enableRateLimit: true,
});

// 默认币种列表
const DEFAULT_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'];

// 计算EMA指标
function calculateEMA(prices, period) {
    if (prices.length < period) return prices.map(() => null);
    
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
        ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    
    return ema;
}

// 计算MACD指标
function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
    const emaFast = calculateEMA(prices, fast);
    const emaSlow = calculateEMA(prices, slow);
    const macdLine = emaFast.map((val, i) => val - emaSlow[i]);
    return macdLine;
}

// 计算RSI指标
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) {
        return prices.map(() => null);
    }
    
    const rsi = [];
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }
    
    for (let i = 0; i < gains.length; i++) {
        if (i < period - 1) {
            rsi.push(null);
        } else if (i === period - 1) {
            const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
            const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
            const rs = avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
        } else {
            const prevRSI = rsi[i - 1];
            const prevRS = (100 - prevRSI) / prevRSI;
            const prevAvgGain = prevRS * losses[i - 1];
            const prevAvgLoss = losses[i - 1];
            
            const avgGain = (prevAvgGain * (period - 1) + gains[i]) / period;
            const avgLoss = (prevAvgLoss * (period - 1) + losses[i]) / period;
            const rs = avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
        }
    }
    
    return [null, ...rsi];
}

// 计算ATR指标
function calculateATR(high, low, close, period = 14) {
    const tr = [];
    
    for (let i = 0; i < high.length; i++) {
        if (i === 0) {
            tr.push(high[i] - low[i]);
        } else {
            const tr1 = high[i] - low[i];
            const tr2 = Math.abs(high[i] - close[i - 1]);
            const tr3 = Math.abs(low[i] - close[i - 1]);
            tr.push(Math.max(tr1, tr2, tr3));
        }
    }
    
    const atr = [];
    for (let i = 0; i < tr.length; i++) {
        if (i < period - 1) {
            atr.push(null);
        } else if (i === period - 1) {
            atr.push(tr.slice(0, period).reduce((a, b) => a + b, 0) / period);
        } else {
            atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
        }
    }
    
    return atr;
}

// 获取K线数据
async function fetchCoinData(symbol, timeframe = '3m', limit = 100) {
    try {
        const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
        return ohlcv.map(candle => ({
            timestamp: candle[0],
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5]
        }));
    } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error.message);
        return null;
    }
}

// 获取资金费率
async function fetchFundingRate(symbol) {
    try {
        const fundingRate = await exchange.fetchFundingRate(symbol);
        return fundingRate.fundingRate || 0;
    } catch (error) {
        console.error(`Error fetching funding rate for ${symbol}:`, error.message);
        return null;
    }
}

// 获取未平仓合约
async function fetchOpenInterest(symbol) {
    try {
        const oiData = await exchange.fetchOpenInterest(symbol);
        return oiData.openInterestAmount || 0;
    } catch (error) {
        console.error(`Error fetching open interest for ${symbol}:`, error.message);
        return null;
    }
}

// 获取未平仓合约历史数据
async function fetchOpenInterestHistory(symbol, timeframe = '1h', limit = 50) {
    try {
        const oiHistory = await exchange.fetchOpenInterestHistory(symbol, timeframe, undefined, limit);
        if (oiHistory && oiHistory.length > 0) {
            return oiHistory.map(item => item.openInterestAmount || 0);
        }
        return null;
    } catch (error) {
        console.error(`Error fetching open interest history for ${symbol}:`, error.message);
        return null;
    }
}

// 生成单个币种的prompt
function generateCoinPrompt(coin, intradayData, longtermData, fundingRate = null, openInterestLatest = null, openInterestAvg = null) {
    // 获取最新的10个数据点
    const recentData = intradayData.slice(-10);
    
    // 提取价格数据
    const allPrices = intradayData.map(d => d.close);
    const midPrices = recentData.map(d => d.close);
    
    // 计算EMA 20
    const ema20Full = calculateEMA(allPrices, 20);
    const ema20 = ema20Full.slice(-10);
    const currentEma20 = ema20[ema20.length - 1];
    
    // 计算MACD
    const macdFull = calculateMACD(allPrices);
    const macd = macdFull.slice(-10);
    const currentMacd = macd[macd.length - 1];
    
    // 计算RSI 7 和 14
    const rsi7Full = calculateRSI(allPrices, 7);
    const rsi7 = rsi7Full.slice(-10);
    const currentRsi7 = rsi7[rsi7.length - 1];
    
    const rsi14Full = calculateRSI(allPrices, 14);
    const rsi14 = rsi14Full.slice(-10);
    
    // 长周期指标
    const longtermPrices = longtermData.map(d => d.close);
    const longtermEma20 = calculateEMA(longtermPrices, 20).slice(-1)[0];
    const longtermEma50 = calculateEMA(longtermPrices, 50).slice(-1)[0];
    
    const longtermHigh = longtermData.map(d => d.high);
    const longtermLow = longtermData.map(d => d.low);
    const longtermClose = longtermData.map(d => d.close);
    
    const atr3 = calculateATR(longtermHigh, longtermLow, longtermClose, 3).slice(-1)[0];
    const atr14 = calculateATR(longtermHigh, longtermLow, longtermClose, 14).slice(-1)[0];
    
    const longtermMacd = calculateMACD(longtermPrices).slice(-10);
    const longtermRsi14 = calculateRSI(longtermPrices, 14).slice(-10);
    
    const currentPrice = midPrices[midPrices.length - 1];
    const currentVolume = longtermData[longtermData.length - 1].volume;
    const avgVolume = longtermData.reduce((sum, d) => sum + d.volume, 0) / longtermData.length;
    
    // 构建OI和资金费率信息
    let oiInfo = '';
    if (openInterestLatest !== null && openInterestAvg !== null) {
        oiInfo = `Open Interest: Latest: ${openInterestLatest.toFixed(2)} Average: ${openInterestAvg.toFixed(2)}\n`;
    }
    
    let fundingInfo = '';
    if (fundingRate !== null) {
        fundingInfo = `Funding Rate: ${fundingRate}`;
    }
    
    // 格式化数组
    const formatArray = (arr) => arr.map(v => v !== null ? Number(v.toPrecision(3)) : null);
    
    // 生成prompt文本
    const prompt = `ALL ${coin} DATA
current_price = ${currentPrice.toPrecision(5)}, current_ema20 = ${currentEma20.toPrecision(5)}, current_macd = ${currentMacd.toFixed(3)}, current_rsi (7 period) = ${currentRsi7.toFixed(3)}
In addition, here is the latest ${coin} open interest and funding rate for perps (the instrument you are trading):
${oiInfo}${fundingInfo}
Intraday series (3-minute intervals, oldest → latest):
Mid prices: ${JSON.stringify(midPrices.map(p => Number(p.toPrecision(5))))}
EMA indicators (20-period): ${JSON.stringify(formatArray(ema20))}
MACD indicators: ${JSON.stringify(formatArray(macd))}
RSI indicators (7-Period): ${JSON.stringify(formatArray(rsi7))}
RSI indicators (14-Period): ${JSON.stringify(formatArray(rsi14))}
Longer-term context (4-hour timeframe):
20-Period EMA: ${longtermEma20.toFixed(3)} vs. 50-Period EMA: ${longtermEma50.toFixed(3)}
3-Period ATR: ${atr3.toFixed(3)} vs. 14-Period ATR: ${atr14.toFixed(3)}
Current Volume: ${currentVolume.toFixed(3)} vs. Average Volume: ${avgVolume.toFixed(3)}
MACD indicators: ${JSON.stringify(formatArray(longtermMacd))}
RSI indicators (14-Period): ${JSON.stringify(formatArray(longtermRsi14))}
`;
    
    return prompt;
}

// 获取单个币种的所有数据
async function fetchSingleCoinAllData(coin) {
    const symbolSpot = `${coin}/USDT`;
    const symbolPerp = `${coin}/USDT:USDT`;
    
    // console.log(`Fetching data for ${coin}...`);
    
    try {
        // 并行获取所有数据
        const [intradayData, longtermData, fundingRate, openInterestLatest, oiHistory] = await Promise.all([
            fetchCoinData(symbolSpot, '3m', 100),
            fetchCoinData(symbolSpot, '4h', 100),
            fetchFundingRate(symbolPerp),
            fetchOpenInterest(symbolPerp),
            fetchOpenInterestHistory(symbolPerp, '1h', 50)
        ]);
        
        // 检查必需数据
        if (!intradayData || !longtermData) {
            console.error(`Failed to fetch required data for ${coin}`);
            return null;
        }
        
        // 计算未平仓合约平均值
        let openInterestAvg = null;
        if (oiHistory && oiHistory.length > 0) {
            openInterestAvg = oiHistory.reduce((sum, val) => sum + val, 0) / oiHistory.length;
        } else if (openInterestLatest !== null) {
            openInterestAvg = openInterestLatest;
        }
        
        return {
            coin,
            intradayData,
            longtermData,
            fundingRate,
            openInterestLatest,
            openInterestAvg
        };
    } catch (error) {
        console.error(`Error fetching data for ${coin}:`, error.message);
        return null;
    }
}

// 生成完整的prompt
async function generateFullPrompt(coins = DEFAULT_COINS) {
    const promptHeader = `ALL OF THE PRICE OR SIGNAL DATA BELOW IS ORDERED: OLDEST → NEWEST

Timeframes note: Unless stated otherwise in a section title, intraday series are provided at 3-minute intervals. If a coin uses a different interval, it is explicitly stated in that coin's section.
CURRENT MARKET STATE FOR ALL COINS

`;
    
    console.log(`Fetching data for ${coins.length} coins in parallel...`);
    
    // 并行获取所有币种的数据
    const allCoinData = await Promise.all(
        coins.map(coin => fetchSingleCoinAllData(coin))
    );
    
    // 过滤掉失败的请求，生成prompt
    let fullPrompt = promptHeader;
    
    for (const coinData of allCoinData) {
        if (!coinData) continue;
        
        const { coin, intradayData, longtermData, fundingRate, openInterestLatest, openInterestAvg } = coinData;
        
        // 生成该币种的prompt
        const coinPrompt = generateCoinPrompt(
            coin,
            intradayData,
            longtermData,
            fundingRate,
            openInterestLatest,
            openInterestAvg
        );
        
        fullPrompt += coinPrompt + '\n';
    }
    
    console.log('Data fetching completed!');
    
    return fullPrompt;
}

// API路由

// 健康检查
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Coin2Prompt API is running',
        endpoints: {
            '/api/prompt': 'Generate full prompt for default coins',
            '/api/prompt/custom': 'Generate prompt for custom coins (POST with JSON body: {"coins": ["BTC", "ETH"]})',
            '/api/coin/:symbol': 'Get data for a single coin'
        }
    });
});

// 生成完整prompt（使用默认币种）
app.get('/api/prompt', async (req, res) => {
    try {
        const prompt = await generateFullPrompt();
        res.type('text/plain');
        res.send(prompt);
    } catch (error) {
        console.error('Error generating prompt:', error);
        res.status(500).json({
            error: 'Failed to generate prompt',
            message: error.message
        });
    }
});

// 生成自定义币种的prompt
app.post('/api/prompt/custom', async (req, res) => {
    try {
        const { coins } = req.body;
        
        if (!coins || !Array.isArray(coins) || coins.length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Please provide a "coins" array in the request body'
            });
        }
        
        const prompt = await generateFullPrompt(coins);
        res.type('text/plain');
        res.send(prompt);
    } catch (error) {
        console.error('Error generating custom prompt:', error);
        res.status(500).json({
            error: 'Failed to generate prompt',
            message: error.message
        });
    }
});

// 获取单个币种的数据
app.get('/api/coin/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const coin = symbol.toUpperCase();
        
        const coinData = await fetchSingleCoinAllData(coin);
        
        if (!coinData) {
            return res.status(404).json({
                error: 'Coin not found',
                message: `Unable to fetch data for ${coin}`
            });
        }
        
        const { intradayData, longtermData, fundingRate, openInterestLatest, openInterestAvg } = coinData;
        
        const prompt = generateCoinPrompt(
            coin,
            intradayData,
            longtermData,
            fundingRate,
            openInterestLatest,
            openInterestAvg
        );
        
        res.type('text/plain');
        res.send(prompt);
    } catch (error) {
        console.error('Error fetching coin data:', error);
        res.status(500).json({
            error: 'Failed to fetch coin data',
            message: error.message
        });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} for API information`);
});

// 导出app用于serverless部署（如Vercel）
module.exports = app;
