"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeatureFlag = exports.FEATURE_FLAGS = void 0;
exports.FEATURE_FLAGS = {};
const getFeatureFlag = (flagId) => exports.FEATURE_FLAGS[flagId];
exports.getFeatureFlag = getFeatureFlag;
