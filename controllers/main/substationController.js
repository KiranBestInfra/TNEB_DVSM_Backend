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

        // Fetch substation names and feeder counts
        const substationNames = await Substations.getSubstationNamesByRegion(
            pool,
            region
        );
        const feederCounts = await Substations.getFeederCountBySubstation(
            pool,
            region
        );

        // If feederCounts is an object, transform it as needed
        const substationFeederCounts = Array.isArray(feederCounts)
            ? feederCounts.reduce((acc, feeder) => {
                  acc[feeder.substation_name] = feeder.feeder_count;
                  return acc;
              }, {})
            : feederCounts; // Handle if it's already an object

        // Return the response
        res.status(200).json({
            status: 'success',
            data: {
                region,
                substationNames,
                substationFeederCounts,
            },
        });
    } catch (error) {
        console.error('❌ Error fetching substation widgets:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export default getSubstationWidgets;
