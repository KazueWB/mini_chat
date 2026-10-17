// Socket.IO Client Handler for Zalo/Messenger
class ChatSocket {
    constructor() {
        this.socket = null;
        this.currentConvId = null;
        this.typingTimeout = null;
        this.isTyping = false;
    }

    connect(userId) {
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io({
            transports: ["websocket", "polling"]
        });

        this.socket.on("connect", () => {
            console.log("[Socket] Connected to server, ID:", this.socket.id);
            this.socket.emit("join", { user_id: userId, conversation_id: this.currentConvId });
        });

        // Listeners
        this.socket.on("new_message", (msg) => {
            console.log("[Socket] New message:", msg);
            if (window.app) {
                window.app.handleIncomingMessage(msg);
            }
        });

        this.socket.on("reaction_updated", (data) => {
            if (window.app) {
                window.app.handleReactionUpdated(data);
            }
        });

        this.socket.on("message_recalled", (data) => {
            if (window.app) {
                window.app.handleMessageRecalled(data);
            }
        });

        this.socket.on("pin_updated", (data) => {
            if (window.app) {
                window.app.handlePinUpdated(data);
            }
        });

        this.socket.on("typing", (data) => {
            if (window.app && data.conversation_id === this.currentConvId) {
                window.app.showTypingIndicator(data.display_name);
            }
        });

        this.socket.on("stop_typing", (data) => {
            if (window.app && data.conversation_id === this.currentConvId) {
                window.app.hideTypingIndicator();
            }
        });

        this.socket.on("user_status_changed", (data) => {
            if (window.app) {
                window.app.handleUserStatusChanged(data);
            }
        });

        this.socket.on("friend_request_received", (data) => {
            if (window.app) {
                window.app.handleFriendRequestReceived(data);
            }
        });

        this.socket.on("friend_request_accepted", (data) => {
            if (window.app) {
                window.app.handleFriendRequestAccepted(data);
            }
        });

        this.socket.on("call_signal", (data) => {
            if (window.callManager) {
                window.callManager.handleSignal(data);
            }
        });
    }

    joinConversation(convId) {
        if (this.currentConvId && this.socket) {
            this.socket.emit("leave", { conversation_id: this.currentConvId });
        }
        this.currentConvId = convId;
        if (this.socket && convId) {
            this.socket.emit("join", { conversation_id: convId });
        }
    }

    sendTyping(user) {
        if (!this.socket || !this.currentConvId) return;

        if (!this.isTyping) {
            this.isTyping = true;
            this.socket.emit("typing", {
                conversation_id: this.currentConvId,
                user_id: user.id,
                display_name: user.display_name
            });
        }

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.stopTyping(user);
        }, 2000);
    }

    stopTyping(user) {
        if (!this.socket || !this.currentConvId || !this.isTyping) return;
        this.isTyping = false;
        this.socket.emit("stop_typing", {
            conversation_id: this.currentConvId,
            user_id: user.id
        });
    }

    sendCallSignal(signalData) {
        if (this.socket) {
            this.socket.emit("call_signal", signalData);
        }
    }
}

window.chatSocket = new ChatSocket();
