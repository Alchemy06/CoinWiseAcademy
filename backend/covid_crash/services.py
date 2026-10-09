
from django.utils import timezone

TRANSFER_FEE_PENCE = 1_500
COMMISSION_PENCE = 1_195


def derive_attempt_state(attempt, current_price_pence) -> dict:
    if getattr(attempt.scenario, 'is_multi_asset', False):
        return derive_multi_asset_state(attempt, current_price_pence)

    cash = attempt.cash_pence
    starting = attempt.starting_balance_pence

    is_stock = attempt.scenario.uses_broker_mechanics
    is_ftx = attempt.scenario.uses_custody_split

    if is_stock:

        units_held = attempt.btc_in_self_custody_satoshis
        position_value = units_held * current_price_pence

        btc_ftx = 0
        btc_self = units_held
        ftx_position_value = 0
        self_position_value = position_value

    elif is_ftx:

        btc_ftx = attempt.btc_on_ftx_satoshis
        btc_self = attempt.btc_in_self_custody_satoshis
        units_held = btc_ftx + btc_self

        if attempt.ftx_bankruptcy_triggered:
            ftx_position_value = 0
        else:
            ftx_position_value = (btc_ftx * current_price_pence) // 100_000_000

        self_position_value = (btc_self * current_price_pence) // 100_000_000
        position_value = ftx_position_value + self_position_value

    else:

        units_held = attempt.btc_in_self_custody_satoshis
        btc_ftx = 0
        btc_self = units_held
        position_value = (units_held * current_price_pence) // 100_000_000
        ftx_position_value = 0
        self_position_value = position_value


    borrowed = attempt.margin_borrowed_pence if is_stock else 0

    net_equity = cash + position_value - borrowed
    total_value = net_equity
    delta = net_equity - starting
    delta_basis_pts = (delta * 10_000) // starting if starting else 0


    margin_call_imminent = False
    if borrowed > 0:
        margin_requirement = (borrowed * 125) // 100
        margin_call_imminent = position_value < margin_requirement


    log = attempt.action_log
    buys = [a for a in log if a['action'] in ('buy', 'buy_margin')]
    sells = [a for a in log if a['action'] in ('sell', 'sell_self')]

    total_bought_pence = sum(a['amount_pence'] for a in buys)
    total_bought_units = sum(a['btc_quantity_satoshis'] for a in buys)
    total_sold_units = sum(a['btc_quantity_satoshis'] for a in sells)

    if total_bought_units > 0:
        if is_stock:

            avg_entry_price = total_bought_pence // total_bought_units
            remaining_units = total_bought_units - total_sold_units
            cost_basis = remaining_units * avg_entry_price
        else:
            avg_entry_price = (total_bought_pence * 100_000_000) // total_bought_units
            remaining_units = total_bought_units - total_sold_units
            cost_basis = (remaining_units * avg_entry_price) // 100_000_000
    else:
        avg_entry_price = 0
        remaining_units = 0
        cost_basis = 0

    unrealised_pnl = position_value - cost_basis
    unrealised_pnl_basis_pts = (
        (unrealised_pnl * 10_000) // cost_basis if cost_basis > 0 else 0
    )


    position_value_is_dust = (
        units_held > 0 and current_price_pence > 0 and position_value == 0
    )

    result = {
        'starting_balance_pence': starting,
        'cash_pence': cash,

        'asset_units_held': units_held,

        'btc_held_satoshis': 0 if is_stock else units_held,

        'btc_on_ftx_satoshis': btc_ftx,
        'btc_in_self_custody_satoshis': btc_self,
        'ftx_position_value_pence': ftx_position_value,
        'self_custody_position_value_pence': self_position_value,
        'ftx_withdrawals_halted': attempt.ftx_withdrawals_halted,
        'ftx_bankruptcy_triggered': attempt.ftx_bankruptcy_triggered,

        'current_price_pence': current_price_pence,
        'position_value_pence': position_value,
        'position_value_is_dust': position_value_is_dust,
        'total_value_pence': total_value,
        'net_equity_pence': net_equity,
        'total_delta_pence': delta,
        'total_delta_basis_pts': delta_basis_pts,

        'avg_entry_price_pence': avg_entry_price,
        'cost_basis_pence': cost_basis,
        'unrealised_pnl_pence': unrealised_pnl,
        'unrealised_pnl_basis_pts': unrealised_pnl_basis_pts,
        'total_bought_pence': total_bought_pence,
        'total_bought_sats': total_bought_units,
        'total_sold_sats': total_sold_units,
        'remaining_sats': remaining_units,
    }


    if is_stock:
        result.update({
            'broker_choice': attempt.broker_choice,
            'broker_pco_active': attempt.broker_pco_active,
            'margin_borrowed_pence': borrowed,
            'margin_call_imminent': margin_call_imminent,
            'total_commissions_paid_pence': attempt.total_commissions_paid_pence,
            'margin_called_at_round': attempt.margin_called_at_round,
        })

    return result


def select_broker(attempt, broker_choice: str) -> dict:
    if not attempt.scenario.uses_broker_mechanics:
        raise ValueError("This scenario does not use broker mechanics")
    if broker_choice not in ('trading_forge', 'highford_latham'):
        raise ValueError(f"Unknown broker: {broker_choice!r}")
    if attempt.broker_choice:
        raise ValueError("Broker already selected — cannot change mid-scenario")

    attempt.broker_choice = broker_choice

    first_round_date = attempt.scenario.rounds.get(round_index=0).scenario_date
    attempt.action_log = list(attempt.action_log) + [{
        'round_index': -1,
        'scenario_date': first_round_date.isoformat(),
        'action': 'broker_select',
        'amount_pence': 0,
        'btc_quantity_satoshis': 0,
        'price_pence': 0,
        'broker': broker_choice,
        'is_synthetic': True,
        'submitted_at': timezone.now().isoformat(),
    }]
    attempt.save()

    return {'broker_choice': broker_choice}


