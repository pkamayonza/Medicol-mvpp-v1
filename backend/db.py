import os
from dotenv import load_dotenv
from databases import Database

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")  # Supabase connection string

database = Database(DATABASE_URL)

async def connect_db():
    await database.connect()

async def disconnect_db():
    await database.disconnect()