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
            
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            console.log('Ответ gviz:', text.substring(0, 500));
            
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error('Invalid JSON response');
            }
            
            const jsonText = text.substring(jsonStart, jsonEnd);
            const data = JSON.parse(jsonText);
            
            console.log('Данные gviz:', data);
            
            if (data.sheets) {
                this.availableMonths = data.sheets.map(sheet => sheet.name).filter(name => {
                    const monthPattern = /^(Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь)\s\d{2}$/;
                    return monthPattern.test(name);
                });
            } else {
                this.availableMonths = this.generateMonthList();
            }
            
            console.log('Найденные листы:', this.availableMonths);
            
        } catch (error) {
            console.error('Ошибка загрузки списка месяцев:', error);
            this.availableMonths = this.generateMonthList();
            console.log('Используем ручной список листов:', this.availableMonths);
        }
    }

    generateMonthList() {
        const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        const currentYear = new Date().getFullYear().toString().slice(2);
        const previousYear = (new Date().getFullYear() - 1).toString().slice(2);
        
        const availableMonths = [];
        
        // Добавляем месяцы за предыдущий и текущий годы
        for (let year of [previousYear, currentYear]) {
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
                        this.currentDate = this.parseDateFromSheetName(month);
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

    parseDateFromSheetName(sheetName) {
        const [monthName, year] = sheetName.split(' ');
        const months = {
            'Январь': 0, 'Февраль': 1, 'Март': 2, 'Апрель': 3, 'Май': 4, 'Июнь': 5,
            'Июль': 6, 'Август': 7, 'Сентябрь': 8, 'Октябрь': 9, 'Ноябрь': 10, 'Декабрь': 11
        };
        
        return new Date(2000 + parseInt(year), months[monthName], 15); // Середина месяца
    }

    async loadSpecificMonthData(sheetName) {
        try {
            console.log(`=== ЗАГРУЗКА ЛИСТА: "${sheetName}" ===`);
            
            // Пробуем CSV метод
            let data = await this.loadViaCSV(sheetName);
            if (data && data.length > 0) {
                console.log('CSV данные получены, строк:', data.length);
                this.processCSVData(data, sheetName);
                return true;
            }
            
            // Пробуем Gviz метод
            data = await this.loadViaGviz(sheetName);
            if (data) {
                console.log('Gviz данные получены');
                this.processGvizData(data, sheetName);
                return true;
            }
            
            console.log(`Не удалось загрузить данные для листа: "${sheetName}"`);
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
            if (!response.ok) {
                console.log('CSV response not OK:', response.status);
                return null;
            }
            
            const csvText = await response.text();
            console.log('CSV данные (полные):', csvText);
            
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
        // УЛУЧШЕННЫЙ ПАРСИНГ CSV - учитываем что даты могут быть в первой строке
        const cells = [];
        let currentCell = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                cells.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        
        cells.push(currentCell.trim());
        
        // Убираем окружающие кавычки и очищаем ячейки
        const cleanedCells = cells.map(cell => {
            // Убираем кавычки в начале и конце
            let cleaned = cell.replace(/^"|"$/g, '');
            // Убираем лишние пробелы
            cleaned = cleaned.trim();
            return cleaned;
        });
        
        result.push(cleanedCells);
    }
    
    console.log('Парсинг CSV результат:', result);
    return result;
}

    async loadViaGviz(sheetName) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?sheet=${encodeURIComponent(sheetName)}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                console.log('Gviz response not OK:', response.status);
                return null;
            }
            
            const text = await response.text();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === -1) {
                console.log('Invalid JSON in gviz response');
                return null;
            }
            
            const jsonText = text.substring(jsonStart, jsonEnd);
            return JSON.parse(jsonText);
        } catch (error) {
            console.error('Ошибка Gviz загрузки:', error);
            return null;
        }
    }