def execute_buy(attempt, amount_pence: int, round_obj, use_margin: bool = False) -> dict:
    if amount_pence <= 0:
        raise ValueError("amount must be positive")

    scenario = attempt.scenario


    if scenario.uses_broker_mechanics:
        if not attempt.broker_choice:
            raise ValueError("Broker must be selected before trading")
        if attempt.broker_pco_active:
            raise ValueError("Trading Forge has imposed PCO — cannot open new positions")

        price = round_obj.price_pence
        if price <= 0:
            raise ValueError("round price must be positive")

        if use_margin:
            if attempt.broker_choice != 'trading_forge':
                raise ValueError("Margin is only available on Trading Forge")
            max_buying_power = attempt.cash_pence * 2
            if amount_pence > max_buying_power:
                raise ValueError(
                    f"Insufficient buying power. Max with margin: "
                    f"£{max_buying_power / 100:,.2f}"
                )
            cash_used = min(amount_pence, attempt.cash_pence)
            margin_used = amount_pence - cash_used
        else:
            if amount_pence > attempt.cash_pence:
                raise ValueError(
                    f"Insufficient cash: have £{attempt.cash_pence / 100:,.2f}, "
                    f"need £{amount_pence / 100:,.2f}"
                )
            cash_used = amount_pence
            margin_used = 0


        commission = 0
        if attempt.broker_choice == 'highford_latham':
            commission = COMMISSION_PENCE
            if cash_used + commission > attempt.cash_pence:
                raise ValueError(
                    f"Insufficient cash for buy + £{COMMISSION_PENCE / 100:.2f} commission"
                )


        shares = amount_pence // price
        if shares == 0:
            raise ValueError(
                f"Amount £{amount_pence / 100:.2f} is too small to buy any shares "
                f"at £{price / 100:.2f} per share"
            )


        attempt.cash_pence -= (cash_used + commission)
        attempt.margin_borrowed_pence += margin_used
        attempt.btc_in_self_custody_satoshis += shares

        log_entries = list(attempt.action_log)

        if commission > 0:
            attempt.total_commissions_paid_pence += commission
            log_entries.append({
                'round_index': round_obj.round_index,
                'scenario_date': round_obj.scenario_date.isoformat(),
                'action': 'commission_paid',
                'amount_pence': commission,
                'btc_quantity_satoshis': 0,
                'price_pence': price,
                'is_synthetic': True,
                'submitted_at': timezone.now().isoformat(),
            })

        action_type = 'buy_margin' if margin_used > 0 else 'buy'
        log_entries.append({
            'round_index': round_obj.round_index,
            'scenario_date': round_obj.scenario_date.isoformat(),
            'action': action_type,
            'amount_pence': amount_pence,
            'btc_quantity_satoshis': shares,
            'price_pence': price,
            'cash_used_pence': cash_used,
            'margin_used_pence': margin_used,
            'submitted_at': timezone.now().isoformat(),
        })
        attempt.action_log = log_entries
        attempt.save()

        return {
            'action': action_type,
            'amount_pence': amount_pence,
            'shares_bought': shares,
            'cash_used_pence': cash_used,
            'margin_used_pence': margin_used,
            'commission_pence': commission,
            'price_pence': price,
            'scenario_date': round_obj.scenario_date.isoformat(),
        }


    if amount_pence > attempt.cash_pence:
        raise ValueError(
            f"insufficient cash: have {attempt.cash_pence}, need {amount_pence}"
        )

    price = round_obj.price_pence
    if price <= 0:
        raise ValueError("round price must be positive")

    if scenario.uses_custody_split and attempt.ftx_withdrawals_halted:
        raise ValueError("FTX has halted withdrawals — cannot buy onto FTX")

    btc_satoshis = (amount_pence * 100_000_000) // price
    if btc_satoshis == 0:
        raise ValueError(
            f"amount {amount_pence}p is too small to buy any BTC at price {price}p"
        )

    attempt.cash_pence -= amount_pence

    if scenario.uses_custody_split:
        attempt.btc_on_ftx_satoshis += btc_satoshis
        location = 'ftx'
    else:
        attempt.btc_in_self_custody_satoshis += btc_satoshis
        location = 'self_custody'

    entry = {
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'action': 'buy',
        'amount_pence': amount_pence,
        'btc_quantity_satoshis': btc_satoshis,
        'price_pence': price,
        'location': location,
        'submitted_at': timezone.now().isoformat(),
    }
    attempt.action_log = list(attempt.action_log) + [entry]
    attempt.save()

    return {
        'action': 'buy',
        'amount_pence': amount_pence,
        'btc_quantity_satoshis': btc_satoshis,
        'price_pence': price,
        'location': location,
        'scenario_date': round_obj.scenario_date.isoformat(),
    }


def execute_sell(attempt, btc_quantity_satoshis: int, round_obj, source: str = 'auto') -> dict:
    if btc_quantity_satoshis <= 0:
        raise ValueError("quantity must be positive")

    scenario = attempt.scenario


    if scenario.uses_broker_mechanics:
        if not attempt.broker_choice:
            raise ValueError("Broker must be selected before trading")

        shares_to_sell = btc_quantity_satoshis
        if shares_to_sell > attempt.btc_in_self_custody_satoshis:
            raise ValueError(
                f"Insufficient shares: have {attempt.btc_in_self_custody_satoshis}, "
                f"trying to sell {shares_to_sell}"
            )

        price = round_obj.price_pence
        gross_proceeds = shares_to_sell * price

        commission = 0
        if attempt.broker_choice == 'highford_latham':
            commission = COMMISSION_PENCE

        net_proceeds = gross_proceeds - commission

        attempt.btc_in_self_custody_satoshis -= shares_to_sell
        attempt.cash_pence += net_proceeds

        log_entries = list(attempt.action_log)

        if commission > 0:
            attempt.total_commissions_paid_pence += commission
            log_entries.append({
                'round_index': round_obj.round_index,
                'scenario_date': round_obj.scenario_date.isoformat(),
                'action': 'commission_paid',
                'amount_pence': commission,
                'btc_quantity_satoshis': 0,
                'price_pence': price,
                'is_synthetic': True,
                'submitted_at': timezone.now().isoformat(),
            })

        log_entries.append({
            'round_index': round_obj.round_index,
            'scenario_date': round_obj.scenario_date.isoformat(),
            'action': 'sell',
            'amount_pence': net_proceeds,
            'btc_quantity_satoshis': shares_to_sell,
            'price_pence': price,
            'commission_pence': commission,
            'submitted_at': timezone.now().isoformat(),
        })
        attempt.action_log = log_entries
        attempt.save()

        return {
            'action': 'sell',
            'shares_sold': shares_to_sell,
            'proceeds_pence': net_proceeds,
            'commission_pence': commission,
            'price_pence': price,
            'scenario_date': round_obj.scenario_date.isoformat(),
        }


    if source == 'auto':
        source = 'ftx' if scenario.uses_custody_split else 'self_custody'

    if source == 'ftx':
        if not scenario.uses_custody_split:
            raise ValueError("FTX not available in this scenario")
        if attempt.ftx_withdrawals_halted or attempt.ftx_bankruptcy_triggered:
            raise ValueError("FTX is unavailable — cannot sell from FTX")
        if btc_quantity_satoshis > attempt.btc_on_ftx_satoshis:
            raise ValueError(
                f"insufficient BTC on FTX: have {attempt.btc_on_ftx_satoshis}, "
                f"trying to sell {btc_quantity_satoshis}"
            )
        action_type = 'sell'
    elif source == 'self_custody':
        if btc_quantity_satoshis > attempt.btc_in_self_custody_satoshis:
            raise ValueError(
                f"insufficient BTC in self-custody: have "
                f"{attempt.btc_in_self_custody_satoshis}, "
                f"trying to sell {btc_quantity_satoshis}"
            )
        action_type = 'sell_self' if scenario.uses_custody_split else 'sell'
    else:
        raise ValueError(f"unknown sell source: {source}")

    price = round_obj.price_pence
    proceeds_pence = (btc_quantity_satoshis * price) // 100_000_000

    if source == 'ftx':
        attempt.btc_on_ftx_satoshis -= btc_quantity_satoshis
    else:
        attempt.btc_in_self_custody_satoshis -= btc_quantity_satoshis

    attempt.cash_pence += proceeds_pence

    entry = {
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'action': action_type,
        'amount_pence': proceeds_pence,
        'btc_quantity_satoshis': btc_quantity_satoshis,
        'price_pence': price,
        'source': source,
        'submitted_at': timezone.now().isoformat(),
    }
    attempt.action_log = list(attempt.action_log) + [entry]
    attempt.save()

    return {
        'action': action_type,
        'amount_pence': proceeds_pence,
        'btc_quantity_satoshis': btc_quantity_satoshis,
        'price_pence': price,
        'source': source,
        'scenario_date': round_obj.scenario_date.isoformat(),
    }


