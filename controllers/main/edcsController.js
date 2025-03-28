import pool from "../../config/db.js";
import models from "../../models/main/edcs.model.js";
import logger from "../../utils/logger.js";

export const getEDCWidgets = async (req, res) => {
    try {
        const edcNames = await models.edcDetails.getEdcNames(pool);

        res.status(200).json({
            status: "success",
            data: { 
                edcNames
            },
        });
    } catch (error) {
        logger.error("Error fetching EDC widgets:", {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: "error", message: "Server Error" });
    }
};
export default getEDCWidgets;