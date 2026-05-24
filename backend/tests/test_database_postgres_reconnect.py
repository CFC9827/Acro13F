import psycopg2

from backend.services.database import DatabaseManager


class _Cursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params):
        if self.conn.fail:
            raise psycopg2.OperationalError("stale connection")
        self.query = query
        self.params = params

    def fetchone(self):
        return {"ok": True}


class _Connection:
    def __init__(self, fail=False):
        self.fail = fail
        self.autocommit = False

    def cursor(self, *args, **kwargs):
        return _Cursor(self)

    def commit(self):
        return None


class _Pool:
    def __init__(self):
        self.connections = [_Connection(fail=True), _Connection(fail=False)]
        self.discarded = []
        self.returned = []

    def getconn(self):
        return self.connections.pop(0)

    def putconn(self, conn, close=False):
        if close:
            self.discarded.append(conn)
        else:
            self.returned.append(conn)


def test_execute_retries_stale_postgres_connection_once():
    db = DatabaseManager.__new__(DatabaseManager)
    db.is_postgres = True
    db._pool = _Pool()

    result = db._execute("SELECT ?", ("value",), fetch="one")

    assert result == {"ok": True}
    assert len(db._pool.discarded) == 1
    assert len(db._pool.returned) == 1