def execute_move(attempt, btc_quantity_satoshis: int, direction: str, round_obj) -> dict:
    if not attempt.scenario.uses_custody_split:
        raise ValueError("Custody moves are not available in this scenario")
    if attempt.ftx_withdrawals_halted or attempt.ftx_bankruptcy_triggered:
        raise ValueError("FTX is unavailable — custody moves are no longer possible")
    if btc_quantity_satoshis <= 0:
        raise ValueError("BTC quantity must be positive")
    if attempt.cash_pence < TRANSFER_FEE_PENCE:
        raise ValueError(
            f"insufficient cash for transfer fee: "
            f"need £{TRANSFER_FEE_PENCE/100:.2f}, have £{attempt.cash_pence/100:.2f}"
        )

    if direction == 'to_self_custody':
        if btc_quantity_satoshis > attempt.btc_on_ftx_satoshis:
            raise ValueError(
                f"insufficient BTC on FTX: have {attempt.btc_on_ftx_satoshis}"
            )
        attempt.btc_on_ftx_satoshis -= btc_quantity_satoshis
        attempt.btc_in_self_custody_satoshis += btc_quantity_satoshis
        action = 'move_to_cold'
    elif direction == 'to_ftx':
        if btc_quantity_satoshis > attempt.btc_in_self_custody_satoshis:
            raise ValueError(
                f"insufficient BTC in self-custody: have {attempt.btc_in_self_custody_satoshis}"
            )
        attempt.btc_in_self_custody_satoshis -= btc_quantity_satoshis
        attempt.btc_on_ftx_satoshis += btc_quantity_satoshis
        action = 'move_to_ftx'
    else:
        raise ValueError(f"unknown direction: {direction!r}")

    attempt.cash_pence -= TRANSFER_FEE_PENCE

    entry = {
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'action': action,
        'amount_pence': TRANSFER_FEE_PENCE,
        'btc_quantity_satoshis': btc_quantity_satoshis,
        'price_pence': round_obj.price_pence,
        'submitted_at': timezone.now().isoformat(),
    }
    attempt.action_log = list(attempt.action_log) + [entry]
    attempt.save()

    return {
        'action': action,
        'btc_moved_satoshis': btc_quantity_satoshis,
        'fee_pence': TRANSFER_FEE_PENCE,
        'direction': direction,
    }


def compute_ftx_yield(attempt, current_round, next_round) -> int | None:
    if not attempt.scenario.uses_custody_split:
        return None
    if attempt.btc_on_ftx_satoshis == 0:
        return None
    if attempt.ftx_withdrawals_halted or attempt.ftx_bankruptcy_triggered:
        return None

    days = (next_round.scenario_date - current_round.scenario_date).days
    if days <= 0:
        return None

    yield_satoshis = int(attempt.btc_on_ftx_satoshis * 0.07 * days / 365)
    if yield_satoshis == 0:
        return None

    attempt.btc_on_ftx_satoshis += yield_satoshis

    attempt.action_log = list(attempt.action_log) + [{
        'round_index': current_round.round_index,
        'scenario_date': current_round.scenario_date.isoformat(),
        'action': 'ftx_yield',
        'amount_pence': 0,
        'btc_quantity_satoshis': yield_satoshis,
        'price_pence': current_round.price_pence,
        'is_synthetic': True,
        'submitted_at': timezone.now().isoformat(),
    }]
    attempt.save()
    return yield_satoshis


def trigger_ftx_withdrawal_halt(attempt, round_obj) -> None:
    attempt.ftx_withdrawals_halted = True
    attempt.save()


def trigger_ftx_bankruptcy(attempt, round_obj) -> int:
    btc_being_lost = attempt.btc_on_ftx_satoshis

    if btc_being_lost > 0:
        attempt.action_log = list(attempt.action_log) + [{
            'round_index': round_obj.round_index,
            'scenario_date': round_obj.scenario_date.isoformat(),
            'action': 'ftx_loss',
            'amount_pence': 0,
            'btc_quantity_satoshis': -btc_being_lost,
            'price_pence': round_obj.price_pence,
            'is_synthetic': True,
            'note': 'FTX bankruptcy — assets locked and presumed lost',
            'submitted_at': timezone.now().isoformat(),
        }]
        attempt.btc_on_ftx_satoshis = 0

    attempt.ftx_bankruptcy_triggered = True
    attempt.save()
    return btc_being_lost


def compute_margin_interest(attempt, current_round, next_round) -> int:
    if not attempt.scenario.uses_broker_mechanics:
        return 0
    if attempt.broker_choice != 'trading_forge':
        return 0
    if attempt.margin_borrowed_pence == 0:
        return 0

    days = (next_round.scenario_date - current_round.scenario_date).days
    if days <= 0:
        return 0

    interest_pence = int(attempt.margin_borrowed_pence * 0.07 * days / 365)
    if interest_pence == 0:
        return 0

    if attempt.cash_pence >= interest_pence:
        attempt.cash_pence -= interest_pence
    else:

        shortfall = interest_pence - attempt.cash_pence
        attempt.margin_borrowed_pence += shortfall
        attempt.cash_pence = 0

    attempt.action_log = list(attempt.action_log) + [{
        'round_index': current_round.round_index,
        'scenario_date': current_round.scenario_date.isoformat(),
        'action': 'margin_interest',
        'amount_pence': interest_pence,
        'btc_quantity_satoshis': 0,
        'price_pence': current_round.price_pence,
        'is_synthetic': True,
        'submitted_at': timezone.now().isoformat(),
    }]
    attempt.save()
    return interest_pence


def trigger_pco(attempt, round_obj) -> None:
    if attempt.broker_choice != 'trading_forge':
        return
    if attempt.broker_pco_active:
        return

    attempt.broker_pco_active = True
    attempt.action_log = list(attempt.action_log) + [{
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'action': 'pco_imposed',
        'amount_pence': 0,
        'btc_quantity_satoshis': 0,
        'price_pence': round_obj.price_pence,
        'is_synthetic': True,
        'submitted_at': timezone.now().isoformat(),
    }]
    attempt.save()


def check_and_execute_margin_call(attempt, round_obj) -> dict | None:
    if not attempt.scenario.uses_broker_mechanics:
        return None
    if attempt.broker_choice != 'trading_forge':
        return None
    if attempt.margin_borrowed_pence == 0:
        return None
    if attempt.margin_called_at_round is not None:
        return None

    shares = attempt.btc_in_self_custody_satoshis
    if shares == 0:
        return None

    price = round_obj.price_pence
    position_value = shares * price
    margin_requirement = (attempt.margin_borrowed_pence * 125) // 100

    if position_value >= margin_requirement:
        return None


    proceeds = shares * price
    margin_to_repay = min(proceeds, attempt.margin_borrowed_pence)
    leftover = max(0, proceeds - margin_to_repay)

    attempt.btc_in_self_custody_satoshis = 0
    attempt.margin_borrowed_pence -= margin_to_repay
    attempt.cash_pence += leftover
    attempt.margin_called_at_round = round_obj.round_index

    attempt.action_log = list(attempt.action_log) + [{
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'action': 'margin_call_liquidation',
        'amount_pence': proceeds,
        'btc_quantity_satoshis': -shares,
        'price_pence': price,
        'shares_liquidated': shares,
        'margin_repaid_pence': margin_to_repay,
        'leftover_pence': leftover,
        'is_synthetic': True,
        'submitted_at': timezone.now().isoformat(),
    }]
    attempt.save()

    return {
        'shares_liquidated': shares,
        'liquidation_price_pence': price,
        'proceeds_pence': proceeds,
        'margin_repaid_pence': margin_to_repay,
        'leftover_pence': leftover,
    }


def detect_behaviour_pattern(attempt) -> str:
    order = attempt.scenario.order
    if order == 1:
        return _detect_covid_pattern(attempt)
    if order == 2:
        return _detect_luna_pattern(attempt)
    if order == 3:
        return _detect_ftx_pattern(attempt)
    if order == 4:
        return _detect_gamestop_pattern(attempt)
    if order == 5:
        return _detect_gfc_pattern(attempt)
    return _detect_covid_pattern(attempt)


