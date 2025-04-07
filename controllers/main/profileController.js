import multer from 'multer';
// import path from 'path';
import fs from 'fs';
import pool from '../../config/db.js';

// Configure multer for file upload
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         const uploadDir = 'uploads/profile';
//         if (!fs.existsSync(uploadDir)) {
//             fs.mkdirSync(uploadDir, { recursive: true });
//         }
//         cb(null, uploadDir);
//     },
//     filename: function (req, file, cb) {
//         const uniqueSuffix = uuidv4() + path.extname(file.originalname);
//         cb(null, uniqueSuffix);
//     }
// });

const upload = multer({ dest: 'uploads/' })

const uploadProfileImage = async (req, res) => {
    try {

        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'No file uploaded'
            });
        }

        const userId = req.user.userId;
        const imagePath = req.file.path;

        await pool.query(
            'UPDATE user SET user_image = ? WHERE user_id = ?',
            [imagePath, userId]
        );

        return res.status(200).json({
            status: 'success',
            message: 'Profile image updated successfully',
            // data: {
            //     imagePath: imagePath
            // }
        });
    } catch (error) {
        console.error('Profile image upload error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'An unexpected error occurred while uploading profile image'
        });
    }
};

export { uploadProfileImage, upload }; 