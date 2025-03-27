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
  
  // Данные пользователя
  let currentUser = null;
  
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
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  function sendMessage() {
    const text = messageInput.value.trim();
    
    if (text) {
      socket.emit('chat_message', { text });
      messageInput.value = '';
    }
  }
  
  // Отображение сообщения в чате
  function displayMessage(message) {
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
    const textElement = document.createElement('div');
    textElement.className = 'message-text';
    textElement.textContent = message.text;
    
    // Собираем сообщение
    messageBubble.appendChild(metaElement);
    messageBubble.appendChild(textElement);
    messageElement.appendChild(messageBubble);
    
    // Добавляем в контейнер
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
      
      // Фокусируемся на поле ввода сообщения
      messageInput.focus();
      
      showMessage(loginMessage, response.message, 'success');
    } else {
      showMessage(loginMessage, response.message, 'error');
    }
  });
  
  // Получение истории сообщений
  socket.on('message_history', (messages) => {
    messagesContainer.innerHTML = '';
    messages.forEach(message => {
      displayMessage(message);
    });
    scrollToBottom();
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
}); 