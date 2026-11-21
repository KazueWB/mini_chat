// Voice & Video Call Module for Chat Together Web with Real WebRTC & Realtime Signaling
class CallManager {
    constructor() {
        this.activeCall = null;
        this.localStream = null;
        this.peerConnection = null;
        this.pendingIceCandidates = [];
        this.timerInterval = null;
        this.secondsElapsed = 0;
        this.isMuted = false;
        this.isCamOff = false;
        this.callTimeoutTimer = null;

        // Overlay & Controls Elements
        this.overlay = null;
        this.timerEl = null;
        this.nameEl = null;
        this.stateEl = null;
        this.avatarEl = null;
        this.typeBadgeEl = null;
        this.localVideo = null;
        this.remoteVideo = null;
        this.remoteAudio = null;
        this.localScreen = null;
        this.btnMic = null;
        this.btnCam = null;
        this.btnEnd = null;

        // Incoming Call Modal Elements
        this.incomingModal = null;
        this.incomingAvatar = null;
        this.incomingName = null;
        this.incomingDesc = null;
        this.incomingBadge = null;
        this.btnAccept = null;
        this.btnDecline = null;

        // Notification & Vibration state
        this.vibrationInterval = null;
        this.incomingNotification = null;
        this.originalTitle = document.title;
        this.titleBlinkInterval = null;

        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        // Main Call Overlay
        this.overlay = document.getElementById("call-overlay");
        this.timerEl = document.getElementById("call-timer");
        this.nameEl = document.getElementById("call-remote-name");
        this.stateEl = document.getElementById("call-status-state");
        this.avatarEl = document.getElementById("call-remote-avatar");
        this.typeBadgeEl = document.getElementById("call-type-badge");
        this.localVideo = document.getElementById("local-video-feed");
        this.remoteVideo = document.getElementById("remote-video-feed");
        this.remoteAudio = document.getElementById("remote-audio-feed");
        this.localScreen = document.getElementById("local-screen");

        this.btnMic = document.getElementById("btn-call-mic");
        this.btnCam = document.getElementById("btn-call-cam");
        this.btnEnd = document.getElementById("btn-call-end");

        // Incoming Call Modal
        this.incomingModal = document.getElementById("incoming-call-modal");
        this.incomingAvatar = document.getElementById("incoming-caller-avatar");
        this.incomingName = document.getElementById("incoming-caller-name");
        this.incomingDesc = document.getElementById("incoming-call-desc");
        this.incomingBadge = document.getElementById("incoming-call-badge");
        this.btnAccept = document.getElementById("btn-accept-call");
        this.btnDecline = document.getElementById("btn-decline-call");

        if (this.btnMic) this.btnMic.addEventListener("click", () => this.toggleMic());
        if (this.btnCam) this.btnCam.addEventListener("click", () => this.toggleCam());
        if (this.btnEnd) this.btnEnd.addEventListener("click", () => this.endCall(true));

        if (this.btnAccept) this.btnAccept.addEventListener("click", () => this.acceptCall());
        if (this.btnDecline) this.btnDecline.addEventListener("click", () => this.declineCall());

        this.initialized = true;
    }

    // Helper: format current HH:mm in Vietnam Time (UTC+7)
    getCurrentTimeStr() {
        const now = new Date();
        const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const hh = vn.getUTCHours().toString().padStart(2, "0");
        const mm = vn.getUTCMinutes().toString().padStart(2, "0");
        return `${hh}:${mm}`;
    }

    // Format mm:ss from seconds
    formatDuration(secs) {
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    }

    // ---------------- CALL NOTIFICATIONS & VIBRATIONS (ZALO / MESSENGER STYLE) ----------------
    startCallVibration() {
        if (!('vibrate' in navigator)) return;
        try {
            navigator.vibrate([600, 300, 600, 300, 1000, 500, 600, 300, 600]);
            if (this.vibrationInterval) clearInterval(this.vibrationInterval);
            this.vibrationInterval = setInterval(() => {
                if (this.activeCall && this.activeCall.status === "incoming") {
                    navigator.vibrate([600, 300, 600, 300, 1000, 500, 600, 300, 600]);
                } else {
                    this.stopCallVibration();
                }
            }, 5000);
        } catch (e) {
            console.warn('[Call] Vibration error:', e);
        }
    }

