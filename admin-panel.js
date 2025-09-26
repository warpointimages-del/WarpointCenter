import { firebaseService } from './firebase.js';

class AdminPanel {
    constructor() {
        this.users = {};
        this.init();
    }

    async init() {
        await this.loadUsers();
        this.renderUsersList();
        this.updateRegisteredEmployees();
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
            userElement.id = `user-${user.id}`;
            
            const sheetNames = user.sheetNames || [];
            
            userElement.innerHTML = `
                <div class="user-info">
                    <strong>${user.firstName || ''} ${user.lastName || ''}</strong>
                    <div>@${user.username || 'нет username'}</div>
                    <div>ID: ${user.id}</div>
                    <div class="attached-names">
                        <strong>Привязанные имена:</strong>
                        ${sheetNames.length > 0 ? 
                            sheetNames.map(name => `
                                <span class="attached-name">
                                    ${name}
                                    <button class="unlink-btn" onclick="adminPanel.unlinkName('${user.id}', '${name.replace(/'/g, "\'")}')">×</button>
                                </span>
                            `).join('') : 
                            '<span class="no-names">нет привязанных имен</span>'
                        }
                    </div>
                </div>
                <div class="user-controls">
                    <div class="name-input-group">
                        <input type="text" 
                               class="user-name-input" 
                               id="input-${user.id}"
                               placeholder="Имя из таблицы">
                        <button class="link-btn" onclick="adminPanel.linkName(${user.id})">Привязать</button>
                    </div>
                    <div class="admin-control">
                        <label>
                            <input type="checkbox" 
                                   class="admin-checkbox"
                                   ${user.isAdmin ? 'checked' : ''}
                                   onchange="adminPanel.toggleAdmin(${user.id}, this.checked)">
                            Админ
                        </label>
                    </div>
                </div>
            `;
            
            usersList.appendChild(userElement);
        });
    }

    async linkName(userId) {
        const input = document.getElementById(`input-${userId}`);
        const name = input.value.trim();
        
        if (!name) {
            alert('Введите имя сотрудника');
            return;
        }

        const user = this.users[userId];
        const currentNames = user.sheetNames || [];
        
        if (currentNames.includes(name)) {
            alert('Это имя уже привязано к пользователю');
            return;
        }

        const updatedNames = [...currentNames, name];
        await firebaseService.updateUser(userId, { sheetNames: updatedNames });
        
        this.users[userId].sheetNames = updatedNames;
        input.value = '';
        
        this.renderUsersList();
        this.updateRegisteredEmployees();
    }

    async unlinkName(userId, nameToRemove) {
        const user = this.users[userId];
        const updatedNames = user.sheetNames.filter(name => name !== nameToRemove);
        
        await firebaseService.updateUser(userId, { sheetNames: updatedNames });
        this.users[userId].sheetNames = updatedNames;
        
        this.renderUsersList();
        this.updateRegisteredEmployees();
    }

    async toggleAdmin(userId, isAdmin) {
        await firebaseService.updateUser(userId, { isAdmin });
        this.users[userId].isAdmin = isAdmin;
    }

updateRegisteredEmployees() {
    const allEmployees = new Set();
    
    Object.values(this.users).forEach(user => {
        if (user.sheetNames && Array.isArray(user.sheetNames)) {
            user.sheetNames.forEach(name => allEmployees.add(name.trim()));
        }
    });
    
    window.registeredEmployees = Array.from(allEmployees);
    console.log('Обновленные зарегистрированные сотрудники:', window.registeredEmployees);
    
    // Автоматически обновляем отображение графика
    if (window.scheduleApp) {
        window.scheduleApp.loadAllUsersData().then(() => {
            window.scheduleApp.render();
        });
    }
}

window.adminPanel = new AdminPanel();