def _detect_covid_pattern(attempt) -> str:
    log = attempt.action_log
    buys = [a for a in log if a['action'] == 'buy']
    sells = [a for a in log if a['action'] == 'sell']

    total_bought = sum(a['amount_pence'] for a in buys)
    if total_bought < attempt.starting_balance_pence * 0.10:
        return 'missed_it'

    bought_in_round_0 = any(a['round_index'] == 0 for a in buys)
    sold_in_round_1 = any(a['round_index'] == 1 for a in sells)
    if bought_in_round_0 and sold_in_round_1:
        sell_in_r1 = next(a for a in sells if a['round_index'] == 1)
        buys_before_sell = [
            b for b in buys if b['submitted_at'] < sell_in_r1['submitted_at']
        ]
        if buys_before_sell:
            total_sats = sum(b['btc_quantity_satoshis'] for b in buys_before_sell)
            total_spent = sum(b['amount_pence'] for b in buys_before_sell)
            avg_buy_price = (total_spent * 100_000_000) // total_sats if total_sats else 0
            if sell_in_r1['price_pence'] < avg_buy_price:
                return 'panic_seller'

    bought_in_round_1 = sum(a['amount_pence'] for a in buys if a['round_index'] == 1)
    if bought_in_round_1 >= attempt.starting_balance_pence * 0.30:
        return 'dip_buyer'

    rounds_with_action = set(
        a['round_index'] for a in log if a.get('action') in ('buy', 'sell')
    )
    if len(rounds_with_action) >= 4:
        return 'active_trader'

    return 'disciplined_holder'


def _detect_luna_pattern(attempt) -> str:
    log = attempt.action_log
    buys = [a for a in log if a['action'] == 'buy']
    sells = [a for a in log if a['action'] == 'sell']
    starting = attempt.starting_balance_pence

    total_bought = sum(a['amount_pence'] for a in buys)

    if total_bought < starting * 0.10:
        return 'stayed_out'

    bought_before_depeg = any(a['round_index'] < 2 for a in buys)
    sold_at_depeg = any(a['round_index'] == 2 for a in sells)
    if bought_before_depeg and sold_at_depeg:
        sats_bought_before_depeg = sum(
            a['btc_quantity_satoshis'] for a in buys if a['round_index'] < 2
        ) - sum(
            a['btc_quantity_satoshis'] for a in sells if a['round_index'] < 2
        )
        sats_sold_at_depeg = sum(
            a['btc_quantity_satoshis'] for a in sells if a['round_index'] == 2
        )
        if sats_bought_before_depeg > 0 and sats_sold_at_depeg >= sats_bought_before_depeg * 0.5:
            return 'signal_reader'

    bought_during_collapse = sum(
        a['amount_pence'] for a in buys if a['round_index'] >= 2
    )
    if bought_during_collapse >= starting * 0.30:
        return 'buy_the_dip_into_zero'

    sold_late = any(a['round_index'] >= 3 for a in sells)
    if sold_late:
        return 'partial_exit'

    return 'bought_at_peak_held'


def _detect_ftx_pattern(attempt) -> str:
    log = attempt.action_log
    starting = attempt.starting_balance_pence

    buys = [a for a in log if a['action'] == 'buy']
    sells_all = [a for a in log if a['action'] in ('sell', 'sell_self')]
    moves_to_cold = [a for a in log if a['action'] == 'move_to_cold']
    ftx_loss = [a for a in log if a['action'] == 'ftx_loss']

    total_bought_pence = sum(a['amount_pence'] for a in buys)
    total_bought_sats = sum(a['btc_quantity_satoshis'] for a in buys)
    btc_lost_sats = sum(abs(a['btc_quantity_satoshis']) for a in ftx_loss)
    total_moved_cold_sats = sum(a['btc_quantity_satoshis'] for a in moves_to_cold)

    if total_bought_pence < starting * 0.10:
        return 'stayed_out'

    sold_before_bankruptcy_sats = sum(
        a['btc_quantity_satoshis'] for a in sells_all if a['round_index'] < 4
    )
    if total_bought_sats > 0 and sold_before_bankruptcy_sats >= total_bought_sats * 0.75:
        return 'actively_traded'

    if total_bought_sats > 0 and btc_lost_sats >= total_bought_sats * 0.75:
        return 'full_loss'

    moved_at_signal_sats = sum(
        m['btc_quantity_satoshis'] for m in moves_to_cold if m['round_index'] == 2
    )
    if total_bought_sats > 0 and moved_at_signal_sats >= total_bought_sats * 0.75:
        return 'signal_reader'

    if total_bought_sats > 0 and btc_lost_sats < total_bought_sats * 0.10:
        return 'pure_self_custody'

    if btc_lost_sats > 0 and total_moved_cold_sats > 0:
        return 'partial_protection'

    return 'full_loss'


def _detect_gamestop_pattern(attempt) -> str:
    log = attempt.action_log
    starting = attempt.starting_balance_pence

    buys = [a for a in log if a['action'] in ('buy', 'buy_margin')]
    sells = [a for a in log if a['action'] == 'sell']
    margin_calls = [a for a in log if a['action'] == 'margin_call_liquidation']

    total_bought = sum(a['amount_pence'] for a in buys)


    if total_bought < starting * 0.10:
        return 'stayed_out'


    if margin_calls:
        return 'margin_call_wipeout'


    if attempt.broker_choice == 'trading_forge' and attempt.broker_pco_active:
        sold_during_pco = any(a['round_index'] == 3 for a in sells)
        if sold_during_pco:
            return 'caught_by_pco_sold'

        has_position_at_pco = (
            attempt.btc_in_self_custody_satoshis > 0
            or any(a['round_index'] >= 3 for a in sells)
        )
        if has_position_at_pco:
            return 'caught_by_pco_held'


    bought_round_0 = any(a['round_index'] == 0 for a in buys)
    sold_at_peak_pence = sum(a['amount_pence'] for a in sells if a['round_index'] in (1, 2))
    if bought_round_0 and sold_at_peak_pence > total_bought * 1.5:
        return 'sold_at_peak'


    if bought_round_0 and len(sells) == 0:
        return 'diamond_hands_held_to_zero'


    sold_early_pence = sum(a['amount_pence'] for a in sells if a['round_index'] <= 1)
    if sold_early_pence > total_bought * 0.75:
        return 'took_profits_early'


    bought_at_peak_pence = sum(a['amount_pence'] for a in buys if a['round_index'] in (1, 2))
    if bought_at_peak_pence >= total_bought * 0.5:
        return 'fomo_buyer'


    return 'fomo_buyer'


def render_lesson_narrative(narrative, attempt, final_state: dict) -> dict:
    order = attempt.scenario.order
    if order == 2:
        placeholders = _build_luna_placeholders(attempt, final_state)
    elif order == 3:
        placeholders = _build_ftx_placeholders(attempt, final_state)
    elif order == 4:
        placeholders = _build_gamestop_placeholders(attempt, final_state)
    elif order == 5:
        placeholders = _build_gfc_placeholders(attempt, final_state)
    else:
        placeholders = _build_covid_placeholders(attempt, final_state)

    try:
        body = narrative.body_template.format(**placeholders)
    except KeyError:
        body = narrative.body_template

    return {
        'pattern_key': narrative.pattern_key,
        'headline': narrative.headline,
        'body': body,
        'takeaway': narrative.takeaway,
    }


def _fmt(p: int) -> str:
    return f"£{p / 100:,.2f}"