    stopCallVibration() {
        if (this.vibrationInterval) {
            clearInterval(this.vibrationInterval);
            this.vibrationInterval = null;
        }
        if ('vibrate' in navigator) {
            try { navigator.vibrate(0); } catch (e) {}
        }
    }

    showCallNotification(data) {
        if (!('Notification' in window)) return;

        const callerName = data.caller?.display_name || 'Người dùng';
        const callTypeText = data.type === 'video' ? 'video' : 'thoại';
        const title = `📞 Cuộc gọi ${callTypeText} đến từ ${callerName}`;
        const body = `${callerName} đang gọi cho bạn... Bấm để trả lời!`;

        const triggerNotification = () => {
            try {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then(reg => {
                        reg.showNotification(title, {
                            body: body,
                            icon: '/static/img/icon-192.png',
                            badge: '/static/img/icon-192.png',
                            tag: 'incoming_call_' + data.call_id,
                            renotify: true,
                            requireInteraction: true,
                            vibrate: [600, 300, 600, 300, 1000, 500, 600, 300, 600],
                            data: {
                                type: 'call',
                                call_id: data.call_id,
                                conv_id: data.conversation_id,
                                caller_id: data.caller?.id,
                                call_type: data.type
                            },
                            actions: [
                                { action: 'answer', title: 'Trả lời 📞' },
                                { action: 'decline', title: 'Từ chối ❌' }
                            ]
                        }).catch(() => {
                            this.showWindowNotificationFallback(title, body, data);
                        });
                    }).catch(() => {
                        this.showWindowNotificationFallback(title, body, data);
                    });
                } else {
                    this.showWindowNotificationFallback(title, body, data);
                }
            } catch (e) {
                console.warn('[Call] showCallNotification error:', e);
            }
        };

