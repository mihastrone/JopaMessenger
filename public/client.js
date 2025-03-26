document.addEventListener('DOMContentLoaded', () => {
    // Элементы интерфейса
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const usernameInput = document.getElementById('username-input');
    const loginButton = document.getElementById('login-button');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesContainer = document.getElementById('messages-container');
    const userList = document.getElementById('user-list');
    const userCount = document.getElementById('user-count');
    const connectedServer = document.getElementById('connected-server');
    const connectionStatus = document.getElementById('connection-status');
    const autoDeleteToggle = document.getElementById('auto-delete-toggle');
    const deleteTimeSelect = document.getElementById('delete-time-select');
    
    // Настройки автоудаления
    let autoDeleteEnabled = true;
    let messageLifetime = 30000; // 30 секунд по умолчанию
    const COUNTDOWN_UPDATE_INTERVAL = 1000; // 1 секунда

    let socket;
    let username = '';
    let messageTimers = {}; // Хранилище таймеров для удаления сообщений
    
    // Загрузка настроек из localStorage
    function loadSettings() {
        if (localStorage.getItem('autoDeleteEnabled') !== null) {
            autoDeleteEnabled = localStorage.getItem('autoDeleteEnabled') === 'true';
            autoDeleteToggle.checked = autoDeleteEnabled;
        }
        
        if (localStorage.getItem('messageLifetime') !== null) {
            messageLifetime = parseInt(localStorage.getItem('messageLifetime'));
            deleteTimeSelect.value = messageLifetime.toString();
        }
    }
    
    // Сохранение настроек в localStorage
    function saveSettings() {
        localStorage.setItem('autoDeleteEnabled', autoDeleteEnabled);
        localStorage.setItem('messageLifetime', messageLifetime);
    }
    
    // Загружаем настройки при загрузке страницы
    loadSettings();
    
    // Обработчики событий для настроек
    autoDeleteToggle.addEventListener('change', () => {
        autoDeleteEnabled = autoDeleteToggle.checked;
        saveSettings();
        
        // Обновляем состояние существующих сообщений
        updateMessageDeletionState();
    });
    
    deleteTimeSelect.addEventListener('change', () => {
        messageLifetime = parseInt(deleteTimeSelect.value);
        saveSettings();
        
        // Обновляем таймеры существующих сообщений
        updateMessageDeletionTimers();
    });
    
    // Обновление состояния автоудаления всех сообщений
    function updateMessageDeletionState() {
        const messages = document.querySelectorAll('.message');
        
        messages.forEach(message => {
            const messageId = message.id;
            const countdownElement = document.getElementById(`countdown-${messageId}`);
            
            if (countdownElement) {
                if (autoDeleteEnabled) {
                    countdownElement.style.display = 'block';
                    // Перезапускаем таймер, если он был отключен
                    if (!messageTimers[messageId]) {
                        setupMessageDeletion(messageId);
                    }
                } else {
                    countdownElement.style.display = 'none';
                    // Отменяем существующий таймер
                    if (messageTimers[messageId]) {
                        clearTimeout(messageTimers[messageId].deletionTimer);
                        clearInterval(messageTimers[messageId].countdownInterval);
                        delete messageTimers[messageId];
                    }
                }
            }
        });
    }
    
    // Обновление таймеров автоудаления всех сообщений
    function updateMessageDeletionTimers() {
        Object.keys(messageTimers).forEach(messageId => {
            // Отменяем существующий таймер
            clearTimeout(messageTimers[messageId].deletionTimer);
            clearInterval(messageTimers[messageId].countdownInterval);
            
            // Если автоудаление включено, создаем новый таймер
            if (autoDeleteEnabled) {
                setupMessageDeletion(messageId);
            } else {
                delete messageTimers[messageId];
            }
        });
    }

    // Функция подключения к серверу
    function connectToServer() {
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
            connectedServer.textContent = serverName === 'localhost' ? 'облачному серверу' : serverName;
            
            // Обработчики событий Socket.io
            setupSocketListeners();
            
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
        // Подключение к серверу
        socket.on('connect', () => {
            console.log('Подключено к серверу');
            connectionStatus.innerHTML = 
                `<span style="color:green">Подключено!</span>`;
            
            // Обновляем индикатор статуса
            updateConnectionStatus('online');
            
            // Регистрируем пользователя
            socket.emit('register', username);
            
            // Переключаемся на экран чата
            loginScreen.style.display = 'none';
            chatScreen.style.display = 'flex';
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
            messages.forEach(message => {
                addMessageToUI(message);
            });
            scrollToBottom();
        });

        // Получение нового сообщения
        socket.on('new-message', (message) => {
            addMessageToUI(message);
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
    }

    // Добавление сообщения в UI
    function addMessageToUI(message) {
        const messageElement = document.createElement('div');
        const messageId = `msg-${message.id || Date.now()}-${Math.floor(Math.random() * 1000)}`;
        messageElement.id = messageId;
        
        const isOwnMessage = message.user === username;
        
        messageElement.classList.add('message', isOwnMessage ? 'own' : 'other');
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="message-user">${message.user}</div>
            <div class="message-text">${formatMessage(message.text)}</div>
            <div class="message-time">${time}</div>
            <div class="message-countdown" id="countdown-${messageId}" ${!autoDeleteEnabled ? 'style="display:none"' : ''}>
                Исчезнет через ${Math.floor(messageLifetime / 1000)}с
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        
        // Запускаем таймер для удаления сообщения, если включено автоудаление
        if (autoDeleteEnabled) {
            setupMessageDeletion(messageId);
        }
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

    // Очистка всех таймеров при закрытии страницы
    window.addEventListener('beforeunload', () => {
        Object.values(messageTimers).forEach(timers => {
            clearTimeout(timers.deletionTimer);
            clearInterval(timers.countdownInterval);
        });
    });

    // Обработчики событий UI
    loginButton.addEventListener('click', () => {
        username = usernameInput.value.trim();
        
        if (!username) {
            alert('Пожалуйста, введите имя пользователя');
            return;
        }
        
        connectToServer();
    });

    // Вход по нажатию Enter
    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loginButton.click();
        }
    });

    // Отправка сообщения
    sendButton.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    function sendMessage() {
        const text = messageInput.value.trim();
        
        if (!text) return;
        
        // Проверка соединения перед отправкой
        if (!socket || !socket.connected) {
            addSystemMessageToUI("Невозможно отправить сообщение: нет соединения с сервером");
            return;
        }
        
        // Отправляем сообщение с текущими настройками автоудаления
        socket.emit('send-message', { 
            text, 
            autoDelete: autoDeleteEnabled,
            lifetime: messageLifetime
        });
        
        messageInput.value = '';
    }
}); 