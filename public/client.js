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
  
  // Данные пользователя и чата
  let currentUser = null;
  let currentRoom = 'general';
  let currentImageData = null;
  let rooms = [];
  
  // Флаг активности окна
  let isWindowActive = true;
  window.addEventListener('focus', () => { isWindowActive = true; });
  window.addEventListener('blur', () => { isWindowActive = false; });
  
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
    if (roomName) {
      socket.emit('create_room', { name: roomName });
      createRoomModal.classList.remove('active');
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
    localStorage.removeItem('username');
    localStorage.removeItem('token');
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
        handleRoomClick(room.id, room.name);
      });
      
      roomsList.appendChild(roomItem);
    });
  }
  
  // Отображение сообщения в чате
  function displayMessage(message) {
    // Проверяем принадлежность сообщения текущей комнате
    if (message.roomId && message.roomId !== currentRoom) {
      return;
    }
    
    // Если это сообщение из другой комнаты, проигрываем уведомление
    if (!isWindowActive) {
      playNotificationSound();
    }
    
    // Создаем элемент сообщения через функцию createMessageElement или используем существующий код
    const messageElement = createMessageElement({
      sender: message.username,
      displayName: message.displayName || message.username,
      text: message.text,
      image: message.image,
      timestamp: message.timestamp,
      isSystem: message.system
    });
    
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
  }
  
  // Прокрутка чата вниз
  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
  
  // Обработчик успешного входа
  socket.on('login_response', (response) => {
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
      
      // Фокусируемся на поле ввода сообщения
      messageInput.focus();
      
      showMessage(loginMessage, response.message, 'success');
    } else {
      showMessage(loginMessage, response.message, 'error');
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
    if (data.roomId === currentRoom) {
      messagesContainer.innerHTML = '';
      data.messages.forEach(message => {
        displayMessage(message);
      });
      scrollToBottom();
    }
  });
  
  // Получение нового сообщения
  socket.on('chat_message', (message) => {
    displayMessage(message);
  });
  
  // Обновление списка пользователей
  socket.on('user_list', (users) => {
    updateUsersList(users);
  });
  
  // Обработчик ошибок
  socket.on('error', (data) => {
    alert('Ошибка: ' + data.message);
  });
  
  // Запрос разрешения на уведомления (для браузерных уведомлений)
  if (Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }

  // Обновление дизайна сообщений в чате
  function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    // Определение, собственное ли это сообщение
    if (message.sender === currentUser) {
        messageDiv.classList.add('own');
    }
    
    // Если это системное сообщение
    if (message.isSystem) {
        messageDiv.classList.add('system-message');
        messageDiv.textContent = message.text;
        return messageDiv;
    }
    
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble');
    
    const messageMeta = document.createElement('div');
    messageMeta.classList.add('message-meta');
    
    const usernameSpan = document.createElement('span');
    usernameSpan.classList.add('username');
    usernameSpan.textContent = message.displayName || message.sender;
    
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('time');
    timeSpan.textContent = new Date(message.timestamp).toLocaleTimeString();
    
    messageMeta.appendChild(usernameSpan);
    messageMeta.appendChild(timeSpan);
    
    const messageText = document.createElement('div');
    messageText.classList.add('message-text');
    messageText.textContent = message.text;
    
    messageBubble.appendChild(messageMeta);
    messageBubble.appendChild(messageText);
    
    // Если есть изображение
    if (message.image) {
        const messageImage = document.createElement('div');
        messageImage.classList.add('message-image');
        
        const img = document.createElement('img');
        img.src = message.image;
        img.alt = 'Вложенное изображение';
        img.addEventListener('click', () => openImageModal(message.image));
        
        messageImage.appendChild(img);
        messageBubble.appendChild(messageImage);
    }
    
    messageDiv.appendChild(messageBubble);
    return messageDiv;
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
}); 