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
        this.allUsers = {};
        this.allAttachments = {};
        this.showColorPicker = false;
        this.weekData = {}; // Отдельное хранилище для недельных данных
        
        this.init();
    }

    async init() {
        try {
            console.log('=== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ===');
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            await this.initializeUser();
            await this.loadAllUsers();
            await this.loadAllAttachments();
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

    async loadAllUsers() {
        this.allUsers = await firebaseService.getAllUsers();
        console.log('Все пользователи:', this.allUsers);
    }

    async loadAllAttachments() {
        this.allAttachments = await firebaseService.getAllAttachments();
        console.log('Все привязки:', this.allAttachments);
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
            
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error('Invalid JSON response');
            }
            
            const jsonText = text.substring(jsonStart, jsonEnd);
            const data = JSON.parse(jsonText);
            
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
        }
    }

    generateMonthList() {
        const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        const currentYear = new Date().getFullYear().toString().slice(2);
        const previousYear = (new Date().getFullYear() - 1).toString().slice(2);
        
        const availableMonths = [];
        
        for (let year of [previousYear, currentYear]) {
            for (let month of months) {
                availableMonths.push(`${month} ${year}`);
            }
        }
        
        return availableMonths;
    }

    async loadScheduleData() {
        try {
            if (this.isMonthView) {
                // Для месячного вида загружаем только текущий месяц
                await this.loadMonthData();
            } else {
                // Для недельного вида загружаем все месяцы недели
                await this.loadWeekData();
            }
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.showNoDataMessage();
        }
    }

    async loadMonthData() {
        const currentMonthSheet = this.getCurrentMonthSheetName();
        console.log('Загружаем месяц:', currentMonthSheet);
        
        this.scheduleData = {};
        const loaded = await this.loadSpecificMonthData(currentMonthSheet);
        if (!loaded) {
            this.showNoDataMessage();
        }
    }

    async loadWeekData() {
        console.log('=== ЗАГРУЗКА ДАННЫХ ДЛЯ НЕДЕЛИ ===');
        
        const weekStart = new Date(this.currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        console.log('Неделя с', this.formatDate(weekStart), 'по', this.formatDate(weekEnd));
        
        // Собираем уникальные месяцы на неделе
        const monthsInWeek = new Set();
        const currentDay = new Date(weekStart);
        
        while (currentDay <= weekEnd) {
            const monthSheet = this.getMonthSheetNameForDate(currentDay);
            monthsInWeek.add(monthSheet);
            currentDay.setDate(currentDay.getDate() + 1);
        }
        
        console.log('Месяцы на неделе:', Array.from(monthsInWeek));
        
        // Загружаем данные для каждого месяца и объединяем их
        this.weekData = {};
        let anyDataLoaded = false;
        
        for (let monthSheet of monthsInWeek) {
            console.log(`Загружаем данные для: ${monthSheet}`);
            const monthData = await this.loadSpecificMonthData(monthSheet, false);
            if (monthData && Object.keys(monthData).length > 0) {
                anyDataLoaded = true;
                // Объединяем данные месяца в общий weekData
                for (const [employee, shifts] of Object.entries(monthData)) {
                    if (!this.weekData[employee]) {
                        this.weekData[employee] = [];
                    }
                    this.weekData[employee].push(...shifts);
                }
            }
        }
        
        console.log('Объединенные данные недели:', this.weekData);
        
        if (!anyDataLoaded) {
            this.showNoDataMessage();
        }
    }

    showNoDataMessage() {
        const container = this.isMonthView ? 
            document.getElementById('month-view') : 
            document.getElementById('week-view');
        
        if (container) {
            container.innerHTML = '<div class="no-data-message">Нет данных для отображения</div>';
        }
    }

    getMonthSheetNameForDate(date) {
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        
        const month = months[date.getMonth()];
        const year = date.getFullYear().toString().slice(2);
        
        return `${month} ${year}`;
    }

    parseDateFromSheetName(sheetName) {
        const [monthName, year] = sheetName.split(' ');
        const months = {
            'Январь': 0, 'Февраль': 1, 'Март': 2, 'Апрель': 3, 'Май': 4, 'Июнь': 5,
            'Июль': 6, 'Август': 7, 'Сентябрь': 8, 'Октябрь': 9, 'Ноябрь': 10, 'Декабрь': 11
        };
        
        return new Date(2000 + parseInt(year), months[monthName], 15);
    }

    async loadSpecificMonthData(sheetName, mergeToScheduleData = true) {
        try {
            console.log(`=== ЗАГРУЗКА ЛИСТА: "${sheetName}" ===`);
            
            // Пробуем разные методы в порядке приоритета
            let data = await this.loadViaGviz(sheetName);
            if (data) {
                console.log('Gviz данные получены');
                const monthData = this.processGvizData(data, sheetName);
                if (Object.keys(monthData).length > 0) {
                    if (mergeToScheduleData) {
                        this.scheduleData = { ...this.scheduleData, ...monthData };
                    }
                    return monthData;
                }
            }
            
            // Если Gviz не сработал, пробуем CSV
            data = await this.loadViaCSV(sheetName);
            if (data && data.length > 0) {
                console.log('CSV данные получены, строк:', data.length);
                const monthData = this.processCSVData(data, sheetName);
                if (Object.keys(monthData).length > 0) {
                    if (mergeToScheduleData) {
                        this.scheduleData = { ...this.scheduleData, ...monthData };
                    }
                    return monthData;
                }
            }
            
            console.log(`Не удалось загрузить данные для листа: "${sheetName}"`);
            return null;
            
        } catch (error) {
            console.error(`Ошибка загрузки данных для листа "${sheetName}":`, error);
            return null;
        }
    }

    async loadViaCSV(sheetName) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                return null;
            }
            
            const csvText = await response.text();
            console.log('CSV данные (первые 500 символов):', csvText.substring(0, 500));
            return this.parseCSV(csvText);
        } catch (error) {
            console.error('Ошибка CSV загрузки:', error);
            return null;
        }
    }

    parseCSV(csvText) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let row = [];
        
        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Экранированная кавычка внутри кавычек
                    current += '"';
                    i++; // Пропускаем следующую кавычку
                } else {
                    // Начало или конец кавычек
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Конец ячейки
                row.push(current.trim());
                current = '';
            } else if (char === '\n' && !inQuotes) {
                // Конец строки
                row.push(current.trim());
                result.push(row);
                row = [];
                current = '';
            } else if (char === '\r') {
                // Игнорируем carriage return
                continue;
            } else {
                current += char;
            }
        }
        
        // Добавляем последнюю ячейку если есть
        if (current.trim() || row.length > 0) {
            row.push(current.trim());
            result.push(row);
        }
        
        console.log('Парсинг CSV результат:', result);
        return result;
    }

    async loadViaGviz(sheetName) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?sheet=${encodeURIComponent(sheetName)}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                return null;
            }
            
            const text = await response.text();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === -1) {
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
        if (!data || data.length === 0) {
            return {};
        }
        
        const monthData = {};
        
        console.log('Обрабатываем CSV данные:', data);
        
        // Ищем строку с последовательностью чисел от 1 до 28
        const dateRowIndex = this.findDateRowBySequence(data);
        if (dateRowIndex === -1) {
            console.log('Не найдена строка с датами');
            return {};
        }
        
        const dateRow = data[dateRowIndex];
        const dates = this.extractDatesFromRow(dateRow);
        if (dates.length === 0) {
            console.log('Не найдены даты в строке');
            return {};
        }
        
        console.log(`Найдены даты: ${dates.join(', ')}`);
        
        // Все строки ниже - сотрудники
        const startRow = dateRowIndex + 1;
        for (let i = startRow; i < data.length; i++) {
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
                        console.log(`Ячейка [${i},${j}]: дата ${dates[dateIndex]}, значение "${shiftValue}"`);
                        
                        const hours = this.parseHours(shiftValue);
                        console.log(`Результат парсинга: ${hours}`);
                        
                        if (hours !== null && hours >= 0.5) { // Минимум 0.5 часа
                            shifts.push({
                                date: dates[dateIndex],
                                hours: hours,
                                month: sheetName
                            });
                            console.log(`✓ Добавлена смена: ${dates[dateIndex]} число - ${hours}ч`);
                        } else {
                            console.log(`✗ Пропущена смена: ${dates[dateIndex]} число - невалидные часы`);
                        }
                    }
                }
            }
            
            if (shifts.length > 0) {
                monthData[employeeName] = shifts;
                console.log(`✅ Сотрудник "${employeeName}": ${shifts.length} смен`);
            } else {
                console.log(`❌ Сотрудник "${employeeName}": нет валидных смен`);
            }
        }
        
        console.log(`Итог по листу ${sheetName}: ${Object.keys(monthData).length} сотрудников`);
        return monthData;
    }

    findDateRowBySequence(data) {
        const targetSequence = Array.from({length: 28}, (_, i) => i + 1);
        
        for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
            const row = data[rowIndex];
            if (!row) continue;
            
            // Собираем все числа из строки
            const numbersInRow = [];
            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                const number = this.extractDateNumber(row[colIndex]);
                if (number !== null) {
                    numbersInRow.push(number);
                }
            }
            
            // Проверяем, содержит ли строка последовательность от 1 до 28
            if (this.containsSequence(numbersInRow, targetSequence)) {
                console.log(`✅ Найдена строка с датами: строка ${rowIndex}`);
                return rowIndex;
            }
        }
        
        console.log('❌ Не найдено строк с правильной последовательностью дат');
        return -1;
    }

    containsSequence(numbers, targetSequence) {
        if (numbers.length < targetSequence.length) return false;
        
        // Ищем подпоследовательность targetSequence в numbers
        for (let i = 0; i <= numbers.length - targetSequence.length; i++) {
            let match = true;
            for (let j = 0; j < targetSequence.length; j++) {
                if (numbers[i + j] !== targetSequence[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        return false;
    }

    extractDatesFromRow(dateRow) {
        const dates = [];
        let expectedNumber = 1;
        
        for (let colIndex = 0; colIndex < dateRow.length; colIndex++) {
            const number = this.extractDateNumber(dateRow[colIndex]);
            
            if (number === expectedNumber) {
                dates.push(number);
                expectedNumber++;
            } else if (number !== null && number > expectedNumber) {
                // Если пропущены числа, добавляем их
                while (expectedNumber <= number) {
                    dates.push(expectedNumber);
                    expectedNumber++;
                }
            }
        }
        
        return dates;
    }

    extractDateNumber(value) {
        if (!value) return null;
        
        const str = value.toString().trim();
        const num = parseInt(str);
        if (!isNaN(num) && num >= 1 && num <= 31) {
            return num;
        }
        
        return null;
    }

    extractEmployeeName(value) {
        if (!value) return null;
        
        const str = value.toString().trim();
        
        if (!str || str === '' || str === 'ФИО' || str === 'Сотрудник' || 
            str === '- Управляющий:' || str.includes('Смена') ||
            this.extractDateNumber(str) !== null) {
            return null;
        }
        
        return str.replace(/\s+/g, ' ').trim();
    }

    parseHours(value) {
        if (!value) return null;
        
        const str = value.toString().trim().toLowerCase();
        
        console.log(`Парсим значение: "${str}"`);
        
        // Сначала проверяем специальные текстовые значения
        if (str === 'полсмены' || str === 'половина смены' || str === 'пол смены') {
            return 4; // полсмены = 4 часа
        }
        
        if (str === 'целая смена' || str === 'полная смена' || str === 'смена') {
            return 8; // полная смена = 8 часов
        }
        
        // Пробуем разные числовые форматы по приоритету
        
        // 1. Просто число с точкой "1.5"
        const numWithDot = parseFloat(str);
        if (!isNaN(numWithDot) && numWithDot > 0) {
            console.log(`Распознано как число с точкой: ${numWithDot}`);
            return numWithDot;
        }
        
        // 2. Число с запятой "1,5" - заменяем запятую на точку
        if (str.includes(',')) {
            const normalizedStr = str.replace(',', '.');
            const numWithComma = parseFloat(normalizedStr);
            if (!isNaN(numWithComma) && numWithComma > 0) {
                console.log(`Распознано как число с запятой: ${numWithComma}`);
                return numWithComma;
            }
        }
        
        // 3. Дробь вида "1 1/2" или "3/4"
        const fractionMatch = str.match(/(\d+)\s+(\d+)\/(\d+)/) || str.match(/(\d+)\/(\d+)/);
        if (fractionMatch) {
            let whole = 0;
            let numerator, denominator;
            
            if (fractionMatch[3]) {
                // формат "1 1/2"
                whole = parseInt(fractionMatch[1]);
                numerator = parseInt(fractionMatch[2]);
                denominator = parseInt(fractionMatch[3]);
            } else {
                // формат "1/2"
                numerator = parseInt(fractionMatch[1]);
                denominator = parseInt(fractionMatch[2]);
            }
            
            if (denominator !== 0) {
                const result = whole + (numerator / denominator);
                console.log(`Распознано как дробь: ${result}`);
                return result;
            }
        }
        
        // 4. Число с указанием часов "1.5ч", "2 часа", "3часа"
        const hourMatch = str.match(/(\d+[,.]?\d*)\s*(ч|час|часов|часа)/);
        if (hourMatch) {
            let hourStr = hourMatch[1].replace(',', '.');
            const num = parseFloat(hourStr);
            if (!isNaN(num) && num > 0) {
                console.log(`Распознано как число с указанием часов: ${num}`);
                return num;
            }
        }
        
        // 5. Время в формате "10:00-18:00" или "9:00 - 17:30"
        const timeMatch = str.match(/(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)/);
        if (timeMatch) {
            const startHours = parseInt(timeMatch[1]);
            const startMinutes = parseInt(timeMatch[2]);
            const endHours = parseInt(timeMatch[3]);
            const endMinutes = parseInt(timeMatch[4]);
            
            const totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
            if (totalMinutes > 0) {
                const result = totalMinutes / 60;
                console.log(`Распознано как интервал времени: ${result}`);
                return result;
            }
        }
        
        // 6. Просто число без указания единиц (последняя попытка)
        const simpleNum = parseFloat(str);
        if (!isNaN(simpleNum) && simpleNum > 0 && simpleNum <= 24) {
            console.log(`Распознано как простое число: ${simpleNum}`);
            return simpleNum;
        }
        
        console.log(`Не удалось распознать часы из: "${str}"`);
        return null;
    }

    processGvizData(data, sheetName) {
        if (!data.table || !data.table.rows) {
            return {};
        }
        
        const rows = data.table.rows;
        const dates = [];
        const monthData = {};
        
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
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.c || !row.c[0] || row.c[0].v === null) continue;
            
            const employeeName = this.extractEmployeeName(row.c[0].v.toString());
            if (!employeeName) continue;
            
            const shifts = [];
            for (let j = 1; j < row.c.length; j++) {
                if (j-1 < dates.length) {
                    const shiftCell = row.c[j];
                    if (shiftCell && shiftCell.v !== null) {
                        const hours = this.parseHours(shiftCell.v.toString());
                        if (hours !== null && hours >= 0.5) { // Минимум 0.5 часа
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
                monthData[employeeName] = shifts;
            }
        }
        
        return monthData;
    }

    getCurrentMonthSheetName() {
        return this.getMonthSheetNameForDate(this.currentDate);
    }

    // ... остальные методы без изменений (initializeEventListeners, initializeAdminControls, и т.д.)
    // Полный код продолжается как в предыдущей версии...

    initializeEventListeners() {
        document.getElementById('prev-week').addEventListener('click', () => this.changeWeek(-1));
        document.getElementById('next-week').addEventListener('click', () => this.changeWeek(1));
        document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
        document.getElementById('show-only-mine').addEventListener('change', (e) => this.toggleFilter(e.target.checked));
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
        this.loadScheduleData().then(() => this.render());
    }

    async toggleFilter(showOnlyMine) {
        this.filterSettings.showOnlyMine = showOnlyMine;
        if (this.user) {
            await firebaseService.saveFilterSettings(this.user.id, this.filterSettings);
        }
        this.render();
    }

    render() {
        console.log('=== RENDER START ===');
        
        this.updateNavigation();
        this.renderColorPicker();
        
        const employeesToShow = this.getFilteredEmployees();
        
        if (this.isMonthView) {
            this.renderMonthView(employeesToShow);
        } else {
            this.renderWeekView(employeesToShow);
        }
    }

    renderColorPicker() {
        const filtersPanel = document.getElementById('filters-panel');
        
        // Удаляем старый цветовой пикер если есть
        const oldPicker = document.getElementById('color-picker');
        if (oldPicker) {
            oldPicker.remove();
        }
        
        if (!this.user) return;
        
        const colorPicker = document.createElement('div');
        colorPicker.id = 'color-picker';
        colorPicker.className = 'color-picker';
        
        const userColor = this.user.color || { h: 200, s: 80, l: 60 };
        const hslColor = `hsl(${userColor.h}, ${userColor.s}%, ${userColor.l}%)`;
        
        colorPicker.innerHTML = `
            <div class="color-picker-header">
                <span>Цвет ваших смен в графике</span>
                <button id="toggle-color-picker" class="toggle-color-btn">
                    ${this.showColorPicker ? '▲' : '▼'}
                </button>
            </div>
            <div class="color-preview" style="background-color: ${hslColor}; margin: 5px 0; height: 20px; border: 1px solid #555;"></div>
            <div class="color-controls" style="${this.showColorPicker ? '' : 'display: none;'}">
                <div class="slider-container">
                    <span>H</span>
                    <input type="range" min="0" max="360" value="${userColor.h}" class="hue-slider">
                    <span>${userColor.h}</span>
                </div>
                <div class="slider-container">
                    <span>S</span>
                    <input type="range" min="0" max="100" value="${userColor.s}" class="saturation-slider">
                    <span>${userColor.s}%</span>
                </div>
                <div class="slider-container">
                    <span>L</span>
                    <input type="range" min="0" max="100" value="${userColor.l}" class="lightness-slider">
                    <span>${userColor.l}%</span>
                </div>
            </div>
        `;
        
        filtersPanel.appendChild(colorPicker);
        
        // Обработчики событий
        document.getElementById('toggle-color-picker').addEventListener('click', () => {
            this.showColorPicker = !this.showColorPicker;
            this.renderColorPicker();
        });
        
        const hueSlider = colorPicker.querySelector('.hue-slider');
        const saturationSlider = colorPicker.querySelector('.saturation-slider');
        const lightnessSlider = colorPicker.querySelector('.lightness-slider');
        
        const updateColor = () => {
            const newColor = {
                h: parseInt(hueSlider.value),
                s: parseInt(saturationSlider.value),
                l: parseInt(lightnessSlider.value)
            };
            
            // Обновляем предпросмотр
            const preview = colorPicker.querySelector('.color-preview');
            preview.style.backgroundColor = `hsl(${newColor.h}, ${newColor.s}%, ${newColor.l}%)`;
            
            // Обновляем значения
            hueSlider.nextElementSibling.textContent = newColor.h;
            saturationSlider.nextElementSibling.textContent = newColor.s + '%';
            lightnessSlider.nextElementSibling.textContent = newColor.l + '%';
            
            // Сохраняем в базу данных
            this.saveUserColor(newColor);
        };
        
        hueSlider.addEventListener('input', updateColor);
        saturationSlider.addEventListener('input', updateColor);
        lightnessSlider.addEventListener('input', updateColor);
    }

    async saveUserColor(color) {
        if (this.user) {
            await firebaseService.updateUserColor(this.user.id, color);
            this.user.color = color;
            // Обновляем всех пользователей
            await this.loadAllUsers();
            // Перерисовываем график
            this.render();
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

    renderWeekView(employeesToShow) {
        const weekView = document.getElementById('week-view');
        const monthView = document.getElementById('month-view');
        
        weekView.classList.remove('hidden');
        monthView.classList.add('hidden');
        
        const weekStart = new Date(this.currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        
        let html = '<div class="calendar-grid week-view-grid">';
        
        // Заголовки дней
        html += '<div class="week-header employee-header"></div>';
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + i);
            const monthName = this.getMonthName(day.getMonth());
            html += `<div class="week-header">${this.getDayName(day)}<br>${day.getDate()} ${monthName}</div>`;
        }
        
        // Разделяем сотрудников на "моих" и "остальных"
        const myEmployees = [];
        const otherEmployees = [];
        
        employeesToShow.forEach(employee => {
            if (this.userAttachments.includes(employee)) {
                myEmployees.push(employee);
            } else {
                otherEmployees.push(employee);
            }
        });
        
        console.log('Мои сотрудники для отображения:', myEmployees);
        console.log('Остальные сотрудники для отображения:', otherEmployees);
        
        // Сначала отображаем "моих" сотрудников
        myEmployees.forEach(employee => {
            html += `<div class="week-time-cell my-employee">${employee}</div>`;
            
            for (let i = 0; i < 7; i++) {
                const day = new Date(weekStart);
                day.setDate(day.getDate() + i);
                const dayNumber = day.getDate();
                const dayMonth = this.getMonthSheetNameForDate(day);
                
                html += `<div class="week-day">`;
                
                const shifts = this.getShiftsForDay(employee, dayNumber, dayMonth);
                console.log(`Смены для ${employee} ${dayNumber}.${dayMonth}:`, shifts);
                
                shifts.forEach(shift => {
                    const color = this.getEmployeeColor(employee);
                    html += this.renderShift(shift, color, true); // true - моя смена
                });
                
                html += `</div>`;
            }
        });
        
        // Затем отображаем "остальных" сотрудников
        otherEmployees.forEach(employee => {
            html += `<div class="week-time-cell">${employee}</div>`;
            
            for (let i = 0; i < 7; i++) {
                const day = new Date(weekStart);
                day.setDate(day.getDate() + i);
                const dayNumber = day.getDate();
                const dayMonth = this.getMonthSheetNameForDate(day);
                
                html += `<div class="week-day">`;
                
                const shifts = this.getShiftsForDay(employee, dayNumber, dayMonth);
                
                shifts.forEach(shift => {
                    const color = this.getEmployeeColor(employee);
                    html += this.renderShift(shift, color, false); // false - не моя смена
                });
                
                html += `</div>`;
            }
        });
        
        html += '</div>';
        weekView.innerHTML = html;
    }

    getShiftsForDay(employee, dayNumber, monthSheet) {
        const employeeShifts = this.weekData[employee];
        if (!employeeShifts) return [];
        
        return employeeShifts.filter(shift => 
            shift.date === dayNumber && shift.month === monthSheet
        );
    }

    getMonthName(monthIndex) {
        const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return months[monthIndex];
    }

    renderMonthView(employeesToShow) {
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
            html += `<div class="month-day other-month"></div>`;
        }
        
        const today = new Date();
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const isToday = today.getDate() === day && 
                           today.getMonth() === this.currentDate.getMonth() && 
                           today.getFullYear() === this.currentDate.getFullYear();
            
            html += `<div class="month-day ${isToday ? 'today' : ''}">`;
            html += `<div class="day-number">${day}</div>`;
            
            // Разделяем смены на "мои" и "остальные"
            const myShifts = [];
            const otherShifts = [];
            
            employeesToShow.forEach(employee => {
                const shifts = this.scheduleData[employee] || [];
                const dayShifts = shifts.filter(shift => shift.date === day);
                
                dayShifts.forEach(shift => {
                    const color = this.getEmployeeColor(employee);
                    const shiftHtml = this.renderShift(shift, color, this.userAttachments.includes(employee));
                    if (this.userAttachments.includes(employee)) {
                        myShifts.push(shiftHtml);
                    } else {
                        otherShifts.push(shiftHtml);
                    }
                });
            });
            
            // Сначала отображаем "мои" смены, потом "остальные"
            html += myShifts.join('');
            html += otherShifts.join('');
            
            html += `</div>`;
        }
        
        html += '</div>';
        monthView.innerHTML = html;
    }

    renderShift(shift, color, isMyShift = false) {
        const shiftClass = isMyShift ? 'shift-parallelogram my-shift' : 'shift-parallelogram other-shift';
        const hsl = `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
        return `
            <div class="${shiftClass}" style="background-color: ${hsl}">
                <div class="shift-content">
                    ${shift.hours > 1 ? shift.hours + 'ч' : ''}
                </div>
            </div>
        `;
    }

    getFilteredEmployees() {
        const dataSource = this.isMonthView ? this.scheduleData : this.weekData;
        const allEmployees = Object.keys(dataSource);
        
        let filtered = allEmployees;
        
        if (this.globalFilterSettings.showOnlyRegistered) {
            filtered = filtered.filter(employee => 
                this.registeredEmployees.includes(employee)
            );
        }
        
        if (this.filterSettings.showOnlyMine && this.user) {
            filtered = filtered.filter(employee => 
                this.userAttachments.includes(employee)
            );
        }
        
        return filtered;
    }

    getEmployeeColor(employeeName) {
        // Ищем пользователя, которому привязан этот сотрудник
        for (const userId in this.allAttachments) {
            const attachedEmployees = this.allAttachments[userId];
            if (attachedEmployees.includes(employeeName)) {
                const user = this.allUsers[userId];
                if (user && user.color) {
                    return user.color;
                }
            }
        }
        
        // Если сотрудник не привязан ни к кому, используем цвет по умолчанию
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
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.scheduleApp = new ScheduleApp();
});
