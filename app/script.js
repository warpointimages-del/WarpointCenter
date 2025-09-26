const { createApp } = Vue;

createApp({
    data() {
        return {
            currentDate: new Date(),
            view: 'week',
            scheduleData: {},
            userData: null,
            employees: [],
            dayNames: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
            monthNames: [
                'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
            ]
        }
    },
    computed: {
        weekDays() {
            const startOfWeek = new Date(this.currentDate);
            startOfWeek.setDate(this.currentDate.getDate() - this.currentDate.getDay() + 1);
            
            return Array.from({ length: 7 }, (_, i) => {
                const date = new Date(startOfWeek);
                date.setDate(startOfWeek.getDate() + i);
                return {
                    date: date.toISOString().split('T')[0],
                    name: this.dayNames[i],
                    number: date.getDate()
                };
            });
        },
        monthDays() {
            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth();
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            
            const days = [];
            const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
            
            // Добавляем дни предыдущего месяца
            for (let i = startDay - 1; i >= 0; i--) {
                const date = new Date(year, month, -i);
                days.push({
                    date: date.toISOString().split('T')[0],
                    number: date.getDate(),
                    isCurrentMonth: false
                });
            }
            
            // Добавляем дни текущего месяца
            for (let i = 1; i <= lastDay.getDate(); i++) {
                const date = new Date(year, month, i);
                days.push({
                    date: date.toISOString().split('T')[0],
                    number: i,
                    isCurrentMonth: true,
                    isToday: this.isToday(date)
                });
            }
            
            // Добавляем дни следующего месяца
            const totalCells = 42; // 6 недель
            while (days.length < totalCells) {
                const date = new Date(year, month + 1, days.length - lastDay.getDate() - startDay + 1);
                days.push({
                    date: date.toISOString().split('T')[0],
                    number: date.getDate(),
                    isCurrentMonth: false
                });
            }
            
            return days;
        },
        currentRangeText() {
            if (this.view === 'week') {
                const start = this.weekDays[0];
                const end = this.weekDays[6];
                return `${start.number} ${this.monthNames[this.currentDate.getMonth()]} - ${end.number} ${this.monthNames[end.date.getMonth()]} ${this.currentDate.getFullYear()}`;
            } else {
                return `${this.monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
            }
        }
    },
    methods: {
        initTelegramApp() {
            this.tg = Telegram.WebApp;
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            // Получаем данные пользователя
            this.userData = this.tg.initDataUnsafe?.user;
            this.loadUserData();
            this.loadScheduleData();
        },
        async loadUserData() {
            try {
                // Загрузка данных пользователя из Firebase через бота
                const response = await fetch('/api/user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        telegramId: this.userData?.id
                    })
                });
                
                if (response.ok) {
                    this.userData = await response.json();
                }
            } catch (error) {
                console.error('Error loading user data:', error);
            }
        },
        async loadScheduleData() {
            try {
                const response = await fetch('/api/schedule');
                if (response.ok) {
                    this.scheduleData = await response.json();
                    this.extractEmployees();
                }
            } catch (error) {
                console.error('Error loading schedule data:', error);
            }
        },
        extractEmployees() {
            const employeesSet = new Set();
            Object.values(this.scheduleData).forEach(monthData => {
                monthData.employees.forEach(employee => employeesSet.add(employee));
            });
            this.employees = Array.from(employeesSet);
        },
        getShiftsForDay(date) {
            const shifts = [];
            Object.values(this.scheduleData).forEach(monthData => {
                if (monthData.schedule[date]) {
                    Object.entries(monthData.schedule[date]).forEach(([employee, data]) => {
                        if (data.isShift) {
                            shifts.push({
                                id: `${date}-${employee}`,
                                employee,
                                hours: data.hours,
                                date,
                                isMyShift: this.userData?.employeeId === employee
                            });
                        }
                    });
                }
            });
            return shifts;
        },
        getShiftStyle(shift) {
            const employeeColor = this.getEmployeeColor(shift.employee);
            const startHour = 9; // Начало рабочего дня
            const top = (startHour * 25) + 'px';
            const height = (shift.hours * 25) + 'px';
            
            return {
                background: `hsl(${employeeColor.h}, ${employeeColor.s}%, ${employeeColor.l}%)`,
                top,
                height
            };
        },
        getShiftPreviewStyle(shift) {
            const employeeColor = this.getEmployeeColor(shift.employee);
            return {
                background: `hsl(${employeeColor.h}, ${employeeColor.s}%, ${employeeColor.l}%)`
            };
        },
        getEmployeeColor(employeeName) {
            if (this.userData?.employeeId === employeeName && this.userData.color) {
                return this.userData.color;
            }
            
            // Генерация цвета на основе хеша имени
            let hash = 0;
            for (let i = 0; i < employeeName.length; i++) {
                hash = employeeName.charCodeAt(i) + ((hash << 5) - hash);
            }
            
            return {
                h: hash % 360,
                s: 70 + (hash % 30),
                l: 60 + (hash % 20)
            };
        },
        isToday(date) {
            const today = new Date();
            return date.toDateString() === today.toDateString();
        },
        prevPeriod() {
            if (this.view === 'week') {
                this.currentDate.setDate(this.currentDate.getDate() - 7);
            } else {
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            }
            this.currentDate = new Date(this.currentDate);
        },
        nextPeriod() {
            if (this.view === 'week') {
                this.currentDate.setDate(this.currentDate.getDate() + 7);
            } else {
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            }
            this.currentDate = new Date(this.currentDate);
        },
        toggleView() {
            this.view = this.view === 'week' ? 'month' : 'week';
            const btn = document.getElementById('toggleViewBtn');
            btn.textContent = this.view === 'week' ? '▼' : '▲';
        },
        updateColorPreview() {
            const hue = document.getElementById('hueSlider').value;
            const saturation = document.getElementById('saturationSlider').value;
            const lightness = document.getElementById('lightnessSlider').value;
            
            document.getElementById('hueValue').textContent = hue;
            document.getElementById('saturationValue').textContent = saturation;
            document.getElementById('lightnessValue').textContent = lightness;
            
            const preview = document.getElementById('colorPreview');
            preview.style.background = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        },
        async saveColor() {
            const hue = document.getElementById('hueSlider').value;
            const saturation = document.getElementById('saturationSlider').value;
            const lightness = document.getElementById('lightnessSlider').value;
            
            const color = {
                h: parseInt(hue),
                s: parseInt(saturation),
                l: parseInt(lightness)
            };
            
            try {
                this.tg.sendData(JSON.stringify({
                    type: 'color_update',
                    color: color
                }));
            } catch (error) {
                console.error('Error saving color:', error);
            }
        }
    },
    mounted() {
        this.initTelegramApp();
        
        // Инициализация цветовых слайдеров
        document.getElementById('hueSlider').addEventListener('input', this.updateColorPreview);
        document.getElementById('saturationSlider').addEventListener('input', this.updateColorPreview);
        document.getElementById('lightnessSlider').addEventListener('input', this.updateColorPreview);
        document.getElementById('saveColorBtn').addEventListener('click', this.saveColor);
        
        this.updateColorPreview();
    }
}).mount('.container');

// Обработчики кнопок навигации
document.getElementById('prevBtn').addEventListener('click', () => {
    const app = Vue.version ? Vue : window.app;
    app.prevPeriod();
});

document.getElementById('nextBtn').addEventListener('click', () => {
    const app = Vue.version ? Vue : window.app;
    app.nextPeriod();
});

document.getElementById('toggleViewBtn').addEventListener('click', () => {
    const app = Vue.version ? Vue : window.app;
    app.toggleView();
});
