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
        if (!currentUser.isAdmin) {
            this.adminPanel.classList.add('hidden');
            return;
        }

        this.adminPanel.classList.remove('hidden');
        await this.loadUsers();
        await this.loadEmployees();
        this.renderUsersList();
    }

    // Загрузка всех пользователей
    async loadUsers() {
        this.currentUsers = await firebaseService.getAllUsers();
    }

    // Загрузка сотрудников из графика
    async loadEmployees() {
        const allSchedules = await firebaseService.getAllScheduleData();
        const employeesSet = new Set();
        
        Object.values(allSchedules).forEach(schedule => {
            if (schedule.data && schedule.data.employees) {
                schedule.data.employees.forEach(emp => {
                    employeesSet.add(emp.name);
                });
            }
        });
        
        this.employees = Array.from(employeesSet).sort();
    }

    // Отрисовка списка пользователей
    renderUsersList() {
        this.usersList.innerHTML = '';
        
        Object.entries(this.currentUsers).forEach(([userId, userData]) => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            
            userItem.innerHTML = `
                <div class="user-info">
                    <strong>${userData.first_name || 'Неизвестно'}</strong><br>
                    ID: ${userId}<br>
                    @${userData.username || 'нет username'}
                </div>
                <div class="user-controls">
                    <select id="employee-select-${userId}">
                        <option value="">Не привязан</option>
                        ${this.employees.map(emp => 
                            `<option value="${emp}" ${userData.employeeName === emp ? 'selected' : ''}>${emp}</option>`
                        ).join('')}
                    </select>
                    <label>
                        <input type="checkbox" id="admin-checkbox-${userId}" ${userData.isAdmin ? 'checked' : ''}>
                        Администратор
                    </label>
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
        await firebaseService.updateUser(userId, { employeeName });
        this.showNotification('Привязка обновлена');
    }

    // Обновление статуса администратора
    async updateUserAdmin(userId, isAdmin) {
        await firebaseService.updateUser(userId, { isAdmin });
        this.showNotification('Статус администратора обновлен');
    }

    // Уведомление
    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4a9eff;
            color: white;
            padding: 10px 15px;
            border-radius: 0;
            z-index: 1000;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

export const adminPanel = new AdminPanel();
