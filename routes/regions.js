import express from "express";
import { getDashboardWidgets, searchConsumers } from "../controllers/main/regionsController.js";

const router = express.Router();

router.get("/widgets", getDashboardWidgets); 
router.get("/search", searchConsumers); 



export default router;

