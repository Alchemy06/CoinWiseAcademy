# Live Price Updates for Mock Trading

Crypto prices are now updated from **CoinGecko API** (free, no API key required).

---

## Usage

### Manual Update (One-time)

```bash
# Update prices in USD (default)
python manage.py update_asset_prices

# Update prices in a different currency
python manage.py update_asset_prices --currency gbp
python manage.py update_asset_prices --currency eur
```

### Automatic Updates (Scheduled)

Choose one method:

---

## Option 1: Windows Task Scheduler (Easiest)

1. Open **Task Scheduler**
2. Click **Create Basic Task...**
3. Fill in:
   - **Name:** "Update Mock Trading Prices"
   - **Trigger:** "Daily" or "Repeat task every 5 minutes"
4. **Action → New...**
   - **Program:** `C:\Users\adars\Programming Projects\University Courseworks\CoinWiseAcademy\team-la-mesa\.venv\Scripts\python.exe`
   - **Arguments:** `C:\Users\adars\Programming Projects\University Courseworks\CoinWiseAcademy\team-la-mesa\backend\manage.py update_asset_prices`
   - **Start in:** `C:\Users\adars\Programming Projects\University Courseworks\CoinWiseAcademy\team-la-mesa\backend`

---

## Option 2: PowerShell Script

Create `update_prices.ps1`:

```powershell
# Change to project directory
cd "C:\Users\adars\Programming Projects\University Courseworks\CoinWiseAcademy\team-la-mesa"

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Change to backend directory
cd backend

# Update prices
python manage.py update_asset_prices
```

Then run in Task Scheduler:
- **Program:** `powershell.exe`
- **Arguments:** `-File C:\path\to\update_prices.ps1`

---

## Option 3: Celery Beat (For Production)

Install Celery:
```bash
pip install celery redis
```

Create `backend/config/celery.py`:
```python
from celery import Celery
from celery.schedules import crontab
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('mock_trading')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    'update-asset-prices': {
        'task': 'mock_trading.tasks.update_prices',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
    },
}
```

Create `backend/mock_trading/tasks.py`:
```python
from celery import shared_task
from django.core.management import call_command

@shared_task
def update_prices():
    call_command('update_asset_prices', currency='usd')
    return 'Prices updated'
```

Update `backend/config/settings.py`:
```python
CELERY_BROKER_URL = 'redis://localhost:6379'
CELERY_RESULT_BACKEND = 'redis://localhost:6379'
```

Run Celery worker:
```bash
celery -A config worker -l info
```

Run Celery beat:
```bash
celery -A config beat -l info
```

---

## Supported Currencies

Any currency supported by CoinGecko:
- `usd` (default)
- `gbp`
- `eur`
- `jpy`
- `aud`
- etc.

---

## Supported Coins

| Ticker | Name | Source |
|--------|------|--------|
| BTC | Bitcoin | CoinGecko |
| ETH | Ethereum | CoinGecko |
| USDT | Tether | CoinGecko |
| BNB | BNB | CoinGecko |
| XRP | Ripple | CoinGecko |
| USDC | USD Coin | CoinGecko |
| SOL | Solana | CoinGecko |
| TRX | TRON | CoinGecko |
| DOGE | Dogecoin | CoinGecko |
| ADA | Cardano | CoinGecko |

---

## Frontend Integration

The API endpoints automatically use the latest prices:

```javascript
// Get live prices
const res = await fetch('/api/prices/live/');
const prices = await res.json();

// Execute trade at current price
const tradeRes = await fetch('/api/trade/', {
  method: 'POST',
  body: JSON.stringify({
    ticker: 'BTC',
    quantity: '0.5',
    side: 'BUY'
  })
});
```

---

## Troubleshooting

**Problem:** "CoinGecko API rate limited"
- **Solution:** Increase the interval between updates (e.g., every 30 minutes instead of 5)

**Problem:** "Connection timeout"
- **Solution:** Check internet connection. CoinGecko API might be temporarily down.

**Problem:** "Asset not found in database"
- **Solution:** Run `python manage.py seed_asset` first to create the 10 coins

**Problem:** "Prices not updating"
- **Solution:** Check Task Scheduler / Celery logs to verify the task ran
