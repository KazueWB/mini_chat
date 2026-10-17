// Voice & Video Call Module for Zalo/Messenger Web with Real WebRTC & Realtime Signaling
class CallManager {
    constructor() {
        this.activeCall = null;
        this.localStream = null;
        this.peerConnection = null;
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
        if (this.btnEnd) this.btnEnd.addEventListener("click", () => this.endCall());

        if (this.btnAccept) this.btnAccept.addEventListener("click", () => this.acceptCall());
        if (this.btnDecline) this.btnDecline.addEventListener("click", () => this.declineCall());

        this.initialized = true;
    }

    // Helper: format current HH:mm
    getCurrentTimeStr() {
        const d = new Date();
        const hh = d.getHours().toString().padStart(2, "0");
        const mm = d.getMinutes().toString().padStart(2, "0");
        return `${hh}:${mm}`;
    }

    // Format mm:ss from seconds
    formatDuration(secs) {
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
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

        this.nameEl.textContent = callTargetName;
        this.avatarEl.src = callTargetAvatar;
        this.avatarEl.style.display = "block";
        this.remoteVideo.style.display = "none";
        this.typeBadgeEl.innerHTML = type === "video" 
            ? '<i class="fa-solid fa-video"></i> Cuộc gọi Video' 
            : '<i class="fa-solid fa-phone"></i> Cuộc gọi thoại';
        this.stateEl.textContent = "Đang đổ chuông...";
        this.timerEl.textContent = "Đang gọi...";
        this.overlay.style.display = "flex";

        window.soundManager.startRinging();

        // Get local audio & video (if video call)
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: type === "video",
                    audio: true
                });
                this.localStream = stream;
                if (type === "video") {
                    this.localScreen.style.display = "block";
                    this.localVideo.srcObject = stream;
                }
            }
        } catch (err) {
            console.warn("[Call] Camera/mic preview not available:", err.message);
        }

        // Send invite signal via socket to receiver's room
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

            this.incomingName.textContent = data.caller.display_name;
            this.incomingAvatar.src = data.caller.avatar_url;
            this.incomingBadge.innerHTML = data.type === "video"
                ? '<i class="fa-solid fa-video"></i> Cuộc gọi video đến'
                : '<i class="fa-solid fa-phone-volume"></i> Cuộc gọi thoại đến';
            this.incomingDesc.textContent = `${data.caller.display_name} đang gọi cho bạn...`;
            this.incomingModal.style.display = "flex";

            window.soundManager.startIncomingRing();

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

        else if (action === "call_declined") {
            if (this.activeCall && this.activeCall.role === "caller") {
                if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
                window.soundManager.stopRinging();
                window.soundManager.playEndCall();
                this.stateEl.textContent = "Cuộc gọi bị từ chối";
                this.timerEl.textContent = "Đã kết thúc";

                setTimeout(() => {
                    this.cleanupCall();
                }, 1800);
            }
        }

        else if (action === "call_canceled") {
            if (this.activeCall && this.activeCall.status === "incoming") {
                if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
                window.soundManager.stopIncomingRing();
                this.incomingModal.style.display = "none";
                this.activeCall = null;
            }
        }

        else if (action === "call_busy") {
            if (this.activeCall && this.activeCall.role === "caller") {
                if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
                window.soundManager.stopRinging();
                window.soundManager.playEndCall();
                this.stateEl.textContent = "Người dùng đang bận cuộc gọi khác";
                this.timerEl.textContent = "Đã kết thúc";
                setTimeout(() => {
                    this.cleanupCall();
                }, 2000);
            }
        }

        else if (action === "call_ended") {
            if (this.activeCall) {
                this.endCall(false); // remotely ended
            }
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
        this.incomingModal.style.display = "none";

        const call = this.activeCall;
        call.status = "connected";

        // Setup Main Overlay for Callee
        this.nameEl.textContent = call.targetUser.display_name;
        this.avatarEl.src = call.targetUser.avatar_url;
        this.avatarEl.style.display = "block";
        this.typeBadgeEl.innerHTML = call.type === "video" 
            ? '<i class="fa-solid fa-video"></i> Cuộc gọi Video' 
            : '<i class="fa-solid fa-phone"></i> Cuộc gọi thoại';
        this.overlay.style.display = "flex";

        // Notify Caller that we accepted
        window.chatSocket.sendCallSignal({
            action: "call_accepted",
            call_id: call.callId,
            target_user_id: call.targetUser.id,
            conversation_id: call.targetConvId
        });

        // Get local media
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: call.type === "video",
                    audio: true
                });
                this.localStream = stream;
                if (call.type === "video") {
                    this.localScreen.style.display = "block";
                    this.localVideo.srcObject = stream;
                }
            }
        } catch (e) {
            console.warn("[Call] Callee media error:", e.message);
        }

        this.connectCall();
    }

    // ---------------- CALLEE DECLINES CALL ----------------
    declineCall(isTimeout = false) {
        if (!this.activeCall) return;
        if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);

        window.soundManager.stopIncomingRing();
        this.incomingModal.style.display = "none";

        const call = this.activeCall;
        const targetUserId = call.targetUser.id;
        const convId = call.targetConvId;
        const callType = call.type;

        // Notify caller
        window.chatSocket.sendCallSignal({
            action: isTimeout ? "call_timeout" : "call_declined",
            call_id: call.callId,
            target_user_id: targetUserId,
            conversation_id: convId
        });

        // Post record into conversation
        const timeStr = this.getCurrentTimeStr();
        const icon = callType === "video" ? "📹" : "📞";
        const content = isTimeout 
            ? `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} nhỡ lúc ${timeStr}`
            : `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} bị từ chối lúc ${timeStr}`;

        this.logCallMessage(convId, content);

        this.activeCall = null;
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

        this.stateEl.textContent = "Đang trò chuyện";
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
            // Caller cancelled before receiver answered -> Log Missed Call
            window.chatSocket.sendCallSignal({
                action: "call_canceled",
                call_id: call.callId,
                target_user_id: call.targetUser.id,
                conversation_id: convId
            });
            const content = `${icon} Cuộc gọi ${callType === "video" ? "video" : "thoại"} nhỡ lúc ${timeStr}`;
            this.logCallMessage(convId, content);
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
        }

        this.cleanupCall();
    }

    cleanupCall() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.callTimeoutTimer) {
            clearTimeout(this.callTimeoutTimer);
            this.callTimeoutTimer = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.activeCall = null;
        if (this.overlay) this.overlay.style.display = "none";
        if (this.localScreen) this.localScreen.style.display = "none";
        if (this.remoteVideo) this.remoteVideo.style.display = "none";
        if (this.avatarEl) this.avatarEl.style.display = "block";
        if (this.incomingModal) this.incomingModal.style.display = "none";
    }

    // ---------------- WEBRTC IMPLEMENTATION ----------------
    createPeerConnection() {
        const config = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ]
        };

        const pc = new RTCPeerConnection(config);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        pc.onicecandidate = (e) => {
            if (e.candidate && this.activeCall) {
                window.chatSocket.sendCallSignal({
                    action: "webrtc_ice",
                    candidate: e.candidate,
                    target_user_id: this.activeCall.targetUser.id
                });
            }
        };

        pc.ontrack = (e) => {
            if (e.streams && e.streams[0]) {
                if (this.activeCall && this.activeCall.type === "video") {
                    this.remoteVideo.srcObject = e.streams[0];
                    this.remoteVideo.style.display = "block";
                    this.avatarEl.style.display = "none";
                } else {
                    // Audio stream: play audio via audio element
                    const audio = new Audio();
                    audio.srcObject = e.streams[0];
                    audio.play().catch(() => {});
                }
            }
        };

        this.peerConnection = pc;
        return pc;
    }

    async initWebRTCOffer() {
        try {
            const pc = this.createPeerConnection();
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            window.chatSocket.sendCallSignal({
                action: "webrtc_offer",
                sdp: offer,
                target_user_id: this.activeCall.targetUser.id
            });
        } catch (e) {
            console.warn("[WebRTC] Offer error:", e.message);
        }
    }

    async handleWebRTCOffer(sdp) {
        try {
            const pc = this.createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            window.chatSocket.sendCallSignal({
                action: "webrtc_answer",
                sdp: answer,
                target_user_id: this.activeCall.targetUser.id
            });
        } catch (e) {
            console.warn("[WebRTC] Handle offer error:", e.message);
        }
    }

    async handleWebRTCAnswer(sdp) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            }
        } catch (e) {
            console.warn("[WebRTC] Handle answer error:", e.message);
        }
    }

    async handleWebRTCIce(candidate) {
        try {
            if (this.peerConnection && candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (e) {
            console.warn("[WebRTC] Add ice candidate error:", e.message);
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
