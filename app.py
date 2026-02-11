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
MAX_APPS_PER_USER = 3 

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

# স্মার্ট ফাইল ফাইন্ডার (ফোল্ডারের ভেতরে ঢুকে ফাইল খোঁজে)
def find_file_recursive(root_folder, target_filenames):
    for root, dirs, files in os.walk(root_folder):
        for filename in files:
            if filename in target_filenames:
                return os.path.join(root, filename), root
    return None, None

# --- API Routes ---

@app.route('/')
def home():
    return jsonify({"status": "Lagahost Backend is Running!", "version": "2.1 (Smart Fix)"})

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
        
        # ক্লিন ইনস্টল (আগের ফাইল মুছে ফেলা)
        if os.path.exists(user_dir):
            try: shutil.rmtree(user_dir)
            except: pass
        os.makedirs(user_dir, exist_ok=True)
        
        zip_path = os.path.join(user_dir, "app.zip")
        file.save(zip_path)

        # আনজিপ করা
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(user_dir)
        except Exception as e:
            return jsonify({"error": f"Zip extraction failed: {str(e)}"}), 500
        
        # --- ফিক্স: requirements.txt স্মার্টলি খোঁজা ---
        req_path, req_dir = find_file_recursive(user_dir, ["requirements.txt"])
        
        if req_path:
            # যেখানে requirements.txt পাওয়া গেছে, সেখানে pip install চালানো
            try:
                subprocess.run(["pip", "install", "-r", "requirements.txt"], cwd=req_dir, check=False)
            except Exception as e:
                print(f"Pip install error: {e}")

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
            
            # প্রসেস চেক করা
            is_running = False
            if process_key in running_processes:
                if running_processes[process_key].poll() is None:
                    is_running = True
                else:
                    # যদি প্রসেস ক্র্যাশ করে বা বন্ধ হয়ে যায়, ডিকশনারি থেকে মুছে ফেলা
                    del running_processes[process_key]

            # লগ পড়া
            log_content = ""
            log_file = os.path.join(full_path, "logs.txt")
            if os.path.exists(log_file):
                try:
                    with open(log_file, "r", errors="ignore") as f:
                        # ফাইল বেশি বড় হলে শুধু শেষের অংশ পড়া
                        f.seek(0, 2)
                        size = f.tell()
                        f.seek(max(size - 2000, 0))
                        log_content = f.read()
                except:
                    log_content = "Error reading logs."

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
    
    if not username or not app_name:
        return jsonify({"error": "Missing parameters"}), 400

    process_key = f"{username}_{app_name}"
    user_app_path = os.path.join(UPLOAD_FOLDER, username, app_name)

    if action == "start":
        if process_key in running_processes and running_processes[process_key].poll() is None:
             return jsonify({"message": "App is already running"})

        # --- ফিক্স: মেইন ফাইল স্মার্টলি খোঁজা ---
        target_files = ["main.py", "app.py", "bot.py", "index.py"]
        script_path, script_dir = find_file_recursive(user_app_path, target_files)

        if not script_path:
            return jsonify({"error": "No main.py/app.py found in any folder!"}), 404

        # লগ ফাইল অ্যাপের রুট ফোল্ডারে রাখা হবে যাতে ইউজার দেখতে পায়
        log_file_path = os.path.join(user_app_path, "logs.txt")
        log_file = open(log_file_path, "a")
        
        try:
            # সাব-প্রসেস রান করা (সঠিক ডিরেক্টরি থেকে)
            proc = subprocess.Popen(
                ["python3", "-u", script_path], # -u মানে আনবাফারড আউটপুট (লগ রিয়েলটাইম দেখার জন্য)
                cwd=script_dir, # স্ক্রিপ্ট যে ফোল্ডারে আছে, সেখান থেকেই রান হবে
                stdout=log_file,
                stderr=log_file,
                text=True
            )
            running_processes[process_key] = proc
            return jsonify({"message": f"{app_name} Started!"})
        except Exception as e:
            return jsonify({"error": f"Failed to start: {str(e)}"}), 500

    elif action == "stop":
        if process_key in running_processes:
            proc = running_processes[process_key]
            try:
                proc.terminate() # ভদ্রভাবে বন্ধ করা
                # একটু অপেক্ষা করে চেক করা, না হলে ফোর্স কিল
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
            except:
                pass
            
            if process_key in running_processes:
                del running_processes[process_key]
            return jsonify({"message": f"{app_name} Stopped!"})
        return jsonify({"error": "App is not running"})

    elif action == "delete":
        # আগে স্টপ করা
        if process_key in running_processes:
            try:
                running_processes[process_key].kill()
                del running_processes[process_key]
            except: pass
        
        # ফোল্ডার ডিলিট
        if os.path.exists(user_app_path):
            try:
                shutil.rmtree(user_app_path)
                return jsonify({"message": "App deleted successfully"})
            except Exception as e:
                return jsonify({"error": f"Delete failed: {str(e)}"})
        return jsonify({"error": "App not found"})

    return jsonify({"error": "Invalid action"}), 400

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
