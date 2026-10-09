from django.test import TestCase, TransactionTestCase
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from .models import (
    Asset, Competition, Participant, Position, Trade, 
    DailySnapshot, HistoricalPrice
)
from .services import execute_trade, TradeExecutionError, recalculate_participant_equity, compute_period_returns

User = get_user_model()


class AssetModelTests(TestCase):
    def setUp(self):
        self.asset = Asset.objects.create(
            ticker='BTC',
            name='Bitcoin',
            current_price=Decimal('50000.00'),
            price_change_24h=Decimal('2.5')
        )

    def test_asset_creation(self):
        self.assertEqual(self.asset.ticker, 'BTC')
        self.assertEqual(self.asset.name, 'Bitcoin')
        self.assertEqual(self.asset.current_price, Decimal('50000.00'))

    def test_asset_str(self):
        self.assertEqual(str(self.asset), 'BTC (Bitcoin)')

    def test_ticker_unique(self):
        with self.assertRaises(Exception):
            Asset.objects.create(
                ticker='BTC',
                name='Bitcoin Copy',
                current_price=Decimal('50000.00')
            )


class CompetitionModelTests(TestCase):
    def setUp(self):
        self.competition = Competition.objects.create(
            title='Mock Trading Challenge',
            starting_balance=Decimal('10000.00'),
            monthly_stipend=Decimal('2000.00'),
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=365),
            is_active=True
        )

    def test_competition_creation(self):
        self.assertEqual(self.competition.title, 'Mock Trading Challenge')
        self.assertTrue(self.competition.is_active)

    def test_competition_str(self):
        self.assertEqual(str(self.competition), 'Mock Trading Challenge')


class ParticipantModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test Comp',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('10000.00'),
            total_equity=Decimal('10000.00')
        )

    def test_participant_creation(self):
        self.assertEqual(self.participant.cash_balance, Decimal('10000.00'))
        self.assertEqual(self.participant.total_equity, Decimal('10000.00'))

    def test_participant_str(self):
        expected = f'{self.user.username} in {self.competition.title}'
        self.assertEqual(str(self.participant), expected)

    def test_unique_together(self):
        with self.assertRaises(Exception):
            Participant.objects.create(
                user=self.user,
                competition=self.competition,
                cash_balance=Decimal('5000.00')
            )


class PositionModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('10000.00')
        )
        self.asset = Asset.objects.create(
            ticker='BTC',
            name='Bitcoin',
            current_price=Decimal('50000.00')
        )
        self.position = Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.5'),
            avg_buy_price=Decimal('45000.00')
        )

    def test_position_creation(self):
        self.assertEqual(self.position.quantity, Decimal('0.5'))
        self.assertEqual(self.position.avg_buy_price, Decimal('45000.00'))

    def test_current_value_calculation(self):
        # 0.5 BTC @ 50,000 = 25,000
        expected = Decimal('0.5') * Decimal('50000.00')
        self.assertEqual(self.position.current_value, expected)

    def test_cost_basis_calculation(self):
        # 0.5 BTC @ 45,000 = 22,500
        expected = Decimal('0.5') * Decimal('45000.00')
        self.assertEqual(self.position.cost_basis, expected)

    def test_unrealised_pnl(self):
        # 25,000 - 22,500 = 2,500
        expected = Decimal('25000.00') - Decimal('22500.00')
        self.assertEqual(self.position.unrealised_pnl, expected)

    def test_unrealised_pnl_pct(self):
        # (2,500 / 22,500) * 100 ≈ 11.11%
        self.assertAlmostEqual(
            float(self.position.unrealised_pnl_pct),
            11.11,
            places=1
        )


class TradeExecutionTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            starting_balance=Decimal('10000.00')
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('10000.00'),
            total_equity=Decimal('10000.00')
        )
        self.asset = Asset.objects.create(
            ticker='BTC',
            name='Bitcoin',
            current_price=Decimal('50000.00')
        )

    def test_buy_trade_success(self):
        """Test successful BUY trade"""
        trade = execute_trade(self.participant.id, 'BTC', Decimal('0.1'), 'BUY')
        
        self.assertEqual(trade.side, 'BUY')
        self.assertEqual(trade.quantity, Decimal('0.1'))
        self.assertEqual(trade.price_at_execution, Decimal('50000.00'))
        
        # Check participant cash reduced
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.cash_balance, Decimal('5000.00'))
        
        # Check position created
        position = Position.objects.get(participant=self.participant, asset=self.asset)
        self.assertEqual(position.quantity, Decimal('0.1'))

    def test_buy_trade_insufficient_funds(self):
        """Test BUY fails with insufficient funds"""
        with self.assertRaises(TradeExecutionError) as context:
            execute_trade(self.participant.id, 'BTC', Decimal('1'), 'BUY')
        
        self.assertIn('Insufficient funds', str(context.exception))

    def test_buy_trade_invalid_quantity(self):
        """Test BUY fails with invalid quantity"""
        with self.assertRaises(TradeExecutionError) as context:
            execute_trade(self.participant.id, 'BTC', Decimal('0'), 'BUY')
        
        self.assertIn('greater than zero', str(context.exception))

    def test_sell_trade_success(self):
        """Test successful SELL trade"""
        # First create a position
        position = Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.2'),
            avg_buy_price=Decimal('45000.00')
        )
        
        trade = execute_trade(self.participant.id, 'BTC', Decimal('0.1'), 'SELL')
        
        self.assertEqual(trade.side, 'SELL')
        self.assertEqual(trade.quantity, Decimal('0.1'))
        
        # Check participant cash increased
        self.participant.refresh_from_db()
        expected_cash = Decimal('10000.00') + (Decimal('0.1') * Decimal('50000.00'))
        self.assertEqual(self.participant.cash_balance, expected_cash)
        
        # Check position reduced
        position.refresh_from_db()
        self.assertEqual(position.quantity, Decimal('0.1'))

    def test_sell_trade_no_position(self):
        """Test SELL fails when no position exists"""
        with self.assertRaises(TradeExecutionError) as context:
            execute_trade(self.participant.id, 'BTC', Decimal('0.1'), 'SELL')
        
        self.assertIn('do not hold any', str(context.exception))

    def test_sell_trade_insufficient_holdings(self):
        """Test SELL fails with insufficient holdings"""
        Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.05'),
            avg_buy_price=Decimal('45000.00')
        )
        
        with self.assertRaises(TradeExecutionError) as context:
            execute_trade(self.participant.id, 'BTC', Decimal('0.1'), 'SELL')
        
        self.assertIn('Insufficient holdings', str(context.exception))

    def test_sell_complete_position(self):
        """Test SELL that reduces position to zero deletes it"""
        Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.1'),
            avg_buy_price=Decimal('45000.00')
        )
        
        execute_trade(self.participant.id, 'BTC', Decimal('0.1'), 'SELL')
        
        # Position should be deleted
        exists = Position.objects.filter(
            participant=self.participant,
            asset=self.asset
        ).exists()
        self.assertFalse(exists)

    def test_buy_multiple_avg_price(self):
        """Test weighted average price calculation on multiple buys"""
        # Increase cash to afford both buys
        self.participant.cash_balance = Decimal('50000.00')
        self.participant.save()
        
        # First buy: 0.1 BTC @ 50,000
        execute_trade(self.participant.id, 'BTC', Decimal('0.1'), 'BUY')
        
        # Update price
        self.asset.current_price = Decimal('60000.00')
        self.asset.save()
        
        # Second buy: 0.1 BTC @ 60,000
        execute_trade(self.participant.id, 'BTC', Decimal('0.1'), 'BUY')
        
        position = Position.objects.get(participant=self.participant, asset=self.asset)
        # Avg price should be (50000 + 60000) / 2 = 55000
        self.assertEqual(position.avg_buy_price, Decimal('55000.00'))
        self.assertEqual(position.quantity, Decimal('0.2'))


class RecalculateEquityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            starting_balance=Decimal('10000.00')
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('5000.00'),
            total_stipends_received=Decimal('0.00')
        )
        self.asset = Asset.objects.create(
            ticker='BTC',
            name='Bitcoin',
            current_price=Decimal('50000.00')
        )

    def test_equity_calculation_cash_only(self):
        """Test equity = cash when no positions"""
        recalculate_participant_equity(self.participant)
        self.participant.refresh_from_db()
        
        self.assertEqual(self.participant.total_equity, Decimal('5000.00'))
        self.assertEqual(self.participant.holdings_value, Decimal('0.00'))

    def test_equity_calculation_with_holdings(self):
        """Test equity = cash + holdings value"""
        Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.1'),
            avg_buy_price=Decimal('45000.00')
        )
        
        recalculate_participant_equity(self.participant)
        self.participant.refresh_from_db()
        
        # 0.1 BTC @ 50,000 = 5,000
        expected_equity = Decimal('5000.00') + Decimal('5000.00')
        self.assertEqual(self.participant.total_equity, expected_equity)
        self.assertEqual(self.participant.holdings_value, Decimal('5000.00'))

    def test_return_pct_calculation(self):
        """Test all_time_return_pct calculation"""
        self.participant.total_stipends_received = Decimal('5000.00')
        self.participant.save()
        
        Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.2'),
            avg_buy_price=Decimal('45000.00')
        )
        
        recalculate_participant_equity(self.participant)
        self.participant.refresh_from_db()
        
        # Equity = 5000 + 10000 = 15000
        # Total invested = 10000 + 5000 = 15000
        # Return = (15000 / 15000 - 1) * 100 = 0%
        self.assertEqual(self.participant.all_time_return_pct, Decimal('0.00'))


class HistoricalPriceModelTests(TestCase):
    def setUp(self):
        self.asset = Asset.objects.create(
            ticker='BTC',
            name='Bitcoin',
            current_price=Decimal('50000.00')
        )
        self.timestamp = timezone.now()
        self.price = HistoricalPrice.objects.create(
            asset=self.asset,
            timestamp=self.timestamp,
            open=Decimal('49000.00'),
            high=Decimal('51000.00'),
            low=Decimal('48000.00'),
            close=Decimal('50500.00'),
            volume=Decimal('100.00')
        )

    def test_price_creation(self):
        self.assertEqual(self.price.close, Decimal('50500.00'))
        self.assertEqual(self.price.asset, self.asset)

    def test_unique_together(self):
        with self.assertRaises(Exception):
            HistoricalPrice.objects.create(
                asset=self.asset,
                timestamp=self.timestamp,
                open=Decimal('49000.00'),
                high=Decimal('51000.00'),
                low=Decimal('48000.00'),
                close=Decimal('50500.00'),
            )


class DailySnapshotModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('10000.00')
        )

    def test_snapshot_creation(self):
        snapshot = DailySnapshot.objects.create(
            participant=self.participant,
            equity_value=Decimal('12500.00'),
            cash_balance=Decimal('10000.00')
        )
        
        self.assertEqual(snapshot.equity_value, Decimal('12500.00'))
        self.assertEqual(snapshot.participant, self.participant)


class ComputePeriodReturnsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test',
            start_date=timezone.now() - timedelta(days=400),
            end_date=timezone.now() + timedelta(days=30),
            starting_balance=Decimal('10000.00')
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('12000.00'),
            total_equity=Decimal('12000.00'),
            total_stipends_received=Decimal('0.00')
        )

    def test_weekly_return_calculation(self):
        """Test weekly return calculation from snapshots"""
        # Create old snapshot (10 days ago)
        old_time = timezone.now() - timedelta(days=10, hours=1)
        DailySnapshot.objects.create(
            participant=self.participant,
            timestamp=old_time,
            equity_value=Decimal('10000.00')
        )
        
        # Current equity = 12000, old = 10000
        # Return = (12000 / 10000 - 1) * 100 = 20%
        compute_period_returns(self.participant)
        self.participant.refresh_from_db()
        
        self.assertAlmostEqual(
            float(self.participant.weekly_return_pct),
            20.0,
            places=1
        )

    def test_monthly_return_calculation(self):
        """Test monthly return calculation"""
        old_time = timezone.now() - timedelta(days=35, hours=1)
        DailySnapshot.objects.create(
            participant=self.participant,
            timestamp=old_time,
            equity_value=Decimal('10000.00')
        )
        
        compute_period_returns(self.participant)
        self.participant.refresh_from_db()
        
        self.assertAlmostEqual(
            float(self.participant.monthly_return_pct),
            20.0,
            places=1
        )

    def test_yearly_return_calculation(self):
        """Test yearly return calculation"""
        old_time = timezone.now() - timedelta(days=400, hours=1)
        DailySnapshot.objects.create(
            participant=self.participant,
            timestamp=old_time,
            equity_value=Decimal('10000.00')
        )
        
        compute_period_returns(self.participant)
        self.participant.refresh_from_db()
        
        self.assertAlmostEqual(
            float(self.participant.yearly_return_pct),
            20.0,
            places=1
        )

    def test_no_snapshot_returns_zero(self):
        """Test returns are 0 when no old snapshot exists"""
        compute_period_returns(self.participant)
        self.participant.refresh_from_db()
        
        self.assertEqual(self.participant.weekly_return_pct, Decimal('0.0'))
        self.assertEqual(self.participant.monthly_return_pct, Decimal('0.0'))


