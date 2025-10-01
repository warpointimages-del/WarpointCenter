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
        this.weekData = {};
        this.currentPage = 'schedule'; // Текущая страница по умолчанию
        
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
            this.initializeNavigation();
            this.renderCurrentPage();
            
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('bottom-navigation').classList.remove('hidden');
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            document.getElementById('loading').textContent = 'Ошибка загрузки: ' + error.message;
        }
    }

    // НАВИГАЦИЯ МЕЖДУ СТРАНИЦАМИ
    initializeNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.getAttribute('data-page');
                this.switchPage(page);
            });
        });
    }

    switchPage(pageName) {
        // Скрываем все страницы
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        
        // Убираем активный класс у всех кнопок
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Показываем выбранную страницу
        document.getElementById(`${pageName}-page`).classList.remove('hidden');
        
        // Активируем соответствующую кнопку
        document.querySelector(`.nav-item[data-page="${pageName}"]`).classList.add('active');
        
        this.currentPage = pageName;
        
        // Если переключились на страницу графика - перерисовываем
        if (pageName === 'schedule') {
            this.renderSchedulePage();
        } else if (pageName === 'profile') {
            this.renderProfilePage();
        }
    }

    renderCurrentPage() {
        if (this.currentPage === 'schedule') {
            this.renderSchedulePage();
        } else if (this.currentPage === 'profile') {
            this.renderProfilePage();
        }
    }

    renderSchedulePage() {
        this.render();
    }

    renderProfilePage() {
        this.renderUserInfo();
        this.renderColorPickerInProfile();
        this.renderAdminSettings();
    }

    renderUserInfo() {
        if (this.user) {
            const avatar = document.querySelector('.avatar-placeholder');
            const fullName = document.getElementById('user-fullname');
            const username = document.getElementById('user-username');
            const status = document.getElementById('user-status');
            
            if (avatar) {
                avatar.textContent = this.user.firstName ? this.user.firstName.charAt(0).toUpperCase() : 'U';
            }
            if (fullName) {
                fullName.textContent = `${this.user.firstName || ''} ${this.user.lastName || ''}`.trim() || 'Пользователь';
            }
            if (username) {
                username.textContent = this.user.username ? `@${this.user.username}` : 'нет username';
            }
            if (status) {
                status.textContent = this.user.isAdmin ? 'Администратор' : 'Сотрудник';
            }
        }
    }

    renderColorPickerInProfile() {
        const container = document.getElementById('color-picker-container');
        if (!container || !this.user) return;
        
        const userColor = this.user.color || { h: 200, s: 80, l: 60 };
        const hslColor = `hsl(${userColor.h}, ${userColor.s}%, ${userColor.l}%)`;
        
        container.innerHTML = `
            <div class="color-picker">
                <div class="color-preview" style="background-color: ${hslColor}; margin: 10px 0; height: 40px; border: 1px solid #555; border-radius: 8px;"></div>
                <div class="color-controls">
                    <div class="slider-container">
                        <span>Оттенок</span>
                        <input type="range" min="0" max="360" value="${userColor.h}" class="hue-slider">
                        <span>${userColor.h}</span>
                    </div>
                    <div class="slider-container">
                        <span>Насыщенность</span>
                        <input type="range" min="0" max="100" value="${userColor.s}" class="saturation-slider">
                        <span>${userColor.s}%</span>
                    </div>
                    <div class="slider-container">
                        <span>Яркость</span>
                        <input type="range" min="0" max="100" value="${userColor.l}" class="lightness-slider">
                        <span>${userColor.l}%</span>
                    </div>
                </div>
            </div>
        `;
        
        const hueSlider = container.querySelector('.hue-slider');
        const saturationSlider = container.querySelector('.saturation-slider');
        const lightnessSlider = container.querySelector('.lightness-slider');
        
        const updateColor = () => {
            const newColor = {
                h: parseInt(hueSlider.value),
                s: parseInt(saturationSlider.value),
                l: parseInt(lightnessSlider.value)
            };
            
            // Обновляем предпросмотр
            const preview = container.querySelector('.color-preview');
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

    renderAdminSettings() {
        const adminSection = document.getElementById('admin-settings');
        if (this.user && this.user.isAdmin) {
            adminSection.classList.remove('hidden');
            if (window.adminPanel) {
                window.adminPanel.render();
            }
        } else {
            adminSection.classList.add('hidden');
        }
    }

    // ОСТАЛЬНЫЕ МЕТОДЫ БЕЗ ИЗМЕНЕНИЙ (initializeUser, loadAllUsers, и т.д.)
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
        }
    }

    async loadAllUsers() {
        this.allUsers = await firebaseService.getAllUsers();
    }

    async loadAllAttachments() {
        this.allAttachments = await firebaseService.getAllAttachments();
    }

    async loadRegisteredEmployees() {
        this.registeredEmployees = await firebaseService.getRegisteredEmployees();
    }

    async loadUserAttachments() {
        if (this.user) {
            this.userAttachments = await firebaseService.getUserAttachments(this.user.id);
        }
    }

    async loadAvailableMonths() {
        try {
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
                await this.loadMonthData();
            } else {
                await this.loadWeekData();
            }
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.showNoDataMessage();
        }
    }

    async loadMonthData() {
        const currentMonthSheet = this.getCurrentMonthSheetName();
        this.scheduleData = {};
        const loaded = await this.loadSpecificMonthData(currentMonthSheet);
        if (!loaded) {
            this.showNoDataMessage();
        }
    }

    async loadWeekData() {
        const weekStart = new Date(this.currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const monthsInWeek = new Set();
        const currentDay = new Date(weekStart);
        
        while (currentDay <= weekEnd) {
            const monthSheet = this.getMonthSheetNameForDate(currentDay);
            monthsInWeek.add(monthSheet);
            currentDay.setDate(currentDay.getDate() + 1);
        }
        
        this.weekData = {};
        let anyDataLoaded = false;
        
        for (let monthSheet of monthsInWeek) {
            const monthData = await this.loadSpecificMonthData(monthSheet, false);
            if (monthData && Object.keys(monthData).length > 0) {
                anyDataLoaded = true;
                for (const [employee, shifts] of Object.entries(monthData)) {
                    if (!this.weekData[employee]) {
                        this.weekData[employee] = [];
                    }
                    this.weekData[employee].push(...shifts);
                }
            }
        }
        
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

    async loadSpecificMonthData(sheetName, mergeToScheduleData = true) {
        try {
            let data = await this.loadViaGviz(sheetName);
            if (data) {
                const monthData = this.processGvizData(data, sheetName);
                if (Object.keys(monthData).length > 0) {
                    if (mergeToScheduleData) {
                        this.scheduleData = { ...this.scheduleData, ...monthData };
                    }
                    return monthData;
                }
            }
            
            data = await this.loadViaCSV(sheetName);
            if (data && data.length > 0) {
                const monthData = this.processCSVData(data, sheetName);
                if (Object.keys(monthData).length > 0) {
                    if (mergeToScheduleData) {
                        this.scheduleData = { ...this.scheduleData, ...monthData };
                    }
                    return monthData;
                }
            }
            
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
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
            } else if (char === '\n' && !inQuotes) {
                row.push(current.trim());
                result.push(row);
                row = [];
                current = '';
            } else if (char === '\r') {
                continue;
            } else {
                current += char;
            }
        }
        
        if (current.trim() || row.length > 0) {
            row.push(current.trim());
            result.push(row);
        }
        
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
        const dateRowIndex = this.findDateRowBySequence(data);
        if (dateRowIndex === -1) {
            return {};
        }
        
        const dateRow = data[dateRowIndex];
        const dates = this.extractDatesFromRow(dateRow);
        if (dates.length === 0) {
            return {};
        }
        
        const startRow = dateRowIndex + 1;
        for (let i = startRow; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            
            const employeeName = this.extractEmployeeName(row[0]); 
            if (!employeeName) continue;
            
            const shifts = [];
            for (let j = 1; j < row.length; j++) {
                const dateIndex = j - 1;
                if (dateIndex < dates.length) {
                    const shiftValue = row[j];
                    if (shiftValue && shiftValue.trim()) {
                        const hours = this.parseHours(shiftValue);
                        if (hours !== null && hours >= 0.5) {
                            shifts.push({
                                date: dates[dateIndex],
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

    findDateRowBySequence(data) {
        const targetSequence = Array.from({length: 28}, (_, i) => i + 1);
        
        for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
            const row = data[rowIndex];
            if (!row) continue;
            
            const numbersInRow = [];
            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                const number = this.extractDateNumber(row[colIndex]);
                if (number !== null) {
                    numbersInRow.push(number);
                }
            }
            
            if (this.containsSequence(numbersInRow, targetSequence)) {
                return rowIndex;
            }
        }
        
        return -1;
    }

    containsSequence(numbers, targetSequence) {
        if (numbers.length < targetSequence.length) return false;
        
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
        
        if (str === 'полсмены' || str === 'половина смены' || str === 'пол смены') {
            return 4;
        }
        
        if (str === 'целая смена' || str === 'полная смена' || str === 'смена') {
            return 8;
        }
        
        const numWithDot = parseFloat(str);
        if (!isNaN(numWithDot) && numWithDot > 0) {
            return numWithDot;
        }
        
        if (str.includes(',')) {
            const normalizedStr = str.replace(',', '.');
            const numWithComma = parseFloat(normalizedStr);
            if (!isNaN(numWithComma) && numWithComma > 0) {
                return numWithComma;
            }
        }
        
        const fractionMatch = str.match(/(\d+)\s+(\d+)\/(\d+)/) || str.match(/(\d+)\/(\d+)/);
        if (fractionMatch) {
            let whole = 0;
            let numerator, denominator;
            
            if (fractionMatch[3]) {
                whole = parseInt(fractionMatch[1]);
                numerator = parseInt(fractionMatch[2]);
                denominator = parseInt(fractionMatch[3]);
            } else {
                numerator = parseInt(fractionMatch[1]);
                denominator = parseInt(fractionMatch[2]);
            }
            
            if (denominator !== 0) {
                return whole + (numerator / denominator);
            }
        }
        
        const hourMatch = str.match(/(\d+[,.]?\d*)\s*(ч|час|часов|часа)/);
        if (hourMatch) {
            let hourStr = hourMatch[1].replace(',', '.');
            const num = parseFloat(hourStr);
            if (!isNaN(num) && num > 0) {
                return num;
            }
        }
        
        const timeMatch = str.match(/(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)/);
        if (timeMatch) {
            const startHours = parseInt(timeMatch[1]);
            const startMinutes = parseInt(timeMatch[2]);
            const endHours = parseInt(timeMatch[3]);
            const endMinutes = parseInt(timeMatch[4]);
            
            const totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
            if (totalMinutes > 0) {
                return totalMinutes / 60;
            }
        }
        
        const simpleNum = parseFloat(str);
        if (!isNaN(simpleNum) && simpleNum > 0 && simpleNum <= 24) {
            return simpleNum;
        }
        
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
                        if (hours !== null && hours >= 0.5) {
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

    initializeEventListeners() {
        document.getElementById('prev-week').addEventListener('click', () => this.changeWeek(-1));
        document.getElementById('next-week').addEventListener('click', () => this.changeWeek(1));
        document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
        document.getElementById('show-only-mine').addEventListener('change', (e) => this.toggleFilter(e.target.checked));
        document.getElementById('global-show-only-registered').addEventListener('change', (e) => this.toggleGlobalFilter(e.target.checked));
    }

    async toggleGlobalFilter(showOnlyRegistered) {
        this.globalFilterSettings.showOnlyRegistered = showOnlyRegistered;
        await firebaseService.saveGlobalFilterSettings(this.globalFilterSettings);
        if (this.currentPage === 'schedule') {
            this.render();
        }
    }

    changeWeek(direction) {
        if (this.isMonthView) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
        }
        this.loadScheduleData().then(() => {
            if (this.currentPage === 'schedule') {
                this.render();
            }
        });
    }

    toggleView() {
        this.isMonthView = !this.isMonthView;
        const toggleBtn = document.getElementById('toggle-view');
        toggleBtn.textContent = this.isMonthView ? '▲' : '▼';
        this.loadScheduleData().then(() => {
            if (this.currentPage === 'schedule') {
                this.render();
            }
        });
    }

    async toggleFilter(showOnlyMine) {
        this.filterSettings.showOnlyMine = showOnlyMine;
        if (this.user) {
            await firebaseService.saveFilterSettings(this.user.id, this.filterSettings);
        }
        if (this.currentPage === 'schedule') {
            this.render();
        }
    }

    render() {
        this.updateNavigation();
        
        const employeesToShow = this.getFilteredEmployees();
        
        if (this.isMonthView) {
            this.renderMonthView(employeesToShow);
        } else {
            this.renderWeekView(employeesToShow);
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
        
        html += '<div class="week-header employee-header"></div>';
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + i);
            const monthName = this.getMonthName(day.getMonth());
            html += `<div class="week-header">${this.getDayName(day)}<br>${day.getDate()} ${monthName}</div>`;
        }
        
        const myEmployees = [];
        const otherEmployees = [];
        
        employeesToShow.forEach(employee => {
            if (this.userAttachments.includes(employee)) {
                myEmployees.push(employee);
            } else {
                otherEmployees.push(employee);
            }
        });
        
        myEmployees.forEach(employee => {
            html += `<div class="week-time-cell my-employee">${employee}</div>`;
            
            for (let i = 0; i < 7; i++) {
                const day = new Date(weekStart);
                day.setDate(day.getDate() + i);
                const dayNumber = day.getDate();
                const dayMonth = this.getMonthSheetNameForDate(day);
                
                html += `<div class="week-day">`;
                
                const shifts = this.getShiftsForDay(employee, dayNumber, dayMonth);
                shifts.forEach(shift => {
                    const color = this.getEmployeeColor(employee);
                    html += this.renderShift(shift, color, true);
                });
                
                html += `</div>`;
            }
        });
        
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
                    html += this.renderShift(shift, color, false);
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
        for (const userId in this.allAttachments) {
            const attachedEmployees = this.allAttachments[userId];
            if (attachedEmployees.includes(employeeName)) {
                const user = this.allUsers[userId];
                if (user && user.color) {
                    return user.color;
                }
            }
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
            const checkbox = document.getElementById('show-only-mine');
            if (checkbox) {
                checkbox.checked = this.filterSettings.showOnlyMine;
            }
        }
    }

    async loadGlobalFilterSettings() {
        this.globalFilterSettings = await firebaseService.getGlobalFilterSettings();
        const checkbox = document.getElementById('global-show-only-registered');
        if (checkbox) {
            checkbox.checked = this.globalFilterSettings.showOnlyRegistered;
        }
    }

    async saveUserColor(color) {
        if (this.user) {
            await firebaseService.updateUserColor(this.user.id, color);
            this.user.color = color;
            await this.loadAllUsers();
            if (this.currentPage === 'schedule') {
                this.render();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.scheduleApp = new ScheduleApp();
});
