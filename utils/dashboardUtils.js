// export function calculateTotalAmount(tariffs, consumptionValue) {
//     let amount1 = 0;
//     let chargedUnits = consumptionValue;
//     let tariff_name = '';

//     for (const tariff of tariffs) {
//         const startValue = parseInt(tariff.start_value);
//         const endValue = parseInt(tariff.end_value);
//         const rate = parseFloat(tariff.rate);
//         if (chargedUnits > 0) {
//             if (
//                 consumptionValue >= startValue &&
//                 consumptionValue <= endValue
//             ) {
//                 amount1 += (consumptionValue - startValue + 1) * rate;
//                 tariff_name = tariff.tariff_name;
//                 chargedUnits = 0;
//             } else if (consumptionValue > endValue) {
//                 amount1 += (endValue - startValue + 1) * rate;
//                 chargedUnits -= endValue - startValue + 1;
//                 tariff_name = tariff.tariff_name;
//             }
//         }
//     }

//     return { amount: amount1.toFixed(2), tariff: tariff_name };
// }

export function calculateTotalAmount(consumptionValue, consumer_type) {
    let amount = 0;
    let tariff_name = '';

    const tariffs = [
        { Residential: { rate: 8.5, tariff_name: 'Residential' } },
        { Commercial: { rate: 10.5, tariff_name: 'Commercial' } },
    ];

    const tariffEntry = tariffs.find((tariff) =>
        tariff.hasOwnProperty(consumer_type)
    );

    if (!tariffEntry) {
        return { amount: '0.00', tariff: '' };
    }

    const { rate, tariff_name: name } = tariffEntry[consumer_type];

    amount = consumptionValue * rate;
    tariff_name = name;

    return { amount: amount.toFixed(2), tariff: tariff_name };
}

export function getBillPayDate(daysToAdd = 5) {
    const currentDate = new Date();
    const millisecondsToAdd = daysToAdd * 24 * 60 * 60 * 1000;
    const billPayDate = new Date(currentDate.getTime() + millisecondsToAdd);

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return formatDate(billPayDate);
}

export function generateInvoiceNumber() {
    const prefix = 'INV';
    const now = new Date();
    const isoString = now.toISOString();
    const datePart = isoString.slice(0, 10).replace(/-/g, '');
    const timePart = isoString.slice(11, 19).replace(/:/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000);

    return `${prefix}${datePart.substring(2)}${timePart}${randomPart}`;
}

export function generateBillingStatement() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const formatDate = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${year}-${month}-${day}`;
    };

    return `${formatDate(startOfMonth)} - ${formatDate(endOfMonth)}`;
}

export function getDateInYMDFormat() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export const getDateInMDYFormat = (dateString) => {
    const options = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    };
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', options);
};

export const getDateInMYFormat = (dateString) => {
    const options = {
        month: 'short',
        year: 'numeric',
    };
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', options);
};

export function sortAndFillData(data) {
    if (!data || data.length === 0) {
        return [];
    }

    const parsedData = data.map((item) => {
        if (!item.consumption_date) {
            throw new Error('Item is missing the consumption_date property');
        }

        const parts = item.consumption_date.split('-').map(Number);
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
            throw new Error(
                `Invalid consumption_date format: ${item.consumption_date}`
            );
        }
        const [year, month] = parts;
        return { ...item, year, month };
    });

    parsedData.sort((a, b) => {
        if (a.year === b.year) {
            return a.month - b.month;
        }
        return a.year - b.year;
    });

    const startDate = parsedData[0];
    const endDate = parsedData[parsedData.length - 1];

    const filledData = [];
    let currentYear = startDate.year;
    let currentMonth = startDate.month;

    for (const item of parsedData) {
        while (
            currentYear < item.year ||
            (currentYear === item.year && currentMonth < item.month)
        ) {
            filledData.push({
                consumption_date: `${currentYear}-${String(
                    currentMonth
                ).padStart(2, '0')}`,
                count: 0,
                sum: 0,
            });

            currentMonth++;
            if (currentMonth > 12) {
                currentMonth = 1;
                currentYear++;
            }
        }

        filledData.push({
            consumption_date: item.consumption_date,
            count: item.count,
            sum: item.sum,
        });

        currentMonth = item.month + 1;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
    }

    return filledData.filter((item) => {
        const [year, month] = item.consumption_date.split('-').map(Number);
        return (
            (year > startDate.year ||
                (year === startDate.year && month >= startDate.month)) &&
            (year < endDate.year ||
                (year === endDate.year && month <= endDate.month))
        );
    });
}

export function formatDateDMY(date) {
    const day = ('0' + date.getDate()).slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

export function formatDateYMD(date) {
    const day = ('0' + date.getDate()).slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
}

export function calculatePercentageIncrease(lastMonth, thisMonth) {
    const lastValue = Number(lastMonth) || 0;
    const currentValue = Number(thisMonth) || 0;

    if (lastValue === 0 && currentValue === 0) {
        return 0;
    }

    if (lastValue === 0) {
        return 100;
    }

    const percentage = ((currentValue - lastValue) / Math.abs(lastValue)) * 100;

    if (!isFinite(percentage)) {
        return currentValue > lastValue ? 100 : -100;
    }

    if (percentage > 1000) {
        return 1000;
    }
    if (percentage < -1000) {
        return -1000;
    }

    return percentage;
}

// Converts an array of objects with a 'month' property in the format 'YYYY-MM' to an array of objects with a 'month' property in the format 'MMM YYYY'
export function formatDatesMY(data) {
    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];

    return data.map((item) => {
        const [year, month] = item.month.split('-');

        const monthName = months[parseInt(month) - 1];

        return {
            ...item,
            month: `${monthName} ${year}`,
        };
    });
}

export const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}-${String(
        d.getMonth() + 1
    ).padStart(2, '0')}-${d.getFullYear()}`;
};

