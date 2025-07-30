const getCurrentUTCTimestamp = () => {
    return Math.floor(Date.now() / 1000);
  };
  
  const adjustTimestampToServerTime = (timestamp) => {
    const currentTimestamp = getCurrentUTCTimestamp();
    const fiveMinutesInSeconds = 5 * 60;
  
    if (Math.abs(currentTimestamp - timestamp) > fiveMinutesInSeconds) {
      return currentTimestamp;
    }
  
    return 0;
  };
  
  module.exports = {
    getCurrentUTCTimestamp,
    adjustTimestampToServerTime,
  };
  