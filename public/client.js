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
    let currentRoom = null;
    let rooms = new Map(); // Хранилище комнат и их настроек
    let messageTimers = {}; // Хранилище таймеров для удаления сообщений
    
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
        volume: 0.7,
        sendSound: 'send-1.mp3',
        receiveSound: 'Message_get.wav'
    };

    let socket;
    let username = '';
    
    // Флаг для определения, нужно ли автоматически прокручивать чат
    let shouldScrollToBottom = true;
    
    // Загрузка настроек из localStorage
    function loadSettings() {
        if (localStorage.getItem('rooms')) {
            try {
                rooms = new Map(JSON.parse(localStorage.getItem('rooms')));
                updateRoomsList();
            } catch (error) {
                console.error('Ошибка при загрузке настроек комнат:', error);
            }
        }
        
        if (localStorage.getItem('autoDeleteEnabled') !== null) {
            autoDeleteEnabled = localStorage.getItem('autoDeleteEnabled') === 'true';
            autoDeleteToggle.checked = autoDeleteEnabled;
        }
        
        if (localStorage.getItem('messageLifetime') !== null) {
            messageLifetime = parseInt(localStorage.getItem('messageLifetime'));
            deleteTimeSelect.value = messageLifetime.toString();
        }
        
        // Загружаем сохранённую тему
        if (localStorage.getItem('theme')) {
            const savedTheme = localStorage.getItem('theme');
            document.querySelector('#theme-select').value = savedTheme;
            applyTheme(savedTheme);
        }
        
        // Загрузка настроек звука
        if (localStorage.getItem('soundEnabled') !== null) {
            soundSettings.enabled = localStorage.getItem('soundEnabled') === 'true';
        }
        
        if (localStorage.getItem('soundVolume') !== null) {
            soundSettings.volume = parseFloat(localStorage.getItem('soundVolume'));
        }
    }
    
    // Сохранение настроек в localStorage
    function saveSettings() {
        localStorage.setItem('rooms', JSON.stringify(Array.from(rooms.entries())));
        localStorage.setItem('autoDeleteEnabled', autoDeleteEnabled);
        localStorage.setItem('messageLifetime', messageLifetime);
        localStorage.setItem('soundEnabled', soundSettings.enabled);
        localStorage.setItem('soundVolume', soundSettings.volume);
    }
    
    // Применение темы
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
    
    // Обработчик изменения темы
    document.querySelector('#theme-select').addEventListener('change', (e) => {
        const theme = e.target.value;
        localStorage.setItem('theme', theme);
        applyTheme(theme);
    });
    
    // Создание новой приватной комнаты
    function createPrivateRoom() {
        const roomName = prompt('Введите название комнаты:');
        if (!roomName) return;
        
        const roomId = Date.now().toString();
        const roomSettings = {
            name: roomName,
            autoDeleteEnabled: true,
            messageLifetime: 30000,
            createdBy: username,
            members: [username]
        };
        
        rooms.set(roomId, roomSettings);
        saveSettings();
        updateRoomsList();
        
        socket.emit('create_room', { roomId, roomName, creator: username });
    }
    
    // Обновление списка комнат в интерфейсе
    function updateRoomsList() {
        roomsList.innerHTML = '';
        rooms.forEach((settings, roomId) => {
            const li = document.createElement('li');
            li.className = 'room-item';
            if (currentRoom === roomId) li.classList.add('active');
            
            li.innerHTML = `
                <span class="room-name">${settings.name}</span>
                <div class="room-controls">
                    <button class="join-room-btn" data-room-id="${roomId}">${currentRoom === roomId ? 'Выйти' : 'Войти'}</button>
                    ${settings.createdBy === username ? `<button class="delete-room-btn" data-room-id="${roomId}">Удалить</button>` : ''}
                </div>
            `;
            
            roomsList.appendChild(li);
        });
    }
    
    // Обработчик создания комнаты
    createRoomButton.addEventListener('click', createPrivateRoom);
    
    // Обработчик событий комнат
    roomsList.addEventListener('click', (e) => {
        const roomId = e.target.dataset.roomId;
        if (!roomId) return;
        
        if (e.target.classList.contains('join-room-btn')) {
            if (currentRoom === roomId) {
                // Выход из комнаты
                socket.emit('leave_room', { roomId });
                currentRoom = null;
                messagesContainer.innerHTML = '';
                updateRoomsList();
            } else {
                // Вход в комнату
                socket.emit('join_room', { roomId });
                currentRoom = roomId;
                updateRoomsList();
            }
        } else if (e.target.classList.contains('delete-room-btn')) {
            if (confirm('Вы уверены, что хотите удалить эту комнату?')) {
                socket.emit('delete_room', { roomId });
                rooms.delete(roomId);
                saveSettings();
                updateRoomsList();
            }
        }
    });
    
    // Обновление настроек комнаты
    function updateRoomSettings(roomId, settings) {
        if (rooms.has(roomId)) {
            rooms.set(roomId, { ...rooms.get(roomId), ...settings });
            saveSettings();
            updateRoomsList();
        }
    }
    
    // Загрузка настроек звуков
    function loadSoundSettings() {
        if (localStorage.getItem('soundEnabled') !== null) {
            soundSettings.enabled = localStorage.getItem('soundEnabled') === 'true';
        }
        
        if (localStorage.getItem('soundVolume') !== null) {
            soundSettings.volume = parseFloat(localStorage.getItem('soundVolume'));
        }
    }
    
    // Воспроизведение звука отправки сообщения
    function playSendSound() {
        if (!soundSettings.enabled) return;
        
        try {
            const audio = new Audio(`sounds/${soundSettings.sendSound}`);
            audio.volume = soundSettings.volume;
            audio.play().catch(error => console.error('Ошибка воспроизведения звука:', error));
        } catch (error) {
            console.error('Ошибка при воспроизведении звука отправки:', error);
        }
    }
    
    // Воспроизведение звука получения сообщения
    function playReceiveSound() {
        if (!soundSettings.enabled) return;
        
        try {
            const audio = new Audio(`sounds/${soundSettings.receiveSound}`);
            audio.volume = soundSettings.volume;
            audio.play().catch(error => console.error('Ошибка воспроизведения звука:', error));
        } catch (error) {
            console.error('Ошибка при воспроизведении звука получения:', error);
        }
    }
    
    // Добавляем кнопку настроек звука в верхнюю панель
    function addSoundSettingsButton() {
        const serverInfo = document.querySelector('.server-info');
        if (!serverInfo) return;
        
        const soundToggleButton = document.createElement('button');
        soundToggleButton.className = 'sound-settings-button';
        soundToggleButton.innerHTML = soundSettings.enabled ? '🔊' : '🔇';
        soundToggleButton.title = soundSettings.enabled ? 'Выключить звук' : 'Включить звук';
        soundToggleButton.style.backgroundColor = 'transparent';
        soundToggleButton.style.border = 'none';
        soundToggleButton.style.color = 'white';
        soundToggleButton.style.fontSize = '1.2rem';
        soundToggleButton.style.cursor = 'pointer';
        soundToggleButton.style.marginLeft = '10px';
        
        soundToggleButton.addEventListener('click', () => {
            soundSettings.enabled = !soundSettings.enabled;
            soundToggleButton.innerHTML = soundSettings.enabled ? '🔊' : '🔇';
            soundToggleButton.title = soundSettings.enabled ? 'Выключить звук' : 'Включить звук';
            saveSettings();
        });
        
        serverInfo.appendChild(soundToggleButton);
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
            const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
            
            // Играем звук только для чужих сообщений
            if (message.user !== username) {
                playReceiveSound();
            }
            
            addMessageToUI(message);
            
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
            addSystemMessageToUI(`Вы присоединились к комнате: ${roomName}`);
            messagesContainer.innerHTML = '';
        });
        
        socket.on('room_left', ({ roomId, roomName }) => {
            addSystemMessageToUI(`Вы покинули комнату: ${roomName}`);
            messagesContainer.innerHTML = '';
        });
        
        socket.on('room_deleted', ({ roomId, roomName }) => {
            addSystemMessageToUI(`Комната удалена: ${roomName}`);
            if (currentRoom === roomId) {
                currentRoom = null;
                messagesContainer.innerHTML = '';
            }
            rooms.delete(roomId);
            saveSettings();
            updateRoomsList();
        });
        
        socket.on('room_message', (message) => {
            if (message.roomId === currentRoom) {
                addMessageToUI(message);
            }
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
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${escapeHtml(message.username || message.user)}</span>
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
        if ((message.username || message.user) !== username) {
            playReceiveSound();
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
        
        // Добавляем кнопку настроек звука после успешного входа
        setTimeout(addSoundSettingsButton, 1000);
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
        
        // Если нет ни текста, ни изображения
        if (!text && !currentImage) return;
        
        const message = {
            text,
            username,
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

    // Обработка выбора изображения
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Проверка типа файла
        if (!file.type.match('image.*')) {
            alert('Пожалуйста, выберите изображение');
            return;
        }
        
        processImageFile(file);
    });
    
    // Функция обработки файла изображения
    function processImageFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Оптимизируем изображение
                currentImage = optimizeImage(img, file.type);
                
                // Показываем предпросмотр
                imagePreview.src = currentImage;
                imagePreviewContainer.style.display = 'block';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    // Добавляем поддержку drag-n-drop
    const dropZone = messagesContainer.parentElement; // Используем чат-контейнер как зону для перетаскивания
    const messageInputContainer = document.querySelector('.message-input-container');
    
    // Индикатор для отображения активной зоны перетаскивания
    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    dropIndicator.innerHTML = `
        <div class="drop-indicator-content">
            <div class="drop-icon">📁</div>
            <div class="drop-text">Перетащите изображение сюда</div>
        </div>
    `;
    dropIndicator.style.display = 'none';
    document.querySelector('.chat-main').appendChild(dropIndicator);
    
    // Счетчик для отслеживания входов/выходов при перетаскивании
    let dragCounter = 0;
    
    // Показать индикатор перетаскивания
    function showDropIndicator() {
        dropIndicator.style.display = 'flex';
    }
    
    // Скрыть индикатор перетаскивания
    function hideDropIndicator() {
        dropIndicator.style.display = 'none';
    }
    
    // Функция для обработки события перетаскивания файла
    function handleFileDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter = 0;
        hideDropIndicator();
        
        const files = e.dataTransfer.files;
        if (files.length) {
            const file = files[0]; // Берем только первый файл
            
            // Проверка типа файла
            if (!file.type.match('image.*')) {
                alert('Пожалуйста, перетащите изображение');
                return;
            }
            
            processImageFile(file);
        }
    }
    
    // Обработчики событий drag-n-drop для области сообщений
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        showDropIndicator();
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter === 0) {
            hideDropIndicator();
        }
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    
    dropZone.addEventListener('drop', handleFileDrop);
    
    // Дополнительно добавляем поддержку перетаскивания в область ввода сообщений
    messageInputContainer.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        showDropIndicator();
    });
    
    messageInputContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter === 0) {
            hideDropIndicator();
        }
    });
    
    messageInputContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    
    messageInputContainer.addEventListener('drop', handleFileDrop);
    
    // Также поддерживаем вставку изображений из буфера обмена
    messageInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        
        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                e.preventDefault();
                const file = item.getAsFile();
                processImageFile(file);
                break;
            }
        }
    });
    
    // Кнопка удаления изображения
    removeImageButton.addEventListener('click', () => {
        currentImage = null;
        imagePreview.src = '';
        imagePreviewContainer.style.display = 'none';
        imageUpload.value = '';
    });

    // Оптимизация изображения
    function optimizeImage(img, fileType) {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Уменьшаем размер, если изображение слишком большое
        if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
            const ratio = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
            width *= ratio;
            height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Определяем формат вывода
        const outputFormat = fileType === 'image/png' ? 'image/png' : 'image/jpeg';
        
        // Получаем base64 с заданным качеством
        let dataUrl = canvas.toDataURL(outputFormat, IMAGE_QUALITY);
        
        // Если размер все еще превышает ограничение, уменьшаем качество
        // до тех пор, пока не достигнем нужного размера
        let quality = IMAGE_QUALITY;
        const BASE64_MARKER = ';base64,';
        const base64Index = dataUrl.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
        const base64 = dataUrl.substring(base64Index);
        
        let byteSize = Math.ceil(base64.length * 0.75);
        
        while (byteSize > MAX_IMAGE_SIZE && quality > 0.1) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL(outputFormat, quality);
            const newBase64 = dataUrl.substring(dataUrl.indexOf(BASE64_MARKER) + BASE64_MARKER.length);
            byteSize = Math.ceil(newBase64.length * 0.75);
        }
        
        console.log(`Оптимизировано изображение: ${width}x${height}, ${Math.round(byteSize / 1024)}KB, качество: ${quality.toFixed(1)}`);
        
        return dataUrl;
    }
    
    // Открытие изображения в модальном окне
    messagesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('message-image')) {
            modalImage.src = e.target.src;
            imageModal.style.display = 'flex';
        }
    });
    
    // Закрытие модального окна
    imageModal.addEventListener('click', () => {
        imageModal.style.display = 'none';
    });

    // Загружаем настройки при загрузке страницы
    loadSettings();
    loadSoundSettings();
}); 