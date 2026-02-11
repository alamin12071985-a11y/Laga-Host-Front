# --- START OF FILE app.py ---

import os
import sys
import shutil
import zipfile
import subprocess
import sqlite3
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
# সব ডোমেইন থেকে এক্সেস এলাউ করা হলো (CORS Fix)
CORS(app, resources={r"/*": {"origins": "*"}})

app.secret_key = "super_secret_laga_key_v4"
UPLOAD_FOLDER = "user_uploads"
DB_NAME = "lagahost.db"

# ফোল্ডার তৈরি না থাকলে বানিয়ে নেবে
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# রানিং প্রসেস স্টোর করার জন্য
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

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

# --- স্মার্ট ফাইল ফাইন্ডার (Smart Search Engine) ---
def find_bot_file(folder_path):
    """
    এই ফাংশনটি ফোল্ডারের গভীরে গিয়ে মেইন ফাইল খুঁজে বের করবে।
    """
    priority_files = ["main.py", "app.py", "bot.py", "index.py", "start.py"]
    
    # ১. প্রথমে রুট ফোল্ডারে চেক করবে
    for f in priority_files:
        if os.path.exists(os.path.join(folder_path, f)):
            return os.path.join(folder_path, f), folder_path
            
    # ২. যদি না পায়, সব ফোল্ডারের ভেতরে খুঁজবে
    for root, dirs, files in os.walk(folder_path):
        if "__pycache__" in root or ".git" in root: continue
        
        # প্রয়োরিটি ফাইল খুঁজবে
        for f in priority_files:
            if f in files:
                return os.path.join(root, f), root
        
        # না পেলে যেকোনো .py ফাইল খুঁজবে
        for f in files:
            if f.endswith(".py"):
                return os.path.join(root, f), root
                
    return None, None

# --- API ROUTES ---

@app.route('/')
def home():
    return jsonify({
        "status": "Running",
        "message": "LagaHost V4 Backend is Live!",
        "author": "LagaTech"
    })

# 1. রেজিস্টার
@app.route('/register', methods=['POST'])
def register():
    data = request.json
    u = data.get('username')
    p = data.get('password')
    if not u or not p: return jsonify({"error": "Missing fields"}), 400
    
    try:
        conn = get_db()
        conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", 
                     (u, generate_password_hash(p)))
        conn.commit()
        return jsonify({"message": "Success"})
    except:
        return jsonify({"error": "Username taken"}), 409
    finally:
        conn.close()

# 2. লগিন
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (data.get('username'),)).fetchone()
    conn.close()
    
    if user and check_password_hash(user['password'], data.get('password')):
        return jsonify({"message": "Login successful", "username": user['username']})
    return jsonify({"error": "Wrong credentials"}), 401

# 3. ফাইল আপলোড (FIXED)
@app.route('/upload', methods=['POST'])
def upload():
    username = request.form.get('username')
    if not username: return jsonify({"error": "No username provided"}), 400
    
    if 'file' not in request.files:
        return jsonify({"error": "No file sent"}), 400
        
    file = request.files['file']
    filename = secure_filename(file.filename)
    
    # ফাইল এক্সটেনশন চেক (Case Insensitive Fix)
    ext = os.path.splitext(filename)[1].lower()
    
    if ext not in ['.zip', '.py']:
        print(f"Rejected File: {filename}") # সার্ভার লগে দেখাবে
        return jsonify({"error": f"Invalid file type: {ext}. Only .zip or .py allowed!"}), 400
        
    app_name = os.path.splitext(filename)[0] # নামের এক্সটেনশন বাদ দিয়ে অ্যাপ নেম
    user_dir = os.path.join(UPLOAD_FOLDER, username, app_name)
    
    # আগের ফাইল ক্লিন করা
    if os.path.exists(user_dir):
        try: shutil.rmtree(user_dir)
        except: pass
    os.makedirs(user_dir, exist_ok=True)
    
    save_path = os.path.join(user_dir, filename)
    file.save(save_path)
    
    # ZIP এক্সট্রাক্ট লজিক
    if ext == '.zip':
        try:
            with zipfile.ZipFile(save_path, 'r') as z:
                z.extractall(user_dir)
            os.remove(save_path) # জিপ ফাইল ডিলিট
            
            # requirements.txt ইন্সটল করা
            req_path = None
            for root, dirs, files in os.walk(user_dir):
                if "requirements.txt" in files:
                    req_path = os.path.join(root, "requirements.txt")
                    break
            
            if req_path:
                print(f"Installing requirements for {app_name}...")
                subprocess.run([sys.executable, "-m", "pip", "install", "-r", req_path], 
                             cwd=os.path.dirname(req_path), check=False)
                             
        except Exception as e:
            return jsonify({"error": f"Zip failed: {str(e)}"}), 500
            
    return jsonify({"message": "Upload & Setup Successful!"})

