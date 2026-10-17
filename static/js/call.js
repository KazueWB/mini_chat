// Voice & Video Call Module for Zalo/Messenger Web
class CallManager {
    constructor() {
        this.activeCall = null;
        this.localStream = null;
        this.timerInterval = null;
        this.secondsElapsed = 0;
        this.isMuted = false;
        this.isCamOff = false;
        
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
    }

    init() {
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

        if (this.btnMic) {
            this.btnMic.addEventListener("click", () => this.toggleMic());
        }
        if (this.btnCam) {
            this.btnCam.addEventListener("click", () => this.toggleCam());
        }
        if (this.btnEnd) {
            this.btnEnd.addEventListener("click", () => this.endCall());
        }
    }

    startCall(type = "video", targetUser = null, targetConv = null) {
        this.init();
        const callTargetName = targetUser ? targetUser.display_name : (targetConv ? targetConv.name : "Người dùng");
        const callTargetAvatar = targetUser ? targetUser.avatar_url : (targetConv ? targetConv.avatar_url : "");

        this.activeCall = {
            type,
            targetUser,
            targetConv,
            status: "calling"
        };

        this.nameEl.textContent = callTargetName;
        this.avatarEl.src = callTargetAvatar;
        this.typeBadgeEl.innerHTML = type === "video" 
            ? '<i class="fa-solid fa-video"></i> Cuộc gọi Video' 
            : '<i class="fa-solid fa-phone"></i> Cuộc gọi thoại';
        this.stateEl.textContent = "Đang đổ chuông...";
        this.timerEl.textContent = "Đang kết nối...";
        this.overlay.style.display = "flex";

        window.soundManager.startRinging();

        // Try getting user media for real camera/mic preview
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({
                video: type === "video",
                audio: true
            }).then(stream => {
                this.localStream = stream;
                if (type === "video") {
                    this.localScreen.style.display = "block";
                    this.localVideo.srcObject = stream;
                }
            }).catch(err => {
                console.log("[Call] Camera/mic permission or device unavailable:", err.message);
            });
        }

        // Notify socket
        window.chatSocket.sendCallSignal({
            action: "call_invite",
            type,
            sender: window.app.currentUser,
            conversation_id: targetConv ? targetConv.id : null,
            target_user_id: targetUser ? targetUser.id : null
        });

        // Auto answer simulation after 3.5s for seamless demo experience!
        setTimeout(() => {
            if (this.activeCall && this.activeCall.status === "calling") {
                this.callConnected();
            }
        }, 3500);
    }

    callConnected() {
        if (!this.activeCall) return;
        this.activeCall.status = "connected";
        window.soundManager.stopRinging();
        this.stateEl.textContent = "Đã kết nối";
        this.secondsElapsed = 0;
        this.updateTimer();
        this.timerInterval = setInterval(() => {
            this.secondsElapsed++;
            this.updateTimer();
        }, 1000);
    }

    updateTimer() {
        const m = Math.floor(this.secondsElapsed / 60).toString().padStart(2, "0");
        const s = (this.secondsElapsed % 60).toString().padStart(2, "0");
        this.timerEl.textContent = `${m}:${s}`;
    }

    toggleMic() {
        this.isMuted = !this.isMuted;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
        }
        if (this.btnMic) {
            this.btnMic.classList.toggle("active-muted", this.isMuted);
            this.btnMic.innerHTML = this.isMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
        }
    }

    toggleCam() {
        this.isCamOff = !this.isCamOff;
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = !this.isCamOff;
            });
        }
        if (this.btnCam) {
            this.btnCam.classList.toggle("active-muted", this.isCamOff);
            this.btnCam.innerHTML = this.isCamOff ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
        }
    }

    endCall() {
        window.soundManager.stopRinging();
        window.soundManager.playEndCall();

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.activeCall) {
            window.chatSocket.sendCallSignal({
                action: "call_end",
                sender: window.app.currentUser,
                conversation_id: this.activeCall.targetConv ? this.activeCall.targetConv.id : null
            });
        }

        this.activeCall = null;
        this.overlay.style.display = "none";
        this.localScreen.style.display = "none";
        this.remoteVideo.style.display = "none";
        this.avatarEl.style.display = "block";
    }

    handleSignal(data) {
        if (data.action === "call_end") {
            if (this.activeCall) {
                this.endCall();
            }
        }
    }
}

window.callManager = new CallManager();
