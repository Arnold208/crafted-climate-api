function plural(value, unit) {
    return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function formatDuration(minutes) {
    const roundedMinutes = Math.max(0, Math.round(Number(minutes) || 0));
    if (roundedMinutes < 60) {
        return plural(roundedMinutes, 'minute');
    }

    const totalHours = Math.round(roundedMinutes / 60);
    if (totalHours < 24) {
        return plural(totalHours, 'hour');
    }

    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (hours === 0) {
        return plural(days, 'day');
    }
    return `${plural(days, 'day')} ${plural(hours, 'hour')}`;
}

module.exports = { formatDuration };
