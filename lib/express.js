'use strict';

/**
 * Module dependencies.
 */

// 所有的, 关于 Body 如何处理的中间件, 都在这里. 
var BodyParser = require('body-parser')
var EventEmitter = require('events').EventEmitter;
var mixin = require('./3rd/merge-descriptors')
var AppProto = require('./application');
var Route = require('./router/route');
var Router = require('./router');
var Req = require('./request');
var Res = require('./response');

/**
 * Expose `createApplication()`.
 */

// 最终 express 输出的, 是一个生成器函数. 
// 但其实这是一个对象, 因为它上面挂载了很多的属性. 我觉得专门有一个属性代替 createApplication, 让 exports 更多的像是一个 hash 对象可能会更加明确一些. 
exports = module.exports = createApplication;

/**
 * Create an express application.
 *
 * @return {Function}
 * @api public
 */

/*
createApplication 是一个方法, 在 JS 里面, 方法又是一个对象. 
这里是将 createApplication 当做盒子来使用了. 
createApplication 调用返回 app 对象. 上面挂钩了各种属性和方法. 

在返回的 app 对象上, 如果想要使用 框架的一些数据, 直接从 createApplication 对象进行读取. 
这就是 createApplication 后续各种赋值的意义所在. 
*/
function createApplication() {
  // 从这里看, 这个 app 其实不应该当做函数来看待, 他更多的是一个可调用对象的概念.
  // 最终交付给外界使用的时候, 外界还是使用 use 等函数来触发里面的功能, 这已经不是函数的使用方式了.
  // 猜测是, 想要外界自动触发 app 本身所代表的方法才这么设计的. 
  var app = function (req, res, next) {
    app.handle(req, res, next);
  };

  // 通过这种方式, 完成了类似于 Protocol, Module 的效果. 
  // 将操作定义在另外的模块之中. 
  mixin(app, EventEmitter.prototype, false);
  mixin(app, AppProto, false);

  // expose the prototype that will get set on requests
  // 在 JS 里面, 不用担心循环引用的问题. 
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

  app.init();
  return app;
}

/**
 * Expose the prototypes.
 */

exports.application = AppProto;
exports.request = Req;
exports.response = Res;

/**
 * Expose constructors.
 */

exports.Route = Route;
exports.Router = Router;

/**
 * Expose middleware
 */

exports.json = BodyParser.json
exports.query = require('./middleware/query');
exports.raw = BodyParser.raw
exports.static = require('serve-static');
exports.text = BodyParser.text
exports.urlencoded = BodyParser.urlencoded

/**
 * Replace removed middleware with an appropriate error message.
 */

var removedMiddlewares = [
  'bodyParser',
  'compress',
  'cookieSession',
  'session',
  'logger',
  'cookieParser',
  'favicon',
  'responseTime',
  'errorHandler',
  'timeout',
  'methodOverride',
  'vhost',
  'csrf',
  'directory',
  'limit',
  'multipart',
  'staticCache'
]

/*
var express = require('../..');
var app = module.exports = express();
app.use(express.urlencoded({ extended: false }))

这是使用  express.urlencoded 中间件的方式. 
从这里来看, express 本身其实是定义了一些中间件的, 但是慢慢地都移除了. 
现在需要单独下载对应的包进行添加了. 

对于这种已经删除的, 如果想要直接使用, 需要提示使用者, 所以主动进行了 throw.
*/

removedMiddlewares.forEach(function (name) {
  Object.defineProperty(exports, name, {
    get: function () {
      throw new Error('Most middleware (like ' + name + ') is no longer bundled with Express and must be installed separately. Please see https://github.com/senchalabs/connect#middleware.');
    },
    configurable: true
  });
});
