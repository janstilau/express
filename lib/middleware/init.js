'use strict';

/**
 * Module dependencies.
 * @private
 */

var setPrototypeOf = require('setprototypeof')

/**
 * Initialization middleware, exposing the
 * request and response to each other, as well
 * as defaulting the X-Powered-By header field.
 *
 * @param {Function} app
 * @return {Function}
 * @api private
 */

// 这是一个中间件.
/*
x-powered-by 这个值用来表明服务器的运行环境. 基本就是一个提示作用. 

May be set by hosting environments or other frameworks and contains information about them while not providing any usefulness to the application or its visitors. Unset this header to avoid exposing potential vulnerabilities.
*/
exports.init = function (app) {
  return function expressInit(req, res, next) {

    if (app.enabled('x-powered-by')) res.setHeader('X-Powered-By', 'Express');

    req.res = res;
    res.req = req;
    req.next = next;

    // 最主要的是在这里, 给 http 的 req, res 增加了 protoType. 
    /*
app.request = Object.create(Req, {
    app: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: app
    }
  })

  // expose the prototype that will get set on responses
app.response = Object.create(Res, {
    app: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: app
    }
  })
    */
   // app.request 是以 Http 的 Request 为原型的, 所以这里其实是安插了一个业务原型进来. 
   // 这必须是一个中间件. 因为没有办法修改 Http 生成 req 的策略. 
   // 所以在每个请求到来之后, 手动进行原型链条的修改. 
    setPrototypeOf(req, app.request)
    setPrototypeOf(res, app.response)

    res.locals = res.locals || Object.create(null);

    next();
  };
};
