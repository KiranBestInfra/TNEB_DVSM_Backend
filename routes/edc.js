import express from "express";
import getEDCWidgets from "../controllers/main/edcsController.js";

const router = express.Router();

router.get("/widgets", getEDCWidgets); 

export default router;
