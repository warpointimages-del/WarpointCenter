import { firebaseService } from './firebase.js';

class AdminPanel {
    constructor() {
        this.users = {};
        this.registeredEmployees = [];
        setTimeout(() => this.init(), 100);
    }

    async init() {
        try {
            await this.loadUsers();
            await this.loadRegisteredEmployees();
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
            userElement.innerHTML = `
                <div class="user-info">
                    <strong>${user.firstName || ''} ${user.lastName || ''}</strong>
                    <div>@${user.username || 'нет username'}</div>
                    <div>ID: ${user.id}</div>
                </div>
                <div class="user-controls">
                    <div class="admin-control">
                        <label>
                            <input type="checkbox" 
                                   class="admin-checkbox"
                                   ${user.isAdmin ? 'checked' : ''}
                                   onchange="adminPanel.toggleAdmin('${user.id}', this.checked)">
                            Админ
                        </label>
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
                item.innerHTML = `
                    <span>${employee}</span>
                    <button class="remove-btn" onclick="adminPanel.removeEmployee('${employee.replace(/'/g, "\\'")}')">×</button>
                `;
                list.appendChild(item);
            });
        }
        
        employeesSection.appendChild(list);
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
            this.renderRegisteredEmployeesList();
            this.updateScheduleApp();
            input.value = '';
        } else {
            alert('Ошибка при добавлении сотрудника');
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
    }

    updateScheduleApp() {
        if (window.scheduleApp) {
            window.scheduleApp.loadRegisteredEmployees().then(() => {
                window.scheduleApp.render();
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});