def _build_covid_placeholders(attempt, final_state: dict) -> dict:
    log = attempt.action_log
    buys = [a for a in log if a['action'] == 'buy']
    sells = [a for a in log if a['action'] == 'sell']

    def total_bought_in_round(idx: int) -> int:
        return sum(a['amount_pence'] for a in buys if a['round_index'] == idx)

    def total_sold_in_round_pence(idx: int) -> int:
        return sum(a['amount_pence'] for a in sells if a['round_index'] == idx)

    rounds_with_action = set(a['round_index'] for a in log)
    delta = final_state['total_delta_pence']
    delta_pct = final_state['total_delta_basis_pts'] / 100

    realised_loss = _compute_realised_loss(attempt, round_index=1)
    would_have_been = _compute_would_have_been(attempt, round_index=1)

    return {
        'final_value': _fmt(final_state['total_value_pence']),
        'starting_balance': _fmt(final_state['starting_balance_pence']),
        'total_bought': _fmt(final_state['total_bought_pence']),
        'total_bought_round_1': _fmt(total_bought_in_round(0)),
        'total_bought_round_2': _fmt(total_bought_in_round(1)),
        'total_sold_round_2': _fmt(total_sold_in_round_pence(1)),
        'realised_loss_round_2': _fmt(abs(realised_loss)),
        'would_have_been_value': _fmt(would_have_been),
        'delta_pence': _fmt(abs(delta)),
        'delta_pence_signed': ('+' if delta >= 0 else '-') + _fmt(abs(delta)),
        'delta_pct': f"{abs(delta_pct):.1f}",
        'delta_pct_signed': f"{'+' if delta >= 0 else '-'}{abs(delta_pct):.1f}",
        'rounds_with_action_count': len(rounds_with_action),
    }


def _build_luna_placeholders(attempt, final_state: dict) -> dict:
    log = attempt.action_log
    buys = [a for a in log if a['action'] == 'buy']
    sells = [a for a in log if a['action'] == 'sell']

    total_bought = sum(a['amount_pence'] for a in buys)
    total_bought_sats = sum(a['btc_quantity_satoshis'] for a in buys)
    total_sold = sum(a['amount_pence'] for a in sells)

    avg_entry_pence = (
        (total_bought * 100_000_000) // total_bought_sats
        if total_bought_sats > 0 else 0
    )

    sold_at_signal = [a for a in sells if a['round_index'] == 2]
    sold_at_signal_pence = sum(a['amount_pence'] for a in sold_at_signal)
    sold_at_signal_sats = sum(a['btc_quantity_satoshis'] for a in sold_at_signal)
    avg_exit_pence = (
        (sold_at_signal_pence * 100_000_000) // sold_at_signal_sats
        if sold_at_signal_sats > 0 else 0
    )

    collapse_buys = [a for a in buys if a['round_index'] >= 2]
    total_bought_during_collapse = sum(a['amount_pence'] for a in collapse_buys)
    collapse_sats = sum(a['btc_quantity_satoshis'] for a in collapse_buys)
    avg_collapse_entry_pence = (
        (total_bought_during_collapse * 100_000_000) // collapse_sats
        if collapse_sats > 0 else 0
    )

    if total_bought_sats > 0 and sold_at_signal_sats > 0:
        cost_of_sold = (sold_at_signal_sats * avg_entry_pence) // 100_000_000
        realised_loss = cost_of_sold - sold_at_signal_pence
    else:
        realised_loss = 0

    try:
        end_price = attempt.scenario.finale.end_price_pence
    except Exception:
        end_price = 0
    would_have_been = (sold_at_signal_sats * end_price) // 100_000_000
    would_have_lost_holding = sold_at_signal_pence - would_have_been

    delta = final_state['total_delta_pence']
    delta_pct = final_state['total_delta_basis_pts'] / 100

    final_val_pence = final_state['total_value_pence']
    if final_val_pence == 0 and final_state.get('position_value_is_dust'):
        final_val_str = "<£0.01"
    else:
        final_val_str = _fmt(final_val_pence)

    return {
        'final_value': final_val_str,
        'starting_balance': _fmt(final_state['starting_balance_pence']),
        'total_bought': _fmt(total_bought),
        'total_sold': _fmt(total_sold),
        'total_sold_at_signal': _fmt(sold_at_signal_pence),
        'total_bought_during_collapse': _fmt(total_bought_during_collapse),
        'avg_entry_price': _fmt(avg_entry_pence),
        'avg_exit_price': _fmt(avg_exit_pence),
        'avg_collapse_entry': _fmt(avg_collapse_entry_pence),
        'realised_loss': _fmt(abs(realised_loss)),
        'would_have_lost_holding': _fmt(abs(would_have_lost_holding)),
        'delta_pence': _fmt(abs(delta)),
        'delta_pct': f"{abs(delta_pct):.1f}",
    }


def _build_ftx_placeholders(attempt, final_state: dict) -> dict:
    log = attempt.action_log
    buys = [a for a in log if a['action'] == 'buy']
    sells_all = [a for a in log if a['action'] in ('sell', 'sell_self')]
    moves_to_cold = [a for a in log if a['action'] == 'move_to_cold']
    moves_to_ftx = [a for a in log if a['action'] == 'move_to_ftx']
    ftx_loss = [a for a in log if a['action'] == 'ftx_loss']

    total_bought_pence = sum(a['amount_pence'] for a in buys)
    total_bought_sats = sum(a['btc_quantity_satoshis'] for a in buys)
    total_sold_pence = sum(a['amount_pence'] for a in sells_all)

    total_moved_cold_sats = sum(a['btc_quantity_satoshis'] for a in moves_to_cold)
    avg_buy_price = (
        (total_bought_pence * 100_000_000) // total_bought_sats
        if total_bought_sats > 0 else 0
    )
    total_moved_cold_pence = (total_moved_cold_sats * avg_buy_price) // 100_000_000

    total_moves = len(moves_to_cold) + len(moves_to_ftx)
    transfer_fees_pence = total_moves * TRANSFER_FEE_PENCE

    btc_lost_sats = sum(abs(a['btc_quantity_satoshis']) for a in ftx_loss)
    bankruptcy_price = 1_483_000
    ftx_loss_pence = (btc_lost_sats * bankruptcy_price) // 100_000_000
    btc_left_on_ftx_pence = ftx_loss_pence

    total_sold_sats = sum(a['btc_quantity_satoshis'] for a in sells_all)
    avg_exit_pence = (
        (total_sold_pence * 100_000_000) // total_sold_sats
        if total_sold_sats > 0 else 0
    )

    delta = final_state['total_delta_pence']
    delta_pct = final_state['total_delta_basis_pts'] / 100

    return {
        'final_value': _fmt(final_state['total_value_pence']),
        'starting_balance': _fmt(final_state['starting_balance_pence']),
        'total_bought': _fmt(total_bought_pence),
        'total_sold': _fmt(total_sold_pence),
        'total_moved_to_self': _fmt(total_moved_cold_pence),
        'btc_lost_on_ftx': f"{btc_lost_sats / 100_000_000:.6f} BTC",
        'btc_left_on_ftx_at_bankruptcy': _fmt(btc_left_on_ftx_pence),
        'ftx_loss_gbp': _fmt(ftx_loss_pence),
        'transfer_fees_paid': _fmt(transfer_fees_pence),
        'avg_exit_price': _fmt(avg_exit_pence),
        'delta_pence': _fmt(abs(delta)),
        'delta_pct': f"{abs(delta_pct):.1f}",
        'delta_pct_signed': f"{'+' if delta >= 0 else '-'}{abs(delta_pct):.1f}",
    }


