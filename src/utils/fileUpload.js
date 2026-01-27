const multer = require('multer');

// Configure Multer to use memory storage
// This is best for serverless or when uploading to cloud storage (Azure/S3) immediately
const storage = multer.memoryStorage();

const fileUpload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

module.exports = fileUpload;
