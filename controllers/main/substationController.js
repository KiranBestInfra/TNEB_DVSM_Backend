import pool from '../../config/db.js';
import Substations from '../../models/main/substations.model.js';

// import logger from "../../utils/logger.js";

export const getSubstationWidgets = async (req, res) => {
    try {
        const region = req.params.region;

        if (!region) {
            return res.status(400).json({
                status: 'error',
                message: 'Region parameter is missing',
            });
        }

        const substationNames = await Substations.getSubstationNamesByRegion(
            pool,
            region
        );

        res.status(200).json({
            status: 'success',
            data: {
                region,
                substationNames,
            },
        });
    } catch (error) {
        console.error('❌ Error fetching EDC names:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export default getSubstationWidgets;