# 4. অ্যাপ লিস্ট দেখা
@app.route('/my_apps', methods=['POST'])
def my_apps():
    username = request.json.get('username')
    user_path = os.path.join(UPLOAD_FOLDER, username)
    
    if not os.path.exists(user_path): return jsonify({"apps": []})
    
    apps = []
    for app_name in os.listdir(user_path):
        full_path = os.path.join(user_path, app_name)
        if os.path.isdir(full_path):
            pid = f"{username}_{app_name}"
            
            # স্ট্যাটাস চেক
            is_running = False
            if pid in running_processes:
                if running_processes[pid].poll() is None:
                    is_running = True
                else:
                    del running_processes[pid] # মরে গেলে লিস্ট থেকে বাদ
            
            # লগ পড়া
            logs = "Waiting for logs..."
            log_file = os.path.join(full_path, "logs.txt")
            if os.path.exists(log_file):
                try:
                    with open(log_file, 'r', errors='ignore') as f:
                        f.seek(0, 2)
                        size = f.tell()
                        f.seek(max(size - 4000, 0)) # শেষ ৪০০০ অক্ষর
                        logs = f.read()
                except: pass
                
            apps.append({"name": app_name, "running": is_running, "logs": logs})
            
    return jsonify({"apps": apps})

# 5. একশন (Start/Stop/Delete)
@app.route('/action', methods=['POST'])
def action():
    data = request.json
    act = data.get('action')
    usr = data.get('username')
    app = data.get('app_name')
    
    pid = f"{usr}_{app}"
    app_dir = os.path.join(UPLOAD_FOLDER, usr, app)
    
    if act == "start":
        if pid in running_processes and running_processes[pid].poll() is None:
            return jsonify({"message": "Already Running!"})
            
        script_path, script_dir = find_bot_file(app_dir)
        
        if not script_path:
            return jsonify({"error": "No 'main.py' or python file found!"}), 404
            
        log_file = open(os.path.join(app_dir, "logs.txt"), "a")
        
        try:
            # Smart Command Execution
            proc = subprocess.Popen(
                [sys.executable, "-u", os.path.basename(script_path)],
                cwd=script_dir,
                stdout=log_file,
                stderr=log_file,
                text=True
            )
            running_processes[pid] = proc
            return jsonify({"message": "Bot Started Successfully!"})
        except Exception as e:
            return jsonify({"error": f"Start failed: {str(e)}"}), 500

    elif act == "stop":
        if pid in running_processes:
            p = running_processes[pid]
            p.terminate()
            try: p.wait(timeout=2)
            except: p.kill()
            del running_processes[pid]
            return jsonify({"message": "Stopped!"})
        return jsonify({"error": "Not running"})

    elif act == "delete":
        if pid in running_processes:
            try:
                running_processes[pid].kill()
                del running_processes[pid]
            except: pass
            
        if os.path.exists(app_dir):
            shutil.rmtree(app_dir)
            return jsonify({"message": "Deleted!"})
        return jsonify({"error": "Not found"})

    return jsonify({"error": "Bad Request"}), 400

if __name__ == "__main__":
    # Render এর জন্য পোর্ট ডায়নামিক রাখতে হয়
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
