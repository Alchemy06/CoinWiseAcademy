# Mock Trading API Endpoints

All endpoints are prefixed with `/api/`. Authentication is required except where noted.

---

## PRICES & MARKET DATA

### GET /api/prices/live/
**Description:** Get current price and 24h change for all assets (non-authenticated)

**Authentication:** Not required

**Response:**
```json
[
  {
    "ticker": "BTC",
    "current_price": "50000.00000000",
    "price_change_24h": "2.50",
    "last_updated": "2026-05-11T12:00:00Z"
  },
  {
    "ticker": "ETH",
    "current_price": "3000.00000000",
    "price_change_24h": "1.25",
    "last_updated": "2026-05-11T12:00:00Z"
  }
]
```

---

### GET /api/prices/{ticker}/
**Description:** Get full details for a single asset (non-authenticated)

**Authentication:** Not required

**Path Parameters:**
- `ticker` (string): Asset ticker (e.g., BTC, ETH)

**Response:**
```json
{
  "id": 1,
  "ticker": "BTC",
  "name": "Bitcoin",
  "current_price": "50000.00000000",
  "price_change_24h": "2.50",
  "last_updated": "2026-05-11T12:00:00Z"
}
```

**Example:**
```bash
GET /api/prices/BTC/
```

---

## CHART DATA

### GET /api/chart/{ticker}/?days={days}
**Description:** Get OHLC candle data for TradingView charts (non-authenticated)

**Authentication:** Not required

**Path Parameters:**
- `ticker` (string): Asset ticker (e.g., BTC, ETH)

**Query Parameters:**
- `days` (integer, optional): Number of days of history (default: 1, max: 365)

**Response:**
```json
[
  {
    "time": 1715425200,
    "open": "49000.00000000",
    "high": "51000.00000000",
    "low": "48000.00000000",
    "close": "50500.00000000",
    "volume": "100.00000000"
  },
  {
    "time": 1715511600,
    "open": "50500.00000000",
    "high": "52000.00000000",
    "low": "50000.00000000",
    "close": "51500.00000000",
    "volume": "150.00000000"
  }
]
```

**Example:**
```bash
GET /api/chart/BTC/?days=7
```

---

## TRADING

### POST /api/trade/
**Description:** Execute a BUY or SELL trade

**Authentication:** Required (JWT token in Authorization header)

**Request Body:**
```json
{
  "ticker": "BTC",
  "quantity": "0.1",
  "side": "BUY",
  "competition_id": 1
}
```

**Parameters:**
- `ticker` (string, required): Asset ticker
- `quantity` (string, required): Amount to trade (decimal format)
- `side` (string, required): "BUY" or "SELL"
- `competition_id` (integer, optional): Competition ID (defaults to active competition)

**Response (Success - 201):**
```json
{
  "message": "Trade executed successfully.",
  "trade": {
    "id": 42,
    "asset_ticker": "BTC",
    "asset_name": "Bitcoin",
    "side": "BUY",
    "quantity": "0.10000000",
    "price_at_execution": "50000.00000000",
    "total_value": "5000.00000000",
    "timestamp": "2026-05-11T12:34:56Z"
  },
  "portfolio": {
    "username": "trader1",
    "cash_balance": "5000.00",
    "holdings_value": "5000.00",
    "total_equity": "10000.00",
    "all_time_return_pct": "0.0000",
    "weekly_return_pct": "0.0000",
    "monthly_return_pct": "0.0000",
    "yearly_return_pct": "0.0000",
    "positions": [
      {
        "asset_ticker": "BTC",
        "asset_name": "Bitcoin",
        "quantity": "0.10000000",
        "avg_buy_price": "50000.00000000",
        "current_price": "50000.00000000",
        "current_value": 5000.0,
        "cost_basis": 5000.0,
        "unrealised_pnl": 0.0,
        "unrealised_pnl_pct": 0.0,
        "portfolio_pct": 50.0
      }
    ]
  }
}
```

**Response (Error - 400):**
```json
{
  "error": "Insufficient funds. You need $50000.00 but only have $10000.00."
}
```

