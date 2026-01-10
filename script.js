document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. ИНИЦИАЛИЗАЦИЯ ---
    AOS.init({
        once: true,
        duration: 800,
        offset: 80,
    });

    const serverSelect = document.getElementById('server-select');
    const amountInput = document.getElementById('amount');
    const priceInput = document.getElementById('total-price');
    const buyBtn = document.getElementById('buy-btn');
    const nicknameInput = document.getElementById('nickname');
    const PRICE_PER_MILLION = 20;

    // --- 2. СЕРВЕРНАЯ ЧАСТЬ (ЗАГРУЗКА) ---
    async function loadServers() {
        try {
            const response = await fetch('servers.json');
            if (!response.ok) throw new Error("Ошибка");
            const servers = await response.json();
            servers.forEach(srv => addServerOption(srv.name));
        } catch (error) {
            const fallbackServers = ["Red", "Green", "Blue", "Yellow", "Orange", "Black", "Pink", "Gold"];
            fallbackServers.forEach(srv => addServerOption(srv));
        }
    }
    function addServerOption(name) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `Сервер ${name}`;
        serverSelect.appendChild(option);
    }
    loadServers();

    // --- 3. РАСЧЕТ ЦЕНЫ ---
    function updatePrice() {
        let amount = parseInt(amountInput.value);
        if (isNaN(amount) || amount < 1) amount = 1;
        const totalPrice = amount * PRICE_PER_MILLION;
        priceInput.value = `${new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽`;
    }
    if(amountInput) {
        amountInput.addEventListener('input', updatePrice);
        updatePrice();
    }

    // --- 4. КАСТОМНЫЕ МОДАЛЬНЫЕ ОКНА (ВМЕСТО ALERT) ---
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalIcon = document.getElementById('modal-icon');
    const modalClose = document.getElementById('modal-close');

    function showModal(title, text, type = 'info') {
        modalTitle.textContent = title;
        modalText.textContent = text;
        
        if (type === 'error') {
            modalIcon.innerHTML = '⚠️';
            modalIcon.style.color = '#ff4757';
        } else if (type === 'success') {
            modalIcon.innerHTML = '✅';
            modalIcon.style.color = '#2ed573';
        } else {
            modalIcon.innerHTML = 'ℹ️';
            modalIcon.style.color = '#ffa502';
        }
        
        modal.classList.add('active');
    }

    modalClose.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // --- 5. ЛОГИКА ПОКУПКИ И СОХРАНЕНИЯ ЗАКАЗОВ ---
    if(buyBtn) {
        buyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const server = serverSelect.value;
            const nick = nicknameInput.value.trim();
            const amount = parseInt(amountInput.value);
    
            if (!server) { showModal("Ошибка", "Пожалуйста, выберите сервер!", "error"); return; }
            if (!nick) { showModal("Ошибка", "Пожалуйста, введите ваш ник!", "error"); return; }
    
            // Анимация кнопки
            const originalText = buyBtn.innerHTML;
            buyBtn.disabled = true;
            buyBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Обработка...`;
            
            setTimeout(() => {
                // Генерация заказа
                const orderId = `#BR-${Math.floor(10000 + Math.random() * 90000)}`;
                const totalPrice = amount * PRICE_PER_MILLION;
                
                // Сохранение в LocalStorage (Облачное сохранение для браузера)
                saveOrder({
                    id: orderId,
                    server: server,
                    nick: nick,
                    amount: amount,
                    price: totalPrice,
                    date: new Date().toLocaleDateString()
                });

                buyBtn.style.background = "#28a745";
                buyBtn.innerHTML = `Успешно!`;
                
                showModal("Заказ создан!", `Номер вашего заказа: ${orderId}. Переход на оплату...`, "success");

                // Возврат кнопки
                setTimeout(() => {
                    buyBtn.disabled = false;
                    buyBtn.innerHTML = originalText;
                    buyBtn.style.background = ""; 
                }, 3000);
            }, 1500);
        });
    }

    // --- 6. ИСТОРИЯ ЗАКАЗОВ ---
    const historyModal = document.getElementById('history-modal');
    const openHistoryBtn = document.getElementById('open-history-btn');
    const ordersList = document.getElementById('orders-list');

    function saveOrder(order) {
        let orders = JSON.parse(localStorage.getItem('br_orders')) || [];
        orders.unshift(order); // Добавляем в начало
        localStorage.setItem('br_orders', JSON.stringify(orders));
        renderHistory();
    }

    function renderHistory() {
        const orders = JSON.parse(localStorage.getItem('br_orders')) || [];
        ordersList.innerHTML = '';

        if (orders.length === 0) {
            ordersList.innerHTML = '<p class="empty-text">Вы еще ничего не покупали</p>';
            return;
        }

        orders.forEach(order => {
            const div = document.createElement('div');
            div.className = 'order-item';
            div.innerHTML = `
                <div class="order-info">
                    <strong>Заказ ${order.id}</strong>
                    <span>${order.server} | ${order.amount}КК | ${order.nick}</span>
                </div>
                <div class="order-status success">${order.price} ₽</div>
            `;
            ordersList.appendChild(div);
        });
    }

    openHistoryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        renderHistory();
        historyModal.classList.add('active');
    });


    // --- 7. AI ЧАТ ПОДДЕРЖКИ (MISTRAL) ---
    const chatToggle = document.getElementById('chat-toggle-btn');
    const chatWindow = document.getElementById('chat-window');
    const chatClose = document.getElementById('chat-close');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-msg-btn');
    const chatMessages = document.getElementById('chat-messages');

    // Ключ Mistral (ВНИМАНИЕ: В продакшене ключи хранят на бэкенде!)
    const API_KEY = "hcBgf9aoYktmhPvD4qbb0pAtQSArEFy9"; 
    const API_URL = "https://api.mistral.ai/v1/chat/completions";

    chatToggle.addEventListener('click', () => chatWindow.classList.toggle('active'));
    chatClose.addEventListener('click', () => chatWindow.classList.remove('active'));

    function addMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.textContent = text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendToMistral(userText) {
        addMessage(userText, 'user');
        chatInput.value = '';
        
        // Индикатор набора (временный)
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message system';
        loadingDiv.textContent = 'Печатает...';
        loadingDiv.id = 'loading-msg';
        chatMessages.appendChild(loadingDiv);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "mistral-tiny",
                    messages: [
                        {
                            role: "system", 
                            content: "Ты — вежливый оператор поддержки магазина игровой валюты 'BR SHOP'. Ты помогаешь пользователям с покупкой виртов в игре Black Russia. Отвечай кратко, по делу и на русском языке. Не говори, что ты ИИ. Если спрашивают про оплату - говори, что оплата проходит через карту или СБП. вот адрес сайта https://bashbanktop.vercel.app/#purchase тут происходит покупка."
                        },
                        { role: "user", content: userText }
                    ],
                    max_tokens: 150
                })
            });

            const data = await response.json();
            document.getElementById('loading-msg').remove();
            
            if (data.choices && data.choices.length > 0) {
                addMessage(data.choices[0].message.content, 'system');
            } else {
                addMessage("Сейчас операторы заняты, попробуйте позже.", 'system');
            }

        } catch (error) {
            console.error(error);
            if(document.getElementById('loading-msg')) document.getElementById('loading-msg').remove();
            addMessage("Ошибка соединения. Напишите нам в Telegram.", 'system');
        }
    }

    sendBtn.addEventListener('click', () => {
        const text = chatInput.value.trim();
        if(text) sendToMistral(text);
    });

    chatInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') {
            const text = chatInput.value.trim();
            if(text) sendToMistral(text);
        }
    });
});

