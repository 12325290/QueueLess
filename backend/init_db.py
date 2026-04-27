import pymysql
import sys
import os
from database import engine, SessionLocal, Base, Service, Queue

def get_working_connection():
    """Tries credentials from database.py first, then fallbacks."""
    # Extract from DB_URL if possible
    try:
        from database import DB_URL
        # format: mysql+pymysql://user:pass@host/db
        parts = DB_URL.split('://')[1].split('@')[0].split(':')
        db_user = parts[0]
        db_pass = parts[1] if len(parts) > 1 else ''
    except Exception:
        db_user, db_pass = 'root', ''

    credentials = [
        {'user': db_user, 'password': db_pass},
        {'user': 'root', 'password': 'root'}, 
        {'user': 'root', 'password': ''},     
        {'user': 'root', 'password': '123456'}, # User's current password
        {'user': 'root', 'password': 'admin'}
    ]
    
    for cred in credentials:
        try:
            conn = pymysql.connect(
                host='localhost', 
                user=cred['user'], 
                password=cred['password']
            )
            print(f"Success: Connected using user: {cred['user']} and password: '{cred['password']}'")
            return conn, cred
        except pymysql.err.OperationalError as e:
            if e.args[0] == 1045: # Access denied
                continue
            else:
                print(f"Error: {e}")
                break
    
    print("Error: Failed to connect to MySQL.")
    print("1. Make sure MySQL is RUNNING (XAMPP/MySQL service).")
    print("2. Check your password in backend/database.py")
    sys.exit(1)

def create_db_if_not_exists():
    conn, cred = get_working_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("CREATE DATABASE IF NOT EXISTS queueless")
        conn.commit()
        print("Database 'queueless' checked/created.")
    finally:
        conn.close()
    return cred

def migrate_data():
    db = SessionLocal()
    # Check if services already exist to avoid duplicates
    try:
        if db.query(Service).first():
            print("Data already exists in database. Skipping migration.")
            db.close()
            return
    except Exception:
        # Tables might not exist yet
        pass

    try:
        import json
        
        json_path = os.path.join(os.path.dirname(__file__), 'data.json')
        if not os.path.exists(json_path):
            print("data.json not found. Starting with empty database.")
            return

        with open(json_path, 'r') as f:
            data = json.load(f)
        
        for category, services in data.items():
            for s in services:
                new_service = Service(
                    id=s['id'],
                    name=s['name'],
                    category=category,
                    location=s['location'],
                    current_token=s['current_token'],
                    available_slots=s['available_slots']
                )
                db.add(new_service)
                
                # If there's an existing queue in JSON, migrate it too
                for q in s.get('queue', []):
                    new_q = Queue(
                        token=q['token'],
                        name=q['name'],
                        phone=q['phone'],
                        service_id=s['id']
                    )
                    db.add(new_q)
        
        db.commit()
        print("Success: Data migration from JSON to MySQL successful.")
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    working_cred = create_db_if_not_exists()
    
    print("Creating tables...")
    # Update engine with working credentials if they differ from database.py
    # This is a bit tricky since database.py is already imported, 
    # but Base.metadata.create_all(bind=engine) will use the engine defined there.
    # For now, we hope the user updates database.py after seeing the success message.
    
    try:
        Base.metadata.create_all(bind=engine)
        migrate_data()
    except Exception as e:
        print(f"Error creating tables: {e}")
        print("Trying to update database.py automatically...")
        
        # Auto-fix database.py
        db_path = os.path.join(os.path.dirname(__file__), 'database.py')
        with open(db_path, 'r') as f:
            lines = f.readlines()
        
        with open(db_path, 'w') as f:
            for line in lines:
                if 'DB_URL =' in line:
                    new_url = f"DB_URL = \"mysql+pymysql://{working_cred['user']}:{working_cred['password']}@localhost/queueless\"\n"
                    f.write(new_url)
                else:
                    f.write(line)
        print("database.py updated. Please run this script again.")
        sys.exit(0)
    
    print("\n" + "="*50)
    print("SETUP COMPLETE!")
    print(f"MySQL Creds used: User='{working_cred['user']}', Password='{working_cred['password']}'")
    print("="*50)
