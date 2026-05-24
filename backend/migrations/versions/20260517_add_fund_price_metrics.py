"""add fund price metrics table

Revision ID: 20260517_price_metrics
Revises: 5d83c7616ff7
Create Date: 2026-05-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260517_price_metrics"
down_revision: Union[str, Sequence[str], None] = "5d83c7616ff7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fund_price_metrics",
        sa.Column("cik", sa.Text(), nullable=False),
        sa.Column("period_of_report", sa.Text(), nullable=False),
        sa.Column("accession_number", sa.Text()),
        sa.Column("start_date", sa.Text()),
        sa.Column("end_date", sa.Text()),
        sa.Column("weighted_return", sa.Float()),
        sa.Column("coverage_pct", sa.Float()),
        sa.Column("positions_priced", sa.Integer()),
        sa.Column("positions_total", sa.Integer()),
        sa.Column("updated_at", sa.Text()),
        sa.PrimaryKeyConstraint("cik", "period_of_report"),
    )
    op.create_index(
        "idx_price_metrics_cik_period",
        "fund_price_metrics",
        ["cik", "period_of_report"],
    )


def downgrade() -> None:
    op.drop_index("idx_price_metrics_cik_period", table_name="fund_price_metrics")
    op.drop_table("fund_price_metrics")
