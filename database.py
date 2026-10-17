import os
import json
import sqlite3
from datetime import datetime

# Neon PostgreSQL Connection URL
NEON_DB_URL = "postgresql://neondb_owner:npg_SpNcHg1vM0Ko@ep-quiet-lake-b42fo9ae-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SQL_chat") or NEON_DB_URL

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False

class CursorWrapper:
    def __init__(self, cur, lastrowid=None):
        self.cur = cur
        self.lastrowid = lastrowid

    def fetchone(self):
        return self.cur.fetchone()

    def fetchall(self):
        return self.cur.fetchall()

    def __iter__(self):
        return iter(self.cur)

class PGConnWrapper:
    def __init__(self, conn):
        self.conn = conn
        self._last_cur = None
        self.lastrowid = None

    def execute(self, query, params=None):
        cur = self.conn.cursor(cursor_factory=RealDictCursor)
        q = query.replace("?", "%s")
        q = q.replace("json_object", "json_build_object")
        params = tuple(params) if params else ()
        
        is_insert = q.strip().upper().startswith("INSERT") and "RETURNING" not in q.upper()
        if is_insert:
            q += " RETURNING id"
            
        cur.execute(q, params)
        lastrowid = None
        if is_insert:
            try:
                row = cur.fetchone()
                lastrowid = row["id"] if row and "id" in row else None
            except Exception:
                lastrowid = None
                
        self._last_cur = cur
        self.lastrowid = lastrowid
        return CursorWrapper(cur, lastrowid)

    def executemany(self, query, seq_of_params):
        cur = self.conn.cursor(cursor_factory=RealDictCursor)
        q = query.replace("?", "%s")
        q = q.replace("json_object", "json_build_object")
        for params in seq_of_params:
            cur.execute(q, tuple(params))
        self._last_cur = cur
        return CursorWrapper(cur)

    def fetchone(self):
        return self._last_cur.fetchone() if self._last_cur else None

    def fetchall(self):
        return self._last_cur.fetchall() if self._last_cur else []

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

    def cursor(self):
        return self

