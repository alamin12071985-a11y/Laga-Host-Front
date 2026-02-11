from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import os
import sqlite3
import zipfile
import subprocess
import shutil
import time

app = Flask(__name__)
CORS(app)  # সব ডোমেইন থেকে এক্সেস অন

app.secret_key = "lagahost_ultra_secret_key_v3"
UPLOAD_FOLDER = "user_uploads"
DB_NAME = "lagahost.db"

# ফোল্ডার নিশ্চিত করা
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# মেমোরিতে রানিং প্রসেস রাখার জন্য
running_processes = {} 

# --- ডাটাবেস সেটআপ ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)''')
    conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

# --- স্মার্ট ফাইল ফাইন্ডার (Smart Search) ---
def find_main_script(root_folder):
    # এই নামগুলো আগে খুঁজবে
    priority_files = ["main.py", "app.py", "bot.py", "index.py"]
    
    # ১. প্রথমে রুট ফোল্ডারে খুঁজি
    for f in priority_files:
        path = os.path.join(root_folder, f)
        if os.path.exists(path):
            return path, root_folder
            
    # ২. যদি না পাই, ফোল্ডারের ভেতরে খুঁজি (Recursive)
    for root, dirs, files in os.walk(root_folder):
        # স্কিপ ফোল্ডার (অপ্রয়োজনীয় ফোল্ডার বাদ)
        if "__pycache__" in root or ".git" in root:
            continue
            
        for f in priority_files:
            if f in files:
                return os.path.join(root, f), root
                
    # ৩. যদি তাও না পাই, যেকোনো .py ফাইল খুঁজি
    for root, dirs, files in os.walk(root_folder):
        for f in files:
            if f.endswith(".py"):
                return os.path.join(root, f), root
                
    return None, None

# --- API রাউটস ---

@app.route('/')
def home():
    return jsonify({"status": "LagaHost Backend V3 Running!", "support": ".py & .zip"})

# 🔐 লগিন ও রেজিস্টার
@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"error": "Missing data"}), 400
    try:
        conn = get_db_connection()
        conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", 
                     (username, generate_password_hash(password)))
        conn.commit()
        return jsonify({"message": "User registered!"})
    except:
        return jsonify({"error": "Username taken"}), 409
    finally:
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (data.get('username'),)).fetchone()
    conn.close()
    if user and check_password_hash(user['password'], data.get('password')):
        return jsonify({"message": "Login successful", "username": user['username']})
    return jsonify({"error": "Invalid credentials"}), 401

# 📤 আপলোড সিস্টেম (ZIP এবং PY)
@app.route('/upload', methods=['POST'])
def upload_file():
    username = request.form.get('username')
    if not username: return jsonify({"error": "No username"}), 401
    
    if 'file' not in request.files:
        return jsonify({"error": "No file sent"}), 400
        
    file = request.files['file']
    filename = secure_filename(file.filename)
    
    # অ্যাপের নাম বের করা (এক্সটেনশন বাদ দিয়ে)
    if filename.endswith('.zip'):
        app_name = filename[:-4]
    elif filename.endswith('.py'):
        app_name = filename[:-3]
    else:
        return jsonify({"error": "Only .zip or .py files allowed"}), 400
        
    # ফোল্ডার তৈরি
    user_dir = os.path.join(UPLOAD_FOLDER, username, app_name)
    if os.path.exists(user_dir):
        try: shutil.rmtree(user_dir) # আগের ভার্সন ডিলিট
        except: pass
    os.makedirs(user_dir, exist_ok=True)
    
    # ফাইল সেভ করা
    save_path = os.path.join(user_dir, filename)
    file.save(save_path)
    
    # যদি ZIP হয় -> এক্সট্রাক্ট করা
    if filename.endswith('.zip'):
        try:
            with zipfile.ZipFile(save_path, 'r') as zip_ref:
                zip_ref.extractall(user_dir)
            os.remove(save_path) # জিপ ফাইল ডিলিট করে দিই স্পেস বাঁচাতে
            
            # requirements.txt খুঁজবো এবং ইন্সটল করবো
            req_path = None
            for root, dirs, files in os.walk(user_dir):
                if "requirements.txt" in files:
                    req_path = os.path.join(root, "requirements.txt")
                    break
            
            if req_path:
                try:
                    subprocess.run(["pip", "install", "-r", req_path], cwd=os.path.dirname(req_path), check=False)
                except: pass
                
        except Exception as e:
            return jsonify({"error": f"Zip Error: {str(e)}"}), 500

    return jsonify({"message": "Upload successful!"})