processCSVData(data, sheetName) {
    console.log('=== ОБРАБОТКА CSV ДАННЫХ ===');
    console.log('Все данные:', data);
    
    // ОТЛАДКА: покажем все строки
    console.log('=== ВСЕ СТРОКИ ДЛЯ ОТЛАДКИ ===');
    for (let i = 0; i < data.length; i++) {
        console.log(`Строка ${i} (${data[i]?.length} колонок):`, data[i]);
    }
    
    if (!data || data.length === 0) {
        console.warn('Нет CSV данных');
        return;
    }
    
    this.scheduleData = {};
    
    // Ищем строку с числами 1,2,3... - УБИРАЕМ ПРОВЕРКУ НА КОЛИЧЕСТВО СТОЛБЦОВ!
    const dateRowIndex = this.findCorrectDateRow(data);
    console.log('Найдена строка с датами:', dateRowIndex);
    
    if (dateRowIndex === -1) {
        console.warn('Не удалось найти строку с датами');
        return;
    }
    
    const dateRow = data[dateRowIndex];
    const dates = this.extractCorrectDates(dateRow);
    console.log('Извлеченные даты:', dates);
    
    if (dates.length === 0) {
        console.warn('Не найдено дат в строке');
        return;
    }
    
    // Все строки ниже - сотрудники
    for (let i = dateRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        const employeeName = this.extractEmployeeName(row[0]); 
        if (!employeeName) continue;
        
        console.log(`Обрабатываем сотрудника: "${employeeName}"`);
        
        const shifts = [];
        for (let j = 1; j < row.length; j++) {
            const dateIndex = j - 1;
            if (dateIndex < dates.length) {
                const shiftValue = row[j];
                if (shiftValue && shiftValue.trim()) {
                    const hours = this.parseHours(shiftValue);
                    if (hours !== null && hours >= 1) {
                        shifts.push({
                            date: dates[dateIndex],
                            hours: hours,
                            month: sheetName
                        });
                        console.log(`Найдена смена: ${dates[dateIndex]} число - ${hours}ч`);
                    }
                }
            }
        }
        
        if (shifts.length > 0) {
            this.scheduleData[employeeName] = shifts;
        }
    }
    
    console.log('Итоговые данные графика:', this.scheduleData);
    
    if (Object.keys(this.scheduleData).length > 0) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
    }
}

findCorrectDateRow(data) {
    // ПРОВЕРЯЕМ ВСЕ СТРОКИ С НАЧАЛА БЕЗ ЛЮБЫХ ОГРАНИЧЕНИЙ!
    for (let rowIndex = 0; rowIndex < Math.min(10, data.length); rowIndex++) {
        const row = data[rowIndex];
        if (!row || row.length === 0) {
            console.log(`Строка ${rowIndex}: пропускаем - пустая строка`);
            continue;
        }
        
        console.log(`=== ПРОВЕРЯЕМ СТРОКУ ${rowIndex} (${row.length} колонок):`, row);
        
        // Ищем последовательность 1,2,3,4,... в ЛЮБОМ месте строки
        const sequence = this.findSequenceAnywhere(row);
        console.log(`Найдена последовательность в строке ${rowIndex}:`, sequence);
        
        // Если нашли хорошую последовательность (хотя бы до 10)
        if (sequence.length >= 10) {
            console.log(`✅ НАЙДЕНА ПРАВИЛЬНАЯ СТРОКА С ДАТАМИ: строка ${rowIndex}`);
            return rowIndex;
        }
    }
    
    console.log('❌ Не найдено строк с правильной последовательностью дат');
    return -1;
}

findSequenceAnywhere(row) {
    const sequence = [];
    
    // Ищем последовательность чисел в ЛЮБОМ месте строки
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const number = this.extractDateNumber(row[colIndex]);
        
        if (number === 1) {
            // Нашли начало последовательности
            console.log(`Найдено число 1 в столбце ${colIndex}`);
            sequence.push(1);
            let expectedNumber = 2;
            
            // Проверяем следующие числа
            for (let nextCol = colIndex + 1; nextCol < Math.min(colIndex + 31, row.length); nextCol++) {
                const nextNumber = this.extractDateNumber(row[nextCol]);
                
                if (nextNumber === expectedNumber) {
                    sequence.push(nextNumber);
                    expectedNumber++;
                    console.log(`Добавлено число ${nextNumber} в последовательность`);
                } else if (nextNumber !== null) {
                    // Если нашли другое число - прерываем
                    console.log(`Найдено другое число ${nextNumber}, ожидали ${expectedNumber} - прерываем`);
                    break;
                } else {
                    // Если пустая ячейка - продолжаем (может быть пропуск)
                    console.log(`Пустая ячейка в столбце ${nextCol} - продолжаем`);
                    expectedNumber++;
                }
            }
            break; // Нашли последовательность, выходим
        }
    }
    
    return sequence;
}

