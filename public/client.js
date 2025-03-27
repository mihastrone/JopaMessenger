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
  const logoutBtn = document.getElementById('logout-btn');
  const currentRoomName = document.getElementById('current-room-name');
  const roomsList = document.getElementById('rooms-list');
  const createRoomBtn = document.getElementById('create-room-btn');
  const notificationsToggle = document.getElementById('notifications-toggle');
  
  // Модальное окно создания комнаты
  const createRoomModal = document.getElementById('create-room-modal');
  const roomNameInput = document.getElementById('room-name');
  const createRoomConfirmBtn = document.getElementById('create-room-confirm-btn');
  const closeModalBtns = document.querySelectorAll('.close-btn, .cancel-btn');
  
  // Загрузка изображений
  const uploadImageBtn = document.getElementById('upload-image-btn');
  const imageInput = document.getElementById('image-input');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const cancelImageBtn = document.getElementById('cancel-image-btn');
  
  // Звуковое уведомление
  const notificationSound = document.getElementById('notification-sound');
  
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
  uploadImageBtn.addEventListener('click', () => {
    imageInput.click();
  });
  
  // Обработка выбора изображения
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
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
    imageInput.value = '';
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
  
  // Воспроизведение звукового уведомления
  function playNotificationSound() {
    if (notificationsToggle.checked && !isWindowActive) {
      notificationSound.currentTime = 0;
      notificationSound.play().catch(err => console.log('Ошибка воспроизведения:', err));
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
  logoutBtn.addEventListener('click', () => {
    // Сбрасываем данные пользователя
    currentUser = null;
    
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
    
    if (text || currentImageData) {
      socket.emit('chat_message', { 
        text,
        roomId: currentRoom,
        image: currentImageData
      });
      messageInput.value = '';
      clearImageSelection();
    }
  }
  
  // Обработка клика по комнате
  function handleRoomClick(roomId, roomName) {
    if (currentRoom !== roomId) {
      currentRoom = roomId;
      
      // Обновляем название комнаты
      currentRoomName.textContent = roomName;
      
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
    // Если сообщение не для текущей комнаты, игнорируем
    if (message.roomId && message.roomId !== currentRoom) {
      return;
    }
    
    // Если это сообщение из другой комнаты и не от нас, проигрываем уведомление
    if (message.roomId !== currentRoom && (!currentUser || message.username !== currentUser.username)) {
      playNotificationSound();
    }
    
    // Создаем элемент сообщения
    const messageElement = document.createElement('div');
    
    // Если это системное сообщение
    if (message.system) {
      messageElement.className = 'system-message';
      messageElement.textContent = message.text;
      messagesContainer.appendChild(messageElement);
      scrollToBottom();
      return;
    }
    
    // Если это обычное сообщение
    messageElement.className = 'message';
    
    // Проверяем, является ли сообщение собственным
    if (currentUser && message.username === currentUser.username) {
      messageElement.classList.add('own');
    } else if (!isWindowActive) {
      // Проигрываем звук уведомления для чужих сообщений при неактивном окне
      playNotificationSound();
    }
    
    // Создаем пузырь сообщения
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    // Метаданные (имя пользователя и время)
    const metaElement = document.createElement('div');
    metaElement.className = 'message-meta';
    
    const usernameElement = document.createElement('span');
    usernameElement.className = 'username';
    usernameElement.textContent = message.displayName || message.username;
    
    const timestampElement = document.createElement('span');
    timestampElement.className = 'timestamp';
    timestampElement.textContent = new Date(message.timestamp).toLocaleTimeString();
    
    metaElement.appendChild(usernameElement);
    metaElement.appendChild(timestampElement);
    
    // Текст сообщения
    if (message.text) {
      const textElement = document.createElement('div');
      textElement.className = 'message-text';
      textElement.textContent = message.text;
      messageBubble.appendChild(metaElement);
      messageBubble.appendChild(textElement);
    }
    
    // Если есть изображение
    if (message.image) {
      const imageElement = document.createElement('div');
      imageElement.className = 'message-image';
      
      const img = document.createElement('img');
      img.src = message.image;
      img.alt = 'Изображение';
      img.addEventListener('click', () => {
        window.open(message.image, '_blank');
      });
      
      imageElement.appendChild(img);
      
      if (!message.text) {
        messageBubble.appendChild(metaElement);
      }
      
      messageBubble.appendChild(imageElement);
    }
    
    // Добавляем сообщение в DOM
    messageElement.appendChild(messageBubble);
    messagesContainer.appendChild(messageElement);
    
    // Прокручиваем вниз
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
      userDisplayName.textContent = currentUser.displayName;
      
      // Скрываем форму авторизации и показываем чат
      authContainer.style.display = 'none';
      chatContainer.style.display = 'flex';
      
      // Присоединяемся к общей комнате
      socket.emit('join_room', 'general');
      
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
      currentRoomName.textContent = response.room.name;
      
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
}); 