document.addEventListener('DOMContentLoaded', () => {
  // Инициализация Socket.IO
  const socket = io();
  
  // DOM элементы
  // Авторизация
  const authContainer = document.getElementById('auth-container');
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const tabButtons = document.querySelectorAll('.tab-btn');
  
  // Форма входа
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginBtn = document.getElementById('login-btn');
  const loginMessage = document.getElementById('login-message');
  
  // Форма регистрации
  const registerUsername = document.getElementById('register-username');
  const registerDisplayName = document.getElementById('register-display-name');
  const registerPassword = document.getElementById('register-password');
  const registerPasswordConfirm = document.getElementById('register-password-confirm');
  const registerBtn = document.getElementById('register-btn');
  const registerMessage = document.getElementById('register-message');
  
  // Чат
  const chatContainer = document.getElementById('chat-container');
  const userDisplayName = document.getElementById('user-display-name');
  const usersList = document.getElementById('users-list');
  const messagesContainer = document.getElementById('messages-container');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const logoutButton = document.getElementById('logout-button');
  const settingsButton = document.getElementById('settings-button');
  const roomsList = document.getElementById('rooms-list');
  const createRoomBtn = document.getElementById('create-room-btn');
  const notificationsToggle = document.getElementById('notifications-toggle');
  
  // Модальное окно создания комнаты
  const createRoomModal = document.getElementById('create-room-modal');
  const roomNameInput = document.getElementById('room-name');
  const createRoomConfirmBtn = document.getElementById('create-room-confirm-btn');
  const closeModalBtns = document.querySelectorAll('.close-btn, .cancel-btn');
  
  // Загрузка изображений
  const attachButton = document.getElementById('attach-button');
  const imageUpload = document.getElementById('image-upload');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const cancelImageBtn = document.getElementById('cancel-image-btn');
  
  // Модальное окно просмотра изображений
  const imageModal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  const modalCloseBtn = document.querySelector('#image-modal .close-btn');
  
  // Аудио элементы
  const notificationSound = document.getElementById('notification-sound');
  const messageSendSound = document.getElementById('message-send-sound');
  
  // Модальное окно удаления комнаты
  const deleteRoomModal = document.getElementById('delete-room-modal');
  const deleteRoomName = document.getElementById('delete-room-name');
  const deleteRoomConfirmBtn = document.getElementById('delete-room-confirm-btn');
  let roomToDelete = null;
  
  // Элементы для работы с паролем комнаты
  const roomPasswordInput = document.getElementById('room-password');
  const roomPasswordModal = document.getElementById('room-password-modal');
  const protectedRoomName = document.getElementById('protected-room-name');
  const enterRoomPasswordInput = document.getElementById('enter-room-password');
  const enterRoomBtn = document.getElementById('enter-room-btn');
  const roomPasswordMessage = document.getElementById('room-password-message');
  
  // Временные переменные для работы с защищенной комнатой
  let pendingRoomId = null;
  let pendingRoomName = null;
  
  // Данные пользователя и чата
  let currentUser = null;
  let currentRoom = 'general';
  let currentImageData = null;
  let rooms = [];
  
  // Флаг активности окна
  let isWindowActive = true;
  window.addEventListener('focus', () => { isWindowActive = true; });
  window.addEventListener('blur', () => { isWindowActive = false; });
  
  // Шаблоны элементов
  const messageTemplate = document.getElementById('message-template');
  const reactionTemplate = document.getElementById('reaction-template');
  const emojiPicker = document.getElementById('emoji-picker');
  
  // Для хранения ссылки на сообщение, к которому добавляется реакция
  let activeMessageForReaction = null;
  
  // Объект для хранения анимаций
  const animations = {
    entrances: ['fadeIn', 'slideIn', 'slideInLeft', 'popIn'],
    highlights: ['pulseHighlight']
  };
  
  // ======== Обработчики UI ========
  
  // Переключение между вкладками входа и регистрации
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Удаляем активный класс со всех кнопок и контентов
      tabButtons.forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      // Добавляем активный класс текущей кнопке
      button.classList.add('active');
      
      // Показываем соответствующий контент
      const tabId = button.getAttribute('data-tab');
      document.getElementById(`${tabId}-tab`).classList.add('active');
      
      // Очищаем сообщения об ошибках
      clearMessages();
    });
  });
  
  // Открытие модального окна создания комнаты
  createRoomBtn.addEventListener('click', () => {
    createRoomModal.classList.add('active');
    roomNameInput.value = '';
    roomNameInput.focus();
    
    // Исправляем видимость поля ввода
    if (window.innerWidth <= 768) {
      const messageInputContainer = document.querySelector('.message-input-container');
      if (messageInputContainer) {
        messageInputContainer.style.display = 'flex';
        messageInputContainer.style.bottom = '0';
      }
    }
  });
  
  // Закрытие модального окна
  closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      createRoomModal.classList.remove('active');
    });
  });
  
  // Создание комнаты
  createRoomConfirmBtn.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    const roomPassword = roomPasswordInput.value.trim();
    
    if (roomName) {
      socket.emit('create_room', { 
        name: roomName,
        password: roomPassword // Передаем пароль на сервер (может быть пустым)
      });
      createRoomModal.classList.remove('active');
      
      // Очищаем поля
      roomNameInput.value = '';
      roomPasswordInput.value = '';
    } else {
      alert('Введите название комнаты');
    }
  });
  
  // Обработчик нажатия Enter в поле названия комнаты
  roomNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      createRoomConfirmBtn.click();
    }
  });
  
  // Загрузка изображения
  attachButton.addEventListener('click', () => {
    imageUpload.click();
  });
  
  // Обработка выбора изображения
  imageUpload.addEventListener('change', () => {
    const file = imageUpload.files[0];
    if (file) {
      // Проверка типа файла
      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
      }
      
      // Проверка размера файла (макс. 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Размер изображения не должен превышать 5MB');
        return;
      }
      
      // Чтение и отображение изображения
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreviewContainer.style.display = 'block';
        currentImageData = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Отмена выбора изображения
  cancelImageBtn.addEventListener('click', () => {
    clearImageSelection();
  });
  
  // Очистка выбранного изображения
  function clearImageSelection() {
    imageUpload.value = '';
    imagePreviewContainer.style.display = 'none';
    currentImageData = null;
  }
  
  // ======== Функции для работы с сообщениями ========
  
  // Отображение сообщения
  function showMessage(element, message, type = 'info') {
    element.textContent = message;
    element.className = 'message-box';
    element.classList.add(type);
    element.style.display = 'block';
    
    // Автоматически скрываем через 5 секунд
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
  
  // Очистка всех сообщений
  function clearMessages() {
    loginMessage.style.display = 'none';
    registerMessage.style.display = 'none';
  }
  
  // Обновленная функция для воспроизведения звукового уведомления
  function playNotificationSound() {
    if (!isWindowActive) {
      notificationSound.volume = 0.5;
      notificationSound.currentTime = 0;
      const playPromise = notificationSound.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.log('Ошибка воспроизведения уведомления:', err);
        });
      }
    }
  }
  
  // Функция для воспроизведения звука отправки сообщения
  function playMessageSendSound() {
    messageSendSound.volume = 0.3;
    messageSendSound.currentTime = 0;
    const playPromise = messageSendSound.play();
    
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.log('Ошибка воспроизведения звука отправки:', err);
      });
    }
  }
  
  // ======== Обработчики авторизации ========
  
  // Регистрация
  registerBtn.addEventListener('click', () => {
    const username = registerUsername.value.trim();
    const displayName = registerDisplayName.value.trim() || username;
    const password = registerPassword.value;
    const passwordConfirm = registerPasswordConfirm.value;
    
    // Проверка полей
    if (!username) {
      showMessage(registerMessage, 'Введите имя пользователя', 'error');
      return;
    }
    
    if (!password) {
      showMessage(registerMessage, 'Введите пароль', 'error');
      return;
    }
    
    if (password !== passwordConfirm) {
      showMessage(registerMessage, 'Пароли не совпадают', 'error');
      return;
    }
    
    // Отправляем запрос на регистрацию
    socket.emit('register', {
      username,
      displayName,
      password
    });
  });
  
  // Вход
  loginBtn.addEventListener('click', () => {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    
    // Проверка полей
    if (!username) {
      showMessage(loginMessage, 'Введите имя пользователя', 'error');
      return;
    }
    
    if (!password) {
      showMessage(loginMessage, 'Введите пароль', 'error');
      return;
    }
    
    // Отправляем запрос на вход
    socket.emit('login', {
      username,
      password
    });
  });
  
  // Выход
  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('chatUsername');
    localStorage.removeItem('chatToken');
    currentUser = null;
    showAuthScreen();
  });
  
  // ======== Обработчики сообщений чата ========
  
  // Отправка сообщения
  sendButton.addEventListener('click', sendMessage);
  
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  function sendMessage() {
    const text = messageInput.value.trim();
    
    // Не отправляем пустые сообщения
    if (!text && !currentImageData) return;
    
    const message = {
      room: currentRoom,
      text: text,
      image: currentImageData
    };
    
    // Отправляем сообщение на сервер
    socket.emit('chat_message', message);
    
    // Воспроизводим звук отправки
    playMessageSendSound();
    
    // Очищаем поле ввода
    messageInput.value = '';
    clearImageSelection();
  }
  
  // Обработка клика по комнате
  function handleRoomClick(roomId, roomName) {
    if (currentRoom !== roomId) {
      currentRoom = roomId;
      
      // Обновляем название комнаты в заголовке
      const roomNameEl = document.getElementById('current-room-name');
      if (roomNameEl) {
        roomNameEl.textContent = roomName;
      }
      
      // Очищаем контейнер сообщений
      messagesContainer.innerHTML = '';
      
      // Присоединяемся к комнате
      socket.emit('join_room', roomId);
      
      // Обновляем активную комнату в списке
      updateActiveRoom();
      
      // Исправляем видимость поля ввода на мобильных устройствах
      if (window.innerWidth <= 768) {
        const messageInputContainer = document.querySelector('.message-input-container');
        if (messageInputContainer) {
          setTimeout(() => {
            messageInputContainer.style.display = 'flex';
            messageInputContainer.style.bottom = '0';
          }, 100);
        }
      }
    }
  }
  
  // Обновление активной комнаты в списке
  function updateActiveRoom() {
    document.querySelectorAll('.room-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.roomId === currentRoom) {
        item.classList.add('active');
      }
    });
  }
  
  // Обновление списка комнат
  function updateRoomsList(roomsData) {
    roomsList.innerHTML = '';
    rooms = roomsData;
    
    roomsData.forEach(room => {
      const roomItem = document.createElement('div');
      roomItem.className = 'room-item';
      roomItem.dataset.roomId = room.id;
      roomItem.textContent = room.name;
      
      // Если комната защищена паролем, добавляем иконку замка
      if (room.hasPassword) {
        const lockIcon = document.createElement('i');
        lockIcon.className = 'fa fa-lock room-lock-icon';
        lockIcon.title = 'Защищено паролем';
        roomItem.appendChild(lockIcon);
      }
      
      // Добавляем кнопку удаления комнаты (кроме основной)
      if (room.id !== 'general') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-room';
        deleteBtn.innerHTML = '<i class="fa fa-times"></i>';
        deleteBtn.title = 'Удалить комнату';
        
        // Обработчик удаления комнаты
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Предотвращаем всплытие события
          showDeleteRoomModal(room);
        });
        
        roomItem.appendChild(deleteBtn);
      }
      
      if (room.id === currentRoom) {
        roomItem.classList.add('active');
      }
      
      roomItem.addEventListener('click', () => {
        // Если комната требует пароля и это не текущая комната
        if (room.hasPassword && room.id !== currentRoom) {
          showRoomPasswordModal(room);
        } else {
          handleRoomClick(room.id, room.name);
        }
      });
      
      roomsList.appendChild(roomItem);
    });
  }
  
  // ======== Функционал реакций ========
  
  // Обработчик клика на кнопку добавления реакции
  document.addEventListener('click', (e) => {
    // Проверка клика на кнопку добавления реакции
    if (e.target.closest('.add-reaction-btn')) {
      console.log('Клик на кнопку добавления реакции');
      const btn = e.target.closest('.add-reaction-btn');
      const messageEl = btn.closest('.message');
      
      console.log('Сообщение для реакции:', {
        element: messageEl,
        id: messageEl.dataset.messageId
      });
      
      // Сохраняем ссылку на активное сообщение
      activeMessageForReaction = messageEl;
      
      // Получаем размеры и позицию кнопки
      const rect = btn.getBoundingClientRect();
      
      // Выравниваем панель по правому краю кнопки
      const emojiPickerWidth = 220; // Ширина панели эмодзи из CSS
      
      // Вычисляем позицию для панели эмодзи (сначала позиционируем по правому краю кнопки)
      let leftPosition = rect.right - emojiPickerWidth;
      
      // Проверяем, не выходит ли панель за левый край экрана
      if (leftPosition < 10) {
        leftPosition = 10; // Минимальный отступ от левого края
      }
      
      // Проверяем, не выходит ли панель за правый край экрана
      if (leftPosition + emojiPickerWidth > window.innerWidth - 10) {
        leftPosition = window.innerWidth - emojiPickerWidth - 10;
      }
      
      // Позиционируем панель
      emojiPicker.style.left = `${leftPosition}px`;
      emojiPicker.style.top = `${rect.bottom + 5}px`;
      
      // Показываем панель
      emojiPicker.classList.add('active');
      console.log('Панель эмодзи показана');
      
      e.stopPropagation();
    }
    
    // Проверка клика на эмодзи в панели
    if (e.target.closest('.emoji-item')) {
      console.log('Клик на эмодзи в панели');
      const emojiItem = e.target.closest('.emoji-item');
      const emoji = emojiItem.dataset.emoji;
      
      console.log('Выбран эмодзи:', emoji);
      
      if (activeMessageForReaction) {
        const messageId = activeMessageForReaction.dataset.messageId;
        console.log('Отправка реакции на сервер:', {
          messageId,
          emoji,
          roomId: currentRoom
        });
        
        // Отправляем реакцию на сервер
        socket.emit('add_reaction', {
          messageId,
          emoji,
          roomId: currentRoom
        });
        
        // Скрываем панель эмодзи
        emojiPicker.classList.remove('active');
      } else {
        console.error('Активное сообщение для реакции не найдено');
      }
    }
    
    // Проверка клика на реакцию (для отмены)
    if (e.target.closest('.reaction')) {
      console.log('Клик на существующую реакцию');
      const reactionEl = e.target.closest('.reaction');
      const messageEl = reactionEl.closest('.message');
      const messageId = messageEl.dataset.messageId;
      const emoji = reactionEl.dataset.emoji;
      
      console.log('Данные реакции:', {
        messageId,
        emoji,
        isActive: reactionEl.classList.contains('active')
      });
      
      // Проверяем, уже поставил ли пользователь эту реакцию
      if (reactionEl.classList.contains('active')) {
        console.log('Отправка запроса на удаление реакции');
        // Отправляем запрос на удаление реакции
        socket.emit('remove_reaction', {
          messageId,
          emoji,
          roomId: currentRoom
        });
      } else {
        console.log('Отправка запроса на добавление реакции');
        // Отправляем запрос на добавление реакции
        socket.emit('add_reaction', {
          messageId,
          emoji,
          roomId: currentRoom
        });
      }
    }
    
    // Закрытие панели эмодзи при клике вне её
    if (!e.target.closest('.emoji-picker') && !e.target.closest('.add-reaction-btn')) {
      emojiPicker.classList.remove('active');
    }
  });
  
  // Обновление отображения реакций для сообщения
  function updateMessageReactions(messageId, reactions) {
    console.log('Обновление реакций для сообщения:', messageId, reactions);
    
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageEl) {
      console.error(`Сообщение с ID ${messageId} не найдено в DOM`);
      return;
    }
    
    const reactionsContainer = messageEl.querySelector('.message-reactions');
    if (!reactionsContainer) {
      console.error(`Контейнер для реакций не найден в сообщении ${messageId}`);
      return;
    }
    
    console.log('Очищаем контейнер реакций');
    reactionsContainer.innerHTML = '';
    
    // Если нет реакций, просто выходим
    if (!reactions || Object.keys(reactions).length === 0) {
      console.log('Реакций нет, выходим');
      return;
    }
    
    console.log('Добавляем реакции:', Object.keys(reactions));
    
    // Проверяем доступность шаблона реакций
    if (!reactionTemplate) {
      console.error('Шаблон реакций не найден в DOM');
      return;
    }
    
    // Добавляем каждую реакцию
    Object.entries(reactions).forEach(([emoji, users]) => {
      console.log(`Добавление реакции ${emoji} (${users.length} пользователей)`);
      
      try {
        // Клонируем шаблон реакции
        const reactionNode = reactionTemplate.content.cloneNode(true);
        const reactionEl = reactionNode.querySelector('.reaction');
        
        if (!reactionEl) {
          console.error('Элемент реакции не найден в шаблоне');
          return;
        }
        
        // Заполняем данные реакции
        reactionEl.dataset.emoji = emoji;
        const emojiSpan = reactionEl.querySelector('.reaction-emoji');
        const countSpan = reactionEl.querySelector('.reaction-count');
        
        if (!emojiSpan || !countSpan) {
          console.error('Элементы эмодзи или счетчика не найдены в шаблоне реакции');
          return;
        }
        
        emojiSpan.textContent = emoji;
        countSpan.textContent = users.length;
        
        // Проверяем, поставил ли текущий пользователь эту реакцию
        if (users.includes(currentUser.username)) {
          reactionEl.classList.add('active');
          console.log(`Пользователь ${currentUser.username} поставил реакцию ${emoji}`);
        }
        
        reactionsContainer.appendChild(reactionEl);
        console.log(`Реакция ${emoji} добавлена в DOM`);
      } catch (error) {
        console.error(`Ошибка при добавлении реакции ${emoji}:`, error);
      }
    });
  }
  
  // ======== Обновление функции создания сообщения ========
  
  // Обновленная функция создания элемента сообщения с дополнительными проверками
  function createMessageElement(message) {
    console.log('Создание элемента сообщения:', message);
    
    try {
      // Если это системное сообщение, используем простую структуру
      if (message.system || message.isSystem) {
        console.log('Создаем системное сообщение');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'system-message');
        messageDiv.textContent = message.text;
        
        // Устанавливаем флаг для распознавания системных сообщений
        messageDiv.dataset.system = 'true';
        
        // Проверяем, содержит ли сообщение упоминание администратора
        if (message.text && (
            message.text.includes('администратор') || 
            message.text.includes('Админ') || 
            message.text.includes('удалено администратор')
          )) {
          console.log('Обнаружено системное сообщение, связанное с администратором');
          messageDiv.dataset.adminSystem = 'true';
        }
        
        return messageDiv;
      }
      
      // Проверяем, доступен ли шаблон сообщения
      if (!messageTemplate) {
        console.error('Шаблон сообщения не найден');
        // Создаем простую структуру, если шаблон недоступен
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.innerHTML = `
          <div class="message-bubble">
            <div class="message-meta">
              <span class="username">${message.displayName || message.sender || message.username || 'Пользователь'}</span>
              <span class="time">${new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="message-text">${message.text || ''}</div>
          </div>
        `;
        return messageDiv;
      }
      
      // Клонируем шаблон сообщения
      console.log('Клонируем шаблон сообщения');
      const messageNode = messageTemplate.content.cloneNode(true);
      const messageDiv = messageNode.querySelector('.message');
      
      if (!messageDiv) {
        console.error('Не удалось найти элемент сообщения в шаблоне');
        return null;
      }
      
      messageDiv.dataset.messageId = message.id || generateId();
      
      // Определение, собственное ли это сообщение
      if (message.sender === currentUser?.username || message.username === currentUser?.username) {
        messageDiv.classList.add('own');
      }
      
      // Применяем случайную анимацию входа для сообщения
      applyRandomAnimation(messageDiv, 'entrance');
      
      const messageBubble = messageDiv.querySelector('.message-bubble');
      const usernameSpan = messageDiv.querySelector('.username');
      const timeSpan = messageDiv.querySelector('.time');
      const messageText = messageDiv.querySelector('.message-text');
      const messageImage = messageDiv.querySelector('.message-image');
      
      if (!messageBubble || !usernameSpan || !timeSpan || !messageText) {
        console.error('Структура шаблона сообщения нарушена');
        return null;
      }
      
      // Заполняем данные сообщения
      usernameSpan.textContent = message.displayName || message.sender || message.username || 'Пользователь';
      timeSpan.textContent = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
      messageText.textContent = message.text || '';
      
      // Проверка на администратора
      const isAdminMessage = message.isAdmin || 
                           (message.displayName && message.displayName.includes('(Админ)'));
      
      if (isAdminMessage) {
        usernameSpan.classList.add('admin');
      }
      
      // Добавляем кнопку удаления, если это собственное сообщение или пользователь - админ
      const isOwnMessage = message.username === currentUser?.username || message.sender === currentUser?.username;
      
      if (isOwnMessage || currentUser?.isAdmin) {
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-message';
        deleteButton.innerHTML = '<i class="fa fa-trash"></i>';
        deleteButton.title = 'Удалить сообщение';
        
        deleteButton.addEventListener('click', () => {
          if (confirm('Вы уверены, что хотите удалить это сообщение?')) {
            socket.emit('delete_message', {
              messageId: message.id,
              roomId: currentRoom
            });
          }
        });
        
        messageDiv.querySelector('.message-meta').appendChild(deleteButton);
      }
      
      // Если есть изображение и контейнер для изображения
      if (message.image && messageImage) {
        const img = messageImage.querySelector('img');
        if (img) {
          img.src = message.image;
          img.alt = 'Вложенное изображение';
          img.addEventListener('click', () => openImageModal(message.image));
        }
      } else if (messageImage) {
        // Если изображения нет, скрываем контейнер
        messageImage.style.display = 'none';
      }
      
      // Если есть реакции, добавляем их
      if (message.reactions) {
        updateMessageReactions(message.id, message.reactions);
      }
      
      return messageDiv;
    } catch (error) {
      console.error('Ошибка при создании элемента сообщения:', error);
      // Создаем простой запасной вариант в случае ошибки
      const fallbackDiv = document.createElement('div');
      fallbackDiv.classList.add('message');
      fallbackDiv.textContent = message.text || 'Сообщение';
      return fallbackDiv;
    }
  }
  
  // Вспомогательная функция для генерации ID, если сообщение не имеет ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
  
  // Функция для применения случайной анимации
  function applyRandomAnimation(element, type) {
    let animationList;
    
    switch(type) {
      case 'entrance':
        animationList = animations.entrances;
        break;
      case 'highlight':
        animationList = animations.highlights;
        break;
      default:
        return;
    }
    
    // Выбираем случайную анимацию из списка
    const randomAnimation = animationList[Math.floor(Math.random() * animationList.length)];
    
    // Удаляем все предыдущие классы анимаций
    element.classList.remove(...animations.entrances, ...animations.highlights);
    
    // Добавляем новую анимацию
    element.classList.add(randomAnimation);
    
    // Прослушиваем окончание анимации
    element.addEventListener('animationend', () => {
      // Удаляем класс анимации, если это highlight (временная анимация)
      if (type === 'highlight') {
        element.classList.remove(randomAnimation);
      }
    }, { once: true });
  }
  
  // ======== Socket.IO обработчики для реакций ========
  
  // Получение обновлений реакций
  socket.on('reactions_updated', (data) => {
    console.log('Получено событие reactions_updated:', data);
    if (!data) {
      console.error('Получены пустые данные о реакциях');
      return;
    }
    
    if (!data.messageId) {
      console.error('ID сообщения отсутствует в данных о реакциях');
      return;
    }
    
    updateMessageReactions(data.messageId, data.reactions);
  });
  
  // Обновленный обработчик получения сообщения
  socket.on('chat_message', (message) => {
    console.log('Получено сообщение:', message);
    const messageEl = displayMessage(message);
    
    // Подсвечиваем новое сообщение, если оно не от текущего пользователя
    if (message.username !== currentUser?.username && message.sender !== currentUser?.username) {
      setTimeout(() => {
        applyRandomAnimation(messageEl, 'highlight');
      }, 300);
    }
  });
  
  // Обновленный обработчик удаления сообщения
  socket.on('message_deleted', (data) => {
    const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
    
    if (messageElement) {
      // Добавляем класс анимации удаления
      messageElement.classList.add('deleting');
      
      // Ждем окончания анимации
      messageElement.addEventListener('animationend', () => {
        // Отображаем системное сообщение об удалении
        const deletedByText = data.deletedBy === 'admin' ? 'администратором' : 'автором';
        const systemMessage = document.createElement('div');
        systemMessage.className = 'system-message deletion-message';
        systemMessage.textContent = `Сообщение было удалено ${deletedByText}`;
        
        // Добавляем атрибут system чтобы сообщение автоматически удалилось через displayMessage
        systemMessage.isSystem = true;
        
        // Заменяем удаленное сообщение системным уведомлением
        messageElement.parentNode.replaceChild(systemMessage, messageElement);
        
        // Удаляем уведомление через некоторое время с анимацией
        setTimeout(() => {
          systemMessage.classList.add('deleting');
          systemMessage.addEventListener('animationend', () => {
            if (systemMessage.parentNode) {
              systemMessage.parentNode.removeChild(systemMessage);
            }
          }, { once: true });
        }, 5000);
      }, { once: true });
    }
  });
  
  // Модифицированная функция отображения сообщения для автоматического скрытия системных сообщений
  function displayMessage(message) {
    console.log('Отображение сообщения:', message);
    
    // Проверяем наличие необходимых данных
    if (!message) {
      console.error('Не удалось отобразить сообщение: отсутствуют данные');
      return null;
    }
    
    // Проверяем принадлежность сообщения текущей комнате
    if (message.roomId && message.roomId !== currentRoom) {
      console.log(`Сообщение для другой комнаты: ${message.roomId}, текущая комната: ${currentRoom}`);
      return null;
    }
    
    // Если это сообщение из другой комнаты, проигрываем уведомление
    if (!isWindowActive) {
      console.log('Проигрываем звук уведомления, окно неактивно');
      playNotificationSound();
    }
    
    // Создаем элемент сообщения
    const messageElement = createMessageElement(message);
    
    if (!messageElement) {
      console.error('Не удалось создать элемент сообщения');
      return null;
    }
    
    console.log('Добавляем сообщение в контейнер');
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
    
    // Автоматическое скрытие системных сообщений через 10 секунд
    if (message.system || message.isSystem || 
        (messageElement.dataset && (messageElement.dataset.system === 'true' || messageElement.dataset.adminSystem === 'true')) ||
        (messageElement.className && messageElement.className.includes('system-message'))) {
      
      console.log('Настраиваем автоматическое скрытие системного сообщения');
      
      setTimeout(() => {
        if (messageElement.parentNode) {
          // Добавляем класс анимации удаления
          messageElement.classList.add('deleting');
          
          // После завершения анимации удаляем элемент
          messageElement.addEventListener('animationend', () => {
            if (messageElement.parentNode) {
              messageElement.parentNode.removeChild(messageElement);
            }
          }, { once: true });
        }
      }, 10000); // 10 секунд
    }
    
    return messageElement;
  }
  
  // ======== Socket.IO обработчики ========
  
  // Обработчик успешной регистрации
  socket.on('register_response', (response) => {
    if (response.success) {
      showMessage(registerMessage, response.message, 'success');
      
      // Переключаемся на вкладку входа
      setTimeout(() => {
        tabButtons[0].click();
      }, 1500);
    } else {
      showMessage(registerMessage, response.message, 'error');
    }
  });
  
  // Обработчик успешного входа - модифицируем для сохранения данных
  socket.on('login_response', (response) => {
    if (response.success) {
      // Сохраняем данные пользователя
      currentUser = response.user;
      
      // Сохраняем токен и имя пользователя в localStorage
      if (response.token) {
        localStorage.setItem('chatUsername', currentUser.username);
        localStorage.setItem('chatToken', response.token);
        console.log('Данные пользователя сохранены');
      }
      
      // Обновляем интерфейс
      userDisplayName.textContent = currentUser.displayName || currentUser.username;
      
      // Скрываем форму авторизации и показываем чат
      authContainer.style.display = 'none';
      chatContainer.style.display = 'flex';
      
      // Присоединяемся к общей комнате
      socket.emit('join_room', 'general');
      
      // Применяем тему
      applyTheme();
      
      // Фокусируемся на поле ввода сообщения
      messageInput.focus();
      
      showMessage(loginMessage, response.message, 'success');
    } else {
      // Если вход не удался, удаляем сохраненные данные
      localStorage.removeItem('chatUsername');
      localStorage.removeItem('chatToken');
      
      showMessage(loginMessage, response.message, 'error');
    }
  });
  
  // Новый обработчик для аутентификации по токену
  socket.on('token_auth_response', (response) => {
    if (response.success) {
      // Сохраняем данные пользователя
      currentUser = response.user;
      
      // Обновляем интерфейс
      userDisplayName.textContent = currentUser.displayName || currentUser.username;
      
      // Скрываем форму авторизации и показываем чат
      authContainer.style.display = 'none';
      chatContainer.style.display = 'flex';
      
      // Присоединяемся к общей комнате
      socket.emit('join_room', 'general');
      
      // Применяем тему
      applyTheme();
      
      console.log('Успешная авторизация по токену');
    } else {
      // Если аутентификация не удалась, удаляем сохраненные данные
      localStorage.removeItem('chatUsername');
      localStorage.removeItem('chatToken');
      console.log('Ошибка авторизации по токену, данные удалены');
      
      // Показываем экран авторизации
      showAuthScreen();
    }
  });
  
  // Получение списка комнат
  socket.on('room_list', (roomsData) => {
    updateRoomsList(roomsData);
  });
  
  // Подтверждение создания комнаты
  socket.on('room_created', (response) => {
    if (response.success) {
      // Обновляем текущую комнату
      currentRoom = response.room.id;
      
      // Обновляем название комнаты
      const roomNameEl = document.getElementById('current-room-name');
      if (roomNameEl) {
        roomNameEl.textContent = response.room.name;
      }
      
      // Обновляем список комнат (он придет от сервера)
    }
  });
  
  // Получение истории сообщений комнаты
  socket.on('room_messages', (data) => {
    console.log('Получены сообщения комнаты:', data.roomId);
    
    // Очищаем текущие сообщения
    messagesContainer.innerHTML = '';
    
    // Отображаем сообщения
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(message => {
        displayMessage(message);
      });
    }
    
    // Прокручиваем к последнему сообщению
    scrollToBottom();
  });
  
  // Обновление списка пользователей
  socket.on('user_list', (users) => {
    updateUsersList(users);
  });
  
  // Обработчик ошибок
  socket.on('error', (error) => {
    console.error('Ошибка сервера:', error);
    showMessage(document.getElementById('login-message'), error.message, 'error');
  });
  
  // Запрос разрешения на уведомления (для браузерных уведомлений)
  if (Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }

  // Функция для открытия модального окна с изображением
  function openImageModal(imageSrc) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    
    modalImg.src = imageSrc;
    modal.classList.add('active');
    
    // Закрытие по клику вне изображения
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeImageModal();
        }
    });
  }

  // Функция для закрытия модального окна
  function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
  }

  // Добавляем закрытие по кнопке Esc
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeImageModal();
    }
  });

  // Обновляем интерфейс с новым дизайном
  function initializeUI() {
    // ... existing code ...
    
    // Обработчики закрытия модального окна
    document.querySelector('.close-btn').addEventListener('click', closeImageModal);
    
    // Применение темы
    applyTheme();
    
    // ... existing code ...
  }

  // Функция для применения космической темы
  function applyTheme() {
    document.documentElement.style.setProperty('--primary-color', '#ff8042');
    document.documentElement.style.setProperty('--secondary-color', '#86b8ce');
    document.documentElement.style.setProperty('--background-color', '#f7f2ed');
    document.documentElement.style.setProperty('--message-own', '#ffdbc9');
    document.documentElement.style.setProperty('--message-other', '#efefef');
  }

  // Функция для показа экрана авторизации
  function showAuthScreen() {
    // Скрываем чат и показываем форму авторизации
    chatContainer.style.display = 'none';
    authContainer.style.display = 'flex';
    
    // Очищаем поля ввода
    loginUsername.value = '';
    loginPassword.value = '';
    messageInput.value = '';
    
    // Очищаем список сообщений
    messagesContainer.innerHTML = '';
    
    // Отключаем сокет
    socket.disconnect();
    
    // Переподключаемся для следующего входа
    setTimeout(() => {
      socket.connect();
    }, 500);
  }

  // Настройки пользователя
  settingsButton.addEventListener('click', () => {
    alert('Настройки пользователя будут доступны в следующей версии');
  });

  // Обработчик удаления комнаты
  socket.on('room_deleted', (response) => {
    if (response.success) {
      // Если удалена текущая комната, переходим в общую
      if (response.roomId === currentRoom) {
        handleRoomClick('general', 'Общий чат');
      }
    } else {
      alert('Ошибка при удалении комнаты: ' + response.message);
    }
  });

  // Функция для показа модального окна удаления комнаты
  function showDeleteRoomModal(room) {
    roomToDelete = room;
    deleteRoomName.textContent = room.name;
    deleteRoomModal.classList.add('active');
  }
  
  // Обработчик подтверждения удаления
  deleteRoomConfirmBtn.addEventListener('click', () => {
    if (roomToDelete) {
      socket.emit('delete_room', { roomId: roomToDelete.id });
      deleteRoomModal.classList.remove('active');
      roomToDelete = null;
    }
  });
  
  // Закрытие модального окна удаления
  document.querySelectorAll('#delete-room-modal .close-btn, #delete-room-modal .cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteRoomModal.classList.remove('active');
      roomToDelete = null;
    });
  });

  // Добавляем обработчик события удаления сообщения
  socket.on('message_deleted', (data) => {
    const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
    
    if (messageElement) {
      // Отображаем системное сообщение об удалении
      const deletedByText = data.deletedBy === 'admin' ? 'администратором' : 'автором';
      const systemMessage = document.createElement('div');
      systemMessage.className = 'system-message deletion-message';
      systemMessage.textContent = `Сообщение было удалено ${deletedByText}`;
      
      // Заменяем удаленное сообщение системным уведомлением
      messageElement.parentNode.replaceChild(systemMessage, messageElement);
      
      // Удаляем уведомление через некоторое время
      setTimeout(() => {
        if (systemMessage.parentNode) {
          systemMessage.parentNode.removeChild(systemMessage);
        }
      }, 5000);
    }
  });

  // Функция для отображения модального окна ввода пароля
  function showRoomPasswordModal(room) {
    pendingRoomId = room.id;
    pendingRoomName = room.name;
    protectedRoomName.textContent = room.name;
    enterRoomPasswordInput.value = '';
    roomPasswordMessage.style.display = 'none';
    roomPasswordModal.classList.add('active');
    enterRoomPasswordInput.focus();
  }
  
  // Обработчик кнопки входа в защищенную комнату
  enterRoomBtn.addEventListener('click', () => {
    const password = enterRoomPasswordInput.value.trim();
    if (!password) {
      showRoomPasswordError('Введите пароль');
      return;
    }
    
    // Отправляем запрос на проверку пароля
    socket.emit('join_protected_room', {
      roomId: pendingRoomId,
      password: password
    });
  });
  
  // Обработчик нажатия Enter в поле ввода пароля комнаты
  enterRoomPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      enterRoomBtn.click();
    }
  });
  
  // Закрытие модального окна ввода пароля
  document.querySelectorAll('#room-password-modal .close-btn, #room-password-modal .cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      roomPasswordModal.classList.remove('active');
      pendingRoomId = null;
      pendingRoomName = null;
    });
  });
  
  // Показать ошибку в модальном окне пароля
  function showRoomPasswordError(message) {
    roomPasswordMessage.textContent = message;
    roomPasswordMessage.className = 'message-box error';
    roomPasswordMessage.style.display = 'block';
  }

  // Обработчик ответа на вход в защищенную комнату
  socket.on('join_protected_room_response', (response) => {
    if (response.success) {
      roomPasswordModal.classList.remove('active');
      handleRoomClick(pendingRoomId, pendingRoomName);
      pendingRoomId = null;
      pendingRoomName = null;
    } else {
      showRoomPasswordError(response.message || 'Неверный пароль');
    }
  });

  // Обработчик события изменения размера окна для перерасчета высоты
  window.addEventListener('resize', function() {
    if (window.innerWidth <= 768) {
      adjustMobileLayout();
    }
  });
  
  // Обработчик события изменения ориентации на мобильных устройствах
  window.addEventListener('orientationchange', function() {
    setTimeout(adjustMobileLayout, 200);
  });
  
  // Функция для корректировки интерфейса на мобильных устройствах
  function adjustMobileLayout() {
    const messagesContainer = document.getElementById('messages-container');
    const chatContainer = document.getElementById('chat-container');
    const messageInputContainer = document.querySelector('.message-input-container');
    
    // Прокручиваем к последнему сообщению после изменения размеров
    setTimeout(scrollToBottom, 300);
    
    // Предотвращаем скрытие поля ввода за пределами экрана
    if (window.innerWidth <= 768) {
      // Всегда показываем поле ввода на мобильных устройствах
      if (messageInputContainer) {
        messageInputContainer.style.display = 'flex';
        messageInputContainer.style.bottom = '0';
      }
      
      // Добавляем обработчик для клика на любой элемент в контейнере чата
      chatContainer.addEventListener('click', function() {
        if (messageInputContainer) {
          messageInputContainer.style.display = 'flex';
          messageInputContainer.style.bottom = '0';
        }
      });
      
      // Добавляем обработчик для контейнера сообщений, чтобы поле ввода не уходило за экран
      messagesContainer.addEventListener('scroll', function() {
        // Устанавливаем позицию поля ввода всегда внизу
        if (messageInputContainer) {
          messageInputContainer.style.display = 'flex';
          messageInputContainer.style.bottom = '0';
        }
      });
      
      // Удаляем обработчик touchmove с preventDefault, который мешает прокрутке
      messagesContainer.removeEventListener('touchmove', handleTouchMove);
      
      // Добавляем улучшенный обработчик для прокрутки на мобильных устройствах
      let startY = 0;
      
      messagesContainer.addEventListener('touchstart', function(e) {
        startY = e.touches[0].clientY;
      }, { passive: true });
      
      // Отслеживаем окончание прокрутки для проверки видимости поля ввода
      messagesContainer.addEventListener('touchend', function() {
        if (messageInputContainer) {
          setTimeout(() => {
            messageInputContainer.style.display = 'flex';
            messageInputContainer.style.bottom = '0';
          }, 100);
        }
      }, { passive: true });
    }
    
    // Решение проблемы с виртуальной клавиатурой
    if (document.activeElement.tagName === 'TEXTAREA') {
      const viewportHeight = window.innerHeight;
      const keyboardHeight = window.outerHeight - window.innerHeight;
      
      if (keyboardHeight > 0) {
        // Если клавиатура открыта, корректируем высоту
        document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
      }
    }
  }
  
  // Обработчики для полей ввода на мобильных устройствах
  messageInput.addEventListener('focus', function() {
    if (window.innerWidth <= 768) {
      // Небольшая задержка, чтобы клавиатура успела открыться
      setTimeout(() => {
        adjustMobileLayout();
        scrollToBottom();
      }, 300);
    }
  });
  
  messageInput.addEventListener('blur', function() {
    if (window.innerWidth <= 768) {
      // Возвращаем высоту viewport к исходной при закрытии клавиатуры
      document.documentElement.style.setProperty('--viewport-height', '100vh');
      setTimeout(adjustMobileLayout, 300);
    }
  });
  
  // Инициализация при загрузке страницы
  if (window.innerWidth <= 768) {
    adjustMobileLayout();
  }

  // Добавляем обработчики для боковой панели
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        const messageInputContainer = document.querySelector('.message-input-container');
        if (messageInputContainer) {
          setTimeout(() => {
            messageInputContainer.style.display = 'flex';
            messageInputContainer.style.bottom = '0';
          }, 100);
        }
      }
    });
  }

  // Функция для прокрутки к последнему сообщению с оптимизацией для мобильных устройств
  function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    
    // Используем requestAnimationFrame для более плавной прокрутки
    requestAnimationFrame(() => {
      // Проверка на iOS Safari, где scrollHeight может быть неправильным
      const scrollHeight = Math.max(
        messagesContainer.scrollHeight,
        messagesContainer.clientHeight
      );
      
      // Плавная прокрутка с анимацией для десктопов
      if (window.innerWidth > 768) {
        messagesContainer.scrollTo({
          top: scrollHeight,
          behavior: 'smooth'
        });
      } else {
        // Мгновенная прокрутка для мобильных устройств для лучшей производительности
        messagesContainer.scrollTop = scrollHeight;
      }
    });
  }
  
  // Обновление списка пользователей
  function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(user => {
      const userItem = document.createElement('div');
      userItem.className = 'user-item';
      userItem.textContent = user.displayName || user.username;
      usersList.appendChild(userItem);
    });
  }

  // Обработчики Socket.IO
  socket.on('connect', () => {
    console.log('Соединение с сервером установлено');
  });

  socket.on('disconnect', () => {
    console.log('Соединение с сервером потеряно');
  });

  socket.on('error', (error) => {
    console.error('Ошибка сервера:', error);
    showMessage(document.getElementById('login-message'), error.message, 'error');
  });

  // Добавляем функцию автоматического входа при загрузке страницы
  function checkSavedLogin() {
    const savedUsername = localStorage.getItem('chatUsername');
    const savedToken = localStorage.getItem('chatToken');
    
    if (savedUsername && savedToken) {
      // Отправляем запрос на аутентификацию по токену
      socket.emit('token_auth', {
        username: savedUsername,
        token: savedToken
      });
      console.log('Попытка авторизации по сохраненному токену');
    }
  }
  
  // Проверяем сохраненные данные при загрузке
  checkSavedLogin();
}); 