extractCorrectDates(dateRow) {
    const dates = [];
    
    // Находим начало последовательности в строке
    for (let colIndex = 0; colIndex < dateRow.length; colIndex++) {
        const number = this.extractDateNumber(dateRow[colIndex]);
        if (number === 1) {
            // Извлекаем последовательность начиная с этого столбца
            let expectedNumber = 1;
            for (let j = colIndex; j < Math.min(colIndex + 28, dateRow.length); j++) {
                const num = this.extractDateNumber(dateRow[j]);
                if (num === expectedNumber) {
                    dates.push(num);
                    expectedNumber++;
                } else {
                    break;
                }
            }
            break;
        }
    }
    
    return dates;
}

extractDateNumber(value) {
    if (!value) return null;
    
    const str = value.toString().trim();
    
    // Прямое число
    const num = parseInt(str);
    if (!isNaN(num) && num >= 1 && num <= 31) {
        return num;
    }
    
    return null;
}

    extractEmployeeName(value) {
        if (!value) return null;
        
        const str = value.toString().trim();
        
        // Пропускаем пустые строки и явно не-имена
        if (!str || str === '' || str === 'ФИО' || str === 'Сотрудник' || 
            str === '- Управляющий:' || str.includes('Смена') ||
            this.extractDateNumber(str) !== null) {
            return null;
        }
        
        // Убираем лишние пробелы и возвращаем
        return str.replace(/\s+/g, ' ').trim();
    }

    parseHours(value) {
        if (!value) return null;
        
        const str = value.toString().trim();
        
        // Прямое число
        const num = parseFloat(str);
        if (!isNaN(num)) {
            return num;
        }
        
        // Число с запятой
        const numWithComma = parseFloat(str.replace(',', '.'));
        if (!isNaN(numWithComma)) {
            return numWithComma;
        }
        
        // Формат "8ч", "8 часов"
        const hourMatch = str.match(/(\d+[,.]?\d*)\s*(ч|час|часов)?/);
        if (hourMatch) {
            const hourNum = parseFloat(hourMatch[1].replace(',', '.'));
            if (!isNaN(hourNum)) {
                return hourNum;
            }
        }
        
        // Формат времени "10:30 - 20:00"
        const timeMatch = str.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/);
        if (timeMatch) {
            const startHours = parseInt(timeMatch[1]);
            const startMinutes = parseInt(timeMatch[2]);
            const endHours = parseInt(timeMatch[3]);
            const endMinutes = parseInt(timeMatch[4]);
            
            const totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
            if (totalMinutes > 0) {
                return totalMinutes / 60; // Конвертируем минуты в часы
            }
        }
        
        return null;
    }

    processGvizData(data, sheetName) {
        console.log('=== ОБРАБОТКА GVIZ ДАННЫХ ===');
        
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
                if (dateCell && dateCell.v !== null) {
                    const dateNum = this.extractDateNumber(dateCell.v.toString());
                    if (dateNum !== null) {
                        dates.push(dateNum);
                    }
                }
            }
        }
        
        console.log('Даты в таблице gviz:', dates);
        
        this.scheduleData = {};
        
        // Обрабатываем строки с сотрудниками
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.c || !row.c[0] || row.c[0].v === null) continue;
            
            const employeeName = this.extractEmployeeName(row.c[0].v.toString());
            if (!employeeName) continue;
            
            console.log(`Обрабатываем сотрудника Gviz: "${employeeName}"`);
            
            const shifts = [];
            for (let j = 1; j < row.c.length; j++) {
                if (j-1 < dates.length) {
                    const shiftCell = row.c[j];
                    if (shiftCell && shiftCell.v !== null) {
                        const hours = this.parseHours(shiftCell.v.toString());
                        if (hours !== null && hours >= 1) {
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
                console.log(`Сотрудник Gviz: ${employeeName}, смен: ${shifts.length}`);
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

    // Остальные методы без изменений...
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
        this.currentDate = this.parseDateFromSheetName(monthSheetName);
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
                const hasData = Object.keys(this.scheduleData).length > 0;
                
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
        
        if (this.globalFilterSettings.showOnlyRegistered) {
            filtered = filtered.filter(employee => 
                this.registeredEmployees.includes(employee)
            );
            console.log('После глобальной фильтрации:', filtered);
        }
        
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
