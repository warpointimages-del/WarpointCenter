import { firebaseService } from './firebase.js';

class AdminPanel {
    constructor() {
        this.users = {};
        this.registeredEmployees = [];
        this.userAttachments = {}; // {userId: [employeeName1, employeeName2]}
        setTimeout(() => this.init(), 100);
    }

    async init() {
        try {
            await this.loadUsers();
            await this.loadRegisteredEmployees();
            await this.loadUserAttachments();
            this.render();
        } catch (error) {
            console.error('Ошибка инициализации админ-панели:', error);
        }
    }

    async loadUsers() {
        this.users = await firebaseService.getAllUsers();
    }

    async loadRegisteredEmployees() {
        this.registeredEmployees = await firebaseService.getRegisteredEmployees();
    }

    async loadUserAttachments() {
        this.userAttachments = await firebaseService.getAllAttachments();
    }

    render() {
        this.renderUsersList();
        this.renderRegisteredEmployeesList();
    }

    renderUsersList() {
        const usersList = document.getElementById('users-list');
        if (!usersList) return;
        
        usersList.innerHTML = '<h4>Пользователи</h4>';

        Object.values(this.users).forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            
            const userAttachments = this.userAttachments[user.id] || [];
            const safeUserName = user.username ? user.username.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';
            
            userElement.innerHTML = `
                <div class="user-info">
                    <strong>${user.firstName || ''} ${user.lastName || ''}</strong>
                    <div>@${user.username || 'нет username'}</div>
                    <div>ID: ${user.id}</div>
                    <div class="current-position">Текущая должность: <strong>${user.position || 'Стажёр'}</strong></div>
                    <div class="attached-names">
                        <strong>Привязанные сотрудники:</strong>
                        ${userAttachments.length > 0 
                            ? userAttachments.map(name => 
                                `<span class="attached-name">${name} 
                                 <button class="unlink-btn" onclick="adminPanel.detachEmployee('${user.id}', '${name.replace(/'/g, "\\'").replace(/"/g, '\\"')}')">×</button>
                                </span>`
                              ).join('')
                            : '<span class="no-names">нет привязок</span>'
                        }
                    </div>
                </div>
                <div class="user-controls">
                    <div class="control-section">
                        <h5>Привязка сотрудника</h5>
                        <div class="name-input-group">
                            <select class="employee-select" id="employee-select-${user.id}">
                                <option value="">Выберите сотрудника</option>
                                ${this.registeredEmployees.map(emp => 
                                    `<option value="${emp.replace(/'/g, "\\'").replace(/"/g, '\\"')}">${emp}</option>`
                                ).join('')}
                            </select>
                            <button class="link-btn" onclick="adminPanel.attachEmployee('${user.id}')">Привязать</button>
                        </div>
                    </div>
                    
                    <div class="control-section">
                        <h5>Настройка должности</h5>
                        <div class="position-control">
                            <select class="position-select" onchange="adminPanel.updatePosition('${user.id}', this.value)">
                                <option value="Стажёр" ${(user.position || 'Стажёр') === 'Стажёр' ? 'selected' : ''}>Стажёр</option>
                                <option value="Оператор" ${(user.position || 'Стажёр') === 'Оператор' ? 'selected' : ''}>Оператор</option>
                                <option value="Старший оператор" ${(user.position || 'Стажёр') === 'Старший оператор' ? 'selected' : ''}>Старший оператор</option>
                                <option value="Заместитель управляющего" ${(user.position || 'Стажёр') === 'Заместитель управляющего' ? 'selected' : ''}>Заместитель управляющего</option>
                                <option value="Администратор" ${(user.position || 'Стажёр') === 'Администратор' ? 'selected' : ''}>Администратор</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="control-section">
                        <h5>Права доступа</h5>
                        <div class="admin-control">
                            <label class="checkbox-container">
                                <input type="checkbox" 
                                       class="admin-checkbox"
                                       ${user.isAdmin ? 'checked' : ''}
                                       onchange="adminPanel.toggleAdmin('${user.id}', this.checked)">
                                <span class="checkmark"></span>
                                Администратор
                            </label>
                        </div>
                    </div>
                </div>
            `;
            
            usersList.appendChild(userElement);
        });
    }

    renderRegisteredEmployeesList() {
        const employeesSection = document.getElementById('registered-employees');
        if (!employeesSection) return;
        
        employeesSection.innerHTML = '<h4>Зарегистрированные сотрудники</h4>';
        
        // Форма добавления нового сотрудника
        const addForm = document.createElement('div');
        addForm.className = 'add-employee-form';
        addForm.innerHTML = `
            <input type="text" id="new-employee-name" placeholder="Имя сотрудника из таблицы">
            <button onclick="adminPanel.addEmployee()">Добавить</button>
        `;
        employeesSection.appendChild(addForm);
        
        // Список сотрудников
        const list = document.createElement('div');
        list.className = 'employees-list';
        
        if (this.registeredEmployees.length === 0) {
            list.innerHTML = '<div class="no-employees">Нет зарегистрированных сотрудников</div>';
        } else {
            this.registeredEmployees.forEach(employee => {
                const item = document.createElement('div');
                item.className = 'employee-item';
                const safeEmployeeName = employee.replace(/'/g, "\\'").replace(/"/g, '\\"');
                item.innerHTML = `
                    <span>${employee}</span>
                    <button class="remove-btn" onclick="adminPanel.removeEmployee('${safeEmployeeName}')">×</button>
                `;
                list.appendChild(item);
            });
        }
        
        employeesSection.appendChild(list);
    }

    async attachEmployee(userId) {
        const select = document.getElementById(`employee-select-${userId}`);
        const employeeName = select.value.trim();
        
        if (!employeeName) {
            alert('Выберите сотрудника');
            return;
        }

        const success = await firebaseService.attachEmployeeToUser(userId, employeeName);
        if (success) {
            await this.loadUserAttachments();
            this.renderUsersList();
            this.updateScheduleApp();
            select.value = '';
        } else {
            alert('Этот сотрудник уже привязан к пользователю');
        }
    }

    async detachEmployee(userId, employeeName) {
        const success = await firebaseService.detachEmployeeFromUser(userId, employeeName);
        if (success) {
            await this.loadUserAttachments();
            this.renderUsersList();
            this.updateScheduleApp();
        } else {
            alert('Ошибка при отвязке сотрудника');
        }
    }

    async addEmployee() {
        const input = document.getElementById('new-employee-name');
        const name = input.value.trim();
        
        if (!name) {
            alert('Введите имя сотрудника');
            return;
        }

        if (this.registeredEmployees.includes(name)) {
            alert('Этот сотрудник уже зарегистрирован');
            return;
        }

        const success = await firebaseService.addRegisteredEmployee(name);
        if (success) {
            await this.loadRegisteredEmployees();
            this.render();
            this.updateScheduleApp();
            input.value = '';
        } else {
            alert('Ошибка при добавлении сотрудника');
        }
    }

    async updateAvailableMonths() {
        if (window.scheduleApp) {
            await window.scheduleApp.loadAvailableMonths();
            window.scheduleApp.renderMonthNavigation();
        }
    }
    
    async removeEmployee(employeeName) {
        const success = await firebaseService.removeRegisteredEmployee(employeeName);
        if (success) {
            await this.loadRegisteredEmployees();
            this.renderRegisteredEmployeesList();
            this.updateScheduleApp();
        } else {
            alert('Ошибка при удалении сотрудника');
        }
    }

    async toggleAdmin(userId, isAdmin) {
        await firebaseService.updateUser(userId, { isAdmin });
        this.users[userId].isAdmin = isAdmin;
        this.renderUsersList();
    }

    async updatePosition(userId, position) {
        await firebaseService.updateUserPosition(userId, position);
        this.users[userId].position = position;
        this.renderUsersList();
        this.updateScheduleApp();
    }

    updateScheduleApp() {
        if (window.scheduleApp) {
            window.scheduleApp.loadRegisteredEmployees().then(() => {
                window.scheduleApp.loadUserAttachments().then(() => {
                    window.scheduleApp.loadAllUsers().then(() => {
                        window.scheduleApp.render();
                    });
                });
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});
