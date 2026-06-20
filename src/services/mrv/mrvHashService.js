'use strict';
const crypto = require('crypto');

function sortObjectKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

function canonicalSerialize(obj) {
  const canonical = JSON.stringify(sortObjectKeys(obj));
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { canonical, hash };
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashString(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

module.exports = { canonicalSerialize, hashBuffer, hashString, sortObjectKeys };
