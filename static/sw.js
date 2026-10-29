// Service Worker for Chat Together Web PWA & Web Push Notifications
const CACHE_NAME = 'chat-together-v2';

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

    const data = payload.data || {};

    // 1. Nếu là tín hiệu HỦY cuộc gọi hoặc KẾT THÚC cuộc gọi từ đối phương:
    // Lập tức đóng tất cả thông báo cuộc gọi và dừng rung trên điện thoại!
    if (data.type === "cancel_call" || data.type === "end_call") {
        event.waitUntil(
            self.registration.getNotifications().then(notifs => {
                notifs.forEach(n => {
                    const tag = n.tag || "";
                    if (tag.startsWith("call_") || tag.startsWith("incoming_call_")) {
                        n.close();
                    }
                });
            })
        );
        return;
    }

    const title = payload.title || "Chat Together";
    const isCall = (data.type === "call");

    let iconUrl = payload.icon || "/static/img/icon-192.png";
    if (typeof iconUrl === "string" && iconUrl.includes(".svg")) {
        iconUrl = "/static/img/icon-192.png";
    }

    const options = {
        body: payload.body || "",
        icon: iconUrl,
        badge: "/static/img/icon-192.png",
        data: data,
        vibrate: payload.vibrate || (isCall ? [600, 300, 600, 300, 1000, 500, 600, 300, 600] : [200, 100, 200]),
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