class SerializerTests(TestCase):
    def setUp(self):
        self.asset = Asset.objects.create(
            ticker='BTC',
            name='Bitcoin',
            current_price=Decimal('50000.00'),
            price_change_24h=Decimal('2.5')
        )
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('10000.00'),
            total_equity=Decimal('10000.00')
        )

    def test_asset_serializer(self):
        from .serializers import AssetSerializer
        serializer = AssetSerializer(self.asset)
        data = serializer.data
        
        self.assertEqual(data['ticker'], 'BTC')
        self.assertEqual(data['name'], 'Bitcoin')
        self.assertEqual(float(data['current_price']), 50000.0)

    def test_participant_serializer(self):
        from .serializers import ParticipantSerializer
        serializer = ParticipantSerializer(self.participant)
        data = serializer.data
        
        self.assertEqual(data['username'], 'trader1')
        self.assertEqual(float(data['cash_balance']), 10000.0)
        self.assertEqual(data['positions'], [])

    def test_position_serializer(self):
        from .serializers import PositionSerializer
        position = Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.1'),
            avg_buy_price=Decimal('45000.00')
        )
        serializer = PositionSerializer(
            position,
            context={'total_equity': Decimal('10000.00')}
        )
        data = serializer.data
        
        self.assertEqual(data['asset_ticker'], 'BTC')
        self.assertEqual(float(data['quantity']), 0.1)
        self.assertEqual(float(data['avg_buy_price']), 45000.0)

    def test_trade_serializer(self):
        from .serializers import TradeSerializer
        trade = Trade.objects.create(
            participant=self.participant,
            asset=self.asset,
            side='BUY',
            quantity=Decimal('0.1'),
            price_at_execution=Decimal('50000.00'),
            total_value=Decimal('5000.00')
        )
        serializer = TradeSerializer(trade)
        data = serializer.data
        
        self.assertEqual(data['asset_ticker'], 'BTC')
        self.assertEqual(data['side'], 'BUY')
        self.assertEqual(float(data['quantity']), 0.1)

    def test_leaderboard_entry_serializer(self):
        from .serializers import LeaderboardEntrySerializer
        self.participant.all_time_return_pct = Decimal('25.50')
        self.participant.save()
        
        serializer = LeaderboardEntrySerializer(self.participant)
        data = serializer.data
        
        self.assertEqual(data['username'], 'trader1')
        self.assertAlmostEqual(float(data['all_time_return_pct']), 25.5, places=1)


class APIViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create(username='trader1')
        self.competition = Competition.objects.create(
            title='Test Comp',
            starting_balance=Decimal('10000.00'),
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True
        )
        self.asset = Asset.objects.create(
            ticker='BTC',
            name='Bitcoin',
            current_price=Decimal('50000.00')
        )
        self.asset2 = Asset.objects.create(
            ticker='ETH',
            name='Ethereum',
            current_price=Decimal('3000.00')
        )
        self.participant = Participant.objects.create(
            user=self.user,
            competition=self.competition,
            cash_balance=Decimal('10000.00'),
            total_equity=Decimal('10000.00')
        )
        self.client.force_authenticate(user=self.user)

    def test_live_prices_view(self):
        """Test GET /api/prices/live/"""
        response = self.client.get('/api/prices/live/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 2)

    def test_asset_detail_view(self):
        """Test GET /api/prices/<ticker>/"""
        response = self.client.get('/api/prices/BTC/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['ticker'], 'BTC')

    def test_chart_data_view(self):
        """Test GET /api/chart/<ticker>/?days=1"""
        # Create some historical prices
        HistoricalPrice.objects.create(
            asset=self.asset,
            timestamp=timezone.now(),
            open=Decimal('49000.00'),
            high=Decimal('51000.00'),
            low=Decimal('48000.00'),
            close=Decimal('50500.00')
        )
        
        response = self.client.get('/api/chart/BTC/?days=1')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertGreater(len(response.data), 0)

    def test_portfolio_view(self):
        """Test GET /api/portfolio/"""
        response = self.client.get('/api/portfolio/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'trader1')
        self.assertEqual(float(response.data['cash_balance']), 10000.0)

    def test_trade_view_buy(self):
        """Test POST /api/trade/ for BUY"""
        data = {
            'ticker': 'BTC',
            'quantity': '0.1',
            'side': 'BUY'
        }
        response = self.client.post('/api/trade/', data=data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('portfolio', response.data)
        self.assertEqual(float(response.data['portfolio']['cash_balance']), 5000.0)

    def test_trade_view_insufficient_funds(self):
        """Test POST /api/trade/ fails with insufficient funds"""
        data = {
            'ticker': 'BTC',
            'quantity': '1',
            'side': 'BUY'
        }
        response = self.client.post('/api/trade/', data=data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_trade_view_sell(self):
        """Test POST /api/trade/ for SELL"""
        # Create position
        Position.objects.create(
            participant=self.participant,
            asset=self.asset,
            quantity=Decimal('0.2'),
            avg_buy_price=Decimal('45000.00')
        )
        
        data = {
            'ticker': 'BTC',
            'quantity': '0.1',
            'side': 'SELL'
        }
        response = self.client.post('/api/trade/', data=data, format='json')
        self.assertEqual(response.status_code, 201)

    def test_trade_history_view(self):
        """Test GET /api/trades/"""
        # Create some trades
        Trade.objects.create(
            participant=self.participant,
            asset=self.asset,
            side='BUY',
            quantity=Decimal('0.1'),
            price_at_execution=Decimal('50000.00'),
            total_value=Decimal('5000.00')
        )
        
        response = self.client.get('/api/trades/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 1)
        self.assertEqual(len(response.data['results']), 1)

    def test_trade_history_filter_by_ticker(self):
        """Test GET /api/trades/?ticker=BTC"""
        Trade.objects.create(
            participant=self.participant,
            asset=self.asset,
            side='BUY',
            quantity=Decimal('0.1'),
            price_at_execution=Decimal('50000.00'),
            total_value=Decimal('5000.00')
        )
        Trade.objects.create(
            participant=self.participant,
            asset=self.asset2,
            side='BUY',
            quantity=Decimal('1'),
            price_at_execution=Decimal('3000.00'),
            total_value=Decimal('3000.00')
        )
        
        response = self.client.get('/api/trades/?ticker=BTC')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 1)

    def test_leaderboard_view(self):
        """Test GET /api/leaderboard/"""
        self.participant.all_time_return_pct = Decimal('15.5')
        self.participant.save()
        
        response = self.client.get('/api/leaderboard/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('winners', response.data)
        self.assertIn('losers', response.data)

    def test_leaderboard_view_periods(self):
        """Test GET /api/leaderboard/?period=weekly"""
        response = self.client.get('/api/leaderboard/?period=weekly')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['period'], 'weekly')

    def test_join_competition_view(self):
        """Test POST /api/competition/join/"""
        new_user = User.objects.create(username='trader2')
        self.client.force_authenticate(user=new_user)
        
        data = {'competition_id': self.competition.id}
        response = self.client.post('/api/competition/join/', data=data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('portfolio', response.data)

    def test_join_competition_idempotent(self):
        """Test joining same competition twice is idempotent"""
        # Clean up any existing participant from previous test runs (--keepdb)
        Participant.objects.filter(user=self.user, competition=self.competition).delete()
        
        data = {'competition_id': self.competition.id}
        response1 = self.client.post('/api/competition/join/', data=data, format='json')
        response2 = self.client.post('/api/competition/join/', data=data, format='json')
        
        self.assertEqual(response1.status_code, 201)  # First join creates
        self.assertEqual(response2.status_code, 200)   # Second join already exists

    def test_trade_view_missing_params(self):
        """Test trade fails with missing parameters"""
        data = {'ticker': 'BTC'}  # Missing quantity and side
        response = self.client.post('/api/trade/', data=data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

                