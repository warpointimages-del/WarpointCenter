import { firebaseService } from './firebase.js';

class ScheduleApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.scheduleData = {};
        this.user = null;
        this.filterSettings = { showOnlyMine: false };
        this.globalFilterSettings = { showOnlyRegistered: true };
        this.availableMonths = [];
        this.registeredEmployees = []; // Простой массив имен
        
        this.init();
    }

    async init() {
        try {
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            await this.initializeUser();
            await this.loadRegisteredEmployees();
            await this.loadFilterSettings();
            await this.loadGlobalFilterSettings();
            await this.loadAvailableMonths();
            await this.loadScheduleData();
            this.initializeEventListeners();
            this.render();
            
            if (this.user && this.user.isAdmin) {
                this.initializeAdminControls();
            }
            
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            document.getElementById('loading').textContent = 'Ошибка загрузки: ' + error.message;
        }
    }

    async initializeUser() {
        const initData = this.tg.initDataUnsafe;
        const userData = {
            id: initData.user?.id,
            username: initData.user?.username,
            firstName: initData.user?.first_name,
            lastName: initData.user?.last_name,
            isAdmin: initData.user?.id === 1999947340
        };

        if (userData.id) {
            let existingUser = await firebaseService.getUser(userData.id);
            
            if (!existingUser) {
                userData.color = this.generateRandomColor();
                await firebaseService.saveUser(userData);
                existingUser = await firebaseService.getUser(userData.id);
            }
            
            this.user = existingUser;
            
            if (this.user.isAdmin) {
                document.getElementById('admin-panel').classList.remove('hidden');
            }
        }
    }

    async loadRegisteredEmployees() {
        this.registeredEmployees = await firebaseService.getRegisteredEmployees();
        console.log('Зарегистрированные сотрудники:', this.registeredEmployees);
    }

    initializeAdminControls() {
        const globalFilterContainer = document.createElement('div');
        globalFilterContainer.className = 'global-filter';
        globalFilterContainer.innerHTML = `
            <label class="checkbox-container">
                <input type="checkbox" id="show-only-registered" ${this.globalFilterSettings.showOnlyRegistered ? 'checked' : ''}>
                <span class="checkmark"></span>
                Показывать только зарегистрированных сотрудников
            </label>
        `;
        
        document.getElementById('filters-panel').prepend(globalFilterContainer);
        
        document.getElementById('show-only-registered').addEventListener('change', (e) => {
            this.toggleGlobalFilter(e.target.checked);
        });
    }

    async toggleGlobalFilter(showOnlyRegistered) {
        this.globalFilterSettings.showOnlyRegistered = showOnlyRegistered;
        await firebaseService.saveGlobalFilterSettings(this.globalFilterSettings);
        this.render();
    }

    async loadGlobalFilterSettings() {
        this.globalFilterSettings = await firebaseService.getGlobalFilterSettings();
        console.log('Глобальные настройки фильтра:', this.globalFilterSettings);
    }

    async loadAllUsersData() {
        this.usersData = await firebaseService.getAllUsers();
        console.log('Загружены данные пользователей:', this.usersData);
        this.updateRegisteredEmployeesList();
    }

    updateRegisteredEmployeesList() {
        const allEmployees = new Set();
        
        Object.values(this.usersData).forEach(user => {
            if (user.sheetNames && Array.isArray(user.sheetNames)) {
                user.sheetNames.forEach(name => allEmployees.add(name.trim()));
            }
        });
        
        window.registeredEmployees = Array.from(allEmployees);
        console.log('Список зарегистрированных сотрудников:', window.registeredEmployees);
    }

    async loadAvailableMonths() {
        try {
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq`
            );
            
            const text = await response.text();
            const json = JSON.parse(text.substring(47, text.length - 2));
            
            if (json && json.sheets) {
                this.availableMonths = json.sheets.map(sheet => sheet.name).filter(name => {
                    const monthPattern = /^(Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь)\s\d{2}$/;
                    return monthPattern.test(name);
                });
            }
        } catch (error) {
            console.error('Ошибка загрузки списка месяцев:', error);
        }
    }

    async loadScheduleData() {
        try {
            const currentMonthSheet = this.getCurrentMonthSheetName();
            
            if (!this.availableMonths.includes(currentMonthSheet)) {
                console.warn(`Лист "${currentMonthSheet}" не найден. Доступные листы:`, this.availableMonths);
                const nearestMonth = this.findNearestMonth();
                if (nearestMonth) {
                    await this.loadSpecificMonthData(nearestMonth);
                }
                return;
            }
            
            await this.loadSpecificMonthData(currentMonthSheet);
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
        }
    }

    async loadSpecificMonthData(sheetName) {
        try {
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?sheet=${encodeURIComponent(sheetName)}`
            );
            
            const text = await response.text();
            const json = JSON.parse(text.substring(47, text.length - 2));
            
            this.processScheduleData(json, sheetName);
        } catch (error) {
            console.error(`Ошибка загрузки данных для листа ${sheetName}:`, error);
        }
    }

    findNearestMonth() {
        const currentMonth = this.getCurrentMonthSheetName();
        
        const currentIndex = this.availableMonths.indexOf(currentMonth);
        if (currentIndex !== -1) return this.availableMonths[currentIndex];
        
        for (let i = 0; i < this.availableMonths.length; i++) {
            if (this.availableMonths[i] > currentMonth) {
                return this.availableMonths[i];
            }
        }
        
        return this.availableMonths[this.availableMonths.length - 1] || null;
    }

    processScheduleData(data, sheetName) {
        if (!data.table || !data.table.rows) return;
        
        const rows = data.table.rows;
        const dates = [];
        
        if (rows[0] && rows[0].c) {
            for (let i = 1; i < rows[0].c.length; i++) {
                const dateCell = rows[0].c[i];
                if (dateCell && dateCell.v) {
                    dates.push(parseInt(dateCell.v));
                }
            }
        }
        
        this.scheduleData = {};
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.c || !row.c[0] || !row.c[0].v) continue;
            
            const employeeName = row.c[0].v.trim();
            
            const shifts = [];
            for (let j = 1; j < row.c.length; j++) {
                const shiftCell = row.c[j];
                if (shiftCell && shiftCell.v) {
                    const shiftValue = parseFloat(shiftCell.v);
                    if (shiftValue >= 1) {
                        shifts.push({
                            date: dates[j-1],
                            hours: shiftValue,
                            month: sheetName
                        });
                    }
                }
            }
            
            this.scheduleData[employeeName] = shifts;
        }
        
        console.log('Данные графика загружены:', this.scheduleData);
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
        
        const monthSelect = document.getElementById('month-select');
        if (monthSelect) {
            monthSelect.addEventListener('change', (e) => this.changeMonth(e.target.value));
        }
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
        this.loadScheduleData().then(() => this.render());
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

    async changeMonth(monthSheetName) {
        await this.loadSpecificMonthData(monthSheetName);
        
        const [monthName, year] = monthSheetName.split(' ');
        const months = {
            'Январь': 0, 'Февраль': 1, 'Март': 2, 'Апрель': 3, 'Май': 4, 'Июнь': 5,
            'Июль': 6, 'Август': 7, 'Сентябрь': 8, 'Октябрь': 9, 'Ноябрь': 10, 'Декабрь': 11
        };
        
        this.currentDate = new Date(2000 + parseInt(year), months[monthName], 1);
        this.render();
    }

    render() {
        console.log('=== RENDER START ===');
        console.log('Global filter:', this.globalFilterSettings.showOnlyRegistered);
        console.log('My filter:', this.filterSettings.showOnlyMine);
        console.log('User sheetNames:', this.user?.sheetNames);
        
        this.updateNavigation();
        this.renderMonthNavigation();
        
        const employeesToShow = this.getFilteredEmployees();
        console.log('Сотрудники для отображения:', employeesToShow);
        
        if (this.isMonthView) {
            this.renderMonthView();
        } else {
            this.renderWeekView();
        }
        
        console.log('=== RENDER END ===');
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

    renderMonthNavigation() {
        const monthNavigation = document.getElementById('month-navigation');
        const monthSelect = document.getElementById('month-select');
        
        if (!monthNavigation || !monthSelect) return;
        
        if (this.isMonthView) {
            monthNavigation.classList.remove('hidden');
            
            monthSelect.innerHTML = '';
            this.availableMonths.forEach(month => {
                const option = document.createElement('option');
                option.value = month;
                option.textContent = month;
                option.selected = month === this.getCurrentMonthSheetName();
                monthSelect.appendChild(option);
            });
        } else {
            monthNavigation.classList.add('hidden');
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
        
        html += '<div class="week-header"></div>';
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + i);
            html += `<div class="week-header">${this.getDayName(day)}<br>${day.getDate()}</div>`;
        }
        
        const employeesToShow = this.getFilteredEmployees();
        
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
        
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        dayNames.forEach(day => {
            html += `<div class="month-header">${day}</div>`;
        });
        
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        for (let i = 0; i < startDay; i++) {
            const prevMonthDay = new Date(firstDay);
            prevMonthDay.setDate(prevMonthDay.getDate() - (startDay - i));
            html += `<div class="month-day other-month">${prevMonthDay.getDate()}</div>`;
        }
        
        const today = new Date();
        const employeesToShow = this.getFilteredEmployees();
        
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const isToday = today.getDate() === day && 
                           today.getMonth() === this.currentDate.getMonth() && 
                           today.getFullYear() === this.currentDate.getFullYear();
            
            html += `<div class="month-day ${isToday ? 'today' : ''}">`;
            html += `<div class="day-number">${day}</div>`;
            
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
        console.log('Все сотрудники из таблицы:', allEmployees);
        
        // ПРОСТАЯ ГЛОБАЛЬНАЯ ФИЛЬТРАЦИЯ
        if (this.globalFilterSettings.showOnlyRegistered) {
            const filtered = allEmployees.filter(employee => 
                this.registeredEmployees.includes(employee)
            );
            console.log('После фильтрации:', filtered);
            return filtered;
        }
        
        // Если глобальная фильтрация выключена - показываем всех
        console.log('Показываем всех сотрудников');
        return allEmployees;
    }
        
        // Если глобальная фильтрация выключена - показываем всех
        console.log('Глобальная фильтрация выключена, показываем всех');
        if (this.filterSettings.showOnlyMine && this.user && this.user.sheetNames) {
            const mineOnly = allEmployees.filter(employee => 
                this.user.sheetNames.includes(employee.trim())
            );
            console.log('Только мои смены:', mineOnly);
            return mineOnly;
        }
        
        return allEmployees;
    }

    getRegisteredEmployeesFromUsers() {
        // Должны возвращаться ВСЕ имена, привязанные ко ВСЕМ пользователям
        const allEmployees = new Set();
        
        Object.values(this.usersData).forEach(user => {
            if (user.sheetNames && Array.isArray(user.sheetNames)) {
                user.sheetNames.forEach(name => allEmployees.add(name.trim()));
            }
        });
        
        const result = Array.from(allEmployees);
        console.log('Зарегистрированные сотрудники из БД:', result);
        return result;
    }

    getEmployeeColor(employeeName) {
        // Ищем пользователя, у которого привязано это имя сотрудника
        const userWithThisName = Object.values(this.usersData).find(user => 
            user.sheetNames && user.sheetNames.includes(employeeName)
        );
        
        if (userWithThisName && userWithThisName.color) {
            return userWithThisName.color;
        }
        
        return this.generateColorFromName(employeeName);
    }

    generateRandomColor() {
        return {
            h: Math.floor(Math.random() * 360),
            s: 60 + Math.floor(Math.random() * 20),
            l: 50 + Math.floor(Math.random() * 20)
        };
    }

    generateColorFromName(name) {
        const hash = name.split('').reduce((a, b) => {
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

    async loadFilterSettings() {
        if (this.user) {
            this.filterSettings = await firebaseService.getFilterSettings(this.user.id);
            document.getElementById('show-only-mine').checked = this.filterSettings.showOnlyMine;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.scheduleApp = new ScheduleApp();
});