        if (Notification.permission === 'granted') {
            triggerNotification();
        } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') triggerNotification();
            });
        }
    }

    showWindowNotificationFallback(title, body, data) {
        try {
            const notif = new Notification(title, {
                body: body,
                icon: '/static/img/icon-192.png',
                badge: '/static/img/icon-192.png',
                tag: 'incoming_call_' + data.call_id,
                requireInteraction: true,
                vibrate: [600, 300, 600, 300, 1000]
            });
            notif.onclick = () => {
                window.focus();
                notif.close();
                this.acceptCall();
            };
            this.incomingNotification = notif;
        } catch (err) {
            console.warn('[Call] Fallback notification failed:', err);
        }
    }

    closeCallNotification() {
        if (this.incomingNotification) {
            try { this.incomingNotification.close(); } catch (e) {}
            this.incomingNotification = null;
        }
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.getNotifications().then(notifs => {
                    notifs.forEach(n => {
                        if (n.tag && n.tag.startsWith('incoming_call_')) {
                            n.close();
                        }
                    });
                });
            });
        }
    }

    startTitleBlink(text) {
        if (!this.originalTitle) this.originalTitle = document.title;
        if (this.titleBlinkInterval) clearInterval(this.titleBlinkInterval);
        let state = false;
        this.titleBlinkInterval = setInterval(() => {
            document.title = state ? text : `🔔 ${this.originalTitle}`;
            state = !state;
        }, 900);
    }

    stopTitleBlink() {
        if (this.titleBlinkInterval) {
            clearInterval(this.titleBlinkInterval);
            this.titleBlinkInterval = null;
        }
        if (this.originalTitle) {
            document.title = this.originalTitle;
        }
    }

    // Helper: Tạo Dummy Audio MediaStream khi trình duyệt chạy trên HTTP hoặc không có quyền micro
    createDummyMediaStream(type) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                const dest = ctx.createMediaStreamDestination();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                gain.gain.value = 0.001; // Silent
                osc.connect(gain);
                gain.connect(dest);
                osc.start();
                console.log("[WebRTC] Fallback: Đã tạo audio dummy stream để kết nối WebRTC không bị gián đoạn");
                return dest.stream;
            }
        } catch (e) {
            console.warn("[WebRTC] createDummyMediaStream failed:", e);
        }
        return null;
    }

    // Helper: Lấy Media Stream đảm bảo không bao giờ bị gọi đồng thời 2 lần (chống xung đột phần cứng)
    async getLocalMediaStream(type) {
        if (this.localStream && this.localStream.active && this.localStream.getTracks().some(t => t.readyState === 'live')) {
            return this.localStream;
        }
        if (this.mediaPromise) {
            return await this.mediaPromise;
        }

        this.mediaPromise = this._acquireLocalMediaStream(type);
        try {
            this.localStream = await this.mediaPromise;
            return this.localStream;
        } finally {
            this.mediaPromise = null;
        }
    }

    async _acquireLocalMediaStream(type) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("[WebRTC] Trình duyệt không hỗ trợ getUserMedia trên context này (hoặc chạy qua HTTP). Sử dụng luồng thay thế.");
            return this.createDummyMediaStream(type);
        }

        const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        if (type === "video") {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints,
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: "user"
                    }
                });
            } catch (err) {
                console.warn("[WebRTC] Không lấy được camera, chuyển sang chỉ dùng micro:", err);
                try {
                    return await navigator.mediaDevices.getUserMedia({
                        audio: audioConstraints,
                        video: false
                    });
                } catch (audioErr) {
                    console.warn("[WebRTC] Không lấy được micro thật, dùng dummy stream để kết nối:", audioErr);
                    return this.createDummyMediaStream(type);
                }
            }
        } else {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints,
                    video: false
                });
            } catch (err) {
                console.warn("[WebRTC] Không lấy được micro, dùng dummy stream để kết nối:", err);
                return this.createDummyMediaStream(type);
            }
        }
    }

    // ---------------- START OUTGOING CALL (CALLER) ----------------
    async startCall(type = "video", targetUser = null, targetConv = null) {
        this.init();
        if (!targetUser && !targetConv) return;

        const convId = targetConv ? targetConv.id : (window.app.activeConv ? window.app.activeConv.conversation.id : null);
        const callTargetName = targetUser ? targetUser.display_name : targetConv.name;
        const callTargetAvatar = targetUser ? targetUser.avatar_url : (targetConv.avatar_url || "");
        const targetUserId = targetUser ? targetUser.id : null;

        const callId = "call_" + Date.now();
        this.activeCall = {
            callId,
            role: "caller",
            type,
            targetUser,
            targetConvId: convId,
            status: "outgoing",
            startTime: null
        };
        this.pendingIceCandidates = [];

        this.nameEl.textContent = callTargetName;
        this.avatarEl.src = callTargetAvatar;
        this.avatarEl.style.display = "block";
        this.remoteVideo.style.display = "none";
        this.remoteVideo.srcObject = null;
        if (this.remoteAudio) this.remoteAudio.srcObject = null;

        this.typeBadgeEl.innerHTML = type === "video" 
            ? '<i class="fa-solid fa-video"></i> Cuộc gọi Video' 
            : '<i class="fa-solid fa-phone"></i> Cuộc gọi thoại';
        this.stateEl.textContent = "Đang đổ chuông...";
        this.timerEl.textContent = "Đang gọi...";
        this.overlay.style.display = "flex";

        window.soundManager.startRinging();

        // ⚡ TỐI ƯU SIÊU TỐC: Bắn tín hiệu gọi ngay 0ms để máy người nhận reo chuông lập tức
        window.chatSocket.sendCallSignal({
            action: "call_invite",
            call_id: callId,
            type,
            caller: {
                id: window.app.currentUser.id,
                display_name: window.app.currentUser.display_name,
                avatar_url: window.app.currentUser.avatar_url
            },
            target_user_id: targetUserId,
            conversation_id: convId
        });

        // Khởi tạo mic/cam song song trong nền (không làm trễ chuông reo của đối phương)
        this.getLocalMediaStream(type).then(stream => {
            this.localStream = stream;
            if (stream && type === "video" && stream.getVideoTracks().length > 0) {
                this.localScreen.style.display = "block";
                this.localVideo.srcObject = stream;
            } else {
                this.localScreen.style.display = "none";
            }
            if (this.peerConnection && stream) {
                stream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, stream);
                });
            }
        }).catch(err => {
            console.warn("[WebRTC] getLocalMediaStream in background:", err);
        });

        // 35s Timeout: If receiver does not answer, log missed call!
        this.callTimeoutTimer = setTimeout(() => {
            if (this.activeCall && this.activeCall.status === "outgoing") {
                this.cancelCallDueToTimeout();
            }
        }, 35000);
    }

    // ---------------- RECEIVE INCOMING SIGNAL ----------------
    handleSignal(data) {
        this.init();
        const action = data.action;

        if (action === "call_invite") {
            // If already in a call, notify caller that we are busy
            if (this.activeCall) {
                window.chatSocket.sendCallSignal({
                    action: "call_busy",
                    call_id: data.call_id,
                    target_user_id: data.caller.id,
                    conversation_id: data.conversation_id
                });
                return;
            }

            // Enter incoming call state
            this.activeCall = {
                callId: data.call_id,
                role: "callee",
                type: data.type,
                targetUser: data.caller,
                targetConvId: data.conversation_id,
                status: "incoming",
                startTime: null
            };
            this.pendingIceCandidates = [];

            this.incomingName.textContent = data.caller.display_name;
            this.incomingAvatar.src = data.caller.avatar_url;
            this.incomingBadge.innerHTML = data.type === "video"
                ? '<i class="fa-solid fa-video"></i> Cuộc gọi video đến'
                : '<i class="fa-solid fa-phone-volume"></i> Cuộc gọi thoại đến';
            this.incomingDesc.textContent = `${data.caller.display_name} đang gọi cho bạn...`;
            this.incomingModal.style.display = "flex";

            window.soundManager.startIncomingRing();

            // Kích hoạt thông báo hệ thống, rung và nhấp nháy tab (chuẩn Zalo / Messenger)
            this.incomingCallData = data;
            this.startCallVibration();
            this.showCallNotification(data);
            this.startTitleBlink(`📞 Cuộc gọi đến từ ${data.caller.display_name}!`);

            // Auto-timeout after 30s on receiver
            this.callTimeoutTimer = setTimeout(() => {
                if (this.activeCall && this.activeCall.status === "incoming") {
                    this.declineCall(true); // timed out
                }
            }, 30000);
        }

        else if (action === "call_accepted") {
            if (this.activeCall && this.activeCall.role === "caller") {
                if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
                window.soundManager.stopRinging();
                this.connectCall();
                this.initWebRTCOffer();
            }
        }

        else if (action === "call_declined" || action === "call_timeout") {
            // Caller: Callee đã từ chối hoặc hết 30s -> Lập tức ngắt chuông tút tút, báo bận và đóng modal
            if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
            window.soundManager.stopRinging();
            window.soundManager.stopIncomingRing();
            this.stopCallVibration();
            this.closeCallNotification();
            this.stopTitleBlink();
            window.soundManager.playEndCall();
            if (this.stateEl) this.stateEl.textContent = action === "call_timeout" ? "Không có phản hồi" : "Cuộc gọi bị từ chối";
            if (this.timerEl) this.timerEl.textContent = "Đã kết thúc";

            setTimeout(() => {
                this.cleanupCall();
            }, 1800);
        }

        else if (action === "call_canceled") {
            // Callee: Caller đã hủy cuộc gọi -> DỪNG NGAY LẬP TỨC TOÀN BỘ CHUÔNG, RUNG VÀ ĐÓNG THÔNG BÁO!
            if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
            window.soundManager.stopIncomingRing();
            window.soundManager.stopRinging();
            this.stopCallVibration();
            this.closeCallNotification();
            this.stopTitleBlink();
            if (this.incomingModal) this.incomingModal.style.display = "none";
            this.activeCall = null;
            this.incomingCallData = null;
        }

        else if (action === "call_busy") {
            if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
            window.soundManager.stopRinging();
            window.soundManager.stopIncomingRing();
            this.stopCallVibration();
            this.closeCallNotification();
            this.stopTitleBlink();
            window.soundManager.playEndCall();
            if (this.stateEl) this.stateEl.textContent = "Người dùng đang bận cuộc gọi khác";
            if (this.timerEl) this.timerEl.textContent = "Đã kết thúc";
            setTimeout(() => {
                this.cleanupCall();
            }, 2000);
        }

        else if (action === "call_ended") {
            // Một trong hai bên ngắt máy khi đang đàm thoại -> Dừng ngay lập tức
            if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
            window.soundManager.stopRinging();
            window.soundManager.stopIncomingRing();
            this.stopCallVibration();
            this.closeCallNotification();
            this.stopTitleBlink();
            window.soundManager.playEndCall();
            if (this.stateEl) this.stateEl.textContent = "Cuộc gọi đã kết thúc";
            if (this.timerEl) this.timerEl.textContent = "Đã ngắt máy";
            setTimeout(() => {
                this.cleanupCall();
            }, 1000);
        }

        else if (action === "webrtc_offer") {
            this.handleWebRTCOffer(data.sdp);
        }

        else if (action === "webrtc_answer") {
            this.handleWebRTCAnswer(data.sdp);
        }

        else if (action === "webrtc_ice") {
            this.handleWebRTCIce(data.candidate);
        }
    }

    // ---------------- CALLEE ACCEPTS CALL ----------------
    async acceptCall() {
        if (!this.activeCall || this.activeCall.status !== "incoming") return;
        if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);

        window.soundManager.stopIncomingRing();
        this.stopCallVibration();
        this.closeCallNotification();
        this.stopTitleBlink();
        this.incomingModal.style.display = "none";

        const call = this.activeCall;
        call.status = "connected";

        // Setup Main Overlay for Callee
        this.nameEl.textContent = call.targetUser.display_name;
        this.avatarEl.src = call.targetUser.avatar_url;
        this.avatarEl.style.display = "block";
        this.remoteVideo.style.display = "none";
        this.remoteVideo.srcObject = null;
        if (this.remoteAudio) this.remoteAudio.srcObject = null;

        this.typeBadgeEl.innerHTML = call.type === "video" 
            ? '<i class="fa-solid fa-video"></i> Cuộc gọi Video' 
            : '<i class="fa-solid fa-phone"></i> Cuộc gọi thoại';
        this.overlay.style.display = "flex";
        this.stateEl.textContent = "Đang kết nối...";

        // ⚡ TỐI ƯU SIÊU TỐC: Báo ngay cho Caller biết Callee đã nhấc máy (0ms) để ngắt chuông tút tút ngay tức khắc
        window.chatSocket.sendCallSignal({
            action: "call_accepted",
            call_id: call.callId,
            target_user_id: call.targetUser.id,
            conversation_id: call.targetConvId
        });

        this.connectCall();

        // Lấy mic/cam song song và nạp vào kết nối đàm thoại
        this.getLocalMediaStream(call.type).then(stream => {
            this.localStream = stream;
            if (stream && call.type === "video" && stream.getVideoTracks().length > 0) {
                this.localScreen.style.display = "block";
                this.localVideo.srcObject = stream;
            } else {
                this.localScreen.style.display = "none";
            }
            if (this.peerConnection && stream) {
                stream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, stream);
                });
            }
        }).catch(e => console.warn("[WebRTC] Callee local media error:", e));
    }

    // ---------------- CALLEE DECLINES CALL ----------------
    declineCall(isTimeout = false) {
        if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
        window.soundManager.stopIncomingRing();
        window.soundManager.stopRinging();
        this.stopCallVibration();
        this.closeCallNotification();
        this.stopTitleBlink();
        if (this.incomingModal) this.incomingModal.style.display = "none";

        const call = this.activeCall;
        if (!call) return;

        const targetUserId = call.targetUser ? call.targetUser.id : null;
        const convId = call.targetConvId;
        const callType = call.type;

        // Báo cho Caller biết để tắt chuông ngay lập tức
        if (targetUserId && convId) {
            window.chatSocket.sendCallSignal({
                action: isTimeout ? "call_timeout" : "call_declined",
                call_id: call.callId,
                target_user_id: targetUserId,
                conversation_id: convId
            });
        }

        // Post record into conversation
        const timeStr = this.getCurrentTimeStr();
        const icon = callType === "video" ? "📹" : "📞";
        const content = isTimeout 
            ? `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} nhỡ lúc ${timeStr}`
            : `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} bị từ chối lúc ${timeStr}`;

        if (convId) {
            this.logCallMessage(convId, content);
        }

        this.activeCall = null;
        this.incomingCallData = null;
    }

    // ---------------- TIMEOUT CANCEL (CALLER) ----------------
    cancelCallDueToTimeout() {
        if (!this.activeCall) return;
        window.soundManager.stopRinging();
        window.soundManager.playEndCall();

        const call = this.activeCall;
        const convId = call.targetConvId;
        const callType = call.type;
        const timeStr = this.getCurrentTimeStr();
        const icon = callType === "video" ? "📹" : "📞";

        this.stateEl.textContent = "Không có phản hồi";
        this.timerEl.textContent = "Đã kết thúc";

        // Notify receiver to close incoming popup if still ringing
        window.chatSocket.sendCallSignal({
            action: "call_canceled",
            call_id: call.callId,
            target_user_id: call.targetUser.id,
            conversation_id: convId
        });

        // Post Missed Call message!
        const content = `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} nhỡ lúc ${timeStr}`;
        this.logCallMessage(convId, content);

        setTimeout(() => {
            this.cleanupCall();
        }, 1800);
    }

    // ---------------- CALL CONNECTED: START TIMER & WEBRTC ----------------
    connectCall() {
        if (!this.activeCall) return;
        this.activeCall.status = "connected";
        this.activeCall.startTime = new Date();

        this.stateEl.textContent = "Đang kết nối âm thanh...";
        this.secondsElapsed = 0;
        this.timerEl.textContent = "00:00";

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.secondsElapsed++;
            this.timerEl.textContent = this.formatDuration(this.secondsElapsed);
        }, 1000);
    }

    // ---------------- END CALL ----------------
    endCall(isInitiator = true) {
        if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
        window.soundManager.stopRinging();
        window.soundManager.stopIncomingRing();
        this.stopCallVibration();
        this.closeCallNotification();
        this.stopTitleBlink();
        window.soundManager.playEndCall();

        const call = this.activeCall;
        if (!call) {
            this.cleanupCall();
            return;
        }

        const convId = call.targetConvId;
        const callType = call.type;
        const timeStr = this.getCurrentTimeStr();
        const icon = callType === "video" ? "📹" : "📞";

        if (call.status === "outgoing" && isInitiator) {
            // Caller cancelled before receiver answered -> Gửi tín hiệu hủy cho Callee
            window.chatSocket.sendCallSignal({
                action: "call_canceled",
                call_id: call.callId,
                target_user_id: call.targetUser.id,
                conversation_id: convId
            });
            const content = `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} nhỡ lúc ${timeStr}`;
            this.logCallMessage(convId, content);

            // Cập nhật trạng thái hiển thị ngắn rồi đóng
            if (this.stateEl) this.stateEl.textContent = "Đã hủy cuộc gọi";
            if (this.timerEl) this.timerEl.textContent = "Đã kết thúc";
            setTimeout(() => {
                this.cleanupCall();
            }, 400);
            return;
        } else if (call.status === "connected") {
            // Call took place and completed -> Log Duration!
            if (isInitiator) {
                window.chatSocket.sendCallSignal({
                    action: "call_ended",
                    call_id: call.callId,
                    target_user_id: call.targetUser.id,
                    conversation_id: convId
                });
                const durationStr = this.formatDuration(this.secondsElapsed);
                const content = `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} kết thúc - ${durationStr}`;
                this.logCallMessage(convId, content);
            }

            if (this.stateEl) this.stateEl.textContent = "Cuộc gọi đã kết thúc";
            if (this.timerEl) this.timerEl.textContent = "Đã ngắt máy";
            setTimeout(() => {
                this.cleanupCall();
            }, 600);
            return;
        }

        this.cleanupCall();
    }

    cleanupCall() {
        if (window.soundManager) window.soundManager.stopAll();
        this.stopCallVibration();
        this.closeCallNotification();
        this.stopTitleBlink();
        this.incomingCallData = null;
        this.mediaPromise = null;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.callTimeoutTimer) {
            clearTimeout(this.callTimeoutTimer);
            this.callTimeoutTimer = null;
        }

        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(t => t.stop());
            } catch (e) {}
            this.localStream = null;
        }

        if (this.peerConnection) {
            try {
                this.peerConnection.onicecandidate = null;
                this.peerConnection.ontrack = null;
                this.peerConnection.onconnectionstatechange = null;
                this.peerConnection.close();
            } catch (e) {}
            this.peerConnection = null;
        }

        this.pendingIceCandidates = [];
        this.activeCall = null;

        if (this.remoteAudio) {
            try {
                this.remoteAudio.pause();
                this.remoteAudio.srcObject = null;
            } catch (e) {}
        }

        if (this.remoteVideo) {
            try {
                this.remoteVideo.pause();
                this.remoteVideo.srcObject = null;
                this.remoteVideo.style.display = "none";
            } catch (e) {}
        }

        if (this.localVideo) {
            try {
                this.localVideo.srcObject = null;
            } catch (e) {}
        }

        if (this.overlay) this.overlay.style.display = "none";
        if (this.localScreen) this.localScreen.style.display = "none";
        if (this.avatarEl) this.avatarEl.style.display = "block";
        if (this.incomingModal) this.incomingModal.style.display = "none";
    }

    // ---------------- WEBRTC IMPLEMENTATION ----------------
    createPeerConnection() {
        if (this.peerConnection) {
            return this.peerConnection;
        }

        const config = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: "max-bundle",
            rtcpMuxPolicy: "require"
        };

        const pc = new RTCPeerConnection(config);

        // Add all local tracks into PeerConnection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // On local ICE candidate generated: send to peer
        pc.onicecandidate = (e) => {
            if (e.candidate && this.activeCall && this.activeCall.targetUser) {
                window.chatSocket.sendCallSignal({
                    action: "webrtc_ice",
                    candidate: e.candidate,
                    target_user_id: this.activeCall.targetUser.id,
                    call_id: this.activeCall.callId
                });
            }
        };

        // When remote audio/video tracks arrive
        pc.ontrack = (e) => {
            console.log("[WebRTC] Received remote track:", e.track.kind);
            const stream = (e.streams && e.streams[0]) ? e.streams[0] : new MediaStream([e.track]);

            // Audio track -> connect to dedicated remote-audio-feed
            if (e.track.kind === "audio") {
                if (this.remoteAudio) {
                    this.remoteAudio.srcObject = stream;
                    this.remoteAudio.play().catch(err => console.warn("[WebRTC] remote audio play:", err));
                }
            }

            // Video track -> connect to remote-video-feed & reveal
            if (e.track.kind === "video") {
                if (this.remoteVideo) {
                    this.remoteVideo.srcObject = stream;
                    this.remoteVideo.style.display = "block";
                    if (this.avatarEl) this.avatarEl.style.display = "none";
                    this.remoteVideo.play().catch(err => console.warn("[WebRTC] remote video play:", err));
                }
            }
        };

        // Monitor connection health
        pc.onconnectionstatechange = () => {
            console.log("[WebRTC] Connection state changed:", pc.connectionState);
            if (pc.connectionState === "connected") {
                if (this.stateEl) this.stateEl.textContent = "Đã kết nối";
            } else if (pc.connectionState === "disconnected") {
                if (this.stateEl) this.stateEl.textContent = "Mất kết nối tạm thời...";
            } else if (pc.connectionState === "failed") {
                if (this.stateEl) this.stateEl.textContent = "Kết nối thất bại";
            }
        };

        this.peerConnection = pc;
        return pc;
    }

    async drainPendingIceCandidates() {
        if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
        while (this.pendingIceCandidates.length > 0) {
            const candidate = this.pendingIceCandidates.shift();
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn("[WebRTC] Error adding buffered ICE candidate:", e);
            }
        }
    }

    async initWebRTCOffer() {
        try {
            // Đảm bảo Caller đã có localStream trước khi tạo Offer
            if (!this.localStream && this.activeCall) {
                this.localStream = await this.getLocalMediaStream(this.activeCall.type);
            }
            const pc = this.createPeerConnection();
            const isVideo = Boolean(this.activeCall && this.activeCall.type === "video");

            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: isVideo
            });
            await pc.setLocalDescription(offer);

            window.chatSocket.sendCallSignal({
                action: "webrtc_offer",
                sdp: offer,
                call_id: this.activeCall.callId,
                target_user_id: this.activeCall.targetUser.id
            });
        } catch (e) {
            console.error("[WebRTC] Error creating offer:", e);
        }
    }

    async handleWebRTCOffer(sdp) {
        try {
            // Ensure callee has local stream before answering
            if (!this.localStream && this.activeCall) {
                this.localStream = await this.getLocalMediaStream(this.activeCall.type);
                if (this.localStream && this.activeCall.type === "video" && this.localStream.getVideoTracks().length > 0) {
                    this.localScreen.style.display = "block";
                    this.localVideo.srcObject = this.localStream;
                }
            }

            const pc = this.createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await this.drainPendingIceCandidates();

            const isVideo = Boolean(this.activeCall && this.activeCall.type === "video");
            const answer = await pc.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: isVideo
            });
            await pc.setLocalDescription(answer);

            window.chatSocket.sendCallSignal({
                action: "webrtc_answer",
                sdp: answer,
                call_id: this.activeCall.callId,
                target_user_id: this.activeCall.targetUser.id
            });
        } catch (e) {
            console.error("[WebRTC] Error handling offer:", e);
        }
    }

    async handleWebRTCAnswer(sdp) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
                await this.drainPendingIceCandidates();
            }
        } catch (e) {
            console.error("[WebRTC] Error handling answer:", e);
        }
    }

    async handleWebRTCIce(candidate) {
        if (!candidate) return;
        try {
            if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                this.pendingIceCandidates.push(candidate);
            }
        } catch (e) {
            console.warn("[WebRTC] Error handling ICE candidate:", e);
        }
    }

    // ---------------- MIC & CAM TOGGLE ----------------
    toggleMic() {
        this.isMuted = !this.isMuted;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
        }
        if (this.btnMic) {
            this.btnMic.classList.toggle("active-muted", this.isMuted);
            this.btnMic.innerHTML = this.isMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
        }
    }

    toggleCam() {
        this.isCamOff = !this.isCamOff;
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(t => t.enabled = !this.isCamOff);
        }
        if (this.btnCam) {
            this.btnCam.classList.toggle("active-muted", this.isCamOff);
            this.btnCam.innerHTML = this.isCamOff ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
        }
    }

    // ---------------- LOG CALL MESSAGE TO CHAT ----------------
    async logCallMessage(convId, content) {
        if (!convId) return;
        try {
            await fetch(`/api/conversations/${convId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content,
                    message_type: "call"
                })
            });
        } catch (e) {
            console.error("Failed to log call message:", e);
        }
    }
}

window.callManager = new CallManager();
