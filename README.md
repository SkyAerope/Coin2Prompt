# Coin2Prompt
自动获取所需Cryptocurrency的所有信息并生成AI Prompt的云函数

## 安装依赖

```bash
pnpm install
# 或者
npm install
```

## 启动服务器

### 开发模式（自动重启）
```bash
pnpm dev
# 或者
npm run dev
```

### 生产模式
```bash
pnpm start
# 或者
npm start
```

服务器默认运行在 `http://localhost:3000`

## API 端点

### 1. 健康检查
**GET** `/`

返回 API 状态和可用端点列表。

**响应示例：**
```json
{
  "status": "ok",
  "message": "Coin2Prompt API is running",
  "endpoints": {
    "/api/prompt": "Generate full prompt for default coins",
    "/api/prompt/custom": "Generate prompt for custom coins",
    "/api/coin/:symbol": "Get data for a single coin"
  }
}
```

### 2. 生成默认币种的 Prompt
**GET** `/api/prompt`

生成 BTC、ETH、SOL、BNB、XRP、DOGE 的完整交易 prompt。

**响应：** 文本格式的完整 prompt

**示例：**
```bash
curl http://localhost:3000/api/prompt
```

### 3. 生成自定义币种的 Prompt
**POST** `/api/prompt/custom`

生成指定币种的交易 prompt。

**请求体：**
```json
{
  "coins": ["BTC", "ETH", "ADA"]
}
```

**响应：** 文本格式的完整 prompt

**示例：**
```bash
curl -X POST http://localhost:3000/api/prompt/custom \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC", "ETH", "ADA"]}'
```

### 4. 获取单个币种数据
**GET** `/api/coin/:symbol`

获取指定币种的详细数据和技术指标。

**参数：**
- `symbol`: 币种符号（如 BTC, ETH）

**响应：** 文本格式的该币种 prompt

**示例：**
```bash
curl http://localhost:3000/api/coin/BTC
```

## 数据说明

### 包含的技术指标

**短周期（3分钟）：**
- 最新 10 个中间价格
- EMA 20 期指标
- MACD 指标
- RSI 7 期指标
- RSI 14 期指标

**长周期（4小时）：**
- EMA 20 期 vs EMA 50 期
- ATR 3 期 vs ATR 14 期
- 当前成交量 vs 平均成交量
- MACD 指标（最新 10 个）
- RSI 14 期指标（最新 10 个）

**合约数据：**
- 资金费率（Funding Rate）
- 未平仓合约（Open Interest）最新值
- 未平仓合约平均值