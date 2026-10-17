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

    // Helper: Request local audio and optional video stream with echo cancellation & noise suppression
    async getLocalMediaStream(type) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("[WebRTC] navigator.mediaDevices.getUserMedia not supported");
            return null;
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
                console.warn("[WebRTC] Video+audio acquisition failed, attempting audio only fallback:", err);
                try {
                    return await navigator.mediaDevices.getUserMedia({
                        audio: audioConstraints,
                        video: false
                    });
                } catch (audioErr) {
                    console.error("[WebRTC] Audio acquisition failed completely:", audioErr);
                    return null;
                }
            }
        } else {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints,
                    video: false
                });
            } catch (err) {
                console.error("[WebRTC] Audio acquisition failed:", err);
                return null;
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

        // Get local audio & video before ringing
        this.localStream = await this.getLocalMediaStream(type);
        if (this.localStream && type === "video" && this.localStream.getVideoTracks().length > 0) {
            this.localScreen.style.display = "block";
            this.localVideo.srcObject = this.localStream;
        } else {
            this.localScreen.style.display = "none";
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
            this.pendingIceCandidates = [];

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
        this.remoteVideo.style.display = "none";
        this.remoteVideo.srcObject = null;
        if (this.remoteAudio) this.remoteAudio.srcObject = null;

        this.typeBadgeEl.innerHTML = call.type === "video" 
            ? '<i class="fa-solid fa-video"></i> Cuộc gọi Video' 
            : '<i class="fa-solid fa-phone"></i> Cuộc gọi thoại';
        this.overlay.style.display = "flex";
        this.stateEl.textContent = "Đang kết nối...";

        // Step 1: CALLEE MUST ACQUIRE LOCAL MEDIA FIRST BEFORE NOTIFYING CALLER
        this.localStream = await this.getLocalMediaStream(call.type);
        if (this.localStream && call.type === "video" && this.localStream.getVideoTracks().length > 0) {
            this.localScreen.style.display = "block";
            this.localVideo.srcObject = this.localStream;
        } else {
            this.localScreen.style.display = "none";
        }

        // Step 2: Now notify Caller that we are ready to negotiate
        window.chatSocket.sendCallSignal({
            action: "call_accepted",
            call_id: call.callId,
            target_user_id: call.targetUser.id,
            conversation_id: call.targetConvId
        });

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
                { urls: "stun:stun2.l.google.com:19302" },
                { urls: "stun:stun3.l.google.com:19302" },
                { urls: "stun:stun4.l.google.com:19302" },
                { urls: "stun:openrelay.metered.ca:80" }
            ],
            iceCandidatePoolSize: 10
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
