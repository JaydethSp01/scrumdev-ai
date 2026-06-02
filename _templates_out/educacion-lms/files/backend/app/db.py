import os
import psycopg
from psycopg.rows import dict_row

def get_connection():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return psycopg.connect(database_url, row_factory=dict_row)
    else:
        return None  # O usar una base de datos en memoria/mock para pruebas locales