import express from 'express';
import { upload, uploadProfileImage} from '../controllers/main/profileController.js';

const router = express.Router();

router.post('/edit/image', upload.single('image'), uploadProfileImage);
//router.get('/image/:userId', getProfileImage);

export default router;
