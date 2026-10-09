from django.contrib import admin
from .models import Competition, Asset, Participant, Position, Trade, DailySnapshot, HistoricalPrice

@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'name', 'current_price', 'last_updated')
    search_fields = ('ticker', 'name')

@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ('user', 'competition', 'cash_balance', 'total_equity', 'all_time_return_pct')
    list_filter = ('competition',)
    search_fields = ('user__username',)
    readonly_fields = ('total_equity', 'all_time_return_pct')

@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    list_display = ('title', 'start_date', 'end_date', 'is_active')
    list_editable = ('is_active',)

@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ('participant', 'asset', 'quantity', 'avg_buy_price')
    list_filter = ('asset', 'participant')

@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = ('participant', 'asset', 'quantity', 'price_at_execution', 'side', 'timestamp')
    list_filter = ('side', 'asset', 'timestamp')
    readonly_fields = ('timestamp',)

@admin.register(DailySnapshot)
class DailySnapshotAdmin(admin.ModelAdmin):
    list_display = ('participant', 'equity_value', 'timestamp')
    list_filter = ('timestamp',)

@admin.register(HistoricalPrice)
class HistoricalPriceAdmin(admin.ModelAdmin):
    list_display = ('asset', 'timestamp', 'close', 'volume')
    list_filter = ('asset', 'timestamp')
    readonly_fields = ('timestamp', 'open', 'high', 'low', 'close', 'volume')