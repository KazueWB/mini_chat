import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.utils import secure_filename

import database

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = "super-secret-zalo-messenger-key-2026"
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "static", "uploads")
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB max upload

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Initialize and seed database on startup
database.init_db()
database.seed_db()

# Helper to get current user ID
def get_current_user_id():
    user_id = session.get("user_id")
    if not user_id:
        req_user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
        if req_user_id:
            try:
                user_id = int(req_user_id)
            except ValueError:
                user_id = 1
        else:
            user_id = 1  # Default to Nguyễn Văn An
    return user_id

# ----------------- WEB ROUTES -----------------
@app.route("/")
@app.route("/index.html")
def index():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "mini-chat"})

# ----------------- AUTH & USER APIS -----------------
@app.route("/api/me", methods=["GET"])
def get_me():
    user_id = get_current_user_id()
    conn = database.get_db()
    user = conn.execute("SELECT id, username, display_name, avatar_url, status, bio FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user:
        return jsonify(dict(user))
    return jsonify({"error": "User not found"}), 404

@app.route("/api/users", methods=["GET"])
def get_users():
    conn = database.get_db()
    users = conn.execute("SELECT id, username, display_name, avatar_url, status, bio, last_seen FROM users ORDER BY display_name ASC").fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

@app.route("/api/switch-user", methods=["POST"])
def switch_user():
    data = request.get_json() or {}
    user_id = data.get("user_id")
    conn = database.get_db()
    user = conn.execute("SELECT id, username, display_name, avatar_url, status, bio FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user:
        session["user_id"] = user["id"]
        return jsonify({"success": True, "user": dict(user)})
    return jsonify({"error": "User not found"}), 404

@app.route("/api/status", methods=["POST"])
def update_status():
    user_id = get_current_user_id()
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

# ----------------- CONVERSATION APIS -----------------
@app.route("/api/conversations", methods=["GET"])
def get_conversations():
    user_id = get_current_user_id()
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
        conv["last_message"] = json.loads(conv["last_message_json"]) if conv["last_message_json"] else None
        del conv["last_message_json"]

        # If direct conversation, get the other participant's name & avatar
        if conv["type"] == "direct":
            other = conn.execute("""
                SELECT u.id, u.display_name, u.avatar_url, u.status, u.bio, u.last_seen
                FROM participants p2
                JOIN users u ON p2.user_id = u.id
                WHERE p2.conversation_id = ? AND p2.user_id != ?
            """, (conv["id"], user_id)).fetchone()
            if other:
                conv["other_user"] = dict(other)
                conv["name"] = other["display_name"]
                conv["avatar_url"] = other["avatar_url"]
                conv["status"] = other["status"]
            else:
                conv["other_user"] = None
        else:
            # Group participants count
            cnt = conn.execute("SELECT COUNT(*) as cnt FROM participants WHERE conversation_id = ?", (conv["id"],)).fetchone()["cnt"]
            conv["members_count"] = cnt
            conv["status"] = "group"

        results.append(conv)

    conn.close()
    return jsonify(results)

@app.route("/api/conversations", methods=["POST"])
def create_conversation():
    user_id = get_current_user_id()
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
        
        # Check if 1-1 conversation already exists
        existing = conn.execute("""
            SELECT c.id FROM conversations c
            JOIN participants p1 ON c.id = p1.conversation_id AND p1.user_id = ?
            JOIN participants p2 ON c.id = p2.conversation_id AND p2.user_id = ?
            WHERE c.type = 'direct'
        """, (user_id, other_id)).fetchone()
        
        if existing:
            conn.close()
            return jsonify({"id": existing["id"], "existing": True})

        cursor = conn.cursor()
        cursor.execute("INSERT INTO conversations (type, created_by) VALUES ('direct', ?)", (user_id,))
        conv_id = cursor.lastrowid
        cursor.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'admin')", (conv_id, user_id))
        cursor.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'member')", (conv_id, other_id))
        conn.commit()
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
        
        # Add creator
        cursor.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'admin')", (conv_id, user_id))
        
        # Add other members
        for mid in member_ids:
            if mid != user_id:
                cursor.execute("INSERT INTO participants (conversation_id, user_id, role) VALUES (?, ?, 'member')", (conv_id, mid))
        
        # Insert system greeting
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
    conn = database.get_db()

    # Check participation
    part = conn.execute("SELECT * FROM participants WHERE conversation_id = ? AND user_id = ?", (conv_id, user_id)).fetchone()
    if not part:
        conn.close()
        return jsonify({"error": "Not a participant"}), 403

    # Update last read message
    last_msg = conn.execute("SELECT MAX(id) as max_id FROM messages WHERE conversation_id = ?", (conv_id,)).fetchone()
    if last_msg and last_msg["max_id"]:
        conn.execute("UPDATE participants SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", (last_msg["max_id"], conv_id, user_id))
        conn.commit()

    query = """
    SELECT 
        m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
        m.media_url, m.media_name, m.media_size, m.reply_to_id, m.is_recalled, m.created_at,
        u.display_name as sender_name, u.avatar_url as sender_avatar,
        (
            SELECT json_object(
                'id', rm.id,
                'content', rm.content,
                'sender_name', ru.display_name,
                'message_type', rm.message_type,
                'is_recalled', rm.is_recalled
            )
            FROM messages rm
            JOIN users ru ON rm.sender_id = ru.id
            WHERE rm.id = m.reply_to_id
        ) as reply_json
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
    ORDER BY m.id ASC
    """
    rows = conn.execute(query, (conv_id,)).fetchall()
    
    # Get reactions for all messages
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

    # Get pinned messages
    pinned_rows = conn.execute("""
        SELECT pm.message_id, m.content, m.sender_id, u.display_name as sender_name, pm.pinned_at
        FROM pinned_messages pm
        JOIN messages m ON pm.message_id = m.id
        JOIN users u ON m.sender_id = u.id
        WHERE pm.conversation_id = ?
    """, (conv_id,)).fetchall()
    pinned_list = [dict(p) for p in pinned_rows]

    # Get conversation details & participants
    conv_info = conn.execute("SELECT id, type, name, avatar_url FROM conversations WHERE id = ?", (conv_id,)).fetchone()
    participants = conn.execute("""
        SELECT u.id, u.display_name, u.avatar_url, u.status, u.bio, p.role
        FROM participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.conversation_id = ?
    """, (conv_id,)).fetchall()

    messages = []
    for r in rows:
        msg = dict(r)
        msg["reply_to"] = json.loads(msg["reply_json"]) if msg["reply_json"] else None
        del msg["reply_json"]
        msg["reactions"] = rx_map.get(msg["id"], [])
        messages.append(msg)

    conn.close()
    return jsonify({
        "conversation": dict(conv_info),
        "participants": [dict(p) for p in participants],
        "pinned": pinned_list,
        "messages": messages
    })