export const calculateTotalOutstanding = (pending, overdue) => {
    const pendingAmount = parseFloat(pending ?? 0).toFixed(2);
    const overdueAmount = parseFloat(overdue ?? 0).toFixed(2);

    const total = parseFloat(pendingAmount) + parseFloat(overdueAmount);

    return parseFloat(total.toFixed(2));
};

export function convertToIST(dateString) {
    const date = new Date(dateString);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

export const transformMeters = (metersArray, activeFlag) => {
    if (activeFlag === 'comm') {
        return metersArray.map((meter) => meter.meter_serial_no);
    } else {
        return metersArray.map((meter) => meter.meter_serial);
    }
};

export const safeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
};

export const formatDecimal = (value) => {
    const num = safeNumber(value);
    return num.toFixed(2);
};

export const formatPercentage = (value) => {
    const num = safeNumber(value);
    // Prevent -0.00 display
    return num === 0 ? '0.00' : num.toFixed(2);
};

export function calculatePercentage(value, total) {
    const numValue = Number(value);
    const numTotal = Number(total);

    if (isNaN(numValue) || isNaN(numTotal)) {
        return 0;
    }

    if (numTotal === 0) {
        return 0;
    }

    const percentage = (numValue / numTotal) * 100;

    return percentage.toFixed(2);
}

export function fillMissingDatesDyno(
    dates,
    values,
    outputFormat = 'DD MMM, YYYY',
    granularity = 'day'
) {
    if (!dates || !values || dates.length === 0 || values.length === 0) {
        return { dates: [], values: [] };
    }

    const numericValues = values.map((v) =>
        typeof v === 'string' ? parseFloat(v) : v
    );

    const datePairs = dates.map((dateStr, i) => {
        return {
            date: new Date(dateStr),
            value: numericValues[i],
        };
    });

    datePairs.sort((a, b) => a.date - b.date);

    let startDate = new Date(datePairs[0].date);

    if (granularity === 'month') {
        const minStartDate = new Date();
        minStartDate.setDate(1);
        minStartDate.setMonth(minStartDate.getMonth() - 12);

        if (startDate > minStartDate) {
            startDate = minStartDate;
        }
    }

    let endDate;
    if (granularity === 'day') {
        endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
    } else {
        endDate = new Date();
    }

    function getDateKey(date, granularity) {
        if (granularity === 'day') {
            return `${date.getFullYear()}-${(date.getMonth() + 1)
                .toString()
                .padStart(2, '0')}-${date
                .getDate()
                .toString()
                .padStart(2, '0')}`;
        } else {
            return `${date.getFullYear()}-${(date.getMonth() + 1)
                .toString()
                .padStart(2, '0')}`;
        }
    }

    function formatDate(date, format) {
        if (format === 'DD MMM, YYYY') {
            const day = date.getDate().toString().padStart(2, '0');
            const monthNames = [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec',
            ];
            const month = monthNames[date.getMonth()];
            const year = date.getFullYear();
            return `${day} ${month}, ${year}`;
        } else {
            return `${date.getFullYear()}-${(date.getMonth() + 1)
                .toString()
                .padStart(2, '0')}-${date
                .getDate()
                .toString()
                .padStart(2, '0')}`;
        }
    }

    const dateValueMap = new Map();
    datePairs.forEach((pair) => {
        const key = getDateKey(pair.date, granularity);
        dateValueMap.set(key, pair.value);
    });

    const result = {
        dates: [],
        values: [],
    };

    const currentDate = new Date(startDate);

    if (granularity === 'month') {
        currentDate.setDate(1);
    }

    while (currentDate <= endDate) {
        const key = getDateKey(currentDate, granularity);

        result.dates.push(formatDate(currentDate, outputFormat));
        result.values.push(dateValueMap.has(key) ? dateValueMap.get(key) : 0.0);

        if (granularity === 'day') {
            currentDate.setDate(currentDate.getDate() + 1);
        } else {
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }

    return result;
}

function getDateKey(date, granularity) {
    if (granularity === 'month') {
        return `${date.getFullYear()}-${date.getMonth() + 1}`;
    } else {
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    }
}

function formatDates(date) {
    const day = date.getDate();
    const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month}, ${year}`;
}

export function fillMissingReadingDates(data) {
    const dates = data.readingsxAxisData;
    const values = data.readingssums;
    const startDate = new Date(dates[0]);
    const endDate = new Date();
    const completeDates = [];
    const completeValues = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const formattedDate = `${currentDate.toLocaleDateString('en-US', {
            month: 'short',
        })} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
        const originalIndex = dates.indexOf(formattedDate);
        completeDates.push(formattedDate);
        completeValues.push(
            originalIndex !== -1 ? values[originalIndex] : '0.0'
        );
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return {
        dailyxAxisData: completeDates,
        dailysums: completeValues,
    };
}

