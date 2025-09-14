// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAbLz1MnfjYIQMDkmqgMa09Z3W_j8dnJbM",
    authDomain: "database-a9dee.firebaseapp.com",
    databaseURL: "https://database-a9dee-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "database-a9dee",
    storageBucket: "database-a9dee.firebasestorage.app",
    messagingSenderId: "68358730239",
    appId: "1:68358730239:web:21d9e409f80df8e815b7ca"
};

// Initialize Firebase
let db;
try {
    const app = firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    console.log('Firebase успешно инициализирован');
} catch (error) {
    console.error('Ошибка инициализации Firebase:', error);
}

// Load schedule data from Firebase
async function loadScheduleData() {
    try {
        console.log('Загрузка данных расписания...');
        const snapshot = await db.ref('data').once('value');
        const data = snapshot.val();
        console.log('Данные расписания загружены:', data);
        return data;
    } catch (error) {
        console.error('Ошибка загрузки из Firebase:', error);
        throw error;
    }
}

// Save user data to Firebase
async function saveUserData(userId, data) {
    try {
        console.log('Сохранение данных пользователя:', userId, data);
        await db.ref('users/' + userId).set(data);
        console.log('Данные пользователя сохранены');
        return true;
    } catch (error) {
        console.error('Ошибка сохранения в Firebase:', error);
        throw error;
    }
}

// Load user data from Firebase
async function loadUserData(userId) {
    try {
        console.log('Загрузка данных пользователя:', userId);
        const snapshot = await db.ref('users/' + userId).once('value');
        const data = snapshot.val();
        console.log('Данные пользователя получены:', data);
        return data;
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
        return null;
    }
}

// Load all users from Firebase
async function loadAllUsers() {
    try {
        console.log('Загрузка всех пользователей...');
        const snapshot = await db.ref('users').once('value');
        const data = snapshot.val() || {};
        console.log('Все пользователи загружены:', Object.keys(data).length);
        return data;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        return {};
    }
}

// Load employee links from Firebase
async function loadEmployeeLinks() {
    try {
        console.log('Загрузка привязок сотрудников...');
        const snapshot = await db.ref('employeeLinks').once('value');
        const data = snapshot.val() || {};
        console.log('Привязки сотрудников загружены:', Object.keys(data).length);
        return data;
    } catch (error) {
        console.error('Ошибка загрузки привязок:', error);
        return {};
    }
}

// Save employee link to Firebase
async function saveEmployeeLink(telegramId, employeeId) {
    try {
        console.log('Сохранение привязки:', telegramId, '->', employeeId);
        await db.ref('employeeLinks/' + telegramId).set({
            telegramId: telegramId,
            employeeId: parseInt(employeeId),
            linkedAt: new Date().toISOString()
        });
        console.log('Привязка сохранена');
        return true;
    } catch (error) {
        console.error('Ошибка сохранения привязки:', error);
        throw error;
    }
}

// Register new user
async function registerUser(userId, userData) {
    try {
        console.log('Регистрация пользователя:', userId);
        const userDataWithTimestamps = {
            ...userData,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            isAdmin: userId == 1999947340,
            registeredAt: new Date().toISOString()
        };
        
        await db.ref('users/' + userId).set(userDataWithTimestamps);
        console.log('Пользователь зарегистрирован');
        return true;
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        throw error;
    }
}

// Update user last seen
async function updateUserLastSeen(userId) {
    try {
        console.log('Обновление времени входа пользователя:', userId);
        await db.ref('users/' + userId + '/lastSeen').set(new Date().toISOString());
        console.log('Время входа обновлено');
    } catch (error) {
        console.error('Ошибка обновления:', error);
    }
}

// Test connection
async function testFirebaseConnection() {
    try {
        console.log('Тестирование подключения к Firebase...');
        const testRef = db.ref('testConnection');
        await testRef.set({
            timestamp: new Date().toISOString(),
            message: 'Test connection from Telegram app'
        });
        
        const snapshot = await testRef.once('value');
        console.log('Тест подключения успешен:', snapshot.val());
        await testRef.remove();
        return true;
    } catch (error) {
        console.error('Тест подключения не удался:', error);
        return false;
    }
}

export { 
    db, 
    loadScheduleData, 
    saveUserData, 
    loadUserData, 
    loadAllUsers, 
    loadEmployeeLinks, 
    saveEmployeeLink, 
    registerUser, 
    updateUserLastSeen,
    testFirebaseConnection
};
