
'use strict';

// 为了使用方便, 在 Module 内部可以将方法单独提取出来.
// 要记住, 在 JS 里面, 方法就是特殊的变量而已.  
var pathRegexp = require('../3rd/path-to-regexp')
var hasOwnProperty = Object.prototype.hasOwnProperty;

// 这个文件暴露出去的, 是一个类型. 
// express 应该是一个比较老的库, 里面的写法都是 ES5 的写法. 
module.exports = Layer;

function Layer(path, options, fn) {
  // 通过这种方式, 确保该函数必须是以构造方法的形式存在. 
  // 这是一个通用的写法. 
  // JS 不用管理线程.
  if (!(this instanceof Layer)) {
    return (path, options, fn);
  }

  var opts = options || {};

  // fn, handle 是通用的缩写.
  // opts 是通用的缩写. 
  // path 是通用的缩写.
  // regexp 是通用的缩写. 
  this.handle = fn;
  this.name = fn.name || '<anonymous>';
  this.params = undefined;
  this.path = undefined;
  // 具体的逻辑不去看. 
  this.regexp = pathRegexp(path, this.keys = [], opts);

  // set fast path flags
  this.regexp.fast_star = path === '*'
  this.regexp.fast_slash = path === '/' && opts.end === false
}

/**
 * Handle the error for the layer.
 */
Layer.prototype.handle_error = function handle_error(error, req, res, next) {
  var fn = this.handle;

  // 如果, 不是错误处理函数, 直接就不做处理了, 交给下一个. 
  if (fn.length !== 4) {
    // not a standard error handler
    // 如果当前的 Layer 不是一个错误处理 Layer, 直接走下一个. 
    // 这里, error 必须要透传过去, 不然这个 error 的信息就丢失了. 
    return next(error);
  }

  // 和 Promise 一样, 在真正调用中间件函数进行处理的时候, 需要增加 try 关键字. 
  // 将所有的
  try {
    fn(error, req, res, next);
  } catch (err) {
    next(err);
  }
};

Layer.prototype.handle_request = function handle(req, res, next) {
  var fn = this.handle;

  // 如果不是一般的处理函数, 直接就不出了, 直接就下一个. 
  if (fn.length > 3) {
    // funcation 的 length 代表着这个函数定义的时候填入的想要得到的参数数量. 
    // not a standard request handler
    // 如果当前的 layer 是错误处理函数, 直接走下一个. 
    // 能够到这里, 必然是没有发生错误, 所以不用传递 error.
    return next();
  }

  // Layer 真正调用中间件的处理函数的时候, 都是加了 try 的了. 
  // 这样可以将错误进行捕获, 调用 next 将错误进行传递. 
  try {
    // 触发了中间件. 
    fn(req, res, next);
  } catch (err) {
    next(err);
  }
};


/**
 * Check if this route matches `path`, if so
 * populate `.params`.
 */
Layer.prototype.match = function match(path) {
  var match
  // 在 Match 的时候, 进行了 params 的赋值. 
  // 在 Match 的时候, 进行了 path 的赋值. 
  if (path != null) {
    // fast path non-ending match for / (any path matches)
    if (this.regexp.fast_slash) {
      this.params = {}
      this.path = ''
      return true
    }

    // fast path for * (everything matched in a param)
    if (this.regexp.fast_star) {
      this.params = { '0': decode_param(path) }
      this.path = path
      return true
    }

    // match the path
    match = this.regexp.exec(path)
  }

  if (!match) {
    // 如果不 match, params, path 还是要 重置. 
    this.params = undefined;
    this.path = undefined;
    return false;
  }

  // store values
  this.params = {};
  this.path = match[0]

  var keys = this.keys;
  var params = this.params;

  for (var i = 1; i < match.length; i++) {
    var key = keys[i - 1];
    var prop = key.name;
    var val = decode_param(match[i])

    if (val !== undefined || !(hasOwnProperty.call(params, prop))) {
      params[prop] = val;
    }
  }

  return true;
};

/**
 * Decode param value.
 *
 * @param {string} val
 * @return {string}
 * @private
 */

function decode_param(val) {
  if (typeof val !== 'string' || val.length === 0) {
    return val;
  }

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      err.message = 'Failed to decode param \'' + val + '\'';
      err.status = err.statusCode = 400;
    }

    throw err;
  }
}
