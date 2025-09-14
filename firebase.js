import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getDatabase, ref, get, set } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// Конфиг Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAbLz1MnfjYIQMDkmqgMa09Z3W_j8dnJbM",
  authDomain: "database-a9dee.firebaseapp.com",
  databaseURL: "https://database-a9dee-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "database-a9dee",
  storageBucket: "database-a9dee.firebasestorage.app",
  messagingSenderId: "68358730239",
  appId: "1:68358730239:web:21d9e409f80df8e815b7ca"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Загрузка данных графика
async function loadScheduleData() {
  try {
    const snapshot = await get(ref(db, 'data'));
    return snapshot.val();
  } catch (error) {
    console.error('Ошибка загрузки из Firebase:', error);
    throw error;
  }
}

// Сохранение пользовательских данных
async function saveUserData(userId, data) {
  try {
    await set(ref(db, 'users/' + userId), data);
    return true;
  } catch (error) {
    console.error('Ошибка сохранения в Firebase:', error);
    throw error;
  }
}

// Получение данных пользователя
async function loadUserData(userId) {
  try {
    const snapshot = await get(ref(db, 'users/' + userId));
    return snapshot.val();
  } catch (error) {
    console.error('Ошибка загрузки пользователя:', error);
    return null;
  }
}

export { db, ref, get, set, loadScheduleData, saveUserData, loadUserData };
