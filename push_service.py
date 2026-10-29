import os
import json
import threading
from pywebpush import webpush, WebPushException
import database

# Cặp VAPID Keys cố định chuẩn W3C WebPush dùng chung đồng bộ cho cả Local và Cloud (Render/Railway)
DEFAULT_VAPID_PUBLIC_KEY = "BOulQ8MFwN89VsAp6vtqEnI51o-iV1GlVj0MNILkKbxqTwJSHaVrAsw5-23GcqHsntjhnkkT0DdMRWmIXR5yUb0"
DEFAULT_VAPID_PRIVATE_PEM = """-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgvHNgWbI5By41jyb+
JNS/fD+K7QLgdGt/1FDy0qKV7OOhRANCAATrpUPDBcDfPVbAKer7ahJyOdaPoldR
pVY9DDSC5Cm8ak8CUh2lawLMOfttxnKh7J7Y4Z5JE9A3TEVpiF0eclG9
-----END PRIVATE KEY-----"""
DEFAULT_CLAIMS_EMAIL = "mailto:admin@chattogether.vn"

PEM_FILE_PATH = os.path.join(os.path.dirname(__file__), "vapid_private.pem")

def ensure_pem_file():
    """Đảm bảo file PEM của private key tồn tại trên đĩa để pywebpush đọc trực tiếp"""
    if not os.path.exists(PEM_FILE_PATH):
        try:
            with open(PEM_FILE_PATH, "w", encoding="utf-8") as f:
                f.write(DEFAULT_VAPID_PRIVATE_PEM.strip())
        except Exception as e:
            print("[PushService] Error writing vapid_private.pem:", e)
    return PEM_FILE_PATH

def get_public_key():
    return os.environ.get("VAPID_PUBLIC_KEY") or DEFAULT_VAPID_PUBLIC_KEY

def save_subscription(user_id, sub_data):
    endpoint = sub_data.get("endpoint")
    keys = sub_data.get("keys", {})
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not endpoint or not p256dh or not auth:
        return False

    conn = database.get_db()
    try:
        # Xóa bản ghi cũ nếu endpoint này đã từng đăng ký
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

def _send_to_sub(endpoint, p256dh, auth, payload_str):
    sub_info = {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth
        }
    }
    pem_path = ensure_pem_file()
    claims_email = os.environ.get("VAPID_CLAIMS_EMAIL") or DEFAULT_CLAIMS_EMAIL

    try:
        resp = webpush(
            subscription_info=sub_info,
            data=payload_str,
            vapid_private_key=pem_path,
            vapid_claims={"sub": claims_email},
            ttl=60
        )
        print(f"[PushService] Push sent to {endpoint[:45]}... (Status: {resp.status_code})")
        return True
    except WebPushException as ex:
        status_code = getattr(ex.response, "status_code", None) if hasattr(ex, "response") else None
        print(f"[PushService] WebPushException (status={status_code}): {ex}")
        # Nếu token hết hạn hoặc VAPID không khớp, xóa khỏi DB để client đăng ký lại
        if status_code in (400, 403, 404, 410):
            remove_subscription(endpoint)
        return False
    except Exception as e:
        print(f"[PushService] Push error for {endpoint[:45]}...: {e}")
        return False

def send_push_to_user(user_id, title, body, icon=None, data=None, actions=None, require_interaction=False, silent=False):
    """
    Gửi thông báo đẩy bất đồng bộ (background thread) tới tất cả các thiết bị đã đăng ký của user_id.
    Hoạt động ngay cả khi người dùng tắt web, khóa màn hình điện thoại (chỉ cần có Wifi/4G).
    """
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
        payload["vibrate"] = [400, 200, 400, 200, 800, 400, 800]
        payload["tag"] = f"call_{data.get('conv_id', 'general')}"
        payload["renotify"] = True
    else:
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
            print(f"[PushService] No subscriptions registered for user_id={user_id}")
            return

        print(f"[PushService] Dispatching push to {len(rows)} device(s) for user_id={user_id}...")
        for row in rows:
            _send_to_sub(row["endpoint"], row["p256dh"], row["auth"], payload_str)

    t = threading.Thread(target=worker, daemon=True)
    t.start()