@app.route("/api/conversations/<int:conv_id>/messages", methods=["POST"])
def send_message_rest(conv_id):
    user_id = get_current_user_id()
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

    # Update conversation updated_at
    conn.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conv_id,))
    # Update last_read for sender
    conn.execute("UPDATE participants SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", (msg_id, conv_id, user_id))
    conn.commit()

    # Fetch full message
    msg = conn.execute("""
        SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
               m.media_url, m.media_name, m.media_size, m.reply_to_id, m.is_recalled, m.created_at,
               u.display_name as sender_name, u.avatar_url as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
    """, (msg_id,)).fetchone()
    
    msg_dict = dict(msg)
    msg_dict["reactions"] = []
    
    if reply_to_id:
        rm = conn.execute("""
            SELECT rm.id, rm.content, ru.display_name as sender_name, rm.message_type, rm.is_recalled
            FROM messages rm
            JOIN users ru ON rm.sender_id = ru.id
            WHERE rm.id = ?
        """, (reply_to_id,)).fetchone()
        msg_dict["reply_to"] = dict(rm) if rm else None
    else:
        msg_dict["reply_to"] = None

    conn.close()

    # Broadcast via SocketIO
    socketio.emit("new_message", msg_dict, room=f"conv_{conv_id}")
    return jsonify(msg_dict)

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    file_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
    file.save(file_path)

    # Determine type
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ["jpg", "jpeg", "png", "gif", "webp", "svg"]:
        ftype = "image"
    elif ext in ["mp3", "wav", "ogg", "webm", "m4a"]:
        ftype = "audio"
    else:
        ftype = "file"

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
    data = request.get_json() or {}
    emoji = data.get("emoji")
    if not emoji:
        return jsonify({"error": "Emoji is required"}), 400

    conn = database.get_db()
    msg = conn.execute("SELECT conversation_id FROM messages WHERE id = ?", (msg_id,)).fetchone()
    if not msg:
        conn.close()
        return jsonify({"error": "Message not found"}), 404

    # Check if user already reacted with this emoji (toggle)
    existing = conn.execute("SELECT * FROM reactions WHERE message_id = ? AND user_id = ?", (msg_id, user_id)).fetchone()
    if existing and existing["emoji"] == emoji:
        conn.execute("DELETE FROM reactions WHERE message_id = ? AND user_id = ?", (msg_id, user_id))
        action = "removed"
    else:
        conn.execute("""
            INSERT INTO reactions (message_id, user_id, emoji)
            VALUES (?, ?, ?)
            ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji
        """, (msg_id, user_id, emoji))
        action = "added"
    
    conn.commit()

    # Get updated reactions
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
    conn = database.get_db()
    
    # Toggle pin
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
@socketio.on("join")
def on_join(data):
    user_id = data.get("user_id")
    conv_id = data.get("conversation_id")
    if conv_id:
        room = f"conv_{conv_id}"
        join_room(room)
    if user_id:
        join_room(f"user_{user_id}")

@socketio.on("leave")
def on_leave(data):
    conv_id = data.get("conversation_id")
    if conv_id:
        room = f"conv_{conv_id}"
        leave_room(room)

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
    # Relays WebRTC signaling / call state (offer, answer, ice-candidate, end-call, start-call)
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
    print(f"Starting Zalo/Messenger Realtime Server on port {port} ...")
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