export function fillMissingMDData(data, startDateStr) {
    const parsedStartDate = new Date(startDateStr);
    const endDate = new Date();
    const dateMap = new Map(data.map((item) => [item.date, { ...item }]));
    const result = [];
    const currentDate = new Date(parsedStartDate);
    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;
        if (dateMap.has(isoDate)) {
            result.push(dateMap.get(isoDate));
        } else {
            result.push({
                date: isoDate,
                count: 0,
                value: '0.000',
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return result;
}

export function predictFutureValues(
    data,
    targetDates,
    currentDate = new Date()
) {
    const currentDateStr = `${currentDate.toLocaleString('en-US', {
        month: 'short',
    })} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;

    const yAxisNumeric = data.yAxis.map((val) => {
        return typeof val === 'string' ? parseFloat(val) : val;
    });

    const validYValues = yAxisNumeric.filter((val) => !isNaN(val) && val !== 0);

    const recentValues = validYValues.slice(-7);
    const avgValue =
        recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;

    const regressionData = [];
    const validDataPoints = Math.min(14, validYValues.length);
    const dataStartIndex = validYValues.length - validDataPoints;

    for (let i = 0; i < validDataPoints; i++) {
        regressionData.push({
            x: i,
            y: yAxisNumeric[dataStartIndex + i],
        });
    }

    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumXX = 0;
    for (const point of regressionData) {
        sumX += point.x;
        sumY += point.y;
        sumXY += point.x * point.y;
        sumXX += point.x * point.x;
    }

    const n = regressionData.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const result = {
        xAxis: targetDates,
        yAxis: [],
        actualData: [],
        predictedData: [],
    };

    const currentDateIndex = targetDates.findIndex(
        (date) => date === currentDateStr
    );

    const existingDataMap = {};
    data.xAxis.forEach((date, index) => {
        existingDataMap[date] = yAxisNumeric[index];
    });

    targetDates.forEach((date, index) => {
        if (date in existingDataMap && !isNaN(existingDataMap[date])) {
            result.yAxis.push(existingDataMap[date]);
            result.actualData.push({
                date: date,
                value: existingDataMap[date],
            });
        } else {
            const daysFromLastActual = index - (data.xAxis.length - 1);

            const predictedValue =
                intercept + slope * (validDataPoints + daysFromLastActual);

            const finalPrediction = Math.max(predictedValue, 0).toFixed(2);

            result.yAxis.push(parseFloat(finalPrediction));
            result.predictedData.push({
                date: date,
                value: parseFloat(finalPrediction),
            });
        }
    });

    return result;
}

export const isZero = (value) => {
    if (value === null || value === undefined || value === '') return true;
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return Math.abs(numValue) < 0.001;
};

export const calculateDTRPercentage = (value, total = 500.0) => {
    return (value / total) * 100;
};