def _build_gamestop_placeholders(attempt, final_state: dict) -> dict:
    log = attempt.action_log
    buys = [a for a in log if a['action'] in ('buy', 'buy_margin')]
    sells = [a for a in log if a['action'] == 'sell']
    margin_calls = [a for a in log if a['action'] == 'margin_call_liquidation']

    total_bought = sum(a['amount_pence'] for a in buys)
    total_bought_shares = sum(a['btc_quantity_satoshis'] for a in buys)
    avg_entry_pence = total_bought // total_bought_shares if total_bought_shares > 0 else 0

    total_sold = sum(a['amount_pence'] for a in sells)
    total_sold_shares = sum(a['btc_quantity_satoshis'] for a in sells)
    avg_exit_pence = total_sold // total_sold_shares if total_sold_shares > 0 else 0


    sold_at_peak_pence = sum(a['amount_pence'] for a in sells if a['round_index'] in (1, 2))
    sold_at_peak_shares = sum(a['btc_quantity_satoshis'] for a in sells if a['round_index'] in (1, 2))
    avg_peak_exit = sold_at_peak_pence // sold_at_peak_shares if sold_at_peak_shares > 0 else 0


    bought_at_peak_pence = sum(a['amount_pence'] for a in buys if a['round_index'] in (1, 2))
    bought_at_peak_shares = sum(a['btc_quantity_satoshis'] for a in buys if a['round_index'] in (1, 2))
    avg_peak_entry = bought_at_peak_pence // bought_at_peak_shares if bought_at_peak_shares > 0 else 0


    sold_early_pence = sum(a['amount_pence'] for a in sells if a['round_index'] <= 1)
    sold_early_shares = sum(a['btc_quantity_satoshis'] for a in sells if a['round_index'] <= 1)
    avg_early_exit = sold_early_pence // sold_early_shares if sold_early_shares > 0 else 0


    sold_round_3_pence = sum(a['amount_pence'] for a in sells if a['round_index'] == 3)
    sold_round_3_shares = sum(a['btc_quantity_satoshis'] for a in sells if a['round_index'] == 3)
    avg_round_3_exit = sold_round_3_pence // sold_round_3_shares if sold_round_3_shares > 0 else 0


    if margin_calls:
        mc = margin_calls[0]
        liquidation_price = mc['price_pence']
        shares_liquidated = mc.get('shares_liquidated', abs(mc.get('btc_quantity_satoshis', 0)))
        margin_repaid = mc.get('margin_repaid_pence', 0)
    else:
        liquidation_price = 0
        shares_liquidated = 0
        margin_repaid = 0

    total_margin_used = sum(a.get('margin_used_pence', 0) for a in buys)
    own_capital_used = total_bought - total_margin_used

    delta = final_state['total_delta_pence']
    delta_pct = final_state['total_delta_basis_pts'] / 100
    end_price_pence = 2_897

    return {
        'final_value': _fmt(final_state['total_value_pence']),
        'starting_balance': _fmt(final_state['starting_balance_pence']),
        'total_bought': _fmt(total_bought),
        'total_sold': _fmt(total_sold),
        'total_sold_at_peak': _fmt(sold_at_peak_pence),
        'total_sold_early': _fmt(sold_early_pence),
        'total_sold_round_3': _fmt(sold_round_3_pence),
        'total_bought_at_peak': _fmt(bought_at_peak_pence),
        'avg_entry_price': _fmt(avg_entry_pence),
        'avg_exit_price': _fmt(avg_exit_pence),
        'avg_peak_exit_price': _fmt(avg_peak_exit),
        'avg_early_exit_price': _fmt(avg_early_exit),
        'avg_round_3_exit_price': _fmt(avg_round_3_exit),
        'shares_bought': str(total_bought_shares),
        'final_shares': str(final_state.get('asset_units_held', 0)),
        'final_position_value': _fmt(final_state['position_value_pence']),
        'liquidation_price': _fmt(liquidation_price),
        'margin_amount': _fmt(total_margin_used),
        'own_capital': _fmt(own_capital_used),
        'end_price': _fmt(end_price_pence),
        'delta_pence': _fmt(abs(delta)),
        'delta_pct_signed': f"{'+' if delta >= 0 else '-'}{abs(delta_pct):.1f}",
    }


def compute_reference_outcomes(scenario, end_price_pence: int) -> dict:
    if scenario.order == 2:
        return _compute_luna_reference_outcomes(scenario, end_price_pence)
    if scenario.order == 3:
        return _compute_ftx_reference_outcomes(scenario, end_price_pence)
    if scenario.order == 4:
        return _compute_gamestop_reference_outcomes(scenario, end_price_pence)
    if scenario.order == 5:
        return _compute_gfc_reference_outcomes(scenario, end_price_pence)
    return _compute_covid_reference_outcomes(scenario, end_price_pence)


def _compute_covid_reference_outcomes(scenario, end_price_pence: int) -> dict:
    starting = scenario.starting_balance_pence
    round_0 = scenario.rounds.get(round_index=0)
    round_1 = scenario.rounds.get(round_index=1)

    btc_at_r0 = (starting * 100_000_000) // round_0.price_pence
    bought_round_1_value = (btc_at_r0 * end_price_pence) // 100_000_000

    btc_at_r1 = (starting * 100_000_000) // round_1.price_pence
    bought_round_2_value = (btc_at_r1 * end_price_pence) // 100_000_000

    return {
        'all_cash_pence': starting,
        'bought_round_1_pence': bought_round_1_value,
        'bought_round_2_pence': bought_round_2_value,
    }


def _compute_luna_reference_outcomes(scenario, end_price_pence: int) -> dict:
    starting = scenario.starting_balance_pence
    round_0 = scenario.rounds.get(round_index=0)
    round_2 = scenario.rounds.get(round_index=2)

    luna_at_r0_sats = (starting * 100_000_000) // round_0.price_pence
    held_to_end_pence = (luna_at_r0_sats * end_price_pence) // 100_000_000
    sold_at_signal_pence = (luna_at_r0_sats * round_2.price_pence) // 100_000_000

    return {
        'all_cash_pence': starting,
        'held_to_end_pence': held_to_end_pence,
        'sold_at_signal_pence': sold_at_signal_pence,
    }


