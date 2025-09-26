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
        this.userAttachments = [];
        
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
            console.log('Загрузка списка листов через gviz...');
            
            // Пробуем получить информацию о листах через gviz
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            console.log('Ответ gviz:', text.substring(0, 500));
            
            // Парсим JSON из ответа
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error('Invalid JSON response');
            }
            
            const jsonText = text.substring(jsonStart, jsonEnd);
            const data = JSON.parse(jsonText);
            
            console.log('Данные gviz:', data);
            
            // Пробуем извлечь названия листов разными способами
            if (data.sheets) {
                this.availableMonths = data.sheets.map(sheet => sheet.name).filter(name => {
                    const monthPattern = /^(Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь)\s\d{2}$/;
                    return monthPattern.test(name);
                });
            } else {
                // Если нет данных о листах, используем ручной список
                this.availableMonths = this.generateMonthList();
            }
            
            console.log('Найденные листы:', this.availableMonths);
            
        } catch (error) {
            console.error('Ошибка загрузки списка месяцев:', error);
            // Используем ручной список месяцев
            this.availableMonths = this.generateMonthList();
            console.log('Используем ручной список листов:', this.availableMonths);
        }
    }

    generateMonthList() {
        const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        const currentYear = new Date().getFullYear().toString().slice(2);
        const previousYear = (new Date().getFullYear() - 1).toString().slice(2);
        const nextYear = (new Date().getFullYear() + 1).toString().slice(2);
        
        const availableMonths = [];
        
        // Добавляем месяцы за предыдущий, текущий и следующий годы
        for (let year of [previousYear, currentYear, nextYear]) {
            for (let month of months) {
                availableMonths.push(`${month} ${year}`);
            }
        }
        
        return availableMonths;
    }

    async loadScheduleData() {
        try {
            const currentMonthSheet = this.getCurrentMonthSheetName();
            console.log('Текущий месяц для поиска:', currentMonthSheet);
            console.log('Доступные листы:', this.availableMonths);
            
            // Пробуем загрузить текущий месяц
            let loaded = await this.loadSpecificMonthData(currentMonthSheet);
            
            // Если не удалось, пробуем найти подходящий лист
            if (!loaded && this.availableMonths.length > 0) {
                for (let month of this.availableMonths) {
                    console.log('Пробуем загрузить:', month);
                    loaded = await this.loadSpecificMonthData(month);
                    if (loaded) {
                        console.log('Успешно загружен лист:', month);
                        break;
                    }
                }
            }
            
            if (!loaded) {
                console.warn('Не удалось загрузить данные ни для одного листа');
                document.getElementById('loading').textContent = 'Не удалось загрузить данные графика';
            }
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            document.getElementById('loading').textContent = 'Ошибка загрузки: ' + error.message;
        }
    }

    async loadSpecificMonthData(sheetName) {
        try {
            console.log(`Загрузка данных для листа: "${sheetName}"`);
            
            // Пробуем несколько методов загрузки
            
            // Метод 1: CSV экспорт (самый надежный для публичных таблиц)
            let data = await this.loadViaCSV(sheetName);
            if (data) {
                this.processCSVData(data, sheetName);
                return true;
            }
            
            // Метод 2: Gviz
            data = await this.loadViaGviz(sheetName);
            if (data) {
                this.processGvizData(data, sheetName);
                return true;
            }
            
            // Метод 3: HTML парсинг (fallback)
            data = await this.loadViaHTML(sheetName);
            if (data) {
                this.processHTMLData(data, sheetName);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error(`Ошибка загрузки данных для листа "${sheetName}":`, error);
            return false;
        }
    }

    async loadViaCSV(sheetName) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            console.log('CSV URL:', url);
            
            const response = await fetch(url);
            if (!response.ok) return null;
            
            const csvText = await response.text();
            console.log('CSV данные (первые 500 символов):', csvText.substring(0, 500));
            
            return this.parseCSV(csvText);
        } catch (error) {
            console.error('Ошибка CSV загрузки:', error);
            return null;
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        const result = [];
        
        for (let line of lines) {
            // Простой парсинг CSV (для более сложных случаев нужна библиотека)
            const cells = line.split(',').map(cell => {
                // Убираем кавычки если есть
                cell = cell.trim();
                if (cell.startsWith('"') && cell.endsWith('"')) {
                    cell = cell.slice(1, -1);
                }
                return cell;
            });
            result.push(cells);
        }
        
        return result;
    }

    async loadViaGviz(sheetName) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?sheet=${encodeURIComponent(sheetName)}`;
            const response = await fetch(url);
            
            if (!response.ok) return null;
            
            const text = await response.text();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === -1) return null;
            
            const jsonText = text.substring(jsonStart, jsonEnd);
            return JSON.parse(jsonText);
        } catch (error) {
            console.error('Ошибка Gviz загрузки:', error);
            return null;
        }
    }

    async loadViaHTML(sheetName) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/edit#gid=0`;
            const response = await fetch(url);
            if (!response.ok) return null;
            
            const html = await response.text();
            // Здесь нужно было бы парсить HTML, но это сложно из-за CORS
            return null;
        } catch (error) {
            return null;
        }
    }

    processCSVData(data, sheetName) {
        console.log('Обработка CSV данных:', data);
        
        if (!data || data.length === 0) {
            console.warn('Нет CSV данных');
            return;
        }
        
        this.scheduleData = {};
        const dates = [];
        
        // Первая строка - даты (пропускаем первую ячейку с заголовком)
        if (data[0]) {
            for (let i = 1; i < data[0].length; i++) {
                const dateValue = data[0][i];
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
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;
            
            const employeeName = row[0].toString().trim();
            if (!employeeName) continue;
            
            const shifts = [];
            for (let j = 1; j < row.length; j++) {
                if (j-1 < dates.length) {
                    const shiftValue = row[j];
                    if (shiftValue && shiftValue.trim()) {
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

    processHTMLData(data, sheetName) {
        // Резервный метод если другие не сработают
        console.log('HTML данные:', data);
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
                
                // Проверяем, есть ли данные для этого месяца
                const hasData = Object.keys(this.scheduleData).length > 0 && 
                              Object.values(this.scheduleData).some(shifts => 
                                  shifts.some(shift => shift.month === month)
                              );
                
                if (hasData) {
                    option.style.fontWeight = 'bold';
                }
                
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
                const dayShifts = shifts.filter(shift => shift.date === dayNumber);
                
                dayShifts.forEach(shift => {
                    const color = this.getEmployeeColor(employee);
                    html += this.renderShift(shift, color);
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
            html += `<div class="month-day other-month"></div>`;
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
                const dayShifts = shifts.filter(shift => shift.date === day);
                
                dayShifts.forEach(shift => {
                    const color = this.getEmployeeColor(employee);
                    html += this.renderShift(shift, color);
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