**Example - BUY:**
```bash
POST /api/trade/
Content-Type: application/json
Authorization: Bearer <token>

{
  "ticker": "BTC",
  "quantity": "0.5",
  "side": "BUY"
}
```

**Example - SELL:**
```bash
POST /api/trade/
Content-Type: application/json
Authorization: Bearer <token>

{
  "ticker": "BTC",
  "quantity": "0.2",
  "side": "SELL"
}
```

---

## PORTFOLIO

### GET /api/portfolio/
**Description:** Get full wallet state including cash, positions, and performance metrics

**Authentication:** Required

**Query Parameters:**
- `competition_id` (integer, optional): Filter by competition (defaults to active)

**Response:**
```json
{
  "username": "trader1",
  "cash_balance": "10000.00",
  "holdings_value": "0.00",
  "total_equity": "10000.00",
  "all_time_return_pct": "0.0000",
  "weekly_return_pct": "0.0000",
  "monthly_return_pct": "0.0000",
  "yearly_return_pct": "0.0000",
  "positions": []
}
```

**Example:**
```bash
GET /api/portfolio/
Authorization: Bearer <token>
```

---

## TRADE HISTORY

### GET /api/trades/
**Description:** Get paginated trade history for authenticated user

**Authentication:** Required

**Query Parameters:**
- `ticker` (string, optional): Filter by asset ticker
- `page` (integer, optional): Page number (default: 1)
- `page_size` (integer, optional): Results per page (default: 20, max: 100)
- `competition_id` (integer, optional): Filter by competition

**Response:**
```json
{
  "total": 25,
  "page": 1,
  "page_size": 20,
  "results": [
    {
      "id": 1,
      "asset_ticker": "BTC",
      "asset_name": "Bitcoin",
      "side": "BUY",
      "quantity": "0.10000000",
      "price_at_execution": "50000.00000000",
      "total_value": "5000.00000000",
      "timestamp": "2026-05-11T12:34:56Z"
    },
    {
      "id": 2,
      "asset_ticker": "ETH",
      "asset_name": "Ethereum",
      "side": "BUY",
      "quantity": "1.50000000",
      "price_at_execution": "3000.00000000",
      "total_value": "4500.00000000",
      "timestamp": "2026-05-11T13:45:30Z"
    }
  ]
}
```

**Examples:**
```bash
# All trades
GET /api/trades/
Authorization: Bearer <token>

# Filter by ticker
GET /api/trades/?ticker=BTC
Authorization: Bearer <token>

# Pagination
GET /api/trades/?page=2&page_size=10
Authorization: Bearer <token>
```

---

## LEADERBOARD

### GET /api/leaderboard/
**Description:** Get leaderboard with top winners and losers for a period (non-authenticated)

**Authentication:** Not required

**Query Parameters:**
- `period` (string, optional): "all" | "weekly" | "monthly" | "yearly" (default: "all")
- `competition_id` (integer, optional): Filter by competition ID
- `limit` (integer, optional): Number of winners/losers to return (default: 10, max: 50)

**Response:**
```json
{
  "period": "all",
  "winners": [
    {
      "username": "trader_pro",
      "total_equity": "15000.00",
      "all_time_return_pct": "50.0000",
      "weekly_return_pct": "5.5000",
      "monthly_return_pct": "12.3000",
      "yearly_return_pct": "50.0000"
    },
    {
      "username": "trader1",
      "total_equity": "12000.00",
      "all_time_return_pct": "20.0000",
      "weekly_return_pct": "2.1000",
      "monthly_return_pct": "8.9000",
      "yearly_return_pct": "20.0000"
    }
  ],
  "losers": [
    {
      "username": "risky_trader",
      "total_equity": "7500.00",
      "all_time_return_pct": "-25.0000",
      "weekly_return_pct": "-3.2000",
      "monthly_return_pct": "-15.5000",
      "yearly_return_pct": "-25.0000"
    }
  ]
}
```