def _compute_ftx_reference_outcomes(scenario, end_price_pence: int) -> dict:
    starting = scenario.starting_balance_pence
    round_0 = scenario.rounds.get(round_index=0)

    btc_at_r0_sats = (starting * 100_000_000) // round_0.price_pence

    self_custody_held_pence = (btc_at_r0_sats * end_price_pence) // 100_000_000
    ftx_never_moved_pence = 0
    moved_at_signal_pence = max(0, (btc_at_r0_sats * end_price_pence) // 100_000_000 - TRANSFER_FEE_PENCE)

    return {
        'all_cash_pence': starting,
        'self_custody_held_pence': self_custody_held_pence,
        'ftx_never_moved_pence': ftx_never_moved_pence,
        'moved_at_signal_pence': moved_at_signal_pence,
    }


def _compute_gamestop_reference_outcomes(scenario, end_price_pence: int) -> dict:
    starting = scenario.starting_balance_pence
    round_0 = scenario.rounds.get(round_index=0)
    round_2 = scenario.rounds.get(round_index=2)

    shares_at_r0 = starting // round_0.price_pence
    bought_r0_held_pence = shares_at_r0 * end_price_pence
    bought_r0_sold_peak_pence = shares_at_r0 * round_2.price_pence

    shares_at_peak = starting // round_2.price_pence
    bought_peak_held_pence = shares_at_peak * end_price_pence

    return {
        'all_cash_pence': starting,
        'bought_r0_held_pence': bought_r0_held_pence,
        'bought_r0_sold_peak_pence': bought_r0_sold_peak_pence,
        'bought_peak_held_pence': bought_peak_held_pence,
        'margin_call_pence': 0,
    }


def _compute_realised_loss(attempt, round_index: int) -> int:
    log = attempt.action_log
    sells_in_round = [a for a in log if a['action'] == 'sell' and a['round_index'] == round_index]
    if not sells_in_round:
        return 0

    total_loss = 0
    for sell in sells_in_round:
        prior_buys = [
            b for b in log
            if b['action'] == 'buy' and b['submitted_at'] < sell['submitted_at']
        ]
        if not prior_buys:
            continue
        total_sats = sum(b['btc_quantity_satoshis'] for b in prior_buys)
        total_spent = sum(b['amount_pence'] for b in prior_buys)
        avg_price = (total_spent * 100_000_000) // total_sats if total_sats else sell['price_pence']
        cost_of_sats_sold = (sell['btc_quantity_satoshis'] * avg_price) // 100_000_000
        total_loss += sell['amount_pence'] - cost_of_sats_sold

    return total_loss


def _compute_would_have_been(attempt, round_index: int) -> int:
    from .models import ScenarioFinale
    log = attempt.action_log
    sells_in_round = [a for a in log if a['action'] == 'sell' and a['round_index'] == round_index]
    if not sells_in_round:
        return 0

    try:
        finale = ScenarioFinale.objects.get(scenario=attempt.scenario)
        end_price = finale.end_price_pence
    except ScenarioFinale.DoesNotExist:
        return 0

    total_sats_sold = sum(a['btc_quantity_satoshis'] for a in sells_in_round)
    return (total_sats_sold * end_price) // 100_000_000


import random
from datetime import timedelta as _timedelta


def generate_multi_asset_candles(start_date, end_date, start_prices, end_prices, rng_seed=42):
    days = (end_date - start_date).days
    if days <= 0:
        return []
    rng = random.Random(rng_seed)
    candles = []
    current_date = start_date
    current_prices = {k: v for k, v in start_prices.items()}
    noise_map = {'FTSE': 0.012, 'RBS': 0.04, 'BP': 0.015, 'GOLD': 0.008, 'GILT': 0.002}
    for day_index in range(days):
        progress = (day_index + 1) / days
        entry = {'date': current_date.isoformat()}
        for asset, start_p in start_prices.items():
            end_p = end_prices[asset]
            target = int(start_p + (end_p - start_p) * progress)
            noise_pct = noise_map.get(asset, 0.012)
            noise = rng.gauss(0, noise_pct)
            if day_index < days - 1:
                close = max(1, int(target * (1 + noise)))
            else:
                close = end_p
            open_p = current_prices[asset]
            high = max(open_p, close) + abs(int(open_p * rng.uniform(0, 0.004)))
            low = max(1, min(open_p, close) - abs(int(open_p * rng.uniform(0, 0.004))))
            entry[asset] = {'o': open_p, 'h': high, 'l': low, 'c': close}
            current_prices[asset] = close
        candles.append(entry)
        current_date += _timedelta(days=1)
    return candles


def generate_intraday_ticks(prev_prices, current_round_prices, rng_seed=42, num_ticks=45):
    rng = random.Random(rng_seed)
    volatility_map = {'FTSE': 0.004, 'RBS': 0.025, 'BP': 0.006, 'GOLD': 0.003, 'GILT': 0.001}
    ticks = []
    current_prices = {k: v for k, v in prev_prices.items()}
    for i in range(num_ticks):
        offset_seconds = i * 2
        progress = (i + 1) / num_ticks
        tick_entry = {'offset_seconds': offset_seconds}
        for asset, start_p in prev_prices.items():
            end_p = current_round_prices[asset]
            target = int(start_p + (end_p - start_p) * progress)
            vol = volatility_map.get(asset, 0.004)
            noise = rng.gauss(0, vol)
            if i < num_ticks - 1:
                price = max(1, int(target * (1 + noise)))
            else:
                price = end_p
            tick_entry[asset] = price
            current_prices[asset] = price
        ticks.append(tick_entry)
    return ticks


def get_price_at_offset(round_obj, asset, offset_seconds):
    if not round_obj.intraday_ticks:
        return round_obj.asset_closing_prices.get(asset, 0)
    matching = [t for t in round_obj.intraday_ticks if t['offset_seconds'] <= offset_seconds]
    if not matching:
        return round_obj.intraday_ticks[0].get(asset, 0)
    closest = max(matching, key=lambda t: t['offset_seconds'])
    return closest.get(asset, 0)


def derive_multi_asset_state(attempt, current_prices: dict) -> dict:
    cash = attempt.cash_pence
    starting = attempt.starting_balance_pence
    holdings = attempt.asset_holdings or {}
    available_assets = attempt.scenario.available_assets or ['FTSE', 'RBS', 'BP', 'GOLD', 'GILT']

    asset_states = {}
    total_position_value = 0

    for asset in available_assets:
        units = holdings.get(asset, 0)
        price = current_prices.get(asset, 0)
        position_value = units * price
        total_position_value += position_value

        buys = [a for a in attempt.action_log if a.get('action') == 'buy' and a.get('asset') == asset]
        sells = [a for a in attempt.action_log if a.get('action') == 'sell' and a.get('asset') == asset]
        total_bought_pence = sum(a.get('amount_pence', 0) for a in buys)
        total_bought_units = sum(a.get('units_acquired', 0) for a in buys)
        avg_entry = (total_bought_pence // total_bought_units) if total_bought_units > 0 else 0
        cost_basis = units * avg_entry if avg_entry > 0 else 0
        unrealised_pnl = position_value - cost_basis

        asset_states[asset] = {
            'units_held': units,
            'current_price_pence': price,
            'position_value_pence': position_value,
            'avg_entry_price_pence': avg_entry,
            'cost_basis_pence': cost_basis,
            'unrealised_pnl_pence': unrealised_pnl,
        }

    total_value = cash + total_position_value
    delta = total_value - starting
    delta_basis_pts = (delta * 10000) // starting if starting else 0


    if total_value > 0:
        largest = max((s['position_value_pence'] for s in asset_states.values()), default=0)
        concentration_pct = (largest * 100) // total_value
    else:
        concentration_pct = 0


    equity_value = sum(asset_states[a]['position_value_pence'] for a in ('FTSE', 'RBS', 'BP') if a in asset_states)
    if total_value > 0:
        equity_pct = (equity_value * 100) // total_value
        risk_category = 'HIGH' if equity_pct >= 75 else ('MODERATE' if equity_pct >= 40 else 'LOW')
    else:
        risk_category = 'LOW'

    return {
        'starting_balance_pence': starting,
        'cash_pence': cash,
        'total_position_value_pence': total_position_value,
        'total_value_pence': total_value,
        'total_delta_pence': delta,
        'total_delta_basis_pts': delta_basis_pts,
        'asset_states': asset_states,
        'concentration_pct': concentration_pct,
        'risk_category': risk_category,
    }


def execute_buy_multi(attempt, asset: str, amount_pence: int, round_obj, intraday_offset: int = None) -> dict:
    if asset not in attempt.scenario.available_assets:
        raise ValueError(f"Asset {asset} not available in this scenario")
    if amount_pence <= 0:
        raise ValueError("Amount must be positive")
    if amount_pence > attempt.cash_pence:
        raise ValueError("Insufficient cash")

    if intraday_offset is not None and round_obj.intraday_ticks:
        price = get_price_at_offset(round_obj, asset, intraday_offset)
    else:
        price = round_obj.asset_closing_prices.get(asset, 0)

    if price <= 0:
        raise ValueError(f"Invalid price for {asset}")

    units = amount_pence // price
    if units == 0:
        raise ValueError(f"Amount too small to buy any units of {asset} at current price")

    actual_cost = units * price
    if attempt.asset_holdings is None:
        attempt.asset_holdings = {}
    attempt.asset_holdings[asset] = attempt.asset_holdings.get(asset, 0) + units
    attempt.cash_pence -= actual_cost

    from django.utils import timezone as tz
    attempt.action_log.append({
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'action': 'buy',
        'asset': asset,
        'amount_pence': actual_cost,
        'units_acquired': units,
        'price_pence': price,
        'intraday_offset_seconds': intraday_offset,
        'submitted_at': tz.now().isoformat(),
    })
    attempt.save()

    return {
        'asset': asset,
        'units_acquired': units,
        'amount_pence': actual_cost,
        'price_pence': price,
        'cash_remaining_pence': attempt.cash_pence,
    }


def execute_sell_multi(attempt, asset: str, units_to_sell: int, round_obj, intraday_offset: int = None) -> dict:
    if asset not in attempt.scenario.available_assets:
        raise ValueError(f"Asset {asset} not available")
    if units_to_sell <= 0:
        raise ValueError("Units must be positive")

    holdings = attempt.asset_holdings or {}
    current_holding = holdings.get(asset, 0)
    if units_to_sell > current_holding:
        raise ValueError(f"Insufficient {asset}: have {current_holding}, selling {units_to_sell}")

    if intraday_offset is not None and round_obj.intraday_ticks:
        price = get_price_at_offset(round_obj, asset, intraday_offset)
    else:
        price = round_obj.asset_closing_prices.get(asset, 0)

    proceeds = units_to_sell * price
    attempt.asset_holdings[asset] = current_holding - units_to_sell
    attempt.cash_pence += proceeds

    from django.utils import timezone as tz
    attempt.action_log.append({
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'action': 'sell',
        'asset': asset,
        'amount_pence': proceeds,
        'units_sold': units_to_sell,
        'price_pence': price,
        'intraday_offset_seconds': intraday_offset,
        'submitted_at': tz.now().isoformat(),
    })
    attempt.save()

    return {
        'asset': asset,
        'units_sold': units_to_sell,
        'proceeds_pence': proceeds,
        'price_pence': price,
        'cash_remaining_pence': attempt.cash_pence,
    }


def _detect_gfc_pattern(attempt) -> str:
    log = attempt.action_log
    starting = attempt.starting_balance_pence
    buys = [a for a in log if a.get('action') == 'buy']
    sells = [a for a in log if a.get('action') == 'sell']

    bought_per_asset = {}
    for a in buys:
        asset = a.get('asset', '')
        bought_per_asset[asset] = bought_per_asset.get(asset, 0) + a.get('amount_pence', 0)

    total_bought = sum(bought_per_asset.values())

    if total_bought < starting * 0.20:
        return 'cash_through_crisis'

    for asset, amount in bought_per_asset.items():
        if amount > starting * 0.80:
            if asset == 'RBS':
                return 'rbs_holder'
            if asset == 'GOLD':
                return 'gold_bull'

    safe_bought = bought_per_asset.get('GOLD', 0) + bought_per_asset.get('GILT', 0)
    if safe_bought > starting * 0.40:
        return 'safe_haven_seeker'

    asset_rounds = {}
    for a in buys + sells:
        asset = a.get('asset')
        if asset:
            asset_rounds.setdefault(asset, set()).add(a.get('round_index', -1))
    actively_traded = [k for k, v in asset_rounds.items() if len(v) >= 2]
    if len(actively_traded) >= 3:
        return 'active_rotator'

    bought_equity_r5 = sum(
        a.get('amount_pence', 0) for a in buys
        if a.get('round_index') == 5 and a.get('asset') in ('FTSE', 'BP')
    )
    if bought_equity_r5 > starting * 0.20:
        return 'bottom_picker'

    sold_panic = sum(a.get('amount_pence', 0) for a in sells if a.get('round_index') in (2, 3))
    bought_pre_panic = sum(a.get('amount_pence', 0) for a in buys if a.get('round_index', 99) <= 1)
    if sold_panic > bought_pre_panic * 0.5 and bought_pre_panic > 0:
        return 'panic_seller'

    return 'balanced_portfolio'


def _compute_gfc_reference_outcomes(scenario, end_prices: dict) -> dict:
    starting = scenario.starting_balance_pence
    round_0 = scenario.rounds.get(round_index=0)
    start_prices = round_0.asset_closing_prices


    all_cash = starting


    ftse_units = starting // start_prices['FTSE']
    all_ftse = ftse_units * end_prices['FTSE']


    gold_units = starting // start_prices['GOLD']
    all_gold = gold_units * end_prices['GOLD']


    rbs_units = starting // start_prices['RBS']
    all_rbs = rbs_units * end_prices['RBS']


    gold_alloc = (starting * 50) // 100
    gilt_alloc = (starting * 30) // 100
    cash_alloc = starting - gold_alloc - gilt_alloc
    gold_units_opt = gold_alloc // start_prices['GOLD']
    gilt_units_opt = gilt_alloc // start_prices['GILT']
    gold_leftover = gold_alloc - gold_units_opt * start_prices['GOLD']
    gilt_leftover = gilt_alloc - gilt_units_opt * start_prices['GILT']
    optimal = (
        cash_alloc + gold_leftover + gilt_leftover +
        gold_units_opt * end_prices['GOLD'] +
        gilt_units_opt * end_prices['GILT']
    )

    return {
        'all_cash_pence': all_cash,
        'all_ftse_pence': all_ftse,
        'all_gold_pence': all_gold,
        'all_rbs_pence': all_rbs,
        'optimal_pence': optimal,
    }


def _build_gfc_placeholders(attempt, final_state: dict) -> dict:
    starting = final_state['starting_balance_pence']
    total_value = final_state['total_value_pence']
    delta = final_state['total_delta_pence']
    delta_pct = final_state['total_delta_basis_pts'] / 100

    log = attempt.action_log
    buys = [a for a in log if a.get('action') == 'buy']
    sells = [a for a in log if a.get('action') == 'sell']

    bought_per_asset = {}
    for a in buys:
        asset = a.get('asset', '')
        bought_per_asset[asset] = bought_per_asset.get(asset, 0) + a.get('amount_pence', 0)

    pct_in_rbs = (bought_per_asset.get('RBS', 0) * 100) // starting if starting else 0
    pct_in_gold = (bought_per_asset.get('GOLD', 0) * 100) // starting if starting else 0

    final_rbs_value = final_state['asset_states'].get('RBS', {}).get('position_value_pence', 0)
    rbs_bought = bought_per_asset.get('RBS', 0)
    rbs_loss_pct = ((rbs_bought - final_rbs_value) * 100) // rbs_bought if rbs_bought > 0 else 0

    safe_bought = bought_per_asset.get('GOLD', 0) + bought_per_asset.get('GILT', 0)
    safe_haven_pct = (safe_bought * 100) // starting if starting else 0
    trade_count = len(buys) + len(sells)

    bought_at_bottom = sum(a.get('amount_pence', 0) for a in buys if a.get('round_index') == 5)

    panic_sells = [a for a in sells if a.get('round_index') in (2, 3)]
    total_sold_panic = sum(a.get('amount_pence', 0) for a in panic_sells)


    parts = []
    for asset in ('FTSE', 'RBS', 'BP', 'GOLD', 'GILT'):
        val = final_state['asset_states'].get(asset, {}).get('position_value_pence', 0)
        if val > 0 and total_value > 0:
            pct = (val * 100) // total_value
            parts.append(f"{asset} {pct}%")
    if final_state['cash_pence'] > 0 and total_value > 0:
        cp = (final_state['cash_pence'] * 100) // total_value
        parts.append(f"Cash {cp}%")
    portfolio_breakdown = ", ".join(parts) if parts else "All cash"

    risk = final_state.get('risk_category', 'LOW')
    category = 'well-diversified' if risk == 'LOW' else ('moderately diversified' if risk == 'MODERATE' else 'concentrated')

    return {
        'starting_balance': _fmt(starting),
        'final_value': _fmt(total_value),
        'delta_pct_signed': f"{'+' if delta >= 0 else ''}{delta_pct:.1f}",
        'pct_in_rbs': str(pct_in_rbs),
        'pct_in_gold': str(pct_in_gold),
        'final_rbs_value': _fmt(final_rbs_value),
        'rbs_loss_pct': str(rbs_loss_pct),
        'gold_return_pct': '50',
        'safe_haven_pct': str(safe_haven_pct),
        'trade_count': str(trade_count),
        'bought_at_bottom': _fmt(bought_at_bottom),
        'total_sold_panic': _fmt(total_sold_panic),
        'portfolio_breakdown': portfolio_breakdown,
        'category': category,
    }
