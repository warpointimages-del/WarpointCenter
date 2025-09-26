// Конфигурация Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAbLz1MnfjYIQMDkmqgMa09Z3W_j8dnJbM",
    authDomain: "database-a9dee.firebaseapp.com",
    databaseURL: "https://database-a9dee-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "database-a9dee",
    storageBucket: "database-a9dee.firebasestorage.app",
    messagingSenderId: "68358730239",
    appId: "1:68358730239:web:21d9e409f80df8e815b7ca"
};

// Инициализация Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js';
import { getDatabase, ref, set, get, child } from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

class ScheduleApp {
    constructor() {
        this.tg = Telegram.WebApp;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.userData = null;
        this.scheduleData = null;
        this.userColor = { h: 200, s: 80, l: 50 };
        
        this.init();
    }

    async init() {
        try {
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            await this.authenticateUser();
            await this.loadUserData();
            await this.loadScheduleData();
            this.setupEventListeners();
            this.renderCalendar();
            
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('user-panel').classList.remove('hidden');
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    async authenticateUser() {
        const user = this.tg.initDataUnsafe.user;
        if (!user) throw new Error('User not found');
        
        this.userData = {
            tgId: user.id,
            username: user.username || `user_${user.id}`,
            firstName: user.first_name,
            lastName: user.last_name || ''
        };
        
        // Сохраняем/обновляем пользователя в Firebase
        await set(ref(db, `users/${user.id}`), {
            ...this.userData,
            lastLogin: new Date().toISOString()
        });
    }

    async loadUserData() {
        const userRef = ref(db, `users/${this.userData.tgId}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.color) {
                this.userColor = data.color;
                this.updateColorSliders();
            }
            
            if (data.employeeId) {
                this.userData.employeeId = data.employeeId;
            }
        }
    }

    async loadScheduleData() {
        try {
            // Здесь будет логика парсинга Google Sheets
            // Пока используем заглушку
            this.scheduleData = await this.fetchScheduleData();
        } catch (error) {
            console.error('Error loading schedule:', error);
        }
    }

    async fetchScheduleData() {
        // Заглушка - в реальности здесь будет парсинг Google Sheets
        return {
            employees: [
                { id: 1, name: 'Иван Иванов', color: '#ff6b6b' },
                { id: 2, name: 'Петр Петров', color: '#4ecdc4' },
                { id: 3, name: 'Мария Сидорова', color: '#45b7d1' }
            ],
            schedule: {
                '2024-01': {
                    '1': { '1': 1, '5': 1, '10': 8 },
                    '2': { '2': 1, '6': 1, '15': 1 },
                    '3': { '3': 1, '7': 1, '20': 6 }
                }
            },
            lastUpdated: new Date().toISOString()
        };
    }

    setupEventListeners() {
        document.getElementById('prev-btn').addEventListener('click', () => this.navigate(-1));
        document.getElementById('next-btn').addEventListener('click', () => this.navigate(1));
        document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
        
        // Цветовые слайдеры
        document.getElementById('hue-slider').addEventListener('input', (e) => this.updateColor('h', e.target.value));
        document.getElementById('saturation-slider').addEventListener('input', (e) => this.updateColor('s', e.target.value));
        document.getElementById('lightness-slider').addEventListener('input', (e) => this.updateColor('l', e.target.value));
        document.getElementById('save-color').addEventListener('click', () => this.saveColor());
    }

    updateColor(component, value) {
        this.userColor[component] = parseInt(value);
        this.updateColorDisplay();
    }

    updateColorSliders() {
        document.getElementById('hue-slider').value = this.userColor.h;
        document.getElementById('saturation-slider').value = this.userColor.s;
        document.getElementById('lightness-slider').value = this.userColor.l;
        this.updateColorDisplay();
    }

    updateColorDisplay() {
        const colorStr = `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)`;
        document.getElementById('color-display').style.background = colorStr;
        document.getElementById('hue-value').textContent = this.userColor.h;
        document.getElementById('saturation-value').textContent = this.userColor.s + '%';
        document.getElementById('lightness-value').textContent = this.userColor.l + '%';
    }

    async saveColor() {
        try {
            await set(ref(db, `users/${this.userData.tgId}/color`), this.userColor);
            this.showNotification('Цвет сохранен');
        } catch (error) {
            console.error('Error saving color:', error);
        }
    }

    navigate(direction) {
        if (this.isMonthView) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
        }
        this.renderCalendar();
    }

    toggleView() {
        this.isMonthView = !this.isMonthView;
        const toggleBtn = document.getElementById('toggle-view');
        toggleBtn.textContent = this.isMonthView ? '▲' : '▼';
        
        document.getElementById('week-view').classList.toggle('hidden', this.isMonthView);
        document.getElementById('month-view').classList.toggle('hidden', !this.isMonthView);
        
        this.renderCalendar();
    }

    renderCalendar() {
        if (this.isMonthView) {
            this.renderMonthView();
        } else {
            this.renderWeekView();
        }
        this.updatePeriodDisplay();
    }

    renderWeekView() {
        const weekView = document.getElementById('week-view');
        const weekStart = this.getWeekStart(this.currentDate);
        
        let html = '<div class="week-grid">';
        
        // Заголовок с днями недели
        html += '<div class="week-header"></div>';
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            html += `<div class="week-header">${this.formatDate(date, 'short')}</div>`;
        }
        
        // Строки с сотрудниками
        if (this.scheduleData && this.scheduleData.employees) {
            this.scheduleData.employees.forEach(employee => {
                html += `<div class="week-header">${employee.name}</div>`;
                for (let i = 0; i < 7; i++) {
                    const date = new Date(weekStart);
                    date.setDate(weekStart.getDate() + i);
                    html += `<div class="day-cell">`;
                    html += `<div class="date-number">${date.getDate()}</div>`;
                    
                    // Здесь будет логика отображения смен
                    if (this.hasShift(employee.id, date)) {
                        const isUserShift = this.userData.employeeId === employee.id;
                        const color = isUserShift ? 
                            `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)` : 
                            employee.color;
                        
                        html += `<div class="shift-strip" style="background: ${color}; width: 90%;"></div>`;
                    }
                    
                    html += `</div>`;
                }
            });
        }
        
        html += '</div>';
        weekView.innerHTML = html;
    }

    renderMonthView() {
        const monthView = document.getElementById('month-view');
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        let html = '<div class="month-grid">';
        
        // Заголовки дней недели
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        days.forEach(day => {
            html += `<div class="week-header">${day}</div>`;
        });
        
        // Пустые ячейки перед первым днем
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        for (let i = 0; i < startDay; i++) {
            html += '<div class="month-day empty"></div>';
        }
        
        // Дни месяца
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            html += `<div class="month-day">`;
            html += `<div class="date-number">${day}</div>`;
            
            // Смены на этот день
            if (this.scheduleData && this.scheduleData.employees) {
                this.scheduleData.employees.forEach(employee => {
                    if (this.hasShift(employee.id, date)) {
                        const isUserShift = this.userData.employeeId === employee.id;
                        const color = isUserShift ? 
                            `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)` : 
                            employee.color;
                        
                        html += `<div class="shift-strip" style="background: ${color}; width: 100%;"></div>`;
                    }
                });
            }
            
            html += `</div>`;
        }
        
        html += '</div>';
        monthView.innerHTML = html;
    }

    hasShift(employeeId, date) {
        // Заглушка - здесь будет реальная проверка смен
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const day = date.getDate();
        
        return this.scheduleData?.schedule?.[monthKey]?.[employeeId]?.[day];
    }

    getWeekStart(date) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    }

    formatDate(date, format = 'full') {
        const options = {
            weekday: format === 'short' ? 'short' : 'long',
            day: 'numeric',
            month: format === 'short' ? 'short' : 'long'
        };
        return date.toLocaleDateString('ru-RU', options);
    }

    updatePeriodDisplay() {
        const periodElement = document.getElementById('current-period');
        if (this.isMonthView) {
            const monthName = this.currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
            periodElement.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        } else {
            const weekStart = this.getWeekStart(new Date(this.currentDate));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            const startStr = this.formatDate(weekStart, 'short');
            const endStr = this.formatDate(weekEnd, 'short');
            periodElement.textContent = `${startStr} - ${endStr}`;
        }
    }

    showNotification(message) {
        // Простая реализация уведомления
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #2563eb;
            color: white;
            padding: 12px 20px;
            border-radius: 0;
            z-index: 1000;
            font-size: 14px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    new ScheduleApp();
});
