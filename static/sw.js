// Service Worker for Chat Together Web PWA & Web Push Notifications
const CACHE_NAME = 'chat-together-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Xử lý khi nhận được Push Notification từ Server (kể cả khi tắt web / khóa màn hình)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload = {};
    try {
        payload = event.data.json();
    } catch (e) {
        payload = {
            title: "Chat Together",
            body: event.data.text()
        };
    }

    const title = payload.title || "Chat Together";
    const data = payload.data || {};
    const isCall = (data.type === "call");

    const options = {
        body: payload.body || "",
        icon: payload.icon || "/static/img/icon-192.png",
        badge: payload.badge || "/static/img/icon-192.png",
        data: data,
        vibrate: payload.vibrate || (isCall ? [400, 200, 400, 200, 800, 400, 800] : [150, 80, 150]),
        requireInteraction: isCall ? true : (payload.requireInteraction || false),
        tag: payload.tag || (isCall ? `call_${data.conv_id || 'general'}` : `msg_${data.conv_id || 'general'}`),
        renotify: payload.renotify !== undefined ? payload.renotify : true,
        actions: payload.actions || (isCall ? [
            { action: "answer", title: "Trả lời 📞" },
            { action: "decline", title: "Từ chối ❌" }
        ] : [
            { action: "open", title: "Mở xem 💬" }
        ])
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Xử lý khi người dùng tương tác / bấm vào thông báo
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    const action = event.action;

    // Nếu người dùng bấm "Từ chối" cuộc gọi
    if (action === "decline") {
        if (data.conv_id && data.caller_id) {
            // Gửi API báo từ chối ngầm
            fetch('/api/call/decline_offline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: data.conv_id,
                    caller_id: data.caller_id
                })
            }).catch(() => {});
        }
        return;
    }

    // Xác định URL cần mở
    let targetUrl = '/';
    if (data.type === "call" || action === "answer") {
        targetUrl = `/?action=answer_call&conv_id=${data.conv_id || ''}&caller_id=${data.caller_id || ''}&call_type=${data.call_type || 'audio'}`;
    } else if (data.conv_id) {
        targetUrl = `/?conv_id=${data.conv_id}`;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Nếu đã có tab đang mở -> chuyển hướng và focus
            for (let client of clientList) {
                if ('focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Nếu chưa có tab nào mở -> mở cửa sổ mới
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
