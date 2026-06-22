// private/lib/storage.js
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const multer = require('multer');

const usersDir = path.join(__dirname, '..', 'users');

const getUserPath = (username) => {
    const userFolder = path.join(usersDir, username);
    return {
        folder: userFolder,
        data: path.join(userFolder, 'user.json'),
        uploads: path.join(userFolder, 'uploads', 'images.json')
    };
};

const readUserData = (username) => {
    const { data } = getUserPath(username);
    if (!fs.existsSync(data)) {
        return null;
    }
    
    try {
        const fileContent = fs.readFileSync(data, 'utf8');
        if (!fileContent || fileContent.trim() === '') {
            console.warn(`User data file for ${username} is empty, returning null`);
            return null;
        }
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Error reading user data for ${username}:`, error.message);
        return null;
    }
};

const writeUserData = (username, userData) => {
    const { data: dataPath } = getUserPath(username);
    fs.writeFileSync(dataPath, JSON.stringify(userData, null, 2));
};

const createUser = async (username, password) => {
    const { folder } = getUserPath(username);
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        const uploadsDir = path.join(folder, 'uploads');
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, 'images.json'), '[]');
    }
    const hash = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS, 10) || 12);
    writeUserData(username, {
        username,
        password: hash,
        points: 0,
        logoPreferences: {},
        color: "#ffffff", // default color
        collectedStamps: {} // Initialize collectedStamps for new users
    });
};

const recoverUserData = async (username, newPassword) => {
    const { folder, data } = getUserPath(username);
    
    // Ensure user folder exists
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        const uploadsDir = path.join(folder, 'uploads');
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, 'images.json'), '[]');
    }
    
    // Create new user data with provided password
    const hash = await bcrypt.hash(newPassword, parseInt(process.env.SALT_ROUNDS, 10) || 12);
    const userData = {
        username,
        password: hash,
        points: 0,
        logoPreferences: {},
        color: "#ffffff",
        collectedStamps: {} // Initialize collectedStamps for recovered users
    };
    
    writeUserData(username, userData);
    console.log(`Recovered user data for ${username}`);
    return userData;
};

const fileUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = path.join(usersDir, req.session.user.username, 'uploads');
            fs.mkdirSync(uploadDir, { recursive: true });
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

module.exports = {
    getUserPath,
    readUserData,
    writeUserData,
    createUser,
    recoverUserData,
    fileUpload
};
