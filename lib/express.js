/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

/*
mixin 的实现
function merge(dest, src, redefine) {
  if (!dest) {
    throw new TypeError('argument dest is required')
  }

  if (!src) {
    throw new TypeError('argument src is required')
  }

  // 默认是 true. JS 参数可变形的代价
  if (redefine === undefined) {
    // Default to true
    redefine = true
  }

  // getOwnPropertyNames
  // The Object.getOwnPropertyNames() method returns an array of all properties (including non-enumerable properties except for those which use Symbol) found directly in a given object.
  // 从描述上来看, 不包括父类的, 就是这个对象的成员变量的值

  Object.getOwnPropertyNames(src).forEach(function forEachOwnPropertyName(name) {

    // hasOwnProperty 用来判断, dest 上是否有对应的属性
    // The hasOwnProperty() method returns a boolean indicating whether the object has the specified property as its own property (as opposed to inheriting it).
    // 如果 dest 有这个属性了, 并且不覆盖, 那么就跳过

    if (!redefine && hasOwnProperty.call(dest, name)) {
      // Skip desriptor
      return
    }

    // Copy descriptor
    // 使用 defineProperty 这种方式, 对 dest 进行了 copy 操作. 
    var descriptor = Object.getOwnPropertyDescriptor(src, name)
    Object.defineProperty(dest, name, descriptor)
  })

  return dest
}
*/

// 所有的, 关于 Body 如何处理的中间件, 都在这里. 
var BodyParser = require('body-parser')
var EventEmitter = require('events').EventEmitter;
var mixin = require('merge-descriptors');
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

// 最最重要的生成器函数
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
  // 使用 Req 作为原型创建的对象. 可以看做是 Req 的对象.
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
