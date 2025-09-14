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
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Load schedule data from Firebase
async function loadScheduleData() {
    try {
        const snapshot = await db.ref('data').once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Ошибка загрузки из Firebase:', error);
        throw error;
    }
}

// Save user data to Firebase
async function saveUserData(userId, data) {
    try {
        await db.ref('users/' + userId).set(data);
        return true;
    } catch (error) {
        console.error('Ошибка сохранения в Firebase:', error);
        throw error;
    }
}

// Load user data from Firebase
async function loadUserData(userId) {
    try {
        const snapshot = await db.ref('users/' + userId).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
        return null;
    }
}

// Load all users from Firebase
async function loadAllUsers() {
    try {
        const snapshot = await db.ref('users').once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        return {};
    }
}

// Load employee links from Firebase
async function loadEmployeeLinks() {
    try {
        const snapshot = await db.ref('employeeLinks').once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Ошибка загрузки привязок:', error);
        return {};
    }
}

// Save employee link to Firebase
async function saveEmployeeLink(telegramId, employeeId) {
    try {
        await db.ref('employeeLinks/' + telegramId).set({
            telegramId: telegramId,
            employeeId: parseInt(employeeId),
            linkedAt: new Date().toISOString()
        });
        return true;
    } catch (error) {
        console.error('Ошибка сохранения привязки:', error);
        throw error;
    }
}

// Register new user
async function registerUser(userId, userData) {
    try {
        await db.ref('users/' + userId).set({
            ...userData,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            isAdmin: userId == 1999947340
        });
        return true;
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        throw error;
    }
}

// Update user last seen
async function updateUserLastSeen(userId) {
    try {
        await db.ref('users/' + userId + '/lastSeen').set(new Date().toISOString());
    } catch (error) {
        console.error('Ошибка обновления:', error);
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
    updateUserLastSeen 
};
