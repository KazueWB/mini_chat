import os
import json
import uuid
import threading
from datetime import datetime, date
from flask import Flask, render_template, request, jsonify, session, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.utils import secure_filename
import cloudinary
import cloudinary.uploader

import database

# Cấu hình Cloudinary (Lưu trữ ảnh, video, tệp đính kèm trên cloud)
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "pvxzafdu")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "446727777933341")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "d0u4aImxcf2JP_8QAwaVg6aF1jg")

cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET,
    secure=True
)

class CustomJSON:
    @staticmethod
    def dumps(*args, **kwargs):
        def default(o):
            if isinstance(o, datetime):
                return o.strftime("%Y-%m-%dT%H:%M:%SZ")
            if isinstance(o, date):
                return o.strftime("%Y-%m-%d")
            return str(o)
        kwargs["default"] = default
        return json.dumps(*args, **kwargs)

    @staticmethod
    def loads(*args, **kwargs):
        return json.loads(*args, **kwargs)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = "super-secret-chat-together-key-2026"
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "static", "uploads")
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB max upload

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", json=CustomJSON)

# Initialize and seed database on startup
database.init_db()
database.seed_db()
try:
    _conn = database.get_db()
    _conn.execute("UPDATE users SET status = 'offline'")
    _conn.commit()
    _conn.close()
except Exception as _e:
    pass

# Helper to safely parse json string or dict (PostgreSQL vs SQLite)
def parse_json_or_dict(val):
    if not val:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return None

def format_datetime_utc(dt_val):
    if not dt_val:
        return ""
    if hasattr(dt_val, "strftime"):
        return dt_val.strftime("%Y-%m-%dT%H:%M:%SZ")
    s = str(dt_val).strip()
    if s and not s.endswith("Z") and not ("+" in s[10:] or "-" in s[10:]):
        return s.replace(" ", "T") + "Z"
    return s

# Helper to get current user ID
def get_current_user_id():
    user_id = session.get("user_id")
    if not user_id:
        req_user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
        if req_user_id:
            try:
                user_id = int(req_user_id)
            except ValueError:
                user_id = None
    return user_id

# Helper to ensure 1-1 conversation exists
def ensure_direct_conversation(conn, u1, u2):
    existing = conn.execute("""
        SELECT c.id FROM conversations c
        JOIN participants p1 ON c.id = p1.conversation_id AND p1.user_id = ?
        JOIN participants p2 ON c.id = p2.conversation_id AND p2.user_id = ?
        WHERE c.type = 'direct'
    """, (u1, u2)).fetchone()
    
    if existing:
        return existing["id"]

    cursor = conn.execute("INSERT INTO conversations (type, created_by) VALUES ('direct', ?)", (u1,))
    conv_id = cursor.lastrowid
    conn.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'admin')", (conv_id, u1))
    conn.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'member')", (conv_id, u2))
    conn.execute("""
        INSERT INTO messages (conversation_id, sender_id, content, message_type)
        VALUES (?, ?, 'Hai bạn đã kết nối thành công. Hãy bắt đầu trò chuyện nhé! 🎉', 'system')
    """, (conv_id, u1))
    conn.commit()
    return conv_id

# ----------------- WEB ROUTES -----------------
@app.route("/")
@app.route("/index.html")
def index():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "mini-chat"})

