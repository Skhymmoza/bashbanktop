const app = {
    token: localStorage.getItem('token'),
    
    // API запрос (теперь через ?act=)
    api: async (act, data = {}) => {
        const headers = { 'Content-Type': 'application/json' };
        if (app.token) headers['Authorization'] = `Bearer ${app.token}`;
        
        const method = Object.keys(data).length > 0 ? 'POST' : 'GET';
        
        try {
            const r = await fetch(`api.php?act=${act}`, {
                method, headers, body: method === 'POST' ? JSON.stringify(data) : null
            });
            return await r.json();
        } catch(e) { alert('Ошибка сети'); return {}; }
    },

    // Навигация
    nav: (id) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    },

    init: () => {
        if(app.token) app.loadDash();
        else app.nav('auth');
    },

    toReg: () => app.nav('reg'),
    toAuth: () => app.nav('auth'),
    showTransfer: () => app.nav('transfer'),

    // Действия
    login: async () => {
        const login = document.getElementById('l-login').value;
        const pass = document.getElementById('l-pass').value;
        const res = await app.api('login', {login, password: pass});
        
        if(res.token) {
            app.token = res.token;
            localStorage.setItem('token', res.token);
            app.loadDash();
        } else alert(res.error || 'Ошибка входа');
    },

    register: async () => {
        const data = {
            full_name: document.getElementById('r-name').value,
            login: document.getElementById('r-login').value,
            phone: document.getElementById('r-phone').value,
            password: document.getElementById('r-pass').value
        };
        if(!data.full_name || !data.password) return alert('Заполните поля');
        
        const res = await app.api('register', data);
        if(res.status === 'success') {
            alert('Рәхим итегез! (Добро пожаловать). Теперь войдите.');
            app.toAuth();
        } else alert(res.error || 'Ошибка');
    },

    loadDash: async () => {
        const user = await app.api('me');
        if(!user.full_name) return app.logout();
        
        document.getElementById('u-name').innerText = user.full_name;
        document.getElementById('u-bal').innerText = new Intl.NumberFormat('ru-RU').format(user.balance) + ' ₽';
        document.getElementById('u-card').innerText = user.card_number;
        
        app.nav('dash');
        app.loadHistory();
    },

    loadHistory: async () => {
        const txs = await app.api('history');
        const box = document.getElementById('history-list');
        box.innerHTML = '';
        txs.forEach(t => {
            const sign = t.type === 'income' ? '+' : '-';
            const cls = t.type;
            box.innerHTML += `
                <div class="tx-item">
                    <div><b>${t.description}</b><br><small>${t.created_at}</small></div>
                    <div class="${cls}"><b>${sign} ${t.amount} ₽</b></div>
                </div>`;
        });
    },

    doTransfer: async () => {
        const to = document.getElementById('t-card').value;
        const sum = document.getElementById('t-sum').value;
        if(!to || !sum) return;

        const res = await app.api('transfer', {to_card: to, amount: sum});
        if(res.status === 'success') {
            alert('Перевод выполнен!');
            app.loadDash();
        } else alert(res.error || 'Ошибка');
    },

    logout: () => {
        localStorage.removeItem('token');
        location.reload();
    }
};

app.init();
