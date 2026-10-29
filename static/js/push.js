// Web Push Notification & PWA Manager for Chat Together
class PushManagerService {
    constructor() {
        this.swRegistration = null;
        this.isSubscribed = false;
        this.vapidPublicKey = null;
    }

    async init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[Push] Trình duyệt không hỗ trợ Service Worker hoặc Push Notifications.');
            return;
        }

        try {
            // Đăng ký Service Worker
            this.swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            console.log('[Push] Service Worker đã đăng ký thành công với scope:', this.swRegistration.scope);

            // Kiểm tra trạng thái subscription hiện tại
            const sub = await this.swRegistration.pushManager.getSubscription();
            this.isSubscribed = !(sub === null);

            // Kiểm tra tham số URL mở từ thông báo cuộc gọi
            this.checkUrlAction();

            // Gắn sự kiện cho nút cài đặt thông báo trên thanh điều hướng
            const toggleBtn = document.getElementById('btn-push-toggle');
            if (toggleBtn) {
                toggleBtn.onclick = async () => {
                    if (Notification.permission === 'granted') {
                        const ok = await this.subscribeUser();
                        if (ok) {
                            this.showToast('🔔 Thông báo đẩy đang hoạt động tốt trên thiết bị này!');
                        } else {
                            this.showToast('⚠️ Vui lòng đăng nhập để bật thông báo.');
                        }
                    } else {
                        await this.requestPermissionAndSubscribe();
                    }
                    this.updateToggleButton();
                };
            }

            // Nếu người dùng đã cấp quyền, đảm bảo subscription được đồng bộ lên server
            if (Notification.permission === 'granted') {
                await this.subscribeUser();
            } else if (Notification.permission === 'default') {
                // Hiển thị banner nhắc bật thông báo để nhận cuộc gọi/tin nhắn khi tắt web
                setTimeout(() => this.showPermissionBanner(), 2500);
            }
            this.updateToggleButton();
        } catch (err) {
            console.error('[Push] Lỗi khởi tạo Service Worker:', err);
        }
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async getPublicKey() {
        if (this.vapidPublicKey) return this.vapidPublicKey;
        try {
            const res = await fetch('/api/push/vapid-public-key');
            const data = await res.json();
            this.vapidPublicKey = data.public_key;
            return this.vapidPublicKey;
        } catch (e) {
            console.error('[Push] Không lấy được VAPID public key:', e);
            return null;
        }
    }

    async subscribeUser() {
        if (!this.swRegistration) return false;

        try {
            const pubKey = await this.getPublicKey();
            if (!pubKey) return false;

            const applicationServerKey = this.urlBase64ToUint8Array(pubKey);

            // Kiểm tra subscription hiện tại, nếu có thì hủy để đăng ký lại đồng bộ với server key
            const existingSub = await this.swRegistration.pushManager.getSubscription();
            if (existingSub) {
                try {
                    await existingSub.unsubscribe();
                    console.log('[Push] Đã làm mới subscription cũ để đồng bộ VAPID key chuẩn.');
                } catch (e) {}
            }

            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });

            console.log('[Push] Đã tạo PushSubscription mới thành công:', subscription);

            const subJson = subscription.toJSON ? subscription.toJSON() : JSON.parse(JSON.stringify(subscription));

            // Gửi lên server để lưu vào database
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subJson)
            });
            const result = await res.json();

            if (result.success) {
                this.isSubscribed = true;
                this.updateToggleButton();
                console.log('[Push] Đã lưu thông tin đăng ký thông báo đẩy lên máy chủ!');
                return true;
            }
        } catch (err) {
            console.error('[Push] Đăng ký Push thất bại:', err);
        }
        return false;
    }

    updateToggleButton() {
        const btn = document.getElementById('btn-push-toggle');
        if (!btn) return;
        if (Notification.permission === 'granted' && this.isSubscribed) {
            btn.innerHTML = '<i class="fa-solid fa-bell" style="color:#0084ff;"></i>';
            btn.title = 'Thông báo: Đang bật (Nhận chuông & tin nhắn khi tắt web)';
        } else if (Notification.permission === 'denied') {
            btn.innerHTML = '<i class="fa-solid fa-bell-slash" style="color:#ef4444;"></i>';
            btn.title = 'Thông báo: Bị chặn trong trình duyệt (Bấm để xem hướng dẫn)';
        } else {
            btn.innerHTML = '<i class="fa-regular fa-bell"></i>';
            btn.title = 'Thông báo: Chưa bật (Bấm để nhận chuông khi có người gọi)';
        }
    }

    async requestPermissionAndSubscribe() {
        if (!('Notification' in window)) {
            alert('Trình duyệt của bạn không hỗ trợ Thông báo.');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                this.hidePermissionBanner();
                const success = await this.subscribeUser();
                if (success) {
                    this.showToast('✅ Đã bật thông báo! Bạn sẽ nhận được tin nhắn và cuộc gọi kể cả khi tắt web.');
                }
                return success;
            } else if (permission === 'denied') {
                this.hidePermissionBanner();
                this.showToast('⚠️ Bạn đã từ chối nhận thông báo. Vui lòng bật lại trong cài đặt trình duyệt để nhận cuộc gọi.');
            }
        } catch (err) {
            console.error('[Push] Yêu cầu quyền thông báo lỗi:', err);
        }
        return false;
    }

    showPermissionBanner() {
        // Kiểm tra xem đã hiển thị chưa hoặc đã tắt gần đây chưa
        if (document.getElementById('push-notif-banner')) return;
        if (localStorage.getItem('push_banner_dismissed')) return;

        const banner = document.createElement('div');
        banner.id = 'push-notif-banner';
        banner.className = 'push-notif-banner';
        banner.innerHTML = `
            <div class="push-banner-content">
                <div class="push-banner-icon">
                    <i class="fa-solid fa-bell-ring fa-bounce" style="--fa-bounce-height: -4px;"></i>
                </div>
                <div class="push-banner-text">
                    <strong>Bật thông báo cuộc gọi & tin nhắn</strong>
                    <p>Nhận chuông cuộc gọi và tin nhắn ngay cả khi bạn tắt web hoặc khóa màn hình (chỉ cần có Wifi/4G).</p>
                </div>
            </div>
            <div class="push-banner-actions">
                <button class="push-btn-dismiss" id="btn-push-dismiss">Để sau</button>
                <button class="push-btn-enable" id="btn-push-enable"><i class="fa-solid fa-bell"></i> Bật ngay</button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('btn-push-enable').onclick = () => {
            this.requestPermissionAndSubscribe();
        };

        document.getElementById('btn-push-dismiss').onclick = () => {
            this.hidePermissionBanner();
            localStorage.setItem('push_banner_dismissed', Date.now());
        };
    }

    hidePermissionBanner() {
        const banner = document.getElementById('push-notif-banner');
        if (banner) {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(20px)';
            setTimeout(() => banner.remove(), 300);
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'push-toast-alert';
        toast.innerHTML = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    checkUrlAction() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const convId = params.get('conv_id');
        const callerId = params.get('caller_id');
        const callType = params.get('call_type') || 'audio';

        // Xóa query params trên thanh địa chỉ cho sạch
        if (action || convId) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (action === 'answer_call' && convId) {
            console.log('[Push] Mở từ thông báo cuộc gọi:', { convId, callerId, callType });
            // Đợi app khởi tạo xong và tự động kết nối
            const checkAppInterval = setInterval(() => {
                if (window.app && window.app.currentUser && window.callManager) {
                    clearInterval(checkAppInterval);
                    // Chọn cuộc hội thoại và mở cuộc gọi
                    window.app.selectConversation(parseInt(convId)).then(() => {
                        console.log('[Push] Tự động kích hoạt nghe cuộc gọi...');
                        // Chờ 500ms để room và socket sẵn sàng
                        setTimeout(() => {
                            if (window.callManager && window.callManager.incomingCallData) {
                                window.callManager.acceptCall();
                            }
                        }, 600);
                    });
                }
            }, 300);
        } else if (convId) {
            const checkAppInterval = setInterval(() => {
                if (window.app && window.app.currentUser) {
                    clearInterval(checkAppInterval);
                    window.app.selectConversation(parseInt(convId));
                }
            }, 300);
        }
    }
}

window.pushManagerService = new PushManagerService();
document.addEventListener('DOMContentLoaded', () => {
    window.pushManagerService.init();
});

