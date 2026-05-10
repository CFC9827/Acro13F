"""add last_synced_at and sync_status to funds

Revision ID: 5d83c7616ff7
Revises: 001_initial_cloud_schema
Create Date: 2026-05-10 13:58:57.295952

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d83c7616ff7'
down_revision: Union[str, Sequence[str], None] = '001_initial_cloud_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('funds', sa.Column('last_synced_at', sa.DateTime(), nullable=True))
    op.add_column('funds', sa.Column('sync_status', sa.String(), nullable=False, server_default='idle'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('funds', 'sync_status')
    op.drop_column('funds', 'last_synced_at')