def get_db():
    if HAS_POSTGRES and DATABASE_URL:
        try:
            raw_conn = psycopg2.connect(DATABASE_URL)
            return PGConnWrapper(raw_conn)
        except Exception as e:
            print("[DB] Warning: Failed to connect to Neon PostgreSQL, falling back to SQLite:", e)

    # SQLite fallback
    db_path = os.path.join(os.path.dirname(__file__), "chat.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    if isinstance(conn, PGConnWrapper):
        cur = conn.conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            avatar_url TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'online',
            bio TEXT DEFAULT '',
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id SERIAL PRIMARY KEY,
            type VARCHAR(20) NOT NULL CHECK(type IN ('direct', 'group')),
            name VARCHAR(255),
            avatar_url TEXT,
            created_by INT REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS participants (
            conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(20) DEFAULT 'member',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_read_message_id INT DEFAULT 0,
            PRIMARY KEY (conversation_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id INT NOT NULL REFERENCES users(id),
            content TEXT,
            message_type VARCHAR(20) DEFAULT 'text',
            media_url TEXT,
            media_name VARCHAR(255),
            media_size VARCHAR(50),
            reply_to_id INT REFERENCES messages(id),
            is_recalled INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reactions (
            id SERIAL PRIMARY KEY,
            message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            emoji VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS pinned_messages (
            id SERIAL PRIMARY KEY,
            conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            pinned_by INT NOT NULL REFERENCES users(id),
            pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(conversation_id, message_id)
        );
        """)
        conn.commit()
        conn.close()
    else:
        # SQLite
        cursor = conn.cursor()
        cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_url TEXT NOT NULL,
            status TEXT DEFAULT 'online',
            bio TEXT DEFAULT '',
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
            name TEXT,
            avatar_url TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS participants (
            conversation_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_read_message_id INTEGER DEFAULT 0,
            PRIMARY KEY (conversation_id, user_id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            content TEXT,
            message_type TEXT DEFAULT 'text',
            media_url TEXT,
            media_name TEXT,
            media_size TEXT,
            reply_to_id INTEGER,
            is_recalled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (reply_to_id) REFERENCES messages(id)
        );
        CREATE TABLE IF NOT EXISTS reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, user_id),
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS pinned_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            pinned_by INTEGER NOT NULL,
            pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(conversation_id, message_id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (pinned_by) REFERENCES users(id)
        );
        """)
        conn.commit()
        conn.close()

def seed_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    row = cursor.fetchone()
    if row["cnt"] > 0:
        conn.close()
        return

    users_data = [
        ("nguyenvana", "123456", "Nguyễn Văn An", "https://api.dicebear.com/7.x/bottts/svg?seed=AnNguyen&backgroundColor=b6e3f4,c0aede,d1d4f9", "online", "Đang làm việc, vui lòng để lại tin nhắn 💻"),
        ("lethimai", "123456", "Lê Thị Mai", "https://api.dicebear.com/7.x/bottts/svg?seed=MaiLe&backgroundColor=ffd5dc,ffdfbf,d1d4f9", "online", "Cà phê sáng cùng bạn bè ☕"),
        ("tranquocbao", "123456", "Trần Quốc Bảo", "https://api.dicebear.com/7.x/bottts/svg?seed=BaoTran&backgroundColor=c0aede,b6e3f4,ffd5dc", "busy", "Học hỏi không ngừng nghỉ 🚀"),
        ("phamthuhuong", "123456", "Phạm Thu Hương", "https://api.dicebear.com/7.x/bottts/svg?seed=HuongPham&backgroundColor=ffdfbf,ffd5dc,b6e3f4", "away", "Sống trọn từng khoảnh khắc ✨"),
        ("dangminhtri", "123456", "Đặng Minh Trí", "https://api.dicebear.com/7.x/bottts/svg?seed=TriDang&backgroundColor=d1d4f9,c0aede,b6e3f4", "online", "Creative Designer & Tech Lover 🎨")
    ]

    cursor.executemany("""
    INSERT INTO users (username, password, display_name, avatar_url, status, bio)
    VALUES (?, ?, ?, ?, ?, ?)
    """, users_data)
    conn.commit()

    conversations_data = [
        ("direct", None, None, 1),
        ("direct", None, None, 1),
        ("direct", None, None, 1),
        ("group", "Team Công Nghệ 4.0 🚀", "https://api.dicebear.com/7.x/identicon/svg?seed=TechTeam&backgroundColor=b6e3f4", 1),
        ("group", "Hội Bạn Thân Cuối Tuần 🍕", "https://api.dicebear.com/7.x/identicon/svg?seed=WeekendSquad&backgroundColor=ffd5dc", 2)
    ]

    for conv in conversations_data:
        cursor.execute("""
        INSERT INTO conversations (type, name, avatar_url, created_by)
        VALUES (?, ?, ?, ?)
        """, conv)

    participants_data = [
        (1, 1, 'admin'), (1, 2, 'member'),
        (2, 1, 'admin'), (2, 3, 'member'),
        (3, 1, 'admin'), (3, 4, 'member'),
        (4, 1, 'admin'), (4, 2, 'member'), (4, 3, 'member'), (4, 4, 'member'), (4, 5, 'member'),
        (5, 2, 'admin'), (5, 1, 'member'), (5, 4, 'member')
    ]
    cursor.executemany("""
    INSERT INTO participants (conversation_id, user_id, role)
    VALUES (?, ?, ?)
    """, participants_data)

    sample_messages = [
        (1, 2, "Chào anh An! Bản thiết kế giao diện ứng dụng nhắn tin mới đã hoàn thiện chưa ạ?", "text", None, None, None, None, "2026-10-17 09:15:00"),
        (1, 1, "Chào Mai! Anh vừa cập nhật giao diện Glassmorphism với Dark Mode siêu mượt luôn đó.", "text", None, None, None, None, "2026-10-17 09:16:30"),
        (1, 1, "Em xem qua ảnh chụp màn hình này nhé, chuẩn phong cách Zalo & Messenger luôn!", "text", None, None, None, None, "2026-10-17 09:17:00"),
        (1, 2, "Woa nhìn xịn sò quá anh ơi! Có hỗ trợ gọi điện video với icon cảm xúc không anh? 😍", "text", None, None, None, None, "2026-10-17 09:18:20"),
        (1, 1, "Có đầy đủ em nhé! Đầy đủ voice call, video call, thả tim, gửi hình ảnh và file đính kèm tức thì 🚀", "text", None, None, None, None, "2026-10-17 09:19:10"),
        (2, 3, "Anh An ơi, chiều nay 3h team mình họp rà soát tiến độ dự án nhé anh.", "text", None, None, None, None, "2026-10-17 08:30:00"),
        (2, 1, "OK Bảo nhé, anh chuẩn bị xong slide demo rồi.", "text", None, None, None, None, "2026-10-17 08:45:00"),
        (3, 4, "Anh An gửi em tài liệu hướng dẫn sử dụng hệ thống với nha!", "text", None, None, None, None, "2026-10-16 17:00:00"),
        (3, 1, "Đã gửi qua email và ghim trong nhóm Công nghệ rồi nhé em ơi 👍", "text", None, None, None, None, "2026-10-16 17:15:00"),
        (4, 1, "Chào cả nhà! Chào mừng mọi người đến với nền tảng nhắn tin thế hệ mới Zalo-Messenger Web 🎉", "text", None, None, None, None, "2026-10-17 08:00:00"),
        (4, 5, "Chào anh An và mọi người! UI mới nhìn bắt mắt và trực quan thực sự!", "text", None, None, None, None, "2026-10-17 08:05:00"),
        (4, 2, "Hệ thống hỗ trợ WebSocket thời gian thực siêu nhanh luôn ạ, gõ phím là thấy typing liền!", "text", None, None, None, None, "2026-10-17 08:10:00"),
        (4, 3, "Tuyệt vời! Nhớ ghim thông báo lịch demo tuần này lên thanh đầu nhóm nha sếp An.", "text", None, None, None, None, "2026-10-17 08:12:00"),
        (4, 1, "📌 LỊCH DEMO: Thứ 6 tuần này lúc 15:00, tất cả thành viên có mặt đầy đủ nhé!", "text", None, None, None, None, "2026-10-17 08:15:00"),
        (5, 2, "Cuối tuần này ai rảnh đi ăn pizza và trà sữa không nè? 🍕🧋", "text", None, None, None, None, "2026-10-16 20:00:00"),
        (5, 4, "Em đi với! Đặt bàn ở The Pizza Company Landmark 81 nha chị Mai!", "text", None, None, None, None, "2026-10-16 20:05:00"),
        (5, 1, "Duyệt luôn nha cả nhà, 18h30 thứ 7 gặp nhau nhé! 🎉", "text", None, None, None, None, "2026-10-16 20:10:00")
    ]

    for msg in sample_messages:
        cursor.execute("""
        INSERT INTO messages (conversation_id, sender_id, content, message_type, media_url, media_name, media_size, reply_to_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, msg)

    cursor.execute("""
    INSERT INTO pinned_messages (conversation_id, message_id, pinned_by)
    VALUES (4, 14, 1)
    """)

    cursor.execute("INSERT INTO reactions (message_id, user_id, emoji) VALUES (1, 1, '❤️')")
    cursor.execute("INSERT INTO reactions (message_id, user_id, emoji) VALUES (4, 1, '🔥')")
    cursor.execute("INSERT INTO reactions (message_id, user_id, emoji) VALUES (10, 2, '🎉')")
    cursor.execute("INSERT INTO reactions (message_id, user_id, emoji) VALUES (10, 3, '👍')")
    cursor.execute("INSERT INTO reactions (message_id, user_id, emoji) VALUES (10, 5, '❤️')")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_db()
    print("Database initialized and seeded successfully on Neon PostgreSQL!")
