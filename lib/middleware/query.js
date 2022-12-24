'use strict';

/**
 * Module dependencies.
 */

var merge = require('utils-merge')
var parseUrl = require('parseurl');
var qs = require('qs');

module.exports = function query(options) {
  var opts = merge({}, options)
  var queryparse = qs.parse;

  if (typeof options === 'function') {
    queryparse = options;
    opts = undefined;
  }

  if (opts !== undefined && opts.allowPrototypes === undefined) {
    // back-compat for qs module
    opts.allowPrototypes = true;
  }

  // 这个中间件就是, 将 req 的 query 提取出来. 
  return function query(req, res, next){
    if (!req.query) {
      var val = parseUrl(req).query;
      req.query = queryparse(val, opts);
    }

    next();
  };
};
