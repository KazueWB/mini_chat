// Chat Together Web - Main Frontend Application with Authentication & Friends
class ChatApp {
    constructor() {
        this.currentUser = null;
        this.allUsers = [];
        this.friends = [];
        this.friendRequests = [];
        this.conversations = [];
        this.activeConv = null;
        this.convCache = new Map();
        this.currentSelectedConvId = null;
        this.activeFilter = "all"; // 'all', 'unread', 'group'
        this.currentNavTab = "messages"; // 'messages' or 'contacts'
        this.friendSortOrder = "az"; // 'az' or 'za'
        this.replyTarget = null;
        this.isRecordingVoice = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.searchQuery = "";

        // Global image error handler: automatically fallback to cute Dicebear avatar so broken image icons never appear
        window.addEventListener("error", (e) => {
            if (e.target && e.target.tagName === "IMG") {
                const alt = e.target.getAttribute("alt") || "user";
                e.target.onerror = null;
                e.target.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(alt)}&backgroundColor=b6e3f4,ffd5dc,c0aede`;
            }
        }, true);

        this.initDOMElements();
        this.initEmojiPicker();
        this.initEventListeners();
    }

    initDOMElements() {
        // Auth elements
        this.authOverlay = document.getElementById("auth-overlay");
        this.tabBtnLogin = document.getElementById("tab-btn-login");
        this.tabBtnRegister = document.getElementById("tab-btn-register");
        this.loginForm = document.getElementById("login-form");
        this.registerForm = document.getElementById("register-form");
        this.loginErrorMsg = document.getElementById("login-error-msg");
        this.regErrorMsg = document.getElementById("reg-error-msg");
        this.loginIdInput = document.getElementById("login-id");
        this.loginPasswordInput = document.getElementById("login-password");
        this.regDisplayNameInput = document.getElementById("reg-display-name");
        this.regUsernameInput = document.getElementById("reg-username");
        this.regPhoneInput = document.getElementById("reg-phone");
        this.regPasswordInput = document.getElementById("reg-password");
        this.btnLogout = document.getElementById("btn-logout");

        // Nav elements
        this.myAvatar = document.getElementById("my-avatar");
        this.myStatusDot = document.getElementById("my-status-dot");
        this.globalUnreadBadge = document.getElementById("global-unread-badge");
        this.friendReqBadge = document.getElementById("friend-req-badge");
        this.themeToggleBtn = document.getElementById("theme-toggle-btn");
        this.audioToggleBtn = document.getElementById("audio-toggle-btn");

        // Sidebar & Toolbars
        this.searchInput = document.getElementById("search-input");
        this.clearSearchBtn = document.getElementById("clear-search-btn");
        this.conversationFilterTabs = document.getElementById("conversation-filter-tabs");
        this.contactsToolbar = document.getElementById("contacts-toolbar");
        this.contactsTotalCount = document.getElementById("contacts-total-count");
        this.btnSortAz = document.getElementById("btn-sort-az");
        this.btnSortZa = document.getElementById("btn-sort-za");
        this.conversationsList = document.getElementById("conversations-list");
        this.contactsContainer = document.getElementById("contacts-container");
        this.convListContainer = document.getElementById("conv-list-container");
        this.contactsList = document.getElementById("contacts-list");
        this.friendRequestsSection = document.getElementById("friend-requests-section");
        this.friendRequestsList = document.getElementById("friend-requests-list");
        this.reqCountNum = document.getElementById("req-count-num");

        // Friend search modal
        this.modalAddFriend = document.getElementById("modal-add-friend");
        this.friendSearchInput = document.getElementById("friend-search-input");
        this.btnDoSearchFriend = document.getElementById("btn-do-search-friend");
        this.friendSearchResults = document.getElementById("friend-search-results");

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
        this.infoOriginalName = document.getElementById("info-original-name");
        this.infoSub = document.getElementById("info-sub");
        this.btnOpenNicknames = document.getElementById("btn-open-nicknames");
        this.infoFriendshipSection = document.getElementById("info-friendship-section");
        this.infoGroupSection = document.getElementById("info-group-section");
        this.friendshipDaysVal = document.getElementById("friendship-days-val");
        this.friendshipDetailText = document.getElementById("friendship-detail-text");
        this.infoMembersCount = document.getElementById("info-members-count");
        this.infoMembersList = document.getElementById("info-members-list");
        this.tabMediaImages = document.getElementById("tab-media-images");
        this.tabMediaFiles = document.getElementById("tab-media-files");
        this.infoMediaGallery = document.getElementById("info-media-gallery");
        this.currentMediaTab = "images";

        // Nicknames Modal
        this.modalEditNicknames = document.getElementById("modal-edit-nicknames");
        this.nicknamesMembersList = document.getElementById("nicknames-members-list");

        // Modals
        this.modalCreateGroup = document.getElementById("modal-create-group");
        this.imageLightbox = document.getElementById("image-lightbox");
        this.lightboxImg = document.getElementById("lightbox-img");
        this.lightboxDownloadLink = document.getElementById("lightbox-download-link");

        // Profile Modal elements
        this.modalUserProfile = document.getElementById("modal-user-profile");
        this.profileAvatarImg = document.getElementById("profile-avatar-img");
        this.profileStatusDot = document.getElementById("profile-status-dot");
        this.btnChangeAvatar = document.getElementById("btn-change-avatar");
        this.profileAvatarFileInput = document.getElementById("profile-avatar-file-input");
        this.profileDisplayName = document.getElementById("profile-display-name");
        this.profileUsername = document.getElementById("profile-username");
        this.profileStatusBadge = document.getElementById("profile-status-badge");
        this.profilePhone = document.getElementById("profile-phone");
        this.profileDob = document.getElementById("profile-dob");
        this.profileGender = document.getElementById("profile-gender");
        this.profileBio = document.getElementById("profile-bio");
        this.profileCreatedAt = document.getElementById("profile-created-at");
        this.profileMyActions = document.getElementById("profile-my-actions");
        this.profileOtherActions = document.getElementById("profile-other-actions");
        this.profileFriendshipWrap = document.getElementById("profile-friendship-wrap");
        this.profileViewMode = document.getElementById("profile-view-mode");
        this.profileEditMode = document.getElementById("profile-edit-mode");
        this.editProfileName = document.getElementById("edit-profile-name");
        this.editProfilePhone = document.getElementById("edit-profile-phone");
        this.editProfileDob = document.getElementById("edit-profile-dob");
        this.editProfileGender = document.getElementById("edit-profile-gender");
        this.editProfileBio = document.getElementById("edit-profile-bio");
        this.profileEditError = document.getElementById("profile-edit-error");
        this.btnOpenEditProfile = document.getElementById("btn-open-edit-profile");
        this.btnCancelEditProfile = document.getElementById("btn-cancel-edit-profile");
        this.btnSaveProfile = document.getElementById("btn-save-profile");
        this.btnRandomizeAvatar = document.getElementById("btn-randomize-avatar");
        this.btnProfileChat = document.getElementById("btn-profile-chat");
        this.btnProfileCallAudio = document.getElementById("btn-profile-call-audio");
        this.btnProfileCallVideo = document.getElementById("btn-profile-call-video");
        this.userAvatarBtn = document.getElementById("user-avatar-btn");
    }

    async init() {
        const savedTheme = localStorage.getItem("chat_theme") || "theme-light";
        document.body.className = savedTheme;
        this.updateThemeIcon(savedTheme);

        await this.checkAuth();
    }

    // ---------------- AUTHENTICATION ----------------
    async checkAuth() {
        try {
            const res = await fetch("/api/me");
            const data = await res.json();
            if (data && data.authenticated && data.id) {
                data.status = 'online';
                this.currentUser = data;
                this.authOverlay.style.display = "none";
                this.onAuthSuccess();
            } else {
                this.authOverlay.style.display = "flex";
            }
        } catch (err) {
            console.error("Auth check failed:", err);
            this.authOverlay.style.display = "flex";
        }
    }

    async handleLogin() {
        const loginId = this.loginIdInput.value.trim();
        const password = this.loginPasswordInput.value.trim();
        this.loginErrorMsg.style.display = "none";

        if (!loginId || !password) {
            this.showLoginError("Vui lòng nhập Tên đăng nhập / Số điện thoại và Mật khẩu!");
            return;
        }

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login_id: loginId, password })
            });
            const data = await res.json();
            if (data.error) {
                this.showLoginError(data.error);
            } else if (data.success && data.user) {
                data.user.status = 'online';
                this.currentUser = data.user;
                this.authOverlay.style.display = "none";
                this.onAuthSuccess();
            }
        } catch (err) {
            this.showLoginError("Đăng nhập thất bại. Vui lòng thử lại!");
        }
    }

    async handleRegister() {
        const displayName = this.regDisplayNameInput.value.trim();
        const username = this.regUsernameInput.value.trim();
        const phone = this.regPhoneInput.value.trim();
        const password = this.regPasswordInput.value.trim();
        this.regErrorMsg.style.display = "none";

        if (!displayName || !username || !password) {
            this.showRegError("Vui lòng nhập đầy đủ các trường thông tin!");
            return;
        }

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    display_name: displayName,
                    username,
                    phone,
                    password
                })
            });
            const data = await res.json();
            if (data.error) {
                this.showRegError(data.error);
            } else if (data.success && data.user) {
                data.user.status = 'online';
                this.currentUser = data.user;
                this.authOverlay.style.display = "none";
                this.onAuthSuccess();
            }
        } catch (err) {
            this.showRegError("Đăng ký thất bại. Vui lòng kiểm tra lại thông tin!");
        }
    }

    async handleLogout() {
        if (!confirm("Bạn có chắc chắn muốn đăng xuất không?")) return;
        if (this.syncInterval) clearInterval(this.syncInterval);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            this.currentUser = null;
            this.activeConv = null;
            this.conversations = [];
            this.friends = [];
            this.friendRequests = [];
            this.chatActiveContainer.style.display = "none";
            this.chatEmptyState.style.display = "flex";
            this.authOverlay.style.display = "flex";
        } catch (err) {
            location.reload();
        }
    }

    fillLogin(loginId, pass) {
        this.loginIdInput.value = loginId;
        this.loginPasswordInput.value = pass;
        this.handleLogin();
    }

    showLoginError(msg) {
        this.loginErrorMsg.textContent = msg;
        this.loginErrorMsg.style.display = "block";
    }

    showRegError(msg) {
        this.regErrorMsg.textContent = msg;
        this.regErrorMsg.style.display = "block";
    }

    async onAuthSuccess() {
        if (this.currentUser) {
            this.currentUser.status = 'online';
        }
        this.myAvatar.src = this.currentUser.avatar_url;
        this.myStatusDot.className = "status-indicator online";
        
        window.chatSocket.connect(this.currentUser.id);

        await this.loadConversations();
        await this.loadFriends();
        await this.loadFriendRequests();

        this.startPollingSync();

        if (!this.presenceTimer) {
            this.presenceTimer = setInterval(() => {
                if (this.activeConv && this.activeConv.conversation && this.activeConv.conversation.type === "direct") {
                    const other = this.activeConv.participants.find(p => p.id !== this.currentUser.id);
                    if (other && other.status !== "online") {
                        this.updateChatHeaderStatus(other);
                    }
                }
            }, 30000);
        }

        if (this.conversations.length > 0) {
            this.selectConversation(this.conversations[0].id);
        } else {
            this.chatEmptyState.style.display = "flex";
            this.chatActiveContainer.style.display = "none";
        }
    }

    // ---------------- FRIEND MANAGEMENT ----------------
    async searchFriends() {
        const q = this.friendSearchInput.value.trim();
        if (!q) {
            this.friendSearchResults.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">Vui lòng nhập số điện thoại hoặc tên</div>`;
            return;
        }

        this.friendSearchResults.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tìm kiếm...</div>`;

        try {
            const res = await fetch(`/api/friends/search?q=${encodeURIComponent(q)}`);
            const users = await res.json();

            if (users.length === 0) {
                this.friendSearchResults.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">Không tìm thấy người dùng nào với số điện thoại hoặc tên này</div>`;
                return;
            }

            this.friendSearchResults.innerHTML = users.map(u => {
                let actionBtnHTML = "";
                if (u.friendship_status === "accepted") {
                    actionBtnHTML = `<button class="btn btn-secondary" onclick="window.app.startDirectChatWith(${u.id}); window.app.closeModal(window.app.modalAddFriend);"><i class="fa-solid fa-comment"></i> Nhắn tin</button>`;
                } else if (u.friendship_status === "pending_sent") {
                    actionBtnHTML = `<button class="btn btn-secondary" disabled style="opacity:0.7;"><i class="fa-solid fa-clock"></i> Đã gửi lời mời</button>`;
                } else if (u.friendship_status === "pending_received") {
                    actionBtnHTML = `<button class="btn btn-primary" onclick="window.app.respondFriendRequest(${u.request_id}, 'accept')"><i class="fa-solid fa-check"></i> Chấp nhận</button>`;
                } else {
                    actionBtnHTML = `<button class="btn btn-primary" onclick="window.app.sendFriendRequest(${u.id})"><i class="fa-solid fa-user-plus"></i> Kết bạn</button>`;
                }

                return `
                    <div class="friend-search-card">
                        <img src="${u.avatar_url}" alt="${u.display_name}" class="avatar-circle">
                        <div class="friend-search-info">
                            <div class="friend-search-name">${this.escapeHTML(u.display_name)}</div>
                            <div class="friend-search-sub"><i class="fa-solid fa-phone"></i> ${this.escapeHTML(u.phone || 'Chưa có SĐT')} • @${this.escapeHTML(u.username)}</div>
                        </div>
                        <div class="friend-search-actions">
                            ${actionBtnHTML}
                        </div>
                    </div>
                `;
            }).join("");
        } catch (err) {
            console.error("Failed to search friends:", err);
            this.friendSearchResults.innerHTML = `<div style="text-align:center; padding:20px; color:red; font-size:13px;">Lỗi tìm kiếm. Vui lòng thử lại!</div>`;
        }
    }

    async sendFriendRequest(targetUserId) {
        try {
            const res = await fetch("/api/friends/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target_user_id: targetUserId })
            });
            const data = await res.json();
            if (data.status === "accepted") {
                alert("Hai bạn đã là bạn bè!");
                await this.loadConversations();
                await this.loadFriends();
                if (data.conversation_id) this.selectConversation(data.conversation_id);
                this.closeModal(this.modalAddFriend);
            } else {
                alert("Đã gửi lời mời kết bạn thành công!");
                this.searchFriends();
            }
        } catch (err) {
            alert("Gửi lời mời thất bại: " + err);
        }
    }

    async loadFriendRequests() {
        if (!this.currentUser) return;
        try {
            const res = await fetch("/api/friends/requests");
            this.friendRequests = await res.json();
            this.renderFriendRequests();
        } catch (err) {
            console.error("Failed to load friend requests:", err);
        }
    }

    renderFriendRequests() {
        const count = this.friendRequests.length;
        if (count > 0) {
            this.friendRequestsSection.style.display = "block";
            this.reqCountNum.textContent = count;
            this.friendReqBadge.textContent = count;
            this.friendReqBadge.style.display = "flex";

            this.friendRequestsList.innerHTML = this.friendRequests.map(req => `
                <div class="friend-req-card" id="req-card-${req.request_id}">
                    <div class="friend-req-top">
                        <img src="${req.avatar_url}" alt="${req.display_name}" class="avatar-circle-sm">
                        <div class="friend-req-info">
                            <div class="friend-req-name">${this.escapeHTML(req.display_name)}</div>
                            <div class="friend-req-phone"><i class="fa-solid fa-phone"></i> ${this.escapeHTML(req.phone || '')}</div>
                        </div>
                    </div>
                    <div class="friend-req-actions">
                        <button class="btn btn-secondary" style="padding:4px 10px; font-size:12px;" onclick="window.app.respondFriendRequest(${req.request_id}, 'decline')">Từ chối</button>
                        <button class="btn btn-primary" style="padding:4px 12px; font-size:12px;" onclick="window.app.respondFriendRequest(${req.request_id}, 'accept')"><i class="fa-solid fa-check"></i> Đồng ý</button>
                    </div>
                </div>
            `).join("");
        } else {
            this.friendRequestsSection.style.display = "none";
            this.friendReqBadge.style.display = "none";
        }
    }

    async respondFriendRequest(requestId, action) {
        try {
            const res = await fetch("/api/friends/respond", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request_id: requestId, action })
            });
            const data = await res.json();
            if (data.success) {
                await this.loadFriendRequests();
                await this.loadFriends();
                await this.loadConversations();
                if (action === "accept" && data.conv_id) {
                    this.selectConversation(data.conv_id);
                    this.switchNavTab("messages");
                }
            }
        } catch (err) {
            console.error("Failed to respond to friend request:", err);
        }
    }

    async loadFriends() {
        if (!this.currentUser) return;
        try {
            const res = await fetch("/api/friends");
            this.friends = await res.json();
            this.renderFriendsList();
        } catch (err) {
            console.error("Failed to load friends:", err);
        }
    }

    getVietnameseSortKey(fullName) {
        const parts = (fullName || "").trim().split(/\s+/);
        if (parts.length === 0) return "";
        const firstName = parts[parts.length - 1]; // Ví dụ: Kiệt, Bảo (tên chính)
        const lastName = parts.slice(0, -1).join(" "); // Ví dụ: Phan Tân (họ và tên đệm)
        return `${firstName} ${lastName}`.toLowerCase();
    }

    renderFriendsList() {
        if (this.contactsTotalCount) {
            this.contactsTotalCount.textContent = this.friends.length;
        }

        let list = [...this.friends];

        // Lọc theo từ khóa tìm kiếm nếu có
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            list = list.filter(u => 
                (u.display_name && u.display_name.toLowerCase().includes(q)) ||
                (u.username && u.username.toLowerCase().includes(q)) ||
                (u.phone && u.phone.includes(q))
            );
        }

        // Sắp xếp theo thứ tự chữ cái A-Z hoặc Z-A chuẩn tiếng Việt
        list.sort((a, b) => {
            const nameA = a.display_name || a.username || "";
            const nameB = b.display_name || b.username || "";
            const keyA = this.getVietnameseSortKey(nameA);
            const keyB = this.getVietnameseSortKey(nameB);
            const cmp = keyA.localeCompare(keyB, 'vi', { sensitivity: 'base', numeric: true });
            return this.friendSortOrder === "za" ? -cmp : cmp;
        });

        if (list.length === 0) {
            if (this.searchQuery) {
                this.contactsList.innerHTML = `
                    <div style="text-align:center; padding:30px 16px; color:var(--text-muted); font-size:13px;">
                        Không tìm thấy bạn bè nào khớp với "<strong>${this.escapeHTML(this.searchQuery)}</strong>"
                    </div>
                `;
            } else {
                this.contactsList.innerHTML = `
                    <div style="text-align:center; padding:30px 16px; color:var(--text-muted); font-size:13px;">
                        Bạn chưa có bạn bè nào.<br>
                        <button class="btn btn-primary" style="margin-top:10px; padding:6px 14px; font-size:12px;" onclick="window.app.openAddFriendModal()">
                            <i class="fa-solid fa-user-plus"></i> Tìm bạn qua SĐT
                        </button>
                    </div>
                `;
            }
            return;
        }

        this.contactsList.innerHTML = list.map(u => `
            <div class="contact-item" onclick="window.app.startDirectChatWith(${u.id})" style="display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;">
                <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                    <div class="conv-avatar-box" onclick="event.stopPropagation(); window.app.openUserProfile(${u.id});" title="Bấm để xem trang cá nhân" style="cursor:pointer;">
                        <img src="${u.avatar_url}" alt="${this.escapeHTML(u.display_name)}" class="avatar-circle">
                        <span class="status-indicator ${u.status || 'offline'}"></span>
                    </div>
                    <div class="contact-info">
                        <div class="contact-name">${this.escapeHTML(u.display_name)}</div>
                        <div class="contact-bio"><i class="fa-solid fa-phone"></i> ${this.escapeHTML(u.phone || 'Chưa cập nhật')}</div>
                    </div>
                </div>
                <button class="btn btn-primary" style="padding:6px 14px; font-size:12.5px; border-radius:var(--radius-full); flex-shrink:0;" onclick="event.stopPropagation(); window.app.startDirectChatWith(${u.id});">
                    <i class="fa-solid fa-comment-dots"></i> Nhắn tin
                </button>
            </div>
        `).join("");
    }

    handleFriendRequestReceived(data) {
        window.soundManager.playReceived();
        this.loadFriendRequests();
    }

    handleFriendRequestAccepted(data) {
        window.soundManager.playReceived();
        this.loadFriends();
        this.loadConversations();
        if (data.conversation_id) {
            this.selectConversation(data.conversation_id);
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

    renderSkeletonMessages() {
        this.messagesStream.innerHTML = `
            <div class="msg-skeleton-row" style="width: 42%;">
                <div class="msg-skeleton-bubble" style="width: 100%;"></div>
            </div>
            <div class="msg-skeleton-row outgoing" style="width: 52%; margin-left:auto;">
                <div class="msg-skeleton-bubble" style="width: 100%;"></div>
            </div>
            <div class="msg-skeleton-row" style="width: 60%;">
                <div class="msg-skeleton-bubble" style="width: 100%;"></div>
            </div>
            <div class="msg-skeleton-row outgoing" style="width: 38%; margin-left:auto;">
                <div class="msg-skeleton-bubble" style="width: 100%;"></div>
            </div>
        `;
    }

    async selectConversation(convId) {
        if (!convId) return;
        this.currentSelectedConvId = convId;

        // 1. Instant 0ms Visual Response on left sidebar
        document.querySelectorAll(".conv-item").forEach(el => {
            const isMatch = el.dataset.id == convId;
            el.classList.toggle("active", isMatch);
            if (isMatch) {
                el.classList.remove("unread");
                const badge = el.querySelector(".unread-badge");
                if (badge) badge.remove();
            }
        });

        const conv = this.conversations.find(c => c.id === convId);
        if (conv) {
            conv.unread_count = 0;
            this.updateGlobalUnreadBadge();

            // 2. Instant 0ms Header & Screen Transition
            this.chatEmptyState.style.display = "none";
            this.chatActiveContainer.style.display = "flex";
            this.chatMain.classList.add("mobile-active");
            document.body.classList.add("mobile-chat-open");

            this.chatHeaderName.textContent = conv.name || "--";
            this.chatHeaderAvatar.src = conv.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${conv.id}`;

            if (conv.type === "direct") {
                const other = conv.other_user || {};
                this.updateChatHeaderStatus(other);
                this.chatHeaderAvatar.style.cursor = "pointer";
                this.chatHeaderName.style.cursor = "pointer";
                this.chatHeaderAvatar.onclick = () => {
                    if (other.id) this.openUserProfile(other.id);
                };
                this.chatHeaderName.onclick = () => {
                    if (other.id) this.openUserProfile(other.id);
                };
            } else {
                this.chatHeaderStatusDot.className = "status-indicator group";
                this.chatHeaderStatusText.textContent = `${conv.members_count || ''} thành viên`;
                this.chatHeaderStatusText.classList.remove("online");
                this.chatHeaderStatusText.style.color = "var(--text-secondary)";
                this.chatHeaderAvatar.style.cursor = "default";
                this.chatHeaderName.style.cursor = "default";
                this.chatHeaderAvatar.onclick = null;
                this.chatHeaderName.onclick = null;
            }
        }

        // 3. Socket Room Switch
        window.chatSocket.joinConversation(convId);

        // 4. Memory Cache: If already cached, render immediately within 0ms!
        if (this.convCache.has(convId)) {
            const cachedData = this.convCache.get(convId);
            this.applyConversationData(cachedData);
        } else {
            this.renderSkeletonMessages();
        }

        // 5. Stale-While-Revalidate: Background fetch to get latest messages/pins/info
        try {
            const res = await fetch(`/api/conversations/${convId}/messages`);
            const data = await res.json();
            if (data.error) return;

            // Cache it
            this.convCache.set(convId, data);

            // Only apply if user is still on this conversation
            if (this.currentSelectedConvId === convId) {
                this.applyConversationData(data);
            }
        } catch (err) {
            console.error("Failed to load conversation messages:", err);
        }
    }

    applyConversationData(data) {
        this.activeConv = data;

        const conv = data.conversation;
        if (conv.type === "direct") {
            const other = data.participants.find(p => p.id !== this.currentUser.id);
            if (other) {
                const title = (other.nickname && other.nickname.trim()) ? other.nickname.trim() : other.display_name;
                this.chatHeaderName.textContent = title;
                this.chatHeaderAvatar.src = other.avatar_url;
                this.updateChatHeaderStatus(other);
            }
        }

        this.renderPinnedBanner(data.pinned);
        this.renderMessages(data.messages);
        this.scrollToBottom();
        this.populateInfoSidebar();
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
        row.className = `msg-row ${isSystem ? 'system' : (isMe ? 'outgoing' : 'incoming')} ${msg.is_pending ? 'msg-pending' : ''}`;

        if (isSystem) {
            row.innerHTML = `<div class="msg-system-bubble">${this.escapeHTML(msg.content)}</div>`;
            return row;
        }

        if (msg.message_type === "call") {
            const isMissed = (msg.content || "").includes("nhỡ");
            const isDeclined = (msg.content || "").includes("từ chối");
            const isVideo = (msg.content || "").includes("video");
            const iconClass = isVideo ? (isMissed ? "fa-solid fa-video-slash" : "fa-solid fa-video") : (isMissed ? "fa-solid fa-phone-slash" : "fa-solid fa-phone");
            const statusClass = isMissed ? "missed" : (isDeclined ? "declined" : "completed");
            const timeStr = this.formatTimeOnly(msg.created_at);

            row.className = `msg-row ${isMe ? 'outgoing' : 'incoming'}`;
            row.innerHTML = `
                <div class="msg-call-bubble ${statusClass}">
                    <div class="call-icon-circle">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="call-msg-details">
                        <span class="call-msg-title">${this.escapeHTML(msg.content)}</span>
                        <span class="call-msg-time">${timeStr}</span>
                    </div>
                    ${!isMe ? `<button class="call-back-btn" onclick="window.app.callUserBack(${msg.sender_id}, '${isVideo ? 'video' : 'audio'}')">Gọi lại</button>` : ''}
                </div>
            `;
            return row;
        }

        const isGroup = this.activeConv?.conversation?.type === "group";
        const showAvatar = !isMe;
        const showSenderName = !isMe && isGroup;

        let contentHTML = "";
        if (msg.is_recalled) {
            contentHTML = `<span class="msg-recalled"><i class="fa-solid fa-clock-rotate-left"></i> ${this.escapeHTML(msg.content)}</span>`;
        } else {
            let replyQuoteHTML = "";
            if (msg.reply_to) {
                replyQuoteHTML = `
                    <div class="msg-reply-quote" onclick="window.app.jumpToMessage(${msg.reply_to.id})">
                        <div class="reply-quote-sender">${this.escapeHTML(msg.reply_to.sender_name)}</div>
                        <div class="reply-quote-content">${this.escapeHTML(msg.reply_to.content || 'Nội dung đính kèm')}</div>
                    </div>
                `;
            }

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

        const reactionsHTML = this.renderReactionsBadges(msg.reactions);
        const timeStr = this.formatTimeOnly(msg.created_at);

        row.innerHTML = `
            ${showAvatar ? `<img src="${msg.sender_avatar}" alt="${msg.sender_name}" class="msg-avatar" title="Bấm để xem trang cá nhân" onclick="window.app.openUserProfile(${msg.sender_id})" style="cursor:pointer;">` : ''}
            <div class="msg-bubble-wrap">
                ${showSenderName ? `<span class="msg-sender-name">${this.escapeHTML(msg.sender_name)}</span>` : ''}
                <div class="msg-bubble">
                    ${contentHTML}
                    ${reactionsHTML}
                    
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
                    ${isMe ? `<span class="msg-status-tick">${msg.is_pending ? '<i class="fa-regular fa-clock" style="font-size:10px; opacity:0.65;" title="Đang gửi..."></i>' : '<i class="fa-solid fa-check-double"></i>'}</span>` : ''}
                </div>
            </div>
        `;

        return row;
    }

    renderReactionsBadges(reactions) {
        if (!reactions || reactions.length === 0) return "";
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
        const myPart = this.activeConv.participants?.find(p => p.id === this.currentUser.id);
        const myName = (myPart && myPart.nickname && myPart.nickname.trim()) ? myPart.nickname.trim() : this.currentUser.display_name;

        // 1. Generate temp optimistic message
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const optimisticMsg = {
            id: tempId,
            conversation_id: convId,
            sender_id: this.currentUser.id,
            sender_name: myName,
            sender_avatar: this.currentUser.avatar_url,
            content: text,
            message_type: "text",
            media_url: null,
            reply_to: this.replyTarget ? {
                id: this.replyTarget.id,
                content: this.replyTarget.content,
                sender_name: this.replyTarget.sender_name
            } : null,
            reactions: [],
            created_at: new Date().toISOString(),
            is_pending: true
        };

        const payload = {
            content: text,
            message_type: "text",
            reply_to_id: this.replyTarget ? this.replyTarget.id : null
        };

        // 2. Clear input & reset state INSTANTLY (0ms)
        this.messageInput.value = "";
        this.messageInput.style.height = "auto";
        this.cancelReply();
        window.chatSocket.stopTyping(this.currentUser);

        // 3. Play sound & render to DOM INSTANTLY (0ms)
        window.soundManager.playSent();
        if (!this.activeConv.messages) this.activeConv.messages = [];
        this.activeConv.messages.push(optimisticMsg);
        const row = this.createMessageElement(optimisticMsg);
        this.messagesStream.appendChild(row);
        this.scrollToBottom();

        // 4. Update left sidebar conversation snippet INSTANTLY (0ms)
        const localConv = this.conversations.find(c => c.id === convId);
        if (localConv) {
            localConv.last_message = optimisticMsg;
            const idx = this.conversations.indexOf(localConv);
            if (idx > 0) {
                this.conversations.splice(idx, 1);
                this.conversations.unshift(localConv);
            }
            this.renderConversations();
        }

        // 5. Send to server in background
        try {
            const res = await fetch(`/api/conversations/${convId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const realMsg = await res.json();
            if (realMsg && realMsg.id) {
                this.reconcileOptimisticMessage(tempId, realMsg);
            }
        } catch (err) {
            console.error("Failed to send message:", err);
            const el = document.getElementById(`msg-${tempId}`);
            if (el) {
                el.classList.add("msg-failed");
                const tick = el.querySelector(".msg-status-tick");
                if (tick) tick.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;" title="Gửi thất bại"></i>';
            }
        }
    }

    reconcileOptimisticMessage(tempId, realMsg) {
        // Reconcile DOM element
        const el = document.getElementById(`msg-${tempId}`);
        if (el) {
            el.id = `msg-${realMsg.id}`;
            el.classList.remove("msg-pending");
            const tick = el.querySelector(".msg-status-tick");
            if (tick) tick.innerHTML = '<i class="fa-solid fa-check-double"></i>';

            // Update action buttons with real ID
            const actionBtns = el.querySelectorAll(".action-tool-btn");
            if (actionBtns.length >= 6) {
                actionBtns[0].onclick = () => window.app.reactMessage(realMsg.id, '❤️');
                actionBtns[1].onclick = () => window.app.reactMessage(realMsg.id, '👍');
                actionBtns[2].onclick = () => window.app.reactMessage(realMsg.id, '😂');
                actionBtns[3].onclick = () => window.app.reactMessage(realMsg.id, '😮');
                actionBtns[4].onclick = () => window.app.setReplyMessage(realMsg.id);
                actionBtns[5].onclick = () => window.app.pinMessage(realMsg.id);
                if (actionBtns[6]) actionBtns[6].onclick = () => window.app.recallMessage(realMsg.id);
            }
        }

        // Reconcile memory array
        if (this.activeConv && this.activeConv.messages) {
            const idx = this.activeConv.messages.findIndex(m => m.id === tempId);
            if (idx !== -1) {
                this.activeConv.messages[idx] = realMsg;
            } else if (!this.activeConv.messages.some(m => m.id === realMsg.id)) {
                this.activeConv.messages.push(realMsg);
            }
        }

        // Reconcile cache
        if (this.convCache.has(realMsg.conversation_id)) {
            const cached = this.convCache.get(realMsg.conversation_id);
            if (cached && cached.messages) {
                const cIdx = cached.messages.findIndex(m => m.id === tempId);
                if (cIdx !== -1) cached.messages[cIdx] = realMsg;
                else if (!cached.messages.some(m => m.id === realMsg.id)) cached.messages.push(realMsg);
            }
        }

        // Reconcile conversation last message
        const conv = this.conversations.find(c => c.id === realMsg.conversation_id);
        if (conv) {
            conv.last_message = realMsg;
            this.renderConversations();
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

            const msgRes = await fetch(`/api/conversations/${convId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const createdMsg = await msgRes.json();

            // Hiển thị ngay lập tức trong khung chat và mục Hình ảnh & tệp đã gửi
            if (createdMsg && createdMsg.id && this.activeConv && this.activeConv.conversation.id == convId) {
                if (!this.activeConv.messages.some(m => m.id == createdMsg.id)) {
                    this.activeConv.messages.push(createdMsg);
                }
                if (!document.getElementById(`msg-${createdMsg.id}`)) {
                    const row = this.createMessageElement(createdMsg);
                    this.messagesStream.appendChild(row);
                    this.scrollToBottom();
                }
                this.renderMediaGallery();
            }

            window.soundManager.playSent();
            this.cancelReply();
        } catch (err) {
            console.error("Failed to upload and send file:", err);
        }
    }

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
        if (!msg || !msg.id) return;

        if (this.activeConv && this.activeConv.conversation.id == msg.conversation_id) {
            // Check if this is confirming an optimistic temp message sent by current user
            if (msg.sender_id === this.currentUser.id) {
                const pending = this.activeConv.messages.find(m => String(m.id).startsWith("temp_") && m.content === msg.content);
                if (pending) {
                    this.reconcileOptimisticMessage(pending.id, msg);
                    if (msg.message_type === "image" || msg.message_type === "file") {
                        this.renderMediaGallery();
                    }
                    return;
                }
            }

            // Memory array check & update
            if (!this.activeConv.messages.some(m => m.id == msg.id)) {
                this.activeConv.messages.push(msg);
            }

            // Render message element nếu chưa có trong DOM
            if (!document.getElementById(`msg-${msg.id}`)) {
                const row = this.createMessageElement(msg);
                this.messagesStream.appendChild(row);
                this.scrollToBottom();
            }

            // Cập nhật ngay lập tức mục Hình ảnh & tệp đã gửi trong thông tin hội thoại
            if (msg.message_type === "image" || msg.message_type === "file") {
                this.renderMediaGallery();
            }

            if (msg.sender_id !== this.currentUser.id) {
                window.soundManager.playReceived();
            }
        }

        // Keep memory cache updated
        if (this.convCache.has(msg.conversation_id)) {
            const cached = this.convCache.get(msg.conversation_id);
            if (cached && cached.messages && !cached.messages.some(m => m.id === msg.id)) {
                cached.messages.push(msg);
            }
        }

        const conv = this.conversations.find(c => c.id == msg.conversation_id);
        if (conv) {
            conv.last_message = msg;
            if (!this.activeConv || this.activeConv.conversation.id != msg.conversation_id) {
                conv.unread_count = (conv.unread_count || 0) + 1;
                window.soundManager.playReceived();
            }
            const idx = this.conversations.indexOf(conv);
            if (idx > 0) {
                this.conversations.splice(idx, 1);
                this.conversations.unshift(conv);
            }
            this.renderConversations();
            this.updateGlobalUnreadBadge();
        } else {
            this.loadConversations();
        }
    }

    handleConversationUpdated(data) {
        if (!data || !data.conversation_id) return;
        if (data.nickname_change) {
            this.loadConversations();
            return;
        }
        const conv = this.conversations.find(c => c.id == data.conversation_id);
        if (conv) {
            conv.last_message = data.last_message;
            if (!this.activeConv || this.activeConv.conversation.id != data.conversation_id) {
                conv.unread_count = (conv.unread_count || 0) + 1;
                window.soundManager.playReceived();
            }
            const idx = this.conversations.indexOf(conv);
            if (idx > 0) {
                this.conversations.splice(idx, 1);
                this.conversations.unshift(conv);
            }
            this.renderConversations();
            this.updateGlobalUnreadBadge();
        } else {
            this.loadConversations();
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
                if (msg.message_type === "image" || msg.message_type === "file") {
                    this.renderMediaGallery();
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
        console.log("[Presence] User status changed:", data);
        
        // 0. Update my own status indicator if this event is for current user
        if (this.currentUser && data.user_id === this.currentUser.id) {
            this.currentUser.status = 'online';
            if (this.myStatusDot) {
                this.myStatusDot.className = "status-indicator online";
            }
        }

        // 1. Update in friends list
        const friend = this.friends.find(u => u.id === data.user_id);
        if (friend) {
            friend.status = data.status;
            if (data.last_seen) friend.last_seen = data.last_seen;
            if (data.bio) friend.bio = data.bio;
            this.renderFriendsList();
        }

        // 2. Update in conversations list
        const conv = this.conversations.find(c => c.type === 'direct' && c.other_user?.id === data.user_id);
        if (conv) {
            conv.status = data.status;
            if (data.last_seen) conv.last_seen = data.last_seen;
            if (conv.other_user) {
                conv.other_user.status = data.status;
                if (data.last_seen) conv.other_user.last_seen = data.last_seen;
            }
            const dot = document.querySelector(`.conv-item[data-id="${conv.id}"] .status-indicator`);
            if (dot) {
                dot.className = `status-indicator ${data.status === 'online' ? 'online' : 'offline'}`;
            }
        }

        // 3. Update active conversation header if currently chatting with this user
        if (this.activeConv && this.activeConv.conversation && this.activeConv.conversation.type === "direct") {
            const other = this.activeConv.participants.find(p => p.id !== this.currentUser.id);
            if (other && other.id === data.user_id) {
                other.status = data.status;
                if (data.last_seen) other.last_seen = data.last_seen;
                this.updateChatHeaderStatus(other);
            }
        }

        // 4. Update profile modal if open for this user
        if (this.activeProfileUser && this.activeProfileUser.id === data.user_id) {
            this.activeProfileUser.status = data.status;
            if (data.last_seen) this.activeProfileUser.last_seen = data.last_seen;
            this.profileStatusDot.className = `status-indicator ${data.status === 'online' ? 'online' : 'offline'}`;
            this.profileStatusBadge.textContent = this.formatLastSeen(data.status, data.last_seen);
            this.profileStatusBadge.style.color = data.status === 'online' ? '#10b981' : 'var(--text-secondary)';
        }
    }

    // ---------------- INFO SIDEBAR & MEDIA GALLERY ----------------
    populateInfoSidebar() {
        if (!this.activeConv) return;
        const conv = this.activeConv.conversation;
        const isDirect = conv.type === "direct";
        const other = isDirect ? this.activeConv.participants.find(p => p.id !== this.currentUser.id) : null;

        this.infoAvatar.src = isDirect && other ? other.avatar_url : conv.avatar_url;

        if (isDirect && other) {
            const hasNickname = !!(other.nickname && other.nickname.trim());
            this.infoName.textContent = hasNickname ? other.nickname.trim() : other.display_name;
            if (hasNickname) {
                this.infoOriginalName.textContent = `Tên gốc: ${other.original_display_name || other.display_name}`;
                this.infoOriginalName.style.display = "block";
            } else {
                this.infoOriginalName.style.display = "none";
            }
            this.infoSub.textContent = other.bio || (other.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến');
        } else {
            this.infoName.textContent = conv.name;
            this.infoOriginalName.style.display = "none";
            this.infoSub.textContent = `${this.activeConv.participants.length} thành viên`;
        }

        // Section Toggles: Direct (Friendship Duration) vs Group (Members List)
        if (isDirect) {
            if (this.infoFriendshipSection) this.infoFriendshipSection.style.display = "block";
            if (this.infoGroupSection) this.infoGroupSection.style.display = "none";

            const fInfo = this.activeConv.friendship_info;
            if (fInfo && fInfo.status === "accepted" && fInfo.friended_at) {
                const friendedDate = new Date(fInfo.friended_at);
                const now = new Date();
                const diffMs = now - friendedDate;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const daysVal = Math.max(0, diffDays);

                const d = friendedDate.getDate().toString().padStart(2, '0');
                const m = (friendedDate.getMonth() + 1).toString().padStart(2, '0');
                const y = friendedDate.getFullYear();
                const dateStr = `${d}/${m}/${y}`;

                if (daysVal === 0) {
                    if (this.friendshipDaysVal) this.friendshipDaysVal.textContent = "1";
                    if (this.friendshipDetailText) this.friendshipDetailText.innerHTML = `Hai bạn đã trở thành bạn bè từ hôm nay (${dateStr}) ✨`;
                } else {
                    if (this.friendshipDaysVal) this.friendshipDaysVal.textContent = daysVal;
                    if (this.friendshipDetailText) this.friendshipDetailText.innerHTML = `Đã làm bạn được <strong>${daysVal} ngày</strong><br><span style="font-size:11px; color:var(--text-muted);">Từ ngày ${dateStr}</span> ✨`;
                }
            } else if (fInfo && fInfo.status === "pending") {
                if (this.friendshipDaysVal) this.friendshipDaysVal.textContent = "⏳";
                if (this.friendshipDetailText) this.friendshipDetailText.textContent = "Đang chờ chấp nhận lời mời kết bạn";
            } else {
                if (this.friendshipDaysVal) this.friendshipDaysVal.textContent = "💬";
                if (this.friendshipDetailText) this.friendshipDetailText.textContent = "Chưa kết bạn hoặc kết nối gần đây";
            }
        } else {
            if (this.infoFriendshipSection) this.infoFriendshipSection.style.display = "none";
            if (this.infoGroupSection) this.infoGroupSection.style.display = "block";

            this.infoMembersCount.textContent = this.activeConv.participants.length;
            this.infoMembersList.innerHTML = this.activeConv.participants.map(p => {
                const nick = p.nickname ? ` (${this.escapeHTML(p.nickname)})` : '';
                return `
                    <div class="member-item">
                        <img src="${p.avatar_url}" alt="${p.display_name}" class="avatar-circle-sm">
                        <span class="member-name">${this.escapeHTML(p.display_name)}${nick} ${p.id === this.currentUser.id ? '(Bạn)' : ''}</span>
                        ${p.role === 'admin' ? '<span class="member-role-badge">Trưởng nhóm</span>' : ''}
                    </div>
                `;
            }).join("");
        }

        this.renderMediaGallery();
    }

    switchMediaTab(tab) {
        this.currentMediaTab = tab;
        if (this.tabMediaImages) this.tabMediaImages.classList.toggle("active", tab === "images");
        if (this.tabMediaFiles) this.tabMediaFiles.classList.toggle("active", tab === "files");
        this.renderMediaGallery();
    }

    renderMediaGallery() {
        if (!this.activeConv || !this.infoMediaGallery) return;
        const messages = this.activeConv.messages || [];

        if (this.currentMediaTab === "images") {
            const images = messages.filter(m => m.message_type === "image" && m.media_url && !m.is_recalled);
            if (images.length === 0) {
                this.infoMediaGallery.innerHTML = `<span style="grid-column: span 3; font-size:12px; color:var(--text-muted); text-align:center; padding:10px 0;">Chưa có ảnh nào</span>`;
            } else {
                this.infoMediaGallery.innerHTML = images.map(img => `
                    <img src="${img.media_url}" alt="Ảnh" class="media-gallery-thumb" onclick="window.app.openLightbox('${img.media_url}')">
                `).join("");
            }
        } else {
            const files = messages.filter(m => m.message_type === "file" && m.media_url && !m.is_recalled);
            if (files.length === 0) {
                this.infoMediaGallery.innerHTML = `<span style="grid-column: span 3; font-size:12px; color:var(--text-muted); text-align:center; padding:10px 0;">Chưa có tệp tin nào</span>`;
            } else {
                this.infoMediaGallery.innerHTML = `
                    <div class="media-files-list" style="grid-column: span 3; width:100%;">
                        ${files.map(f => `
                            <a href="${f.media_url}" download="${this.escapeHTML(f.media_name || 'file')}" class="media-file-item" target="_blank">
                                <i class="fa-solid fa-file-lines media-file-icon"></i>
                                <div class="media-file-meta">
                                    <div class="media-file-name">${this.escapeHTML(f.media_name || 'Tệp đính kèm')}</div>
                                    <div class="media-file-size">${f.media_size || ''}</div>
                                </div>
                                <i class="fa-solid fa-download" style="font-size:12px; color:var(--text-muted);"></i>
                            </a>
                        `).join("")}
                    </div>
                `;
            }
        }
    }

    // ---------------- NICKNAME MANAGEMENT ----------------
    openNicknamesModal() {
        if (!this.activeConv) return;
        this.renderNicknamesModalList();
        this.openModal(this.modalEditNicknames);
    }

    renderNicknamesModalList() {
        if (!this.activeConv || !this.nicknamesMembersList) return;
        const participants = this.activeConv.participants || [];

        this.nicknamesMembersList.innerHTML = participants.map(p => {
            const isMe = p.id === this.currentUser.id;
            const currentNick = (p.nickname || "").trim();
            const origName = p.original_display_name || p.display_name;
            return `
                <div class="nickname-member-row">
                    <div class="nickname-member-left">
                        <img src="${p.avatar_url}" alt="${origName}" class="avatar-circle-sm">
                        <div class="nickname-member-info">
                            <div class="nickname-member-name">
                                ${this.escapeHTML(origName)} ${isMe ? '<span style="color:var(--text-muted); font-size:12px;">(Bạn)</span>' : ''}
                            </div>
                            <div class="nickname-member-current">
                                ${currentNick ? `Biệt danh: <strong>${this.escapeHTML(currentNick)}</strong>` : '<span style="color:var(--text-muted); font-style:italic;">Chưa có biệt danh</span>'}
                            </div>
                        </div>
                    </div>
                    <div class="nickname-edit-box">
                        <input type="text" class="nickname-input" id="nickname-input-${p.id}" value="${this.escapeHTML(currentNick)}" placeholder="Đặt biệt danh...">
                        <button class="nickname-btn-save" onclick="window.app.saveNickname(${p.id})">Lưu</button>
                        ${currentNick ? `<button class="nickname-btn-clear" onclick="window.app.clearNickname(${p.id})" title="Gỡ biệt danh"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                    </div>
                </div>
            `;
        }).join("");
    }

    async saveNickname(targetUserId) {
        if (!this.activeConv) return;
        const convId = this.activeConv.conversation.id;
        const input = document.getElementById(`nickname-input-${targetUserId}`);
        const nickname = input ? input.value.trim() : "";

        try {
            const res = await fetch(`/api/conversations/${convId}/nicknames`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target_user_id: targetUserId, nickname })
            });
            const data = await res.json();
            if (data.error) {
                alert("Lỗi: " + data.error);
                return;
            }

            // Update participant in memory
            const p = this.activeConv.participants.find(part => part.id === targetUserId);
            if (p) {
                p.nickname = data.nickname;
                p.effective_name = data.nickname || p.original_display_name || p.display_name;
            }

            // Update chat header if target is other user in direct chat
            if (this.activeConv.conversation.type === "direct") {
                const other = this.activeConv.participants.find(part => part.id !== this.currentUser.id);
                if (other && other.id === targetUserId) {
                    this.chatHeaderName.textContent = data.nickname || other.original_display_name || other.display_name;
                }
            }

            this.renderNicknamesModalList();
            this.populateInfoSidebar();
            await this.loadConversations();

        } catch (err) {
            console.error("Failed to save nickname:", err);
            alert("Không thể lưu biệt danh. Vui lòng thử lại!");
        }
    }

    clearNickname(targetUserId) {
        const input = document.getElementById(`nickname-input-${targetUserId}`);
        if (input) input.value = "";
        this.saveNickname(targetUserId);
    }

    handleNicknameUpdated(data) {
        if (!data || !data.conversation_id) return;
        if (this.activeConv && this.activeConv.conversation.id === data.conversation_id) {
            const p = this.activeConv.participants.find(part => part.id === data.target_user_id);
            if (p) {
                p.nickname = data.nickname;
                p.effective_name = data.nickname || p.original_display_name || p.display_name;
            }

            if (this.activeConv.conversation.type === "direct") {
                const other = this.activeConv.participants.find(part => part.id !== this.currentUser.id);
                if (other && other.id === data.target_user_id) {
                    this.chatHeaderName.textContent = data.nickname || other.original_display_name || other.display_name;
                }
            }

            this.renderNicknamesModalList();
            this.populateInfoSidebar();
        }

        this.loadConversations();
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
                this.switchNavTab("messages");
                await this.loadConversations();
                this.selectConversation(data.id);
            }
        } catch (err) {
            console.error("Failed to start direct chat:", err);
        }
    }

    openAddFriendModal() {
        this.friendSearchInput.value = "";
        this.friendSearchResults.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">Nhập số điện thoại hoặc tên và bấm Tìm kiếm</div>`;
        this.openModal(this.modalAddFriend);
    }

    openCreateGroupModal() {
        const checklist = document.getElementById("group-members-checklist");
        if (this.friends.length === 0) {
            checklist.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:13px;">Bạn chưa có bạn bè để thêm vào nhóm. Hãy kết bạn trước nhé!</div>`;
        } else {
            checklist.innerHTML = this.friends.map(u => `
                <label class="user-select-row" style="cursor:pointer;">
                    <input type="checkbox" value="${u.id}" class="group-member-checkbox" style="width:18px; height:18px; accent-color:var(--primary); margin-right:8px;">
                    <img src="${u.avatar_url}" alt="${u.display_name}" class="avatar-circle-sm">
                    <span style="font-size:14px; font-weight:500;">${this.escapeHTML(u.display_name)}</span>
                </label>
            `).join("");
        }
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
            alert("Vui lòng chọn ít nhất 1 bạn bè vào nhóm!");
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
                this.switchNavTab("messages");
                await this.loadConversations();
                this.selectConversation(data.id);
            }
        } catch (err) {
            console.error("Failed to create group:", err);
        }
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

    // ---------------- USER PROFILE ----------------
    async openUserProfile(userId) {
        if (!userId) return;
        try {
            const res = await fetch(`/api/users/${userId}/profile`);
            const data = await res.json();
            if (data.error) {
                alert("Không thể tải thông tin: " + data.error);
                return;
            }

            this.activeProfileUser = data;
            if (data.is_me || (this.currentUser && data.id === this.currentUser.id)) {
                data.status = 'online';
            }

            // Populate view mode
            this.profileAvatarImg.src = data.avatar_url;
            this.profileStatusDot.className = `status-indicator ${data.status || 'offline'}`;
            this.profileDisplayName.textContent = data.display_name || '--';
            this.profileUsername.textContent = `@${data.username || ''}`;
            
            this.profileStatusBadge.textContent = this.formatLastSeen(data.status, data.last_seen);
            this.profileStatusBadge.style.color = data.status === 'online' ? '#10b981' : 'var(--text-secondary)';

            this.profilePhone.textContent = data.phone || 'Chưa cập nhật';
            this.profileDob.textContent = data.dob || 'Chưa cập nhật';
            
            const genderMap = { male: 'Nam', female: 'Nữ', other: 'Khác', unspecified: 'Chưa xác định' };
            this.profileGender.textContent = genderMap[data.gender] || 'Chưa cập nhật';
            this.profileBio.textContent = data.bio || 'Chưa có giới thiệu bản thân';
            this.profileCreatedAt.textContent = data.created_at ? this.formatDateSeparator(data.created_at) : 'Thành viên mới';

            // Switch to view mode
            this.profileViewMode.style.display = "block";
            this.profileEditMode.style.display = "none";
            this.profileEditError.style.display = "none";

            if (data.is_me) {
                this.btnChangeAvatar.style.display = "flex";
                this.profileMyActions.style.display = "block";
                this.profileOtherActions.style.display = "none";

                // Pre-fill edit inputs
                this.editProfileName.value = data.display_name || '';
                this.editProfilePhone.value = data.phone || '';
                this.editProfileDob.value = data.dob || '';
                this.editProfileGender.value = data.gender || 'unspecified';
                this.editProfileBio.value = data.bio || '';
            } else {
                this.btnChangeAvatar.style.display = "none";
                this.profileMyActions.style.display = "none";
                this.profileOtherActions.style.display = "block";

                // Direct chat action
                this.btnProfileChat.onclick = () => {
                    this.closeModal(this.modalUserProfile);
                    this.startDirectChatWith(data.id);
                };

                // Call actions
                this.btnProfileCallAudio.onclick = () => {
                    this.closeModal(this.modalUserProfile);
                    window.callManager.startCall("audio", data, null);
                };
                this.btnProfileCallVideo.onclick = () => {
                    this.closeModal(this.modalUserProfile);
                    window.callManager.startCall("video", data, null);
                };

                // Friendship button
                if (data.friendship_status === "accepted") {
                    this.profileFriendshipWrap.innerHTML = `
                        <button class="btn btn-secondary btn-block" style="opacity:0.85; pointer-events:none;">
                            <i class="fa-solid fa-user-check"></i> Đang là bạn bè
                        </button>
                    `;
                } else if (data.friendship_status === "pending_sent") {
                    this.profileFriendshipWrap.innerHTML = `
                        <button class="btn btn-secondary btn-block" disabled style="opacity:0.7;">
                            <i class="fa-solid fa-clock"></i> Đã gửi lời mời kết bạn
                        </button>
                    `;
                } else if (data.friendship_status === "pending_received") {
                    this.profileFriendshipWrap.innerHTML = `
                        <button class="btn btn-primary btn-block" onclick="window.app.respondFriendRequest(${data.request_id}, 'accept'); window.app.closeModal(window.app.modalUserProfile);">
                            <i class="fa-solid fa-check"></i> Chấp nhận kết bạn
                        </button>
                    `;
                } else {
                    this.profileFriendshipWrap.innerHTML = `
                        <button class="btn btn-primary btn-block" onclick="window.app.sendFriendRequest(${data.id}); window.app.openUserProfile(${data.id});">
                            <i class="fa-solid fa-user-plus"></i> Gửi lời mời kết bạn
                        </button>
                    `;
                }
            }

            this.openModal(this.modalUserProfile);
        } catch (err) {
            console.error("Failed to load user profile:", err);
        }
    }

    async saveProfile() {
        const display_name = this.editProfileName.value.trim();
        const phone = this.editProfilePhone.value.trim();
        const dob = this.editProfileDob.value.trim();
        const gender = this.editProfileGender.value;
        const bio = this.editProfileBio.value.trim();

        if (!display_name) {
            this.profileEditError.textContent = "Vui lòng nhập họ và tên!";
            this.profileEditError.style.display = "block";
            return;
        }

        try {
            const res = await fetch("/api/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display_name, phone, dob, gender, bio })
            });
            const data = await res.json();
            if (data.error) {
                this.profileEditError.textContent = data.error;
                this.profileEditError.style.display = "block";
                return;
            }

            this.currentUser = data.user;
            this.myAvatar.src = data.user.avatar_url;
            this.openUserProfile(this.currentUser.id);
        } catch (err) {
            this.profileEditError.textContent = "Lưu thông tin thất bại!";
            this.profileEditError.style.display = "block";
        }
    }

    async randomizeAvatar() {
        if (!this.currentUser) return;
        const seeds = ["Aria", "Felix", "Leo", "Milo", "Luna", "Kai", "Zara", "Chloe", "Sam", "Max", "Bao", "Kiet", "Mai"];
        const randomSeed = seeds[Math.floor(Math.random() * seeds.length)] + "_" + Date.now();
        const avatar_url = `https://api.dicebear.com/7.x/bottts/svg?seed=${randomSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc`;

        try {
            const res = await fetch("/api/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    display_name: this.currentUser.display_name,
                    avatar_url
                })
            });
            const data = await res.json();
            if (data.user) {
                this.currentUser = data.user;
                this.myAvatar.src = data.user.avatar_url;
                this.profileAvatarImg.src = data.user.avatar_url;
            }
        } catch (err) {
            console.error("Failed to randomize avatar:", err);
        }
    }

    handleAvatarUpload(file) {
        if (!file || !this.currentUser) return;
        
        const changeBtn = document.getElementById("btn-change-avatar");
        const originalBtnHTML = changeBtn ? changeBtn.innerHTML : '<i class="fa-solid fa-camera"></i>';
        if (changeBtn) changeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        const doUpdateAvatar = (avatarUrl) => {
            fetch("/api/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    avatar_url: avatarUrl
                })
            })
            .then(res => res.json())
            .then(data => {
                if (changeBtn) changeBtn.innerHTML = originalBtnHTML;
                if (data.user) {
                    this.currentUser = data.user;
                    this.myAvatar.src = data.user.avatar_url;
                    this.profileAvatarImg.src = data.user.avatar_url;
                    alert("Cập nhật ảnh đại diện thành công!");
                } else {
                    alert("Cập nhật thất bại: " + (data.error || "Không thể cập nhật"));
                }
            })
            .catch(err => {
                if (changeBtn) changeBtn.innerHTML = originalBtnHTML;
                alert("Lỗi kết nối: " + err.message);
            });
        };

        const uploadDirectly = () => {
            const formData = new FormData();
            formData.append("file", file);
            fetch("/api/upload", { method: "POST", body: formData })
                .then(r => r.json())
                .then(up => {
                    if (up.url) {
                        doUpdateAvatar(up.url);
                    } else {
                        if (changeBtn) changeBtn.innerHTML = originalBtnHTML;
                        alert("Không thể tải ảnh: " + (up.error || "Lỗi tệp tin"));
                    }
                })
                .catch(err => {
                    if (changeBtn) changeBtn.innerHTML = originalBtnHTML;
                    alert("Tải ảnh thất bại: " + err.message);
                });
        };

        // Try client-side canvas crop & compress to base64 first
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        const size = 180;
                        canvas.width = size;
                        canvas.height = size;
                        const ctx = canvas.getContext("2d");

                        const minSide = Math.min(img.width, img.height);
                        const sx = (img.width - minSide) / 2;
                        const sy = (img.height - minSide) / 2;
                        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

                        const base64DataUrl = canvas.toDataURL("image/jpeg", 0.85);
                        doUpdateAvatar(base64DataUrl);
                    } catch (canvasErr) {
                        uploadDirectly();
                    }
                };
                img.onerror = () => {
                    uploadDirectly();
                };
                img.src = e.target.result;
            };
            reader.onerror = () => {
                uploadDirectly();
            };
            reader.readAsDataURL(file);
        } catch (e) {
            uploadDirectly();
        }
    }

    handleUserProfileUpdated(data) {
        if (this.currentUser && this.currentUser.id === data.user_id) {
            this.currentUser.display_name = data.display_name;
            this.currentUser.avatar_url = data.avatar_url;
            this.myAvatar.src = data.avatar_url;
        }

        if (this.activeProfileUser && this.activeProfileUser.id === data.user_id) {
            this.profileAvatarImg.src = data.avatar_url;
            this.profileDisplayName.textContent = data.display_name;
            this.profilePhone.textContent = data.phone || 'Chưa cập nhật';
            this.profileDob.textContent = data.dob || 'Chưa cập nhật';
            const genderMap = { male: 'Nam', female: 'Nữ', other: 'Khác', unspecified: 'Chưa xác định' };
            this.profileGender.textContent = genderMap[data.gender] || 'Chưa cập nhật';
            this.profileBio.textContent = data.bio || 'Chưa có giới thiệu bản thân';
        }

        if (this.activeConv && this.activeConv.conversation.type === "direct") {
            const other = this.activeConv.participants.find(p => p.id === data.user_id);
            if (other) {
                other.display_name = data.display_name;
                other.avatar_url = data.avatar_url;
                this.chatHeaderName.textContent = data.display_name;
                this.chatHeaderAvatar.src = data.avatar_url;
            }
        }

        this.loadFriends();
        this.loadConversations();
    }

    // ---------------- EMOJI PICKER ----------------
    initEmojiPicker() {
        this.emojiCategories = {
            smileys: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐"],
            gestures: ["👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🖖", "👏", "🙌", "👐", "🤲", "🤝", "🙏"],
            hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"],
            fun: ["🎉", "🎊", "🎈", "🎂", "🎁", "🎆", "🎇", "✨", "🔥", "⭐", "🌟", "💫", "🏆", "🥇", "🥈", "🥉", "🍕", "🍔", "🍟", "🧋", "☕", "🍺", "🥂"]
        };

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
        // Auth form toggles
        this.tabBtnLogin.addEventListener("click", () => {
            this.tabBtnLogin.classList.add("active");
            this.tabBtnRegister.classList.remove("active");
            this.loginForm.style.display = "flex";
            this.registerForm.style.display = "none";
        });

        this.tabBtnRegister.addEventListener("click", () => {
            this.tabBtnRegister.classList.add("active");
            this.tabBtnLogin.classList.remove("active");
            this.registerForm.style.display = "flex";
            this.loginForm.style.display = "none";
        });

        // Auth submit
        document.getElementById("btn-submit-login").addEventListener("click", () => this.handleLogin());
        this.loginForm.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.handleLogin();
        });

        document.getElementById("btn-submit-register").addEventListener("click", () => this.handleRegister());
        this.registerForm.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.handleRegister();
        });

        this.btnLogout.addEventListener("click", () => this.handleLogout());

        // Add friend actions
        document.querySelectorAll("#btn-nav-add-friend, #btn-quick-add-friend, #btn-empty-add-friend").forEach(el => {
            el.addEventListener("click", () => this.openAddFriendModal());
        });
        this.btnDoSearchFriend.addEventListener("click", () => this.searchFriends());
        this.friendSearchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.searchFriends();
        });

        // Send message
        this.btnSendMessage.addEventListener("click", () => this.sendMessage());
        this.messageInput.addEventListener("input", () => {
            this.messageInput.style.height = "auto";
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + "px";
        });
        this.messageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            } else if (this.currentUser) {
                window.chatSocket.sendTyping(this.currentUser);
            }
        });

        this.btnCancelReply.addEventListener("click", () => this.cancelReply());

        // File uploads
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

        // Filter tabs (Chỉ áp dụng cho các tab bộ lọc tin nhắn)
        document.querySelectorAll("#conversation-filter-tabs .tab-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                document.querySelectorAll("#conversation-filter-tabs .tab-pill").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                this.activeFilter = pill.dataset.filter;
                this.renderConversations();
            });
        });

        // Contacts sort buttons (A-Z và Z-A)
        if (this.btnSortAz) {
            this.btnSortAz.addEventListener("click", () => {
                this.friendSortOrder = "az";
                this.btnSortAz.classList.add("active");
                if (this.btnSortZa) this.btnSortZa.classList.remove("active");
                this.renderFriendsList();
            });
        }
        if (this.btnSortZa) {
            this.btnSortZa.addEventListener("click", () => {
                this.friendSortOrder = "za";
                this.btnSortZa.classList.add("active");
                if (this.btnSortAz) this.btnSortAz.classList.remove("active");
                this.renderFriendsList();
            });
        }

        // Search conversations & friends
        this.searchInput.addEventListener("input", (e) => {
            this.searchQuery = e.target.value.trim();
            this.clearSearchBtn.style.display = this.searchQuery ? "block" : "none";
            this.renderConversations();
            this.renderFriendsList();
        });
        this.clearSearchBtn.addEventListener("click", () => {
            this.searchInput.value = "";
            this.searchQuery = "";
            this.clearSearchBtn.style.display = "none";
            this.renderConversations();
            this.renderFriendsList();
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

        document.querySelectorAll("[data-action='new-group'], #btn-quick-new-group, #btn-empty-new-group").forEach(el => {
            el.addEventListener("click", () => this.openCreateGroupModal());
        });

        document.getElementById("btn-confirm-create-group").addEventListener("click", () => this.confirmCreateGroup());

        document.querySelectorAll(".modal-close-btn, [data-modal]").forEach(btn => {
            btn.addEventListener("click", () => {
                const modalId = btn.getAttribute("data-modal");
                if (modalId) {
                    const m = document.getElementById(modalId);
                    if (m) this.closeModal(m);
                }
            });
        });

        document.getElementById("btn-close-lightbox").addEventListener("click", () => this.closeLightbox());
        this.imageLightbox.addEventListener("click", (e) => {
            if (e.target === this.imageLightbox) this.closeLightbox();
        });

        this.btnToggleInfo.addEventListener("click", () => {
            this.chatInfoSidebar.classList.toggle("open");
        });
        this.btnCloseInfoSidebar.addEventListener("click", () => {
            this.chatInfoSidebar.classList.remove("open");
        });

        if (this.btnOpenNicknames) {
            this.btnOpenNicknames.addEventListener("click", () => this.openNicknamesModal());
        }
        if (this.tabMediaImages) {
            this.tabMediaImages.addEventListener("click", () => this.switchMediaTab("images"));
        }
        if (this.tabMediaFiles) {
            this.tabMediaFiles.addEventListener("click", () => this.switchMediaTab("files"));
        }

        document.getElementById("btn-back-to-list").addEventListener("click", () => {
            this.chatMain.classList.remove("mobile-active");
            document.body.classList.remove("mobile-chat-open");
            if (this.chatInfoSidebar) {
                this.chatInfoSidebar.classList.remove("open");
            }
        });

        // Calls
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

        // Profile Modal Events
        this.userAvatarBtn.addEventListener("click", () => {
            if (this.currentUser) this.openUserProfile(this.currentUser.id);
        });

        this.btnOpenEditProfile.addEventListener("click", () => {
            this.profileViewMode.style.display = "none";
            this.profileEditMode.style.display = "block";
            this.profileEditError.style.display = "none";
        });

        this.btnCancelEditProfile.addEventListener("click", () => {
            this.profileViewMode.style.display = "block";
            this.profileEditMode.style.display = "none";
            this.profileEditError.style.display = "none";
        });

        this.btnSaveProfile.addEventListener("click", () => this.saveProfile());
        this.btnRandomizeAvatar.addEventListener("click", () => this.randomizeAvatar());

        this.btnChangeAvatar.addEventListener("click", () => {
            this.profileAvatarFileInput.click();
        });

        this.profileAvatarFileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                this.handleAvatarUpload(e.target.files[0]);
                e.target.value = "";
            }
        });
    }

    switchNavTab(tab) {
        this.currentNavTab = tab;
        document.querySelectorAll(".nav-btn[data-tab]").forEach(b => {
            b.classList.toggle("active", b.dataset.tab === tab);
        });
        if (tab === "messages") {
            if (this.conversationFilterTabs) this.conversationFilterTabs.style.display = "flex";
            if (this.contactsToolbar) this.contactsToolbar.style.display = "none";
            this.convListContainer.style.display = "block";
            this.contactsContainer.style.display = "none";
        } else if (tab === "contacts") {
            if (this.conversationFilterTabs) this.conversationFilterTabs.style.display = "none";
            if (this.contactsToolbar) this.contactsToolbar.style.display = "flex";
            this.convListContainer.style.display = "none";
            this.contactsContainer.style.display = "block";
            this.loadFriends();
            this.loadFriendRequests();
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

    startPollingSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(async () => {
            if (!this.currentUser || document.hidden) return;

            // When socket is live and connected, messages stream in realtime; skip heavy polling!
            const isSocketConnected = window.chatSocket?.socket?.connected;
            if (isSocketConnected) return;

            if (this.activeConv && this.activeConv.conversation) {
                try {
                    const cid = this.activeConv.conversation.id;
                    const res = await fetch(`/api/conversations/${cid}/messages`);
                    const data = await res.json();
                    if (data && data.messages && this.activeConv && this.activeConv.conversation.id === cid) {
                        let hasNew = false;
                        data.messages.forEach(m => {
                            if (!document.getElementById(`msg-${m.id}`) && !this.activeConv.messages.some(existing => existing.id == m.id)) {
                                this.activeConv.messages.push(m);
                                const row = this.createMessageElement(m);
                                this.messagesStream.appendChild(row);
                                hasNew = true;
                                if (m.sender_id !== this.currentUser.id) {
                                    window.soundManager.playReceived();
                                }
                            }
                        });
                        if (hasNew) {
                            this.scrollToBottom();
                        }
                    }
                } catch (e) {
                    // ignore sync error
                }
            }
        }, 12000);
    }

    toVietnamDate(dateObj) {
        const d = (dateObj instanceof Date && !isNaN(dateObj.getTime())) ? dateObj : new Date();
        // Vietnam timezone is strictly UTC+7 (7 hours = 7 * 60 * 60 * 1000 ms)
        return new Date(d.getTime() + 7 * 60 * 60 * 1000);
    }

    parseDate(val) {
        if (!val) return new Date();
        if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
        let s = String(val).trim();
        if (!s) return new Date();

        // Check if string already has timezone info (Z or +HH:mm or -HH:mm)
        const hasTimezone = /Z$|[+-]\d{2}(:?\d{2})?$/.test(s);
        if (!hasTimezone) {
            // Server timestamps from DB (CURRENT_TIMESTAMP) are in UTC without Z
            // Format to UTC ISO string: "YYYY-MM-DDTHH:mm:ssZ"
            const iso = s.replace(" ", "T") + "Z";
            const dUtc = new Date(iso);
            if (!isNaN(dUtc.getTime())) return dUtc;
        }

        let d = new Date(s);
        if (!isNaN(d.getTime())) return d;
        d = new Date(s.replace(" ", "T"));
        if (!isNaN(d.getTime())) return d;
        d = new Date(s.replace(/-/g, "/"));
        if (!isNaN(d.getTime())) return d;
        return new Date();
    }

    formatRelativeTime(dateStr) {
        if (!dateStr) return "";
        const d = this.parseDate(dateStr);
        if (isNaN(d.getTime())) return "";
        const vn = this.toVietnamDate(d);
        const nowVn = this.toVietnamDate(new Date());

        const isToday = vn.getUTCFullYear() === nowVn.getUTCFullYear() &&
                        vn.getUTCMonth() === nowVn.getUTCMonth() &&
                        vn.getUTCDate() === nowVn.getUTCDate();

        if (isToday) {
            const h = vn.getUTCHours().toString().padStart(2, "0");
            const m = vn.getUTCMinutes().toString().padStart(2, "0");
            return `${h}:${m}`;
        }

        const day = vn.getUTCDate().toString().padStart(2, "0");
        const month = (vn.getUTCMonth() + 1).toString().padStart(2, "0");
        if (vn.getUTCFullYear() === nowVn.getUTCFullYear()) {
            return `${day}/${month}`;
        }
        return `${day}/${month}/${vn.getUTCFullYear()}`;
    }

    formatTimeOnly(dateStr) {
        if (!dateStr) return "";
        const d = this.parseDate(dateStr);
        const vn = this.toVietnamDate(d);
        const h = vn.getUTCHours().toString().padStart(2, "0");
        const m = vn.getUTCMinutes().toString().padStart(2, "0");
        return `${h}:${m}`;
    }

    formatDateSeparator(dateStr) {
        if (!dateStr) return "Hôm nay";
        const d = this.parseDate(dateStr);
        if (isNaN(d.getTime())) return "Hôm nay";
        const vn = this.toVietnamDate(d);
        const nowVn = this.toVietnamDate(new Date());

        if (vn.getUTCFullYear() === nowVn.getUTCFullYear() &&
            vn.getUTCMonth() === nowVn.getUTCMonth() &&
            vn.getUTCDate() === nowVn.getUTCDate()) {
            return "Hôm nay";
        }

        const yesterdayVn = new Date(nowVn.getTime() - 24 * 60 * 60 * 1000);
        if (vn.getUTCFullYear() === yesterdayVn.getUTCFullYear() &&
            vn.getUTCMonth() === yesterdayVn.getUTCMonth() &&
            vn.getUTCDate() === yesterdayVn.getUTCDate()) {
            return "Hôm qua";
        }

        return `${vn.getUTCDate()} Tháng ${vn.getUTCMonth() + 1}, ${vn.getUTCFullYear()}`;
    }

    formatLastSeen(status, lastSeenStr) {
        if (status === "online") {
            return "Đang hoạt động";
        }

        if (!lastSeenStr) {
            return "Tài khoản đã lâu không hoạt động";
        }

        const d = this.parseDate(lastSeenStr);
        if (isNaN(d.getTime())) {
            return "Tài khoản đã lâu không hoạt động";
        }

        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        if (diffMs < 0) {
            return "Vừa mới truy cập";
        }

        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) {
            return "Vừa mới truy cập";
        }
        if (diffMins < 60) {
            return `Hoạt động ${diffMins} phút trước`;
        }
        if (diffHours < 24) {
            return `Hoạt động ${diffHours} giờ trước`;
        }
        if (diffDays < 30) {
            return `Hoạt động ${diffDays} ngày trước`;
        }
        return "Tài khoản đã lâu không hoạt động";
    }

    updateChatHeaderStatus(other) {
        if (!other) return;
        const isOnline = other.status === "online";
        this.chatHeaderStatusDot.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
        const text = this.formatLastSeen(other.status, other.last_seen);
        this.chatHeaderStatusText.textContent = text;
        if (isOnline) {
            this.chatHeaderStatusText.classList.add("online");
            this.chatHeaderStatusText.style.color = "#10b981";
        } else {
            this.chatHeaderStatusText.classList.remove("online");
            this.chatHeaderStatusText.style.color = "var(--text-secondary)";
        }
    }

    async callUserBack(targetUserId, type = "audio") {
        if (!targetUserId) return;
        try {
            const res = await fetch("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "direct",
                    target_user_id: targetUserId
                })
            });
            const data = await res.json();
            if (data.id) {
                await this.selectConversation(data.id);
                const other = this.activeConv.participants.find(p => p.id !== this.currentUser.id);
                window.callManager.startCall(type, other, this.activeConv.conversation);
            }
        } catch (e) {
            console.error("Failed to call back:", e);
        }
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

document.addEventListener("DOMContentLoaded", () => {
    window.app = new ChatApp();
    window.app.init();
});
