import { firebaseService } from './firebase.js';
import { adminPanel } from './admin-panel.js';

class ScheduleApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.currentUser = null;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.scheduleData = {};
        this.userColor = { h: 200, s: 80, l: 50 };
        
        this.init();
    }

    async init() {
        try {
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            await this.initializeUser();
            await this.loadUserPreferences();
            await this.loadScheduleData();
            this.initializeEventListeners();
            this.renderCalendar();
            await adminPanel.init(this.currentUser);
            
            this.showScreen('main');
        } catch (error) {
            console.error('Ошибка инициализации:', error);
        }
    }

    // Инициализация пользователя
    async initializeUser() {
        const initData = this.tg.initDataUnsafe;
        const user = initData.user;
        
        if (!user) {
            throw new Error('Пользователь не авторизован');
        }

        this.currentUser = {
            id: user.id,
            first_name: user.first_name,
            username: user.username,
            isAdmin: user.id === 1999947340
        };

        await firebaseService.saveUser(this.currentUser);
        
        // Загрузка полных данных пользователя
        const userData = await firebaseService.getUser(user.id);
        if (userData) {
            this.currentUser = { ...this.currentUser, ...userData };
        }

        this.updateUserInfo();
    }

    // Загрузка предпочтений пользователя
    async loadUserPreferences() {
        if (this.currentUser.color) {
            this.userColor = this.currentUser.color;
        }
        this.updateColorSliders();
    }

    // Загрузка данных графика
    async loadScheduleData() {
        const currentMonthYear = this.getMonthYearString(this.currentDate);
        let data = await firebaseService.getScheduleData(currentMonthYear);
        
        if (!data) {
            data = await this.parseGoogleSheets();
        }
        
        this.scheduleData = data;
    }

    // Парсинг Google Sheets
    async parseGoogleSheets() {
        const sheetId = '1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk';
        const currentMonthYear = this.getMonthYearString(this.currentDate);
        const sheetName = this.getRussianMonthYear(this.currentDate);
        
        try {
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}`
            );
            
            if (!response.ok) throw new Error('Ошибка загрузки таблицы');
            
            const text = await response.text();
            const json = JSON.parse(text.substring(47).slice(0, -2));
            
            return this.processSheetData(json);
        } catch (error) {
            console.error('Ошибка парсинга таблицы:', error);
            return this.getEmptySchedule();
        }
    }

    // Обработка данных таблицы
    processSheetData(data) {
        const employees = [];
        const schedule = {};
        
        if (!data.table || !data.table.rows) {
            return this.getEmptySchedule();
        }

        // Первая строка - даты
        const dates = data.table.rows[0].c.slice(1).map((cell, index) => {
            if (cell && cell.v) {
                return parseInt(cell.v);
            }
            return index + 1;
        });

        // Остальные строки - сотрудники
        data.table.rows.slice(1).forEach(row => {
            if (!row.c[0] || !row.c[0].v) return;
            
            const employeeName = row.c[0].v;
            employees.push(employeeName);
            
            row.c.slice(1).forEach((cell, index) => {
                if (cell && cell.v) {
                    const day = dates[index];
                    if (!schedule[day]) schedule[day] = {};
                    
                    if (cell.v === 1 || cell.v > 1) {
                        schedule[day][employeeName] = cell.v;
                    }
                }
            });
        });

        return { employees, schedule };
    }

    getEmptySchedule() {
        return { employees: [], schedule: {} };
    }

    // Инициализация обработчиков событий
    initializeEventListeners() {
        document.getElementById('prev-btn').addEventListener('click', () => this.navigate(-1));
        document.getElementById('next-btn').addEventListener('click', () => this.navigate(1));
        document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
        
        // Слайдеры цвета
        document.getElementById('hue-slider').addEventListener('input', (e) => this.updateColor('h', e.target.value));
        document.getElementById('saturation-slider').addEventListener('input', (e) => this.updateColor('s', e.target.value));
        document.getElementById('lightness-slider').addEventListener('input', (e) => this.updateColor('l', e.target.value));
        document.getElementById('save-color').addEventListener('click', () => this.saveColor());
    }

    // Навигация по календарю
    navigate(direction) {
        if (this.isMonthView) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
        }
        this.renderCalendar();
        this.loadScheduleData();
    }

    // Переключение вида
    toggleView() {
        this.isMonthView = !this.isMonthView;
        const toggleBtn = document.getElementById('toggle-view');
        toggleBtn.textContent = this.isMonthView ? '↑' : '↓';
        
        document.getElementById('week-view').classList.toggle('active', !this.isMonthView);
        document.getElementById('month-view').classList.toggle('active', this.isMonthView);
        
        this.renderCalendar();
    }

    // Отрисовка календаря
    renderCalendar() {
        this.updateCurrentPeriod();
        
        if (this.isMonthView) {
            this.renderMonthView();
        } else {
            this.renderWeekView();
        }
    }

    // Отрисовка недельного вида
    renderWeekView() {
        const weekGrid = document.getElementById('week-grid');
        weekGrid.innerHTML = '';
        
        const weekStart = this.getWeekStart(this.currentDate);
        
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            
            const dayElement = this.createDayElement(day, true);
            weekGrid.appendChild(dayElement);
        }
    }

    // Отрисовка месячного вида
    renderMonthView() {
        const monthGrid = document.getElementById('month-grid');
        monthGrid.innerHTML = '';
        
        const monthStart = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const monthEnd = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        
        // Заголовки дней недели
        for (let i = 0; i < 7; i++) {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i];
            monthGrid.appendChild(dayHeader);
        }
        
        // Пустые ячейки до первого дня
        const firstDay = (monthStart.getDay() + 6) % 7;
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'month-day empty';
            monthGrid.appendChild(emptyCell);
        }
        
        // Дни месяца
        for (let day = 1; day <= monthEnd.getDate(); day++) {
            const date = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
            const dayElement = this.createDayElement(date, false);
            monthGrid.appendChild(dayElement);
        }
    }

    // Создание элемента дня
    createDayElement(date, isWeekView) {
        const dayElement = document.createElement('div');
        dayElement.className = isWeekView ? 'day-cell' : 'month-day';
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = date.getDate();
        dayElement.appendChild(dayNumber);
        
        // Отображение смен
        this.renderShiftsForDay(dayElement, date);
        
        return dayElement;
    }

    // Отрисовка смен для дня
    renderShiftsForDay(container, date) {
        const day = date.getDate();
        const monthYear = this.getMonthYearString(date);
        
        if (this.scheduleData.schedule && this.scheduleData.schedule[day]) {
            const daySchedule = this.scheduleData.schedule[day];
            
            Object.entries(daySchedule).forEach(([employeeName, shiftValue]) => {
                // Проверяем, зарегистрирован ли сотрудник
                const isRegistered = this.isEmployeeRegistered(employeeName);
                if (!isRegistered) return;
                
                const shiftElement = document.createElement('div');
                shiftElement.className = 'shift-marker';
                
                // Проверяем, это смена текущего пользователя
                const isUserShift = this.currentUser.employeeName === employeeName;
                if (isUserShift) {
                    shiftElement.classList.add('user-shift');
                    shiftElement.style.background = this.getUserColor();
                } else {
                    shiftElement.style.background = this.getEmployeeColor(employeeName);
                }
                
                // Позиционирование для нескольких смен
                const shiftCount = Object.keys(daySchedule).length;
                const shiftIndex = Object.keys(daySchedule).indexOf(employeeName);
                const topPosition = 10 + (shiftIndex * 8);
                
                shiftElement.style.top = `${topPosition}px`;
                shiftElement.title = `${employeeName}: ${shiftValue}ч`;
                
                container.appendChild(shiftElement);
            });
        }
    }

    // Проверка регистрации сотрудника
    isEmployeeRegistered(employeeName) {
        // Здесь должна быть логика проверки привязки сотрудника к пользователю
        // Пока отображаем всех зарегистрированных сотрудников
        return true;
    }

    // Генерация цвета для сотрудника
    getEmployeeColor(employeeName) {
        let hash = 0;
        for (let i = 0; i < employeeName.length; i++) {
            hash = employeeName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const h = hash % 360;
        return `hsl(${h}, 70%, 50%)`;
    }

    // Цвет текущего пользователя
    getUserColor() {
        return `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)`;
    }

    // Обновление цвета
    updateColor(component, value) {
        this.userColor[component] = parseInt(value);
        this.updateColorPreview();
    }

    // Обновление превью цвета
    updateColorPreview() {
        const preview = document.getElementById('color-preview');
        preview.style.background = this.getUserColor();
    }

    // Обновление слайдеров
    updateColorSliders() {
        document.getElementById('hue-slider').value = this.userColor.h;
        document.getElementById('saturation-slider').value = this.userColor.s;
        document.getElementById('lightness-slider').value = this.userColor.l;
        this.updateColorPreview();
    }

    // Сохранение цвета
    async saveColor() {
        await firebaseService.updateUser(this.currentUser.id, { color: this.userColor });
        this.showNotification('Цвет сохранен');
    }

    // Вспомогательные методы
    getWeekStart(date) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    }

    getMonthYearString(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    getRussianMonthYear(date) {
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        return `${months[date.getMonth()]} ${date.getFullYear().toString().slice(2)}`;
    }

    updateCurrentPeriod() {
        const periodElement = document.getElementById('current-period');
        if (this.isMonthView) {
            const monthName = this.getRussianMonthYear(this.currentDate);
            periodElement.textContent = monthName;
        } else {
            const weekStart = this.getWeekStart(new Date(this.currentDate));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            periodElement.textContent = 
                `${weekStart.getDate()} ${this.getRussianMonthYear(weekStart)} - ${weekEnd.getDate()} ${this.getRussianMonthYear(weekEnd)}`;
        }
    }

    updateUserInfo() {
        const userInfo = document.getElementById('user-info');
        userInfo.textContent = `${this.currentUser.first_name} @${this.currentUser.username}`;
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName).classList.add('active');
    }

    showNotification(message) {
        if (this.tg.showPopup) {
            this.tg.showPopup({ title: 'Уведомление', message: message });
        } else {
            alert(message);
        }
    }
}

// Запуск приложения
new ScheduleApp();
