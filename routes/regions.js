import express from "express";
import getDashboardWidgets from "../controllers/main/regionsController.js";

const router = express.Router();

router.get("/widgets", getDashboardWidgets); 

export default router;

