import { firebaseService } from './firebase.js';

class AdminPanel {
    constructor() {
        this.users = {};
        this.init();
    }

    async init() {
        await this.loadUsers();
        this.renderUsersList();
    }

    async loadUsers() {
        this.users = await firebaseService.getAllUsers();
    }

    renderUsersList() {
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';

        Object.values(this.users).forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            
            userElement.innerHTML = `
                <div class="user-info">
                    <strong>${user.firstName || ''} ${user.lastName || ''}</strong>
                    <div>@${user.username || 'нет username'}</div>
                    <div>ID: ${user.id}</div>
                </div>
                <div>
                    <input type="text" 
                           class="user-name-input" 
                           placeholder="Имя из таблицы"
                           value="${user.sheetNames ? user.sheetNames.join(', ') : ''}"
                           onchange="adminPanel.updateUserNames(${user.id}, this.value)">
                </div>
                <div>
                    <label>
                        <input type="checkbox" 
                               class="admin-checkbox"
                               ${user.isAdmin ? 'checked' : ''}
                               onchange="adminPanel.toggleAdmin(${user.id}, this.checked)">
                        Админ
                    </label>
                </div>
            `;
            
            usersList.appendChild(userElement);
        });
    }

    async updateUserNames(userId, namesString) {
        const sheetNames = namesString.split(',').map(name => name.trim()).filter(name => name);
        await firebaseService.updateUser(userId, { sheetNames });
    }

    async toggleAdmin(userId, isAdmin) {
        await firebaseService.updateUser(userId, { isAdmin });
    }
}

// Глобальная переменная для доступа из HTML
window.adminPanel = new AdminPanel();
