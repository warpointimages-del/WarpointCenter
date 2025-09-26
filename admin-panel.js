import { firebaseService } from './firebase.js';

class AdminPanel {
    constructor() {
        this.usersList = document.getElementById('users-list');
        this.adminPanel = document.getElementById('admin-panel');
        this.currentUsers = {};
        this.employees = [];
    }

    // Инициализация админской панели
    async init(currentUser) {
        console.log('Инициализация админской панели для:', currentUser);
        
        if (!currentUser.isAdmin) {
            console.log('Пользователь не админ, скрываем панель');
            this.adminPanel.classList.add('hidden');
            return;
        }

        this.adminPanel.classList.remove('hidden');
        await this.loadUsers();
        await this.loadEmployees();
        this.renderUsersList();
        
        // Запускаем периодическую проверку обновлений
        this.startAutoRefresh();
    }

    // Загрузка всех пользователей
    async loadUsers() {
        this.currentUsers = await firebaseService.getAllUsers();
        console.log('Загружены пользователи:', this.currentUsers);
    }

    // Загрузка сотрудников из графика
    async loadEmployees() {
        const allSchedules = await firebaseService.getAllScheduleData();
        const employeesSet = new Set();
        
        console.log('Все графики:', allSchedules);
        
        Object.values(allSchedules).forEach(schedule => {
            if (schedule.data && schedule.data.employees) {
                console.log('Сотрудники из графика:', schedule.data.employees);
                schedule.data.employees.forEach(emp => {
                    if (emp && emp.trim()) {
                        employeesSet.add(emp.trim());
                    }
                });
            }
        });
        
        this.employees = Array.from(employeesSet).sort();
        console.log('Уникальные сотрудники:', this.employees);
    }

    // Отрисовка списка пользователей
    renderUsersList() {
        this.usersList.innerHTML = '';
        
        if (Object.keys(this.currentUsers).length === 0) {
            this.usersList.innerHTML = '<div class="no-users">Пользователи не найдены</div>';
            return;
        }
        
        Object.entries(this.currentUsers).forEach(([userId, userData]) => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.id = `user-${userId}`;
            
            userItem.innerHTML = `
                <div class="user-info">
                    <strong>${userData.first_name || 'Неизвестно'}</strong><br>
                    ID: ${userId}<br>
                    @${userData.username || 'нет username'}<br>
                    Последний вход: ${new Date(userData.lastLogin).toLocaleDateString('ru-RU')}
                </div>
                <div class="user-controls">
                    <label>Привязать к сотруднику:</label>
                    <select id="employee-select-${userId}" class="employee-select">
                        <option value="">Не привязан</option>
                        ${this.employees.map(emp => 
                            `<option value="${emp}" ${userData.employeeName === emp ? 'selected' : ''}>${emp}</option>`
                        ).join('')}
                    </select>
                    <label class="admin-label">
                        <input type="checkbox" id="admin-checkbox-${userId}" class="admin-checkbox" 
                            ${userData.isAdmin ? 'checked' : ''}>
                        Администратор
                    </label>
                    <div class="user-status" id="status-${userId}"></div>
                </div>
            `;
            
            this.usersList.appendChild(userItem);
            
            // Обработчики событий
            const select = userItem.querySelector(`#employee-select-${userId}`);
            const checkbox = userItem.querySelector(`#admin-checkbox-${userId}`);
            
            select.addEventListener('change', () => this.updateUserEmployee(userId, select.value));
            checkbox.addEventListener('change', () => this.updateUserAdmin(userId, checkbox.checked));
        });
    }

    // Обновление привязки сотрудника
    async updateUserEmployee(userId, employeeName) {
        const statusElement = document.getElementById(`status-${userId}`);
        statusElement.textContent = 'Сохранение...';
        statusElement.style.color = '#ffa500';
        
        try {
            const success = await firebaseService.updateUser(userId, { employeeName });
            if (success) {
                statusElement.textContent = 'Сохранено ✓';
                statusElement.style.color = '#4caf50';
                setTimeout(() => {
                    statusElement.textContent = '';
                }, 2000);
                
                // Обновляем локальные данные
                if (this.currentUsers[userId]) {
                    this.currentUsers[userId].employeeName = employeeName;
                }
            }
        } catch (error) {
            statusElement.textContent = 'Ошибка сохранения';
            statusElement.style.color = '#f44336';
        }
    }

    // Обновление статуса администратора
    async updateUserAdmin(userId, isAdmin) {
        const statusElement = document.getElementById(`status-${userId}`);
        statusElement.textContent = 'Сохранение...';
        statusElement.style.color = '#ffa500';
        
        try {
            console.log(`Обновление админского статуса для ${userId}:`, isAdmin);
            const success = await firebaseService.updateUser(userId, { isAdmin });
            
            if (success) {
                statusElement.textContent = 'Сохранено ✓';
                statusElement.style.color = '#4caf50';
                setTimeout(() => {
                    statusElement.textContent = '';
                }, 2000);
                
                // Обновляем локальные данные
                if (this.currentUsers[userId]) {
                    this.currentUsers[userId].isAdmin = isAdmin;
                }
                
                console.log('Админский статус успешно обновлен');
            }
        } catch (error) {
            statusElement.textContent = 'Ошибка сохранения';
            statusElement.style.color = '#f44336';
            console.error('Ошибка обновления админского статуса:', error);
        }
    }

    // Автообновление данных
    startAutoRefresh() {
        setInterval(async () => {
            await this.loadUsers();
            await this.loadEmployees();
            this.renderUsersList();
        }, 30000); // Обновление каждые 30 секунд
    }

    // Уведомление
    showNotification(message, isSuccess = true) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${isSuccess ? '#4caf50' : '#f44336'};
            color: white;
            padding: 10px 15px;
            border-radius: 0;
            z-index: 1000;
            font-size: 14px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

export const adminPanel = new AdminPanel();
