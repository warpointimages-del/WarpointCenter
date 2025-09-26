import { firebaseService } from './firebase.js';

class ScheduleApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.scheduleData = {};
        this.user = null;
        this.filterSettings = { showOnlyMine: false };
        this.registeredUsers = new Set();
        
        this.init();
    }

    async init() {
        try {
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            await this.initializeUser();
            await this.loadFilterSettings();
            await this.loadScheduleData();
            this.initializeEventListeners();
            this.render();
            
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
        } catch (error) {
            console.error('Ошибка инициализации:', error);
        }
    }

    async initializeUser() {
        const initData = this.tg.initDataUnsafe;
        const userData = {
            id: initData.user?.id,
            username: initData.user?.username,
            first_name: initData.user?.first_name,
            last_name: initData.user?.last_name,
            isAdmin: initData.user?.id === 1999947340
        };

        if (userData.id) {
            let existingUser = await firebaseService.getUser(userData.id);
            
            if (!existingUser) {
                await firebaseService.saveUser(userData);
                existingUser = await firebaseService.getUser(userData.id);
            }
            
            this.user = existingUser;
            
            // Показываем админскую панель для админов
            if (this.user.isAdmin) {
                document.getElementById('admin-panel').classList.remove('hidden');
                this.loadAdminPanel();
            }
            
            // Показываем выбор цвета для зарегистрированных пользователей
            if (this.user.sheetNames && this.user.sheetNames.length > 0) {
                document.getElementById('color-picker').classList.remove('hidden');
                this.initializeColorPicker();
            }
        }
    }

    async loadFilterSettings() {
        if (this.user) {
            this.filterSettings = await firebaseService.getFilterSettings(this.user.id);
            document.getElementById('show-only-mine').checked = this.filterSettings.showOnlyMine;
        }
    }

    async loadScheduleData() {
        try {
            const currentMonth = this.getCurrentMonthSheetName();
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?sheet=${encodeURIComponent(currentMonth)}`
            );
            
            const text = await response.text();
            const json = JSON.parse(text.substring(47, text.length - 2));
            
            this.processScheduleData(json);
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
        }
    }

    processScheduleData(data) {
        if (!data.table || !data.table.rows) return;
        
        const rows = data.table.rows;
        const employees = [];
        const dates = [];
        
        // Получаем даты из первой строки (начиная со второго столбца)
        if (rows[0] && rows[0].c) {
            for (let i = 1; i < rows[0].c.length; i++) {
                const dateCell = rows[0].c[i];
                if (dateCell && dateCell.v) {
                    dates.push(parseInt(dateCell.v));
                }
            }
        }
        
        // Обрабатываем сотрудников и смены
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.c || !row.c[0] || !row.c[0].v) continue;
            
            const employeeName = row.c[0].v.trim();
            employees.push(employeeName);
            
            const shifts = [];
            for (let j = 1; j < row.c.length; j++) {
                const shiftCell = row.c[j];
                if (shiftCell && shiftCell.v) {
                    const shiftValue = parseFloat(shiftCell.v);
                    if (shiftValue >= 1) {
                        shifts.push({
                            date: dates[j-1],
                            hours: shiftValue
                        });
                    }
                }
            }
            
            this.scheduleData[employeeName] = shifts;
        }
        
        this.registeredUsers = new Set(employees);
    }

    getCurrentMonthSheetName() {
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        
        const currentYear = this.currentDate.getFullYear();
        const currentMonth = this.currentDate.getMonth();
        
        return `${months[currentMonth]} ${currentYear.toString().slice(2)}`;
    }

    initializeEventListeners() {
        document.getElementById('prev-week').addEventListener('click', () => this.changeWeek(-1));
        document.getElementById('next-week').addEventListener('click', () => this.changeWeek(1));
        document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
        document.getElementById('show-only-mine').addEventListener('change', (e) => this.toggleFilter(e.target.checked));
    }

    initializeColorPicker() {
        if (!this.user || !this.user.color) return;
        
        const { h, s, l } = this.user.color;
        document.getElementById('hue-slider').value = h;
        document.getElementById('saturation-slider').value = s;
        document.getElementById('lightness-slider').value = l;
        
        const updateColor = () => {
            const h = document.getElementById('hue-slider').value;
            const s = document.getElementById('saturation-slider').value;
            const l = document.getElementById('lightness-slider').value;
            
            this.user.color = { h: parseInt(h), s: parseInt(s), l: parseInt(l) };
            firebaseService.updateUser(this.user.id, { color: this.user.color });
            this.render();
        };
        
        document.getElementById('hue-slider').addEventListener('input', updateColor);
        document.getElementById('saturation-slider').addEventListener('input', updateColor);
        document.getElementById('lightness-slider').addEventListener('input', updateColor);
    }

    changeWeek(direction) {
        if (this.isMonthView) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
        }
        this.render();
    }

    toggleView() {
        this.isMonthView = !this.isMonthView;
        const toggleBtn = document.getElementById('toggle-view');
        toggleBtn.textContent = this.isMonthView ? '▲' : '▼';
        this.render();
    }

    async toggleFilter(showOnlyMine) {
        this.filterSettings.showOnlyMine = showOnlyMine;
        if (this.user) {
            await firebaseService.saveFilterSettings(this.user.id, this.filterSettings);
        }
        this.render();
    }

    render() {
        this.updateNavigation();
        
        if (this.isMonthView) {
            this.renderMonthView();
        } else {
            this.renderWeekView();
        }
    }

    updateNavigation() {
        const periodElement = document.getElementById('current-period');
        
        if (this.isMonthView) {
            const monthNames = [
                'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
            ];
            const month = monthNames[this.currentDate.getMonth()];
            const year = this.currentDate.getFullYear();
            periodElement.textContent = `${month} ${year}`;
        } else {
            const weekStart = new Date(this.currentDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            periodElement.textContent = 
                `${this.formatDate(weekStart)} - ${this.formatDate(weekEnd)}`;
        }
    }

    renderWeekView() {
        const weekView = document.getElementById('week-view');
        const monthView = document.getElementById('month-view');
        
        weekView.classList.remove('hidden');
        monthView.classList.add('hidden');
        
        const weekStart = new Date(this.currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        
        let html = '<div class="calendar-grid">';
        
        // Заголовок с днями недели
        html += '<div class="week-header"></div>';
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + i);
            html += `<div class="week-header">${this.getDayName(day)}<br>${day.getDate()}</div>`;
        }
        
        // Фильтрация сотрудников
        const employeesToShow = this.getFilteredEmployees();
        
        // Строки с сотрудниками
        employeesToShow.forEach(employee => {
            html += `<div class="week-time-cell">${employee}</div>`;
            
            for (let i = 0; i < 7; i++) {
                const day = new Date(weekStart);
                day.setDate(day.getDate() + i);
                const dayNumber = day.getDate();
                
                html += `<div class="week-day">`;
                
                const shifts = this.scheduleData[employee] || [];
                shifts.forEach(shift => {
                    if (shift.date === dayNumber) {
                        const color = this.getEmployeeColor(employee);
                        html += this.renderShift(shift, color, employee);
                    }
                });
                
                html += `</div>`;
            }
        });
        
        html += '</div>';
        weekView.innerHTML = html;
    }

    renderMonthView() {
        const weekView = document.getElementById('week-view');
        const monthView = document.getElementById('month-view');
        
        weekView.classList.add('hidden');
        monthView.classList.remove('hidden');
        
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        
        let html = '<div class="calendar-grid">';
        
        // Заголовки дней недели
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        dayNames.forEach(day => {
            html += `<div class="month-header">${day}</div>`;
        });
        
        // Пустые ячейки перед первым днем месяца
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        for (let i = 0; i < startDay; i++) {
            const prevMonthDay = new Date(firstDay);
            prevMonthDay.setDate(prevMonthDay.getDate() - (startDay - i));
            html += `<div class="month-day other-month">${prevMonthDay.getDate()}</div>`;
        }
        
        // Дни месяца
        const today = new Date();
        const employeesToShow = this.getFilteredEmployees();
        
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const isToday = today.getDate() === day && 
                           today.getMonth() === this.currentDate.getMonth() && 
                           today.getFullYear() === this.currentDate.getFullYear();
            
            html += `<div class="month-day ${isToday ? 'today' : ''}">`;
            html += `<div class="day-number">${day}</div>`;
            
            // Смены на этот день
            employeesToShow.forEach(employee => {
                const shifts = this.scheduleData[employee] || [];
                shifts.forEach(shift => {
                    if (shift.date === day) {
                        const color = this.getEmployeeColor(employee);
                        html += this.renderShift(shift, color, employee);
                    }
                });
            });
            
            html += `</div>`;
        }
        
        html += '</div>';
        monthView.innerHTML = html;
    }

    renderShift(shift, color, employee) {
        const hsl = `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
        return `
            <div class="shift-parallelogram" style="background-color: ${hsl}">
                <div class="shift-content">
                    ${shift.hours > 1 ? shift.hours + 'ч' : ''}
                </div>
            </div>
        `;
    }

    getFilteredEmployees() {
        const allEmployees = Object.keys(this.scheduleData);
        
        if (!this.filterSettings.showOnlyMine || !this.user) {
            return allEmployees;
        }
        
        return allEmployees.filter(employee => 
            this.user.sheetNames && this.user.sheetNames.includes(employee)
        );
    }

    getEmployeeColor(employee) {
        if (this.user && this.user.sheetNames && this.user.sheetNames.includes(employee)) {
            return this.user.color || { h: 200, s: 80, l: 60 };
        }
        
        // Генерация случайного цвета для других сотрудников
        const hash = employee.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        
        return {
            h: Math.abs(hash) % 360,
            s: 60 + Math.abs(hash) % 20,
            l: 50 + Math.abs(hash) % 20
        };
    }

    getDayName(date) {
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        return days[date.getDay()];
    }

    formatDate(date) {
        return date.toLocaleDateString('ru-RU', { 
            day: '2-digit', 
            month: '2-digit' 
        });
    }

    async loadAdminPanel() {
        // Этот метод будет реализован в admin-panel.js
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new ScheduleApp();
});
