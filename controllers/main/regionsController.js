import pool from '../../config/db.js';
import REGIONS from '../../models/main/regions.model.js';
import EDCS from '../../models/main/edcs.model.js';
import SUBSTATIONS from '../../models/main/substations.model.js';
import FEEDERS from '../../models/main/feeders.model.js';
import logger from '../../utils/logger.js';

export const getDashboardWidgets = async (req, res) => {
    try {
        const totalRegions = await REGIONS.getTotalRegions(pool);
        const totalEdcs = await EDCS.getTotalEdcs(pool);
        const totalSubstations = await SUBSTATIONS.getTotalSubstations(pool);
        const totalFeeders = await FEEDERS.getTotalFeeders(pool);
        const commMeters = await REGIONS.getCommMeters(pool);
        const nonCommMeters = await REGIONS.getNonCommMeters(pool);
        const regionNames = await REGIONS.getRegionNames(pool);
        const regionEdcCounts = await REGIONS.getRegionEdcCounts(pool);
        const regionSubstationCounts = await REGIONS.getRegionSubstationCounts(
            pool
        );
        const regionFeederCounts = await REGIONS.getRegionFeederCounts(pool);

        res.status(200).json({
            status: 'success',
            data: {
                totalRegions,
                totalEdcs,
                totalSubstations,
                totalFeeders,
                commMeters,
                nonCommMeters,
                regionNames,
                regionEdcCounts,
                regionSubstationCounts,
                regionFeederCounts,
            },
        });
    } catch (error) {
        logger.error('Error fetching dashboard widgets:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export const getRegionStats = async (req, res) => {
    try {
        const regions = await REGIONS.getRegionNames(connection);

        let regionStats = {};

        for (const region of regions) {
            const [[{ hierarchy_id }]] = await pool.query(
                `SELECT hierarchy_id FROM hierarchy WHERE hierarchy_name = ?;`,
                [region]
            );

            const regionId = hierarchy_id;

            const edcCount = await EDCS.getEdcCount(pool, regionId);
            const districtCount = await REGIONS.getDistrictCount(
                pool,
                regionId
            );
            const substationCount = await REGIONS.getSubstationCount(
                pool,
                regionId
            );
            const feederCount = await REGIONS.getFeederCount(pool, regionId);
            const meterCount = await REGIONS.getMeterCount(pool, regionId);

            regionStats[region] = {
                edcCount,
                districtCount,
                substationCount,
                feederCount,
                meterCount,
            };
        }

        res.status(200).json({
            status: 'success',
            data: { regionStats },
        });
    } catch (error) {
        console.error('Error fetching region statistics:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
}

export const searchConsumers = async (req, res) => {
    try {
        const accessValues = req.locationAccess?.values || [];
        const searchTerm = req.query.term || '';

        const searchResults = await REGIONS.getSearch(pool, accessValues, searchTerm);

        res.status(200).json({
            status: 'success',
            data: searchResults,
        });
    } catch (error) {
        logger.error('Error searching consumers', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export default {
    getDashboardWidgets,
    getRegionStats,
    searchConsumers
};