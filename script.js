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
        this.registeredEmployees = [];
        this.userAttachments = []; // Сотрудники, привязанные к текущему пользователю
        
        this.init();
    }

    async init() {
        try {
            console.log('=== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ===');
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            await this.initializeUser();
            await this.loadRegisteredEmployees();
            await this.loadUserAttachments();
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

    async loadUserAttachments() {
        if (this.user) {
            this.userAttachments = await firebaseService.getUserAttachments(this.user.id);
            console.log('Привязанные сотрудники:', this.userAttachments);
        }
    }

    async loadAvailableMonths() {
        try {
            console.log('Загрузка данных из Google Sheets...');
            
            // Прямой запрос к Google Sheets API для получения данных
            const sheetId = '1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk';
            const apiKey = 'AIzaSyAbLz1MnfjYIQMDkmqgMa09Z3W_j8dnJbM'; // Ваш API ключ
            
            // Получаем информацию о таблице
            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?key=${apiKey}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Данные таблицы:', data);
            
            // Извлекаем названия листов
            if (data.sheets) {
                this.availableMonths = data.sheets.map(sheet => sheet.properties.title)
                    .filter(name => {
                        const monthPattern = /^(Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь)\s\d{2}$/;
                        return monthPattern.test(name);
                    });
                
                console.log('Доступные месяцы:', this.availableMonths);
            } else {
                console.warn('Нет данных о листах');
                this.availableMonths = ['Сентябрь 25'];
            }
            
        } catch (error) {
            console.error('Ошибка загрузки списка месяцев:', error);
            // Fallback на известные листы
            this.availableMonths = ['Сентябрь 25'];
            console.log('Используем fallback листы:', this.availableMonths);
        }
    }

    async loadScheduleData() {
        try {
            const currentMonthSheet = this.getCurrentMonthSheetName();
            console.log('Текущий месяц для поиска:', currentMonthSheet);
            
            if (this.availableMonths.length === 0) {
                console.log('Нет доступных листов, пробуем загрузить текущий напрямую');
                await this.loadSpecificMonthData(currentMonthSheet);
                return;
            }
            
            const normalizedAvailableMonths = this.availableMonths.map(month => month.trim());
            const normalizedCurrentMonth = currentMonthSheet.trim();
            
            if (!normalizedAvailableMonths.includes(normalizedCurrentMonth)) {
                console.warn(`Лист "${currentMonthSheet}" не найден. Пробуем первый доступный лист`);
                await this.loadSpecificMonthData(this.availableMonths[0]);
                return;
            }
            
            await this.loadSpecificMonthData(currentMonthSheet);
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
        }
    }

    async loadSpecificMonthData(sheetName) {
        try {
            console.log(`Загрузка данных для листа: "${sheetName}"`);
            
            const sheetId = '1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk';
            const apiKey = 'AIzaSyAbLz1MnfjYIQMDkmqgMa09Z3W_j8dnJbM';
            
            // Загружаем данные листа
            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Данные листа:', data);
            
            if (!data.values) {
                console.warn('Нет данных в листе');
                return;
            }
            
            this.processScheduleData(data.values, sheetName);
            
        } catch (error) {
            console.error(`Ошибка загрузки данных для листа "${sheetName}":`, error);
            // Пробуем альтернативный метод через gviz/tq
            await this.loadWithGviz(sheetName);
        }
    }

    async loadWithGviz(sheetName) {
        try {
            console.log(`Пробуем альтернативный метод загрузки для: "${sheetName}"`);
            
            const url = `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?sheet=${encodeURIComponent(sheetName)}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error('Invalid JSON response');
            }
            
            const jsonText = text.substring(jsonStart, jsonEnd);
            const data = JSON.parse(jsonText);
            
            this.processGvizData(data, sheetName);
            
        } catch (error) {
            console.error(`Ошибка альтернативного метода:`, error);
            document.getElementById('loading').textContent = `Ошибка загрузки данных: ${error.message}`;
        }
    }

    processScheduleData(values, sheetName) {
        console.log('Обработка данных таблицы:', values);
        
        if (!values || values.length === 0) {
            console.warn('Нет данных в таблице');
            return;
        }
        
        this.scheduleData = {};
        const dates = [];
        
        // Первая строка - даты
        if (values[0]) {
            for (let i = 1; i < values[0].length; i++) {
                const dateValue = values[0][i];
                if (dateValue) {
                    const dateNum = parseInt(dateValue);
                    if (!isNaN(dateNum)) {
                        dates.push(dateNum);
                    }
                }
            }
        }
        
        console.log('Даты в таблице:', dates);
        
        // Остальные строки - сотрудники и смены
        for (let i = 1; i < values.length; i++) {
            const row = values[i];
            if (!row || !row[0]) continue;
            
            const employeeName = row[0].toString().trim();
            if (!employeeName) continue;
            
            const shifts = [];
            for (let j = 1; j < row.length; j++) {
                if (j-1 < dates.length) {
                    const shiftValue = row[j];
                    if (shiftValue) {
                        const hours = parseFloat(shiftValue);
                        if (!isNaN(hours) && hours >= 1) {
                            shifts.push({
                                date: dates[j-1],
                                hours: hours,
                                month: sheetName
                            });
                        }
                    }
                }
            }
            
            if (shifts.length > 0) {
                this.scheduleData[employeeName] = shifts;
                console.log(`Сотрудник: ${employeeName}, смен: ${shifts.length}`);
            }
        }
        
        console.log('Итоговые данные графика:', this.scheduleData);
        
        if (Object.keys(this.scheduleData).length > 0) {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
        }
    }

    processGvizData(data, sheetName) {
        if (!data.table || !data.table.rows) {
            console.warn('Нет данных в таблице gviz');
            return;
        }
        
        const rows = data.table.rows;
        const dates = [];
        
        // Получаем даты из первой строки
        if (rows[0] && rows[0].c) {
            for (let i = 1; i < rows[0].c.length; i++) {
                const dateCell = rows[0].c[i];
                if (dateCell && dateCell.v) {
                    dates.push(parseInt(dateCell.v));
                }
            }
        }
        
        console.log('Даты в таблице gviz:', dates);
        
        this.scheduleData = {};
        
        // Обрабатываем строки с сотрудниками
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.c || !row.c[0] || !row.c[0].v) continue;
            
            const employeeName = row.c[0].v.toString().trim();
            
            const shifts = [];
            for (let j = 1; j < row.c.length; j++) {
                if (j-1 < dates.length) {
                    const shiftCell = row.c[j];
                    if (shiftCell && shiftCell.v !== null) {
                        const shiftValue = parseFloat(shiftCell.v);
                        if (!isNaN(shiftValue) && shiftValue >= 1) {
                            shifts.push({
                                date: dates[j-1],
                                hours: shiftValue,
                                month: sheetName
                            });
                        }
                    }
                }
            }
            
            if (shifts.length > 0) {
                this.scheduleData[employeeName] = shifts;
                console.log(`Сотрудник: ${employeeName}, смен: ${shifts.length}`);
            }
        }
        
        console.log('Итоговые данные графика gviz:', this.scheduleData);
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
        console.log('Глобальная фильтрация:', this.globalFilterSettings.showOnlyRegistered);
        console.log('Моя фильтрация:', this.filterSettings.showOnlyMine);
        console.log('Зарегистрированные сотрудники:', this.registeredEmployees);
        console.log('Привязанные сотрудники:', this.userAttachments);
        console.log('Данные графика:', this.scheduleData);
        
        this.updateNavigation();
        this.renderMonthNavigation();
        
        const employeesToShow = this.getFilteredEmployees();
        console.log('Сотрудники для отображения:', employeesToShow);
        
        if (this.isMonthView) {
            this.renderMonthView(employeesToShow);
        } else {
            this.renderWeekView(employeesToShow);
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
        
        if (this.isMonthView && this.availableMonths.length > 0) {
            monthNavigation.classList.remove('hidden');
            
            monthSelect.innerHTML = '';
            this.availableMonths.forEach(month => {
                const option = document.createElement('option');
                option.value = month;
                option.textContent = month;
                const currentNormalized = this.getCurrentMonthSheetName().trim();
                const monthNormalized = month.trim();
                option.selected = monthNormalized === currentNormalized;
                monthSelect.appendChild(option);
            });
        } else {
            monthNavigation.classList.add('hidden');
        }
    }

    renderWeekView(employeesToShow) {
        const weekView = document.getElementById('week-view');
        const monthView = document.getElementById('month-view');
        
        weekView.classList.remove('hidden');
        monthView.classList.add('hidden');
        
        const weekStart = new Date(this.currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        
        let html = '<div class="calendar-grid">';
        
        // Заголовки дней недели
        html += '<div class="week-header"></div>';
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + i);
            html += `<div class="week-header">${this.getDayName(day)}<br>${day.getDate()}</div>`;
        }
        
        // Строки сотрудников
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
                        html += this.renderShift(shift, color);
                    }
                });
                
                html += `</div>`;
            }
        });
        
        html += '</div>';
        weekView.innerHTML = html;
    }

    renderMonthView(employeesToShow) {
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
                        html += this.renderShift(shift, color);
                    }
                });
            });
            
            html += `</div>`;
        }
        
        html += '</div>';
        monthView.innerHTML = html;
    }

    renderShift(shift, color) {
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
        
        let filtered = allEmployees;
        
        // Применяем глобальную фильтрацию
        if (this.globalFilterSettings.showOnlyRegistered) {
            filtered = filtered.filter(employee => 
                this.registeredEmployees.includes(employee)
            );
            console.log('После глобальной фильтрации:', filtered);
        }
        
        // Применяем персональную фильтрацию
        if (this.filterSettings.showOnlyMine && this.user) {
            filtered = filtered.filter(employee => 
                this.userAttachments.includes(employee)
            );
            console.log('После персональной фильтрации:', filtered);
        }
        
        return filtered;
    }

    getEmployeeColor(employeeName) {
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
            const checkbox = document.getElementById('show-only-mine');
            if (checkbox) {
                checkbox.checked = this.filterSettings.showOnlyMine;
            }
        }
    }

    async loadGlobalFilterSettings() {
        this.globalFilterSettings = await firebaseService.getGlobalFilterSettings();
        console.log('Глобальные настройки фильтра:', this.globalFilterSettings);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.scheduleApp = new ScheduleApp();
});
