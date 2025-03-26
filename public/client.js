document.addEventListener('DOMContentLoaded', () => {
    // Инициализация комнат для предотвращения ошибки ReferenceError
    window.rooms = new Map(); // Должно быть в самом начале
    let rooms = window.rooms; // Хранилище комнат и их настроек
    
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
    window.currentRoom = currentRoom;
    
    let messageTimers = {}; // Хранилище таймеров для удаления сообщений
    let cachedMessages = new Map(); // Кэш сообщений для каждой комнаты (включая общий чат)
    
    // Настройки изображений (оптимизировано для Railway)
    let currentImage = null;
    const MAX_IMAGE_WIDTH = 800; // Уменьшаем до 800px для Railway
    const MAX_IMAGE_HEIGHT = 800; // Уменьшаем до 800px для Railway
    const IMAGE_QUALITY = 0.6; // Снижаем качество для Railway
    const MAX_IMAGE_SIZE = 300 * 1024; // Уменьшаем максимальный размер до 300KB для Railway
    
    // Настройки автоудаления
    let autoDeleteEnabled = true;
    let messageLifetime = 30000; // 30 секунд по умолчанию
    const COUNTDOWN_UPDATE_INTERVAL = 1000; // 1 секунда

    // Настройки звуков - удаляем
    let soundSettings = {
        enabled: true,
        volume: 0.5,
        sendSound: 'message-sent.mp3',
        receiveSound: 'message-received.mp3'
    };

    // Инициализируем socket как null
    let socket = null;
    window.socket = null;
    
    // Флаг для определения, нужно ли автоматически прокручивать чат
    let shouldScrollToBottom = true;
    
    // Авторизационные данные
    let isLoggedIn = false;
    let username = ''; // Логин для авторизации
    window.username = username;
    
    let displayName = ''; // Имя, отображаемое в чате
    window.displayName = displayName;
    
    // Глобальные переменные для админ-панели
    let isAdmin = false;
    let bannedUsers = new Map(); // Хранит информацию о забаненных пользователях
    window.isAdmin = false; // Глобальная переменная для отслеживания статуса администратора
    
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
                window.username = username;
                window.displayName = displayName;
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
        // Автоматически определяем URL сервера на основе текущего хоста (для Railway)
        const serverUrl = window.location.origin;
        
        connectionStatus.innerHTML = `<span style="color:orange">Подключение...</span>`;
        console.log('Подключение к серверу:', serverUrl);
        
        // Обновляем индикатор статуса
        updateConnectionStatus('connecting');
        
        try {
            // Отключаем существующее соединение если есть
            if (socket && socket.connected) {
                console.log('Закрываем предыдущее соединение');
                socket.disconnect();
            }
            
            // Оптимизированные настройки Socket.IO
            socket = io(serverUrl, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                timeout: 10000,
                autoConnect: true,
                forceNew: true, // Важно: создаем новое соединение
                compress: true
            });
            
            // Сохраняем в глобальную переменную
            window.socket = socket;
            
            // Обновляем информацию о сервере
            const serverName = window.location.hostname;
            const isRailway = serverName.includes('railway.app') || 
                            serverName.includes('up.railway.app');
                
            connectedServer.textContent = isRailway ? 'Railway Cloud' : 
                                        (serverName === 'localhost' ? 'локальный сервер' : serverName);
            
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
    
    // Настройка обработчиков событий сокета
    function setupSocketListeners() {
        console.log("Настройка обработчиков сокетов");
        if (!socket) {
            console.error("Ошибка: socket не инициализирован");
            return;
        }
        
        // Отключаем предыдущие обработчики, чтобы избежать дублирования
        socket.off('connect');
        socket.off('disconnect');
        socket.off('auth_result');
        socket.off('registration_result');
        socket.off('message-history');
        socket.off('new-message');
        socket.off('user-list');
        socket.off('system-message');
        socket.off('room_created');
        socket.off('room_joined');
        socket.off('room_left');
        socket.off('room_deleted');
        socket.off('room_message');
        socket.off('user_joined_room');
        socket.off('user_left_room');
        socket.off('room_messages');
        
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
                window.username = username;
                displayName = result.displayName;
                window.displayName = displayName;
                
                // Обновляем глобальную переменную socket
                window.socket = socket;
                
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
                window.username = username;
                displayName = registerDisplayName.value.trim();
                window.displayName = displayName;
                
                // Обновляем глобальную переменную socket
                window.socket = socket;
                
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
            console.log('Получена история сообщений:', messages.length);
            const messagesContainer = document.getElementById('messages-container');
            if (!messagesContainer) {
                console.error('Контейнер сообщений не найден при загрузке истории');
                return;
            }
            
            messagesContainer.innerHTML = '';
            
            // Кэшируем сообщения общего чата
            const messageElements = [];
            
            messages.forEach(message => {
                const element = addMessageToUI(message);
                if (element) {
                    messageElements.push(element.cloneNode(true));
                }
            });
            
            cachedMessages.set('general', messageElements);
            scrollToBottom();
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
            console.log('Комната создана:', roomId, roomName, creator);
            
            // Добавляем комнату в список только если ее еще нет
            if (!rooms.has(roomId)) {
                rooms.set(roomId, { 
                    name: roomName, 
                    autoDeleteEnabled: true,
                    messageLifetime: 30000
                });
                
                // Сохраняем настройки
                saveSettings();
                
                // Обновляем список комнат
                updateRoomsList();
            }
            
            addSystemMessageToUI(`Создана новая комната: ${roomName}`);
            
            // Если создатель текущий пользователь, автоматически входим в созданную комнату
            if (creator === username) {
                joinRoom(roomId);
            }
        });
        
        // Обработка присоединения к комнате
        socket.on('room_joined', ({ roomId, roomName }) => {
            console.log('Вы присоединились к комнате:', roomId, roomName);
            // Сообщение будет добавлено в обработчике нажатия кнопки
        });
        
        // Обработка выхода из комнаты
        socket.on('room_left', ({ roomId, roomName }) => {
            console.log('Вы вышли из комнаты:', roomId, roomName);
            // Сообщение будет добавлено в обработчике нажатия кнопки
        });
        
        // Удаление комнаты
        socket.on('room_deleted', ({ roomId, roomName }) => {
            console.log('Комната удалена:', roomId, roomName);
            addSystemMessageToUI(`Комната удалена: ${roomName}`);
            
            if (currentRoom === roomId) {
                currentRoom = 'general';
                window.currentRoom = 'general';
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

        // Получение истории сообщений комнаты
        socket.on('room_messages', (messages) => {
            console.log('Получена история сообщений комнаты:', messages.length, 'сообщений');
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
        
        // Обработка присоединения пользователя к комнате
        socket.on('user_joined_room', ({ username, displayName, roomId, roomName }) => {
            console.log('Пользователь присоединился к комнате:', username, roomId);
            if (currentRoom === roomId) {
                addSystemMessageToUI(`Пользователь ${displayName || username} присоединился к комнате`);
            }
        });
        
        // Обработка выхода пользователя из комнаты
        socket.on('user_left_room', ({ username, displayName, roomId, roomName }) => {
            console.log('Пользователь покинул комнату:', username, roomId);
            if (currentRoom === roomId) {
                addSystemMessageToUI(`Пользователь ${displayName || username} покинул комнату`);
            }
        });
        
        // Получение нового сообщения
        socket.on('new-message', (message) => {
            console.log('Получено новое сообщение от сервера:', message);
            
            // Проверяем, что сообщение существует и содержит необходимые поля
            if (!message || typeof message !== 'object') {
                console.error('Получено неверное сообщение:', message);
                return;
            }
            
            // Проверяем, находимся ли мы в общем чате
            if (currentRoom !== 'general') {
                console.log('Игнорируем сообщение для общего чата, т.к. находимся в комнате:', currentRoom);
                return;
            }
            
            const messageElement = addMessageToUI(message);
            console.log('Результат добавления сообщения в UI:', messageElement ? 'успешно' : 'ошибка');
            
            // Если это сообщение для общего чата, добавляем его в кэш
            if (messageElement) {
                if (!cachedMessages.has('general')) {
                    cachedMessages.set('general', []);
                    console.log('Создана новая коллекция кэша для общего чата');
                }
                const generalMessages = cachedMessages.get('general');
                generalMessages.push(messageElement.cloneNode(true));
                cachedMessages.set('general', generalMessages);
                console.log('Сообщение добавлено в кэш общего чата, текущий размер:', generalMessages.length);
            }
        });
        
        // Сообщения в комнате
        socket.on('room_message', (message) => {
            console.log('Получено сообщение для комнаты от сервера:', message);
            
            // Проверяем, что сообщение существует и содержит необходимые поля
            if (!message || typeof message !== 'object') {
                console.error('Получено неверное сообщение для комнаты:', message);
                return;
            }
            
            // Проверяем, что сообщение предназначено для текущей комнаты
            if (message.roomId !== currentRoom) {
                console.log(`Игнорируем сообщение для комнаты ${message.roomId}, т.к. находимся в ${currentRoom}`);
                return;
            }
            
            const messageElement = addMessageToUI(message);
            console.log('Результат добавления сообщения комнаты в UI:', messageElement ? 'успешно' : 'ошибка');
            
            // Кэшируем сообщение для этой комнаты
            if (messageElement) {
                if (!cachedMessages.has(currentRoom)) {
                    cachedMessages.set(currentRoom, []);
                    console.log(`Создана новая коллекция кэша для комнаты ${currentRoom}`);
                }
                const roomMessages = cachedMessages.get(currentRoom);
                roomMessages.push(messageElement.cloneNode(true));
                cachedMessages.set(currentRoom, roomMessages);
                console.log(`Сообщение добавлено в кэш комнаты ${currentRoom}, текущий размер:`, roomMessages.length);
            }
        });
        
        // Принудительная отправка тестового сообщения для проверки работы чата
        setTimeout(() => {
            if (isLoggedIn && socket.connected) {
                console.log('Отправка тестового системного сообщения');
                addSystemMessageToUI('Подключение проверено, чат работает');
            }
        }, 5000);
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
        
        // Автоматически определяем URL сервера (для Railway)
        const serverUrl = window.location.origin;
        
        connectionStatus.innerHTML = `<span style="color:orange">Подключение...</span>`;
        console.log('Подключение к серверу для регистрации:', serverUrl);
        
        try {
            // Отключаем существующее соединение если есть
            if (socket && socket.connected) {
                console.log('Закрываем предыдущее соединение для регистрации');
                socket.disconnect();
            }
            
            // Оптимизированные настройки Socket.IO для Railway
            socket = io(serverUrl, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                timeout: 10000,
                autoConnect: true,
                forceNew: true, // Важно: создаем новое соединение
                compress: true
            });
            
            // Сохраняем в глобальную переменную
            window.socket = socket;
            
            // Обновляем информацию о сервере
            const serverName = window.location.hostname;
            // Проверяем, является ли хост Railway-доменом
            const isRailway = serverName.includes('railway.app') || 
                            serverName.includes('up.railway.app');
                            
            connectedServer.textContent = isRailway ? 'Railway Cloud' : 
                                        (serverName === 'localhost' ? 'локальный сервер' : serverName);
            
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
    
    registerButton.addEventListener('click', registerUser);
    
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
    
    // Настройка обработчиков событий сокета
    function setupSocketListeners() {
        console.log("Настройка обработчиков сокетов");
        if (!socket) {
            console.error("Ошибка: socket не инициализирован");
            return;
        }
        
        // Отключаем предыдущие обработчики, чтобы избежать дублирования
        socket.off('connect');
        socket.off('disconnect');
        socket.off('auth_result');
        socket.off('registration_result');
        socket.off('message-history');
        socket.off('new-message');
        socket.off('user-list');
        socket.off('system-message');
        socket.off('room_created');
        socket.off('room_joined');
        socket.off('room_left');
        socket.off('room_deleted');
        socket.off('room_message');
        socket.off('user_joined_room');
        socket.off('user_left_room');
        socket.off('room_messages');
        
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
                window.username = username;
                displayName = result.displayName;
                window.displayName = displayName;
                
                // Обновляем глобальную переменную socket
                window.socket = socket;
                
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
                window.username = username;
                displayName = registerDisplayName.value.trim();
                window.displayName = displayName;
                
                // Обновляем глобальную переменную socket
                window.socket = socket;
                
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
            console.log('Получена история сообщений:', messages.length);
            const messagesContainer = document.getElementById('messages-container');
            if (!messagesContainer) {
                console.error('Контейнер сообщений не найден при загрузке истории');
                return;
            }
            
            messagesContainer.innerHTML = '';
            
            // Кэшируем сообщения общего чата
            const messageElements = [];
            
            messages.forEach(message => {
                const element = addMessageToUI(message);
                if (element) {
                    messageElements.push(element.cloneNode(true));
                }
            });
            
            cachedMessages.set('general', messageElements);
            scrollToBottom();
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
            console.log('Комната создана:', roomId, roomName, creator);
            
            // Добавляем комнату в список только если ее еще нет
            if (!rooms.has(roomId)) {
                rooms.set(roomId, { 
                    name: roomName, 
                    autoDeleteEnabled: true,
                    messageLifetime: 30000
                });
                
                // Сохраняем настройки
                saveSettings();
                
                // Обновляем список комнат
                updateRoomsList();
            }
            
            addSystemMessageToUI(`Создана новая комната: ${roomName}`);
            
            // Если создатель текущий пользователь, автоматически входим в созданную комнату
            if (creator === username) {
                joinRoom(roomId);
            }
        });
        
        // Обработка присоединения к комнате
        socket.on('room_joined', ({ roomId, roomName }) => {
            console.log('Вы присоединились к комнате:', roomId, roomName);
            // Сообщение будет добавлено в обработчике нажатия кнопки
        });
        
        // Обработка выхода из комнаты
        socket.on('room_left', ({ roomId, roomName }) => {
            console.log('Вы вышли из комнаты:', roomId, roomName);
            // Сообщение будет добавлено в обработчике нажатия кнопки
        });
        
        // Удаление комнаты
        socket.on('room_deleted', ({ roomId, roomName }) => {
            console.log('Комната удалена:', roomId, roomName);
            addSystemMessageToUI(`Комната удалена: ${roomName}`);
            
            if (currentRoom === roomId) {
                currentRoom = 'general';
                window.currentRoom = 'general';
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

        // Получение истории сообщений комнаты
        socket.on('room_messages', (messages) => {
            console.log('Получена история сообщений комнаты:', messages.length, 'сообщений');
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
        
        // Обработка присоединения пользователя к комнате
        socket.on('user_joined_room', ({ username, displayName, roomId, roomName }) => {
            console.log('Пользователь присоединился к комнате:', username, roomId);
            if (currentRoom === roomId) {
                addSystemMessageToUI(`Пользователь ${displayName || username} присоединился к комнате`);
            }
        });
        
        // Обработка выхода пользователя из комнаты
        socket.on('user_left_room', ({ username, displayName, roomId, roomName }) => {
            console.log('Пользователь покинул комнату:', username, roomId);
            if (currentRoom === roomId) {
                addSystemMessageToUI(`Пользователь ${displayName || username} покинул комнату`);
            }
        });
        
        // Получение нового сообщения
        socket.on('new-message', (message) => {
            console.log('Получено новое сообщение от сервера:', message);
            
            // Проверяем, что сообщение существует и содержит необходимые поля
            if (!message || typeof message !== 'object') {
                console.error('Получено неверное сообщение:', message);
                return;
            }
            
            // Проверяем, находимся ли мы в общем чате
            if (currentRoom !== 'general') {
                console.log('Игнорируем сообщение для общего чата, т.к. находимся в комнате:', currentRoom);
                return;
            }
            
            const messageElement = addMessageToUI(message);
            console.log('Результат добавления сообщения в UI:', messageElement ? 'успешно' : 'ошибка');
            
            // Если это сообщение для общего чата, добавляем его в кэш
            if (messageElement) {
                if (!cachedMessages.has('general')) {
                    cachedMessages.set('general', []);
                    console.log('Создана новая коллекция кэша для общего чата');
                }
                const generalMessages = cachedMessages.get('general');
                generalMessages.push(messageElement.cloneNode(true));
                cachedMessages.set('general', generalMessages);
                console.log('Сообщение добавлено в кэш общего чата, текущий размер:', generalMessages.length);
            }
        });
        
        // Сообщения в комнате
        socket.on('room_message', (message) => {
            console.log('Получено сообщение для комнаты от сервера:', message);
            
            // Проверяем, что сообщение существует и содержит необходимые поля
            if (!message || typeof message !== 'object') {
                console.error('Получено неверное сообщение для комнаты:', message);
                return;
            }
            
            // Проверяем, что сообщение предназначено для текущей комнаты
            if (message.roomId !== currentRoom) {
                console.log(`Игнорируем сообщение для комнаты ${message.roomId}, т.к. находимся в ${currentRoom}`);
                return;
            }
            
            const messageElement = addMessageToUI(message);
            console.log('Результат добавления сообщения комнаты в UI:', messageElement ? 'успешно' : 'ошибка');
            
            // Кэшируем сообщение для этой комнаты
            if (messageElement) {
                if (!cachedMessages.has(currentRoom)) {
                    cachedMessages.set(currentRoom, []);
                    console.log(`Создана новая коллекция кэша для комнаты ${currentRoom}`);
                }
                const roomMessages = cachedMessages.get(currentRoom);
                roomMessages.push(messageElement.cloneNode(true));
                cachedMessages.set(currentRoom, roomMessages);
                console.log(`Сообщение добавлено в кэш комнаты ${currentRoom}, текущий размер:`, roomMessages.length);
            }
        });
        
        // Принудительная отправка тестового сообщения для проверки работы чата
        setTimeout(() => {
            if (isLoggedIn && socket.connected) {
                console.log('Отправка тестового системного сообщения');
                addSystemMessageToUI('Подключение проверено, чат работает');
            }
        }, 5000);
    }
    
    // Модифицированная функция добавления сообщения в UI
    function addMessageToUI(message) {
        console.log('Добавление сообщения в UI:', message);
        
        if (!message) {
            console.error('Получено пустое сообщение');
            return null;
        }
        
        // Найдем контейнер сообщений
        const msgContainer = document.getElementById('messages-container');
        if (!msgContainer) {
            console.error('Контейнер сообщений не найден');
            return null;
        }
        
        // Создаем новый элемент сообщения
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.id = `message-${message.timestamp || Date.now()}`;
        
        const formattedMessage = formatMessage(message.text || '');
        
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
        
        // Используем username из сообщения для сравнения с текущим пользователем
        const isOwnMessage = message.username === window.username;
        messageElement.classList.add(isOwnMessage ? 'own' : 'other');
        
        // Используем displayName если он есть, или username в качестве запасного варианта
        const senderName = message.displayName || message.username || 'Аноним';
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${escapeHtml(senderName)}</span>
                <span class="timestamp">&nbsp;•&nbsp;${new Date(message.timestamp || Date.now()).toLocaleTimeString()}</span>
            </div>
            <div class="message-content">${formattedMessage}</div>
            ${imageHtml}
            ${currentRoom !== 'general' ? `<div id="countdown-${message.timestamp || Date.now()}" class="countdown"></div>` : ''}
        `;
        
        // Напрямую добавляем в DOM
        msgContainer.appendChild(messageElement);
        console.log('Сообщение добавлено в DOM, текущее количество сообщений:', msgContainer.children.length);
        
        // Безопасно проверяем автоудаление в комнатах
        const roomToCheck = window.rooms || rooms;
        
        // Настраиваем автоудаление только для комнат, не для общего чата
        if (currentRoom !== 'general' && roomToCheck && roomToCheck.get && roomToCheck.get(currentRoom)?.autoDeleteEnabled) {
            setupMessageDeletion(message.timestamp || Date.now());
        }
        
        // Прокручиваем чат вниз
        scrollToBottom();
        
        return messageElement;
    }
    
    // Обработчики сообщений теперь будут глобально доступны
    window.addMessageToUI = addMessageToUI;
    
    // Усиленная функция прокрутки чата вниз
    function scrollToBottom() {
        console.log('Вызвана функция прокрутки чата вниз');
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) {
            console.error('Элемент messages-container не найден при попытке прокрутки');
            return;
        }
        
        // Попытка прокрутки сразу
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Запасной вариант с задержкой 
        setTimeout(() => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                console.log('Выполнена прокрутка чата вниз (с задержкой)');
            }
        }, 100);
    }
    window.scrollToBottom = scrollToBottom;
    
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
    
    // Сохранение кэша сообщений при закрытии страницы
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
    
    // Настройка обработчиков комнат
    function setupRoomHandlers() {
        console.log('Настройка обработчиков комнат, createRoomButton:', createRoomButton ? 'найден' : 'не найден');
        
        // Сначала проверяем существование кнопки создания комнаты
        const createRoomBtn = document.getElementById('create-room-button');
        if (createRoomBtn) {
            console.log('Найдена кнопка создания комнаты по ID');
            
            // Напрямую добавляем обработчик без клонирования
            createRoomBtn.onclick = function() {
                console.log('Клик по кнопке создания комнаты');
                // Запрашиваем имя комнаты
                const roomName = prompt('Введите название комнаты:');
                if (roomName && roomName.trim()) {
                    // Генерируем случайный ID комнаты
                    const roomId = 'room_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                    console.log('Создаем комнату:', roomId, roomName);
                    
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
            };
        } else {
            console.error('Кнопка создания комнаты не найдена по ID');
        }
        
        // Настраиваем обработчики списка комнат
        setupRoomListHandlers();
        
        // Обработчики автоудаления
        if (autoDeleteToggle) {
            // Удаляем существующие обработчики путем установки напрямую
            autoDeleteToggle.onchange = function(e) {
                autoDeleteEnabled = e.target.checked;
                
                if (currentRoom && currentRoom !== 'general') {
                    const room = rooms.get(currentRoom);
                    if (room) {
                        room.autoDeleteEnabled = autoDeleteEnabled;
                    }
                }
                
                saveSettings();
            };
        }
        
        if (deleteTimeSelect) {
            // Удаляем существующие обработчики путем установки напрямую
            deleteTimeSelect.onchange = function(e) {
                messageLifetime = parseInt(e.target.value);
                
                if (currentRoom && currentRoom !== 'general') {
                    const room = rooms.get(currentRoom);
                    if (room) {
                        room.messageLifetime = messageLifetime;
                    }
                }
                
                saveSettings();
            };
        }
        
        // Загружаем и обновляем список комнат
        updateRoomsList();
    }
    
    // Обновление списка комнат
    function updateRoomsList() {
        // Проверяем существование элемента
        const roomsListElement = document.getElementById('rooms-list');
        if (!roomsListElement) {
            console.error('Элемент rooms-list не найден');
            return;
        }
        
        // Очищаем список комнат
        roomsListElement.innerHTML = '';
        
        // Сначала общий чат
        const generalRoomElement = document.createElement('div');
        generalRoomElement.classList.add('room-item');
        generalRoomElement.innerHTML = `
            <button class="room-button ${currentRoom === 'general' ? 'active' : ''}" data-roomid="general">
                Общий чат
            </button>
        `;
        roomsListElement.appendChild(generalRoomElement);
        
        // Затем все остальные комнаты
        console.log('Обновление списка комнат, текущие комнаты:', Array.from(rooms.entries()));
        rooms.forEach((room, roomId) => {
            const roomElement = document.createElement('div');
            roomElement.classList.add('room-item');
            roomElement.innerHTML = `
                <button class="room-button ${currentRoom === roomId ? 'active' : ''}" data-roomid="${roomId}">
                    ${room.name}
                </button>
                <button class="room-delete" data-roomid="${roomId}">&times;</button>
            `;
            roomsListElement.appendChild(roomElement);
        });
        
        // Добавляем обработчики к новым кнопкам
        setupRoomListHandlers();
    }
    window.updateRoomsList = updateRoomsList;
    
    // Отдельная функция для обработчиков комнат
    function setupRoomListHandlers() {
        // Обновляем ссылку на элемент списка комнат
        const roomsListElement = document.getElementById('rooms-list');
        if (!roomsListElement) {
            console.error('Элемент rooms-list не найден при установке обработчиков');
            return;
        }
        
        // Удаляем предыдущие обработчики, чтобы избежать дублирования
        const oldRoomsList = roomsListElement.cloneNode(true);
        roomsListElement.parentNode.replaceChild(oldRoomsList, roomsListElement);
        
        // Добавляем обработчик для кнопок в списке комнат
        oldRoomsList.addEventListener('click', function(e) {
            if (e.target.classList.contains('room-button')) {
                const roomId = e.target.dataset.roomid;
                console.log('Клик по кнопке комнаты:', roomId);
                
                if (currentRoom === roomId) {
                    // Выход из комнаты при повторном клике
                    leaveRoom();
                } else {
                    // Вход в комнату
                    joinRoom(roomId);
                }
            } else if (e.target.classList.contains('room-delete')) {
                const roomId = e.target.dataset.roomid;
                console.log('Клик по кнопке удаления комнаты:', roomId);
                
                // Используем модальное окно с подтверждением
                if (confirm('Вы уверены, что хотите удалить эту комнату?')) {
                    console.log('Отправляю запрос на удаление комнаты:', roomId);
                    socket.emit('delete_room', { roomId });
                    
                    // Сразу перенаправляем в общий чат, чтобы избежать проблем с интерфейсом
                    if (currentRoom === roomId) {
                        currentRoom = 'general';
                        window.currentRoom = 'general';
                        messagesContainer.innerHTML = '';
                        socket.emit('get_messages');
                    }
                }
            }
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
        window.currentRoom = currentRoom;
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
    window.joinRoom = joinRoom;
    
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
            window.currentRoom = currentRoom;
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
    window.leaveRoom = leaveRoom;
    
    // Сохранение настроек комнат
    function saveSettings() {
        try {
            const settings = {};
            rooms.forEach((room, roomId) => {
                settings[roomId] = {
                    name: room.name,
                    autoDeleteEnabled: room.autoDeleteEnabled,
                    messageLifetime: room.messageLifetime
                };
            });
            
            console.log('Сохраняю настройки комнат:', settings);
            localStorage.setItem('chat_rooms', JSON.stringify(settings));
            localStorage.setItem('auto_delete_enabled', JSON.stringify(autoDeleteEnabled));
            localStorage.setItem('message_lifetime', JSON.stringify(messageLifetime));
        } catch (error) {
            console.error('Ошибка при сохранении настроек:', error);
        }
    }
    window.saveSettings = saveSettings;
    
    // Загрузка настроек комнат
    function loadSettings() {
        try {
            console.log('Загрузка настроек комнат...');
            
            // Проверяем, инициализирована ли переменная rooms
            if (!window.rooms) {
                window.rooms = new Map();
            }
            
            if (typeof rooms === 'undefined') {
                rooms = window.rooms;
            }
            
            // Загружаем сохраненные комнаты
            const savedRoomsStr = localStorage.getItem('chat_rooms');
            console.log('Загружаю сохраненные комнаты (строка):', savedRoomsStr);
            
            if (savedRoomsStr) {
                const savedRooms = JSON.parse(savedRoomsStr) || {};
                console.log('Загружаю сохраненные комнаты (объект):', savedRooms);
                
                // Обновляем глобальную переменную rooms
                window.rooms = new Map(Object.entries(savedRooms));
                rooms = window.rooms;
            }
            
            // Загружаем настройки автоудаления
            const savedAutoDelete = localStorage.getItem('auto_delete_enabled');
            if (savedAutoDelete !== null) {
                autoDeleteEnabled = JSON.parse(savedAutoDelete);
                if (autoDeleteToggle) {
                    autoDeleteToggle.checked = autoDeleteEnabled;
                }
            }
            
            // Загружаем время жизни сообщений
            const savedLifetime = localStorage.getItem('message_lifetime');
            if (savedLifetime) {
                messageLifetime = JSON.parse(savedLifetime);
                if (deleteTimeSelect) {
                    deleteTimeSelect.value = messageLifetime;
                }
            }
            
            // Обновляем список комнат после загрузки
            updateRoomsList();
            console.log('Комнаты после загрузки:', Array.from(window.rooms.entries()));
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
            
            // В случае ошибки инициализируем пустую структуру
            window.rooms = new Map();
            rooms = window.rooms;
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
    
    // Обработка изображения с оптимизацией для Railway
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
                // Сжимаем изображение для Railway
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Более агрессивное уменьшение размера для Railway
                if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
                    const ratio = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                // Улучшенное качество рендеринга
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // Используем webp для лучшего сжатия, если браузер поддерживает
                let dataURL;
                if (typeof canvas.toBlob === 'function' && window.navigator.userAgent.indexOf('Edge') === -1) {
                    try {
                        // Пробуем WebP для современных браузеров
                        dataURL = canvas.toDataURL('image/webp', IMAGE_QUALITY);
                        if (dataURL.indexOf('data:image/webp') !== 0) {
                            // Fallback к JPEG если WebP не поддерживается
                            dataURL = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
                        }
                    } catch (e) {
                        // Fallback к JPEG при ошибках
                        dataURL = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
                    }
                } else {
                    // Fallback для старых браузеров
                    dataURL = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
                }
                
                // Проверка размера после сжатия
                const base64Size = dataURL.length * 3 / 4; // Приблизительный размер в байтах
                if (base64Size > MAX_IMAGE_SIZE) {
                    // Если изображение всё еще слишком большое, пробуем еще сильнее сжать
                    const secondPassQuality = IMAGE_QUALITY * 0.7;
                    dataURL = canvas.toDataURL('image/jpeg', secondPassQuality);
                    
                    const newSize = dataURL.length * 3 / 4;
                    if (newSize > MAX_IMAGE_SIZE) {
                        alert(`Изображение слишком большое даже после сжатия (${Math.round(newSize/1024)}KB). Пожалуйста, используйте меньшее изображение.`);
                        return;
                    }
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
        console.log('Вызвана функция отправки сообщения');
        
        // Проверяем, доступен ли сокет
        if (!window.socket || !window.socket.connected) {
            console.error('Сокет не инициализирован или не подключен!');
            alert('Ошибка подключения к серверу. Обновите страницу.');
            return;
        }
        
        const text = messageInput.value.trim();
        
        // Если нет ни текста, ни изображения
        if (!text && !currentImage) {
            console.log('Нет текста и изображения для отправки');
            return;
        }
        
        const message = {
            text,
            username: window.username, // Используем глобальную переменную
            displayName: window.displayName, // Используем глобальную переменную
            timestamp: Date.now(),
            roomId: window.currentRoom, // Используем глобальную переменную
            hasImage: !!currentImage,
            image: currentImage
        };
        
        console.log('Отправка сообщения:', message);
        window.socket.emit('message', message); // Используем глобальную переменную
        messageInput.value = '';
        
        // Очищаем изображение после отправки
        if (currentImage) {
            currentImage = null;
            imagePreview.src = '';
            imagePreviewContainer.style.display = 'none';
            imageUpload.value = '';
        }
        
        // Обновляем UI после отправки
        scrollToBottom();
    }
    window.sendMessage = sendMessage; // Делаем доступной глобально
    
    // Добавление обработчиков для отправки сообщений (вызывается в основном блоке кода)
    function setupMessageHandlers() {
        console.log('Настройка обработчиков отправки сообщений');
        // Получаем ссылки на элементы
        const sendBtn = document.getElementById('send-button');
        const msgInput = document.getElementById('message-input');
        
        if (sendBtn) {
            console.log('Найдена кнопка отправки сообщения');
            // Напрямую добавляем обработчик
            sendBtn.onclick = function(e) {
                console.log('Клик по кнопке отправки');
                e.preventDefault();
                sendMessage();
            };
        } else {
            console.error('Кнопка отправки сообщения не найдена');
        }
        
        if (msgInput) {
            console.log('Найдено поле ввода сообщения');
            // Напрямую добавляем обработчик
            msgInput.onkeydown = function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    console.log('Нажата клавиша Enter');
                    e.preventDefault();
                    sendMessage();
                }
            };
        } else {
            console.error('Поле ввода сообщения не найдено');
        }
    }

    // Обработчик прокрутки чата
    messagesContainer.addEventListener('scroll', () => {
        // Проверяем, находится ли пользователь близко к нижней части чата
        const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        shouldScrollToBottom = isAtBottom;
    });

    // Функция инициализации интерфейса - вызывается только один раз
    function initializeUI() {
        console.log('Инициализация пользовательского интерфейса');
        
        // Инициализируем обработчики только если еще не инициализированы
        if (!window.uiInitialized) {
            setupRoomHandlers();
            setupThemeHandler();
            setupOtherImageHandlers();
            setupMessageHandlers();
            
            // Отмечаем, что UI уже инициализирован
            window.uiInitialized = true;
            console.log('UI инициализирован');
        } else {
            console.log('UI уже был инициализирован ранее');
        }
        
        // Обновляем список комнат в любом случае
        updateRoomsList();
    }

    // Добавляем обработчик отправки по Enter для текстового поля
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM загружен');
        
        // Находим элемент ввода сообщения
        const textInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-button');
        
        // Добавляем глобальный обработчик для текстового поля
        if (textInput) {
            console.log('Добавляю глобальный обработчик для текстового поля');
            
            textInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    console.log('Нажат Enter без Shift');
                    e.preventDefault();
                    if (isLoggedIn && socket) {
                        sendMessage();
                    } else {
                        console.log('Пользователь не авторизован или сокет не инициализирован');
                    }
                    return false;
                }
            });
        }
        
        // Добавляем глобальный обработчик для кнопки отправки
        if (sendBtn) {
            console.log('Добавляю глобальный обработчик для кнопки отправки');
            
            sendBtn.addEventListener('click', function(e) {
                console.log('Клик по кнопке отправки (DOMContentLoaded)');
                e.preventDefault();
                if (isLoggedIn && socket) {
                    sendMessage();
                } else {
                    console.log('Пользователь не авторизован или сокет не инициализирован');
                }
                return false;
            });
        }
    });

    // Добавляем прямой обработчик в конце файла
    (function() {
        // Ждем полной загрузки документа
        document.addEventListener('DOMContentLoaded', function() {
            console.log('Инициализация прямых обработчиков после загрузки DOM');
            
            // Обработчик для кнопки создания комнаты
            const createRoomBtn = document.getElementById('create-room-button');
            if (createRoomBtn) {
                console.log('Добавляю прямой обработчик для кнопки создания комнаты');
                
                // Удаляем все существующие обработчики
                const oldBtn = createRoomBtn.cloneNode(true);
                createRoomBtn.parentNode.replaceChild(oldBtn, createRoomBtn);
                
                // Добавляем новый обработчик
                oldBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    console.log('Прямой клик по кнопке создания комнаты');
                    
                    // Проверяем, что пользователь авторизован и сокет доступен
                    if (!window.socket || !window.socket.connected) {
                        console.error('Сокет не инициализирован!');
                        alert('Ошибка подключения к серверу. Обновите страницу.');
                        return;
                    }
                    
                    const roomName = prompt('Введите название комнаты:');
                    if (roomName && roomName.trim()) {
                        // Генерируем случайный ID комнаты
                        const roomId = 'room_' + Date.now();
                        console.log('Создание комнаты:', roomId, roomName.trim(), 'от пользователя:', window.username);
                        
                        try {
                            // Отправляем запрос на создание комнаты
                            window.socket.emit('create_room', { 
                                roomId, 
                                roomName: roomName.trim(),
                                creator: window.username
                            });
                            
                            console.log('Запрос на создание комнаты отправлен');
                            
                            // Принудительно добавляем комнату в список, не дожидаясь события от сервера
                            if (window.rooms) {
                                window.rooms.set(roomId, { 
                                    name: roomName.trim(), 
                                    autoDeleteEnabled: true, 
                                    messageLifetime: 30000 
                                });
                                
                                // Обновляем список комнат
                                if (typeof window.updateRoomsList === 'function') {
                                    window.updateRoomsList();
                                }
                                
                                // Переключаемся в новую комнату
                                if (typeof window.joinRoom === 'function') {
                                    window.joinRoom(roomId);
                                }
                            }
                        } catch (err) {
                            console.error('Ошибка при создании комнаты:', err);
                            alert('Произошла ошибка при создании комнаты. Попробуйте еще раз.');
                        }
                    }
                });
            }
        });
    })();
    
    // Добавляем прямой обработчик для кнопки отправки сообщений
    (function() {
        // Ждем полной загрузки документа
        document.addEventListener('DOMContentLoaded', function() {
            // Обработчик для кнопки отправки сообщения
            const sendButton = document.getElementById('send-button');
            const messageInput = document.getElementById('message-input');
            
            if (sendButton && messageInput) {
                console.log('Добавляю прямой обработчик для кнопки отправки сообщения');
                
                // Удаляем все существующие обработчики
                const oldBtn = sendButton.cloneNode(true);
                sendButton.parentNode.replaceChild(oldBtn, sendButton);
                
                // Новый инпут без обработчиков
                const oldInput = messageInput.cloneNode(true);
                messageInput.parentNode.replaceChild(oldInput, messageInput);
                
                // Добавляем новый обработчик для кнопки
                oldBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    console.log('Прямой клик по кнопке отправки сообщения');
                    
                    // Проверка наличия функции отправки сообщений
                    if (typeof window.sendMessage === 'function') {
                        window.sendMessage();
                    } else {
                        console.error('Функция sendMessage не найдена');
                        
                        // Резервный вариант отправки
                        const text = oldInput.value.trim();
                        if (!text) return;
                        
                        if (window.socket && window.socket.connected) {
                            const message = {
                                text: text,
                                username: window.username,
                                displayName: window.displayName,
                                timestamp: Date.now(),
                                roomId: window.currentRoom,
                                hasImage: false
                            };
                            
                            console.log('Отправка сообщения напрямую (резервный вариант):', message);
                            window.socket.emit('message', message);
                            oldInput.value = '';
                        } else {
                            console.error('Сокет не инициализирован или не подключен');
                            alert('Ошибка подключения к серверу. Обновите страницу.');
                        }
                    }
                });
                
                // Обработчик для поля ввода (Enter)
                oldInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        oldBtn.click();
                        return false;
                    }
                });
            } else {
                console.error('Элементы для отправки сообщений не найдены');
            }
        });
    })();

    // Функция для входа в панель администратора
    function loginAsAdmin() {
        const adminPassword = prompt('Введите пароль администратора:');
        if (adminPassword === '71814131Tar') {
            isAdmin = true;
            window.isAdmin = true;
            
            // Отправляем запрос на сервер для получения статуса администратора
            socket.emit('admin_login', { username: window.username });
            
            // Создаем и показываем панель администратора
            createAdminPanel();
            
            alert('Вы вошли как администратор!');
            return true;
        } else {
            alert('Неверный пароль администратора!');
            return false;
        }
    }
    
    // Создание панели администратора
    function createAdminPanel() {
        // Проверяем, существует ли уже панель администратора
        let adminPanel = document.getElementById('admin-panel');
        if (adminPanel) {
            adminPanel.style.display = 'block';
            return;
        }
        
        // Создаем панель администратора
        adminPanel = document.createElement('div');
        adminPanel.id = 'admin-panel';
        adminPanel.className = 'admin-panel';
        
        // Добавляем заголовок
        const adminHeader = document.createElement('div');
        adminHeader.className = 'admin-header';
        adminHeader.innerHTML = '<h2>Панель администратора</h2>';
        
        // Создаем кнопку для скрытия/показа панели
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'Скрыть панель';
        toggleButton.className = 'admin-toggle-button';
        toggleButton.onclick = function() {
            const panel = document.getElementById('admin-content');
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                this.textContent = 'Скрыть панель';
            } else {
                panel.style.display = 'none';
                this.textContent = 'Показать панель';
            }
        };
        adminHeader.appendChild(toggleButton);
        adminPanel.appendChild(adminHeader);
        
        // Создаем контейнер для содержимого панели
        const adminContent = document.createElement('div');
        adminContent.id = 'admin-content';
        adminContent.className = 'admin-content';
        
        // Секция управления пользователями
        const userManagementSection = document.createElement('div');
        userManagementSection.className = 'admin-section';
        userManagementSection.innerHTML = `
            <h3>Управление пользователями</h3>
            <div class="admin-input-group">
                <input type="text" id="ban-username" placeholder="Имя пользователя">
                <select id="ban-duration">
                    <option value="300000">5 минут</option>
                    <option value="3600000">1 час</option>
                    <option value="86400000">1 день</option>
                    <option value="604800000">1 неделя</option>
                    <option value="-1">Навсегда</option>
                </select>
                <button id="ban-user-button">Забанить</button>
                <button id="unban-user-button">Разбанить</button>
            </div>
            <div class="banned-users-list">
                <h4>Забаненные пользователи</h4>
                <ul id="banned-users-list"></ul>
            </div>
        `;
        
        // Секция просмотра приватных чатов
        const privateChatSection = document.createElement('div');
        privateChatSection.className = 'admin-section';
        privateChatSection.innerHTML = `
            <h3>Приватные чаты</h3>
            <div class="admin-input-group">
                <select id="private-room-select">
                    <option value="">Выберите комнату</option>
                </select>
                <button id="view-room-button">Просмотреть</button>
            </div>
            <div id="admin-room-messages" class="admin-room-messages"></div>
        `;
        
        // Добавляем секции в контент
        adminContent.appendChild(userManagementSection);
        adminContent.appendChild(privateChatSection);
        adminPanel.appendChild(adminContent);
        
        // Добавляем стили для панели администратора
        const style = document.createElement('style');
        style.textContent = `
            .admin-panel {
                position: fixed;
                top: 10px;
                right: 10px;
                width: 350px;
                background-color: #fff;
                border: 1px solid #ccc;
                border-radius: 5px;
                box-shadow: 0 0 10px rgba(0,0,0,0.2);
                z-index: 1000;
                max-height: 80vh;
                overflow-y: auto;
            }
            .admin-header {
                padding: 10px;
                background-color: #f0f0f0;
                border-bottom: 1px solid #ccc;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .admin-content {
                padding: 10px;
            }
            .admin-section {
                margin-bottom: 20px;
            }
            .admin-input-group {
                display: flex;
                margin-bottom: 10px;
                flex-wrap: wrap;
            }
            .admin-input-group input,
            .admin-input-group select {
                padding: 5px;
                margin-right: 5px;
                margin-bottom: 5px;
                flex-grow: 1;
            }
            .admin-input-group button {
                padding: 5px 10px;
                margin-right: 5px;
                margin-bottom: 5px;
            }
            .admin-room-messages {
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid #ccc;
                padding: 10px;
                margin-top: 10px;
            }
            .admin-toggle-button {
                padding: 5px 10px;
                cursor: pointer;
            }
            .banned-users-list {
                margin-top: 10px;
                border: 1px solid #ccc;
                padding: 10px;
                max-height: 150px;
                overflow-y: auto;
            }
            .banned-users-list ul {
                padding-left: 20px;
                margin: 0;
            }
            .banned-users-list li {
                margin-bottom: 5px;
            }
        `;
        document.head.appendChild(style);
        
        // Добавляем панель в документ
        document.body.appendChild(adminPanel);
        
        // Добавляем обработчики событий для кнопок
        document.getElementById('ban-user-button').addEventListener('click', banUser);
        document.getElementById('unban-user-button').addEventListener('click', unbanUser);
        document.getElementById('view-room-button').addEventListener('click', viewPrivateRoom);
        
        // Запрашиваем список забаненных пользователей
        socket.emit('get_banned_users');
        
        // Запрашиваем список приватных комнат
        socket.emit('get_private_rooms');
        
        console.log('Панель администратора создана');
    }
    
    // Функция для бана пользователя
    function banUser() {
        const username = document.getElementById('ban-username').value.trim();
        const duration = parseInt(document.getElementById('ban-duration').value);
        
        if (!username) {
            alert('Введите имя пользователя');
            return;
        }
        
        // Отправляем запрос на сервер
        socket.emit('ban_user', { username, duration });
        
        // Обновляем список забаненных пользователей
        updateBannedUsersList();
    }
    
    // Функция для разбана пользователя
    function unbanUser() {
        const username = document.getElementById('ban-username').value.trim();
        
        if (!username) {
            alert('Введите имя пользователя');
            return;
        }
        
        // Отправляем запрос на сервер
        socket.emit('unban_user', { username });
        
        // Обновляем список забаненных пользователей
        updateBannedUsersList();
    }
    
    // Функция для просмотра приватной комнаты
    function viewPrivateRoom() {
        const roomId = document.getElementById('private-room-select').value;
        
        if (!roomId) {
            alert('Выберите комнату');
            return;
        }
        
        // Отправляем запрос на получение сообщений комнаты
        socket.emit('get_room_messages_admin', { roomId });
    }
    
    // Функция для обновления списка забаненных пользователей
    function updateBannedUsersList() {
        // Запрашиваем актуальный список с сервера
        socket.emit('get_banned_users');
    }
    
    // Обработчик для отображения списка забаненных пользователей
    function displayBannedUsers(users) {
        const bannedUsersList = document.getElementById('banned-users-list');
        if (!bannedUsersList) return;
        
        bannedUsersList.innerHTML = '';
        
        if (!users || users.length === 0) {
            bannedUsersList.innerHTML = '<li>Нет забаненных пользователей</li>';
            return;
        }
        
        users.forEach(user => {
            const li = document.createElement('li');
            const banDuration = user.banDuration === -1 ? 
                'навсегда' : 
                formatDuration(user.banDuration);
            
            const banExpiry = user.banExpiry ? 
                ` (до ${new Date(user.banExpiry).toLocaleString()})` : 
                '';
            
            li.textContent = `${user.username} - ${banDuration}${banExpiry}`;
            bannedUsersList.appendChild(li);
        });
    }
    
    // Функция для отображения сообщений приватной комнаты
    function displayPrivateRoomMessages(messages, roomName) {
        const messagesContainer = document.getElementById('admin-room-messages');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = `<h4>Сообщения комнаты: ${roomName}</h4>`;
        
        if (!messages || messages.length === 0) {
            messagesContainer.innerHTML += '<p>В этой комнате нет сообщений</p>';
            return;
        }
        
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = 'admin-message';
            
            // Форматируем дату и время
            const timestamp = new Date(message.timestamp).toLocaleString();
            
            messageElement.innerHTML = `
                <div class="admin-message-header">
                    <span class="admin-message-username">${message.displayName || message.username}</span>
                    <span class="admin-message-timestamp">&nbsp;•&nbsp;${timestamp}</span>
                </div>
                <div class="admin-message-content">${formatMessage(message.text || '')}</div>
                ${message.image ? `<div class="admin-message-image"><img src="${message.image}" alt="Изображение"></div>` : ''}
            `;
            
            messagesContainer.appendChild(messageElement);
        });
    }
    
    // Функция для форматирования продолжительности бана
    function formatDuration(ms) {
        if (ms === -1) return 'навсегда';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} д.`;
        if (hours > 0) return `${hours} ч.`;
        if (minutes > 0) return `${minutes} мин.`;
        return `${seconds} сек.`;
    }
    
    // Обновляем обработчики сокетов для админских функций
    function setupAdminSocketListeners() {
        // Получение списка забаненных пользователей
        socket.on('banned_users_list', (users) => {
            bannedUsers = new Map(users.map(user => [user.username, user]));
            displayBannedUsers(users);
        });
        
        // Получение списка приватных комнат
        socket.on('private_rooms_list', (roomsList) => {
            const roomSelect = document.getElementById('private-room-select');
            if (!roomSelect) return;
            
            // Сохраняем текущий выбор
            const currentSelection = roomSelect.value;
            
            // Очищаем список
            roomSelect.innerHTML = '<option value="">Выберите комнату</option>';
            
            // Добавляем комнаты в список
            roomsList.forEach(room => {
                const option = document.createElement('option');
                option.value = room.id;
                option.textContent = `${room.name} (Создатель: ${room.creator})`;
                roomSelect.appendChild(option);
            });
            
            // Восстанавливаем выбор, если возможно
            if (currentSelection) {
                roomSelect.value = currentSelection;
            }
        });
        
        // Получение сообщений приватной комнаты
        socket.on('room_messages_admin', ({ messages, roomName }) => {
            displayPrivateRoomMessages(messages, roomName);
        });
        
        // Уведомление о бане пользователя
        socket.on('user_banned', (data) => {
            console.log(`Пользователь ${data.username} забанен`);
            // Обновляем список забаненных пользователей
            updateBannedUsersList();
        });
        
        // Уведомление о разбане пользователя
        socket.on('user_unbanned', (data) => {
            console.log(`Пользователь ${data.username} разбанен`);
            // Обновляем список забаненных пользователей
            updateBannedUsersList();
        });
        
        // Проверка на бан при каждом подключении
        socket.on('check_ban', (data) => {
            if (data.banned) {
                const banInfo = data.banInfo || {};
                const banDuration = banInfo.banDuration === -1 ? 
                    'навсегда' : 
                    formatDuration(banInfo.banDuration);
                
                const banExpiry = banInfo.banExpiry ? 
                    ` до ${new Date(banInfo.banExpiry).toLocaleString()}` : 
                    '';
                
                alert(`Вы забанены: ${banDuration}${banExpiry}`);
                // Отключаем пользователя
                if (socket) socket.disconnect();
                // Перенаправляем на страницу логина
                loginScreen.style.display = 'flex';
                chatScreen.style.display = 'none';
            }
        });
    }
    
    // Добавляем кнопку для входа в админ-панель в меню настроек
    function addAdminLoginButton() {
        const settingsContainer = document.querySelector('.settings-container');
        if (!settingsContainer) return;
        
        // Создаем отдельную секцию для админа
        const adminSection = document.createElement('div');
        adminSection.className = 'settings-section admin-section';
        adminSection.innerHTML = `
            <h3>Администрирование</h3>
            <button id="admin-login-button" class="admin-login-button">
                <i class="fas fa-cog"></i> Войти как администратор
            </button>
        `;
        
        // Добавляем секцию в контейнер настроек
        settingsContainer.appendChild(adminSection);
        
        // Добавляем обработчик для кнопки
        document.getElementById('admin-login-button').addEventListener('click', loginAsAdmin);
        
        // Добавляем иконку шестеренки в навигационную панель
        const navContainer = document.querySelector('.nav-container') || document.querySelector('header');
        if (navContainer) {
            const adminIcon = document.createElement('div');
            adminIcon.className = 'admin-icon';
            adminIcon.innerHTML = `<i class="fas fa-cog" title="Админ-панель"></i>`;
            adminIcon.addEventListener('click', loginAsAdmin);
            navContainer.appendChild(adminIcon);
            
            // Добавляем стиль для иконки
            const style = document.createElement('style');
            style.textContent = `
                .admin-icon {
                    cursor: pointer;
                    margin-left: 15px;
                    font-size: 1.2em;
                    color: #555;
                    transition: color 0.3s;
                }
                .admin-icon:hover {
                    color: #007bff;
                }
                .admin-login-button i {
                    margin-right: 5px;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Модифицируем функцию initializeUI для добавления кнопки админа
    const originalInitializeUI = window.initializeUI || initializeUI;
    window.initializeUI = function() {
        // Вызываем оригинальную функцию
        if (typeof originalInitializeUI === 'function') {
            originalInitializeUI();
        }
        
        // Добавляем кнопку админа и настраиваем обработчики
        addAdminLoginButton();
        setupAdminSocketListeners();
        
        console.log('UI инициализирован с поддержкой админских функций');
    };
}); 