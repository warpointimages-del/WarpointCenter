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

class ScheduleApp {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.userData = null;
        this.scheduleData = null;
        this.userColor = { h: 200, s: 80, l: 50 };
        this.isInitialized = false;
        
        this.init();
    }

    async init() {
        try {
            if (this.tg) {
                this.tg.expand();
                this.tg.enableClosingConfirmation();
                await this.authenticateUser();
            } else {
                // Режим разработки без Telegram
                this.userData = {
                    tgId: 'dev_' + Date.now(),
                    username: 'developer',
                    firstName: 'Developer',
                    lastName: 'Mode'
                };
            }
            
            await this.loadUserData();
            await this.loadScheduleData();
            this.setupEventListeners();
            this.renderCalendar();
            
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('user-panel').classList.remove('hidden');
            
            this.isInitialized = true;
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Ошибка загрузки приложения');
        }
    }

    async authenticateUser() {
        if (!this.tg?.initDataUnsafe?.user) {
            throw new Error('User not found in Telegram context');
        }
        
        const user = this.tg.initDataUnsafe.user;
        this.userData = {
            tgId: user.id,
            username: user.username || `user_${user.id}`,
            firstName: user.first_name,
            lastName: user.last_name || ''
        };
        
        // Сохраняем пользователя в localStorage для демо
        this.saveToLocalStorage('userData', this.userData);
    }

    async loadUserData() {
        try {
            const savedData = this.loadFromLocalStorage('userData');
            if (savedData && savedData.tgId === this.userData.tgId) {
                if (savedData.color) {
                    this.userColor = savedData.color;
                }
                if (savedData.employeeId) {
                    this.userData.employeeId = savedData.employeeId;
                }
            }
            this.updateColorSliders();
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async loadScheduleData() {
        try {
            const response = await fetch('/api/schedule');
            if (!response.ok) throw new Error('Network error');
            this.scheduleData = await response.json();
        } catch (error) {
            console.error('Error loading schedule:', error);
            // Используем тестовые данные при ошибке
            this.scheduleData = this.getMockScheduleData();
        }
    }

    getMockScheduleData() {
        return {
            employees: [
                { id: 1, name: 'Иван Иванов', color: 'hsl(0, 70%, 50%)' },
                { id: 2, name: 'Петр Петров', color: 'hsl(120, 70%, 50%)' },
                { id: 3, name: 'Мария Сидорова', color: 'hsl(240, 70%, 50%)' },
                { id: 4, name: 'Анна Козлова', color: 'hsl(60, 70%, 50%)' },
                { id: 5, name: 'Сергей Смирнов', color: 'hsl(300, 70%, 50%)' }
            ],
            schedule: {
                '2024-01': {
                    1: { 1: 1, 5: 1, 10: 8, 15: 1, 20: 1, 25: 6 },
                    2: { 2: 1, 6: 1, 11: 1, 16: 8, 21: 1, 26: 1 },
                    3: { 3: 1, 7: 1, 12: 6, 17: 1, 22: 1, 27: 8 },
                    4: { 4: 1, 8: 8, 13: 1, 18: 1, 23: 6, 28: 1 },
                    5: { 5: 1, 9: 1, 14: 1, 19: 8, 24: 1, 29: 1 }
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
        
        // Выбор сотрудника
        document.getElementById('employee-select').addEventListener('change', (e) => this.selectEmployee(e.target.value));
    }

    updateColor(component, value) {
        this.userColor[component] = parseInt(value);
        this.updateColorDisplay();
        if (this.isInitialized) {
            this.renderCalendar();
        }
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
            this.userData.color = this.userColor;
            this.saveToLocalStorage('userData', this.userData);
            this.showNotification('Цвет сохранен ✅');
        } catch (error) {
            console.error('Error saving color:', error);
            this.showNotification('Ошибка сохранения ❌');
        }
    }

    selectEmployee(employeeId) {
        this.userData.employeeId = employeeId ? parseInt(employeeId) : null;
        this.saveToLocalStorage('userData', this.userData);
        this.renderCalendar();
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
        this.updateEmployeeSelect();
    }

    renderWeekView() {
        const weekView = document.getElementById('week-view');
        const weekStart = this.getWeekStart(new Date(this.currentDate));
        
        let html = '<div class="week-grid">';
        
        // Заголовок с днями недели
        html += '<div class="week-header">Сотрудник</div>';
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            const isToday = this.isToday(date);
            const todayClass = isToday ? ' today' : '';
            html += `<div class="week-header${todayClass}">${this.formatDate(date, 'week-header')}</div>`;
        }
        
        // Строки с сотрудниками
        if (this.scheduleData && this.scheduleData.employees) {
            this.scheduleData.employees.forEach(employee => {
                const isUser = this.userData.employeeId === employee.id;
                const userClass = isUser ? ' user-employee' : '';
                
                html += `<div class="employee-name${userClass}">${employee.name}</div>`;
                for (let i = 0; i < 7; i++) {
                    const date = new Date(weekStart);
                    date.setDate(weekStart.getDate() + i);
                    const isToday = this.isToday(date);
                    const todayClass = isToday ? ' today' : '';
                    
                    html += `<div class="day-cell${todayClass}">`;
                    html += `<div class="date-number">${date.getDate()}</div>`;
                    
                    if (this.hasShift(employee.id, date)) {
                        const isUserShift = isUser;
                        const color = isUserShift ? 
                            `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)` : 
                            employee.color;
                        
                        const shiftValue = this.getShiftValue(employee.id, date);
                        const shiftClass = shiftValue > 1 ? ' long-shift' : '';
                        const title = shiftValue > 1 ? `${shiftValue} часов` : 'Смена';
                        
                        html += `<div class="shift-strip${shiftClass}" style="background: ${color};" title="${employee.name}: ${title}"></div>`;
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
        const daysInMonth = lastDay.getDate();
        
        let html = '<div class="month-grid">';
        
        // Заголовки дней недели
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        days.forEach(day => {
            html += `<div class="month-header">${day}</div>`;
        });
        
        // Пустые ячейки перед первым днем
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        for (let i = 0; i < startDay; i++) {
            html += '<div class="month-day empty"></div>';
        }
        
        // Дни месяца
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = this.isToday(date);
            const todayClass = isToday ? ' today' : '';
            
            html += `<div class="month-day${todayClass}">`;
            html += `<div class="date-number">${day}</div>`;
            
            // Смены на этот день
            if (this.scheduleData && this.scheduleData.employees) {
                this.scheduleData.employees.forEach(employee => {
                    if (this.hasShift(employee.id, date)) {
                        const isUser = this.userData.employeeId === employee.id;
                        const isUserShift = isUser;
                        const color = isUserShift ? 
                            `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)` : 
                            employee.color;
                        
                        const shiftValue = this.getShiftValue(employee.id, date);
                        const shiftClass = shiftValue > 1 ? ' long-shift' : '';
                        const title = `${employee.name}: ${shiftValue > 1 ? shiftValue + ' часов' : 'Смена'}`;
                        
                        html += `<div class="shift-strip${shiftClass}" style="background: ${color};" title="${title}"></div>`;
                    }
                });
            }
            
            html += `</div>`;
        }
        
        html += '</div>';
        monthView.innerHTML = html;
    }

    hasShift(employeeId, date) {
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const day = date.getDate();
        
        return this.scheduleData?.schedule?.[monthKey]?.[employeeId]?.[day];
    }

    getShiftValue(employeeId, date) {
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const day = date.getDate();
        
        return this.scheduleData?.schedule?.[monthKey]?.[employeeId]?.[day] || 0;
    }

    isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }

    getWeekStart(date) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    }

    formatDate(date, format = 'full') {
        if (format === 'week-header') {
            const options = { weekday: 'short', day: 'numeric' };
            return date.toLocaleDateString('ru-RU', options);
        }
        
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
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
            
            const startStr = weekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            const endStr = weekEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            periodElement.textContent = `${startStr} - ${endStr}`;
        }
    }

    updateEmployeeSelect() {
        const select = document.getElementById('employee-select');
        if (!this.scheduleData?.employees) return;
        
        select.innerHTML = '<option value="">-- Выберите себя --</option>';
        this.scheduleData.employees.forEach(employee => {
            const selected = this.userData.employeeId === employee.id ? 'selected' : '';
            select.innerHTML += `<option value="${employee.id}" ${selected}>${employee.name}</option>`;
        });
    }

    saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    loadFromLocalStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return null;
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }
}

// Запуск приложения когда DOM загружен
document.addEventListener('DOMContentLoaded', () => {
    new ScheduleApp();
});
