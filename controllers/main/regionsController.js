import pool from "../../config/db.js";
import regionsModel from "../../models/main/regions.model.js";
import models from "../../models/main/regions.model.js";
import logger from "../../utils/logger.js";

export const getDashboardWidgets = async (req, res) => {
    try {
        const totalRegions = await models.regions.getTotalRegions(pool);
        const totalEdcs = await models.edcs.getTotalEdcs(pool);
        const totalSubstations = await models.substations.getTotalSubstations(pool);
        const totalFeeders = await models.feeders.getTotalFeeders(pool); 
        const commMeters = await models.commMeters.getCommMeters(pool);
        const nonCommMeters = await models.nonCommMeters.getNonCommMeters(pool);
        const regionNames = await models.regionDetails.getRegionNames(pool);
        const regionEdcCounts = await models.regionDetails.getRegionEdcCounts(pool);
        const regionSubstationCounts = await models.regionDetails.getRegionSubstationCounts(pool);
        const regionFeederCounts = await models.regionDetails.getRegionFeederCounts(pool);

        res.status(200).json({
            status: "success",
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
                regionFeederCounts 
            },
        });
    } catch (error) {
        logger.error("Error fetching dashboard widgets:", {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: "error", message: "Server Error" });
    }
};

export const getRegionStats = async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const regions = await regionDetails.getRegionNames(connection);

        let regionStats = {};

        for (const region of regions) {
            const [[{ hierarchy_id }]] = await connection.query(
                `SELECT hierarchy_id FROM hierarchy WHERE hierarchy_name = ?;`,
                [region]
            );

            const regionId = hierarchy_id;

            const edcCount = await regionDetails.getEdcCount(connection, regionId);
            const districtCount = await regionDetails.getDistrictCount(connection, regionId);
            const substationCount = await regionDetails.getSubstationCount(connection, regionId);
            const feederCount = await regionDetails.getFeederCount(connection, regionId);
            const meterCount = await regionDetails.getMeterCount(connection, regionId);

            regionStats[region] = {
                edcCount,
                districtCount,
                substationCount,
                feederCount,
                meterCount
            };
        }

        connection.release();

        res.status(200).json({
            status: "success",
            data: { regionStats }
        });
    } catch (error) {
        console.error("Error fetching region statistics:", error);
        res.status(500).json({ status: "error", message: "Server Error" });
    }
}
export const searchConsumers = async (req, res) => {
    try {
        const accessValues = req.locationAccess?.values || [];
        const searchTerm = req.query.term || '';

        const searchResults = await regionsModel.regionDetails.getSearch(pool, accessValues, searchTerm);

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