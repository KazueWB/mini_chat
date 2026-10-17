// Zalo & Messenger Web - Main Frontend Application
class ChatApp {
    constructor() {
        this.currentUser = null;
        this.allUsers = [];
        this.conversations = [];
        this.activeConv = null;
        this.activeFilter = "all"; // 'all', 'unread', 'group'
        this.replyTarget = null;
        this.isRecordingVoice = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.searchQuery = "";

        // UI elements
        this.initDOMElements();
        this.initEmojiPicker();
        this.initEventListeners();
    }

    initDOMElements() {
        // Nav elements
        this.myAvatar = document.getElementById("my-avatar");
        this.myStatusDot = document.getElementById("my-status-dot");
        this.globalUnreadBadge = document.getElementById("global-unread-badge");
        this.themeToggleBtn = document.getElementById("theme-toggle-btn");
        this.switchAccountBtn = document.getElementById("switch-account-btn");
        this.audioToggleBtn = document.getElementById("audio-toggle-btn");

        // Sidebar
        this.searchInput = document.getElementById("search-input");
        this.clearSearchBtn = document.getElementById("clear-search-btn");
        this.conversationsList = document.getElementById("conversations-list");
        this.contactsContainer = document.getElementById("contacts-container");
        this.convListContainer = document.getElementById("conv-list-container");
        this.contactsList = document.getElementById("contacts-list");

        // Main Chat
        this.chatMain = document.getElementById("chat-main");
        this.chatEmptyState = document.getElementById("chat-empty-state");
        this.chatActiveContainer = document.getElementById("chat-active-container");
        this.chatHeaderAvatar = document.getElementById("chat-header-avatar");
        this.chatHeaderName = document.getElementById("chat-header-name");
        this.chatHeaderStatusDot = document.getElementById("chat-header-status-dot");
        this.chatHeaderStatusText = document.getElementById("chat-header-status-text");

        this.pinnedBanner = document.getElementById("pinned-banner");
        this.pinnedBannerText = document.getElementById("pinned-banner-text");
        this.btnUnpinBanner = document.getElementById("btn-unpin-banner");

        this.messagesViewport = document.getElementById("messages-viewport");
        this.messagesStream = document.getElementById("messages-stream");
        this.typingIndicator = document.getElementById("typing-indicator");
        this.typingText = document.getElementById("typing-text");

        this.replyPreviewBar = document.getElementById("reply-preview-bar");
        this.replyToName = document.getElementById("reply-to-name");
        this.replyToContent = document.getElementById("reply-to-content");
        this.btnCancelReply = document.getElementById("btn-cancel-reply");

        this.messageInput = document.getElementById("message-input");
        this.btnSendMessage = document.getElementById("btn-send-message");
        this.imageFileInput = document.getElementById("image-file-input");
        this.docFileInput = document.getElementById("doc-file-input");
        this.btnVoiceRecord = document.getElementById("btn-voice-record");

        // Info Sidebar
        this.chatInfoSidebar = document.getElementById("chat-info-sidebar");
        this.btnToggleInfo = document.getElementById("btn-toggle-info");
        this.btnCloseInfoSidebar = document.getElementById("btn-close-info-sidebar");
        this.infoAvatar = document.getElementById("info-avatar");
        this.infoName = document.getElementById("info-name");
        this.infoSub = document.getElementById("info-sub");
        this.infoMembersCount = document.getElementById("info-members-count");
        this.infoMembersList = document.getElementById("info-members-list");
        this.infoMediaGallery = document.getElementById("info-media-gallery");

        // Modals
        this.modalSwitchUser = document.getElementById("modal-switch-user");
        this.modalCreateGroup = document.getElementById("modal-create-group");
        this.modalNewChat = document.getElementById("modal-new-chat");
        this.imageLightbox = document.getElementById("image-lightbox");
        this.lightboxImg = document.getElementById("lightbox-img");
        this.lightboxDownloadLink = document.getElementById("lightbox-download-link");
    }

    async init() {
        // Load theme preference
        const savedTheme = localStorage.getItem("chat_theme") || "theme-light";
        document.body.className = savedTheme;
        this.updateThemeIcon(savedTheme);

        await this.loadCurrentUser();
        await this.loadUsers();
        await this.loadConversations();

        // Connect socket
        window.chatSocket.connect(this.currentUser.id);

        // Open first conversation by default if available
        if (this.conversations.length > 0) {
            this.selectConversation(this.conversations[0].id);
        }
    }

    // ---------------- AUTH & USER ----------------
    async loadCurrentUser() {
        try {
            const res = await fetch("/api/me");
            this.currentUser = await res.json();
            this.myAvatar.src = this.currentUser.avatar_url;
            this.myStatusDot.className = `status-indicator ${this.currentUser.status || 'online'}`;
        } catch (err) {
            console.error("Failed to load current user:", err);
        }
    }

    async loadUsers() {
        try {
            const res = await fetch("/api/users");
            this.allUsers = await res.json();
            this.renderContactsList();
        } catch (err) {
            console.error("Failed to load users:", err);
        }
    }

