import pool from '../../config/db.js';
import EDCs from '../../models/main/edcs.model.js';

// import logger from "../../utils/logger.js";

export const getEDCWidgets = async (req, res) => {
    try {
        const region = req.params.region;

        if (!region) {
            return res.status(400).json({
                status: 'error',
                message: 'Region parameter is missing',
            });
        }

        const edcNames = await EDCs.getEdcNamesByRegion(pool, region);
        const substationCounts = await EDCs.getSubstationCountByRegion(
            pool,
            region
        );
        const feederCounts = await EDCs.getEdcFeederCounts(pool, region);
        res.status(200).json({
            status: 'success',
            data: {
                region,
                edcNames,
                substationCounts,
                feederCounts,
            },
        });
    } catch (error) {
        console.error('❌ Error fetching EDC names:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export default getEDCWidgets;
