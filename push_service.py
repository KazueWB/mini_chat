import os
import json
import base64
import threading
from py_vapid import Vapid
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException
import database

VAPID_FILE = os.path.join(os.path.dirname(__file__), "vapid_keys.json")
DEFAULT_CLAIMS_EMAIL = "mailto:admin@chattogether.local"

_cached_keys = None

def get_or_create_vapid_keys():
    global _cached_keys
    if _cached_keys:
        return _cached_keys

    # Kiểm tra biến môi trường trước
    env_pub = os.environ.get("VAPID_PUBLIC_KEY")
    env_priv = os.environ.get("VAPID_PRIVATE_KEY")
    claims_email = os.environ.get("VAPID_CLAIMS_EMAIL") or DEFAULT_CLAIMS_EMAIL

    if env_pub and env_priv:
        _cached_keys = {
            "public_key": env_pub,
            "private_key_pem": env_priv,
            "claims_email": claims_email
        }
        return _cached_keys

    # Kiểm tra file vapid_keys.json
    if os.path.exists(VAPID_FILE):
        try:
            with open(VAPID_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "public_key" in data and "private_key_pem" in data:
                    _cached_keys = data
                    return _cached_keys
        except Exception as e:
            print("[PushService] Error reading vapid_keys.json:", e)

    # Nếu chưa có, tự động sinh mới
    print("[PushService] Generating new VAPID keypair...")
    v = Vapid()
    v.generate_keys()

    raw_pub = v.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    b64_pub = base64.urlsafe_b64encode(raw_pub).decode("utf-8").rstrip("=")

    pem_priv = v.private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")

    keys_data = {
        "public_key": b64_pub,
        "private_key_pem": pem_priv,
        "claims_email": claims_email
    }

    try:
        with open(VAPID_FILE, "w", encoding="utf-8") as f:
            json.dump(keys_data, f, indent=2)
        print("[PushService] Saved new VAPID keys to vapid_keys.json")
    except Exception as e:
        print("[PushService] Failed to save vapid_keys.json:", e)

    _cached_keys = keys_data
    return _cached_keys

def get_public_key():
    keys = get_or_create_vapid_keys()
    return keys["public_key"]

def save_subscription(user_id, sub_data):
    endpoint = sub_data.get("endpoint")
    keys = sub_data.get("keys", {})
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not endpoint or not p256dh or not auth:
        return False

    conn = database.get_db()
    try:
        # Xóa các bản ghi cũ của endpoint này (nếu có user khác từng dùng trên trình duyệt này)
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        conn.execute(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)",
            (user_id, endpoint, p256dh, auth)
        )
        conn.commit()
        return True
    except Exception as e:
        print("[PushService] Error saving subscription:", e)
        return False
    finally:
        conn.close()

def remove_subscription(endpoint):
    if not endpoint:
        return
    conn = database.get_db()
    try:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        conn.commit()
    except Exception as e:
        print("[PushService] Error removing subscription:", e)
    finally:
        conn.close()

def _send_to_sub(endpoint, p256dh, auth, payload_str, vapid_keys):
    sub_info = {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth
        }
    }
    try:
        webpush(
            subscription_info=sub_info,
            data=payload_str,
            vapid_private_key=vapid_keys["private_key_pem"],
            vapid_claims={"sub": vapid_keys["claims_email"]},
            ttl=60  # tồn tại 60s trên push server
        )
        return True
    except WebPushException as ex:
        # Nếu thiết bị đã hết hạn (404 / 410), xóa khỏi DB
        status_code = getattr(ex.response, "status_code", None) if hasattr(ex, "response") else None
        print(f"[PushService] WebPushException (status={status_code}): {ex}")
        if status_code in (404, 410):
            remove_subscription(endpoint)
        return False
    except Exception as e:
        print(f"[PushService] Push error for {endpoint[:30]}...: {e}")
        return False

def send_push_to_user(user_id, title, body, icon=None, data=None, actions=None, require_interaction=False, silent=False):
    """
    Gửi thông báo đẩy bất đồng bộ (background thread) tới tất cả các thiết bị đã đăng ký của user_id.
    Chạy khi người dùng tắt web hoặc ẩn tab, chỉ cần có Wifi/4G là thiết bị sẽ nhận được.
    """
    keys = get_or_create_vapid_keys()

    payload = {
        "title": title,
        "body": body,
        "icon": icon or "/static/img/icon-192.png",
        "badge": "/static/img/icon-192.png",
        "data": data or {},
        "actions": actions or [],
        "requireInteraction": require_interaction,
        "silent": silent
    }

    if require_interaction:
        # Kiểu rung chuông gọi điện dài
        payload["vibrate"] = [400, 200, 400, 200, 800, 400, 800]
        payload["tag"] = f"call_{data.get('conv_id', 'general')}"
        payload["renotify"] = True
    else:
        # Rung thông báo tin nhắn ngắn
        payload["vibrate"] = [150, 80, 150]
        payload["tag"] = f"msg_{data.get('conv_id', 'general')}"

    payload_str = json.dumps(payload, ensure_ascii=False)

    def worker():
        conn = database.get_db()
        try:
            rows = conn.execute(
                "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
                (user_id,)
            ).fetchall()
        except Exception as e:
            print("[PushService] Error querying subscriptions:", e)
            rows = []
        finally:
            conn.close()

        if not rows:
            return

        for row in rows:
            _send_to_sub(row["endpoint"], row["p256dh"], row["auth"], payload_str, keys)

    t = threading.Thread(target=worker, daemon=True)
    t.start()
