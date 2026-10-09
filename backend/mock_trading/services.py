from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from .models import Trade, Position, Participant, Asset


class TradeExecutionError(Exception):
    pass


def execute_trade(participant_id: int, ticker: str, quantity, side: str) -> Trade:
    """
    Core trading engine. Atomic — safe against race conditions.

    Args:
        participant_id: Participant PK
        ticker: e.g. 'BTC'
        quantity: amount of the coin (str/float/Decimal accepted)
        side: 'BUY' or 'SELL'

    Returns:
        Trade instance

    Raises:
        TradeExecutionError: on business-logic failures (insufficient funds, etc.)
    """
    quantity = Decimal(str(quantity))

    if quantity <= 0:
        raise TradeExecutionError("Quantity must be greater than zero.")

    if side not in ('BUY', 'SELL'):
        raise TradeExecutionError("Side must be BUY or SELL.")

    with transaction.atomic():
        # Lock the participant row to prevent race conditions (double-clicks, etc.)
        participant = Participant.objects.select_for_update().get(id=participant_id)
        asset = Asset.objects.get(ticker=ticker.upper())
        current_price = asset.current_price

        if current_price <= 0:
            raise TradeExecutionError("Price data is currently unavailable for this asset.")

        total_value = quantity * current_price

        if side == 'BUY':
            if participant.cash_balance < total_value:
                raise TradeExecutionError(
                    f"Insufficient funds. You need ${total_value:.2f} but only have ${participant.cash_balance:.2f}."
                )

            # Deduct cash
            participant.cash_balance -= total_value
            participant.save(update_fields=['cash_balance'])

            # Update or create position with correct weighted avg price
            position, created = Position.objects.get_or_create(
                participant=participant,
                asset=asset,
                defaults={'quantity': quantity, 'avg_buy_price': current_price},
            )

            if not created:
                old_cost = position.quantity * position.avg_buy_price
                new_cost = quantity * current_price
                position.quantity += quantity
                position.avg_buy_price = (old_cost + new_cost) / position.quantity
                position.save(update_fields=['quantity', 'avg_buy_price'])

        elif side == 'SELL':
            try:
                position = Position.objects.select_for_update().get(
                    participant=participant, asset=asset
                )
            except Position.DoesNotExist:
                raise TradeExecutionError(f"You do not hold any {ticker}.")

            if position.quantity < quantity:
                raise TradeExecutionError(
                    f"Insufficient holdings. You own {position.quantity} {ticker} "
                    f"but tried to sell {quantity}."
                )

            # Credit cash
            participant.cash_balance += total_value
            participant.save(update_fields=['cash_balance'])

            # Reduce or delete position
            position.quantity -= quantity
            if position.quantity == 0:
                position.delete()
            else:
                position.save(update_fields=['quantity'])

        trade = Trade.objects.create(
            participant=participant,
            asset=asset,
            side=side,
            quantity=quantity,
            price_at_execution=current_price,
            total_value=total_value,
        )

        return trade


def recalculate_participant_equity(participant: Participant) -> None:
    """
    Recalculates and saves total_equity, holdings_value, all_time_return_pct.
    Called by the monitor and after every trade.
    """
    positions = participant.positions.select_related('asset').all()
    holdings_value = sum(
        pos.quantity * pos.asset.current_price for pos in positions
    )
    total_equity = participant.cash_balance + holdings_value

    # ROI based on total money ever put in (starting balance + all stipends)
    total_invested = participant.competition.starting_balance + participant.total_stipends_received
    if total_invested > 0:
        all_time_return_pct = ((total_equity / total_invested) - 1) * 100
    else:
        all_time_return_pct = Decimal('0.0')

    participant.holdings_value = holdings_value
    participant.total_equity = total_equity
    participant.all_time_return_pct = all_time_return_pct
    participant.save(update_fields=['holdings_value', 'total_equity', 'all_time_return_pct'])


def compute_period_returns(participant: Participant) -> None:
    """
    Uses DailySnapshot records to compute weekly / monthly / yearly returns.
    Called by the monitor after taking snapshots.
    """
    from .models import DailySnapshot
    from datetime import timedelta

    now = timezone.now()
    current_equity = participant.total_equity

    periods = {
        'weekly_return_pct': 7,
        'monthly_return_pct': 30,
        'yearly_return_pct': 365,
    }

    updates = {}
    for field, days in periods.items():
        cutoff = now - timedelta(days=days)
        snapshot = (
            participant.snapshots
            .filter(timestamp__lte=cutoff)
            .order_by('-timestamp')
            .first()
        )
        if snapshot and snapshot.equity_value > 0:
            ret = ((current_equity / snapshot.equity_value) - 1) * 100
        else:
            ret = Decimal('0.0')
        updates[field] = ret

    for field, val in updates.items():
        setattr(participant, field, val)

    participant.save(update_fields=list(updates.keys()))