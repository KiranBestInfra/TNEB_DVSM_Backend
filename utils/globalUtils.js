import moment from 'moment-timezone';

const timezone = 'Asia/Kolkata';

export function getISTTime() {
    const now = moment(timezone).tz();
    return now;
}

export function getTodayStartAndEnd() {
    const startOfDay = moment()
        .tz(timezone)
        .startOf('day')
        .format('YYYY-MM-DD HH:mm:ss');

    const endOfDay = moment()
        .tz(timezone)
        .endOf('day')
        .format('YYYY-MM-DD HH:mm:ss');

    return { startOfDay, endOfDay };
}

export function getYesterdayStartAndEnd() {
    const startOfYesterday = moment()
        .tz(timezone)
        .subtract(1, 'days')
        .startOf('day')
        .format('YYYY-MM-DD HH:mm:ss');

    const endOfYesterday = moment()
        .tz(timezone)
        .subtract(1, 'days')
        .endOf('day')
        .format('YYYY-MM-DD HH:mm:ss');

    return { startOfYesterday, endOfYesterday };
}
