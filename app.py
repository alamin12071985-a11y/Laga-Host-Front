from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import os
import sqlite3
import zipfile
import subprocess
import signal
import shutil
import uuid

app = Flask(__name__)
# InfinityFree ডোমেইন থেকে রিকোয়েস্ট এক্সেপ্ট করার জন্য CORS অন করা হলো
CORS(app) 

app.secret_key = "lagahost_super_secret_key_v2"
UPLOAD_FOLDER = "user_uploads"
DB_NAME = "lagahost.db"
MAX_APPS_PER_USER = 3 # পাবলিক ইউজারদের জন্য লিমিট

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# প্রসেস স্টোরেজ (মেমোরিতে রাখা হবে)
running_processes = {} # Format: { "username_appname": subprocess_object }

# --- Database Setup ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)''')
    conn.commit()
    conn.close()

init_db()

# --- Helper Functions ---

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def find_main_file(path):
    # অটোমেটিক মেইন ফাইল খোঁজা
    for f in ["main.py", "app.py", "bot.py", "index.py"]:
        if os.path.exists(os.path.join(path, f)):
            return f
    return None

# --- API Routes ---

@app.route('/')
def home():
    return jsonify({"status": "Lagahost Backend is Running!", "version": "2.0"})

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    hashed_pw = generate_password_hash(password)

    try:
        conn = get_db_connection()
        conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, hashed_pw))
        conn.commit()
        conn.close()
        return jsonify({"message": "Registration successful! Please login."})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already exists!"}), 409

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()

    if user and check_password_hash(user['password'], password):
        # সিম্পল টোকেন জেনারেশন (প্রোডাকশনে JWT ব্যবহার করা ভালো)
        return jsonify({"message": "Login successful", "username": username, "token": "valid_session"})
    else:
        return jsonify({"error": "Invalid credentials"}), 401

@app.route('/upload', methods=['POST'])
def upload_file():
    username = request.form.get('username')
    if not username: return jsonify({"error": "Unauthorized"}), 401

    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and file.filename.endswith('.zip'):
        app_name = secure_filename(file.filename.replace('.zip', ''))
        user_dir = os.path.join(UPLOAD_FOLDER, username, app_name)
        
        # ক্লিন ইনস্টল
        if os.path.exists(user_dir):
            shutil.rmtree(user_dir)
        os.makedirs(user_dir, exist_ok=True)
        
        zip_path = os.path.join(user_dir, "app.zip")
        file.save(zip_path)

        # আনজিপ করা
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(user_dir)
        
        # Requirements ইনস্টল (সতর্কতা: এটি সময় নিতে পারে)
        req_file = os.path.join(user_dir, "requirements.txt")
        if os.path.exists(req_file):
            subprocess.run(["pip", "install", "-r", req_file], cwd=user_dir)

        return jsonify({"message": "App uploaded and extracted successfully!"})
    
    return jsonify({"error": "Only .zip files are allowed"}), 400

@app.route('/my_apps', methods=['POST'])
def my_apps():
    username = request.json.get('username')
    user_path = os.path.join(UPLOAD_FOLDER, username)
    
    if not os.path.exists(user_path):
        return jsonify({"apps": []})

    apps_list = []
    for app_name in os.listdir(user_path):
        full_path = os.path.join(user_path, app_name)
        if os.path.isdir(full_path):
            process_key = f"{username}_{app_name}"
            is_running = process_key in running_processes and running_processes[process_key].poll() is None
            
            # লগ পড়া
            log_content = ""
            log_file = os.path.join(full_path, "logs.txt")
            if os.path.exists(log_file):
                with open(log_file, "r", errors="ignore") as f:
                    log_content = f.read()[-2000:] # শেষ ২০০০ ক্যারেক্টার

            apps_list.append({
                "name": app_name,
                "running": is_running,
                "logs": log_content
            })
            
    return jsonify({"apps": apps_list})

@app.route('/action', methods=['POST'])
def action():
    data = request.json
    action = data.get('action') # start, stop, delete
    username = data.get('username')
    app_name = data.get('app_name')
    
    process_key = f"{username}_{app_name}"
    user_app_path = os.path.join(UPLOAD_FOLDER, username, app_name)

    if action == "start":
        if process_key in running_processes and running_processes[process_key].poll() is None:
             return jsonify({"message": "App is already running"})

        main_file = find_main_file(user_app_path)
        if not main_file:
            return jsonify({"error": "No main.py/app.py found!"}), 404

        log_file = open(os.path.join(user_app_path, "logs.txt"), "a")
        proc = subprocess.Popen(
            ["python3", main_file],
            cwd=user_app_path,
            stdout=log_file,
            stderr=log_file
        )
        running_processes[process_key] = proc
        return jsonify({"message": f"{app_name} Started!"})

    elif action == "stop":
        if process_key in running_processes:
            proc = running_processes[process_key]
            proc.terminate() # অথবা proc.kill()
            del running_processes[process_key]
            return jsonify({"message": f"{app_name} Stopped!"})
        return jsonify({"error": "App is not running"})

    elif action == "delete":
        # স্টপ করা আগে
        if process_key in running_processes:
            running_processes[process_key].terminate()
            del running_processes[process_key]
        
        # ফোল্ডার ডিলিট
        if os.path.exists(user_app_path):
            shutil.rmtree(user_app_path)
            return jsonify({"message": "App deleted successfully"})
        return jsonify({"error": "App not found"})

    return jsonify({"error": "Invalid action"}), 400

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