# 📂 অ্যাপ লিস্ট
@app.route('/my_apps', methods=['POST'])
def my_apps():
    username = request.json.get('username')
    user_path = os.path.join(UPLOAD_FOLDER, username)
    if not os.path.exists(user_path): return jsonify({"apps": []})
    
    apps = []
    for app_name in os.listdir(user_path):
        full_path = os.path.join(user_path, app_name)
        if os.path.isdir(full_path):
            key = f"{username}_{app_name}"
            # স্ট্যাটাস চেক
            running = key in running_processes and running_processes[key].poll() is None
            
            # লগ পড়া
            logs = ""
            log_path = os.path.join(full_path, "logs.txt")
            if os.path.exists(log_path):
                try:
                    with open(log_path, 'r', errors='ignore') as f:
                        f.seek(0, 2) # ফাইলের শেষে যাওয়া
                        size = f.tell()
                        f.seek(max(size - 3000, 0)) # শেষ ৩০০০ ক্যারেক্টার পড়া
                        logs = f.read()
                except: logs = "Error reading logs"
                
            apps.append({"name": app_name, "running": running, "logs": logs})
            
    return jsonify({"apps": apps})

# ▶️ অ্যাকশন (Start/Stop/Delete)
@app.route('/action', methods=['POST'])
def action():
    data = request.json
    act = data.get('action')
    username = data.get('username')
    app_name = data.get('app_name')
    
    key = f"{username}_{app_name}"
    app_dir = os.path.join(UPLOAD_FOLDER, username, app_name)
    
    if act == "start":
        if key in running_processes and running_processes[key].poll() is None:
            return jsonify({"message": "Already running!"})
            
        # ফাইল খোঁজা (মেইন ফিক্স)
        script_path, script_dir = find_main_script(app_dir)
        
        if not script_path:
            return jsonify({"error": "No python file found!"}), 404
            
        # লগ ফাইল তৈরি
        log_file = open(os.path.join(app_dir, "logs.txt"), "a")
        
        # কমান্ড চালানো (পাথ এরর ফিক্স)
        # আমরা script_dir এ ঢুকে শুধু ফাইলের নাম কল করবো
        script_filename = os.path.basename(script_path)
        
        try:
            proc = subprocess.Popen(
                ["python3", "-u", script_filename], # -u মানে আনবাফারড (রিয়েলটাইম লগ)
                cwd=script_dir, # এই ফোল্ডার থেকে রান হবে
                stdout=log_file,
                stderr=log_file,
                text=True
            )
            running_processes[key] = proc
            return jsonify({"message": "Bot Started!"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif act == "stop":
        if key in running_processes:
            p = running_processes[key]
            p.terminate()
            try: p.wait(timeout=2)
            except: p.kill()
            del running_processes[key]
            return jsonify({"message": "Stopped!"})
        return jsonify({"error": "Not running"})

    elif act == "delete":
        if key in running_processes:
            try:
                running_processes[key].kill()
                del running_processes[key]
            except: pass
        if os.path.exists(app_dir):
            shutil.rmtree(app_dir)
            return jsonify({"message": "Deleted!"})
        return jsonify({"error": "Not found"})

    return jsonify({"error": "Invalid action"}), 400

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