    async switchUser(userId) {
        try {
            const res = await fetch("/api/switch-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId })
            });
            const data = await res.json();
            if (data.success) {
                this.currentUser = data.user;
                this.myAvatar.src = this.currentUser.avatar_url;
                this.myStatusDot.className = `status-indicator ${this.currentUser.status || 'online'}`;
                window.chatSocket.connect(this.currentUser.id);
                this.closeModal(this.modalSwitchUser);
                await this.loadConversations();
                if (this.conversations.length > 0) {
                    this.selectConversation(this.conversations[0].id);
                }
            }
        } catch (err) {
            console.error("Failed to switch user:", err);
        }
    }

    // ---------------- CONVERSATIONS ----------------
    async loadConversations() {
        try {
            const res = await fetch("/api/conversations");
            this.conversations = await res.json();
            this.renderConversations();
            this.updateGlobalUnreadBadge();
        } catch (err) {
            console.error("Failed to load conversations:", err);
        }
    }

    renderConversations() {
        this.conversationsList.innerHTML = "";

        const filtered = this.conversations.filter(c => {
            if (this.activeFilter === "unread" && (!c.unread_count || c.unread_count === 0)) return false;
            if (this.activeFilter === "group" && c.type !== "group") return false;
            if (this.searchQuery) {
                const q = this.searchQuery.toLowerCase();
                const title = (c.name || "").toLowerCase();
                const snippet = (c.last_message?.content || "").toLowerCase();
                return title.includes(q) || snippet.includes(q);
            }
            return true;
        });

        if (filtered.length === 0) {
            this.conversationsList.innerHTML = `<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px;">Không tìm thấy cuộc trò chuyện nào</div>`;
            return;
        }

        filtered.forEach(conv => {
            const item = document.createElement("div");
            item.className = `conv-item ${this.activeConv?.conversation?.id === conv.id ? 'active' : ''} ${conv.unread_count > 0 ? 'unread' : ''}`;
            item.dataset.id = conv.id;

            const timeStr = conv.last_message ? this.formatRelativeTime(conv.last_message.created_at) : "";
            const snippetStr = conv.last_message ? (conv.last_message.is_recalled ? "Tin nhắn đã thu hồi" : (conv.last_message.message_type === 'image' ? '📷 [Hình ảnh]' : (conv.last_message.message_type === 'file' ? '📎 [Tệp tin]' : (conv.last_message.message_type === 'audio' ? '🎤 [Tin nhắn thoại]' : conv.last_message.content)))) : "Chưa có tin nhắn";

            item.innerHTML = `
                <div class="conv-avatar-box">
                    <img src="${conv.avatar_url || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + conv.id}" alt="${conv.name}" class="avatar-circle">
                    ${conv.type === 'direct' ? `<span class="status-indicator ${conv.status || 'offline'}"></span>` : ''}
                </div>
                <div class="conv-details">
                    <div class="conv-row-top">
                        <span class="conv-name">${this.escapeHTML(conv.name || 'Hội thoại')}</span>
                        <span class="conv-time">${timeStr}</span>
                    </div>
                    <div class="conv-row-bottom">
                        <span class="conv-snippet">${this.escapeHTML(snippetStr)}</span>
                        ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
                    </div>
                </div>
            `;

            item.addEventListener("click", () => this.selectConversation(conv.id));
            this.conversationsList.appendChild(item);
        });
    }

    async selectConversation(convId) {
        try {
            const res = await fetch(`/api/conversations/${convId}/messages`);
            const data = await res.json();
            if (data.error) return;

            this.activeConv = data;
            window.chatSocket.joinConversation(convId);

            // Update UI
            this.chatEmptyState.style.display = "none";
            this.chatActiveContainer.style.display = "flex";
            this.chatMain.classList.add("mobile-active");

            // Update Header
            const conv = data.conversation;
            let title = conv.name;
            let avatar = conv.avatar_url;
            let statusText = "Đang hoạt động";
            let statusDotClass = "online";

            if (conv.type === "direct") {
                const other = data.participants.find(p => p.id !== this.currentUser.id);
                if (other) {
                    title = other.display_name;
                    avatar = other.avatar_url;
                    statusText = other.status === "online" ? "Đang hoạt động" : (other.status === "busy" ? "Bận" : "Vắng mặt");
                    statusDotClass = other.status || "offline";
                }
            } else {
                title = conv.name;
                avatar = conv.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${conv.id}`;
                statusText = `${data.participants.length} thành viên`;
                statusDotClass = "group";
            }

            this.chatHeaderName.textContent = title;
            this.chatHeaderAvatar.src = avatar;
            this.chatHeaderStatusDot.className = `status-indicator ${statusDotClass}`;
            this.chatHeaderStatusText.textContent = statusText;

            // Pinned Messages Banner
            this.renderPinnedBanner(data.pinned);

            // Render Messages
            this.renderMessages(data.messages);
            this.scrollToBottom();

            // Populate Info Sidebar
            this.populateInfoSidebar();

            // Highlight conversation in list
            document.querySelectorAll(".conv-item").forEach(el => {
                el.classList.toggle("active", el.dataset.id == convId);
                if (el.dataset.id == convId) {
                    el.classList.remove("unread");
                    const badge = el.querySelector(".unread-badge");
                    if (badge) badge.remove();
                }
            });

            // Update local unread counter in conversation object
            const localC = this.conversations.find(c => c.id === convId);
            if (localC) localC.unread_count = 0;
            this.updateGlobalUnreadBadge();

        } catch (err) {
            console.error("Failed to load conversation:", err);
        }
    }

    renderPinnedBanner(pinnedList) {
        if (!pinnedList || pinnedList.length === 0) {
            this.pinnedBanner.style.display = "none";
            return;
        }
        const latestPin = pinnedList[pinnedList.length - 1];
        this.pinnedBanner.style.display = "flex";
        this.pinnedBannerText.textContent = latestPin.content;
        this.pinnedBanner.onclick = () => {
            const el = document.getElementById(`msg-${latestPin.message_id}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.style.backgroundColor = "rgba(0, 104, 255, 0.15)";
                setTimeout(() => el.style.backgroundColor = "", 1500);
            }
        };
    }

    renderMessages(messages) {
        this.messagesStream.innerHTML = "";
        let lastDate = "";

        messages.forEach(msg => {
            const msgDate = this.formatDateSeparator(msg.created_at);
            if (msgDate !== lastDate) {
                const dateEl = document.createElement("div");
                dateEl.className = "date-separator";
                dateEl.innerHTML = `<span class="date-pill">${msgDate}</span>`;
                this.messagesStream.appendChild(dateEl);
                lastDate = msgDate;
            }

            const row = this.createMessageElement(msg);
            this.messagesStream.appendChild(row);
        });
    }

    createMessageElement(msg) {
        const row = document.createElement("div");
        const isMe = msg.sender_id === this.currentUser.id;
        const isSystem = msg.message_type === "system";

        row.id = `msg-${msg.id}`;
        row.className = `msg-row ${isSystem ? 'system' : (isMe ? 'outgoing' : 'incoming')}`;

        if (isSystem) {
            row.innerHTML = `<div class="msg-system-bubble">${this.escapeHTML(msg.content)}</div>`;
            return row;
        }

        const isGroup = this.activeConv?.conversation?.type === "group";
        const showAvatar = !isMe;
        const showSenderName = !isMe && isGroup;

        let contentHTML = "";
        if (msg.is_recalled) {
            contentHTML = `<span class="msg-recalled"><i class="fa-solid fa-clock-rotate-left"></i> ${this.escapeHTML(msg.content)}</span>`;
        } else {
            // Check reply quote
            let replyQuoteHTML = "";
            if (msg.reply_to) {
                replyQuoteHTML = `
                    <div class="msg-reply-quote" onclick="window.app.jumpToMessage(${msg.reply_to.id})">
                        <div class="reply-quote-sender">${this.escapeHTML(msg.reply_to.sender_name)}</div>
                        <div class="reply-quote-content">${this.escapeHTML(msg.reply_to.content || 'Nội dung đính kèm')}</div>
                    </div>
                `;
            }

            // Check media type
            let mediaHTML = "";
            if (msg.message_type === "image" && msg.media_url) {
                mediaHTML = `<img src="${msg.media_url}" alt="Ảnh" class="msg-media-img" onclick="window.app.openLightbox('${msg.media_url}')">`;
            } else if (msg.message_type === "file" && msg.media_url) {
                mediaHTML = `
                    <a href="${msg.media_url}" download="${this.escapeHTML(msg.media_name || 'file')}" class="msg-file-card" target="_blank">
                        <i class="fa-solid fa-file-arrow-down file-icon"></i>
                        <div class="file-meta">
                            <div class="file-name">${this.escapeHTML(msg.media_name || 'Tệp đính kèm')}</div>
                            <div class="file-size">${msg.media_size || ''}</div>
                        </div>
                        <i class="fa-solid fa-download file-download-btn"></i>
                    </a>
                `;
            } else if (msg.message_type === "audio" && msg.media_url) {
                mediaHTML = `
                    <div class="audio-player-box">
                        <button class="audio-play-btn" onclick="window.app.playAudio(this, '${msg.media_url}')">
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <div class="waveform-sim">
                            <div class="waveform-bar" style="height: 40%;"></div>
                            <div class="waveform-bar" style="height: 70%;"></div>
                            <div class="waveform-bar" style="height: 100%;"></div>
                            <div class="waveform-bar" style="height: 60%;"></div>
                            <div class="waveform-bar" style="height: 85%;"></div>
                            <div class="waveform-bar" style="height: 50%;"></div>
                            <div class="waveform-bar" style="height: 90%;"></div>
                            <div class="waveform-bar" style="height: 65%;"></div>
                        </div>
                    </div>
                `;
            }

            contentHTML = `
                ${replyQuoteHTML}
                ${msg.content ? `<div>${this.escapeHTML(msg.content)}</div>` : ''}
                ${mediaHTML}
            `;
        }

        // Reactions badges HTML
        const reactionsHTML = this.renderReactionsBadges(msg.reactions);

        const timeStr = this.formatTimeOnly(msg.created_at);

        row.innerHTML = `
            ${showAvatar ? `<img src="${msg.sender_avatar}" alt="${msg.sender_name}" class="msg-avatar" title="${msg.sender_name}">` : ''}
            <div class="msg-bubble-wrap">
                ${showSenderName ? `<span class="msg-sender-name">${this.escapeHTML(msg.sender_name)}</span>` : ''}
                <div class="msg-bubble">
                    ${contentHTML}
                    ${reactionsHTML}
                    
                    <!-- Hover Action Toolbar -->
                    <div class="msg-actions-toolbar">
                        <button class="action-tool-btn" title="Thả tim" onclick="window.app.reactMessage(${msg.id}, '❤️')">❤️</button>
                        <button class="action-tool-btn" title="Thích" onclick="window.app.reactMessage(${msg.id}, '👍')">👍</button>
                        <button class="action-tool-btn" title="Cười" onclick="window.app.reactMessage(${msg.id}, '😂')">😂</button>
                        <button class="action-tool-btn" title="Ngạc nhiên" onclick="window.app.reactMessage(${msg.id}, '😮')">😮</button>
                        <button class="action-tool-btn" title="Trả lời" onclick="window.app.setReplyMessage(${msg.id})"><i class="fa-solid fa-reply"></i></button>
                        <button class="action-tool-btn" title="Ghim tin nhắn" onclick="window.app.pinMessage(${msg.id})"><i class="fa-solid fa-thumbtack"></i></button>
                        ${isMe && !msg.is_recalled ? `<button class="action-tool-btn" title="Thu hồi tin nhắn" onclick="window.app.recallMessage(${msg.id})"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
                    </div>
                </div>
                <div class="msg-meta">
                    <span>${timeStr}</span>
                    ${isMe ? `<span class="msg-status-tick"><i class="fa-solid fa-check-double"></i></span>` : ''}
                </div>
            </div>
        `;

        return row;
    }

    renderReactionsBadges(reactions) {
        if (!reactions || reactions.length === 0) return "";
        // Group by emoji
        const counts = {};
        reactions.forEach(r => {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        });

        const badges = Object.keys(counts).map(emoji => `
            <span class="rx-badge">${emoji} <span>${counts[emoji]}</span></span>
        `).join("");

        return `<div class="msg-reactions-bar">${badges}</div>`;
    }

    // ---------------- SENDING MESSAGES & UPLOADS ----------------
    async sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text || !this.activeConv) return;

        const convId = this.activeConv.conversation.id;
        const payload = {
            content: text,
            message_type: "text",
            reply_to_id: this.replyTarget ? this.replyTarget.id : null
        };

        this.messageInput.value = "";
        this.messageInput.style.height = "auto";
        this.cancelReply();
        window.chatSocket.stopTyping(this.currentUser);

        try {
            const res = await fetch(`/api/conversations/${convId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const msg = await res.json();
            window.soundManager.playSent();
        } catch (err) {
            console.error("Failed to send message:", err);
        }
    }

    async handleFileUpload(file) {
        if (!file || !this.activeConv) return;
        const convId = this.activeConv.conversation.id;

        const formData = new FormData();
        formData.append("file", file);

        try {
            const uploadRes = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });
            const uploadData = await uploadRes.json();
            if (uploadData.error) {
                alert("Tải tệp thất bại: " + uploadData.error);
                return;
            }

            const payload = {
                content: "",
                message_type: uploadData.type,
                media_url: uploadData.url,
                media_name: uploadData.name,
                media_size: uploadData.size,
                reply_to_id: this.replyTarget ? this.replyTarget.id : null
            };

            await fetch(`/api/conversations/${convId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            window.soundManager.playSent();
            this.cancelReply();
        } catch (err) {
            console.error("Failed to upload and send file:", err);
        }
    }

    // ---------------- VOICE RECORDING SIMULATION ----------------
    async toggleVoiceRecording() {
        if (this.isRecordingVoice) {
            this.stopVoiceRecording();
        } else {
            this.startVoiceRecording();
        }
    }

    async startVoiceRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Trình duyệt không hỗ trợ ghi âm trực tiếp.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
                const audioFile = new File([audioBlob], `voicenote_${Date.now()}.webm`, { type: "audio/webm" });
                await this.handleFileUpload(audioFile);
                stream.getTracks().forEach(t => t.stop());
            };

            this.mediaRecorder.start();
            this.isRecordingVoice = true;
            this.btnVoiceRecord.classList.add("recording");
        } catch (err) {
            console.log("Mic access not granted, using simulated voice clip demo");
            // Simulate voice sending
            this.isRecordingVoice = true;
            this.btnVoiceRecord.classList.add("recording");
            setTimeout(() => {
                this.stopVoiceRecording();
            }, 3000);
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
        } else {
            // Simulated voice note
            if (this.activeConv) {
                const convId = this.activeConv.conversation.id;
                fetch(`/api/conversations/${convId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content: "",
                        message_type: "audio",
                        media_url: "https://www.w3schools.com/html/horse.mp3",
                        media_name: "VoiceNote.mp3",
                        media_size: "0:05"
                    })
                });
                window.soundManager.playSent();
            }
        }
        this.isRecordingVoice = false;
        this.btnVoiceRecord.classList.remove("recording");
    }

    playAudio(btn, url) {
        const audio = new Audio(url);
        btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        audio.play();
        audio.onended = () => {
            btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        };
    }

    // ---------------- REACTIONS, PIN, RECALL ----------------
    async reactMessage(msgId, emoji) {
        try {
            await fetch(`/api/messages/${msgId}/react`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emoji })
            });
        } catch (err) {
            console.error("Failed to react:", err);
        }
    }

    async recallMessage(msgId) {
        if (!confirm("Bạn có chắc chắn muốn thu hồi tin nhắn này không?")) return;
        try {
            await fetch(`/api/messages/${msgId}/recall`, { method: "POST" });
        } catch (err) {
            console.error("Failed to recall:", err);
        }
    }

    async pinMessage(msgId) {
        if (!this.activeConv) return;
        const convId = this.activeConv.conversation.id;
        try {
            await fetch(`/api/conversations/${convId}/pin/${msgId}`, { method: "POST" });
        } catch (err) {
            console.error("Failed to pin:", err);
        }
    }

    setReplyMessage(msgId) {
        const msg = this.activeConv?.messages?.find(m => m.id === msgId);
        if (!msg) return;
        this.replyTarget = msg;
        this.replyToName.textContent = `Đang trả lời ${msg.sender_name}`;
        this.replyToContent.textContent = msg.content || (msg.message_type === 'image' ? '[Hình ảnh]' : '[Tệp tin]');
        this.replyPreviewBar.style.display = "flex";
        this.messageInput.focus();
    }

    cancelReply() {
        this.replyTarget = null;
        this.replyPreviewBar.style.display = "none";
    }

    jumpToMessage(msgId) {
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.backgroundColor = "rgba(0, 104, 255, 0.15)";
            setTimeout(() => el.style.backgroundColor = "", 1500);
        }
    }

    // ---------------- REALTIME EVENT DISPATCH ----------------
    handleIncomingMessage(msg) {
        // If current active conversation, append message
        if (this.activeConv && this.activeConv.conversation.id === msg.conversation_id) {
            this.activeConv.messages.push(msg);
            const row = this.createMessageElement(msg);
            this.messagesStream.appendChild(row);
            this.scrollToBottom();

            if (msg.sender_id !== this.currentUser.id) {
                window.soundManager.playReceived();
            }
        } else {
            // Unread in another conversation
            const conv = this.conversations.find(c => c.id === msg.conversation_id);
            if (conv) {
                conv.unread_count = (conv.unread_count || 0) + 1;
                conv.last_message = msg;
                this.renderConversations();
                this.updateGlobalUnreadBadge();
                window.soundManager.playReceived();
            }
        }
    }

    handleReactionUpdated(data) {
        if (this.activeConv && this.activeConv.conversation.id === data.conversation_id) {
            const msg = this.activeConv.messages.find(m => m.id === data.message_id);
            if (msg) {
                msg.reactions = data.reactions;
                const bubble = document.querySelector(`#msg-${data.message_id} .msg-bubble`);
                if (bubble) {
                    let rxBar = bubble.querySelector(".msg-reactions-bar");
                    const newRxHTML = this.renderReactionsBadges(data.reactions);
                    if (rxBar) {
                        rxBar.outerHTML = newRxHTML;
                    } else if (newRxHTML) {
                        bubble.insertAdjacentHTML("beforeend", newRxHTML);
                    }
                }
            }
        }
    }

    handleMessageRecalled(data) {
        if (this.activeConv && this.activeConv.conversation.id === data.conversation_id) {
            const msg = this.activeConv.messages.find(m => m.id === data.message_id);
            if (msg) {
                msg.is_recalled = 1;
                msg.content = "Tin nhắn đã được thu hồi";
                const row = document.getElementById(`msg-${data.message_id}`);
                if (row) {
                    const newRow = this.createMessageElement(msg);
                    row.replaceWith(newRow);
                }
            }
        }
    }

    handlePinUpdated(data) {
        if (this.activeConv && this.activeConv.conversation.id === data.conversation_id) {
            this.activeConv.pinned = data.pinned;
            this.renderPinnedBanner(data.pinned);
        }
    }

    showTypingIndicator(name) {
        this.typingText.textContent = `${name} đang soạn tin...`;
        this.typingIndicator.style.display = "flex";
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.typingIndicator.style.display = "none";
    }

    handleUserStatusChanged(data) {
        const user = this.allUsers.find(u => u.id === data.user_id);
        if (user) {
            user.status = data.status;
            if (data.bio) user.bio = data.bio;
        }
        this.renderContactsList();
    }

    // ---------------- INFO SIDEBAR & MEDIA GALLERY ----------------
    populateInfoSidebar() {
        if (!this.activeConv) return;
        const conv = this.activeConv.conversation;
        const isDirect = conv.type === "direct";
        const other = isDirect ? this.activeConv.participants.find(p => p.id !== this.currentUser.id) : null;

        this.infoAvatar.src = isDirect && other ? other.avatar_url : conv.avatar_url;
        this.infoName.textContent = isDirect && other ? other.display_name : conv.name;
        this.infoSub.textContent = isDirect && other ? (other.bio || other.status) : `${this.activeConv.participants.length} thành viên`;

        this.infoMembersCount.textContent = this.activeConv.participants.length;
        this.infoMembersList.innerHTML = this.activeConv.participants.map(p => `
            <div class="member-item">
                <img src="${p.avatar_url}" alt="${p.display_name}" class="avatar-circle-sm">
                <span class="member-name">${this.escapeHTML(p.display_name)} ${p.id === this.currentUser.id ? '(Bạn)' : ''}</span>
                ${p.role === 'admin' ? '<span class="member-role-badge">Trưởng nhóm</span>' : ''}
            </div>
        `).join("");

        // Populate media gallery with sent images
        const images = this.activeConv.messages.filter(m => m.message_type === "image" && m.media_url);
        if (images.length === 0) {
            this.infoMediaGallery.innerHTML = `<span style="grid-column: span 3; font-size:12px; color:var(--text-muted); text-align:center; padding:10px 0;">Chưa có ảnh nào</span>`;
        } else {
            this.infoMediaGallery.innerHTML = images.map(img => `
                <img src="${img.media_url}" alt="Ảnh" class="media-gallery-thumb" onclick="window.app.openLightbox('${img.media_url}')">
            `).join("");
        }
    }

    // ---------------- CONTACTS & MODALS ----------------
    renderContactsList() {
        this.contactsList.innerHTML = this.allUsers
            .filter(u => u.id !== this.currentUser?.id)
            .map(u => `
                <div class="contact-item" onclick="window.app.startDirectChatWith(${u.id})">
                    <div class="conv-avatar-box">
                        <img src="${u.avatar_url}" alt="${u.display_name}" class="avatar-circle">
                        <span class="status-indicator ${u.status || 'offline'}"></span>
                    </div>
                    <div class="contact-info">
                        <div class="contact-name">${this.escapeHTML(u.display_name)}</div>
                        <div class="contact-bio">${this.escapeHTML(u.bio || 'Chưa cập nhật tiểu sử')}</div>
                    </div>
                </div>
            `).join("");
    }

    async startDirectChatWith(userId) {
        try {
            const res = await fetch("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "direct", members: [userId] })
            });
            const data = await res.json();
            if (data.id) {
                await this.loadConversations();
                this.selectConversation(data.id);
                // switch to messages tab
                this.switchNavTab("messages");
            }
        } catch (err) {
            console.error("Failed to start direct chat:", err);
        }
    }

    openSwitchUserModal() {
        const container = document.getElementById("user-picker-list");
        container.innerHTML = this.allUsers.map(u => `
            <div class="user-select-row ${u.id === this.currentUser?.id ? 'current-active' : ''}" onclick="window.app.switchUser(${u.id})">
                <img src="${u.avatar_url}" alt="${u.display_name}" class="avatar-circle">
                <div class="user-select-info">
                    <div class="user-select-name">${this.escapeHTML(u.display_name)} ${u.id === this.currentUser?.id ? '(Hiện tại)' : ''}</div>
                    <div class="user-select-bio">${this.escapeHTML(u.bio || '')}</div>
                </div>
            </div>
        `).join("");
        this.openModal(this.modalSwitchUser);
    }

    openCreateGroupModal() {
        const checklist = document.getElementById("group-members-checklist");
        checklist.innerHTML = this.allUsers
            .filter(u => u.id !== this.currentUser?.id)
            .map(u => `
                <label class="user-select-row" style="cursor:pointer;">
                    <input type="checkbox" value="${u.id}" class="group-member-checkbox" style="width:18px; height:18px; accent-color:var(--primary); margin-right:8px;">
                    <img src="${u.avatar_url}" alt="${u.display_name}" class="avatar-circle-sm">
                    <span style="font-size:14px; font-weight:500;">${this.escapeHTML(u.display_name)}</span>
                </label>
            `).join("");
        this.openModal(this.modalCreateGroup);
    }

    async confirmCreateGroup() {
        const nameInput = document.getElementById("new-group-name");
        const name = nameInput.value.trim();
        if (!name) {
            alert("Vui lòng nhập tên nhóm!");
            return;
        }

        const checkedBoxes = document.querySelectorAll(".group-member-checkbox:checked");
        const members = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
        if (members.length === 0) {
            alert("Vui lòng chọn ít nhất 1 thành viên vào nhóm!");
            return;
        }

        try {
            const res = await fetch("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "group", name, members })
            });
            const data = await res.json();
            if (data.id) {
                nameInput.value = "";
                this.closeModal(this.modalCreateGroup);
                await this.loadConversations();
                this.selectConversation(data.id);
            }
        } catch (err) {
            console.error("Failed to create group:", err);
        }
    }

    openNewChatModal() {
        const container = document.getElementById("new-chat-friends-list");
        container.innerHTML = this.allUsers
            .filter(u => u.id !== this.currentUser?.id)
            .map(u => `
                <div class="user-select-row" onclick="window.app.startDirectChatWith(${u.id}); window.app.closeModal(window.app.modalNewChat);">
                    <img src="${u.avatar_url}" alt="${u.display_name}" class="avatar-circle">
                    <div class="user-select-info">
                        <div class="user-select-name">${this.escapeHTML(u.display_name)}</div>
                        <div class="user-select-bio">${this.escapeHTML(u.bio || '')}</div>
                    </div>
                </div>
            `).join("");
        this.openModal(this.modalNewChat);
    }

    openLightbox(url) {
        this.lightboxImg.src = url;
        this.lightboxDownloadLink.href = url;
        this.imageLightbox.style.display = "flex";
    }

    closeLightbox() {
        this.imageLightbox.style.display = "none";
    }

    openModal(modalEl) {
        modalEl.style.display = "flex";
    }

    closeModal(modalEl) {
        modalEl.style.display = "none";
    }

    // ---------------- EMOJI PICKER ----------------
    initEmojiPicker() {
        this.emojiCategories = {
            smileys: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐"],
            gestures: ["👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🖖", "👏", "🙌", "👐", "🤲", "🤝", "🙏"],
            hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"],
            fun: ["🎉", "🎊", "🎈", "🎂", "🎁", "🎆", "🎇", "✨", "🔥", "⭐", "🌟", "💫", "🏆", "🥇", "🥈", "🥉", "🍕", "🍔", "🍟", "🧋", "☕", "🍺", "🥂"]
        };

        const grid = document.getElementById("emoji-grid");
        this.renderEmojiCategory("smileys");

        document.querySelectorAll(".emoji-cat-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".emoji-cat-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.renderEmojiCategory(btn.dataset.cat);
            });
        });
    }

    renderEmojiCategory(cat) {
        const grid = document.getElementById("emoji-grid");
        const list = this.emojiCategories[cat] || [];
        grid.innerHTML = list.map(e => `
            <button class="emoji-item" onclick="window.app.insertEmoji('${e}')">${e}</button>
        `).join("");
    }

    insertEmoji(emoji) {
        this.messageInput.value += emoji;
        this.messageInput.focus();
    }

    // ---------------- EVENT LISTENERS ----------------
    initEventListeners() {
        // Send message
        this.btnSendMessage.addEventListener("click", () => this.sendMessage());
        this.messageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            } else {
                window.chatSocket.sendTyping(this.currentUser);
            }
        });

        // Cancel Reply
        this.btnCancelReply.addEventListener("click", () => this.cancelReply());

        // File inputs
        this.imageFileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                this.handleFileUpload(e.target.files[0]);
                e.target.value = "";
            }
        });
        this.docFileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                this.handleFileUpload(e.target.files[0]);
                e.target.value = "";
            }
        });

        // Voice record
        this.btnVoiceRecord.addEventListener("click", () => this.toggleVoiceRecording());

        // Emoji Toggle
        const emojiToggle = document.getElementById("btn-emoji-picker-toggle");
        const emojiPopup = document.getElementById("emoji-picker-popup");
        emojiToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            emojiPopup.style.display = emojiPopup.style.display === "none" ? "block" : "none";
        });
        document.addEventListener("click", (e) => {
            if (!emojiPopup.contains(e.target) && e.target !== emojiToggle) {
                emojiPopup.style.display = "none";
            }
        });

        // Filter tabs
        document.querySelectorAll(".tab-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                document.querySelectorAll(".tab-pill").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                this.activeFilter = pill.dataset.filter;
                this.renderConversations();
            });
        });

        // Search conversations
        this.searchInput.addEventListener("input", (e) => {
            this.searchQuery = e.target.value.trim();
            this.clearSearchBtn.style.display = this.searchQuery ? "block" : "none";
            this.renderConversations();
        });
        this.clearSearchBtn.addEventListener("click", () => {
            this.searchInput.value = "";
            this.searchQuery = "";
            this.clearSearchBtn.style.display = "none";
            this.renderConversations();
        });

        // Theme toggle
        this.themeToggleBtn.addEventListener("click", () => {
            const isDark = document.body.classList.contains("theme-dark");
            const newTheme = isDark ? "theme-light" : "theme-dark";
            document.body.className = newTheme;
            localStorage.setItem("chat_theme", newTheme);
            this.updateThemeIcon(newTheme);
        });

        // Audio toggle
        this.audioToggleBtn.addEventListener("click", () => {
            window.soundManager.enabled = !window.soundManager.enabled;
            this.audioToggleBtn.innerHTML = window.soundManager.enabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
        });

        // Navigation Menu tabs
        document.querySelectorAll(".nav-btn[data-tab]").forEach(btn => {
            btn.addEventListener("click", () => {
                this.switchNavTab(btn.dataset.tab);
            });
        });

        // Quick action buttons
        document.querySelectorAll("[data-action='new-group'], #btn-quick-new-group, #btn-empty-new-group").forEach(el => {
            el.addEventListener("click", () => this.openCreateGroupModal());
        });
        document.getElementById("btn-quick-new-chat").addEventListener("click", () => this.openNewChatModal());
        document.getElementById("btn-empty-new-chat").addEventListener("click", () => this.openNewChatModal());
        document.getElementById("switch-account-btn").addEventListener("click", () => this.openSwitchUserModal());
        document.getElementById("user-avatar-btn").addEventListener("click", () => this.openSwitchUserModal());

        // Create group confirmation
        document.getElementById("btn-confirm-create-group").addEventListener("click", () => this.confirmCreateGroup());

        // Modal close buttons
        document.querySelectorAll(".modal-close-btn, [data-modal]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const modalId = btn.getAttribute("data-modal");
                if (modalId) {
                    const m = document.getElementById(modalId);
                    if (m) this.closeModal(m);
                }
            });
        });

        // Lightbox close
        document.getElementById("btn-close-lightbox").addEventListener("click", () => this.closeLightbox());
        this.imageLightbox.addEventListener("click", (e) => {
            if (e.target === this.imageLightbox) this.closeLightbox();
        });

        // Conversation Info Sidebar toggle
        this.btnToggleInfo.addEventListener("click", () => {
            this.chatInfoSidebar.classList.toggle("open");
        });
        this.btnCloseInfoSidebar.addEventListener("click", () => {
            this.chatInfoSidebar.classList.remove("open");
        });

        // Mobile back button
        document.getElementById("btn-back-to-list").addEventListener("click", () => {
            this.chatMain.classList.remove("mobile-active");
        });

        // Call buttons
        document.getElementById("btn-call-audio").addEventListener("click", () => {
            if (!this.activeConv) return;
            const other = this.activeConv.conversation.type === "direct" 
                ? this.activeConv.participants.find(p => p.id !== this.currentUser.id) 
                : null;
            window.callManager.startCall("audio", other, this.activeConv.conversation);
        });

        document.getElementById("btn-call-video").addEventListener("click", () => {
            if (!this.activeConv) return;
            const other = this.activeConv.conversation.type === "direct" 
                ? this.activeConv.participants.find(p => p.id !== this.currentUser.id) 
                : null;
            window.callManager.startCall("video", other, this.activeConv.conversation);
        });
    }

    switchNavTab(tab) {
        document.querySelectorAll(".nav-btn[data-tab]").forEach(b => {
            b.classList.toggle("active", b.dataset.tab === tab);
        });
        if (tab === "messages") {
            this.convListContainer.style.display = "block";
            this.contactsContainer.style.display = "none";
        } else if (tab === "contacts") {
            this.convListContainer.style.display = "none";
            this.contactsContainer.style.display = "block";
        }
    }

    updateThemeIcon(theme) {
        this.themeToggleBtn.innerHTML = theme === "theme-dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }

    updateGlobalUnreadBadge() {
        const total = this.conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        if (total > 0) {
            this.globalUnreadBadge.textContent = total > 99 ? '99+' : total;
            this.globalUnreadBadge.style.display = "flex";
        } else {
            this.globalUnreadBadge.style.display = "none";
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            this.messagesViewport.scrollTop = this.messagesViewport.scrollHeight;
        }, 50);
    }

    formatRelativeTime(dateStr) {
        if (!dateStr) return "";
        const d = new Date(dateStr.replace(" ", "T") + "Z");
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        
        const h = d.getHours().toString().padStart(2, "0");
        const m = d.getMinutes().toString().padStart(2, "0");
        return `${h}:${m}`;
    }

    formatTimeOnly(dateStr) {
        if (!dateStr) return "";
        const d = new Date(dateStr.replace(" ", "T") + "Z");
        const h = d.getHours().toString().padStart(2, "0");
        const m = d.getMinutes().toString().padStart(2, "0");
        return `${h}:${m}`;
    }

    formatDateSeparator(dateStr) {
        if (!dateStr) return "Hôm nay";
        const d = new Date(dateStr.replace(" ", "T") + "Z");
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return "Hôm nay";
        }
        return `${d.getDate()} Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
    }

    escapeHTML(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
    window.app = new ChatApp();
    window.app.init();
});