**Examples:**
```bash
# All-time leaderboard
GET /api/leaderboard/

# Weekly returns
GET /api/leaderboard/?period=weekly

# Top 5 for specific competition
GET /api/leaderboard/?competition_id=1&limit=5

# Monthly returns for competition
GET /api/leaderboard/?competition_id=1&period=monthly
```

---

## COMPETITION

### POST /api/competition/join/
**Description:** Join a competition or retrieve existing participant (non-authenticated for first-time)

**Authentication:** Required

**Request Body:**
```json
{
  "competition_id": 1
}
```

**Parameters:**
- `competition_id` (integer, optional): Competition to join (defaults to latest active)

**Response (Created - 201 - New Participant):**
```json
{
  "message": "Joined competition.",
  "portfolio": {
    "username": "trader1",
    "cash_balance": "10000.00",
    "holdings_value": "0.00",
    "total_equity": "10000.00",
    "all_time_return_pct": "0.0000",
    "weekly_return_pct": "0.0000",
    "monthly_return_pct": "0.0000",
    "yearly_return_pct": "0.0000",
    "positions": []
  }
}
```

**Response (OK - 200 - Already Participant):**
```json
{
  "message": "Already a participant.",
  "portfolio": {
    "username": "trader1",
    "cash_balance": "5000.00",
    "holdings_value": "5000.00",
    "total_equity": "10000.00",
    "all_time_return_pct": "0.0000",
    "weekly_return_pct": "0.0000",
    "monthly_return_pct": "0.0000",
    "yearly_return_pct": "0.0000",
    "positions": [...]
  }
}
```

**Example:**
```bash
POST /api/competition/join/
Content-Type: application/json
Authorization: Bearer <token>

{
  "competition_id": 1
}
```

---

## ERROR RESPONSES

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

### Common HTTP Status Codes:
- **200 OK** - Successful GET request
- **201 CREATED** - Successful POST that created a resource
- **400 BAD REQUEST** - Invalid input or business logic error (insufficient funds, invalid quantity, etc.)
- **401 UNAUTHORIZED** - Missing or invalid authentication token
- **404 NOT FOUND** - Resource not found (asset, competition, user)
- **500 INTERNAL SERVER ERROR** - Unexpected server error

### Example Error Response:
```json
{
  "error": "Insufficient funds. You need $50000.00 but only have $10000.00."
}
```

---

## AUTHENTICATION

Include JWT token in the Authorization header:

```bash
Authorization: Bearer <your_jwt_token>
```

Get your token by logging in via the accounts API:

```bash
POST /api/auth/login/
Content-Type: application/json

{
  "username": "trader1",
  "password": "your_password"
}

# Response:
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

---

## QUICK REFERENCE TABLE

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/prices/live/` | No | All live prices |
| GET | `/api/prices/{ticker}/` | No | Single asset detail |
| GET | `/api/chart/{ticker}/` | No | OHLC candle history |
| POST | `/api/trade/` | Yes | Execute trade |
| GET | `/api/portfolio/` | Yes | Full wallet state |
| GET | `/api/trades/` | Yes | Trade history |
| GET | `/api/leaderboard/` | No | Leaderboard |
| POST | `/api/competition/join/` | Yes | Join competition |

---

## FRONTEND WORKFLOW EXAMPLE

```javascript
// 1. Login
const loginRes = await fetch('/api/auth/login/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'trader1', password: 'password' })
});
const { access } = await loginRes.json();
const token = access;

// 2. Join competition
const joinRes = await fetch('/api/competition/join/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({})
});
const portfolio = await joinRes.json();

// 3. Get live prices
const pricesRes = await fetch('/api/prices/live/');
const prices = await pricesRes.json();

// 4. Execute trade
const tradeRes = await fetch('/api/trade/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    ticker: 'BTC',
    quantity: '0.5',
    side: 'BUY'
  })
});
const trade = await tradeRes.json();

// 5. Get updated portfolio
const portfolioRes = await fetch('/api/portfolio/', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const updatedPortfolio = await portfolioRes.json();

// 6. Get leaderboard
const leaderboardRes = await fetch('/api/leaderboard/?period=weekly&limit=10');
const leaderboard = await leaderboardRes.json();
```
