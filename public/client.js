document.addEventListener('DOMContentLoaded', () => {
    // Элементы интерфейса
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    
    // Элементы авторизации
    const loginForm = document.getElementById('login-form');
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const authTabs = document.querySelector('.auth-tabs');
    
    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');
    const rememberMe = document.getElementById('remember-me');
    const loginButton = document.getElementById('login-button');
    
    const registerUsername = document.getElementById('register-username');
    const registerDisplayName = document.getElementById('register-display-name');
    const registerPassword = document.getElementById('register-password');
    const registerPasswordConfirm = document.getElementById('register-password-confirm');
    const registerButton = document.getElementById('register-button');
    
    const connectionStatus = document.getElementById('connection-status');
    
    // Элементы чата
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesContainer = document.getElementById('messages-container');
    const userList = document.getElementById('user-list');
    const userCount = document.getElementById('user-count');
    const connectedServer = document.getElementById('connected-server');
    const createRoomButton = document.getElementById('create-room-button');
    const roomsList = document.getElementById('rooms-list');
    const autoDeleteToggle = document.getElementById('auto-delete-toggle');
    const deleteTimeSelect = document.getElementById('delete-time-select');
    
    // Элементы для работы с изображениями
    const imageUpload = document.getElementById('image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageButton = document.getElementById('remove-image');
    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    
    // Настройки приватных комнат
    let currentRoom = 'general';
    let rooms = new Map(); // Хранилище комнат и их настроек
    let messageTimers = {}; // Хранилище таймеров для удаления сообщений
    let cachedMessages = new Map(); // Кэш сообщений для каждой комнаты (включая общий чат)
    
    // Настройки изображений
    let currentImage = null;
    const MAX_IMAGE_WIDTH = 1024; // Максимальная ширина изображения
    const MAX_IMAGE_HEIGHT = 1024; // Максимальная высота изображения
    const IMAGE_QUALITY = 0.7; // Качество сжатия JPEG (0-1)
    const MAX_IMAGE_SIZE = 500 * 1024; // Максимальный размер файла в байтах (500KB)
    
    // Настройки автоудаления
    let autoDeleteEnabled = true;
    let messageLifetime = 30000; // 30 секунд по умолчанию
    const COUNTDOWN_UPDATE_INTERVAL = 1000; // 1 секунда

    // Настройки звуков
    let soundSettings = {
        enabled: true,
        volume: 0.5,
        sendSound: 'message-sent.mp3',
        receiveSound: 'message-received.mp3'
    };

    let socket;
    
    // Флаг для определения, нужно ли автоматически прокручивать чат
    let shouldScrollToBottom = true;
    
    // Авторизационные данные
    let isLoggedIn = false;
    let username = ''; // Логин для авторизации
    let displayName = ''; // Имя, отображаемое в чате
    
    // Инициализация вкладок авторизации
    function initAuthTabs() {
        if (!authTabs) return;
        
        authTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('auth-tab-btn')) {
                const tab = e.target.dataset.tab;
                
                // Удаляем активный класс со всех кнопок и добавляем нужной
                document.querySelectorAll('.auth-tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');
                
                // Скрываем все табы и показываем нужный
                document.querySelectorAll('.auth-form').forEach(form => {
                    form.style.display = 'none';
                });
                
                if (tab === 'login') {
                    loginTab.style.display = 'flex';
                } else if (tab === 'register') {
                    registerTab.style.display = 'flex';
                }
            }
        });
    }
    
    // Проверка сохраненных учетных данных
    function checkSavedCredentials() {
        const savedUsername = localStorage.getItem('auth_username');
        const savedPassword = localStorage.getItem('auth_password');
        const savedDisplayName = localStorage.getItem('auth_displayName');
        
        if (savedUsername && savedPassword) {
            console.log('Найдены сохраненные учетные данные');
            loginUsername.value = savedUsername;
            loginPassword.value = savedPassword;
            rememberMe.checked = true;
            
            // Если есть сохраненное имя, автоматически авторизуемся
            if (savedDisplayName) {
                username = savedUsername;
                displayName = savedDisplayName;
                authenticateUser(username, savedPassword);
            }
        }
    }
    
    // Сохранение учетных данных
    function saveCredentials(username, password, displayName) {
        if (rememberMe.checked) {
            localStorage.setItem('auth_username', username);
            localStorage.setItem('auth_password', password);
            localStorage.setItem('auth_displayName', displayName);
            console.log('Учетные данные сохранены');
        } else {
            localStorage.removeItem('auth_username');
            localStorage.removeItem('auth_password');
            localStorage.removeItem('auth_displayName');
            console.log('Учетные данные удалены');
        }
    }
    
    // Аутентификация пользователя
    function authenticateUser(username, password) {
        // В облачном хостинге будем использовать текущее положение
        const serverUrl = window.location.origin;
        
        connectionStatus.innerHTML = `<span style="color:orange">Подключение...</span>`;
        console.log('Подключение к серверу:', serverUrl);
        
        // Обновляем индикатор статуса
        updateConnectionStatus('connecting');
        
        try {
            // Настройки Socket.IO клиента
            socket = io(serverUrl, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            // Обновляем информацию о сервере
            const serverName = window.location.hostname.split('.')[0];
            connectedServer.textContent = serverName === 'localhost' ? 'локальный сервер' : serverName;
            
            // Обработчики событий Socket.io
            setupSocketListeners();
            
            // Отправляем данные для авторизации
            socket.emit('authenticate', { username, password, displayName });
            
            // Отладочные сообщения
            socket.on('connect_error', (err) => {
                console.error('Ошибка подключения Socket.IO:', err.message);
                connectionStatus.innerHTML = 
                    `<span style="color:red">Ошибка подключения: ${err.message}</span>`;
            });
            
            socket.on('reconnect_attempt', (attemptNumber) => {
                connectionStatus.innerHTML = 
                    `<span style="color:orange">Повторное подключение (${attemptNumber})...</span>`;
            });
            
            socket.on('reconnect_failed', () => {
                connectionStatus.innerHTML = 
                    `<span style="color:red">Не удалось восстановить подключение</span>`;
            });
            
            return true;
        } catch (error) {
            console.error('Ошибка при создании Socket.IO клиента:', error);
            connectionStatus.innerHTML = 
                `<span style="color:red">Ошибка: ${error.message}</span>`;
            return false;
        }
    }
    
    // Регистрация нового пользователя
    function registerUser() {
        const username = registerUsername.value.trim();
        const displayName = registerDisplayName.value.trim();
        const password = registerPassword.value;
        const passwordConfirm = registerPasswordConfirm.value;
        
        // Проверка введенных данных
        if (!username) {
            alert('Пожалуйста, введите логин');
            return;
        }
        
        if (!displayName) {
            alert('Пожалуйста, введите отображаемое имя');
            return;
        }
        
        if (!password) {
            alert('Пожалуйста, введите пароль');
            return;
        }
        
        if (password !== passwordConfirm) {
            alert('Пароли не совпадают');
            return;
        }
        
        // Подключение к серверу и отправка запроса на регистрацию
        const serverUrl = window.location.origin;
        
        connectionStatus.innerHTML = `<span style="color:orange">Подключение...</span>`;
        console.log('Подключение к серверу для регистрации:', serverUrl);
        
        try {
            // Настройки Socket.IO клиента
            socket = io(serverUrl, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            // Обновляем информацию о сервере
            const serverName = window.location.hostname.split('.')[0];
            connectedServer.textContent = serverName === 'localhost' ? 'локальный сервер' : serverName;
            
            // Обработчики событий Socket.io
            setupSocketListeners();
            
            // Отправляем запрос на регистрацию
            socket.emit('register_user', { username, displayName, password });
            
            return true;
        } catch (error) {
            console.error('Ошибка при создании Socket.IO клиента:', error);
            connectionStatus.innerHTML = 
                `<span style="color:red">Ошибка: ${error.message}</span>`;
            return false;
        }
    }
    
    // Обработчики событий авторизации
    loginButton.addEventListener('click', () => {
        const username = loginUsername.value.trim();
        const password = loginPassword.value;
        
        if (!username) {
            alert('Пожалуйста, введите логин');
            return;
        }
        
        if (!password) {
            alert('Пожалуйста, введите пароль');
            return;
        }
        
        authenticateUser(username, password);
    });
    
    registerButton.addEventListener('click', registerUser);
    
    // Обработчики нажатия Enter
    loginUsername.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loginPassword.focus();
        }
    });
    
    loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loginButton.click();
        }
    });
    
    registerUsername.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            registerDisplayName.focus();
        }
    });
    
    registerDisplayName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            registerPassword.focus();
        }
    });
    
    registerPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            registerPasswordConfirm.focus();
        }
    });
    
    registerPasswordConfirm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            registerButton.click();
        }
    });
    
    // Настройка обработчиков событий сокета
    function setupSocketListeners() {
        // Подключение к серверу
        socket.on('connect', () => {
            console.log('Подключено к серверу');
            connectionStatus.innerHTML = 
                `<span style="color:green">Подключено!</span>`;
            
            // Обновляем индикатор статуса
            updateConnectionStatus('online');
        });
        
        // Авторизация
        socket.on('auth_result', (result) => {
            if (result.success) {
                // Авторизация успешна
                console.log('Авторизация успешна:', result.message);
                
                // Сохраняем данные пользователя
                isLoggedIn = true;
                username = result.username;
                displayName = result.displayName;
                
                // Сохраняем учетные данные, если выбрано "Запомнить меня"
                if (rememberMe.checked) {
                    saveCredentials(username, loginPassword.value, displayName);
                }
                
                // Переключаемся на экран чата
                loginScreen.style.display = 'none';
                chatScreen.style.display = 'flex';
                
                // Инициализируем UI, обязательно делаем это только после успешной авторизации
                initializeUI();
                
                // Загружаем настройки
                loadSettings();
            } else {
                // Ошибка авторизации
                console.error('Ошибка авторизации:', result.message);
                connectionStatus.innerHTML = 
                    `<span style="color:red">Ошибка авторизации: ${result.message}</span>`;
            }
        });
        
        // Регистрация
        socket.on('registration_result', (result) => {
            if (result.success) {
                // Регистрация успешна
                console.log('Регистрация успешна:', result.message);
                
                // Сохраняем данные пользователя
                isLoggedIn = true;
                username = registerUsername.value.trim();
                displayName = registerDisplayName.value.trim();
                
                // Сохраняем учетные данные, если выбрано "Запомнить меня"
                if (rememberMe.checked) {
                    saveCredentials(username, registerPassword.value, displayName);
                }
                
                // Переключаемся на экран чата
                loginScreen.style.display = 'none';
                chatScreen.style.display = 'flex';
                
                // Инициализируем UI, обязательно делаем это только после успешной регистрации
                initializeUI();
                
                // Загружаем настройки
                loadSettings();
            } else {
                // Ошибка регистрации
                console.error('Ошибка регистрации:', result.message);
                connectionStatus.innerHTML = 
                    `<span style="color:red">Ошибка регистрации: ${result.message}</span>`;
            }
        });
        
        // Тест подключения
        socket.on('connection-test', (data) => {
            console.log('Тест подключения:', data);
        });

        // Обработка ошибок подключения
        socket.on('connect_error', (error) => {
            console.error('Ошибка подключения:', error);
        });
        
        // Отключение от сервера
        socket.on('disconnect', (reason) => {
            console.log('Отключено от сервера:', reason);
            
            // Обновляем индикатор статуса
            updateConnectionStatus('offline');
            
            if (reason === 'io server disconnect') {
                // Сервер разорвал соединение
                connectionStatus.innerHTML = 
                    `<span style="color:orange">Отключено от сервера. Повторное подключение...</span>`;
                socket.connect();
            } else {
                // Потеря соединения
                connectionStatus.innerHTML = 
                    `<span style="color:orange">Соединение потеряно. Повторное подключение...</span>`;
            }
        });

        // Получение истории сообщений
        socket.on('message-history', (messages) => {
            messagesContainer.innerHTML = '';
            
            // Кэшируем сообщения общего чата
            const messageElements = [];
            
            messages.forEach(message => {
                const element = addMessageToUI(message);
                messageElements.push(element.cloneNode(true));
            });
            
            cachedMessages.set('general', messageElements);
            scrollToBottom();
        });

        // Получение нового сообщения
        socket.on('new-message', (message) => {
            const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
            
            // Играем звук только для чужих сообщений
            if (message.user !== username) {
                playReceiveSound();
            }
            
            const messageElement = addMessageToUI(message);
            
            // Если это сообщение для общего чата, добавляем его в кэш
            if (currentRoom === 'general' && messageElement) {
                if (!cachedMessages.has('general')) {
                    cachedMessages.set('general', []);
                }
                const generalMessages = cachedMessages.get('general');
                generalMessages.push(messageElement.cloneNode(true));
                cachedMessages.set('general', generalMessages);
            }
            
            // Прокручиваем вниз только если пользователь был внизу
            if (shouldScrollToBottom || message.user === username) {
                scrollToBottom();
            }
        });

        // Обновление списка пользователей
        socket.on('user-list', (users) => {
            updateUserList(users);
        });

        // Системные сообщения
        socket.on('system-message', (message) => {
            addSystemMessageToUI(message);
            scrollToBottom();
        });

        // Обработчики событий комнат
        socket.on('room_created', ({ roomId, roomName, creator }) => {
            addSystemMessageToUI(`Создана новая комната: ${roomName}`);
        });
        
        socket.on('room_joined', ({ roomId, roomName }) => {
            // Сообщение будет добавлено в обработчике нажатия кнопки
        });
        
        socket.on('room_left', ({ roomId, roomName }) => {
            // Сообщение будет добавлено в обработчике нажатия кнопки
        });
        
        socket.on('room_deleted', ({ roomId, roomName }) => {
            addSystemMessageToUI(`Комната удалена: ${roomName}`);
            if (currentRoom === roomId) {
                currentRoom = null;
                messagesContainer.innerHTML = '';
                
                // Загружаем сообщения общего чата
                if (cachedMessages.has('general')) {
                    const generalMessages = cachedMessages.get('general');
                    generalMessages.forEach(msg => {
                        messagesContainer.appendChild(msg.cloneNode(true));
                    });
                }
                
                // Оповещаем сервер, что нужно получить актуальные сообщения общего чата
                socket.emit('get_messages');
            }
            
            // Удаляем комнату и её кэшированные сообщения
            rooms.delete(roomId);
            if (cachedMessages.has(roomId)) {
                cachedMessages.delete(roomId);
            }
            
            saveSettings();
            updateRoomsList();
        });
        
        socket.on('room_message', (message) => {
            if (message.roomId === currentRoom) {
                const messageElement = addMessageToUI(message);
                
                // Кэшируем сообщение для этой комнаты
                if (messageElement) {
                    if (!cachedMessages.has(currentRoom)) {
                        cachedMessages.set(currentRoom, []);
                    }
                    const roomMessages = cachedMessages.get(currentRoom);
                    roomMessages.push(messageElement.cloneNode(true));
                    cachedMessages.set(currentRoom, roomMessages);
                }
            }
        });
        
        // Обработка присоединения пользователя к комнате
        socket.on('user_joined_room', ({ username, displayName, roomId, roomName }) => {
            if (currentRoom === roomId) {
                addSystemMessageToUI(`Пользователь ${displayName || username} присоединился к комнате`);
            }
        });
        
        // Обработка выхода пользователя из комнаты
        socket.on('user_left_room', ({ username, displayName, roomId, roomName }) => {
            if (currentRoom === roomId) {
                addSystemMessageToUI(`Пользователь ${displayName || username} покинул комнату`);
            }
        });
        
        // Получение истории сообщений комнаты
        socket.on('room_messages', (messages) => {
            messagesContainer.innerHTML = '';
            
            // Кэшируем сообщения комнаты
            const messageElements = [];
            
            messages.forEach(message => {
                const element = addMessageToUI(message);
                if (element) {
                    messageElements.push(element.cloneNode(true));
                }
            });
            
            if (currentRoom) {
                cachedMessages.set(currentRoom, messageElements);
            }
            
            scrollToBottom();
        });
    }

    // Модифицированная функция добавления сообщения в UI
    function addMessageToUI(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.id = `message-${message.timestamp}`;
        
        const formattedMessage = formatMessage(message.text);
        
        let imageHtml = '';
        if (message.image) {
            // Проверяем, абсолютный это путь или base64
            const imgSrc = message.image.startsWith('data:') 
                ? message.image  // Это base64
                : message.image; // Это путь к файлу на сервере
            
            imageHtml = `
                <div class="image-container">
                    <img src="${imgSrc}" class="message-image" alt="Изображение">
                </div>
            `;
        }
        
        const isOwnMessage = message.user === username;
        messageElement.classList.add(isOwnMessage ? 'own' : 'other');
        
        // Используем displayName если он есть, или username в качестве запасного варианта
        const senderName = message.displayName || message.user;
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${escapeHtml(senderName)}</span>
                <span class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="message-content">${formattedMessage}</div>
            ${imageHtml}
            ${currentRoom ? `<div id="countdown-${message.timestamp}" class="countdown"></div>` : ''}
        `;
        
        messagesContainer.appendChild(messageElement);
        
        if (currentRoom && rooms.get(currentRoom)?.autoDeleteEnabled) {
            setupMessageDeletion(message.timestamp);
        }
        
        if (shouldScrollToBottom) {
            scrollToBottom();
        }
        
        // Воспроизводим звук только для чужих сообщений
        if (!isOwnMessage) {
            playReceiveSound();
        }
        
        return messageElement;
    }
    
    // Форматирование сообщения (обработка ссылок)
    function formatMessage(text) {
        // Экранируем HTML
        text = escapeHtml(text);
        
        // Находим и заменяем ссылки
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, function(url) {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        });
    }

    // Настройка автоудаления сообщения
    function setupMessageDeletion(messageId) {
        const messageElement = document.getElementById(messageId);
        const countdownElement = document.getElementById(`countdown-${messageId}`);
        
        if (!messageElement) return;
        
        let timeLeft = messageLifetime / 1000; // в секундах
        
        // Отменяем существующие таймеры, если они есть
        if (messageTimers[messageId]) {
            clearTimeout(messageTimers[messageId].deletionTimer);
            clearInterval(messageTimers[messageId].countdownInterval);
        }
        
        // Обновляем обратный отсчет каждую секунду
        const countdownInterval = setInterval(() => {
            timeLeft--;
            if (countdownElement) {
                countdownElement.textContent = `Исчезнет через ${timeLeft}с`;
            }
            
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
            }
        }, COUNTDOWN_UPDATE_INTERVAL);
        
        // Запускаем таймер удаления
        const deletionTimer = setTimeout(() => {
            clearInterval(countdownInterval);
            
            if (messageElement) {
                // Добавляем класс для анимации
                messageElement.classList.add('fade-out');
                
                // Удаляем элемент после завершения анимации
                setTimeout(() => {
                    if (messageElement.parentNode) {
                        messageElement.parentNode.removeChild(messageElement);
                    }
                }, 1500); // Время анимации
            }
            
            // Очищаем ссылку на таймер
            delete messageTimers[messageId];
        }, messageLifetime);
        
        // Сохраняем таймер для потенциальной очистки
        messageTimers[messageId] = {
            deletionTimer,
            countdownInterval
        };
    }

    // Добавление системного сообщения
    function addSystemMessageToUI(text) {
        const messageElement = document.createElement('div');
        const messageId = `system-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        messageElement.id = messageId;
        
        messageElement.classList.add('message', 'system');
        messageElement.textContent = text;
        
        messagesContainer.appendChild(messageElement);
        
        // Запускаем таймер для удаления системного сообщения, если включено автоудаление
        if (autoDeleteEnabled) {
            setupMessageDeletion(messageId);
        }
    }

    // Обновление списка пользователей
    function updateUserList(users) {
        userList.innerHTML = '';
        userCount.textContent = users.length;
        
        users.forEach(user => {
            const userElement = document.createElement('li');
            userElement.textContent = user;
            if (user === username) {
                userElement.textContent += ' (вы)';
                userElement.style.fontWeight = 'bold';
            }
            userList.appendChild(userElement);
        });
    }

    // Прокрутка чата вниз
    function scrollToBottom() {
        // Задержка для корректной работы скролла после рендеринга сообщения
        setTimeout(() => {
            if (messagesContainer) {
                messagesContainer.scrollTo({
                    top: messagesContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }, 0);
    }

    // Экранирование HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Функция для обновления индикатора статуса соединения
    function updateConnectionStatus(status) {
        const statusIndicator = document.getElementById('status-indicator');
        
        if (!statusIndicator) return;
        
        // Удаляем все классы статуса
        statusIndicator.classList.remove('online', 'offline', 'connecting');
        
        // Добавляем нужный класс
        statusIndicator.classList.add(status);
    }

    // Сохранение кэша сообщений в localStorage
    function saveCachedMessages() {
        try {
            const cachesToSave = {};
            cachedMessages.forEach((messages, roomId) => {
                // Сохраняем только текстовые содержимые сообщений, без DOM элементов
                const textsToSave = messages.map(msg => {
                    // Извлекаем только текст и информацию о сообщении
                    const username = msg.querySelector('.username')?.textContent || '';
                    const timestamp = msg.querySelector('.timestamp')?.textContent || '';
                    const content = msg.querySelector('.message-content')?.textContent || '';
                    const isSystem = msg.classList.contains('system');
                    return { username, timestamp, content, isSystem };
                });
                cachesToSave[roomId] = textsToSave;
            });
            
            localStorage.setItem('cached_messages', JSON.stringify(cachesToSave));
        } catch (error) {
            console.error('Ошибка при сохранении кэша сообщений:', error);
        }
    }
    
    // Загрузка кэша сообщений из localStorage
    function loadCachedMessages() {
        try {
            const savedCaches = JSON.parse(localStorage.getItem('cached_messages'));
            if (!savedCaches) return;
            
            // Восстанавливаем сообщения как DOM элементы
            Object.entries(savedCaches).forEach(([roomId, messages]) => {
                const messageElements = messages.map(msg => {
                    const element = document.createElement('div');
                    element.className = 'message';
                    if (msg.isSystem) {
                        element.classList.add('system');
                        element.textContent = msg.content;
                    } else {
                        element.innerHTML = `
                            <div class="message-header">
                                <span class="username">${escapeHtml(msg.username)}</span>
                                <span class="timestamp">${msg.timestamp}</span>
                            </div>
                            <div class="message-content">${escapeHtml(msg.content)}</div>
                        `;
                    }
                    return element;
                });
                
                if (messageElements.length > 0) {
                    cachedMessages.set(roomId, messageElements);
                }
            });
        } catch (error) {
            console.error('Ошибка при загрузке кэша сообщений:', error);
        }
    }
    
    // Сохраняем кэш сообщений при закрытии страницы
    window.addEventListener('beforeunload', () => {
        saveCachedMessages();
        
        Object.values(messageTimers).forEach(timers => {
            clearTimeout(timers.deletionTimer);
            clearInterval(timers.countdownInterval);
        });
    });
    
    // Загружаем кэш сообщений при инициализации
    loadCachedMessages();

    // Инициализация для неавторизованной части приложения
    initAuthTabs();
    checkSavedCredentials();
    
    // Инициализация только звуковых настроек на старте
    loadSoundSettings();
    initializeUI();
    
    // Добавление обработчика отправки сообщений для формы
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
        messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }
    
    // Обработчик кнопки отправки сообщения
    if (sendButton) {
        sendButton.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }
    
    // Обработчик отправки по Enter
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Воспроизведение звука отправки сообщения
    function playSendSound() {
        if (!soundSettings.enabled) return;
        
        const audio = new Audio(`sounds/${soundSettings.sendSound}`);
        audio.volume = soundSettings.volume;
        audio.play().catch(error => {
            console.error('Ошибка воспроизведения звука отправки:', error);
        });
    }
    
    // Воспроизведение звука получения сообщения
    function playReceiveSound() {
        if (!soundSettings.enabled) return;
        
        const audio = new Audio(`sounds/${soundSettings.receiveSound}`);
        audio.volume = soundSettings.volume;
        audio.play().catch(error => {
            console.error('Ошибка воспроизведения звука получения:', error);
        });
    }
    
    // Добавление кнопки настроек звука
    function addSoundSettingsButton() {
        const settingsPanel = document.querySelector('.settings-panel');
        if (!settingsPanel) return;
        
        // Создаем элемент настроек звука, если его ещё нет
        if (!document.getElementById('sound-settings')) {
            const soundSettingsHtml = `
                <div class="setting-item" id="sound-settings">
                    <label>Звук:</label>
                    <div class="toggle-switch">
                        <input type="checkbox" id="sound-toggle" ${soundSettings.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </div>
                </div>
            `;
            
            // Добавляем в панель настроек
            const div = document.createElement('div');
            div.innerHTML = soundSettingsHtml;
            settingsPanel.appendChild(div.firstElementChild);
            
            // Обработчик переключения звука
            const soundToggle = document.getElementById('sound-toggle');
            if (soundToggle) {
                soundToggle.addEventListener('change', (e) => {
                    soundSettings.enabled = e.target.checked;
                    saveSoundSettings();
                });
            }
        }
    }
    
    // Сохранение настроек звука
    function saveSoundSettings() {
        localStorage.setItem('sound_settings', JSON.stringify(soundSettings));
    }
    
    // Загрузка настроек звука
    function loadSoundSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('sound_settings'));
            if (saved) {
                soundSettings = { ...soundSettings, ...saved };
            }
        } catch (error) {
            console.error('Ошибка при загрузке настроек звука:', error);
        }
    }

    // Вызываем добавление кнопки настроек звука в функции initializeUI
    function initializeUI() {
        setupRoomHandlers();
        setupThemeHandler();
        setupOtherImageHandlers();
        addSoundSettingsButton();
    }
    
    // Настройка обработчиков комнат
    function setupRoomHandlers() {
        // Кнопка создания комнаты
        if (createRoomButton) {
            createRoomButton.addEventListener('click', () => {
                // Запрашиваем имя комнаты
                const roomName = prompt('Введите название комнаты:');
                if (roomName && roomName.trim()) {
                    // Генерируем случайный ID комнаты
                    const roomId = 'room_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                    
                    // Отправляем запрос на создание комнаты
                    socket.emit('create_room', { 
                        roomId, 
                        roomName: roomName.trim(),
                        creator: username,
                        autoDeleteEnabled,
                        messageLifetime
                    });
                    
                    // Обновляем список комнат
                    rooms.set(roomId, { name: roomName.trim(), autoDeleteEnabled, messageLifetime });
                    saveSettings();
                    updateRoomsList();
                    
                    // Сразу переключаемся на новую комнату
                    joinRoom(roomId);
                }
            });
        }
        
        // Обработчик списка комнат
        if (roomsList) {
            roomsList.addEventListener('click', (e) => {
                if (e.target.classList.contains('room-button')) {
                    const roomId = e.target.dataset.roomid;
                    
                    if (currentRoom === roomId) {
                        // Выход из комнаты при повторном клике
                        leaveRoom();
                    } else {
                        // Вход в комнату
                        joinRoom(roomId);
                    }
                } else if (e.target.classList.contains('room-delete')) {
                    const roomId = e.target.dataset.roomid;
                    if (confirm('Вы уверены, что хотите удалить эту комнату?')) {
                        socket.emit('delete_room', { roomId });
                    }
                }
            });
        }
        
        // Обработчики автоудаления
        if (autoDeleteToggle) {
            autoDeleteToggle.addEventListener('change', (e) => {
                autoDeleteEnabled = e.target.checked;
                
                if (currentRoom) {
                    const room = rooms.get(currentRoom);
                    if (room) {
                        room.autoDeleteEnabled = autoDeleteEnabled;
                    }
                }
                
                saveSettings();
            });
        }
        
        if (deleteTimeSelect) {
            deleteTimeSelect.addEventListener('change', (e) => {
                messageLifetime = parseInt(e.target.value);
                
                if (currentRoom) {
                    const room = rooms.get(currentRoom);
                    if (room) {
                        room.messageLifetime = messageLifetime;
                    }
                }
                
                saveSettings();
            });
        }
        
        // Загружаем и обновляем список комнат
        updateRoomsList();
    }
    
    // Обновление списка комнат
    function updateRoomsList() {
        if (!roomsList) return;
        
        roomsList.innerHTML = '';
        
        // Сначала общий чат
        const generalRoomElement = document.createElement('div');
        generalRoomElement.classList.add('room-item');
        generalRoomElement.innerHTML = `
            <button class="room-button ${currentRoom === 'general' ? 'active' : ''}" data-roomid="general">
                Общий чат
            </button>
        `;
        roomsList.appendChild(generalRoomElement);
        
        // Затем все остальные комнаты
        rooms.forEach((room, roomId) => {
            const roomElement = document.createElement('div');
            roomElement.classList.add('room-item');
            roomElement.innerHTML = `
                <button class="room-button ${currentRoom === roomId ? 'active' : ''}" data-roomid="${roomId}">
                    ${room.name}
                </button>
                <button class="room-delete" data-roomid="${roomId}">&times;</button>
            `;
            roomsList.appendChild(roomElement);
        });
    }
    
    // Вход в комнату
    function joinRoom(roomId) {
        if (roomId === 'general') {
            // Если выбран общий чат
            leaveRoom(); // Сначала выходим из текущей комнаты
            return;
        }
        
        // Запоминаем текущую комнату для сохранения сообщений
        if (currentRoom && currentRoom !== 'general') {
            // Сохраняем сообщения текущей комнаты перед переходом
            const messages = [];
            const messageElements = messagesContainer.querySelectorAll('.message');
            messageElements.forEach(elem => {
                messages.push(elem.cloneNode(true));
            });
            
            if (messages.length > 0) {
                cachedMessages.set(currentRoom, messages);
            }
        }
        
        socket.emit('join_room', { roomId });
        
        const roomName = rooms.get(roomId)?.name || roomId;
        addSystemMessageToUI(`Вы вошли в комнату: ${roomName}`);
        
        currentRoom = roomId;
        updateRoomsList();
        
        // Очищаем контейнер сообщений
        messagesContainer.innerHTML = '';
        
        // Загружаем кэшированные сообщения если они есть
        if (cachedMessages.has(roomId)) {
            const roomMessages = cachedMessages.get(roomId);
            roomMessages.forEach(msg => {
                messagesContainer.appendChild(msg.cloneNode(true));
            });
            scrollToBottom();
        }
    }
    
    // Выход из комнаты
    function leaveRoom() {
        if (currentRoom) {
            // Сохраняем сообщения текущей комнаты перед выходом
            const messages = [];
            const messageElements = messagesContainer.querySelectorAll('.message');
            messageElements.forEach(elem => {
                messages.push(elem.cloneNode(true));
            });
            
            if (messages.length > 0) {
                cachedMessages.set(currentRoom, messages);
            }
            
            socket.emit('leave_room', { roomId: currentRoom });
            
            const roomName = rooms.get(currentRoom)?.name || currentRoom;
            addSystemMessageToUI(`Вы вышли из комнаты: ${roomName}`);
            
            currentRoom = 'general';
            updateRoomsList();
            
            // Очищаем контейнер сообщений
            messagesContainer.innerHTML = '';
            
            // Загружаем кэшированные сообщения общего чата
            if (cachedMessages.has('general')) {
                const generalMessages = cachedMessages.get('general');
                generalMessages.forEach(msg => {
                    messagesContainer.appendChild(msg.cloneNode(true));
                });
                scrollToBottom();
            }
            
            // Оповещаем сервер, что нужно получить актуальные сообщения общего чата
            socket.emit('get_messages');
        }
    }
    
    // Сохранение настроек комнат
    function saveSettings() {
        const settings = {};
        rooms.forEach((room, roomId) => {
            settings[roomId] = {
                name: room.name,
                autoDeleteEnabled: room.autoDeleteEnabled,
                messageLifetime: room.messageLifetime
            };
        });
        
        localStorage.setItem('chat_rooms', JSON.stringify(settings));
        localStorage.setItem('auto_delete_enabled', JSON.stringify(autoDeleteEnabled));
        localStorage.setItem('message_lifetime', JSON.stringify(messageLifetime));
    }
    
    // Загрузка настроек комнат
    function loadSettings() {
        try {
            const savedRooms = JSON.parse(localStorage.getItem('chat_rooms')) || {};
            rooms = new Map(Object.entries(savedRooms));
            
            const savedAutoDelete = JSON.parse(localStorage.getItem('auto_delete_enabled'));
            if (savedAutoDelete !== null) {
                autoDeleteEnabled = savedAutoDelete;
                if (autoDeleteToggle) {
                    autoDeleteToggle.checked = autoDeleteEnabled;
                }
            }
            
            const savedLifetime = JSON.parse(localStorage.getItem('message_lifetime'));
            if (savedLifetime) {
                messageLifetime = savedLifetime;
                if (deleteTimeSelect) {
                    deleteTimeSelect.value = messageLifetime;
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
        }
    }
    
    // Настройка обработчика темы
    function setupThemeHandler() {
        const themeSelect = document.getElementById('theme-select');
        
        if (!themeSelect) return;
        
        // Загружаем сохраненную тему
        const savedTheme = localStorage.getItem('theme') || 'light';
        
        // Устанавливаем выбранное значение в списке
        themeSelect.value = savedTheme;
        
        // Применяем тему при загрузке
        applyTheme(savedTheme);
        
        // Обработчик изменения темы
        themeSelect.addEventListener('change', (e) => {
            const theme = e.target.value;
            applyTheme(theme);
            localStorage.setItem('theme', theme);
        });
    }
    
    // Применение темы
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
    
    // Настройка обработчиков изображений
    function setupOtherImageHandlers() {
        // Обработчик загрузки изображения
        if (imageUpload) {
            imageUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    processImage(file);
                }
            });
        }
        
        // Обработчик превью и удаления изображения
        if (removeImageButton) {
            removeImageButton.addEventListener('click', () => {
                clearImagePreviews();
            });
        }
        
        // Обработчик просмотра полноразмерного изображения
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('message-image')) {
                openImageModal(e.target.src);
            }
        });
        
        // Обработчик закрытия модального окна с изображением
        if (imageModal) {
            imageModal.addEventListener('click', (e) => {
                if (e.target === imageModal) {
                    closeImageModal();
                }
            });
        }
        
        // Обработчик вставки изображений из буфера обмена
        document.addEventListener('paste', (e) => {
            if (document.activeElement === messageInput) {
                const items = e.clipboardData.items;
                
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const blob = items[i].getAsFile();
                        processImage(blob);
                        
                        // Предотвращаем вставку в текстовое поле
                        e.preventDefault();
                        break;
                    }
                }
            }
        });
    }
    
    // Обработка изображения
    function processImage(file) {
        if (!file || file.type.indexOf('image') === -1) return;
        
        // Проверка размера файла (до сжатия)
        if (file.size > MAX_IMAGE_SIZE * 2) {
            alert(`Файл слишком большой. Максимальный размер: ${MAX_IMAGE_SIZE / 1024}KB`);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Сжимаем изображение, если оно слишком большое
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Уменьшаем размер, сохраняя пропорции
                if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
                    if (width > height) {
                        // Ландшафтная ориентация
                        height = height * (MAX_IMAGE_WIDTH / width);
                        width = MAX_IMAGE_WIDTH;
                    } else {
                        // Портретная ориентация
                        width = width * (MAX_IMAGE_HEIGHT / height);
                        height = MAX_IMAGE_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Конвертируем в JPEG с указанным качеством
                const dataURL = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
                
                // Проверка размера после сжатия
                const base64Size = dataURL.length * 3 / 4; // Приблизительный размер в байтах
                if (base64Size > MAX_IMAGE_SIZE) {
                    alert(`Изображение слишком большое даже после сжатия. Пожалуйста, используйте меньшее изображение.`);
                    return;
                }
                
                // Сохраняем и показываем превью
                currentImage = dataURL;
                
                // Отображаем превью
                if (imagePreview && imagePreviewContainer) {
                    imagePreview.src = dataURL;
                    imagePreviewContainer.style.display = 'flex';
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    // Очистка превью изображений
    function clearImagePreviews() {
        if (imagePreviewContainer) {
            imagePreviewContainer.style.display = 'none';
        }
        
        if (imagePreview) {
            imagePreview.src = '';
        }
        
        // Сбрасываем значение input
        if (imageUpload) {
            imageUpload.value = '';
        }
        
        currentImage = null;
    }
    
    // Открытие модального окна с изображением
    function openImageModal(imgSrc) {
        if (!imageModal || !modalImage) return;
        
        modalImage.src = imgSrc;
        imageModal.style.display = 'flex';
    }
    
    // Закрытие модального окна с изображением
    function closeImageModal() {
        if (!imageModal) return;
        
        imageModal.style.display = 'none';
        modalImage.src = '';
    }

    // Модифицированная функция отправки сообщения
    function sendMessage() {
        const text = messageInput.value.trim();
        
        // Если нет ни текста, ни изображения
        if (!text && !currentImage) return;
        
        const message = {
            text,
            username,
            displayName,
            timestamp: Date.now(),
            roomId: currentRoom,
            hasImage: !!currentImage,
            image: currentImage
        };
        
        socket.emit('message', message);
        messageInput.value = '';
        
        // Очищаем изображение после отправки
        if (currentImage) {
            currentImage = null;
            imagePreview.src = '';
            imagePreviewContainer.style.display = 'none';
            imageUpload.value = '';
        }
        
        playSendSound();
    }

    // Обработчик прокрутки чата
    messagesContainer.addEventListener('scroll', () => {
        // Проверяем, находится ли пользователь близко к нижней части чата
        const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        shouldScrollToBottom = isAtBottom;
    });
}); 