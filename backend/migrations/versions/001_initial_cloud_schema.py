"""Initial v4.0 cloud schema

Revision ID: 001
Revises: 
Create Date: 2026-05-06

This migration creates the full multi-tenant schema for the cloud transition.
Canonical tables hold SEC data shared across all users.
User tables hold per-user tracking state and preferences.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '001_initial_cloud_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ==========================================
    # CANONICAL TABLES (shared platform data)
    # ==========================================
    
    op.create_table('funds',
        sa.Column('cik', sa.Text(), nullable=False),
        sa.Column('name', sa.Text()),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('cik')
    )

    op.create_table('filings',
        sa.Column('accession_number', sa.Text(), nullable=False),
        sa.Column('cik', sa.Text()),
        sa.Column('period_of_report', sa.Text()),
        sa.Column('filing_date', sa.Text()),
        sa.ForeignKeyConstraint(['cik'], ['funds.cik']),
        sa.PrimaryKeyConstraint('accession_number')
    )

    op.create_table('holdings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('accession_number', sa.Text()),
        sa.Column('issuer_name', sa.Text()),
        sa.Column('cusip', sa.Text()),
        sa.Column('ticker', sa.Text()),
        sa.Column('shares', sa.BigInteger()),
        sa.Column('value', sa.BigInteger()),
        sa.Column('put_call', sa.Text()),
        sa.Column('sector', sa.Text()),
        sa.ForeignKeyConstraint(['accession_number'], ['filings.accession_number']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('prices',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticker', sa.Text()),
        sa.Column('date', sa.Text()),
        sa.Column('price', sa.Float()),
        sa.Column('dividends', sa.Float(), server_default='0'),
        sa.UniqueConstraint('ticker', 'date'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('sync_status',
        sa.Column('cik', sa.Text(), nullable=False),
        sa.Column('status', sa.Text()),
        sa.Column('last_sync', sa.Text()),
        sa.Column('error_message', sa.Text()),
        sa.Column('newly_added_count', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('cik')
    )

    op.create_table('ticker_metadata',
        sa.Column('ticker', sa.Text(), nullable=False),
        sa.Column('status', sa.Text()),
        sa.Column('last_updated', sa.Text()),
        sa.PrimaryKeyConstraint('ticker')
    )

    op.create_table('fund_quarterly_stats',
        sa.Column('cik', sa.Text(), nullable=False),
        sa.Column('period_of_report', sa.Text(), nullable=False),
        sa.Column('accession_number', sa.Text()),
        sa.Column('total_aum', sa.BigInteger()),
        sa.Column('position_count', sa.Integer()),
        sa.Column('top_10_concentration', sa.Float()),
        sa.Column('avg_position_size', sa.Float()),
        sa.Column('primary_sector', sa.Text()),
        sa.Column('primary_sector_weight', sa.Float()),
        sa.Column('mega_cap_pct', sa.Float()),
        sa.Column('mid_cap_pct', sa.Float()),
        sa.Column('small_cap_pct', sa.Float()),
        sa.Column('portfolio_turnover', sa.Float()),
        sa.Column('avg_holding_period', sa.Float()),
        sa.Column('herding_score', sa.Float()),
        sa.PrimaryKeyConstraint('cik', 'period_of_report')
    )

    # ==========================================
    # USER TABLES (per-user state)
    # ==========================================

    op.create_table('users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.Text(), unique=True),
        sa.Column('created_at', sa.Text()),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('user_tracked_funds',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('cik', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['cik'], ['funds.cik'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'cik')
    )

    op.create_table('user_fund_groups',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer()),
        sa.Column('name', sa.Text()),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'name'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('user_fund_group_members',
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('cik', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['user_fund_groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['cik'], ['funds.cik'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('group_id', 'cik')
    )

    # ==========================================
    # PERFORMANCE INDEXES
    # ==========================================

    # Canonical data indexes
    op.create_index('idx_filings_cik', 'filings', ['cik'])
    op.create_index('idx_filings_period', 'filings', ['cik', 'period_of_report'])
    op.create_index('idx_holdings_accession', 'holdings', ['accession_number'])
    op.create_index('idx_holdings_ticker', 'holdings', ['ticker'])
    op.create_index('idx_prices_ticker_date', 'prices', ['ticker', 'date'])
    op.create_index('idx_stats_cik', 'fund_quarterly_stats', ['cik'])
    op.create_index('idx_stats_cik_period', 'fund_quarterly_stats', ['cik', 'period_of_report'])

    # User data indexes (critical for fast per-user lookups)
    op.create_index('idx_user_tracked_funds_user', 'user_tracked_funds', ['user_id'])
    op.create_index('idx_user_tracked_funds_cik', 'user_tracked_funds', ['user_id', 'cik'])
    op.create_index('idx_user_groups_user', 'user_fund_groups', ['user_id'])
    op.create_index('idx_user_group_members_user', 'user_fund_group_members', ['user_id', 'group_id', 'cik'])


def downgrade() -> None:
    # Drop user tables first (foreign keys)
    op.drop_table('user_fund_group_members')
    op.drop_table('user_fund_groups')
    op.drop_table('user_tracked_funds')
    op.drop_table('users')

    # Drop canonical tables
    op.drop_table('fund_quarterly_stats')
    op.drop_table('ticker_metadata')
    op.drop_table('sync_status')
    op.drop_table('prices')
    op.drop_table('holdings')
    op.drop_table('filings')
    op.drop_table('funds')