@app.route("/api/me", methods=["GET"])
def get_me():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"authenticated": False}), 200
        
    conn = database.get_db()
    # Khi user truy cập web thì cập nhật trạng thái online và thời gian hoạt động ngay lập tức
    conn.execute("UPDATE users SET status = 'online', last_seen = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
    conn.commit()
    user = conn.execute("SELECT id, username, phone, display_name, avatar_url, status, bio, dob, gender, last_seen, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user:
        res = dict(user)
        res["status"] = "online"
        if res.get("created_at"):
            res["created_at"] = format_datetime_utc(res["created_at"])
        if res.get("last_seen"):
            res["last_seen"] = format_datetime_utc(res["last_seen"])
        res["authenticated"] = True
        return jsonify(res)
    return jsonify({"authenticated": False}), 200

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json() or {}
    username = data.get("username", "").strip().lower()
    phone = data.get("phone", "").strip()
    display_name = data.get("display_name", "").strip()
    password = data.get("password", "").strip()

    if not username or not display_name or not password:
        return jsonify({"error": "Vui lòng nhập tên đăng nhập, họ tên và mật khẩu!"}), 400

    conn = database.get_db()
    exist_user = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if exist_user:
        conn.close()
        return jsonify({"error": "Tên đăng nhập này đã được sử dụng!"}), 400

    if phone:
        exist_phone = conn.execute("SELECT id FROM users WHERE phone = ?", (phone,)).fetchone()
        if exist_phone:
            conn.close()
            return jsonify({"error": "Số điện thoại này đã được đăng ký!"}), 400

    avatar_url = data.get("avatar_url") or f"https://api.dicebear.com/7.x/bottts/svg?seed={username}&backgroundColor=b6e3f4,ffd5dc,c0aede"
    
    cur = conn.execute("""
        INSERT INTO users (username, phone, password, display_name, avatar_url, status, bio)
        VALUES (?, ?, ?, ?, ?, 'online', 'Thành viên mới tham gia!')
    """, (username, phone or None, password, display_name, avatar_url))
    user_id = cur.lastrowid
    conn.commit()

    user = conn.execute("SELECT id, username, phone, display_name, avatar_url, status, bio FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()

    session["user_id"] = user_id
    user_dict = dict(user)
    user_dict["authenticated"] = True
    return jsonify({"success": True, "user": user_dict})

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json() or {}
    login_id = data.get("login_id", "").strip().lower()
    password = data.get("password", "").strip()

    if not login_id or not password:
        return jsonify({"error": "Vui lòng nhập Tên đăng nhập / Số điện thoại và Mật khẩu!"}), 400

    conn = database.get_db()
    user = conn.execute("""
        SELECT id, username, phone, display_name, avatar_url, status, bio, dob, gender, password, created_at, last_seen
        FROM users
        WHERE (LOWER(username) = ? OR phone = ?)
    """, (login_id, login_id)).fetchone()
    conn.close()

    if not user or user["password"] != password:
        return jsonify({"error": "Tài khoản hoặc mật khẩu không chính xác!"}), 400

    session["user_id"] = user["id"]
    conn = database.get_db()
    conn.execute("UPDATE users SET status = 'online', last_seen = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))
    conn.commit()
    conn.close()

    user_dict = dict(user)
    del user_dict["password"]
    user_dict["status"] = "online"
    if user_dict.get("created_at"):
        user_dict["created_at"] = format_datetime_utc(user_dict["created_at"])
    if user_dict.get("last_seen"):
        user_dict["last_seen"] = format_datetime_utc(user_dict["last_seen"])
    user_dict["authenticated"] = True
    return jsonify({"success": True, "user": user_dict})

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    user_id = get_current_user_id()
    if user_id:
        user_connected_sids.pop(user_id, None)
        try:
            conn = database.get_db()
            conn.execute("UPDATE users SET status = 'offline', last_seen = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
            conn.commit()
            row = conn.execute("SELECT last_seen FROM users WHERE id = ?", (user_id,)).fetchone()
            conn.close()
            last_seen_val = format_datetime_utc(row["last_seen"]) if row else format_datetime_utc(datetime.utcnow())
            socketio.emit("user_status_changed", {
                "user_id": user_id,
                "status": "offline",
                "last_seen": last_seen_val
            })
        except Exception as e:
            pass
    session.clear()
    return jsonify({"success": True})

@app.route("/api/switch-user", methods=["POST"])
def switch_user():
    data = request.get_json() or {}
    user_id = data.get("user_id")
    conn = database.get_db()
    user = conn.execute("SELECT id, username, phone, display_name, avatar_url, status, bio, dob, gender FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user:
        session["user_id"] = user["id"]
        res = dict(user)
        res["authenticated"] = True
        return jsonify({"success": True, "user": res})
    return jsonify({"error": "User not found"}), 404

@app.route("/api/status", methods=["POST"])
def update_status():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    status = data.get("status", "online")
    bio = data.get("bio")
    
    conn = database.get_db()
    if bio is not None:
        conn.execute("UPDATE users SET status = ?, bio = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?", (status, bio, user_id))
    else:
        conn.execute("UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?", (status, user_id))
    conn.commit()
    conn.close()
    
    socketio.emit("user_status_changed", {"user_id": user_id, "status": status, "bio": bio})
    return jsonify({"success": True, "status": status})

# ----------------- USER PROFILE APIS -----------------
@app.route("/api/users/<int:target_user_id>/profile", methods=["GET"])
def get_user_profile(target_user_id):
    current_uid = get_current_user_id()
    conn = database.get_db()
    user = conn.execute("""
        SELECT id, username, phone, display_name, avatar_url, status, bio, dob, gender, last_seen, created_at
        FROM users WHERE id = ?
    """, (target_user_id,)).fetchone()
    
    if not user:
        conn.close()
        return jsonify({"error": "Người dùng không tồn tại"}), 404
        
    u_dict = dict(user)
    if u_dict.get("created_at"):
        u_dict["created_at"] = format_datetime_utc(u_dict["created_at"])
    if u_dict.get("last_seen"):
        u_dict["last_seen"] = format_datetime_utc(u_dict["last_seen"])

    if current_uid == target_user_id:
        u_dict["is_me"] = True
        u_dict["status"] = "online"
        u_dict["friendship_status"] = "self"
    elif current_uid:
        u_dict["is_me"] = False
        f = conn.execute("""
            SELECT id, sender_id, receiver_id, status FROM friendships
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        """, (current_uid, target_user_id, target_user_id, current_uid)).fetchone()
        if not f:
            u_dict["friendship_status"] = "none"
        elif f["status"] == "accepted":
            u_dict["friendship_status"] = "accepted"
        elif f["sender_id"] == current_uid:
            u_dict["friendship_status"] = "pending_sent"
        else:
            u_dict["friendship_status"] = "pending_received"
            u_dict["request_id"] = f["id"]
    else:
        u_dict["is_me"] = False
        u_dict["friendship_status"] = "none"

    conn.close()
    return jsonify(u_dict)

@app.route("/api/profile/update", methods=["POST"])
def update_profile():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    conn = database.get_db()
    current_user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not current_user:
        conn.close()
        return jsonify({"error": "Người dùng không tồn tại"}), 404

    # Keep existing values if not explicitly provided
    display_name = data.get("display_name", current_user["display_name"]).strip() if "display_name" in data else current_user["display_name"]
    if not display_name:
        conn.close()
        return jsonify({"error": "Tên hiển thị không được để trống"}), 400

    bio = data.get("bio", current_user["bio"] or "").strip() if "bio" in data else (current_user["bio"] or "")
    dob = data.get("dob", current_user["dob"] or "").strip() if "dob" in data else (current_user["dob"] or "")
    gender = data.get("gender", current_user["gender"] or "unspecified").strip() if "gender" in data else (current_user["gender"] or "unspecified")
    avatar_url = data.get("avatar_url", current_user["avatar_url"]).strip() if "avatar_url" in data else current_user["avatar_url"]

    phone = current_user["phone"] or None
    if "phone" in data:
        new_phone = data.get("phone", "").strip()
        if new_phone:
            exist = conn.execute("SELECT id FROM users WHERE phone = ? AND id != ?", (new_phone, user_id)).fetchone()
            if exist:
                conn.close()
                return jsonify({"error": "Số điện thoại này đã được sử dụng bởi tài khoản khác"}), 400
            phone = new_phone
        else:
            phone = None

    try:
        conn.execute("""
            UPDATE users SET display_name = ?, bio = ?, dob = ?, gender = ?, phone = ?, avatar_url = ?
            WHERE id = ?
        """, (display_name, bio, dob, gender, phone, avatar_url, user_id))
        conn.commit()
    except Exception as e:
        conn.close()
        print("[ERROR update_profile]:", e)
        return jsonify({"error": f"Lỗi cập nhật: {str(e)}"}), 500

    updated_user = conn.execute("""
        SELECT id, username, phone, display_name, avatar_url, status, bio, dob, gender, last_seen, created_at
        FROM users WHERE id = ?
    """, (user_id,)).fetchone()
    conn.close()

    u_dict = dict(updated_user)
    if u_dict.get("created_at"):
        u_dict["created_at"] = format_datetime_utc(u_dict["created_at"])
    if u_dict.get("last_seen"):
        u_dict["last_seen"] = format_datetime_utc(u_dict["last_seen"])

    socketio.emit("user_profile_updated", {
        "user_id": user_id,
        "display_name": display_name,
        "avatar_url": u_dict["avatar_url"],
        "bio": bio,
        "dob": dob,
        "gender": gender,
        "phone": phone
    })

    return jsonify({"success": True, "user": u_dict})

# ----------------- FRIEND MANAGEMENT APIS -----------------
@app.route("/api/friends/search", methods=["GET"])
def search_friends():
    user_id = get_current_user_id()
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    conn = database.get_db()
    q_like = f"%{q}%"
    users = conn.execute("""
        SELECT id, username, phone, display_name, avatar_url, status, bio
        FROM users
        WHERE id != ? AND (phone = ? OR phone LIKE ? OR LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)
        LIMIT 20
    """, (user_id or 0, q, q_like, q_like.lower(), q_like.lower())).fetchall()

    results = []
    for u in users:
        item = dict(u)
        if user_id:
            f = conn.execute("""
                SELECT id, sender_id, receiver_id, status
                FROM friendships
                WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            """, (user_id, item["id"], item["id"], user_id)).fetchone()

            if not f:
                item["friendship_status"] = "none"
                item["request_id"] = None
            elif f["status"] == "accepted":
                item["friendship_status"] = "accepted"
                item["request_id"] = f["id"]
            elif f["sender_id"] == user_id and f["status"] == "pending":
                item["friendship_status"] = "pending_sent"
                item["request_id"] = f["id"]
            elif f["receiver_id"] == user_id and f["status"] == "pending":
                item["friendship_status"] = "pending_received"
                item["request_id"] = f["id"]
            else:
                item["friendship_status"] = "none"
                item["request_id"] = None
        else:
            item["friendship_status"] = "none"
            item["request_id"] = None

        results.append(item)

    conn.close()
    return jsonify(results)

@app.route("/api/friends/request", methods=["POST"])
def send_friend_request():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    target_user_id = data.get("target_user_id")
    if not target_user_id or target_user_id == user_id:
        return jsonify({"error": "Người dùng không hợp lệ"}), 400

    conn = database.get_db()
    exist = conn.execute("""
        SELECT * FROM friendships
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    """, (user_id, target_user_id, target_user_id, user_id)).fetchone()

    if exist:
        if exist["status"] == "accepted":
            conn.close()
            return jsonify({"status": "accepted", "message": "Đã là bạn bè"})
        if exist["sender_id"] == target_user_id and exist["status"] == "pending":
            conn.execute("UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (exist["id"],))
            conn.commit()
            conv_id = ensure_direct_conversation(conn, user_id, target_user_id)
            conn.close()
            socketio.emit("friend_request_accepted", {"user_id": user_id, "conversation_id": conv_id}, room=f"user_{target_user_id}")
            return jsonify({"status": "accepted", "conversation_id": conv_id})
        conn.close()
        return jsonify({"status": exist["status"]})

    cursor = conn.execute("""
        INSERT INTO friendships (sender_id, receiver_id, status)
        VALUES (?, ?, 'pending')
    """, (user_id, target_user_id))
    req_id = cursor.lastrowid
    conn.commit()

    sender = conn.execute("SELECT id, display_name, avatar_url, phone FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()

    socketio.emit("friend_request_received", {
        "request_id": req_id,
        "sender": dict(sender)
    }, room=f"user_{target_user_id}")

    return jsonify({"status": "pending_sent", "request_id": req_id})

@app.route("/api/friends/requests", methods=["GET"])
def get_friend_requests():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify([])

    conn = database.get_db()
    rows = conn.execute("""
        SELECT f.id as request_id, f.created_at,
               u.id as user_id, u.display_name, u.avatar_url, u.phone, u.bio, u.status
        FROM friendships f
        JOIN users u ON f.sender_id = u.id
        WHERE f.receiver_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
    """, (user_id,)).fetchall()
    conn.close()
    res = []
    for r in rows:
        item = dict(r)
        if item.get("created_at"):
            item["created_at"] = format_datetime_utc(item["created_at"])
        res.append(item)
    return jsonify(res)

@app.route("/api/friends/respond", methods=["POST"])
def respond_friend_request():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    request_id = data.get("request_id")
    action = data.get("action")  # 'accept' or 'decline'

    conn = database.get_db()
    req = conn.execute("SELECT * FROM friendships WHERE id = ? AND receiver_id = ?", (request_id, user_id)).fetchone()
    if not req:
        conn.close()
        return jsonify({"error": "Lời mời không tồn tại hoặc đã xử lý"}), 404

    sender_id = req["sender_id"]
    if action == "accept":
        conn.execute("UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (request_id,))
        conn.commit()
        conv_id = ensure_direct_conversation(conn, user_id, sender_id)
        conn.close()

        socketio.emit("friend_request_accepted", {"user_id": user_id, "conversation_id": conv_id}, room=f"user_{sender_id}")
        return jsonify({"success": True, "action": "accept", "conv_id": conv_id})
    else:
        conn.execute("DELETE FROM friendships WHERE id = ?", (request_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "action": "decline"})

@app.route("/api/friends", methods=["GET"])
def get_friends():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify([])

    conn = database.get_db()
    query = """
    SELECT u.id, u.username, u.phone, u.display_name, u.avatar_url, u.status, u.bio, u.last_seen
    FROM users u
    JOIN friendships f ON (
        (f.sender_id = ? AND f.receiver_id = u.id) OR 
        (f.receiver_id = ? AND f.sender_id = u.id)
    )
    WHERE f.status = 'accepted'
    ORDER BY u.display_name ASC
    """
    rows = conn.execute(query, (user_id, user_id)).fetchall()
    conn.close()
    res = []
    for r in rows:
        item = dict(r)
        if item.get("last_seen"):
            item["last_seen"] = format_datetime_utc(item["last_seen"])
        res.append(item)
    return jsonify(res)

@app.route("/api/users", methods=["GET"])
def get_users():
    conn = database.get_db()
    users = conn.execute("SELECT id, username, phone, display_name, avatar_url, status, bio, last_seen FROM users ORDER BY display_name ASC").fetchall()
    conn.close()
    res = []
    for u in users:
        item = dict(u)
        if item.get("last_seen"):
            item["last_seen"] = format_datetime_utc(item["last_seen"])
        res.append(item)
    return jsonify(res)

# ----------------- CONVERSATION APIS -----------------
@app.route("/api/conversations", methods=["GET"])
def get_conversations():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify([])

    conn = database.get_db()
    query = """
    SELECT 
        c.id, c.type, c.name, c.avatar_url, c.created_at, c.updated_at,
        p.role, p.last_read_message_id,
        (
            SELECT json_object(
                'id', m.id,
                'content', m.content,
                'message_type', m.message_type,
                'sender_id', m.sender_id,
                'is_recalled', m.is_recalled,
                'created_at', m.created_at
            )
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.id DESC LIMIT 1
        ) as last_message_json,
        (
            SELECT COUNT(*) 
            FROM messages m2 
            WHERE m2.conversation_id = c.id AND m2.id > p.last_read_message_id AND m2.sender_id != ?
        ) as unread_count
    FROM conversations c
    JOIN participants p ON c.id = p.conversation_id
    WHERE p.user_id = ?
    ORDER BY c.updated_at DESC
    """
    
    rows = conn.execute(query, (user_id, user_id)).fetchall()
    results = []

    for row in rows:
        conv = dict(row)
        conv["last_message"] = parse_json_or_dict(conv["last_message_json"])
        del conv["last_message_json"]
        if conv["last_message"] and conv["last_message"].get("created_at"):
            conv["last_message"]["created_at"] = format_datetime_utc(conv["last_message"]["created_at"])

        if conv["type"] == "direct":
            other = conn.execute("""
                SELECT u.id, u.display_name, u.avatar_url, u.status, u.bio, u.last_seen, p2.nickname
                FROM participants p2
                JOIN users u ON p2.user_id = u.id
                WHERE p2.conversation_id = ? AND p2.user_id != ?
            """, (conv["id"], user_id)).fetchone()
            if other:
                conv["other_user"] = dict(other)
                if conv["other_user"].get("last_seen"):
                    conv["other_user"]["last_seen"] = format_datetime_utc(conv["other_user"]["last_seen"])
                nick = (other["nickname"] or "").strip()
                conv["other_user"]["nickname"] = nick
                conv["other_user"]["original_display_name"] = other["display_name"]
                conv["name"] = nick if nick else other["display_name"]
                conv["avatar_url"] = other["avatar_url"]
                conv["status"] = other["status"]
                conv["last_seen"] = conv["other_user"].get("last_seen", "")
            else:
                conv["other_user"] = None
        else:
            cnt = conn.execute("SELECT COUNT(*) as cnt FROM participants WHERE conversation_id = ?", (conv["id"],)).fetchone()["cnt"]
            conv["members_count"] = cnt
            conv["status"] = "group"

        results.append(conv)

    conn.close()
    return jsonify(results)

@app.route("/api/conversations", methods=["POST"])
def create_conversation():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    conv_type = data.get("type", "direct")
    member_ids = data.get("members", [])
    name = data.get("name")
    
    conn = database.get_db()
    
    if conv_type == "direct":
        if not member_ids:
            conn.close()
            return jsonify({"error": "Member ID is required"}), 400
        other_id = member_ids[0]
        
        conv_id = ensure_direct_conversation(conn, user_id, other_id)
        conn.close()
        return jsonify({"id": conv_id, "type": "direct"})
    
    elif conv_type == "group":
        if not name:
            conn.close()
            return jsonify({"error": "Group name is required"}), 400
        
        avatar_url = data.get("avatar_url") or f"https://api.dicebear.com/7.x/identicon/svg?seed={name}&backgroundColor=b6e3f4"
        cursor = conn.cursor()
        cursor.execute("INSERT INTO conversations (type, name, avatar_url, created_by) VALUES ('group', ?, ?, ?)", (name, avatar_url, user_id))
        conv_id = cursor.lastrowid
        
        cursor.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'admin')", (conv_id, user_id))
        
        for mid in member_ids:
            if mid != user_id:
                cursor.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'member')", (conv_id, mid))
        
        cursor.execute("""
            INSERT INTO messages (conversation_id, sender_id, content, message_type)
            VALUES (?, ?, ?, 'system')
        """, (conv_id, user_id, f"Nhóm '{name}' đã được tạo."))
        
        conn.commit()
        conn.close()
        return jsonify({"id": conv_id, "type": "group", "name": name, "avatar_url": avatar_url})

    conn.close()
    return jsonify({"error": "Invalid type"}), 400

# ----------------- MESSAGE APIS -----------------
@app.route("/api/conversations/<int:conv_id>/messages", methods=["GET"])
def get_messages(conv_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = database.get_db()

    part = conn.execute("SELECT * FROM participants WHERE conversation_id = ? AND user_id = ?", (conv_id, user_id)).fetchone()
    if not part:
        conn.close()
        return jsonify({"error": "Not a participant"}), 403

    last_msg = conn.execute("SELECT MAX(id) as max_id FROM messages WHERE conversation_id = ?", (conv_id,)).fetchone()
    if last_msg and last_msg["max_id"]:
        conn.execute("UPDATE participants SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", (last_msg["max_id"], conv_id, user_id))
        conn.commit()

    query = """
    SELECT 
        m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
        m.media_url, m.media_name, m.media_size, m.reply_to_id, m.is_recalled, m.created_at,
        p_sender.nickname as sender_nickname,
        u.display_name as sender_original_name,
        CASE 
            WHEN p_sender.nickname IS NOT NULL AND TRIM(p_sender.nickname) != '' THEN p_sender.nickname 
            ELSE u.display_name 
        END as sender_name,
        u.avatar_url as sender_avatar,
        (
            SELECT json_object(
                'id', rm.id,
                'content', rm.content,
                'sender_name', CASE 
                    WHEN rp.nickname IS NOT NULL AND TRIM(rp.nickname) != '' THEN rp.nickname 
                    ELSE ru.display_name 
                END,
                'message_type', rm.message_type,
                'is_recalled', rm.is_recalled
            )
            FROM messages rm
            JOIN users ru ON rm.sender_id = ru.id
            LEFT JOIN participants rp ON rm.conversation_id = rp.conversation_id AND rm.sender_id = rp.user_id
            WHERE rm.id = m.reply_to_id
        ) as reply_json
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    LEFT JOIN participants p_sender ON m.conversation_id = p_sender.conversation_id AND m.sender_id = p_sender.user_id
    WHERE m.conversation_id = ?
    ORDER BY m.id ASC
    """
    rows = conn.execute(query, (conv_id,)).fetchall()
    
    reactions_rows = conn.execute("""
        SELECT r.message_id, r.user_id, r.emoji, u.display_name
        FROM reactions r
        JOIN users u ON r.user_id = u.id
        WHERE r.message_id IN (SELECT id FROM messages WHERE conversation_id = ?)
    """, (conv_id,)).fetchall()
    
    rx_map = {}
    for r in reactions_rows:
        mid = r["message_id"]
        if mid not in rx_map:
            rx_map[mid] = []
        rx_map[mid].append({"user_id": r["user_id"], "emoji": r["emoji"], "display_name": r["display_name"]})

    pinned_rows = conn.execute("""
        SELECT pm.message_id, m.content, m.sender_id, u.display_name as sender_name, pm.pinned_at
        FROM pinned_messages pm
        JOIN messages m ON pm.message_id = m.id
        JOIN users u ON m.sender_id = u.id
        WHERE pm.conversation_id = ?
    """, (conv_id,)).fetchall()
    pinned_list = []
    for p in pinned_rows:
        pd = dict(p)
        if pd.get("pinned_at"):
            pd["pinned_at"] = format_datetime_utc(pd["pinned_at"])
        pinned_list.append(pd)

    conv_info = conn.execute("SELECT id, type, name, avatar_url FROM conversations WHERE id = ?", (conv_id,)).fetchone()
    participants = conn.execute("""
        SELECT u.id, u.display_name, u.avatar_url, u.status, u.bio, u.last_seen, p.role, p.nickname
        FROM participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.conversation_id = ?
    """, (conv_id,)).fetchall()
    
    participants_list = []
    for p in participants:
        pd = dict(p)
        if pd.get("last_seen"):
            pd["last_seen"] = format_datetime_utc(pd["last_seen"])
        nick = (pd.get("nickname") or "").strip()
        pd["nickname"] = nick
        pd["original_display_name"] = pd["display_name"]
        pd["effective_name"] = nick if nick else pd["display_name"]
        participants_list.append(pd)

    friendship_info = None
    if conv_info["type"] == "direct":
        other_part = [p for p in participants_list if p["id"] != user_id]
        if other_part:
            other_id = other_part[0]["id"]
            f_row = conn.execute("""
                SELECT status, created_at, updated_at FROM friendships
                WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            """, (user_id, other_id, other_id, user_id)).fetchone()
            if f_row and f_row["status"] == "accepted":
                friended_time = f_row["updated_at"] or f_row["created_at"]
                friendship_info = {
                    "status": "accepted",
                    "friended_at": format_datetime_utc(friended_time)
                }
            elif f_row:
                friendship_info = {
                    "status": f_row["status"],
                    "friended_at": None
                }
            else:
                friendship_info = {
                    "status": "none",
                    "friended_at": None
                }

    messages = []
    for r in rows:
        msg = dict(r)
        if msg.get("created_at"):
            msg["created_at"] = format_datetime_utc(msg["created_at"])
        msg["reply_to"] = parse_json_or_dict(msg["reply_json"])
        del msg["reply_json"]
        msg["reactions"] = rx_map.get(msg["id"], [])
        messages.append(msg)

    conn.close()
    return jsonify({
        "conversation": dict(conv_info),
        "participants": participants_list,
        "pinned": pinned_list,
        "messages": messages,
        "friendship_info": friendship_info
    })

@app.route("/api/conversations/<int:conv_id>/messages", methods=["POST"])
def send_message_rest(conv_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    content = data.get("content", "").strip()
    message_type = data.get("message_type", "text")
    media_url = data.get("media_url")
    media_name = data.get("media_name")
    media_size = data.get("media_size")
    reply_to_id = data.get("reply_to_id")

    if not content and not media_url:
        return jsonify({"error": "Message is empty"}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO messages (conversation_id, sender_id, content, message_type, media_url, media_name, media_size, reply_to_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (conv_id, user_id, content, message_type, media_url, media_name, media_size, reply_to_id))
    msg_id = cursor.lastrowid

    conn.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conv_id,))
    conn.execute("UPDATE participants SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", (msg_id, conv_id, user_id))
    conn.commit()

    msg = conn.execute("""
        SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
               m.media_url, m.media_name, m.media_size, m.reply_to_id, m.is_recalled, m.created_at,
               CASE 
                   WHEN p.nickname IS NOT NULL AND TRIM(p.nickname) != '' THEN p.nickname 
                   ELSE u.display_name 
               END as sender_name,
               p.nickname as sender_nickname,
               u.display_name as sender_original_name,
               u.avatar_url as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN participants p ON m.conversation_id = p.conversation_id AND m.sender_id = p.user_id
        WHERE m.id = ?
    """, (msg_id,)).fetchone()
    
    msg_dict = dict(msg)
    if msg_dict.get("created_at"):
        msg_dict["created_at"] = format_datetime_utc(msg_dict["created_at"])

    msg_dict["reactions"] = []
    
    if reply_to_id:
        rm = conn.execute("""
            SELECT rm.id, rm.content, 
                   CASE 
                       WHEN rp.nickname IS NOT NULL AND TRIM(rp.nickname) != '' THEN rp.nickname 
                       ELSE ru.display_name 
                   END as sender_name,
                   rm.message_type, rm.is_recalled
            FROM messages rm
            JOIN users ru ON rm.sender_id = ru.id
            LEFT JOIN participants rp ON rm.conversation_id = rp.conversation_id AND rm.sender_id = rp.user_id
            WHERE rm.id = ?
        """, (reply_to_id,)).fetchone()
        msg_dict["reply_to"] = dict(rm) if rm else None
    else:
        msg_dict["reply_to"] = None

    participants = conn.execute("SELECT user_id FROM participants WHERE conversation_id = ?", (conv_id,)).fetchall()
    conn.close()

    # Realtime emit to conversation room (all active chatters receive the new message)
    socketio.emit("new_message", msg_dict, room=f"conv_{conv_id}")
    # Realtime notify other participants' personal rooms so their sidebar updates
    for p in participants:
        if p["user_id"] != user_id:
            socketio.emit("conversation_updated", {
                "conversation_id": conv_id,
                "last_message": msg_dict
            }, room=f"user_{p['user_id']}")

    return jsonify(msg_dict)

# ----------------- NICKNAME APIS -----------------
@app.route("/api/conversations/<int:conv_id>/nicknames", methods=["POST"])
def update_nickname(conv_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    target_user_id = data.get("target_user_id")
    new_nickname = (data.get("nickname") or "").strip()

    if not target_user_id:
        return jsonify({"error": "Target user ID is required"}), 400

    conn = database.get_db()

    # Verify actor is participant
    actor_part = conn.execute("""
        SELECT p.nickname, u.display_name 
        FROM participants p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.conversation_id = ? AND p.user_id = ?
    """, (conv_id, user_id)).fetchone()
    if not actor_part:
        conn.close()
        return jsonify({"error": "Not a participant"}), 403

    # Verify target is participant
    target_part = conn.execute("""
        SELECT p.nickname, u.display_name 
        FROM participants p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.conversation_id = ? AND p.user_id = ?
    """, (conv_id, target_user_id)).fetchone()
    if not target_part:
        conn.close()
        return jsonify({"error": "Target user not in conversation"}), 404

    conn.execute("UPDATE participants SET nickname = ? WHERE conversation_id = ? AND user_id = ?", (new_nickname, conv_id, target_user_id))

    actor_nickname = (actor_part["nickname"] or "").strip()
    actor_name = actor_nickname if actor_nickname else actor_part["display_name"]
    target_orig_name = target_part["display_name"]

    if new_nickname:
        if user_id == target_user_id:
            sys_content = f'{actor_name} đã tự đặt biệt danh cho mình là "{new_nickname}".'
        else:
            sys_content = f'{actor_name} đã đặt biệt danh cho {target_orig_name} là "{new_nickname}".'
    else:
        if user_id == target_user_id:
            sys_content = f'{actor_name} đã gỡ biệt danh của chính mình.'
        else:
            sys_content = f'{actor_name} đã gỡ biệt danh cho {target_orig_name}.'

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO messages (conversation_id, sender_id, content, message_type)
        VALUES (?, ?, ?, 'system')
    """, (conv_id, user_id, sys_content))
    msg_id = cursor.lastrowid
    conn.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conv_id,))
    conn.commit()

    sys_msg = conn.execute("""
        SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
               m.media_url, m.media_name, m.media_size, m.reply_to_id, m.is_recalled, m.created_at,
               u.display_name as sender_name, u.avatar_url as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
    """, (msg_id,)).fetchone()
    sys_msg_dict = dict(sys_msg)
    if sys_msg_dict.get("created_at"):
        sys_msg_dict["created_at"] = format_datetime_utc(sys_msg_dict["created_at"])
    sys_msg_dict["reactions"] = []
    sys_msg_dict["reply_to"] = None

    participants_rows = conn.execute("SELECT user_id FROM participants WHERE conversation_id = ?", (conv_id,)).fetchall()
    conn.close()

    # Emit new message to conversation room
    socketio.emit("new_message", sys_msg_dict, room=f"conv_{conv_id}")

    # Emit nickname_updated event to conversation room
    socketio.emit("nickname_updated", {
        "conversation_id": conv_id,
        "target_user_id": target_user_id,
        "nickname": new_nickname,
        "actor_id": user_id
    }, room=f"conv_{conv_id}")

    # Emit conversation_updated to each participant user room
    for p in participants_rows:
        socketio.emit("conversation_updated", {
            "conversation_id": conv_id,
            "last_message": sys_msg_dict,
            "nickname_change": {
                "target_user_id": target_user_id,
                "nickname": new_nickname
            }
        }, room=f"user_{p['user_id']}")

    return jsonify({
        "success": True,
        "conversation_id": conv_id,
        "target_user_id": target_user_id,
        "nickname": new_nickname
    })

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"]:
        ftype = "image"
    elif ext in ["mp4", "webm", "mov", "avi", "mkv"]:
        ftype = "video"
    elif ext in ["mp3", "wav", "ogg", "m4a"]:
        ftype = "audio"
    else:
        ftype = "file"

    try:
        # Tải file trực tiếp lên Cloudinary (tự động nhận diện image, video, audio hoặc raw document)
        upload_result = cloudinary.uploader.upload(
            file,
            resource_type="auto",
            folder="chat_together"
        )
        url = upload_result.get("secure_url") or upload_result.get("url")
        size_bytes = upload_result.get("bytes", 0)

        # Phân loại bổ sung dựa theo Cloudinary
        cld_res_type = upload_result.get("resource_type")
        if cld_res_type == "video" and ftype == "file":
            ftype = "video"
        elif cld_res_type == "image" and ftype == "file":
            ftype = "image"

        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

        return jsonify({
            "url": url,
            "name": filename,
            "type": ftype,
            "size": size_str
        })
    except Exception as e:
        print("[Cloudinary Upload Error, fallback to local storage]:", e)
        unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
        file.seek(0)
        file.save(file_path)

        size_bytes = os.path.getsize(file_path)
        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

        return jsonify({
            "url": f"/static/uploads/{unique_name}",
            "name": filename,
            "type": ftype,
            "size": size_str
        })

@app.route("/api/messages/<int:msg_id>/react", methods=["POST"])
def react_message(msg_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    emoji = data.get("emoji")
    if not emoji:
        return jsonify({"error": "Emoji is required"}), 400

    conn = database.get_db()
    msg = conn.execute("SELECT conversation_id FROM messages WHERE id = ?", (msg_id,)).fetchone()
    if not msg:
        conn.close()
        return jsonify({"error": "Message not found"}), 404

    existing = conn.execute("SELECT * FROM reactions WHERE message_id = ? AND user_id = ?", (msg_id, user_id)).fetchone()
    if existing and existing["emoji"] == emoji:
        conn.execute("DELETE FROM reactions WHERE message_id = ? AND user_id = ?", (msg_id, user_id))
    else:
        conn.execute("""
            INSERT INTO reactions (message_id, user_id, emoji)
            VALUES (?, ?, ?)
            ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji
        """, (msg_id, user_id, emoji))
    
    conn.commit()

    reactions_rows = conn.execute("""
        SELECT r.message_id, r.user_id, r.emoji, u.display_name
        FROM reactions r
        JOIN users u ON r.user_id = u.id
        WHERE r.message_id = ?
    """, (msg_id,)).fetchall()
    conn.close()

    payload = {
        "message_id": msg_id,
        "conversation_id": msg["conversation_id"],
        "reactions": [dict(r) for r in reactions_rows]
    }
    socketio.emit("reaction_updated", payload, room=f"conv_{msg['conversation_id']}")
    return jsonify(payload)

@app.route("/api/messages/<int:msg_id>/recall", methods=["POST"])
def recall_message(msg_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = database.get_db()
    msg = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
    if not msg:
        conn.close()
        return jsonify({"error": "Message not found"}), 404
    if msg["sender_id"] != user_id:
        conn.close()
        return jsonify({"error": "Unauthorized"}), 403

    conn.execute("UPDATE messages SET is_recalled = 1, content = 'Tin nhắn đã được thu hồi' WHERE id = ?", (msg_id,))
    conn.commit()
    conn.close()

    payload = {
        "message_id": msg_id,
        "conversation_id": msg["conversation_id"]
    }
    socketio.emit("message_recalled", payload, room=f"conv_{msg['conversation_id']}")
    return jsonify({"success": True})

@app.route("/api/conversations/<int:conv_id>/pin/<int:msg_id>", methods=["POST"])
def pin_message(conv_id, msg_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = database.get_db()
    existing = conn.execute("SELECT * FROM pinned_messages WHERE conversation_id = ? AND message_id = ?", (conv_id, msg_id)).fetchone()
    if existing:
        conn.execute("DELETE FROM pinned_messages WHERE conversation_id = ? AND message_id = ?", (conv_id, msg_id))
        action = "unpinned"
    else:
        conn.execute("INSERT INTO pinned_messages (conversation_id, message_id, pinned_by) VALUES (?, ?, ?)", (conv_id, msg_id, user_id))
        action = "pinned"
    
    conn.commit()

    pinned_rows = conn.execute("""
        SELECT pm.message_id, m.content, m.sender_id, u.display_name as sender_name, pm.pinned_at
        FROM pinned_messages pm
        JOIN messages m ON pm.message_id = m.id
        JOIN users u ON m.sender_id = u.id
        WHERE pm.conversation_id = ?
    """, (conv_id,)).fetchall()
    conn.close()

    payload = {
        "conversation_id": conv_id,
        "action": action,
        "pinned": [dict(p) for p in pinned_rows]
    }
    socketio.emit("pin_updated", payload, room=f"conv_{conv_id}")
    return jsonify(payload)

# ----------------- SOCKET.IO REALTIME EVENTS -----------------
sid_to_user = {}
user_connected_sids = {}

def check_user_offline(uid):
    if uid not in user_connected_sids or len(user_connected_sids[uid]) == 0:
        user_connected_sids.pop(uid, None)
        try:
            conn = database.get_db()
            conn.execute("UPDATE users SET status = 'offline', last_seen = CURRENT_TIMESTAMP WHERE id = ?", (uid,))
            conn.commit()
            row = conn.execute("SELECT last_seen FROM users WHERE id = ?", (uid,)).fetchone()
            conn.close()
            last_seen_val = format_datetime_utc(row["last_seen"]) if row else format_datetime_utc(datetime.utcnow())
            socketio.emit("user_status_changed", {
                "user_id": uid,
                "status": "offline",
                "last_seen": last_seen_val
            })
        except Exception as e:
            print("[Presence] Error setting offline:", e)

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    user_id = sid_to_user.pop(sid, None)
    if user_id:
        sids = user_connected_sids.get(user_id, set())
        sids.discard(sid)
        if len(sids) == 0:
            timer = threading.Timer(2.0, check_user_offline, args=[user_id])
            timer.daemon = True
            timer.start()

@socketio.on("join")
def on_join(data):
    user_id = data.get("user_id")
    conv_id = data.get("conversation_id")
    if conv_id:
        join_room(f"conv_{conv_id}")
    if user_id:
        try:
            uid = int(user_id)
            join_room(f"user_{uid}")
            sid = request.sid
            sid_to_user[sid] = uid
            was_offline = (uid not in user_connected_sids or len(user_connected_sids[uid]) == 0)
            if uid not in user_connected_sids:
                user_connected_sids[uid] = set()
            user_connected_sids[uid].add(sid)

            if was_offline:
                conn = database.get_db()
                conn.execute("UPDATE users SET status = 'online', last_seen = CURRENT_TIMESTAMP WHERE id = ?", (uid,))
                conn.commit()
                row = conn.execute("SELECT last_seen FROM users WHERE id = ?", (uid,)).fetchone()
                conn.close()
                last_seen_val = format_datetime_utc(row["last_seen"]) if row else format_datetime_utc(datetime.utcnow())
                socketio.emit("user_status_changed", {
                    "user_id": uid,
                    "status": "online",
                    "last_seen": last_seen_val
                })
        except Exception as e:
            print("[Presence] Error on join:", e)

@socketio.on("heartbeat")
def on_heartbeat(data):
    user_id = data.get("user_id")
    if user_id:
        try:
            uid = int(user_id)
            conn = database.get_db()
            conn.execute("UPDATE users SET status = 'online', last_seen = CURRENT_TIMESTAMP WHERE id = ?", (uid,))
            conn.commit()
            conn.close()
        except Exception as e:
            pass

@socketio.on("leave")
def on_leave(data):
    conv_id = data.get("conversation_id")
    if conv_id:
        leave_room(f"conv_{conv_id}")

@socketio.on("typing")
def on_typing(data):
    conv_id = data.get("conversation_id")
    user_id = data.get("user_id")
    display_name = data.get("display_name")
    if conv_id and user_id:
        emit("typing", {"user_id": user_id, "display_name": display_name, "conversation_id": conv_id}, room=f"conv_{conv_id}", include_self=False)

@socketio.on("stop_typing")
def on_stop_typing(data):
    conv_id = data.get("conversation_id")
    user_id = data.get("user_id")
    if conv_id and user_id:
        emit("stop_typing", {"user_id": user_id, "conversation_id": conv_id}, room=f"conv_{conv_id}", include_self=False)

@socketio.on("call_signal")
def on_call_signal(data):
    conv_id = data.get("conversation_id")
    target_user_id = data.get("target_user_id")
    if target_user_id:
        emit("call_signal", data, room=f"user_{target_user_id}")
    elif conv_id:
        emit("call_signal", data, room=f"conv_{conv_id}", include_self=False)

if __name__ == "__main__":
    database.init_db()
    database.seed_db()
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Chat Together Web Realtime Server on port {port} ...")
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
